import {
  createPISemanticFingerprint,
} from "./PILowerLevelConfidenceContracts";

export const PI_TRAINING_GOAL_CONFIDENCE_STATE_VERSION =
  "pi_training_goal_confidence_state_v1";
export const PI_TRAINING_GOAL_CONFIDENCE_STATES = Object.freeze([
  "insufficient",
  "stable",
  "broad_constructive",
  "stagnating",
  "broad_regression",
]);

export function resolvePITrainingGoalConfidenceState(input = {}) {
  validateContext(input);
  const incompleteReasons = finalizationReasons(input);
  const report = input.trainingReport;
  const categories = [...(report?.categoryObservations ?? [])]
    .map((item) => ({
      id: item.id ?? `performance|category|${item.category}`,
      category: item.category,
      status: item.status,
      exerciseCount: item.explanation_data?.exercise_count ?? 0,
      supportingSessionIds: ids(item.supporting_session_ids),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const exercises = [...(report?.exerciseObservations ?? [])]
    .map((item) => ({
      id: item.id,
      status: item.status,
      totalSessions:
        item.explanation_data?.frequency?.total_sessions ??
        item.supporting_session_ids?.length ??
        0,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const comparableCategories = categories.filter((item) =>
    item.supportingSessionIds.length >= 2 ||
    exercises.some((exercise) => exercise.totalSessions >= 2)
  );
  const count = (status) =>
    comparableCategories.filter((item) => item.status === status).length;
  let state = "insufficient";
  if (incompleteReasons.length === 0 && comparableCategories.length >= 2) {
    if (count("regressing") >= 2) state = "broad_regression";
    else if (count("improving") >= 2 && count("regressing") < 2) {
      state = "broad_constructive";
    } else if (count("plateauing") >= 2 && count("improving") < 2) {
      state = "stagnating";
    } else state = "stable";
  }
  const categoryTrendFingerprint = createPISemanticFingerprint(categories);
  const exerciseTrendFingerprint = createPISemanticFingerprint(exercises);
  const semantic = {
    interpretationVersion: PI_TRAINING_GOAL_CONFIDENCE_STATE_VERSION,
    confidenceModelVersion:
      input.confidenceModelVersion ?? "pi_goal_confidence_assessment_v1",
    goalId: input.goalId,
    phaseId: input.phaseId,
    operatingState: input.operatingState,
    canonicalSessionId: input.canonicalSessionId,
    finalizedReportId: input.finalizedReportId,
    performanceEventIds: ids(input.performanceEventIds),
    categoryTrendFingerprint,
    exerciseTrendFingerprint,
    state,
    evidenceCutoff: iso(input.evidenceCutoff),
  };
  const interpretationFingerprint = createPISemanticFingerprint(semantic);
  return deepFreeze({
    schemaVersion: PI_TRAINING_GOAL_CONFIDENCE_STATE_VERSION,
    id: `pi_training_interpretation|${interpretationFingerprint.slice(7)}`,
    ...semantic,
    direction: state === "broad_constructive"
      ? "positive"
      : state === "broad_regression"
        ? "negative"
        : state === "insufficient"
          ? "not_applicable"
          : "neutral",
    strength: ["broad_constructive", "broad_regression"].includes(state)
      ? "high"
      : state === "insufficient"
        ? "low"
        : "moderate",
    comparableCategoryCount: comparableCategories.length,
    improvingCategoryCount: count("improving"),
    plateauingCategoryCount: count("plateauing"),
    regressingCategoryCount: count("regressing"),
    incompleteReasons,
    finalized: incompleteReasons.length === 0,
    publicationEligible:
      incompleteReasons.length === 0 && state !== "insufficient",
    interpretationFingerprint,
  });
}

function finalizationReasons(input) {
  return [
    !input.canonicalSessionId ? "canonical_session_missing" : null,
    !input.analysisComplete ? "analysis_incomplete" : null,
    !input.finalizedReportId || !input.trainingReport ? "finalized_report_missing" : null,
    !input.performanceEventGenerationComplete
      ? "performance_event_generation_incomplete"
      : null,
    !input.performanceEventPersistenceComplete
      ? "performance_event_persistence_incomplete"
      : null,
    input.pendingReconciliation ? "pending_reconciliation" : null,
    !Array.isArray(input.trainingReport?.categoryObservations)
      ? "category_rollups_missing"
      : null,
  ].filter(Boolean);
}
function validateContext(input) {
  if (
    input.semanticGoalType !== "build_lean_mass" ||
    input.semanticPhaseType !== "establish_maintenance" ||
    input.operatingState !== "calibration"
  ) throw new Error("unsupported_goal_phase_operating_state");
  if (!input.goalId || !input.phaseId) throw new Error("Goal and phase IDs are required.");
}
function ids(values = []) {
  return [...new Set((values ?? []).filter(Boolean).map(String))].sort();
}
function iso(value) {
  if (!Number.isFinite(Date.parse(value))) throw new Error("evidenceCutoff is required.");
  return new Date(value).toISOString();
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
