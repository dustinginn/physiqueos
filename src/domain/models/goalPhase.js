export const GoalPhaseStatus = Object.freeze({
  UPCOMING: "upcoming",
  PLANNED: "planned",
  ACTIVE: "active",
  REVIEW_DUE: "review_due",
  REVIEW_PENDING_DECISION: "review_pending_decision",
  COMPLETED: "completed",
  SKIPPED: "skipped",
  SUPERSEDED: "superseded",
  PAUSED: "paused",
});

export const GoalPhaseTimingMode = Object.freeze({
  FIXED_DURATION: "fixed_duration",
  TARGET_DATE: "target_date",
  COMPLETION_CRITERIA: "completion_criteria",
});

export const GoalPhaseTransitionPolicy = Object.freeze({
  MANUAL_REVIEW: "manual_review",
  EVIDENCE_REVIEW: "evidence_review",
  AUTOMATIC: "automatic",
});

export const GoalPhaseDurationUnit = Object.freeze({
  DAYS: "days",
  WEEKS: "weeks",
  MONTHS: "months",
});

const PHASE_STATUSES = new Set(Object.values(GoalPhaseStatus));
const TIMING_MODES = new Set(Object.values(GoalPhaseTimingMode));
const TRANSITION_POLICIES = new Set(Object.values(GoalPhaseTransitionPolicy));
const DURATION_UNITS = new Set(Object.values(GoalPhaseDurationUnit));
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export class GoalPhaseValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "GoalPhaseValidationError";
    this.code = code;
    this.details = deepFreeze(structuredClone(details));
  }
}

export function createGoalPhase(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw phaseError("GOAL_PHASE_INPUT_INVALID", "Goal phase input must be an object.");
  }

  const phase = structuredClone(input);
  const requiredText = ["id", "goalId", "name", "purpose", "status", "timingMode", "transitionPolicy"];
  for (const field of requiredText) {
    if (!isNonEmptyText(phase[field])) {
      throw phaseError("GOAL_PHASE_REQUIRED_FIELD_MISSING", `Goal phase ${field} is required.`, { field });
    }
  }

  if (!Number.isInteger(phase.order) || phase.order < 0) {
    throw phaseError("GOAL_PHASE_ORDER_INVALID", "Goal phase order must be a non-negative integer.", { order: phase.order });
  }
  assertEnum("status", phase.status, PHASE_STATUSES, "GOAL_PHASE_STATUS_UNSUPPORTED");
  assertEnum("timingMode", phase.timingMode, TIMING_MODES, "GOAL_PHASE_TIMING_MODE_UNSUPPORTED");
  assertEnum("transitionPolicy", phase.transitionPolicy, TRANSITION_POLICIES, "GOAL_PHASE_TRANSITION_POLICY_UNSUPPORTED");

  phase.startDate = normalizeOptionalDate(phase.startDate, "startDate");
  phase.targetDate = normalizeOptionalDate(phase.targetDate, "targetDate");
  phase.duration = normalizeDuration(phase.duration);
  phase.successCriteria = normalizeCollection(phase.successCriteria, "successCriteria");
  phase.guardrails = normalizeCollection(phase.guardrails, "guardrails");
  phase.createdAt = normalizeOptionalTimestamp(phase.createdAt, "createdAt");
  phase.updatedAt = normalizeOptionalTimestamp(phase.updatedAt, "updatedAt");
  for (const field of ["startedAt", "plannedReviewAt", "projectedNextPhaseStart", "projectedNextReviewAt", "currentRecommendedReviewAt"]) {
    if (field in phase) phase[field] = normalizeOptionalDate(phase[field], field);
  }
  for (const field of ["completedAt", "supersededAt", "lastReviewedAt"]) {
    if (field in phase) phase[field] = normalizeOptionalDateOrTimestamp(phase[field], field);
  }
  for (const field of ["extensionCount", "revision"]) {
    if (field in phase && (!Number.isSafeInteger(Number(phase[field])) || Number(phase[field]) < 0)) {
      throw phaseError("GOAL_PHASE_REVISION_INVALID", `Goal phase ${field} must be a non-negative integer.`, { field });
    }
    if (field in phase) phase[field] = Number(phase[field]);
  }

  if (phase.timingMode === GoalPhaseTimingMode.FIXED_DURATION && !phase.duration) {
    throw phaseError("GOAL_PHASE_DURATION_REQUIRED", "A positive duration is required for fixed-duration phases.");
  }
  if (phase.timingMode === GoalPhaseTimingMode.TARGET_DATE && !phase.targetDate) {
    throw phaseError("GOAL_PHASE_TARGET_DATE_REQUIRED", "A target date is required for target-date phases.");
  }
  if (phase.startDate && phase.targetDate && phase.targetDate < phase.startDate) {
    throw phaseError("GOAL_PHASE_DATE_RANGE_INVALID", "Goal phase target date cannot precede its start date.");
  }
  if ((phase.active === true && phase.completed === true) ||
      (phase.status === GoalPhaseStatus.ACTIVE && phase.completed === true) ||
      (phase.status === GoalPhaseStatus.COMPLETED && phase.active === true)) {
    throw phaseError("GOAL_PHASE_STATE_CONFLICT", "A goal phase cannot be both active and completed.");
  }

  return deepFreeze(phase);
}

