import { GoalPhaseDurationUnit } from "./goalPhase";

export const GOAL_PLANNING_SCHEMA_VERSION = "goal_planning_v1";
export const GoalPlanningTargetType = freezeEnum(["numeric_change", "numeric_absolute", "event_completion", "behavior_consistency", "qualitative", "unspecified"]);
export const GoalPlanningTargetDirection = freezeEnum(["increase", "decrease", "maintain", "complete", "consistent", "unspecified"]);
export const GoalPlanningTimelineMode = freezeEnum(["fixed_duration", "target_date", "event_date", "open_ended", "unspecified"]);
export const GoalPlanningTimelineFlexibility = freezeEnum(["firm", "adaptive", "aspirational"]);
export const GoalPlanningAmbition = freezeEnum(["conservative", "balanced", "ambitious"]);
export const GoalPlanningItemScope = freezeEnum(["overall_goal", "future_phase_candidate", "advisory_only"]);
export const GoalPlanningStageSource = freezeEnum(["user", "engine", "legacy_import"]);
export const GoalPlanningBaselineStatus = freezeEnum(["established", "partial", "not_established", "unknown"]);
export const GoalPlanningCapabilityStatus = freezeEnum(["established", "developing", "not_established", "unknown"]);
export const GoalPlanningPriorGoalStatus = freezeEnum(["active", "completed", "paused", "archived", "unknown"]);

export const GoalPlanningSignalKey = Object.freeze({
  BASELINE_REQUIRED: "baselineRequired", CALIBRATION_REQUIRED: "calibrationRequired",
  CAPACITY_BUILDING_REQUIRED: "capacityBuildingRequired", STRATEGY_CHANGES_OVER_TIME: "strategyChangesOverTime",
  SEQUENTIAL_DEPENDENCIES: "sequentialDependencies", EVENT_OR_DEADLINE: "eventOrDeadline",
  LONG_HORIZON: "longHorizon", CONTINUOUS_BEHAVIOR: "continuousBehavior",
  UNCERTAINTY: "uncertainty", USER_SUPPLIED_PHASE_INTEREST: "userSuppliedPhaseInterest",
});

const SIGNAL_KEYS = Object.values(GoalPlanningSignalKey);
const TARGET_TYPES = values(GoalPlanningTargetType);
const DIRECTIONS = values(GoalPlanningTargetDirection);
const TIMELINE_MODES = values(GoalPlanningTimelineMode);
const FLEXIBILITIES = values(GoalPlanningTimelineFlexibility);
const AMBITIONS = values(GoalPlanningAmbition);
const SCOPES = values(GoalPlanningItemScope);
const STAGE_SOURCES = values(GoalPlanningStageSource);
const BASELINE_STATUSES = values(GoalPlanningBaselineStatus);
const CAPABILITY_STATUSES = values(GoalPlanningCapabilityStatus);
const PRIOR_STATUSES = values(GoalPlanningPriorGoalStatus);
const DURATION_UNITS = new Set(Object.values(GoalPhaseDurationUnit));

export class GoalPlanningInputValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = "GoalPlanningInputValidationError"; this.code = code; this.details = deepFreeze(structuredClone(details));
  }
}

export function createGoalPlanningInput(input = {}) {
  if (!isObject(input)) throw error("GOAL_PLANNING_INPUT_INVALID", "Goal planning input must be an object.");
  const value = structuredClone(input);
  if (value.schemaVersion != null && value.schemaVersion !== GOAL_PLANNING_SCHEMA_VERSION) throw error("GOAL_PLANNING_SCHEMA_VERSION_UNSUPPORTED", "Unsupported goal planning schema version.");

  const output = {
    ...value,
    schemaVersion: GOAL_PLANNING_SCHEMA_VERSION,
    goalType: text(value.goalType), name: text(value.name), purpose: text(value.purpose), primaryOutcome: text(value.primaryOutcome),
    target: normalizeTarget(value.target), timeline: normalizeTimeline(value.timeline),
    successCriteria: normalizeItems(value.successCriteria, "criterion"), guardrails: normalizeItems(value.guardrails, "guardrail"),
    currentState: normalizeCurrentState(value.currentState), planningSignals: normalizeSignals(value.planningSignals),
    proposedStages: normalizeStages(value.proposedStages), coachingPreferences: normalizeObject(value.coachingPreferences),
    sourceContext: normalizeSourceContext(value.sourceContext),
  };
  validateTargetRequirements(output.target);
  validateDateCoherence(output.target, output.timeline);
  validateUniqueKeys([...output.successCriteria, ...output.guardrails], "GOAL_PLANNING_ITEM_KEY_DUPLICATE");
  return deepFreeze(output);
}

