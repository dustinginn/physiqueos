import { createHash } from "node:crypto";
import { HEALTHKIT_CANONICAL_DAY_COLLECTION } from "../../domain/services/HealthKitEvidenceEligibilityPolicy.js";
import {
  HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
  HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID,
  resolveHealthKitWorkoutActivationPolicy,
} from "../../domain/services/HealthKitObservationService.js";
import { HEALTHKIT_CANONICAL_WORKOUT_COLLECTION, HealthKitWorkoutFamily } from "../../domain/services/HealthKitWorkoutService.js";
import {
  HEALTHKIT_STRENGTH_LINK_AUTO_CONFIRM,
  HEALTHKIT_WORKOUT_LINK_COLLECTION,
  HealthKitStrengthMatchOutcome,
  HealthKitWorkoutLinkStatus,
  assessHealthKitStrengthLinkCandidates,
  createHealthKitWorkoutLinkCandidate,
} from "../../domain/services/HealthKitWorkoutLinkService.js";
import { HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION } from "../../domain/services/HealthKitWorkoutRelationshipService.js";

export const HEALTHKIT_WORKOUT_LINK_REASSESSMENT_AUDIT_RECORD_PREFIX = "healthkit_workout_link_reassessment_audit_";
const CONFIGURATION_COLLECTION = "healthKitConfiguration";
const OBSERVATION_COLLECTION = "healthKitObservations";
const EVIDENCE_COLLECTION = "canonicalEvidenceObjects";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reassesses exactly one already-canonical Strength workout against current
 * Logger state. This operation can create one quarantined CANDIDATE and
 * update only that workout's assessment. It cannot confirm, auto-confirm,
 * graduate strategic eligibility, mutate Logger content, or re-ingest an
 * observation.
 */