export function normalizeGoalPhaseCollection(phases = [], { goalId = null } = {}) {
  if (!Array.isArray(phases)) {
    throw phaseError("GOAL_PHASE_COLLECTION_INVALID", "Goal phases must be an array.");
  }
  if (phases.length === 0) return Object.freeze([]);

  const normalized = phases.map(createGoalPhase);
  const expectedGoalId = goalId ?? normalized[0].goalId;
  const ids = new Set();
  const orders = new Set();
  let activeCount = 0;

  for (const phase of normalized) {
    if (phase.goalId !== expectedGoalId) {
      throw phaseError("GOAL_PHASE_GOAL_MISMATCH", "Every phase must belong to the same goal.", {
        expectedGoalId,
        phaseGoalId: phase.goalId,
        phaseId: phase.id,
      });
    }
    if (ids.has(phase.id)) {
      throw phaseError("GOAL_PHASE_ID_DUPLICATE", "Goal phase IDs must be unique.", { phaseId: phase.id });
    }
    if (orders.has(phase.order)) {
      throw phaseError("GOAL_PHASE_ORDER_DUPLICATE", "Goal phase order values must be unique.", { order: phase.order });
    }
    ids.add(phase.id);
    orders.add(phase.order);
    if (isCommittedActiveStatus(phase.status)) activeCount += 1;
  }
  if (activeCount > 1) {
    throw phaseError("GOAL_PHASE_MULTIPLE_ACTIVE", "A goal can have no more than one active phase.");
  }

  const ordered = [...normalized].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  let highestSequenceRank = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const phase = ordered[index];
    const rank = sequenceRank(phase.status);
    if (rank < highestSequenceRank) {
      throw phaseError("GOAL_PHASE_SEQUENCE_INVALID", "Completed or skipped phases must precede active and upcoming phases.", {
        phaseId: phase.id,
        status: phase.status,
      });
    }
    highestSequenceRank = Math.max(highestSequenceRank, rank);

    const previous = ordered[index - 1];
    if (previous?.targetDate && phase.startDate && phase.startDate < previous.targetDate) {
      throw phaseError("GOAL_PHASE_DATE_SEQUENCE_INVALID", "A phase cannot start before the prior phase target date.", {
        phaseId: phase.id,
        previousPhaseId: previous.id,
      });
    }
  }

  return deepFreeze(ordered);
}

export function validateGoalPhaseCollection(phases = [], options = {}) {
  try {
    return deepFreeze({ valid: true, errors: [], phases: normalizeGoalPhaseCollection(phases, options) });
  } catch (error) {
    if (!(error instanceof GoalPhaseValidationError)) throw error;
    return deepFreeze({
      valid: false,
      errors: [{ code: error.code, message: error.message, details: error.details }],
      phases: null,
    });
  }
}

