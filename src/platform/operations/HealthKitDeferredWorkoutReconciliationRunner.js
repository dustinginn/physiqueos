import { createHash } from "node:crypto";
import {
  HealthKitObservationType,
  HealthKitReconciliationState,
  HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID,
  assessHealthKitWorkoutCanonicalization,
  resolveHealthKitWorkoutActivationPolicy,
} from "../../domain/services/HealthKitObservationService.js";
import {
  HEALTHKIT_CANONICAL_WORKOUT_COLLECTION,
  HealthKitWorkoutFamily,
  classifyHealthKitWorkoutType,
  deriveHealthKitWorkoutLocalDate,
  getHealthKitCanonicalWorkoutRecordId,
  reconcileHealthKitCanonicalWorkout,
} from "../../domain/services/HealthKitWorkoutService.js";
import {
  HEALTHKIT_WORKOUT_LINK_COLLECTION,
  assessHealthKitCardioCoexistence,
  findPossibleDuplicateCanonicalWorkouts,
} from "../../domain/services/HealthKitWorkoutLinkService.js";
import { HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION } from "../../domain/services/HealthKitWorkoutRelationshipService.js";
import {
  HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION,
  HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
} from "../../domain/services/HealthKitGraduation.js";
import { WORKOUT_FAMILY_OUT_OF_SCOPE_REASON } from "../../application/commands/CanonicalPersistenceCommandPorts.js";

export const HEALTHKIT_DEFERRED_WORKOUT_RECONCILIATION_AUDIT_RECORD_PREFIX = "healthkit_deferred_workout_reconciliation_audit_";
export const HEALTHKIT_DEFERRED_WORKOUT_RECONCILIATION_AUDIT_KIND = "healthkit_deferred_workout_reconciliation_audit";
const CONFIGURATION_COLLECTION = "healthKitConfiguration";
const OBSERVATION_COLLECTION = "healthKitObservations";
const EVIDENCE_COLLECTION = "canonicalEvidenceObjects";

/**
 * Reconciles exactly ONE already-stored HealthKit workout observation that
 * ingestion deferred solely because its family was outside the Workout
 * activation policy's family scope (reconciliation.reason ===
 * family_not_in_activation_scope), against the CURRENT policy.
 *
 * This is the only path that ever reconsiders such an observation.
 * CanonicalPersistenceCommandPorts.ingestHealthKitObservations clones a
 * deferred observation's reconciliation forward untouched on every replay
 * (see the comment above its WORKOUT_TERMINAL_STATES / reason check) — a
 * later policy widening never triggers a backfill by itself.
 *
 * V1 scope, deliberately narrow:
 *   - exactly one authorized `observationId` per call. There is no date
 *     range, no "all deferred observations for date X" mode, and no bulk
 *     list: the parameter shape itself has no field that could express one.
 *   - CARDIO family only. Strength's relationship pipeline (link candidates,
 *     founder reconciliation review, deterministic auto-confirm) is not
 *     reproduced here; any other family is refused outright, never partially
 *     handled.
 *   - reuses assessHealthKitWorkoutCanonicalization and
 *     reconcileHealthKitCanonicalWorkout exactly as ingestion does. No
 *     telemetry is recomputed and no source identity changes.
 *   - the only side effect beyond the canonical workout write and the
 *     observation's own reconciliation patch is the same read-only cardio
 *     coexistence assessment ingestion's own relationship pass would produce
 *     (assessHealthKitCardioCoexistence) for a newly canonicalized cardio
 *     workout — never a link, a claim, a Logger session, auto-confirm, or a
 *     strategic eligibility change.
 *
 *   dry-run  reads current state and predicts the exact canonical workout id
 *            and every mutation; writes nothing.
 *   apply    requires the `expected` facts of an immediately preceding dry
 *            run and an authorization reference, refuses (writes nothing) on
 *            any drift, writes the canonical workout, its coexistence patch,
 *            the observation's reconciliation patch, and one audit row, then
 *            verifies bounded invariants before returning (a failed
 *            invariant throws so the caller rolls back).
 *
 * Two distinct no-op outcomes, both explicit and neither an error:
 *   already_canonicalized  the observation is already canonical through some
 *                           other path (it was never actually a
 *                           family-scope-deferred identity, or this
 *                           authorization does not match how it canonicalized).
 *   already_reconciled      this exact authorized request already applied
 *                           successfully through THIS operation; replaying it
 *                           is a safe no-op, not a duplicate canonical workout.
 */
