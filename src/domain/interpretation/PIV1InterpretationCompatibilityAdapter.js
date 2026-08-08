import {
  deepFreeze,
  normalizeMachine,
  semanticHash,
  uniqueStrings,
} from "./interpretationRuntimeUtils";

export const PI_V1_INTERPRETATION_ADAPTER_VERSION =
  "pi_v1_interpretation_adapter_v1";

export function adaptPIV1ToInterpretationInput(input = {}) {
  const goal = structuredClone(input.goal ?? {});
  const assessment = structuredClone(input.assessment ?? {});
  const goalContract = input.goalContract
    ? structuredClone(input.goalContract)
    : adaptLegacyGoalToShadowContract(goal);
  const compatibility = compatibilityDiagnostics(goalContract);
  const strategySource = input.strategyHypothesis ?? goal.strategyHypothesis ??
    goalContract.strategyHypothesis;
  const strategyHypothesis = adaptPIV1StrategyToInterpretationHypothesis(
    strategySource);
  if (!strategySource?.hypothesisId) {
    compatibility.missingMetadata.push("strategy_hypothesis");
  }
  const executionState = adaptPIV1ExecutionToInterpretationState(
    input.executionState);
  if (!input.executionState) compatibility.missingMetadata.push("execution_state");
  const evidenceDescriptors = input.evidenceDescriptors
    ? structuredClone(input.evidenceDescriptors)
    : adaptPIV1EvidenceToInterpretationDescriptors(assessment);
  const cutoff = input.evaluationContext?.evidenceCutoff ?? assessment.evidenceCutoff;
  if (!cutoff) throw new Error("PI V1 adapter requires an evidence cutoff.");
  return deepFreeze({
    goalContract,
    strategyHypothesis,
    executionState,
    evidenceDescriptors,
    evaluationContext: {
      type: input.evaluationContext?.type ?? "pi_v1_shadow_comparison",
      windowStart: input.evaluationContext?.windowStart ?? null,
      evidenceCutoff: new Date(cutoff).toISOString(),
      interpretedAt: new Date(input.evaluationContext?.interpretedAt ?? cutoff)
        .toISOString(),
      priorInterpretationId: input.evaluationContext?.priorInterpretationId ?? null,
      trajectorySegmentId: input.evaluationContext?.trajectorySegmentId ?? null,
      elapsedTimeAdequacy: input.evaluationContext?.elapsedTimeAdequacy ?? "unknown",
    },
    compatibility: {
      adapterVersion: PI_V1_INTERPRETATION_ADAPTER_VERSION,
      sourceAssessmentId: assessment.id ?? null,
      missingMetadata: uniqueStrings(compatibility.missingMetadata),
      inferredMetadata: [],
      ignoredLegacyFields: ["score", "primaryReason", "coachingImplication"],
    },
  });
}

export function adaptPIV1StrategyToInterpretationHypothesis(value = null) {
  if (!value?.hypothesisId) {
    return {
      hypothesisId: null,
      strategyRef: null,
      statement: null,
      assumptions: [],
      expectedResponses: [],
      validationConditions: [],
      falsificationConditions: [],
      expectedValidationTimeline: null,
      requiredExecutionExposure: null,
    };
  }
  return {
    hypothesisId: value.hypothesisId,
    strategyRef: structuredClone(value.strategyRef ?? null),
    statement: value.statement ?? null,
    assumptions: structuredClone(value.assumptions ?? []),
    expectedResponses: structuredClone(value.expectedResponses ?? []),
    validationConditions: structuredClone(value.validationConditions ?? []),
    falsificationConditions: structuredClone(value.falsificationConditions ?? []),
    expectedValidationTimeline: structuredClone(
      value.expectedValidationTimeline ?? null),
    requiredExecutionExposure: structuredClone(
      value.requiredExecutionExposure ?? null),
  };
}

export function adaptPIV1ExecutionToInterpretationState(value = null) {
  return {
    adequacy: value?.adequacy ?? "unknown",
    elapsedTimeAdequacy: value?.elapsedTimeAdequacy ?? "unknown",
    opportunityStatus: value?.opportunityStatus ?? "unknown",
    completionStatus: value?.completionStatus ?? "unknown",
    consistencyStatus: value?.consistencyStatus ?? "unknown",
    deviationRefs: uniqueStrings(value?.deviationRefs),
    refs: uniqueStrings(value?.refs),
  };
}

export function adaptLegacyGoalToShadowContract(goal = {}) {
  const missingMetadata = [];
  const target = goal.target ?? null;
  const objectiveId = target ? `compat_objective|${semanticHash({
    goalId: goal.id, target,
  }).slice(0, 20)}` : null;
  const objectives = objectiveId ? [{
    objectiveId,
    description: target.description ?? goal.primaryOutcome ?? null,
    measurement: {
      metricOrCapability: target.metric ?? goal.metricKey ?? null,
      measurementSourceRefs: [],
    },
    target: {
      type: target.type ?? "unspecified",
      desiredDirection: target.direction ?? "unspecified",
      value: target.targetValue ?? null,
      changeAmount: target.amount ?? null,
      unit: target.unit ?? goal.unit ?? null,
    },
    completionThreshold: explicitCompletionPredicate(target),
    partialCompletion: { allowed: false, evaluationMode: "unknown",
      thresholdsOrBands: [], effectOnGoalCompletion: "unknown" },
    importance: "primary",
    required: true,
    associatedEvidenceMapRefs: [],
    trajectoryRef: null,
    successCriterionRefs: [],
  }] : [];
  const guardrails = (goal.guardrails ?? []).filter((item) => item.accepted !== false)
    .map((item) => ({
      guardrailId: item.id,
      description: item.description ?? item.text ?? null,
      monitoredMetricOrCapability: item.metric ?? null,
      measurementSourceRefs: [],
      evaluationWindow: null,
      warningThreshold: item.warningThreshold ?? null,
      pressureThreshold: item.pressureThreshold ?? null,
      violationThreshold: item.violationThreshold ?? null,
      associatedEvidenceMapRefs: [],
      consequence: null,
      required: true,
    }));
  const evidenceEntries = progressMeasurementEntries(goal).map((item) => ({
    evidenceMapId: item.id,
    evidenceCapability: item.evidenceType,
    appliesTo: {
      objectiveRefs: uniqueStrings(item.objectiveRefs),
      guardrailRefs: uniqueStrings(item.guardrailRefs),
      hypothesisRefs: uniqueStrings(item.hypothesisRefs),
      milestoneRefs: [],
    },
    role: legacyEvidenceRole(item),
    questionAnswered: item.explanation ?? null,
    expectedCadenceOrWindow: null,
    missingEvidenceMeaning: "unknown",
  }));
  if (!goal.id) missingMetadata.push("goal_identity");
  if (!objectives.length) missingMetadata.push("objectives");
  if (!goal.expectedTrajectory) missingMetadata.push("expected_trajectory");
  if (!goal.strategyHypothesis) missingMetadata.push("strategy_hypothesis");
  if (!goal.successCriteria) missingMetadata.push("success_criteria");
  if (!goal.milestones) missingMetadata.push("goal_milestones");
  if (!goal.completionRules) missingMetadata.push("completion_rules");
  guardrails.forEach((item) => {
    if (!item.monitoredMetricOrCapability || !item.warningThreshold ||
        !item.violationThreshold) {
      missingMetadata.push(`guardrail_semantics:${item.guardrailId}`);
    }
  });
  evidenceEntries.forEach((item) => {
    if (![...item.appliesTo.objectiveRefs, ...item.appliesTo.guardrailRefs,
      ...item.appliesTo.hypothesisRefs].length) {
      missingMetadata.push(`evidence_relevance_target:${item.evidenceMapId}`);
    }
  });
  return {
    contractVersion: "goal_contract_v2_compat_shadow_v1",
    contractId: `goal_contract_compat|${semanticHash({ goalId: goal.id,
      revision: goal.updatedAt ?? null })}`,
    goal: {
      goalId: goal.id ?? "unknown_goal",
      goalVersion: goal.updatedAt ?? goal.revision ?? "legacy_unversioned",
      category: goal.type ?? "unknown",
      semanticPurpose: goal.purpose ?? null,
    },
    objectives,
    guardrails,
    objectiveEvaluationPolicy: { aggregateRule: objectives.length <= 1
      ? "all_required" : null },
    timeline: structuredClone(goal.timeline ?? {
      startDate: goal.startDate ?? null,
      targetCompletionDate: goal.targetDate ?? null,
    }),
    expectedTrajectory: structuredClone(goal.expectedTrajectory ?? { segments: [] }),
    strategyHypothesis: structuredClone(goal.strategyHypothesis ?? null),
    relevantEvidence: { entries: evidenceEntries },
    successCriteria: structuredClone(goal.successCriteria ?? null),
    milestones: structuredClone(goal.milestones ?? []),
    completionRules: structuredClone(goal.completionRules ?? null),
    provenance: {
      sourceType: "legacy_goal_shadow_adapter",
      sourceIds: goal.id ? [goal.id] : [],
      inputFingerprint: `sha256_${semanticHash(goal)}`,
      missingMetadata: uniqueStrings(missingMetadata),
      inferredMetadata: [],
    },
  };
}

