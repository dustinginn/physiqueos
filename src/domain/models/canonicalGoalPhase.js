export const CanonicalGoalPhaseStatus = Object.freeze({
  PLANNED: "planned",
  ACTIVE: "active",
  REVIEW_DUE: "review_due",
  REVIEW_PENDING_DECISION: "review_pending_decision",
  COMPLETED: "completed",
  SUPERSEDED: "superseded",
  PAUSED: "paused",
});

export const PhaseReviewState = Object.freeze({
  NOT_REQUIRED: "not_required",
  SCHEDULED: "scheduled",
  DUE: "due",
  PENDING_DECISION: "pending_decision",
  EXTENDED: "extended",
  DECISION_COMMITTED: "decision_committed",
});

const ACTIVE_STATUSES = new Set([
  CanonicalGoalPhaseStatus.ACTIVE,
  CanonicalGoalPhaseStatus.REVIEW_DUE,
  CanonicalGoalPhaseStatus.REVIEW_PENDING_DECISION,
]);
const STATUSES = new Set(Object.values(CanonicalGoalPhaseStatus));
const REVIEW_STATES = new Set(Object.values(PhaseReviewState));
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function createCanonicalGoalPhase(input = {}, {
  allowLegacyTimingProjection = true,
  allowLegacyIncompleteLifecycle = false,
} = {}) {
  const id = text(input.phaseId ?? input.id, "phaseId");
  const goalId = text(input.goalId ?? input.GoalId, "goalId");
  const status = normalizeStatus(input.status);
  const startedAt = date(input.startedAt ?? input.startDate, "startedAt");
  const plannedReviewAt = date(
    input.plannedReviewAt ?? (allowLegacyTimingProjection
      ? legacyReviewDate(input) : null),
    "plannedReviewAt",
  );
  const reviewState = normalizeReviewState(input.reviewState, {
    status,
    plannedReviewAt,
    completionDecisionRequired: input.completionDecisionRequired,
  });
  const phase = {
    ...structuredClone(input),
    id,
    phaseId: id,
    goalId,
    order: integer(input.order, "order", 0),
    name: text(input.canonicalName ?? input.name, "canonicalName"),
    canonicalName: text(input.canonicalName ?? input.name, "canonicalName"),
    purpose: text(input.purpose, "purpose"),
    status,
    startedAt,
    startDate: startedAt,
    plannedReviewAt,
    completedAt: timestampOrDate(input.completedAt, "completedAt"),
    supersededAt: timestampOrDate(input.supersededAt, "supersededAt"),
    lastReviewedAt: timestampOrDate(input.lastReviewedAt, "lastReviewedAt"),
    reviewState,
    projectedNextPhaseStart: date(input.projectedNextPhaseStart, "projectedNextPhaseStart"),
    projectedNextReviewAt: date(input.projectedNextReviewAt, "projectedNextReviewAt"),
    completionCriteria: cloneList(input.completionCriteria ?? input.successCriteria),
    reviewMilestone: input.reviewMilestone == null ? null :
      createPhaseReviewMilestone(input.reviewMilestone),
    completionDecisionRequired: input.completionDecisionRequired !== false,
    completionDecisionId: nullableText(input.completionDecisionId),
    extensionCount: integer(input.extensionCount ?? 0, "extensionCount", 0),
    latestExtensionDecisionId: nullableText(input.latestExtensionDecisionId),
    currentRecommendedReviewAt: date(input.currentRecommendedReviewAt, "currentRecommendedReviewAt"),
    revision: integer(input.revision ?? 0, "revision", 0),
  };
  if (!allowLegacyIncompleteLifecycle) assertLifecycle(phase);
  return deepFreeze(phase);
}

export function normalizeCanonicalGoalPhases(phases = [], options = {}) {
  if (!Array.isArray(phases)) throw new TypeError("Canonical Goal phases must be an array.");
  const authoredOrders = phases.map((phase) => phase?.order);
  const useAuthoredOrders = authoredOrders.every((order) => Number.isSafeInteger(Number(order)) && Number(order) >= 0) &&
    new Set(authoredOrders.map(Number)).size === phases.length;
  const normalized = phases.map((phase, index) => createCanonicalGoalPhase({
    ...phase,
    goalId: phase?.goalId ?? phase?.GoalId ?? options.goalId,
    order: useAuthoredOrders ? Number(phase.order) : index,
    name: phase?.canonicalName ?? phase?.name ?? phase?.title ?? `Phase ${index + 1}`,
    purpose: phase?.purpose ?? `Represent ${phase?.canonicalName ?? phase?.name ?? "this phase"}.`,
  }, { ...options, allowLegacyIncompleteLifecycle: options.allowLegacyIncompleteLifecycle !== false }));
  const ids = new Set();
  const orders = new Set();
  for (const phase of normalized) {
    if (options.goalId && phase.goalId !== options.goalId) {
      throw new TypeError("Canonical Goal phase ownership does not match the Goal.");
    }
    if (ids.has(phase.id) || orders.has(phase.order)) {
      throw new TypeError("Canonical Goal phase identity and order must be unique.");
    }
    ids.add(phase.id);
    orders.add(phase.order);
  }
  if (normalized.filter((phase) => isActivePhaseStatus(phase.status)).length > 1) {
    throw new TypeError("A Goal cannot have more than one committed active phase.");
  }
  return deepFreeze([...normalized].sort((left, right) => left.order - right.order));
}