export async function runHealthKitDeferredWorkoutReconciliation({
  records,
  authorization,
  apply = false,
  expected = null,
  now = () => new Date(),
} = {}) {
  const { ownerUserId, observationId, authorizationReference } = authorization ?? {};
  if (!ownerUserId) throw operationError("OWNER_REQUIRED", "An owner is required.");
  // The parameter shape accepts exactly one exact observation identity. Any
  // bulk-list or date-range-shaped field is refused outright, not ignored: a
  // caller reaching for a sweep should get a clear signal, not silent scoping.
  const unsupportedShapeKeys = ["observationIds", "startLocalDate", "endLocalDate", "localDateRange", "localDate", "start", "end", "dateRange"];
  const offeredUnsupportedShape = authorization && typeof authorization === "object" &&
    unsupportedShapeKeys.some((key) => Object.hasOwn(authorization, key));
  if (offeredUnsupportedShape || Array.isArray(observationId)) {
    throw operationError(
      "BULK_OR_RANGE_NOT_SUPPORTED",
      "This operation reconciles exactly one authorized observation identity per call; date ranges and bulk lists are not part of its parameter shape."
    );
  }
  if (typeof observationId !== "string" || !observationId.trim()) {
    throw operationError("OBSERVATION_ID_REQUIRED", "observationId must be the single exact stored HealthKit observation identity to reconcile.");
  }

  const list = (collection) => records.list({ ownerUserId, collection });
  const [observations, workoutPolicyRecord, graduationPolicyRecord, canonicalWorkouts, links, claims, evidence] = await Promise.all([
    list(OBSERVATION_COLLECTION),
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID }),
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: HEALTHKIT_GRADUATION_POLICY_RECORD_ID }),
    list(HEALTHKIT_CANONICAL_WORKOUT_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION),
    list(EVIDENCE_COLLECTION),
  ]);
  const observation = observations.find((record) => record.id === observationId) ?? null;
  const facts = collectFacts({ observation, observations, workoutPolicyRecord, graduationPolicyRecord, canonicalWorkouts, links, claims, evidence });
  const auditRecordId = `${HEALTHKIT_DEFERRED_WORKOUT_RECONCILIATION_AUDIT_RECORD_PREFIX}${digest(authorizationReference ?? "").slice(0, 12)}`;

  if (!observation) return refused("observation_not_found", facts);
  if (observation.observationType !== HealthKitObservationType.WORKOUT) {
    return refused("not_a_workout_observation", facts);
  }

  if (observation.reconciliation?.state === HealthKitReconciliationState.WORKOUT_CANONICALIZED) {
    const existingAudit = String(authorizationReference ?? "").trim()
      ? await records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: auditRecordId })
      : null;
    if (existingAudit?.kind === HEALTHKIT_DEFERRED_WORKOUT_RECONCILIATION_AUDIT_KIND &&
      existingAudit?.authorizationReference === String(authorizationReference) &&
      existingAudit?.observationId === observationId &&
      existingAudit?.canonicalWorkoutId === observation.reconciliation.canonicalId) {
      // The identical authorized request already succeeded through this
      // exact operation. Safe no-op: zero additional writes, not an error,
      // and never a second canonical workout.
      return Object.freeze({
        outcome: "already_reconciled",
        observationId,
        canonicalWorkoutId: observation.reconciliation.canonicalId,
        auditRecordId,
        facts,
      });
    }
    // Already canonical through some other path (never actually a
    // family-scope-deferred identity, or canonicalized by an authorization
    // this audit trail cannot confirm). Refused, but as a clean no-op.
    return Object.freeze({
      outcome: "already_canonicalized",
      observationId,
      canonicalWorkoutId: observation.reconciliation.canonicalId ?? null,
      facts,
    });
  }

  if (observation.reconciliation?.state !== HealthKitReconciliationState.WORKOUT_CANONICALIZATION_DEFERRED ||
    observation.reconciliation?.reason !== WORKOUT_FAMILY_OUT_OF_SCOPE_REASON) {
    return refused("not_a_family_scope_deferred_observation", facts, {
      reconciliationState: observation.reconciliation?.state ?? null,
      reconciliationReason: observation.reconciliation?.reason ?? null,
    });
  }

  const classification = classifyHealthKitWorkoutType(observation.measurement.activityType);
  if (classification.family !== HealthKitWorkoutFamily.CARDIO) {
    return refused("family_not_supported_by_this_runner", facts, { family: classification.family });
  }

  const workoutPolicy = resolveHealthKitWorkoutActivationPolicy(workoutPolicyRecord);
  if (!workoutPolicy.enabled || !workoutPolicy.families.includes(classification.family)) {
    return refused("family_still_not_in_activation_scope", facts, { family: classification.family });
  }

  const effectiveLocalDate = deriveHealthKitWorkoutLocalDate({
    startedAt: observation.occurrence.startedAt,
    timeZone: observation.occurrence.timeZone,
  }) ?? observation.occurrence.localDate;

  // The exact same eligibility assessment ingestion runs at first delivery,
  // reused unmodified against the CURRENT policy record.
  const assessment = assessHealthKitWorkoutCanonicalization({
    observation, effectiveLocalDate, family: classification.family, activationPolicy: workoutPolicyRecord,
  });
  if (!assessment.eligible) {
    return refused(assessment.reason ?? "not_eligible_under_current_policy", facts, {
      assessment: { reason: assessment.reason, permanent: assessment.permanent === true },
    });
  }

  const workoutRecordId = getHealthKitCanonicalWorkoutRecordId(observation);
  const existingWorkout = canonicalWorkouts.find((item) => item.id === workoutRecordId) ?? null;
  if (existingWorkout) {
    // The record id is a pure hash of bundleIdentifier + externalId. A
    // pre-existing row here means this identity already canonicalized
    // through some other path; this runner only ever performs a
    // genuinely-first canonicalization of a deferred observation.
    return refused("canonical_workout_record_already_exists", facts, { canonicalWorkoutId: workoutRecordId });
  }

  const workoutActivationSnapshot = {
    policyRecordId: HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID,
    policyVersion: workoutPolicyRecord.version ?? null,
    effectiveLocalDate: workoutPolicy.effectiveLocalDate,
    endLocalDate: workoutPolicy.endLocalDate,
    openEnded: workoutPolicy.openEnded === true,
    families: [...workoutPolicy.families],
    linkAutoConfirm: workoutPolicy.linkAutoConfirm === true,
  };
  // The exact same canonical-workout construction ingestion uses on first
  // canonicalization. `existing: null` because we already refused above if a
  // record at this id already exists; this call can only ever decide "create".
  const decision = reconcileHealthKitCanonicalWorkout({
    observation, existing: null, ownerUserId, now: now(), activation: workoutActivationSnapshot,
  });
  if (decision.action !== "create") {
    throw operationError("UNEXPECTED_CANONICALIZATION_DECISION", "Expected a genuinely-first canonical workout creation.", { action: decision.action });
  }
  const canonicalWorkout = decision.record;

  // The read-only cardio coexistence pass ingestion's own relationship
  // reassessment would run for a newly canonicalized cardio workout. It never
  // creates a link, a claim, or touches the Logger; it only records how this
  // workout relates to any pre-existing Evidence workout for the same day.
  const duplicates = findPossibleDuplicateCanonicalWorkouts(canonicalWorkout, [...canonicalWorkouts, canonicalWorkout]);
  const coexistence = assessHealthKitCardioCoexistence({ canonicalWorkout, canonicalObjects: evidence });
  const coexistencePatch = {
    state: coexistence.state,
    unverifiableCount: coexistence.unverifiableCount,
    candidates: coexistence.candidates.map((item) => ({ canonicalId: item.canonicalId, outcome: item.outcome, confidence: item.confidence })),
    ...(duplicates.length > 0 ? { possibleDuplicateOf: [...duplicates] } : {}),
  };

  // The same reconciliation shape ingestion writes on first canonicalization
  // (CanonicalPersistenceCommandPorts.ingestHealthKitObservations, the
  // WORKOUT_CANONICALIZATION_PENDING -> WORKOUT_CANONICALIZED branch): nothing
  // downstream can tell this apart from a workout that canonicalized normally.
  const reconciliationPatch = {
    state: HealthKitReconciliationState.WORKOUT_CANONICALIZED,
    canonicalStore: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION,
    canonicalId: workoutRecordId,
    canonicalRevision: canonicalWorkout.revision,
    canonicalAction: "create",
    workoutFamily: canonicalWorkout.current.family,
    evidenceEligibility: canonicalWorkout.evidenceEligibility.state,
    activityInteraction: "descriptive_never_additive",
  };

  const resultSummary = {
    observationId,
    canonicalWorkoutId: workoutRecordId,
    localDate: canonicalWorkout.localDate,
    canonicalType: canonicalWorkout.current.canonicalType,
    workoutFamily: canonicalWorkout.current.family,
    coexistenceState: coexistence.state,
    auditRecordId,
    predictedMutations: [
      { collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION, recordId: workoutRecordId, operation: "create" },
      { collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION, recordId: workoutRecordId, operation: "update_coexistence" },
      { collection: OBSERVATION_COLLECTION, recordId: observationId, operation: "update_reconciliation" },
      { collection: CONFIGURATION_COLLECTION, recordId: auditRecordId, operation: "create" },
    ],
    unchangedByDesign: {
      healthKitWorkoutLinks: "none created",
      healthKitWorkoutLinkClaims: "none created",
      trainingLoggerSession: "none created",
      autoConfirm: "off",
      strategicEvidenceEligibility: "quarantined",
      otherCanonicalWorkouts: facts.canonicalWorkoutCount,
      otherObservations: facts.observationCount - 1,
      workoutPolicy: "read-only drift fence",
      graduationPolicy: "read-only drift fence",
    },
    facts,
  };
  if (!apply) return Object.freeze({ outcome: "dry_run", ...resultSummary });

  const drift = compareFacts(expected, facts);
  if (drift.length > 0) return Object.freeze({ outcome: "drifted", drift, facts });
  if (!String(authorizationReference ?? "").trim()) {
    throw operationError("AUTHORIZATION_REFERENCE_REQUIRED", "Apply requires an authorization reference.");
  }

  const at = now().toISOString();
  const audit = await records.putIfAbsent({
    ownerUserId,
    collection: CONFIGURATION_COLLECTION,
    recordId: auditRecordId,
    sourceIdentity: auditRecordId,
    payload: {
      id: auditRecordId,
      kind: HEALTHKIT_DEFERRED_WORKOUT_RECONCILIATION_AUDIT_KIND,
      at,
      authorizationReference: String(authorizationReference),
      observationId,
      canonicalWorkoutId: workoutRecordId,
      workoutFamily: canonicalWorkout.current.family,
      coexistenceState: coexistence.state,
      strategicEvidenceEligibility: "quarantined",
    },
  });
  if (!audit.created) {
    throw operationError("AUDIT_ROW_EXISTS", "This authorization reference was already used for this reconciliation.");
  }

  const created = await records.putIfAbsent({
    ownerUserId,
    collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION,
    recordId: workoutRecordId,
    sourceIdentity: workoutRecordId,
    payload: canonicalWorkout,
  });
  if (!created.created) {
    throw operationError("CANONICAL_WORKOUT_ALREADY_EXISTS", "The predicted canonical workout already exists.");
  }
  // A second, separate write for the coexistence patch, matching exactly how
  // ingestion's own relationship reassessment applies it (create, then patch).
  await records.put({
    ownerUserId,
    collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION,
    recordId: workoutRecordId,
    expectedVersion: created.record.version,
    sourceIdentity: workoutRecordId,
    payload: { ...created.record, coexistence: coexistencePatch, updatedAt: at },
  });
  const updatedObservation = await records.put({
    ownerUserId,
    collection: OBSERVATION_COLLECTION,
    recordId: observationId,
    expectedVersion: observation.version,
    sourceIdentity: observationId,
    payload: { ...observation, reconciliation: reconciliationPatch },
  });

  const [afterObservations, afterWorkoutPolicy, afterGraduationPolicy, afterWorkouts, afterLinks, afterClaims, afterEvidence] = await Promise.all([
    list(OBSERVATION_COLLECTION),
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID }),
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: HEALTHKIT_GRADUATION_POLICY_RECORD_ID }),
    list(HEALTHKIT_CANONICAL_WORKOUT_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION),
    list(EVIDENCE_COLLECTION),
  ]);
  const afterTargetObservation = afterObservations.find((item) => item.id === observationId);
  const afterTargetWorkout = afterWorkouts.find((item) => item.id === workoutRecordId);
  const invariants = {
    exactlyOneCanonicalWorkoutCreated: afterWorkouts.length === facts.canonicalWorkoutCount + 1 && Boolean(afterTargetWorkout),
    canonicalWorkoutTelemetryMatchesObservation: stable(afterTargetWorkout?.current) === stable(canonicalWorkout.current),
    coexistencePatchAppliedExactly: stable(afterTargetWorkout?.coexistence ?? null) === stable(coexistencePatch),
    contentAuthorityPreserved: afterTargetWorkout?.contentAuthority?.telemetry === "healthkit" &&
      afterTargetWorkout?.contentAuthority?.trainingContent === "workout_logger",
    workoutQuarantined: afterTargetWorkout?.evidenceEligibility?.state === "quarantined" && afterTargetWorkout?.evidenceEligibility?.strategic === false,
    observationReconciliationCanonicalized: afterTargetObservation?.reconciliation?.state === HealthKitReconciliationState.WORKOUT_CANONICALIZED &&
      afterTargetObservation?.reconciliation?.canonicalId === workoutRecordId &&
      stable(afterTargetObservation?.reconciliation) === stable(reconciliationPatch),
    observationOtherFieldsUnchanged: stable(sansReconciliation(afterTargetObservation)) === stable(sansReconciliation(observation)),
    otherObservationsUnchanged: listDigest(afterObservations.filter((item) => item.id !== observationId)) ===
      listDigest(observations.filter((item) => item.id !== observationId)),
    otherCanonicalWorkoutsUnchanged: listDigest(afterWorkouts.filter((item) => item.id !== workoutRecordId)) === listDigest(canonicalWorkouts),
    noWorkoutLinkCreated: afterLinks.length === facts.linkCount && listDigest(afterLinks) === facts.linksDigest,
    noClaimCreated: afterClaims.length === facts.claimCount && listDigest(afterClaims) === facts.claimsDigest,
    evidenceUnchanged: afterEvidence.length === facts.evidenceCount && listDigest(afterEvidence) === facts.evidenceDigest,
    workoutPolicyUntouched: (afterWorkoutPolicy ? digest(stable(afterWorkoutPolicy)) : null) === facts.workoutPolicyDigest,
    graduationPolicyUntouched: (afterGraduationPolicy ? digest(stable(afterGraduationPolicy)) : null) === facts.graduationPolicyDigest,
    auditRowPresent: audit.record?.id === auditRecordId,
  };
  if (Object.values(invariants).some((value) => value !== true)) {
    throw operationError("POST_WRITE_INVARIANT_FAILED", "Post-write invariants failed.", { invariants });
  }
  return Object.freeze({ outcome: "applied", ...resultSummary, invariants, observation: updatedObservation });
}

