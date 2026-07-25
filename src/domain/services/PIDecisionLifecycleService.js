import {
  createPIDecisionAssessment,
  validatePIDecisionAssessment,
} from "./PIDecisionAssessmentModel";

export const PI_DECISION_LIFECYCLE_VERSION = "pi_decision_lifecycle_v1";
const CONFIDENCE = ["unevaluated", "low", "moderate", "high", "very_high"];

export function evaluatePIDecisionLifecycle(
  current,
  prior = null,
  { evaluationDate } = {}
) {
  validatePIDecisionAssessment(current);
  if (prior) validatePIDecisionAssessment(prior);
  requiredDate(evaluationDate);
  if (!prior) return withLifecycle(current, {
    state: "new",
    firstObservedDate: evaluationDate,
    lastObservedDate: evaluationDate,
    observationCount: 1,
  });
  if (prior.id !== current.id) {
    return withLifecycle(current, {
      state: "new",
      firstObservedDate: evaluationDate,
      lastObservedDate: evaluationDate,
      observationCount: 1,
    });
  }
  const state = transition(current, prior);
  return withLifecycle(current, {
    state,
    firstObservedDate: prior.lifecycle.firstObservedDate ?? evaluationDate,
    lastObservedDate: evaluationDate,
    observationCount: (prior.lifecycle.observationCount ?? 0) + 1,
  });
}

export function evaluatePIDecisionSetLifecycle(
  current = [],
  prior = [],
  options = {}
) {
  const priorById = new Map(prior.map((item) => [item.id, item]));
  const currentIds = new Set(current.map((item) => item.id));
  const currentAssessments = current.map((item) =>
    evaluatePIDecisionLifecycle(item, priorById.get(item.id) ?? null, options)
  );
  const transitionedPriorAssessments = prior
    .filter((item) => !currentIds.has(item.id))
    .map((item) => withLifecycle(item, {
      ...item.lifecycle,
      state: item.status === "supported" ? "resolved" : "retired",
      lastObservedDate: options.evaluationDate,
      observationCount: item.lifecycle.observationCount ?? 1,
    }));
  return {
    currentAssessments,
    transitionedPriorAssessments,
    diagnostics: [],
    provenance: {
      producer: "pi_decision_lifecycle_service",
      producerVersion: PI_DECISION_LIFECYCLE_VERSION,
      repositoryReads: 0,
      persistenceWrites: 0,
    },
  };
}

function transition(current, prior) {
  if (current.status === "conflicted" && prior.status !== "conflicted") {
    return "contradicted";
  }
  if (current.status === "supported" && prior.status !== "supported") {
    return "strengthened";
  }
  if (
    current.status === "insufficient" &&
    !["insufficient", "not_applicable"].includes(prior.status)
  ) return "weakened";
  if (
    CONFIDENCE.indexOf(current.confidence.level) >
    CONFIDENCE.indexOf(prior.confidence.level)
  ) return "strengthened";
  if (
    CONFIDENCE.indexOf(current.confidence.level) <
    CONFIDENCE.indexOf(prior.confidence.level)
  ) return "weakened";
  if (
    current.status === prior.status &&
    JSON.stringify(current.limitations) === JSON.stringify(prior.limitations)
  ) return "unchanged";
  return "contradicted";
}
function withLifecycle(assessment, lifecycle) {
  return createPIDecisionAssessment({ ...assessment, lifecycle });
}
function requiredDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Decision lifecycle requires explicit evaluationDate.");
  }
}
