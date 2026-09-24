import { createHash } from "node:crypto";
import { isActiveDetailedStrengthSession } from "./HealthKitObservationService.js";
import { HealthKitWorkoutFamily } from "./HealthKitWorkoutService.js";
import {
  HealthKitStrengthMatchOutcome,
  HealthKitWorkoutLinkStatus,
  findPossibleDuplicateCanonicalWorkouts,
  isTrustedNativeLiveLoggerSession,
} from "./HealthKitWorkoutLinkService.js";
import { createHealthKitQuarantinedEligibility } from "./HealthKitEvidenceEligibilityPolicy.js";

export const HEALTHKIT_WORKOUT_RECONCILIATION_SCHEMA_VERSION = "healthkit-workout-reconciliation-v1";
export const HEALTHKIT_WORKOUT_RECONCILIATION_KIND = "healthkit_workout_reconciliation";
export const HEALTHKIT_WORKOUT_RECONCILIATION_PREFIX = "healthkit_workout_reconciliation_";
export const HEALTHKIT_WORKOUT_RECONCILIATION_COLLECTION = "evidenceReviews";

export const HealthKitWorkoutReconciliationAction = Object.freeze({
  CONFIRM: "confirm",
  NO_MATCH: "no_match",
});

export function getHealthKitWorkoutReconciliationId(canonicalWorkoutId) {
  const digest = createHash("sha256").update(String(canonicalWorkoutId)).digest("hex").slice(0, 40);
  return `${HEALTHKIT_WORKOUT_RECONCILIATION_PREFIX}${digest}`;
}

/**
 * A score is deliberately insufficient. Automatic confirmation is available
 * only for a current, uniquely identified Strength relationship whose concrete
 * identity/time facts satisfy an allowlisted rule and whose full relationship
 * context contains no unresolved competitor or possible duplicate workout.
 * Reconciliation history is not an input, so it can never weaken a hard guard.
 */
export function assessDeterministicStrengthAutoConfirm({
  canonicalWorkout,
  assessment,
  canonicalObjects = [],
  canonicalWorkouts = [],
  existingLinks = [],
  link = null,
} = {}) {
  const reasons = [];
  const current = canonicalWorkout?.current;
  const candidates = assessment?.candidates ?? [];
  const candidate = candidates.length === 1 ? candidates[0] : null;
  const session = candidate ? canonicalObjects.find((record) =>
    (record.canonicalId ?? record.payload?.id) === candidate.loggerSessionCanonicalId) : null;

  if (!current || current.family !== HealthKitWorkoutFamily.STRENGTH) reasons.push("workout_not_strength");
  if (assessment?.outcome !== HealthKitStrengthMatchOutcome.CONFIDENT) reasons.push("assessment_not_confident");
  if (candidates.length !== 1) reasons.push("candidate_not_unique");
  if (Number(assessment?.unverifiableSessionCount ?? 0) !== 0) reasons.push("unverifiable_competitor_present");
  if (!session || !isActiveDetailedStrengthSession(session)) reasons.push("logger_session_not_active_detailed_strength");
  if (session && !isTrustedNativeLiveLoggerSession(session.payload ?? session)) reasons.push("logger_session_provenance_untrusted");

  if (candidate) {
    // An authoritative source id proves identity provenance, not temporal
    // compatibility. Every automatic-confirm basis must independently prove
    // substantive overlap and at least one aligned boundary.
    const explicit = candidate.basis === "explicit_source_identity" && candidate.confidence === 100 &&
      candidate.substantiveOverlap === true && Number(candidate.overlapSeconds) > 0 &&
      (candidate.startAligned === true || candidate.endAligned === true);
    const loggerWindow = candidate.basis === "logger_session_window" && candidate.confidence === 95 &&
      candidate.endAligned === true && Number(candidate.overlapSeconds) > 0;
    if (!explicit && !loggerWindow) reasons.push("deterministic_basis_not_allowlisted");
  }

  const duplicateIds = current
    ? findPossibleDuplicateCanonicalWorkouts(canonicalWorkout, canonicalWorkouts)
    : [];
  if (duplicateIds.length > 0) reasons.push("possible_duplicate_canonical_workout");

  if (candidate) {
    const active = existingLinks.filter((item) =>
      item.id !== link?.id &&
      [HealthKitWorkoutLinkStatus.CANDIDATE, HealthKitWorkoutLinkStatus.CONFIRMED].includes(item.status));
    if (active.some((item) => item.canonicalWorkoutId === canonicalWorkout?.id ||
      item.loggerSessionCanonicalId === candidate.loggerSessionCanonicalId)) {
      reasons.push("competing_active_relationship");
    }
  }
  if (link && (link.status !== HealthKitWorkoutLinkStatus.CANDIDATE ||
    link.canonicalWorkoutId !== canonicalWorkout?.id ||
    link.loggerSessionCanonicalId !== candidate?.loggerSessionCanonicalId)) {
    reasons.push("candidate_link_state_mismatch");
  }

  return Object.freeze({
    eligible: reasons.length === 0,
    ruleVersion: "healthkit-strength-auto-confirm-v1",
    reasons: Object.freeze(reasons),
    candidate: candidate ? Object.freeze({
      loggerSessionCanonicalId: candidate.loggerSessionCanonicalId,
      confidence: candidate.confidence,
      basis: candidate.basis,
      substantiveOverlap: candidate.substantiveOverlap ?? null,
      trustedLoggerProvenance: candidate.trustedLoggerProvenance ?? null,
      overlapSeconds: candidate.overlapSeconds ?? null,
      startAligned: candidate.startAligned ?? null,
      endAligned: candidate.endAligned ?? null,
    }) : null,
  });
}