export function adaptDirectGoalPlanningInput(input) {
  return createGoalPlanningInput({ ...structuredClone(input), sourceContext: { ...(input?.sourceContext ?? {}), type: "direct_planning_input" } });
}

export function adaptGoalCreationDraftToPlanningInput(draft = {}) {
  return createGoalPlanningInput({
    goalType: draft.goalType ?? draft.type ?? null, name: draft.name ?? draft.title ?? null,
    purpose: draft.purpose ?? null, primaryOutcome: draft.primaryOutcome ?? draft.objective ?? null,
    target: draft.target ?? {}, timeline: draft.timeline ?? {}, successCriteria: draft.successCriteria ?? [],
    guardrails: draft.guardrails ?? [], currentState: draft.currentState ?? {}, planningSignals: draft.planningSignals ?? {},
    proposedStages: draft.proposedStages ?? [], coachingPreferences: draft.coachingPreferences ?? {},
    sourceContext: { type: "goal_creation_draft", sourceId: draft.id ?? null },
  });
}

export function adaptGoalTransitionDraftToPlanningInput(draft = {}) {
  return createGoalPlanningInput({
    goalType: draft.primaryObjective?.type ?? null, name: draft.primaryObjective?.title ?? null,
    purpose: draft.primaryObjective?.recommendationReason ?? null, primaryOutcome: draft.primaryObjective?.title ?? null,
    target: {}, timeline: {}, successCriteria: [],
    guardrails: (draft.guardrails ?? []).map((item) => ({ key: item.id ?? null, label: item.text ?? "", scope: "overall_goal", source: item.recommendationSource ?? "goal_transition_draft", required: item.accepted === true })),
    currentState: { operatingState: draft.operatingState?.value ?? null, knownConstraints: draft.operatingState?.known ?? [], uncertaintyNotes: draft.operatingState?.unknown ?? [], priorRelatedGoalStatus: draft.sourceGoalSnapshot?.status ?? "unknown" },
    planningSignals: { calibrationRequired: draft.operatingState?.value === "calibration", uncertainty: Boolean(draft.operatingState?.unknown?.length) },
    proposedStages: [], coachingPreferences: {}, sourceContext: { type: "goal_transition_draft", sourceId: draft.id ?? null, sourceGoalId: draft.sourceGoalId ?? null },
  });
}

export function adaptLegacyGoalToPlanningInput(goal = {}) {
  const targetType = goal.target?.type ?? (goal.targetValue != null ? "numeric_absolute" : goal.targetRange != null ? "qualitative" : "unspecified");
  return createGoalPlanningInput({
    goalType: goal.type ?? null, name: goal.title ?? null, purpose: goal.purpose ?? null, primaryOutcome: goal.primaryOutcome ?? goal.title ?? null,
    target: goal.target ?? { type: targetType, metric: goal.metricKey ?? null, targetValue: goal.targetValue ?? null, baselineValue: goal.startValue ?? null, unit: goal.unit ?? null, targetDate: goal.targetDate ?? null },
    timeline: goal.timeline ?? (goal.targetDate ? { mode: "target_date", startDate: goal.startDate || null, targetDate: goal.targetDate } : { mode: "unspecified", startDate: goal.startDate || null }),
    successCriteria: (goal.successCriteria ?? goal.progressMeasurement?.outcomeMeasures ?? []).map((item) => ({ key: item.key ?? item.id ?? null, label: item.label ?? item.text ?? "", description: item.description ?? item.explanation ?? null, metric: item.metric ?? item.evidenceType ?? null, operator: item.operator ?? null, value: item.value ?? null, unit: item.unit ?? null, scope: item.planningScope ?? item.scope ?? "overall_goal", source: item.planningSource ?? item.source ?? "legacy_goal", required: item.required === true || item.accepted !== false })),
    guardrails: (goal.guardrails ?? []).map((item) => ({ key: item.key ?? item.id ?? null, label: item.label ?? item.text ?? "", description: item.description ?? null, metric: item.metric ?? null, operator: item.operator ?? null, value: item.value ?? null, unit: item.unit ?? null, scope: item.planningScope ?? item.scope ?? "overall_goal", source: item.planningSource ?? item.source ?? "legacy_goal", required: item.required === true || item.accepted !== false })),
    currentState: { priorRelatedGoalStatus: supported(goal.status, PRIOR_STATUSES, "unknown") }, planningSignals: {}, proposedStages: [], coachingPreferences: goal.coachingPreferences ?? {},
    sourceContext: { type: "legacy_goal", sourceId: goal.id ?? null },
  });
}

