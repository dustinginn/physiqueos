import { GoalPhaseStatus, createGoalPhase, normalizeGoalPhaseCollection } from "./goalPhase";

const LEGACY_AUTHORED_GOAL_PHASE_FIELDS = ["id", "goalId", "name", "purpose", "status", "order", "startDate", "targetDate", "duration", "timingMode", "successCriteria", "guardrails", "transitionPolicy", "createdAt", "updatedAt"];
const CANONICAL_LIFECYCLE_FIELDS = ["phaseId", "canonicalName", "startedAt", "plannedReviewAt", "completedAt", "supersededAt", "lastReviewedAt", "reviewState", "projectedNextPhaseStart", "projectedNextReviewAt", "completionCriteria", "reviewMilestone", "completionDecisionRequired", "completionDecisionId", "extensionCount", "latestExtensionDecisionId", "currentRecommendedReviewAt", "revision"];
export const AUTHORED_GOAL_PHASE_FIELDS = Object.freeze([...LEGACY_AUTHORED_GOAL_PHASE_FIELDS, ...CANONICAL_LIFECYCLE_FIELDS]);
const ALLOWED = new Set(AUTHORED_GOAL_PHASE_FIELDS);

export class AuthoredGoalPhasePersistenceError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = "AuthoredGoalPhasePersistenceError"; this.code = code; this.details = deepFreeze(structuredClone(details)); }
}

export function normalizeAuthoredGoalPhases(inputs = [], { goalId, parentGoalStatus = "active", now = new Date(), existingPhases = [] } = {}) {
  if (!Array.isArray(inputs)) throw phaseError("AUTHORED_PHASE_COLLECTION_INVALID", "Authored phases must be an array.");
  if (!goalId) throw phaseError("AUTHORED_PHASE_GOAL_REQUIRED", "A source goal ID is required.");
  const stamp = new Date(now).toISOString();
  const existing = new Map((existingPhases ?? []).map((phase) => [phase.id, phase]));
  const phases = inputs.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw phaseError("AUTHORED_PHASE_INVALID", "Authored phase input must be an object.", { index });
    const extra = Object.keys(raw).filter((field) => !ALLOWED.has(field));
    if (extra.length) throw phaseError("AUTHORED_PHASE_FIELD_UNSUPPORTED", "Authored phase contains unsupported persistence fields.", { index, fields: extra });
    if (!raw.id) throw phaseError("AUTHORED_PHASE_ID_REQUIRED", "Every authored phase requires an explicit stable ID.", { index });
    if (raw.goalId != null && raw.goalId !== goalId) throw phaseError("AUTHORED_PHASE_GOAL_MISMATCH", "Authored phase belongs to a different goal.", { phaseId: raw.id });
    const prior = existing.get(raw.id);
    return createGoalPhase({ ...structuredClone(raw), goalId, createdAt: raw.createdAt ?? prior?.createdAt ?? stamp, updatedAt: raw.updatedAt ?? stamp });
  });
  const normalized = normalizeGoalPhaseCollection(phases, { goalId });
  const activeStatuses = new Set([GoalPhaseStatus.ACTIVE, GoalPhaseStatus.REVIEW_DUE, GoalPhaseStatus.REVIEW_PENDING_DECISION]);
  if (parentGoalStatus === "active" && normalized.length > 0 && normalized.filter((phase) => activeStatuses.has(phase.status)).length !== 1) throw phaseError("AUTHORED_PHASE_ACTIVE_REQUIRED", "A non-empty authored phase collection on an active goal requires exactly one active phase.");
  return deepFreeze(normalized.map(toPersistedGoalPhase));
}

export function toPersistedGoalPhase(input) {
  const phase = createGoalPhase(input);
  const fields = AUTHORED_GOAL_PHASE_FIELDS.filter((field) =>
    LEGACY_AUTHORED_GOAL_PHASE_FIELDS.includes(field) || Object.hasOwn(input, field));
  return deepFreeze(Object.fromEntries(fields.map((field) => [field, structuredClone(phase[field] ?? null)])));
}

function phaseError(code, message, details = {}) { return new AuthoredGoalPhasePersistenceError(code, message, details); }
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