export function createHealthKitWorkoutReconciliationReview({
  ownerUserId,
  canonicalWorkout,
  assessment,
  canonicalObjects = [],
  now,
} = {}) {
  const at = new Date(now).toISOString();
  const id = getHealthKitWorkoutReconciliationId(canonicalWorkout.id);
  return Object.freeze({
    schemaVersion: HEALTHKIT_WORKOUT_RECONCILIATION_SCHEMA_VERSION,
    reviewKind: HEALTHKIT_WORKOUT_RECONCILIATION_KIND,
    id,
    userId: ownerUserId,
    status: "pending",
    localDate: canonicalWorkout.localDate,
    canonicalWorkoutId: canonicalWorkout.id,
    workout: Object.freeze({
      family: canonicalWorkout.current.family,
      canonicalType: canonicalWorkout.current.canonicalType,
      startedAt: canonicalWorkout.current.startedAt,
      endedAt: canonicalWorkout.current.endedAt ?? null,
    }),
    matcherVersion: assessment.matcherVersion,
    assessmentOutcome: assessment.outcome,
    assessmentReason: assessment.reason,
    candidates: Object.freeze(assessment.candidates.map((candidate) => projectCandidate(
      candidate,
      canonicalObjects.find((record) => (record.canonicalId ?? record.payload?.id) === candidate.loggerSessionCanonicalId),
    ))),
    resolution: null,
    resolutionHistory: Object.freeze([]),
    lifecycleHistory: Object.freeze([{ status: "pending", at, by: { kind: "system_matcher" } }]),
    evidenceEligibility: createHealthKitQuarantinedEligibility(),
    strategicEvidenceEligibility: "quarantined",
    createdAt: at,
    updatedAt: at,
  });
}

export function refreshHealthKitWorkoutReconciliationReview(review, { canonicalWorkout, assessment, canonicalObjects = [], now } = {}) {
  if (review.status !== "pending") return review;
  const nextFacts = {
    localDate: canonicalWorkout.localDate,
    workout: {
      family: canonicalWorkout.current.family,
      canonicalType: canonicalWorkout.current.canonicalType,
      startedAt: canonicalWorkout.current.startedAt,
      endedAt: canonicalWorkout.current.endedAt ?? null,
    },
    matcherVersion: assessment.matcherVersion,
    assessmentOutcome: assessment.outcome,
    assessmentReason: assessment.reason,
    candidates: assessment.candidates.map((candidate) => projectCandidate(
      candidate,
      canonicalObjects.find((record) => (record.canonicalId ?? record.payload?.id) === candidate.loggerSessionCanonicalId),
    )),
  };
  const currentFacts = Object.fromEntries(Object.keys(nextFacts).map((key) => [key, review[key]]));
  if (stable(currentFacts) === stable(nextFacts)) return review;
  return Object.freeze({ ...review, ...nextFacts, updatedAt: new Date(now).toISOString() });
}

export function reopenHealthKitWorkoutReconciliationReview(review, { canonicalWorkout, assessment, canonicalObjects = [], now } = {}) {
  if (review.status !== "superseded") return review;
  const desired = createHealthKitWorkoutReconciliationReview({
    ownerUserId: review.userId,
    canonicalWorkout,
    assessment,
    canonicalObjects,
    now,
  });
  const at = new Date(now).toISOString();
  return Object.freeze({
    ...review,
    localDate: desired.localDate,
    workout: desired.workout,
    matcherVersion: desired.matcherVersion,
    assessmentOutcome: desired.assessmentOutcome,
    assessmentReason: desired.assessmentReason,
    candidates: desired.candidates,
    status: "pending",
    resolution: null,
    resolutionHistory: Object.freeze([...(review.resolutionHistory ?? [])]),
    lifecycleHistory: Object.freeze([...(review.lifecycleHistory ?? []), { status: "pending", at, by: { kind: "system_matcher" }, reason: "plausible_match_returned" }]),
    updatedAt: at,
  });
}