export function resolveCanonicalPhaseReviewState(phaseInput, { asOf } = {}) {
  const phase = createCanonicalGoalPhase(phaseInput);
  if (!isActivePhaseStatus(phase.status)) return phase.reviewState;
  if (phase.reviewState === PhaseReviewState.PENDING_DECISION ||
      phase.status === CanonicalGoalPhaseStatus.REVIEW_PENDING_DECISION) {
    return PhaseReviewState.PENDING_DECISION;
  }
  const key = localDateKey(asOf ?? new Date());
  if (phase.plannedReviewAt && key >= phase.plannedReviewAt) return PhaseReviewState.DUE;
  return phase.reviewState;
}

export function isActivePhaseStatus(status) {
  return ACTIVE_STATUSES.has(normalizeStatus(status));
}

export function isPlannedPhaseStatus(status) {
  return normalizeStatus(status) === CanonicalGoalPhaseStatus.PLANNED;
}

export function canonicalPhaseRevision(phase) {
  return Number.isSafeInteger(phase?.revision) && phase.revision >= 0 ? phase.revision : 0;
}

export function addLocalDays(dateKey, amount) {
  const value = date(dateKey, "dateKey");
  return new Date(Date.parse(`${value}T00:00:00.000Z`) + Number(amount) * DAY_MS)
    .toISOString().slice(0, 10);
}

function normalizeStatus(value) {
  const mapped = value === "upcoming" ? CanonicalGoalPhaseStatus.PLANNED
    : value === "skipped" ? CanonicalGoalPhaseStatus.SUPERSEDED
      : value;
  if (!STATUSES.has(mapped)) throw new TypeError(`Unsupported canonical phase status: ${String(value)}.`);
  return mapped;
}

function normalizeReviewState(value, context) {
  const fallback = context.status === CanonicalGoalPhaseStatus.COMPLETED ||
      context.status === CanonicalGoalPhaseStatus.SUPERSEDED
    ? PhaseReviewState.DECISION_COMMITTED
    : context.plannedReviewAt ? PhaseReviewState.SCHEDULED
      : context.completionDecisionRequired === false ? PhaseReviewState.NOT_REQUIRED
        : PhaseReviewState.SCHEDULED;
  const normalized = value ?? fallback;
  if (!REVIEW_STATES.has(normalized)) throw new TypeError(`Unsupported phase review state: ${String(normalized)}.`);
  return normalized;
}

function legacyReviewDate(phase) {
  if (phase.timingMode === "target_date") return phase.targetDate ?? null;
  if (phase.timingMode !== "fixed_duration" || !phase.startDate || !phase.duration) return null;
  const multiplier = phase.duration.unit === "weeks" ? 7 : phase.duration.unit === "days" ? 1 : null;
  if (!multiplier || !Number.isFinite(Number(phase.duration.value))) return null;
  return addLocalDays(phase.startDate, Number(phase.duration.value) * multiplier);
}

function assertLifecycle(phase) {
  if (phase.status === CanonicalGoalPhaseStatus.COMPLETED && !phase.completedAt) {
    throw new TypeError("A completed canonical phase requires completedAt.");
  }
  if (phase.status === CanonicalGoalPhaseStatus.PLANNED && phase.completedAt) {
    throw new TypeError("A planned phase cannot have completedAt.");
  }
  if (phase.plannedReviewAt && phase.startedAt && phase.plannedReviewAt < phase.startedAt) {
    throw new TypeError("plannedReviewAt cannot precede startedAt.");
  }
}

function localDateKey(value) {
  if (typeof value === "string" && DATE_KEY.test(value)) return date(value, "asOf");
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new TypeError("asOf must be a valid date.");
  return parsed.toISOString().slice(0, 10);
}
function date(value, field) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !DATE_KEY.test(value) ||
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${field} must be a valid YYYY-MM-DD date.`);
  }
  return value;
}
function timestampOrDate(value, field) {
  if (value == null || value === "") return null;
  if (typeof value === "string" && DATE_KEY.test(value)) return date(value, field);
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${field} must be a valid date or timestamp.`);
  }
  return value;
}
function text(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required.`);
  return value.trim();
}
function nullableText(value) { return value == null || value === "" ? null : text(value, "reference"); }
function integer(value, field, minimum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new TypeError(`${field} must be an integer of at least ${minimum}.`);
  return parsed;
}
function cloneList(value) {
  if (!Array.isArray(value ?? [])) throw new TypeError("completionCriteria must be an array.");
  return structuredClone(value ?? []);
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
import { createPhaseReviewMilestone } from "./phaseReviewMilestone";
