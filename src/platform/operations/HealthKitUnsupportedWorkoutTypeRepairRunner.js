import { createHash } from "node:crypto";
import {
  HealthKitIngestionPurpose,
  HealthKitObservationType,
  HealthKitReconciliationState,
  HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID,
  assessHealthKitWorkoutCanonicalization,
  resolveHealthKitWorkoutActivationPolicy,
} from "../../domain/services/HealthKitObservationService.js";
import {
  HEALTHKIT_CANONICAL_WORKOUT_COLLECTION,
  HealthKitWorkoutFamily,
  assessHealthKitWorkoutStrategicEligibility,
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
  HEALTHKIT_CANONICAL_DAY_COLLECTION,
  HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
  HealthKitGraduationPurpose,
  overlayGraduatedHealthKitCardioWorkouts,
  resolveHealthKitGraduationPolicy,
} from "../../domain/services/HealthKitGraduation.js";
import { WORKOUT_UNSUPPORTED_TYPE_REASON } from "../../application/commands/CanonicalPersistenceCommandPorts.js";

// Bounded, one-time repair of EXACTLY the two Founder Apple Watch workouts
// uploaded 2026-10-02 (Stair Stepper, HKWorkoutActivityType 44, and Cooldown,
// 80) that ingestion stored as `source_only / unsupported_workout_type`
// because the classifier did not support those types yet. Ingestion only
// canonicalizes a first delivery, so a deployed classifier change never
// reconsiders them on its own; this is the only path that does.
//
// The scope is fixed in code, not in parameters: owner user_founder_001,
// workout observations in state source_only / unsupported_workout_type, raw
// activity type 44 or 80, local date 2026-10-02 (both the workout's own start
// in its own time zone and the stored client date). The selection must be
// exactly one Stair Stepper and one Cooldown or the operation refuses
// (fails closed) and writes nothing.
//
//   dry-run  (default) reads current state and prints the exact canonical
//            records, coexistence patches and observation reconciliation
//            patches it WOULD write, plus each record's strategic effect;
//            writes nothing.
//   apply    requires both observation ids named explicitly (exactly the
//            selected pair), the expected deployed SHA (equal to the runtime
//            SHA), an authorization reference, and the facts of an
//            immediately preceding dry run (any drift refuses). It writes
//            only: the two canonical workouts (create + coexistence patch, the
//            same two-step shape ingestion's relationship pass produces), the
//            two observations' own reconciliation, and one fixed audit row.
//            Every write goes through a store that refuses any other
//            collection/record, and bounded post-write invariants (including
//            Activity days, Evidence, links, claims, policies and the
//            strategic artifact rows' storage metadata) must hold or it throws
//            so the caller rolls back.
//   replay   after a successful apply, any re-run is the explicit no-op
//            `already_repaired` (fixed audit identity), never a second write.
//
// It never creates a link, a claim, a Logger session, an Evidence object, a
// briefing, or a Confidence artifact; never changes a policy; never touches
// Activity totals (canonical days, activity_day Evidence); and never changes
// a canonical workout's quarantined `evidenceEligibility`.

export const HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_OWNER = "user_founder_001";
export const HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_LOCAL_DATE = "2026-10-02";
export const HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_AUDIT_RECORD_ID = "healthkit_unsupported_workout_type_repair_2026_10_02";
export const HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_AUDIT_KIND = "healthkit_unsupported_workout_type_repair_audit";
// Raw HKWorkoutActivityType -> what the DEPLOYED classifier must produce.
export const HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_TYPES = Object.freeze({
  44: Object.freeze({ label: "Stair Stepper", family: HealthKitWorkoutFamily.CARDIO, canonicalType: "stair_climbing" }),
  80: Object.freeze({ label: "Cooldown", family: HealthKitWorkoutFamily.CARDIO, canonicalType: "cooldown" }),
});