export function supersedeHealthKitWorkoutReconciliationReview(review, { now, reason = "no_current_founder_resolution_needed" } = {}) {
  if (review.status !== "pending") return review;
  const at = new Date(now).toISOString();
  return Object.freeze({
    ...review,
    status: "superseded",
    lifecycleHistory: Object.freeze([...(review.lifecycleHistory ?? []), { status: "superseded", at, by: { kind: "system_matcher" }, reason }]),
    updatedAt: at,
  });
}

export function refreshSupersededHealthKitWorkoutReconciliationFacts(review, args = {}) {
  if (review.status !== "superseded") return review;
  const refreshed = refreshHealthKitWorkoutReconciliationReview({ ...review, status: "pending" }, args);
  return Object.freeze({ ...refreshed, status: "superseded" });
}

export function resolveHealthKitWorkoutReconciliationRecord(review, {
  action,
  selectedLoggerSessionCanonicalId = null,
  linkId = null,
  by,
  now,
  basis,
  allowSuperseded = false,
} = {}) {
  if (review.status !== "pending" && !(allowSuperseded && review.status === "superseded")) return review;
  const at = new Date(now).toISOString();
  const resolution = Object.freeze({
    action,
    selectedLoggerSessionCanonicalId: action === HealthKitWorkoutReconciliationAction.CONFIRM
      ? selectedLoggerSessionCanonicalId : null,
    linkId: action === HealthKitWorkoutReconciliationAction.CONFIRM ? linkId : null,
    at,
    by,
    basis,
    strategicEvidenceEligibility: "quarantined",
  });
  return Object.freeze({
    ...review,
    status: action === HealthKitWorkoutReconciliationAction.CONFIRM ? "resolved_confirmed" : "resolved_no_match",
    resolution,
    resolutionHistory: Object.freeze([...(review.resolutionHistory ?? []), resolution]),
    lifecycleHistory: Object.freeze([...(review.lifecycleHistory ?? []), {
      status: action === HealthKitWorkoutReconciliationAction.CONFIRM ? "resolved_confirmed" : "resolved_no_match",
      at,
      by,
    }]),
    updatedAt: at,
  });
}

export function isHealthKitWorkoutReconciliationReview(review) {
  return review?.reviewKind === HEALTHKIT_WORKOUT_RECONCILIATION_KIND &&
    review?.schemaVersion === HEALTHKIT_WORKOUT_RECONCILIATION_SCHEMA_VERSION;
}

export function hasExactHealthKitWorkoutReconciliationResolution(review, {
  action,
  selectedLoggerSessionCanonicalId = null,
  linkId = null,
} = {}) {
  if (!isHealthKitWorkoutReconciliationReview(review)) return false;
  const expectedStatus = action === HealthKitWorkoutReconciliationAction.CONFIRM
    ? "resolved_confirmed" : action === HealthKitWorkoutReconciliationAction.NO_MATCH
      ? "resolved_no_match" : null;
  if (!expectedStatus || review.status !== expectedStatus) return false;
  if (action === HealthKitWorkoutReconciliationAction.CONFIRM &&
    (!selectedLoggerSessionCanonicalId || !linkId)) return false;
  const exactResolution = (resolution) => resolution?.action === action &&
    (resolution.selectedLoggerSessionCanonicalId ?? null) === (action === HealthKitWorkoutReconciliationAction.CONFIRM
      ? selectedLoggerSessionCanonicalId : null) &&
    (resolution.linkId ?? null) === (action === HealthKitWorkoutReconciliationAction.CONFIRM ? linkId : null);
  if (!exactResolution(review.resolution)) return false;
  if (!Array.isArray(review.resolutionHistory) || review.resolutionHistory.length !== 1 ||
    !exactResolution(review.resolutionHistory[0]) ||
    stable(review.resolutionHistory[0]) !== stable(review.resolution)) return false;
  const resolution = review.resolution;
  const allowedBasisModes = new Set([
    "founder_explicit_selection",
    "founder_explicit_no_match",
    "deterministic_auto_confirm",
    "deterministic_auto_confirm_acceptance",
  ]);
  if (!validInstant(resolution.at) || !String(resolution.by?.kind ?? "").trim() ||
    !String(resolution.by?.ref ?? "").trim() || !allowedBasisModes.has(resolution.basis?.mode) ||
    ((resolution.basis.mode.startsWith("founder_")) && resolution.by.kind !== "founder") ||
    ((resolution.basis.mode.startsWith("deterministic_")) && resolution.by.kind !== "system_matcher") ||
    (resolution.basis.mode.startsWith("founder_") && !String(resolution.basis?.matcherVersion ?? "").trim()) ||
    (resolution.basis.mode.startsWith("deterministic_") && !String(resolution.basis?.ruleVersion ?? "").trim()) ||
    review.updatedAt !== resolution.at ||
    resolution.strategicEvidenceEligibility !== "quarantined" ||
    review.strategicEvidenceEligibility !== "quarantined" || review.evidenceEligibility?.strategic !== false) return false;
  const lifecycle = Array.isArray(review.lifecycleHistory) ? review.lifecycleHistory : [];
  const terminal = lifecycle.filter((entry) => ["resolved_confirmed", "resolved_no_match"].includes(entry?.status));
  return terminal.length === 1 && terminal[0]?.status === expectedStatus &&
    terminal[0]?.at === resolution.at && stable(terminal[0]?.by) === stable(resolution.by) &&
    stable(lifecycle.at(-1)) === stable(terminal[0]);
}