function refused(reason, facts, detail = {}) {
  return Object.freeze({ outcome: "refused", reasons: [reason], ...detail, facts });
}

function operationError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

function sansReconciliation(record) {
  if (!record) return null;
  const { reconciliation: _reconciliation, version: _version, ...rest } = record;
  return rest;
}

function collectFacts({ observation, observations, workoutPolicyRecord, graduationPolicyRecord, canonicalWorkouts, links, claims, evidence }) {
  return {
    observationFound: Boolean(observation),
    observationVersion: observation?.version ?? null,
    observationDigest: observation ? digest(stable(observation)) : null,
    observationCount: observations.length,
    observationsDigest: listDigest(observations),
    workoutPolicyVersion: workoutPolicyRecord?.version ?? null,
    workoutPolicyDigest: workoutPolicyRecord ? digest(stable(workoutPolicyRecord)) : null,
    graduationPolicyDigest: graduationPolicyRecord ? digest(stable(graduationPolicyRecord)) : null,
    canonicalWorkoutCount: canonicalWorkouts.length,
    canonicalWorkoutsDigest: listDigest(canonicalWorkouts),
    linkCount: links.length,
    linksDigest: listDigest(links),
    claimCount: claims.length,
    claimsDigest: listDigest(claims),
    evidenceCount: evidence.length,
    evidenceDigest: listDigest(evidence),
  };
}

function compareFacts(expected, actual) {
  if (!expected || typeof expected !== "object") return ["expected facts are required for apply"];
  return Object.keys(actual).filter((key) => JSON.stringify(expected[key] ?? null) !== JSON.stringify(actual[key] ?? null));
}

function listDigest(list) {
  return digest(list.map((record) => `${record.id ?? record.canonicalId}:${record.version ?? 1}:${digest(stable(record))}`).sort().join(","));
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 32);
}

export { HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION };
