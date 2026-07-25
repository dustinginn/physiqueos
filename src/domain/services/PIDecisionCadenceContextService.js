export const PI_DECISION_CADENCE_CONTEXT_VERSION =
  "pi_decision_cadence_context_v1";
const CADENCES = ["daily", "midweek", "weekly"];
const MAX_INPUTS = 24;

export function createPIDecisionCadenceContext(input = {}) {
  const before = structuredClone(input);
  const cadence = requiredEnum(input.cadence, CADENCES, "cadence");
  const evidenceWindow = normalizeWindow(input.evidenceWindow);
  const goalContext = resolveGoalContext(input);
  const phaseContext = resolvePhaseContext(input, goalContext);
  const candidateInputs = boundedInputs(
    input.rankedCandidates ?? [], "rankedCandidates"
  );
  const claimInputs = boundedInputs(input.claims ?? [], "claims");
  const lifecycleInputs = boundedLifecycle(input.lifecycle);
  const completenessInputs = normalizeCompleteness(input.evidenceCompleteness);
  const eventAuthority = normalizeEventAuthority(input.eventAuthority);
  const recommendationCompatibilityInputs =
    normalizeRecommendationMetadata(input.recommendationMetadata);
  const memoryInputs = normalizeMemory(input.priorDecisionMemory);
  const blockers = unique([
    ...(!goalContext.normalized ? ["goal_context_not_normalized"] : []),
    ...(!phaseContext.normalized ? ["phase_context_not_normalized"] : []),
    ...(candidateInputs.length > MAX_INPUTS ? ["candidate_inputs_unbounded"] : []),
    ...(claimInputs.length > MAX_INPUTS ? ["claim_inputs_unbounded"] : []),
  ]);
  const result = Object.freeze({
    schemaVersion: PI_DECISION_CADENCE_CONTEXT_VERSION,
    cadence,
    evidenceWindow,
    goalContext: goalContext.value,
    phaseContext: phaseContext.value,
    candidateInputs: candidateInputs.slice(0, MAX_INPUTS),
    claimInputs: claimInputs.slice(0, MAX_INPUTS),
    lifecycleInputs,
    completenessInputs,
    eventAuthority,
    recommendationCompatibilityInputs,
    memoryInputs,
    readiness: blockers.length ? "blocked" : "ready",
    blockers,
    limitations: unique([
      ...(input.limitations ?? []),
      ...goalContext.limitations,
      ...phaseContext.limitations,
      ...(recommendationCompatibilityInputs.available
        ? [] : ["structured_recommendation_metadata_unavailable"]),
    ]),
    provenance: {
      producer: "pi_decision_cadence_context_service",
      producerVersion: PI_DECISION_CADENCE_CONTEXT_VERSION,
      goalContextSource: goalContext.source,
      phaseContextSource: phaseContext.source,
      repositoryReads: 0,
      runtimeClockReads: 0,
      persistenceWrites: 0,
    },
  });
  if (JSON.stringify(input) !== JSON.stringify(before)) {
    throw new Error("Decision cadence context input mutation detected.");
  }
  return result;
}

export function safelyCreatePIDecisionCadenceContext(input = {}) {
  try {
    return {
      status: "ready",
      context: createPIDecisionCadenceContext(input),
      diagnostics: [],
    };
  } catch (error) {
    return {
      status: "blocked",
      context: null,
      diagnostics: [{
        code: "decision_cadence_context_normalization_failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
      }],
    };
  }
}

function resolveGoalContext(input) {
  if (validNormalizedGoal(input.normalizedGoalContext)) {
    return {
      value: boundedGoal(input.normalizedGoalContext),
      normalized: true,
      source: "existing_normalized_goal_context",
      limitations: [],
    };
  }
  if (input.activeGoal && typeof input.activeGoal === "object") {
    const goal = input.activeGoal;
    return {
      value: {
        activeGoalId: goal.id ?? null,
        semanticGoalType: semanticGoalType(goal),
        goalStatus: goal.status ?? "unknown",
        phaseId: input.activePhase?.id ?? activePhase(goal)?.id ?? null,
        phaseAgeBand: "unknown",
      },
      normalized: Boolean(goal.id),
      source: "explicit_cadence_goal",
      limitations: goal.id ? [] : ["active_goal_id_unavailable"],
    };
  }
  if (validNormalizedGoal(input.eventGoalContext)) {
    return {
      value: boundedGoal(input.eventGoalContext),
      normalized: true,
      source: "event_goal_context",
      limitations: [],
    };
  }
  return {
    value: {
      activeGoalId: null,
      semanticGoalType: "unknown",
      goalStatus: "unknown",
      phaseId: null,
      phaseAgeBand: "unknown",
    },
    normalized: true,
    source: "unknown_goal_context",
    limitations: ["active_goal_unavailable"],
  };
}