const CONFIGURATION_COLLECTION = "healthKitConfiguration";
const OBSERVATION_COLLECTION = "healthKitObservations";
const EVIDENCE_COLLECTION = "canonicalEvidenceObjects";
// Strategic artifacts are fenced by storage metadata (record id + timestamps),
// never by loading their payloads: a briefing collection is large and this
// operation only needs to prove it changed nothing there.
const STRATEGIC_ARTIFACT_COLLECTIONS = Object.freeze([
  "dailyBriefings", "briefingReconciliationWorkItems", "analyses", "goalConfidenceSnapshots", "goalConfidenceHistory",
]);
const SHA = /^[0-9a-f]{40}$/;
const SCOPE_WIDENING_KEYS = Object.freeze([
  "observationId", "startLocalDate", "endLocalDate", "localDate", "localDateRange", "dateRange", "start", "end",
  "activityType", "activityTypes", "ownerUserIds", "allDates",
]);

export async function runHealthKitUnsupportedWorkoutTypeRepair({
  records,
  authorization = {},
  deployment = {},
  apply = false,
  expected = null,
  now = () => new Date(),
} = {}) {
  const { ownerUserId, observationIds = null, authorizationReference = "" } = authorization ?? {};
  if (ownerUserId !== HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_OWNER) {
    throw operationError("OWNER_MISMATCH", "This repair is bounded to the Founder owner only.");
  }
  if (SCOPE_WIDENING_KEYS.some((key) => Object.hasOwn(authorization, key))) {
    throw operationError(
      "SCOPE_PARAMETERS_NOT_SUPPORTED",
      "The repair scope (owner, date, types, state) is fixed in code; only the two exact observation ids may be named."
    );
  }
  if (observationIds !== null && (!Array.isArray(observationIds) || observationIds.length !== 2 ||
    observationIds.some((id) => typeof id !== "string" || !id.trim()) || new Set(observationIds).size !== 2)) {
    throw operationError("OBSERVATION_IDS_INVALID", "observationIds must name exactly two distinct observation ids.");
  }
  const expectedSha = String(deployment?.expectedSha ?? "");
  const runtimeSha = String(deployment?.runtimeSha ?? "");
  if (apply) {
    if (observationIds === null) throw operationError("OBSERVATION_IDS_REQUIRED", "Apply requires both observation ids named explicitly.");
    if (!SHA.test(expectedSha)) throw operationError("EXPECTED_DEPLOYED_SHA_REQUIRED", "Apply requires the expected deployed 40-hex SHA.");
    if (runtimeSha !== expectedSha) throw operationError("RUNTIME_SHA_MISMATCH", "The runtime SHA is not the expected deployed SHA.");
    if (!String(authorizationReference ?? "").trim()) {
      throw operationError("AUTHORIZATION_REFERENCE_REQUIRED", "Apply requires an authorization reference.");
    }
  } else if (expectedSha && runtimeSha && expectedSha !== runtimeSha) {
    throw operationError("RUNTIME_SHA_MISMATCH", "The runtime SHA is not the expected deployed SHA.");
  }

  const owner = HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_OWNER;
  const state = await readState(records, owner);
  const facts = collectFacts(state);
  const deploymentSummary = { expectedSha: expectedSha || null, runtimeSha: runtimeSha || null };

  // Idempotent replay: the fixed audit identity proves this exact repair
  // already applied. Re-running is a zero-write no-op, never a second repair.
  if (state.audit) {
    const consistent = state.audit.kind === HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_AUDIT_KIND &&
      Array.isArray(state.audit.targets) && state.audit.targets.length === 2 &&
      state.audit.targets.every((target) => {
        const observation = state.observations.find((item) => item.id === target.observationId);
        return observation?.reconciliation?.state === HealthKitReconciliationState.WORKOUT_CANONICALIZED &&
          observation.reconciliation.canonicalId === target.canonicalWorkoutId &&
          state.canonicalWorkouts.some((workout) => workout.id === target.canonicalWorkoutId);
      });
    if (!consistent) return refused("audit_row_present_state_inconsistent", facts, { auditRecordId: state.audit.id ?? null });
    return Object.freeze({
      outcome: "already_repaired",
      auditRecordId: HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_AUDIT_RECORD_ID,
      targets: state.audit.targets.map((target) => ({ ...target })),
      deployment: deploymentSummary,
      facts,
    });
  }

  const { selected, nearMisses } = selectRepairTargets(state.observations);
  const selection = {
    criteria: {
      ownerUserId: owner,
      observationType: HealthKitObservationType.WORKOUT,
      reconciliationState: HealthKitReconciliationState.SOURCE_ONLY,
      reconciliationReason: WORKOUT_UNSUPPORTED_TYPE_REASON,
      activityTypes: Object.keys(HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_TYPES),
      localDate: HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_LOCAL_DATE,
    },
    selected: selected.map(describeObservation),
    nearMisses: nearMisses.map(describeObservation),
  };
  const types = selected.map((observation) => activityTypeOf(observation)).sort();
  if (selected.length !== 2 || types[0] !== "44" || types[1] !== "80") {
    return refused("selection_not_exactly_one_stair_stepper_and_one_cooldown", facts, { selection });
  }
  const foreign = selected.filter((observation) => observation.userId !== owner ||
    (observation.ingestionPurpose ?? HealthKitIngestionPurpose.OPERATIONAL) !== HealthKitIngestionPurpose.OPERATIONAL);
  if (foreign.length > 0) return refused("selected_observation_owner_or_purpose_mismatch", facts, { selection });
  if (observationIds !== null && [...observationIds].sort().join("\u0000") !== selected.map((item) => item.id).sort().join("\u0000")) {
    return refused("authorized_observation_ids_do_not_match_selection", facts, { selection });
  }

  const workoutPolicy = resolveHealthKitWorkoutActivationPolicy(state.workoutPolicyRecord);
  if (!workoutPolicy.enabled || !workoutPolicy.families.includes(HealthKitWorkoutFamily.CARDIO)) {
    return refused("cardio_not_in_current_workout_activation_scope", facts, { selection });
  }
  const workoutActivationSnapshot = {
    policyRecordId: HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID,
    policyVersion: state.workoutPolicyRecord.version ?? null,
    effectiveLocalDate: workoutPolicy.effectiveLocalDate,
    endLocalDate: workoutPolicy.endLocalDate,
    openEnded: workoutPolicy.openEnded === true,
    families: [...workoutPolicy.families],
    linkAutoConfirm: workoutPolicy.linkAutoConfirm === true,
  };

  const created = [];
  for (const observation of selected.slice().sort((left, right) => activityTypeOf(left).localeCompare(activityTypeOf(right)))) {
    const expectedType = HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_TYPES[activityTypeOf(observation)];
    // The deployed classifier must already canonicalize the type exactly as
    // reviewed; this operation never decides a classification itself.
    const classification = classifyHealthKitWorkoutType(observation.measurement.activityType);
    if (classification.family !== expectedType.family) {
      return refused("deployed_classifier_does_not_canonicalize_type", facts, {
        selection, observationId: observation.id, family: classification.family,
      });
    }
    const effectiveLocalDate = deriveHealthKitWorkoutLocalDate({
      startedAt: observation.occurrence.startedAt,
      timeZone: observation.occurrence.timeZone,
    }) ?? observation.occurrence.localDate;
    // The exact eligibility assessment ingestion runs at first delivery,
    // against the CURRENT Workout policy, unmodified.
    const assessment = assessHealthKitWorkoutCanonicalization({
      observation, effectiveLocalDate, family: classification.family, activationPolicy: state.workoutPolicyRecord,
    });
    if (!assessment.eligible) {
      return refused(assessment.reason ?? "not_eligible_under_current_policy", facts, { selection, observationId: observation.id });
    }
    const canonicalWorkoutId = getHealthKitCanonicalWorkoutRecordId(observation);
    if (state.canonicalWorkouts.some((workout) => workout.id === canonicalWorkoutId) ||
      created.some((item) => item.canonicalWorkoutId === canonicalWorkoutId)) {
      return refused("canonical_workout_record_already_exists", facts, { selection, canonicalWorkoutId });
    }
    // The exact canonical-workout construction ingestion uses on first
    // canonicalization; `existing: null` because the id is proven free above.
    const decision = reconcileHealthKitCanonicalWorkout({
      observation, existing: null, ownerUserId: owner, now: now(), activation: workoutActivationSnapshot,
    });
    if (decision.action !== "create" || decision.record.current.canonicalType !== expectedType.canonicalType) {
      return refused("deployed_classifier_does_not_canonicalize_type", facts, {
        selection, observationId: observation.id, action: decision.action, canonicalType: decision.record.current.canonicalType,
      });
    }
    created.push({ observation, canonicalWorkoutId, record: decision.record, label: expectedType.label });
  }

  // The read-only Cardio coexistence pass ingestion's relationship reassessment
  // writes for a newly canonical Cardio workout (create, then patch).
  const allWorkouts = [...state.canonicalWorkouts, ...created.map((item) => item.record)];
  for (const item of created) {
    const duplicates = findPossibleDuplicateCanonicalWorkouts(item.record, allWorkouts);
    const coexistence = assessHealthKitCardioCoexistence({ canonicalWorkout: item.record, canonicalObjects: state.evidence });
    item.coexistencePatch = {
      state: coexistence.state,
      unverifiableCount: coexistence.unverifiableCount,
      candidates: coexistence.candidates.map((candidate) => ({
        canonicalId: candidate.canonicalId, outcome: candidate.outcome, confidence: candidate.confidence,
      })),
      ...(duplicates.length > 0 ? { possibleDuplicateOf: [...duplicates] } : {}),
    };
    item.finalRecord = { ...item.record, coexistence: item.coexistencePatch };
    // The exact reconciliation ingestion writes on first canonicalization.
    item.reconciliationPatch = {
      state: HealthKitReconciliationState.WORKOUT_CANONICALIZED,
      canonicalStore: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION,
      canonicalId: item.canonicalWorkoutId,
      canonicalRevision: item.record.revision,
      canonicalAction: "create",
      workoutFamily: item.record.current.family,
      evidenceEligibility: item.record.evidenceEligibility.state,
      activityInteraction: "descriptive_never_additive",
    };
    // What this repair would mean strategically, computed with the real
    // graduation overlay against the CURRENT policy (read-only). It never
    // regenerates a stored briefing; it only says whether future strategic
    // reads would include the workout.
    const strategic = assessHealthKitWorkoutStrategicEligibility(item.finalRecord);
    const graduation = overlayGraduatedHealthKitCardioWorkouts({
      canonicalObjects: state.evidence,
      canonicalWorkouts: [item.finalRecord],
      // Resolved exactly as the graduation reader resolves it (fail-closed).
      policy: resolveHealthKitGraduationPolicy(state.graduationPolicyRecord),
      purpose: HealthKitGraduationPurpose.EVIDENCE,
    });
    item.strategicEffect = {
      strategicRole: item.record.current.strategicRole,
      strategicallyEligibleType: strategic.eligible,
      reason: strategic.reason,
      joinsStrategicEvidenceUnderCurrentGraduationPolicy: graduation.applied.length > 0,
      storedBriefingsRegenerated: false,
    };
  }

  const predictedMutations = [
    { collection: CONFIGURATION_COLLECTION, recordId: HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_AUDIT_RECORD_ID, operation: "create_audit" },
    ...created.flatMap((item) => [
      { collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION, recordId: item.canonicalWorkoutId, operation: "create" },
      { collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION, recordId: item.canonicalWorkoutId, operation: "update_coexistence" },
      { collection: OBSERVATION_COLLECTION, recordId: item.observation.id, operation: "update_reconciliation" },
    ]),
  ];
  const resultSummary = {
    auditRecordId: HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_AUDIT_RECORD_ID,
    selection,
    targets: created.map((item) => ({
      observationId: item.observation.id,
      activityType: activityTypeOf(item.observation),
      label: item.label,
      canonicalWorkoutId: item.canonicalWorkoutId,
      localDate: item.record.localDate,
      // createdAt/updatedAt are the run's own clock: an apply stamps its own time.
      canonicalRecord: item.finalRecord,
      observationReconciliationBefore: structuredClone(item.observation.reconciliation),
      observationReconciliationPatch: item.reconciliationPatch,
      strategicEffect: item.strategicEffect,
    })),
    predictedMutations,
    unchangedByDesign: {
      healthKitWorkoutLinks: "none created",
      healthKitWorkoutLinkClaims: "none created",
      trainingLoggerSession: "none created",
      canonicalEvidenceObjects: "unchanged (Activity day Evidence included)",
      healthKitCanonicalDays: "unchanged (Activity totals)",
      strategicArtifacts: [...STRATEGIC_ARTIFACT_COLLECTIONS],
      canonicalWorkoutEvidenceEligibility: "quarantined",
      workoutPolicy: "read-only drift fence",
      graduationPolicy: "read-only drift fence",
      otherObservations: facts.observationCount - created.length,
      otherCanonicalWorkouts: facts.canonicalWorkoutCount,
    },
    deployment: deploymentSummary,
    facts,
  };
  if (!apply) return Object.freeze({ outcome: "dry_run", ...resultSummary });

  const drift = compareFacts(expected, facts);
  if (drift.length > 0) return Object.freeze({ outcome: "drifted", drift, facts });

  const at = now().toISOString();
  const guarded = createRepairScopedRecordStore(records, {
    [CONFIGURATION_COLLECTION]: [HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_AUDIT_RECORD_ID],
    [HEALTHKIT_CANONICAL_WORKOUT_COLLECTION]: created.map((item) => item.canonicalWorkoutId),
    [OBSERVATION_COLLECTION]: created.map((item) => item.observation.id),
  });
  const audit = await guarded.putIfAbsent({
    ownerUserId: owner,
    collection: CONFIGURATION_COLLECTION,
    recordId: HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_AUDIT_RECORD_ID,
    sourceIdentity: HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_AUDIT_RECORD_ID,
    payload: {
      id: HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_AUDIT_RECORD_ID,
      kind: HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_AUDIT_KIND,
      at,
      authorizationReference: String(authorizationReference),
      deployedSha: expectedSha,
      // Not `localDate`: the audit row must never look like dated evidence.
      repairLocalDate: HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_LOCAL_DATE,
      targets: created.map((item) => ({
        observationId: item.observation.id,
        activityType: activityTypeOf(item.observation),
        canonicalWorkoutId: item.canonicalWorkoutId,
        canonicalType: item.record.current.canonicalType,
        strategicRole: item.record.current.strategicRole,
      })),
      strategicEvidenceEligibility: "quarantined",
    },
  });
  if (!audit.created) throw operationError("AUDIT_ROW_EXISTS", "This repair was already applied.");

  const updatedObservations = [];
  for (const item of created) {
    const inserted = await guarded.putIfAbsent({
      ownerUserId: owner,
      collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION,
      recordId: item.canonicalWorkoutId,
      sourceIdentity: item.canonicalWorkoutId,
      payload: item.record,
    });
    if (!inserted.created) throw operationError("CANONICAL_WORKOUT_ALREADY_EXISTS", "A predicted canonical workout already exists.");
    await guarded.put({
      ownerUserId: owner,
      collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION,
      recordId: item.canonicalWorkoutId,
      expectedVersion: inserted.record.version,
      sourceIdentity: item.canonicalWorkoutId,
      payload: { ...inserted.record, coexistence: item.coexistencePatch, updatedAt: at },
    });
    updatedObservations.push(await guarded.put({
      ownerUserId: owner,
      collection: OBSERVATION_COLLECTION,
      recordId: item.observation.id,
      expectedVersion: item.observation.version,
      sourceIdentity: item.observation.id,
      payload: { ...item.observation, reconciliation: item.reconciliationPatch },
    }));
  }

  const after = await readState(records, owner);
  const targetObservationIds = new Set(created.map((item) => item.observation.id));
  const targetWorkoutIds = new Set(created.map((item) => item.canonicalWorkoutId));
  const afterFacts = collectFacts(after);
  const invariants = {
    exactlySevenScopedWrites: guarded.writeCount() === 7,
    exactlyTwoCanonicalWorkoutsCreated: after.canonicalWorkouts.length === facts.canonicalWorkoutCount + 2 &&
      created.every((item) => after.canonicalWorkouts.some((workout) => workout.id === item.canonicalWorkoutId)),
    canonicalWorkoutsMatchPrediction: created.every((item) => {
      const stored = after.canonicalWorkouts.find((workout) => workout.id === item.canonicalWorkoutId);
      return stable(stored?.current) === stable(item.record.current) &&
        stable(stored?.coexistence ?? null) === stable(item.coexistencePatch) &&
        stable(stored?.provenance) === stable(item.record.provenance);
    }),
    canonicalWorkoutsQuarantinedAndNonAdditive: created.every((item) => {
      const stored = after.canonicalWorkouts.find((workout) => workout.id === item.canonicalWorkoutId);
      return stored?.evidenceEligibility?.state === "quarantined" && stored?.evidenceEligibility?.strategic === false &&
        stored?.activityInteraction?.additiveToDailyActivity === false &&
        stored?.contentAuthority?.telemetry === "healthkit" && stored?.contentAuthority?.trainingContent === "workout_logger";
    }),
    observationReconciliationsCanonicalized: created.every((item) => {
      const stored = after.observations.find((observation) => observation.id === item.observation.id);
      return stable(stored?.reconciliation) === stable(item.reconciliationPatch) &&
        stable(sansReconciliation(stored)) === stable(sansReconciliation(item.observation));
    }),
    otherObservationsUnchanged: listDigest(after.observations.filter((item) => !targetObservationIds.has(item.id))) ===
      listDigest(state.observations.filter((item) => !targetObservationIds.has(item.id))),
    otherCanonicalWorkoutsUnchanged: listDigest(after.canonicalWorkouts.filter((item) => !targetWorkoutIds.has(item.id))) ===
      facts.canonicalWorkoutsDigest,
    noWorkoutLinkCreated: afterFacts.linksDigest === facts.linksDigest && afterFacts.linkCount === facts.linkCount,
    noClaimCreated: afterFacts.claimsDigest === facts.claimsDigest && afterFacts.claimCount === facts.claimCount,
    evidenceUnchanged: afterFacts.evidenceDigest === facts.evidenceDigest && afterFacts.evidenceCount === facts.evidenceCount,
    activityDaysUnchanged: afterFacts.canonicalDaysDigest === facts.canonicalDaysDigest,
    workoutPolicyUntouched: afterFacts.workoutPolicyDigest === facts.workoutPolicyDigest,
    graduationPolicyUntouched: afterFacts.graduationPolicyDigest === facts.graduationPolicyDigest,
    strategicArtifactsUntouched: stable(afterFacts.strategicArtifactMetadataDigests) === stable(facts.strategicArtifactMetadataDigests),
    auditRowPresent: after.audit?.id === HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_AUDIT_RECORD_ID,
  };
  if (Object.values(invariants).some((value) => value !== true)) {
    throw operationError("POST_WRITE_INVARIANT_FAILED", "Post-write invariants failed.", { invariants });
  }
  return Object.freeze({ outcome: "applied", ...resultSummary, invariants, observations: updatedObservations });
}