export async function runHealthKitWorkoutLinkReassessment({
  records,
  authorization,
  apply = false,
  expected = null,
  now = () => new Date(),
} = {}) {
  const { ownerUserId, localDate, authorizationReference } = authorization ?? {};
  if (!ownerUserId) throw operationError("OWNER_REQUIRED", "An owner is required.");
  if (!calendarValid(localDate)) throw operationError("DATE_INVALID", "localDate must be a calendar-valid YYYY-MM-DD value.");
  if (HEALTHKIT_STRENGTH_LINK_AUTO_CONFIRM !== false) {
    throw operationError("AUTO_CONFIRM_MUST_REMAIN_OFF", "Reassessment requires auto-confirm to remain off.");
  }

  const list = (collection) => records.list({ ownerUserId, collection });
  const [links, claims, workouts, evidence, canonicalDays, observations, dailyPolicy, workoutPolicy] = await Promise.all([
    list(HEALTHKIT_WORKOUT_LINK_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION),
    list(HEALTHKIT_CANONICAL_WORKOUT_COLLECTION),
    list(EVIDENCE_COLLECTION),
    list(HEALTHKIT_CANONICAL_DAY_COLLECTION),
    list(OBSERVATION_COLLECTION),
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID }),
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID }),
  ]);
  const facts = collectFacts({ links, claims, workouts, evidence, canonicalDays, observations, dailyPolicy, workoutPolicy });
  if (workoutPolicy?.linkAutoConfirm !== false || workoutPolicy?.strategicEvidenceEligibility !== "quarantined") {
    return refused("policy_safety_flags_not_preserved", facts);
  }
  const policy = resolveHealthKitWorkoutActivationPolicy(workoutPolicy);
  if (!policy.enabled || !policy.families.includes(HealthKitWorkoutFamily.STRENGTH) ||
    localDate < policy.effectiveLocalDate || (policy.endLocalDate !== null && localDate > policy.endLocalDate)) {
    return refused("strength_policy_not_active_for_date", facts);
  }
  const strength = workouts.filter((workout) =>
    workout.localDate === localDate && workout.current?.family === HealthKitWorkoutFamily.STRENGTH);
  if (strength.length === 0) return refused("no_strength_workout_on_date", facts);
  if (strength.length > 1) return refused("multiple_strength_workouts_on_date", facts, { workoutCount: strength.length });
  const [workout] = strength;
  const relatedLinks = links.filter((link) => link.canonicalWorkoutId === workout.id);
  if (relatedLinks.some((link) => link.status === HealthKitWorkoutLinkStatus.CONFIRMED)) {
    return refused("workout_already_confirmed", facts, { canonicalWorkoutId: workout.id });
  }

  const assessment = assessHealthKitStrengthLinkCandidates({
    canonicalWorkout: workout,
    canonicalObjects: evidence,
    existingLinks: links,
    canonicalWorkouts: workouts,
  });
  const [match] = assessment.candidates;
  if (assessment.outcome !== HealthKitStrengthMatchOutcome.CONFIDENT || assessment.candidates.length !== 1 ||
    match?.basis !== "logger_session_window") {
    return refused(assessment.reason ?? "single_candidate_not_proven", facts, {
      canonicalWorkoutId: workout.id,
      matchOutcome: assessment.outcome,
      candidateCount: assessment.candidates.length,
    });
  }
  const candidate = createHealthKitWorkoutLinkCandidate({
    canonicalWorkout: workout,
    assessment,
    ownerUserId,
    now: now().toISOString(),
  });
  const assessmentPatch = {
    outcome: assessment.outcome,
    reason: assessment.reason,
    matcherVersion: assessment.matcherVersion,
    unverifiableSessionCount: assessment.unverifiableSessionCount,
    candidates: assessment.candidates.map((item) => ({
      loggerSessionCanonicalId: item.loggerSessionCanonicalId,
      confidence: item.confidence,
      basis: item.basis,
    })),
  };
  const existingCandidate = relatedLinks.find((link) => link.id === candidate.id && link.status === HealthKitWorkoutLinkStatus.CANDIDATE);
  const auditRecordId = `${HEALTHKIT_WORKOUT_LINK_REASSESSMENT_AUDIT_RECORD_PREFIX}${digest(authorizationReference ?? "").slice(0, 12)}`;
  if (existingCandidate && stable(workout.linkAssessment) === stable(assessmentPatch) &&
    existingCandidate.matcherVersion === assessment.matcherVersion && existingCandidate.confidence === candidate.confidence) {
    if (!apply) return Object.freeze({ outcome: "already_reassessed", ...summary(workout, candidate, assessment), facts });
    if (!String(authorizationReference ?? "").trim()) {
      throw operationError("AUTHORIZATION_REFERENCE_REQUIRED", "Apply requires an authorization reference.");
    }
    const existingAudit = await records.get({
      ownerUserId,
      collection: CONFIGURATION_COLLECTION,
      recordId: auditRecordId,
    });
    if (existingAudit?.authorizationReference === String(authorizationReference) &&
      existingAudit?.canonicalWorkoutId === workout.id &&
      existingAudit?.loggerSessionCanonicalId === candidate.loggerSessionCanonicalId &&
      existingAudit?.matcherVersion === assessment.matcherVersion &&
      existingAudit?.autoConfirm === false &&
      existingAudit?.strategicEvidenceEligibility === "quarantined") {
      return Object.freeze({ outcome: "already_reassessed", ...summary(workout, candidate, assessment), auditRecordId, facts });
    }
    const replayDrift = compareFacts(expected, facts);
    if (replayDrift.length > 0) return Object.freeze({ outcome: "drifted", drift: replayDrift, facts });
    return refused("existing_reassessment_without_matching_authorization_audit", facts, {
      canonicalWorkoutId: workout.id,
      linkId: candidate.id,
    });
  }
  if (relatedLinks.length > 0) return refused("existing_link_requires_separate_review", facts, { linkCount: relatedLinks.length });

  const resultSummary = {
    ...summary(workout, candidate, assessment),
    auditRecordId,
    predictedMutations: [
      { collection: HEALTHKIT_WORKOUT_LINK_COLLECTION, recordId: candidate.id, operation: "create", to: HealthKitWorkoutLinkStatus.CANDIDATE },
      { collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION, recordId: workout.id, operation: "update_assessment" },
      { collection: CONFIGURATION_COLLECTION, recordId: auditRecordId, operation: "create" },
    ],
    unchangedByDesign: {
      loggerSession: "byte-identical",
      canonicalWorkoutCurrent: "byte-identical",
      claims: "none created or changed",
      confirmation: "off",
      strategicEligibility: "quarantined",
      policies: "read-only drift fence",
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
      kind: "healthkit_workout_link_reassessment_audit",
      at,
      authorizationReference: String(authorizationReference),
      canonicalWorkoutId: workout.id,
      loggerSessionCanonicalId: candidate.loggerSessionCanonicalId,
      matcherVersion: assessment.matcherVersion,
      matchOutcome: assessment.outcome,
      confidence: candidate.confidence,
      autoConfirm: false,
      strategicEvidenceEligibility: "quarantined",
    },
  });
  if (!audit.created) throw operationError("AUDIT_ROW_EXISTS", "This authorization reference was already used for reassessment.");
  const created = await records.putIfAbsent({
    ownerUserId,
    collection: HEALTHKIT_WORKOUT_LINK_COLLECTION,
    recordId: candidate.id,
    sourceIdentity: candidate.id,
    payload: candidate,
  });
  if (!created.created) throw operationError("LINK_ALREADY_EXISTS", "The predicted candidate link already exists.");
  await records.put({
    ownerUserId,
    collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION,
    recordId: workout.id,
    expectedVersion: workout.version,
    sourceIdentity: workout.id,
    payload: { ...workout, linkAssessment: assessmentPatch, updatedAt: at },
  });

  const [afterLinks, afterClaims, afterWorkouts, afterEvidence, afterDays, afterObservations, afterDaily, afterWorkoutPolicy] = await Promise.all([
    list(HEALTHKIT_WORKOUT_LINK_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION),
    list(HEALTHKIT_CANONICAL_WORKOUT_COLLECTION),
    list(EVIDENCE_COLLECTION),
    list(HEALTHKIT_CANONICAL_DAY_COLLECTION),
    list(OBSERVATION_COLLECTION),
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID }),
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID }),
  ]);
  const afterLink = afterLinks.find((link) => link.id === candidate.id);
  const afterWorkout = afterWorkouts.find((item) => item.id === workout.id);
  const invariants = {
    exactlyOneCandidateCreated: afterLinks.filter((link) => link.canonicalWorkoutId === workout.id && link.status === HealthKitWorkoutLinkStatus.CANDIDATE).length === 1 && afterLink?.id === candidate.id,
    noConfirmedLinkCreated: afterLinks.filter((link) => link.canonicalWorkoutId === workout.id && link.status === HealthKitWorkoutLinkStatus.CONFIRMED).length === 0,
    candidateQuarantined: afterLink?.evidenceEligibility?.state === "quarantined" && afterLink?.evidenceEligibility?.strategic === false,
    loggerAuthorityPreserved: afterLink?.contentAuthority?.trainingContent === "workout_logger" && afterLink?.contentAuthority?.telemetry === "healthkit",
    claimsUnchanged: afterClaims.length === facts.claimCount && listDigest(afterClaims) === facts.claimsDigest,
    loggerEvidenceUnchanged: afterEvidence.length === facts.evidenceCount && listDigest(afterEvidence) === facts.evidenceDigest,
    workoutCurrentUnchanged: stable(afterWorkout?.current) === stable(workout.current),
    workoutStillQuarantined: afterWorkout?.evidenceEligibility?.state === "quarantined" && afterWorkout?.evidenceEligibility?.strategic === false,
    otherWorkoutsUnchanged: listDigest(afterWorkouts.filter((item) => item.id !== workout.id)) === listDigest(workouts.filter((item) => item.id !== workout.id)),
    assessmentUpdatedOnly: stable(afterWorkout?.linkAssessment) === stable(assessmentPatch),
    canonicalDaysUnchanged: afterDays.length === facts.canonicalDayCount && listDigest(afterDays) === facts.canonicalDaysDigest,
    observationsUnchanged: afterObservations.length === facts.observationCount && listDigest(afterObservations) === facts.observationsDigest,
    dailyPolicyUntouched: (afterDaily ? digest(stable(afterDaily)) : null) === facts.dailyPolicyDigest,
    workoutPolicyUntouched: (afterWorkoutPolicy ? digest(stable(afterWorkoutPolicy)) : null) === facts.workoutPolicyDigest,
    autoConfirmStillOff: afterWorkoutPolicy?.linkAutoConfirm === false,
    strategicEligibilityStillOff: afterWorkoutPolicy?.strategicEvidenceEligibility === "quarantined",
    auditRowPresent: audit.record?.id === auditRecordId,
  };
  if (Object.values(invariants).some((value) => value !== true)) {
    throw operationError("POST_WRITE_INVARIANT_FAILED", "Post-write invariants failed.", { invariants });
  }
  return Object.freeze({ outcome: "applied", ...resultSummary, invariants });
}