function resolvePhaseContext(input, goalContext) {
  if (validNormalizedPhase(input.normalizedPhaseContext)) {
    return {
      value: boundedPhase(input.normalizedPhaseContext),
      normalized: true,
      source: "existing_normalized_phase_context",
      limitations: [],
    };
  }
  const phase = input.activePhase ?? activePhase(input.activeGoal);
  if (phase && typeof phase === "object") {
    return {
      value: {
        phaseId: phase.id ?? null,
        phaseStatus: phase.status ?? "unknown",
        phaseAgeBand: goalContext.value.phaseAgeBand ?? "unknown",
      },
      normalized: true,
      source: "explicit_cadence_phase",
      limitations: phase.id ? [] : ["active_phase_id_unavailable"],
    };
  }
  if (validNormalizedPhase(input.eventPhaseContext)) {
    return {
      value: boundedPhase(input.eventPhaseContext),
      normalized: true,
      source: "event_phase_context",
      limitations: [],
    };
  }
  return {
    value: {
      phaseId: null,
      phaseStatus: "unknown",
      phaseAgeBand: "unknown",
    },
    normalized: true,
    source: "unknown_phase_context",
    limitations: ["active_phase_unavailable"],
  };
}

function boundedGoal(value) {
  return {
    activeGoalId: value.activeGoalId ?? null,
    semanticGoalType: value.semanticGoalType ?? "unknown",
    goalStatus: value.goalStatus ?? "unknown",
    phaseId: value.phaseId ?? null,
    phaseAgeBand: value.phaseAgeBand ?? "unknown",
  };
}
function boundedPhase(value) {
  return {
    phaseId: value.phaseId ?? null,
    phaseStatus: value.phaseStatus ?? "unknown",
    phaseAgeBand: value.phaseAgeBand ?? "unknown",
  };
}
function validNormalizedGoal(value) {
  return value && typeof value === "object" &&
    typeof value.semanticGoalType === "string";
}
function validNormalizedPhase(value) {
  return value && typeof value === "object" &&
    ("phaseId" in value || value.phaseAgeBand === "unknown");
}
function activePhase(goal) {
  return (goal?.phases ?? []).find((phase) => phase.status === "active") ?? null;
}
function semanticGoalType(goal) {
  const text = `${goal?.type ?? ""} ${goal?.title ?? ""}`.toLowerCase();
  if (/lean mass|build/.test(text)) return "lean_mass_gain";
  if (/fat loss|cut|visible abs/.test(text)) return "fat_loss";
  if (/maintenance|calibration/.test(text)) return "body_fat_maintenance";
  if (/performance/.test(text)) return "performance";
  return "unknown";
}
function boundedInputs(values, field) {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array.`);
  if (values.length > MAX_INPUTS) throw new Error(`${field} exceeds bounded inputs.`);
  return values.map((item) => {
    const value = item?.candidate ?? item;
    if (!value?.id) throw new Error(`${field} requires stable IDs.`);
    return structuredClone(value);
  }).sort((a, b) => a.id.localeCompare(b.id));
}
function boundedLifecycle(value = {}) {
  return {
    status: value.status ?? "unavailable",
    currentIds: unique(
      (value.currentClaims ?? value.currentAssessments ?? []).map((item) => item.id)
    ).slice(0, MAX_INPUTS),
    priorIds: unique(
      (value.transitionedPriorClaims ?? value.transitionedPriorAssessments ?? [])
        .map((item) => item.id)
    ).slice(0, MAX_INPUTS),
  };
}
function normalizeCompleteness(value = {}) {
  const allowed = ["complete", "partial", "missing", "unknown"];
  const state = (key) => allowed.includes(value[key]) ? value[key] : "unknown";
  return {
    overall: state("overall"),
    training: state("training"),
    energy: state("energy"),
    recovery: state("recovery"),
    bodyComposition: state("bodyComposition"),
  };
}
function normalizeEventAuthority(value = {}) {
  const state = typeof value === "string" ? value : value.state ?? "no_event";
  return { state, sourceId: value?.sourceId ?? null };
}
function normalizeRecommendationMetadata(value) {
  if (!value) return { available: false, compatibility: "unknown", id: null };
  const compatibility = [
    "compatible", "complementary", "conflicts", "independent", "unknown",
  ].includes(value.compatibility) ? value.compatibility : "unknown";
  return {
    available: true,
    compatibility,
    id: value.id ?? null,
    kind: value.kind ?? null,
    priority: Number.isFinite(value.priority) ? value.priority : null,
    count: Number.isInteger(value.count) ? value.count : null,
  };
}
function normalizeMemory(value) {
  return {
    available: Boolean(value),
    cadence: value?.cadence ?? null,
    decisionSnapshots: (value?.decisionSnapshots ?? []).slice(0, MAX_INPUTS)
      .map((item) => ({
        id: item.id,
        decisionKind: item.decisionKind,
        status: item.status,
        lifecycle: item.lifecycle,
      })),
  };
}
function normalizeWindow(value) {
  if (!value?.startDate || !value?.endDate || value.startDate > value.endDate) {
    throw new Error("Decision cadence context requires a bounded evidence window.");
  }
  return {
    startDate: value.startDate,
    endDate: value.endDate,
    ...(value.briefingDate ? { briefingDate: value.briefingDate } : {}),
    ...(value.timeZone ? { timeZone: value.timeZone } : {}),
  };
}
function requiredEnum(value, allowed, field) {
  if (!allowed.includes(value)) throw new Error(`Unsupported ${field}.`);
  return value;
}
function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}