export function adaptPIV1EvidenceToInterpretationDescriptors(assessment = {}) {
  return (assessment.contributors ?? []).map((item) => ({
    id: `compat_evidence|${semanticHash({ assessmentId: assessment.id,
      contributorId: item.id })}`,
    capability: item.domain,
    observedAt: assessment.evidenceCutoff ?? assessment.provenance?.generatedAt ?? null,
    strength: normalizeStrength(item.strength),
    agreement: ({ supporting: "supports", conflicting: "contradicts",
      neutral: "neutral", limiting: "indeterminate" })[item.direction] ??
      "indeterminate",
    temporalApplicability: "applicable",
    independenceGroup: item.canonicalEvidenceReferences?.[0]?.id ??
      item.sourceObservationIds?.[0] ?? item.id,
    quality: {
      status: item.evidenceCompleteness ?? "unknown",
      provenanceIntegrity: item.canonicalEvidenceReferences?.length
        ? "high" : "unknown",
      temporalAdequacy: "unknown",
      comparisonAdequacy: "unknown",
      limitations: [],
    },
    limitations: item.direction === "limiting" && item.reason
      ? [normalizeMachine(item.reason)] : [],
    measurements: [],
    observations: [],
    sourceObservationIds: item.sourceObservationIds ?? [],
    sourceClaimIds: item.sourceClaimIds ?? [],
  }));
}

function normalizeStrength(value) {
  return ["authoritative", "high", "moderate", "low", "insufficient"]
    .includes(value) ? value : "insufficient";
}

function explicitCompletionPredicate(target) {
  if (!target) return null;
  if (target.targetValue == null) return null;
  const operator = target.direction === "decrease" ? "lte" :
    target.direction === "increase" ? "gte" : "eq";
  return { operator, value: target.targetValue };
}

function progressMeasurementEntries(goal) {
  return [
    ...(goal.progressMeasurement?.outcomeMeasures ?? []),
    ...(goal.progressMeasurement?.predictiveSignals ?? []),
    ...(goal.progressMeasurement?.explanatorySignals ?? []),
  ].filter((item) => item?.id && item?.evidenceType && item.accepted !== false);
}

function legacyEvidenceRole(item) {
  if (item.role === "outcome") return "primary";
  if (item.role === "predictive") return "supporting";
  if (item.role === "explanatory") return "informational";
  return "informational";
}

function compatibilityDiagnostics(contract) {
  return {
    missingMetadata: [...(contract.provenance?.missingMetadata ?? [])],
  };
}