/**
 * A record store that refuses every write outside the exact repair scope
 * (collection -> record ids). Reads pass through. Exported for tests.
 */
export function createRepairScopedRecordStore(records, allowed = {}) {
  const scope = new Map(Object.entries(allowed).map(([collection, ids]) => [collection, new Set(ids)]));
  let writes = 0;
  const check = ({ collection, recordId } = {}) => {
    if (!scope.get(collection)?.has(recordId)) {
      throw operationError("WRITE_OUTSIDE_REPAIR_SCOPE", "This repair may not write that record.", { collection, recordId });
    }
  };
  return Object.freeze({
    get: (args) => records.get(args),
    list: (args) => records.list(args),
    async put(args) { check(args); writes += 1; return records.put(args); },
    async putIfAbsent(args) { check(args); writes += 1; return records.putIfAbsent(args); },
    writeCount: () => writes,
  });
}

function selectRepairTargets(observations) {
  const selected = [];
  const nearMisses = [];
  for (const observation of observations) {
    if (observation?.observationType !== HealthKitObservationType.WORKOUT) continue;
    if (!Object.hasOwn(HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_TYPES, activityTypeOf(observation))) continue;
    const onDate = effectiveLocalDateOf(observation) === HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_LOCAL_DATE &&
      observation.occurrence?.localDate === HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_LOCAL_DATE;
    const inState = observation.reconciliation?.state === HealthKitReconciliationState.SOURCE_ONLY &&
      observation.reconciliation?.reason === WORKOUT_UNSUPPORTED_TYPE_REASON;
    if (onDate && inState) selected.push(observation);
    // Same type and date in any other state, or the same state on a near
    // date: reported only, never touched, so a refusal is easy to diagnose.
    else if (onDate || inState) nearMisses.push(observation);
  }
  return { selected, nearMisses };
}