export function resolveGoalPhases(goal = {}) {
  if (!goal || typeof goal !== "object" || Array.isArray(goal) || !isNonEmptyText(goal.id)) {
    throw phaseError("GOAL_PHASE_COMPATIBILITY_GOAL_INVALID", "A goal with a stable ID is required for phase-aware presentation.");
  }
  if (Array.isArray(goal.phases) && goal.phases.length > 0) {
    return normalizeGoalPhaseCollection(goal.phases, { goalId: goal.id });
  }

  const completed = goal.status === "completed";
  const implicit = createGoalPhase({
    id: `goal_phase_${normalizeIdPart(goal.id)}_implicit`,
    goalId: goal.id,
    name: isNonEmptyText(goal.title) ? goal.title.trim() : "Current Goal",
    purpose: isNonEmptyText(goal.title) ? `Represent the current ${goal.title.trim()} goal.` : "Represent the current goal.",
    status: completed ? GoalPhaseStatus.COMPLETED : GoalPhaseStatus.ACTIVE,
    order: 0,
    startDate: validDateOrNull(goal.startDate),
    targetDate: null,
    duration: null,
    timingMode: GoalPhaseTimingMode.COMPLETION_CRITERIA,
    successCriteria: [],
    guardrails: [],
    transitionPolicy: GoalPhaseTransitionPolicy.MANUAL_REVIEW,
    createdAt: validTimestampOrNull(goal.createdAt),
    updatedAt: validTimestampOrNull(goal.updatedAt),
    implicit: true,
    sourceGoalStatus: goal.status ?? null,
  });

  return Object.freeze([implicit]);
}

function normalizeCollection(value, field) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw phaseError("GOAL_PHASE_COLLECTION_FIELD_INVALID", `Goal phase ${field} must be an array.`, { field });
  }
  return value.map((item) => structuredClone(item));
}

function normalizeDuration(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !Number.isFinite(value.value) || value.value <= 0 || !DURATION_UNITS.has(value.unit)) {
    throw phaseError("GOAL_PHASE_DURATION_INVALID", "Goal phase duration must use a positive value and a supported unit.");
  }
  return { ...structuredClone(value), value: Number(value.value), unit: value.unit };
}

function normalizeOptionalDate(value, field) {
  if (value == null || value === "") return null;
  if (!isValidDateKey(value)) {
    throw phaseError("GOAL_PHASE_DATE_INVALID", `Goal phase ${field} must be a valid YYYY-MM-DD date.`, { field });
  }
  return value;
}

function normalizeOptionalTimestamp(value, field) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw phaseError("GOAL_PHASE_TIMESTAMP_INVALID", `Goal phase ${field} must be a valid timestamp.`, { field });
  }
  return value;
}

function normalizeOptionalDateOrTimestamp(value, field) {
  if (value == null || value === "") return null;
  if (isValidDateKey(value)) return value;
  return normalizeOptionalTimestamp(value, field);
}

function assertEnum(field, value, supported, code) {
  if (!supported.has(value)) {
    throw phaseError(code, `Unsupported goal phase ${field}: ${String(value)}.`, { field, value });
  }
}

function sequenceRank(status) {
  if ([GoalPhaseStatus.COMPLETED, GoalPhaseStatus.SKIPPED, GoalPhaseStatus.SUPERSEDED].includes(status)) return 0;
  if (isCommittedActiveStatus(status) || status === GoalPhaseStatus.PAUSED) return 1;
  return 2;
}

function isCommittedActiveStatus(status) {
  return [GoalPhaseStatus.ACTIVE, GoalPhaseStatus.REVIEW_DUE, GoalPhaseStatus.REVIEW_PENDING_DECISION].includes(status);
}

function isValidDateKey(value) {
  if (typeof value !== "string" || !DATE_KEY.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validDateOrNull(value) {
  return isValidDateKey(value) ? value : null;
}

function validTimestampOrNull(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function isNonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeIdPart(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function phaseError(code, message, details = {}) {
  return new GoalPhaseValidationError(code, message, details);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
