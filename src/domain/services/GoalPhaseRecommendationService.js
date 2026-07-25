import {
  GoalPhaseStatus,
  GoalPhaseTimingMode,
  GoalPhaseTransitionPolicy,
  createGoalPhase,
} from "../models/goalPhase";
import {
  GOAL_PLANNING_SCHEMA_VERSION,
  createGoalPlanningInput,
} from "../models/goalPlanningInput";

export const GoalPhaseRecommendation = Object.freeze({
  RECOMMENDED: "recommended",
  OPTIONAL: "optional",
  NOT_RECOMMENDED: "not_recommended",
});

export const GoalPhaseRecommendationConfidence = Object.freeze({
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
});

export const GoalPhaseRecommendationSignal = Object.freeze({
  BASELINE_REQUIRED: "baseline_required",
  CALIBRATION_REQUIRED: "calibration_required",
  CAPACITY_BUILDING_REQUIRED: "capacity_building_required",
  STRATEGY_CHANGES_OVER_TIME: "strategy_changes_over_time",
  LONG_HORIZON: "long_horizon",
  EVENT_OR_DEADLINE: "event_or_deadline",
  EXPLICIT_SEQUENTIAL_OBJECTIVES: "explicit_sequential_objectives",
  SINGLE_CONTINUOUS_BEHAVIOR: "single_continuous_behavior",
  INSUFFICIENT_GOAL_DETAIL: "insufficient_goal_detail",
});

const SIMPLE_HABITS = new Set(["hydration", "meditation", "daily_steps", "simple_habit"]);
const MULTI_STAGE_ARCHETYPES = new Set(["lean_mass", "running_event", "marathon", "fat_loss"]);

export function recommendGoalPhases(input = {}) {
  const goal = normalizeInput(input?.schemaVersion === GOAL_PLANNING_SCHEMA_VERSION
    ? canonicalPlanningToRecommendationInput(createGoalPlanningInput(input))
    : input);
  const signals = collectSignals(goal);

  if (signals.includes(GoalPhaseRecommendationSignal.INSUFFICIENT_GOAL_DETAIL)) {
    return result({
      recommendation: GoalPhaseRecommendation.OPTIONAL,
      confidence: GoalPhaseRecommendationConfidence.LOW,
      rationale: "There is not enough detail yet to distinguish useful phases without inventing a plan.",
      signals,
      phases: [],
    });
  }

  if (signals.includes(GoalPhaseRecommendationSignal.SINGLE_CONTINUOUS_BEHAVIOR) &&
      !hasSequentialSignal(signals)) {
    return result({
      recommendation: GoalPhaseRecommendation.NOT_RECOMMENDED,
      confidence: GoalPhaseRecommendationConfidence.HIGH,
      rationale: "This goal uses one consistent behavior, so phases would add structure without changing the strategy.",
      signals,
      phases: [],
    });
  }

  const phases = buildSuggestedPhases(goal, signals);
  if (phases.length >= 2) {
    const strongSignals = signals.filter((signal) => ![
      GoalPhaseRecommendationSignal.LONG_HORIZON,
      GoalPhaseRecommendationSignal.EVENT_OR_DEADLINE,
    ].includes(signal));
    return result({
      recommendation: strongSignals.length > 0
        ? GoalPhaseRecommendation.RECOMMENDED
        : GoalPhaseRecommendation.OPTIONAL,
      confidence: strongSignals.length > 0
        ? GoalPhaseRecommendationConfidence.HIGH
        : GoalPhaseRecommendationConfidence.MEDIUM,
      rationale: "Distinct stages change what success and execution mean over time, so a phased plan would make the sequence clearer.",
      signals,
      phases,
    });
  }

  return result({
    recommendation: GoalPhaseRecommendation.NOT_RECOMMENDED,
    confidence: GoalPhaseRecommendationConfidence.MEDIUM,
    rationale: "The supplied plan does not show enough strategic change to justify separate phases.",
    signals,
    phases: [],
  });
}

export function adaptSuggestedPhaseToGoalPhaseInput(suggestion, authoring) {
  if (!suggestion || suggestion.recommendationMetadata?.kind !== "goal_phase_suggestion") {
    throw new TypeError("A goal phase suggestion is required.");
  }
  if (!authoring?.id || !authoring?.goalId) {
    throw new TypeError("Authored phase id and goalId are required.");
  }

  return createGoalPhase({
    ...structuredClone(suggestion),
    ...structuredClone(authoring),
    status: authoring.status ?? GoalPhaseStatus.UPCOMING,
    startDate: authoring.startDate ?? null,
    createdAt: authoring.createdAt ?? null,
    updatedAt: authoring.updatedAt ?? null,
  });
}

export const GoalPhaseRecommendationService = Object.freeze({
  recommendGoalPhases,
  adaptSuggestedPhaseToGoalPhaseInput,
});