function activityTypeOf(observation) {
  return String(observation?.measurement?.activityType ?? "").trim();
}

function effectiveLocalDateOf(observation) {
  return deriveHealthKitWorkoutLocalDate({
    startedAt: observation?.occurrence?.startedAt,
    timeZone: observation?.occurrence?.timeZone,
  });
}

function describeObservation(observation) {
  return {
    observationId: observation.id,
    userId: observation.userId ?? null,
    activityType: activityTypeOf(observation),
    clientLocalDate: observation.occurrence?.localDate ?? null,
    effectiveLocalDate: effectiveLocalDateOf(observation),
    startedAt: observation.occurrence?.startedAt ?? null,
    endedAt: observation.occurrence?.endedAt ?? null,
    ingestionPurpose: observation.ingestionPurpose ?? HealthKitIngestionPurpose.OPERATIONAL,
    reconciliationState: observation.reconciliation?.state ?? null,
    reconciliationReason: observation.reconciliation?.reason ?? null,
    version: observation.version ?? null,
  };
}

async function readState(records, ownerUserId) {
  const list = (collection) => records.list({ ownerUserId, collection });
  const getConfiguration = (recordId) => records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId });
  const [observations, workoutPolicyRecord, graduationPolicyRecord, audit, canonicalWorkouts, links, claims, evidence, canonicalDays] =
    await Promise.all([
      list(OBSERVATION_COLLECTION),
      getConfiguration(HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID),
      getConfiguration(HEALTHKIT_GRADUATION_POLICY_RECORD_ID),
      getConfiguration(HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_AUDIT_RECORD_ID),
      list(HEALTHKIT_CANONICAL_WORKOUT_COLLECTION),
      list(HEALTHKIT_WORKOUT_LINK_COLLECTION),
      list(HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION),
      list(EVIDENCE_COLLECTION),
      list(HEALTHKIT_CANONICAL_DAY_COLLECTION),
    ]);
  const strategicArtifactMetadata = typeof records.listStorageMetadata === "function"
    ? Object.fromEntries(await Promise.all(STRATEGIC_ARTIFACT_COLLECTIONS.map(async (collection) =>
      [collection, await records.listStorageMetadata({ ownerUserId, collection })])))
    : null;
  return {
    observations, workoutPolicyRecord, graduationPolicyRecord, audit, canonicalWorkouts, links, claims, evidence, canonicalDays,
    strategicArtifactMetadata,
  };
}