function normalizeTarget(value = {}) {
  const item = isObject(value) ? value : {};
  const type = item.type ?? "unspecified"; assertEnum(type, TARGET_TYPES, "GOAL_PLANNING_TARGET_TYPE_UNSUPPORTED");
  const direction = item.direction ?? "unspecified"; assertEnum(direction, DIRECTIONS, "GOAL_PLANNING_TARGET_DIRECTION_UNSUPPORTED");
  return { ...item, type, metric: text(item.metric), direction, amount: numberOrNull(item.amount), unit: text(item.unit), targetValue: numberOrNull(item.targetValue), baselineValue: numberOrNull(item.baselineValue), targetDate: dateOrNull(item.targetDate, "target.targetDate"), description: text(item.description) };
}

function validateTargetRequirements(target) {
  if (target.type === "numeric_change" && target.amount == null) throw error("GOAL_PLANNING_TARGET_AMOUNT_REQUIRED", "Numeric-change targets require an amount.");
  if (target.type === "numeric_absolute" && target.targetValue == null) throw error("GOAL_PLANNING_TARGET_VALUE_REQUIRED", "Numeric absolute targets require a target value.");
}

function validateDateCoherence(target, timeline) {
  const ending = timeline.eventDate ?? timeline.targetDate ?? target.targetDate;
  if (timeline.startDate && ending && ending < timeline.startDate) throw error("GOAL_PLANNING_DATE_RANGE_INVALID", "Planning end date cannot precede the start date.");
  if (target.targetDate && timeline.targetDate && target.targetDate !== timeline.targetDate) throw error("GOAL_PLANNING_TARGET_DATE_CONFLICT", "Target and timeline target dates must agree when both are supplied.");
}

function normalizeTimeline(value = {}) {
  const item = isObject(value) ? value : {};
  const mode = item.mode ?? "unspecified"; assertEnum(mode, TIMELINE_MODES, "GOAL_PLANNING_TIMELINE_MODE_UNSUPPORTED");
  const flexibility = item.flexibility ?? null; if (flexibility != null) assertEnum(flexibility, FLEXIBILITIES, "GOAL_PLANNING_TIMELINE_FLEXIBILITY_UNSUPPORTED");
  const ambition = item.ambition ?? null; if (ambition != null) assertEnum(ambition, AMBITIONS, "GOAL_PLANNING_TIMELINE_AMBITION_UNSUPPORTED");
  const result = { ...item, mode, startDate: dateOrNull(item.startDate, "timeline.startDate"), targetDate: dateOrNull(item.targetDate, "timeline.targetDate"), duration: durationOrNull(item.duration), eventDate: dateOrNull(item.eventDate, "timeline.eventDate"), flexibility, ambition };
  if (mode === "fixed_duration" && !result.duration) throw error("GOAL_PLANNING_DURATION_REQUIRED", "Fixed-duration planning requires a duration.");
  if (mode === "target_date" && !result.targetDate) throw error("GOAL_PLANNING_TARGET_DATE_REQUIRED", "Target-date planning requires a target date.");
  if (mode === "event_date" && !result.eventDate) throw error("GOAL_PLANNING_EVENT_DATE_REQUIRED", "Event-date planning requires an event date.");
  return result;
}

function normalizeItems(value, kind) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw error("GOAL_PLANNING_COLLECTION_INVALID", `${kind} collection must be an array.`);
  return value.map((raw, index) => {
    if (!isObject(raw)) throw error("GOAL_PLANNING_ITEM_INVALID", `${kind} must be an object.`, { index });
    const scope = raw.scope ?? (kind === "guardrail" ? "overall_goal" : "overall_goal"); assertEnum(scope, SCOPES, "GOAL_PLANNING_ITEM_SCOPE_UNSUPPORTED");
    return { ...structuredClone(raw), key: text(raw.key ?? raw.id), label: text(raw.label ?? raw.text), description: text(raw.description), metric: text(raw.metric), operator: text(raw.operator), value: raw.value ?? null, unit: text(raw.unit), scope, source: text(raw.source), required: raw.required === true };
  });
}

function normalizeSignals(value = {}) {
  const item = isObject(value) ? value : {};
  const output = {};
  for (const key of SIGNAL_KEYS) output[key] = item[key] === true;
  return { ...item, ...output };
}