export function hasExactStoredHealthKitWorkoutReconciliationTerminal(review) {
  if (!isHealthKitWorkoutReconciliationReview(review)) return false;
  if (review.status === "resolved_confirmed") {
    return hasExactHealthKitWorkoutReconciliationResolution(review, {
      action: HealthKitWorkoutReconciliationAction.CONFIRM,
      selectedLoggerSessionCanonicalId: review.resolution?.selectedLoggerSessionCanonicalId ?? null,
      linkId: review.resolution?.linkId ?? null,
    });
  }
  if (review.status === "resolved_no_match") {
    return hasExactHealthKitWorkoutReconciliationResolution(review, {
      action: HealthKitWorkoutReconciliationAction.NO_MATCH,
    });
  }
  return false;
}

export function projectHealthKitWorkoutReconciliationPresentation(review) {
  const terminal = ["resolved_confirmed", "resolved_no_match"].includes(review.status);
  const validTerminal = !terminal || hasExactStoredHealthKitWorkoutReconciliationTerminal(review);
  const projectedStatus = validTerminal ? review.status : "invalid_terminal_history";
  return Object.freeze({
    kind: "healthkit_workout_reconciliation",
    id: review.id,
    status: projectedStatus,
    version: String(review.version ?? "1"),
    localDate: review.localDate,
    title: "Match Apple Health workout",
    summary: "Choose the Workout Logger session that belongs to this Apple Health workout, or choose No match.",
    workout: review.workout,
    candidates: Object.freeze((review.candidates ?? []).map((candidate) => Object.freeze({ ...candidate }))),
    resolution: validTerminal && review.resolution ? Object.freeze({
      action: review.resolution.action,
      selectedLoggerSessionCanonicalId: review.resolution.selectedLoggerSessionCanonicalId ?? null,
      linkId: review.resolution.linkId ?? null,
    }) : null,
    actions: Object.freeze(projectedStatus === "pending" ? [
      ...((review.candidates ?? []).map((candidate) => Object.freeze({
        id: `confirm:${candidate.loggerSessionCanonicalId}`,
        action: HealthKitWorkoutReconciliationAction.CONFIRM,
        loggerSessionCanonicalId: candidate.loggerSessionCanonicalId,
        label: "Use this Logger session",
      }))),
      Object.freeze({ id: "no_match", action: HealthKitWorkoutReconciliationAction.NO_MATCH, label: "No match" }),
    ] : []),
    strategicEvidenceEligibility: "quarantined",
  });
}

function validInstant(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function projectCandidate(candidate, session = null) {
  const payload = session?.payload ?? session ?? {};
  const metadata = payload.metadata ?? {};
  return Object.freeze({
    loggerSessionCanonicalId: candidate.loggerSessionCanonicalId,
    confidence: candidate.confidence,
    basis: candidate.basis,
    reasons: Object.freeze([...(candidate.reasons ?? [])]),
    substantiveOverlap: candidate.substantiveOverlap ?? false,
    trustedLoggerProvenance: candidate.trustedLoggerProvenance ?? false,
    overlapSeconds: candidate.overlapSeconds ?? null,
    startAligned: candidate.startAligned ?? null,
    endAligned: candidate.endAligned ?? null,
    loggerSession: Object.freeze({
      activityType: metadata.activity_type ?? "Strength Training",
      startedAt: metadata.start_time ?? metadata.started_at ?? null,
      endedAt: metadata.end_time ?? metadata.ended_at ?? null,
    }),
  });
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