function collectFacts(state) {
  return {
    observationCount: state.observations.length,
    observationsDigest: listDigest(state.observations),
    workoutPolicyVersion: state.workoutPolicyRecord?.version ?? null,
    workoutPolicyDigest: state.workoutPolicyRecord ? digest(stable(state.workoutPolicyRecord)) : null,
    graduationPolicyDigest: state.graduationPolicyRecord ? digest(stable(state.graduationPolicyRecord)) : null,
    auditPresent: Boolean(state.audit),
    canonicalWorkoutCount: state.canonicalWorkouts.length,
    canonicalWorkoutsDigest: listDigest(state.canonicalWorkouts),
    linkCount: state.links.length,
    linksDigest: listDigest(state.links),
    claimCount: state.claims.length,
    claimsDigest: listDigest(state.claims),
    evidenceCount: state.evidence.length,
    evidenceDigest: listDigest(state.evidence),
    canonicalDayCount: state.canonicalDays.length,
    canonicalDaysDigest: listDigest(state.canonicalDays),
    strategicArtifactMetadataDigests: state.strategicArtifactMetadata
      ? Object.fromEntries(Object.entries(state.strategicArtifactMetadata).map(([collection, rows]) => [collection, {
        count: rows.length,
        digest: digest(stable(rows.map((row) => [row.recordId ?? row.record_id ?? null, String(row.createdAt ?? ""), String(row.updatedAt ?? "")]))),
      }]))
      : null,
  };
}

function compareFacts(expected, actual) {
  if (!expected || typeof expected !== "object") return ["expected facts are required for apply"];
  return Object.keys(actual).filter((key) => stable(expected[key] ?? null) !== stable(actual[key] ?? null));
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

function listDigest(list) {
  return digest(list.map((record) => `${record.id ?? record.canonicalId}:${record.version ?? 1}:${digest(stable(record))}`).sort().join(","));
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 32);
}
