export const PhaseReviewEarlyPolicy = Object.freeze({
  PROHIBITED: "prohibited",
  ALLOWED: "allowed",
  RECOMMENDATION_ONLY: "recommendation_only",
  USER_INITIATED: "user_initiated",
  EVIDENCE_THRESHOLD: "evidence_threshold",
});

const POLICIES = new Set(Object.values(PhaseReviewEarlyPolicy));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function createPhaseReviewMilestone(input = {}) {
  const milestone = {
    schemaVersion: "phase_review_milestone_v1",
    milestoneId: required(input.milestoneId, "milestoneId"),
    goalId: required(input.goalId ?? input.GoalId, "goalId"),
    phaseId: required(input.phaseId, "phaseId"),
    milestoneType: required(input.milestoneType, "milestoneType"),
    reviewType: required(input.reviewType, "reviewType"),
    requiredEvidence: array(input.requiredEvidence, "requiredEvidence"),
    eligibleArtifactTypes: nonEmptyStrings(input.eligibleArtifactTypes,
      "eligibleArtifactTypes"),
    designatedArtifactIdentity: nullable(input.designatedArtifactIdentity),
    designatedEvidenceIdentity: nullable(input.designatedEvidenceIdentity),
    earliestEligibleDate: date(input.earliestEligibleDate, "earliestEligibleDate"),
    latestEligibleDate: optionalDate(input.latestEligibleDate, "latestEligibleDate"),
    earlyReviewPolicy: policy(input.earlyReviewPolicy),
    reviewRequired: input.reviewRequired === true,
    unresolvedReviewId: required(input.unresolvedReviewId, "unresolvedReviewId"),
    resolvedReviewId: nullable(input.resolvedReviewId),
    decisionRequired: input.decisionRequired === true,
    recommendationRequired: input.recommendationRequired === true,
    consumed: input.consumed === true,
    lineage: array(input.lineage, "lineage"),
    revision: integer(input.revision, "revision"),
  };
  if (milestone.latestEligibleDate &&
      milestone.latestEligibleDate < milestone.earliestEligibleDate) {
    throw new TypeError("latestEligibleDate cannot precede earliestEligibleDate.");
  }
  if (milestone.consumed && !milestone.resolvedReviewId) {
    throw new TypeError("A consumed review milestone requires resolvedReviewId.");
  }
  if (!milestone.consumed && milestone.resolvedReviewId) {
    throw new TypeError("An unresolved review milestone cannot have resolvedReviewId.");
  }
  return deepFreeze(milestone);
}

export function isPhaseReviewMilestone(value) {
  try { createPhaseReviewMilestone(value); return true; } catch { return false; }
}

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required.`);
  return value.trim();
}
function nullable(value) { return value == null || value === "" ? null : required(value, "identity"); }
function date(value, field) {
  if (typeof value !== "string" || !DATE.test(value) ||
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${field} must be YYYY-MM-DD.`);
  }
  return value;
}
function optionalDate(value, field) { return value == null ? null : date(value, field); }
function policy(value) {
  if (!POLICIES.has(value)) throw new TypeError("earlyReviewPolicy is unsupported.");
  return value;
}
function array(value, field) {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array.`);
  return structuredClone(value);
}
function nonEmptyStrings(value, field) {
  if (!Array.isArray(value) || !value.length) throw new TypeError(`${field} must not be empty.`);
  return [...new Set(value.map((item) => required(item, field)))];
}
function integer(value, field) {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < 0) throw new TypeError(`${field} must be non-negative.`);
  return number;
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze); return Object.freeze(value);
}