function normalizeInput(input) {
  const value = input && typeof input === "object" && !Array.isArray(input)
    ? structuredClone(input)
    : {};
  return {
    ...value,
    title: text(value.title),
    objective: text(value.objective),
    archetype: text(value.archetype)?.toLowerCase() ?? null,
    targetDate: validDate(value.targetDate) ? value.targetDate : null,
    horizonDays: positiveNumber(value.horizonDays),
    recurringBehavior: value.recurringBehavior === true,
    operationalStrategyChanges: value.operationalStrategyChanges === true,
    dependencies: array(value.dependencies),
    sequentialObjectives: array(value.sequentialObjectives),
    proposedStages: array(value.proposedStages),
    successCriteria: array(value.successCriteria),
    guardrails: array(value.guardrails),
    calibration: normalizeNeed(value.calibration),
    baseline: normalizeNeed(value.baseline),
    capacity: normalizeNeed(value.capacity),
  };
}

function canonicalPlanningToRecommendationInput(plan) {
  const targetDate = plan.timeline.targetDate ?? plan.timeline.eventDate ?? plan.target.targetDate;
  return {
    title: plan.name,
    objective: plan.primaryOutcome ?? plan.purpose,
    archetype: plan.goalType,
    targetDate,
    recurringBehavior: plan.planningSignals.continuousBehavior,
    operationalStrategyChanges: plan.planningSignals.strategyChangesOverTime,
    dependencies: plan.planningSignals.sequentialDependencies ? ["canonical_sequential_dependency"] : [],
    proposedStages: plan.proposedStages.map((stage) => ({
      name: stage.name,
      purpose: stage.purpose,
      order: stage.order,
      duration: stage.timing.duration,
      targetDate: stage.timing.targetDate ?? stage.timing.eventDate,
      successCriteria: stage.successCriteria,
    })),
    successCriteria: plan.successCriteria,
    guardrails: plan.guardrails,
    calibration: { required: plan.planningSignals.calibrationRequired },
    baseline: { required: plan.planningSignals.baselineRequired },
    capacity: { required: plan.planningSignals.capacityBuildingRequired },
    establishedHabit: plan.currentState.capabilityStatus === "not_established" ? false : undefined,
  };
}

function collectSignals(goal) {
  const signals = [];
  if (!goal.title && !goal.objective && !goal.archetype) signals.push(GoalPhaseRecommendationSignal.INSUFFICIENT_GOAL_DETAIL);
  if (goal.baseline.required) signals.push(GoalPhaseRecommendationSignal.BASELINE_REQUIRED);
  if (goal.calibration.required) signals.push(GoalPhaseRecommendationSignal.CALIBRATION_REQUIRED);
  if (goal.capacity.required) signals.push(GoalPhaseRecommendationSignal.CAPACITY_BUILDING_REQUIRED);
  if (goal.operationalStrategyChanges) signals.push(GoalPhaseRecommendationSignal.STRATEGY_CHANGES_OVER_TIME);
  if ((goal.horizonDays ?? 0) >= 90) signals.push(GoalPhaseRecommendationSignal.LONG_HORIZON);
  if (goal.targetDate) signals.push(GoalPhaseRecommendationSignal.EVENT_OR_DEADLINE);
  if (goal.dependencies.length || goal.sequentialObjectives.length || goal.proposedStages.length > 1) {
    signals.push(GoalPhaseRecommendationSignal.EXPLICIT_SEQUENTIAL_OBJECTIVES);
  }
  if (goal.recurringBehavior || SIMPLE_HABITS.has(goal.archetype)) {
    signals.push(GoalPhaseRecommendationSignal.SINGLE_CONTINUOUS_BEHAVIOR);
  }
  return [...new Set(signals)];
}