function summary(workout, candidate, assessment) {
  const [match] = assessment.candidates;
  return {
    canonicalWorkoutId: workout.id,
    workoutVersion: workout.version,
    localDate: workout.localDate,
    canonicalType: workout.current?.canonicalType ?? null,
    linkId: candidate.id,
    linkStatus: candidate.status,
    loggerSessionCanonicalId: match.loggerSessionCanonicalId,
    matchOutcome: assessment.outcome,
    confidence: match.confidence,
    matchBasis: match.basis,
    matcherVersion: assessment.matcherVersion,
  };
}

function collectFacts({ links, claims, workouts, evidence, canonicalDays, observations, dailyPolicy, workoutPolicy }) {
  return {
    linkCount: links.length,
    linksDigest: listDigest(links),
    claimCount: claims.length,
    claimsDigest: listDigest(claims),
    canonicalWorkoutCount: workouts.length,
    canonicalWorkoutsDigest: listDigest(workouts),
    evidenceCount: evidence.length,
    evidenceDigest: listDigest(evidence),
    canonicalDayCount: canonicalDays.length,
    canonicalDaysDigest: listDigest(canonicalDays),
    observationCount: observations.length,
    observationsDigest: listDigest(observations),
    dailyPolicyDigest: dailyPolicy ? digest(stable(dailyPolicy)) : null,
    workoutPolicyDigest: workoutPolicy ? digest(stable(workoutPolicy)) : null,
  };
}

function compareFacts(expected, actual) {
  if (!expected || typeof expected !== "object") return ["expected facts are required for apply"];
  return Object.keys(actual).filter((key) => JSON.stringify(expected[key] ?? null) !== JSON.stringify(actual[key] ?? null));
}

function refused(reason, facts, detail = {}) {
  return Object.freeze({ outcome: "refused", reasons: [reason], ...detail, facts });
}

function calendarValid(value) {
  if (!DATE.test(String(value))) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function operationError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
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