function normalizeStages(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw error("GOAL_PLANNING_STAGES_INVALID", "Proposed stages must be an array.");
  const stages = value.map((raw, index) => {
    if (!isObject(raw)) throw error("GOAL_PLANNING_STAGE_INVALID", "Proposed stage must be an object.", { index });
    const source = raw.source ?? (raw.userSupplied === true ? "user" : "engine"); assertEnum(source, STAGE_SOURCES, "GOAL_PLANNING_STAGE_SOURCE_UNSUPPORTED");
    const order = raw.order ?? index; if (!Number.isInteger(order) || order < 0) throw error("GOAL_PLANNING_STAGE_ORDER_INVALID", "Stage order must be a non-negative integer.");
    if (!text(raw.name) || !text(raw.purpose)) throw error("GOAL_PLANNING_STAGE_REQUIRED_FIELD_MISSING", "Proposed stage name and purpose are required.", { index });
    return { ...structuredClone(raw), name: text(raw.name), purpose: text(raw.purpose), order, timing: normalizeTimeline(raw.timing), successCriteria: normalizeItems(raw.successCriteria, "criterion"), dependencies: normalizeDependencies(raw.dependencies), source, userSupplied: raw.userSupplied === true };
  }).sort((a, b) => a.order - b.order || String(a.name).localeCompare(String(b.name)));
  const orders = new Set(); for (const stage of stages) { if (orders.has(stage.order)) throw error("GOAL_PLANNING_STAGE_ORDER_DUPLICATE", "Proposed stage order values must be unique."); orders.add(stage.order); }
  for (const stage of stages) for (const dependency of stage.dependencies) if (!stages.some((candidate) => candidate.order === dependency.order) || dependency.order >= stage.order) throw error("GOAL_PLANNING_STAGE_DEPENDENCY_INVALID", "Stage dependencies must refer to an earlier stage order.");
  return stages;
}

function normalizeCurrentState(value = {}) {
  const item = isObject(value) ? value : {};
  const baselineStatus = item.baselineStatus ?? "unknown"; assertEnum(baselineStatus, BASELINE_STATUSES, "GOAL_PLANNING_BASELINE_STATUS_UNSUPPORTED");
  const capabilityStatus = item.capabilityStatus ?? "unknown"; assertEnum(capabilityStatus, CAPABILITY_STATUSES, "GOAL_PLANNING_CAPABILITY_STATUS_UNSUPPORTED");
  const priorRelatedGoalStatus = item.priorRelatedGoalStatus ?? "unknown"; assertEnum(priorRelatedGoalStatus, PRIOR_STATUSES, "GOAL_PLANNING_PRIOR_GOAL_STATUS_UNSUPPORTED");
  return { ...item, baselineStatus, capabilityStatus, operatingState: text(item.operatingState), knownConstraints: stringArray(item.knownConstraints), uncertaintyNotes: stringArray(item.uncertaintyNotes), priorRelatedGoalStatus };
}

function normalizeSourceContext(value = {}) { const item = isObject(value) ? value : {}; return { ...item, type: text(item.type), sourceId: text(item.sourceId) }; }
function normalizeObject(value) { return isObject(value) ? structuredClone(value) : {}; }
function normalizeDependencies(value) { if (value == null) return []; if (!Array.isArray(value)) throw error("GOAL_PLANNING_STAGE_DEPENDENCIES_INVALID", "Stage dependencies must be an array."); return value.map((item) => isObject(item) ? { ...item, order: item.order } : { order: item }); }
function durationOrNull(value) { if (value == null) return null; if (!isObject(value) || !Number.isFinite(Number(value.value)) || Number(value.value) <= 0 || !DURATION_UNITS.has(value.unit)) throw error("GOAL_PLANNING_DURATION_INVALID", "Duration must have a positive value and supported unit."); return { ...value, value: Number(value.value), unit: value.unit }; }
function dateOrNull(value, field) { if (value == null || value === "") return null; if (!validDate(value)) throw error("GOAL_PLANNING_DATE_INVALID", `${field} must be a valid YYYY-MM-DD date.`); return value; }
function validDate(value) { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00.000Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }
function validateUniqueKeys(items, code) { const keys = new Set(); for (const item of items) if (item.key) { if (keys.has(item.key)) throw error(code, "Planning item local keys must be unique.", { key: item.key }); keys.add(item.key); } }
function assertEnum(value, set, code) { if (!set.has(value)) throw error(code, `Unsupported planning value: ${String(value)}.`); }
function supported(value, set, fallback) { return set.has(value) ? value : fallback; }
function numberOrNull(value) { return value == null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null; }
function stringArray(value) { return Array.isArray(value) ? value.map(text).filter(Boolean) : []; }
function text(value) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function isObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function freezeEnum(items) { return Object.freeze(Object.fromEntries(items.map((item) => [item.toUpperCase(), item]))); }
function values(object) { return new Set(Object.values(object)); }
function error(code, message, details = {}) { return new GoalPlanningInputValidationError(code, message, details); }
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