function buildSuggestedPhases(goal, signals) {
  if (goal.proposedStages.length > 1) return goal.proposedStages.map((stage, index) => phaseFromStage(stage, index));

  const phases = [];
  const initial = goal.calibration.required ? { need: goal.calibration, name: goal.calibration.name ?? "Calibrate the Baseline", signal: "calibration_required" }
    : goal.baseline.required ? { need: goal.baseline, name: goal.baseline.name ?? "Establish the Baseline", signal: "baseline_required" }
      : goal.capacity.required ? { need: goal.capacity, name: goal.capacity.name ?? "Build Capacity", signal: "capacity_building_required" }
        : null;
  if (initial) phases.push(createSuggestion({
    name: initial.name,
    purpose: initial.need.purpose ?? "Establish the conditions needed to pursue the main outcome responsibly.",
    timingMode: initial.need.duration ? GoalPhaseTimingMode.FIXED_DURATION : GoalPhaseTimingMode.COMPLETION_CRITERIA,
    duration: initial.need.duration,
    successCriteria: initial.need.successCriteria,
    transitionPolicy: initial.need.transitionPolicy ?? GoalPhaseTransitionPolicy.MANUAL_REVIEW,
    order: 0,
    basis: [initial.signal],
  }));

  if (!initial && goal.archetype === "running_event" && goal.establishedHabit === false) {
    phases.push(createSuggestion({ name: "Establish Running Consistency", purpose: "Build a repeatable running habit before event-specific progression.", timingMode: GoalPhaseTimingMode.COMPLETION_CRITERIA, successCriteria: array(goal.foundationSuccessCriteria), transitionPolicy: GoalPhaseTransitionPolicy.MANUAL_REVIEW, order: 0, basis: ["capacity_building_required"] }));
  }
  if (!initial && goal.archetype === "marathon") {
    for (const [name, purpose] of [["Base", "Establish durable aerobic consistency."], ["Build", "Progress event-specific training capacity."], ["Peak", "Reach the highest specific workload deliberately."], ["Taper", "Reduce fatigue while preserving readiness for the event."]]) {
      phases.push(createSuggestion({ name, purpose, timingMode: GoalPhaseTimingMode.COMPLETION_CRITERIA, successCriteria: [], transitionPolicy: GoalPhaseTransitionPolicy.MANUAL_REVIEW, order: phases.length, basis: ["strategy_changes_over_time"] }));
    }
    return phases;
  }

  if (phases.length || MULTI_STAGE_ARCHETYPES.has(goal.archetype) && signals.some(hasPlanningSignal)) {
    phases.push(createSuggestion({
      name: goal.outcomePhaseName ?? outcomeName(goal),
      purpose: goal.outcomePurpose ?? "Pursue the primary goal outcome using the established foundation.",
      timingMode: goal.targetDate ? GoalPhaseTimingMode.TARGET_DATE : GoalPhaseTimingMode.COMPLETION_CRITERIA,
      targetDate: goal.targetDate,
      successCriteria: goal.successCriteria,
      transitionPolicy: goal.outcomeTransitionPolicy ?? GoalPhaseTransitionPolicy.EVIDENCE_REVIEW,
      order: phases.length,
      basis: goal.targetDate ? ["event_or_deadline"] : ["explicit_sequential_objectives"],
    }));
  }
  return phases;
}

function phaseFromStage(stage, order) {
  return createSuggestion({
    name: text(stage.name) ?? `Stage ${order + 1}`,
    purpose: text(stage.purpose) ?? "Complete this distinct stage before progressing.",
    timingMode: stage.duration ? GoalPhaseTimingMode.FIXED_DURATION : validDate(stage.targetDate) ? GoalPhaseTimingMode.TARGET_DATE : GoalPhaseTimingMode.COMPLETION_CRITERIA,
    duration: normalizeDuration(stage.duration),
    targetDate: validDate(stage.targetDate) ? stage.targetDate : null,
    successCriteria: array(stage.successCriteria),
    transitionPolicy: Object.values(GoalPhaseTransitionPolicy).includes(stage.transitionPolicy) ? stage.transitionPolicy : GoalPhaseTransitionPolicy.MANUAL_REVIEW,
    order,
    basis: ["explicit_sequential_objectives"],
  });
}

function createSuggestion({ name, purpose, timingMode, duration = null, targetDate = null, successCriteria = [], transitionPolicy, order, basis }) {
  return deepFreeze({
    name, purpose, timingMode,
    duration: normalizeDuration(duration),
    targetDate: validDate(targetDate) ? targetDate : null,
    successCriteria: structuredClone(successCriteria),
    guardrails: [],
    transitionPolicy, order,
    recommendationMetadata: { kind: "goal_phase_suggestion", advisory: true, sourceSignals: [...basis] },
  });
}

function result({ recommendation, confidence, rationale, signals, phases }) {
  return deepFreeze({ recommendation, confidence, rationale, suggestedPhases: phases, sourceSignals: signals, userChoiceRequired: recommendation !== GoalPhaseRecommendation.NOT_RECOMMENDED });
}

function outcomeName(goal) {
  if (goal.archetype === "lean_mass") return "Build Lean Mass";
  if (["running_event", "marathon"].includes(goal.archetype)) return "Prepare for the Event";
  if (goal.archetype === "fat_loss") return "Pursue Fat Loss";
  return goal.title ?? "Pursue the Goal";
}

function hasSequentialSignal(signals) { return signals.some(hasPlanningSignal); }
function hasPlanningSignal(signal) { return ["baseline_required", "calibration_required", "capacity_building_required", "strategy_changes_over_time", "explicit_sequential_objectives"].includes(signal); }
function normalizeNeed(value) { const item = value && typeof value === "object" ? value : {}; return { ...item, required: item.required === true, duration: normalizeDuration(item.duration), successCriteria: array(item.successCriteria) }; }
function normalizeDuration(value) { return value && typeof value === "object" && positiveNumber(value.value) && ["days", "weeks", "months"].includes(value.unit) ? { value: Number(value.value), unit: value.unit } : null; }
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function positiveNumber(value) { return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null; }
function array(value) { return Array.isArray(value) ? structuredClone(value) : []; }
function text(value) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
