export const PhaseReviewRecommendation = Object.freeze({
  BEGIN_NEXT_PHASE: "begin_next_phase",
  EXTEND_CURRENT_PHASE: "extend_current_phase",
  REVIEW_STRATEGY_FIRST: "review_strategy_first",
});

export const PhaseReviewUserDecision = Object.freeze({
  BEGIN_NEXT_PHASE: "begin_next_phase",
  EXTEND_CURRENT_PHASE: "extend_current_phase",
});

export const PhaseReviewExtensionSelection = Object.freeze({
  ONE_WEEK: "1_week",
  TWO_WEEKS: "2_weeks",
  THREE_WEEKS: "3_weeks",
  CUSTOM: "custom",
});

const RECOMMENDATIONS = new Set(Object.values(PhaseReviewRecommendation));
const DECISIONS = new Set(Object.values(PhaseReviewUserDecision));
const SELECTIONS = new Set(Object.values(PhaseReviewExtensionSelection));
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function createPhaseReviewDecision(input = {}) {
  const recommendedOutcome = enumeration(input.recommendedOutcome, RECOMMENDATIONS, "recommendedOutcome");
  const selectedOutcome = enumeration(input.selectedOutcome, DECISIONS, "selectedOutcome");
  const selectedDuration = selectedOutcome === PhaseReviewUserDecision.EXTEND_CURRENT_PHASE
    ? enumeration(input.selectedDuration, SELECTIONS, "selectedDuration") : null;
  const selectedReviewAt = selectedOutcome === PhaseReviewUserDecision.EXTEND_CURRENT_PHASE
    ? validDate(input.selectedReviewAt, "selectedReviewAt") : null;
  const decision = {
    schemaVersion: "phase_review_decision_v1",
    decisionId: required(input.decisionId, "decisionId"),
    milestoneId: nullable(input.milestoneId),
    unresolvedReviewId: nullable(input.unresolvedReviewId),
    goalId: required(input.goalId ?? input.GoalId, "goalId"),
    currentPhaseId: required(input.currentPhaseId, "currentPhaseId"),
    nextPhaseId: input.nextPhaseId == null ? null : required(input.nextPhaseId, "nextPhaseId"),
    originalPlannedReviewAt: validDate(input.originalPlannedReviewAt, "originalPlannedReviewAt"),
    recommendedOutcome,
    recommendedDuration: nullablePositiveInteger(input.recommendedDuration ?? input.recommendedDurationDays, "recommendedDuration"),
    recommendedReviewAt: optionalDate(input.recommendedReviewAt),
    rationale: required(input.rationale, "rationale"),
    selectedOutcome,
    selectedDuration,
    selectedReviewAt,
    projectedNextPhaseStart: optionalDate(input.projectedNextPhaseStart),
    decidedAt: validTimestamp(input.decidedAt, "decidedAt"),
    decisionSource: required(input.decisionSource, "decisionSource"),
    originatingArtifactId: nullable(input.originatingArtifactId),
    originatingBriefingId: nullable(input.originatingBriefingId ?? input.originatingArtifactId),
    originatingForecastId: nullable(input.originatingForecastId),
    originatingInterpretationId: nullable(input.originatingInterpretationId),
    confidenceAssessmentId: nullable(input.confidenceAssessmentId),
    reasoningLineage: normalizeLineage(input.reasoningLineage),
    idempotencyKey: required(input.idempotencyKey, "idempotencyKey"),
    expectedCurrentPhaseStatus: required(input.expectedCurrentPhaseStatus, "expectedCurrentPhaseStatus"),
    expectedCurrentPhaseRevision: nonNegativeInteger(input.expectedCurrentPhaseRevision, "expectedCurrentPhaseRevision"),
    expectedStrategyRevision: selectedOutcome === PhaseReviewUserDecision.BEGIN_NEXT_PHASE
      ? nonNegativeInteger(input.expectedStrategyRevision, "expectedStrategyRevision") : null,
    expectedTrajectoryRevision: selectedOutcome === PhaseReviewUserDecision.BEGIN_NEXT_PHASE
      ? nonNegativeInteger(input.expectedTrajectoryRevision, "expectedTrajectoryRevision") : null,
    actorId: required(input.actorId, "actorId"),
  };
  if (selectedOutcome === PhaseReviewUserDecision.BEGIN_NEXT_PHASE && !decision.nextPhaseId) {
    throw new TypeError("nextPhaseId is required to begin the next phase.");
  }
  if (selectedOutcome === PhaseReviewUserDecision.EXTEND_CURRENT_PHASE &&
      decision.selectedReviewAt <= decision.originalPlannedReviewAt) {
    throw new TypeError("An extension review date must follow the original planned review.");
  }
  return deepFreeze(decision);
}

export function extensionDurationDays(selection) {
  if (selection === PhaseReviewExtensionSelection.ONE_WEEK) return 7;
  if (selection === PhaseReviewExtensionSelection.TWO_WEEKS) return 14;
  if (selection === PhaseReviewExtensionSelection.THREE_WEEKS) return 21;
  return null;
}

function enumeration(value, allowed, field) {
  if (!allowed.has(value)) throw new TypeError(`${field} is unsupported.`);
  return value;
}
function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required.`);
  return value.trim();
}
function nullable(value) { return value == null || value === "" ? null : required(value, "reference"); }
function validDate(value, field) {
  if (typeof value !== "string" || !DATE_KEY.test(value) ||
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${field} must be a valid YYYY-MM-DD date.`);
  }
  return value;
}
function optionalDate(value) { return value == null || value === "" ? null : validDate(value, "date"); }
function validTimestamp(value, field) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new TypeError(`${field} must be a valid timestamp.`);
  return new Date(value).toISOString();
}
function nonNegativeInteger(value, field) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new TypeError(`${field} must be a non-negative integer.`);
  return parsed;
}
function nullablePositiveInteger(value, field) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new TypeError(`${field} must be a positive integer.`);
  return parsed;
}
function normalizeLineage(value) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError("reasoningLineage must contain at least one entry.");
  return value.map((entry) => {
    if (typeof entry === "string") return { id: required(entry, "reasoningLineage.id"), type: "reasoning" };
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError("reasoningLineage entries must be objects or IDs.");
    return { ...structuredClone(entry), id: required(entry.id, "reasoningLineage.id"), type: required(entry.type, "reasoningLineage.type") };
  });
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
