import { createHash } from "node:crypto";
import { resolveCommittedPhaseContext } from "../services/FounderPhaseCorrectionService";

export const PRODUCTION_GOAL_CONTRACT_ADAPTER_VERSION =
  "production_goal_contract_adapter_v2";
export const PRODUCTION_EVIDENCE_DESCRIPTOR_ADAPTER_VERSION =
  "production_evidence_descriptor_adapter_v2";

export function adaptProductionGoalToCanonicalContract(goal = {}, {
  activePhase = null,
  strategyHypothesis: acceptedStrategyHypothesis = null,
  expectedTrajectory: acceptedExpectedTrajectory = null,
} = {}) {
  const phaseContext = resolveCommittedPhaseContext(goal);
  goal = phaseContext.goal;
  activePhase ??= phaseContext.activePhase;
  if (!goal.id || !goal.target?.metric || !goal.target?.direction) {
    throw incomplete("canonical_goal_objective_incomplete");
  }
  const objectiveId = `objective|${goal.id}|${machine(goal.target.metric)}`;
  const objectiveMetric = metricFor(goal.target.metric, goal.target.direction);
  const guardrails = (goal.guardrails ?? []).filter((item) => item.accepted !== false)
    .map((item) => adaptGuardrail(item, goal.id));
  const evidenceEntries = allEvidence(goal).map((item) => {
    const capability = capabilityFor(item.evidenceType);
    const guardrailRefs = guardrails.filter((guardrail) =>
      evidenceSupportsGuardrail(capability, guardrail.monitoredMetricOrCapability))
      .map((guardrail) => guardrail.guardrailId);
    return {
      evidenceMapId: item.id,
      evidenceCapability: capability,
      appliesTo: {
        objectiveRefs: item.role === "outcome" || item.role === "predictive"
          ? [objectiveId] : [],
        guardrailRefs,
        hypothesisRefs: item.role === "predictive" || item.role === "explanatory"
          ? [`hypothesis|${goal.id}|current_strategy`] : [],
        milestoneRefs: [],
      },
      role: item.role === "outcome" ? "primary" :
        item.role === "predictive" ? "supporting" : "informational",
      questionAnswered: item.explanation ?? null,
      expectedEventType: expectedEventType(capability),
      expectedCadenceOrWindow: null,
      missingEvidenceMeaning: "uncertainty_remains",
    };
  });
  const startDate = goal.timeline?.startDate ?? goal.activatedAt?.slice(0, 10) ??
    goal.startDate ?? null;
  const targetDate = goal.timeline?.targetDate ?? goal.target?.targetDate ??
    goal.targetDate ?? null;
  const strategyVersion = goal.updatedAt ?? goal.activatedAt ??
    activePhase?.updatedAt ?? "legacy_unversioned";
  const strategyHypothesis = acceptedStrategyHypothesis ?
    structuredClone(acceptedStrategyHypothesis) : {
    hypothesisId: `hypothesis|${goal.id}|current_strategy`,
    strategyRef: {
      strategyId: `strategy|${goal.id}|${machine(goal.openingApproach?.value ?? "active")}`,
      strategyVersion,
    },
    statement: machine(goal.purpose ?? goal.openingApproach?.recommendationReason ??
      "current_strategy_supports_goal"),
    assumptions: (goal.openingApproach?.known ?? []).map((item) => machine(item)),
    expectedResponses: allEvidence(goal).filter((item) => item.role === "predictive")
      .map((item) => ({ responseId: `response|${machine(item.evidenceType)}` })),
    validationConditions: [],
    falsificationConditions: [],
    expectedValidationTimeline: { startDate, targetDate },
    requiredExecutionExposure: activePhase?.duration ?? null,
  };
  const contract = {
    contractVersion: "goal_contract_v2_production_adapter_v1",
    contractId: `goal_contract|${goal.id}|${hash({
      goalId: goal.id, revision: goal.updatedAt ?? goal.activatedAt ?? null,
      target: goal.target, guardrails: goal.guardrails, phaseId: activePhase?.id ?? null,
    })}`,
    goal: {
      goalId: goal.id,
      goalVersion: goal.updatedAt ?? goal.activatedAt ?? "legacy_unversioned",
      category: goal.type ?? "unknown",
      semanticPurpose: machine(goal.purpose ?? goal.primaryOutcome ?? "goal"),
    },
    objectives: [{
      objectiveId,
      description: goal.target.description ?? goal.primaryOutcome ?? null,
      measurement: { metricOrCapability: objectiveMetric,
        measurementSourceRefs: evidenceEntries.filter((item) =>
          item.appliesTo.objectiveRefs.includes(objectiveId)).map((item) => item.evidenceMapId) },
      target: { type: goal.target.type ?? "numeric_change",
        desiredDirection: goal.target.direction,
        changeAmount: goal.target.amount ?? null,
        value: goal.target.targetValue ?? null, unit: goal.target.unit ?? null },
      completionThreshold: threshold(goal.target.direction,
        goal.target.amount ?? goal.target.targetValue),
      contradictionThreshold: contradictionThreshold(goal.target.direction),
      importance: "primary", required: true,
      associatedEvidenceMapRefs: evidenceEntries.filter((item) =>
        item.appliesTo.objectiveRefs.includes(objectiveId)).map((item) => item.evidenceMapId),
      trajectoryRef: `trajectory|${goal.id}|active_goal`,
      successCriterionRefs: (activePhase?.successCriteria ?? []).map((item) => item.key),
    }],
    guardrails,
    objectiveEvaluationPolicy: { aggregateRule: "all_required" },
    timeline: { startDate, targetCompletionDate: targetDate,
      currentPhase: activePhase ? { phaseId: activePhase.id,
        semanticPurpose: machine(activePhase.purpose ?? activePhase.name),
        status: activePhase.status,
        startedAt: activePhase.startedAt ?? activePhase.startDate ?? null,
        plannedReviewAt: activePhase.plannedReviewAt ?? null,
        reviewState: activePhase.effectiveReviewState ?? activePhase.reviewState ?? null,
        reviewMilestone: activePhase.reviewMilestone ?
          structuredClone(activePhase.reviewMilestone) : null,
        completionDecisionRequired: activePhase.completionDecisionRequired !== false } : null },
    expectedTrajectory: acceptedExpectedTrajectory ?
      structuredClone(acceptedExpectedTrajectory) : { segments: [{
      segmentId: `trajectory|${goal.id}|active_goal`,
      startBoundary: startDate,
      endBoundary: targetDate,
      measurableChangeExpectation: "expected",
      expectedObjectiveRanges: expectedRange({ goal, objectiveId, startDate, targetDate }),
    }] },
    strategyHypothesis,
    relevantEvidence: { entries: evidenceEntries },
    successCriteria: { type: "all_required_objectives_and_guardrails" },
    milestones: activePhase?.reviewMilestone
      ? [structuredClone(activePhase.reviewMilestone)] : [],
    completionRules: { rule: "objective_complete_guardrails_respected" },
    provenance: {
      sourceType: "production_goal_adapter",
      adapterVersion: PRODUCTION_GOAL_CONTRACT_ADAPTER_VERSION,
      sourceIds: [goal.id, ...(activePhase?.id ? [activePhase.id] : [])],
      inputFingerprint: `sha256_${hash(goal)}`,
      missingMetadata: guardrails.filter((item) => !item.warningThreshold ||
        !item.violationThreshold).map((item) =>
        `guardrail_thresholds:${item.guardrailId}`),
      inferredMetadata: ["objective_metric_normalization",
        ...(acceptedStrategyHypothesis ? [] : ["strategy_hypothesis_from_goal"]),
        ...(acceptedExpectedTrajectory ? [] : ["expected_trajectory_from_goal"]),
      ],
    },
  };
  return freeze(contract);
}

export function adaptDEXAEventToEvidenceDescriptors({ scan, priorScan } = {}) {
  if (!scan?.id) throw incomplete("canonical_dexa_scan_required");
  const observedAt = iso(scan.measuredAt ?? scan.date);
  return freeze([descriptor({
    id: `evidence_descriptor|dexa|${scan.id}`,
    capability: "dexa_body_composition",
    observedAt,
    strength: priorScan?.id ? "authoritative" : "high",
    independenceGroup: `dexa|${scan.id}`,
    measurements: [
      measurement("lean_mass_change_lb", delta(mass(scan.leanMass), mass(priorScan?.leanMass)), "lb", observedAt),
      measurement("fat_mass_change_lb", delta(mass(scan.fatMass), mass(priorScan?.fatMass)), "lb", observedAt),
      measurement("body_fat_pct", number(scan.bodyFatPercentage), "percent", observedAt),
      measurement("body_weight_change_lb", delta(mass(scan.totalMass), mass(priorScan?.totalMass)), "lb", observedAt),
    ].filter((item) => item.value != null),
    sourceObservationIds: [`dexa_observation|${scan.id}`],
    sourceClaimIds: [`dexa_claim|${scan.id}`],
    limitations: priorScan?.id ? [] : ["comparison_baseline_missing"],
  })]);
}

export function adaptBriefingArtifactToEvidenceDescriptors({
  artifact, authoritativeDescriptors = [], supportingDescriptors = [],
} = {}) {
  const cutoff = iso(artifact?.evidenceCutoff ??
    `${artifact?.evidenceWindow?.endDate ?? artifact?.evidenceWindow?.cutoff}T23:59:59.999Z`);
  const descriptors = [
    ...authoritativeDescriptors,
    ...supportingDescriptors,
  ];
  if (!descriptors.length) {
    descriptors.push(descriptor({
      id: `evidence_descriptor|briefing_window|${artifact.id}`,
      capability: "execution_context",
      observedAt: cutoff,
      strength: "moderate",
      independenceGroup: `briefing_window|${artifact.evidenceWindow?.id ?? artifact.id}`,
      measurements: [],
      sourceObservationIds: [],
      sourceClaimIds: artifact.briefing?.provenance?.evidenceRefs ?? [],
      limitations: ["outcome_evidence_not_present_in_normalized_context"],
    }));
  }
  return freeze(descriptors);
}

export function adaptPhotoEventToEvidenceDescriptors({ session, narrative } = {}) {
  if (!session?.id) throw incomplete("canonical_photo_session_required");
  const observedAt = iso(session.capturedAt ?? session.captureDate ?? session.date ??
    narrative?.capturedAt ?? narrative?.date);
  return freeze([{
    ...descriptor({
      id: `evidence_descriptor|photo|${session.id}`,
      capability: "progress_photos",
      observedAt,
      strength: narrative?.comparisonQuality === "low" ? "low" : "high",
      independenceGroup: `photo|${session.id}`,
      measurements: [],
      sourceObservationIds: narrative?.sourceObservationIds ?? [],
      sourceClaimIds: narrative?.sourceClaimIds ?? [],
      limitations: narrative?.limitations ?? [],
    }),
    agreement: narrative?.meaningfulGoalRelevantChange === true
      ? narrative?.direction === "conflicting" ? "contradicts" : "supports"
      : "neutral",
  }]);
}

export function isQualifyingPhotoEventInterpretation({ narrative, goalId } = {}) {
  if (narrative?.meaningfulGoalRelevantChange === true ||
      ["supporting", "conflicting"].includes(narrative?.visualEvidenceRole)) {
    return true;
  }
  return (narrative?.poseInterpretations ?? []).some((item) =>
    (!goalId || !item.goalId || item.goalId === goalId) &&
    ["primary", "supporting"].includes(item.goalRelevance) &&
    item.confidence !== "limited" &&
    (item.observations?.length ?? 0) > 0);
}

function adaptGuardrail(item, goalId) {
  const bodyFat = parseBodyFatRange(item.text ?? item.description);
  const metric = item.metric ? metricFor(item.metric) : bodyFat ? "body_fat_pct" :
    /strength/i.test(item.text ?? "") ? "training_strength_trend" :
      /recovery/i.test(item.text ?? "") ? "recovery_quality" :
        /weight gain|gain gradual/i.test(item.text ?? "") ? "body_weight_change_lb" : null;
  const explicit = item.operator && Number.isFinite(Number(item.value))
    ? { operator: item.operator, value: Number(item.value) } : null;
  return {
    guardrailId: item.id ?? `guardrail|${goalId}|${hash(item).slice(0, 12)}`,
    description: item.description ?? item.text ?? null,
    monitoredMetricOrCapability: metric,
    measurementSourceRefs: [], evaluationWindow: null,
    warningThreshold: explicit ?? (bodyFat ? { operator: "gt", value: bodyFat.max } : null),
    pressureThreshold: bodyFat ? { operator: "gt", value: bodyFat.max + 1 } : null,
    violationThreshold: explicit ?? (bodyFat ? { operator: "gt", value: bodyFat.max + 2 } : null),
    associatedEvidenceMapRefs: [], consequence: null, required: true,
  };
}
function allEvidence(goal) {
  return [...(goal.progressMeasurement?.outcomeMeasures ?? []),
    ...(goal.progressMeasurement?.predictiveSignals ?? []),
    ...(goal.progressMeasurement?.explanatorySignals ?? [])]
    .filter((item) => item?.id && item?.evidenceType && item.accepted !== false);
}
function expectedRange({ goal, objectiveId, startDate, targetDate }) {
  const amount = Number(goal.target?.amount);
  if (!Number.isFinite(amount) || !startDate || !targetDate) return [];
  return [{ expectationId: `expectation|${objectiveId}|goal_window`, objectiveRef: objectiveId,
    min: 0, max: amount, unit: goal.target.unit ?? null }];
}
function threshold(direction, value) {
  return Number.isFinite(Number(value))
    ? { operator: direction === "decrease" ? "lte" : "gte", value: Number(value) }
    : null;
}
function contradictionThreshold(direction) {
  return direction === "increase" ? { operator: "lt", value: 0 } :
    direction === "decrease" ? { operator: "gt", value: 0 } : null;
}
function capabilityFor(value) {
  const key = machine(value);
  if (key.startsWith("dexa_")) return "dexa_body_composition";
  if (key.includes("photo")) return "progress_photos";
  if (key.includes("training") || key.includes("overload")) return "training_progression";
  if (key.includes("weight")) return "body_weight_trend";
  if (["calories", "protein", "macros"].some((item) => key.includes(item))) return "energy_availability";
  if (key.includes("recovery") || key.includes("sleep")) return "recovery_capacity";
  return key;
}
function metricFor(value, direction = null) {
  const key = machine(value);
  if (key === "lean_mass" || key === "dexa_lean_mass") return "lean_mass_change_lb";
  if (key === "fat_mass" || key === "dexa_fat_mass") return "fat_mass_change_lb";
  if (key.includes("body_fat")) return "body_fat_pct";
  if (key.includes("weight")) return direction ? "body_weight_change_lb" : "body_weight_change_lb";
  return key;
}
function evidenceSupportsGuardrail(capability, metric) {
  if (capability === "dexa_body_composition" &&
      ["body_fat_pct", "fat_mass_change_lb"].includes(metric)) return true;
  if (capability === "body_weight_trend" && metric === "body_weight_change_lb") return true;
  if (capability === "training_progression" && metric === "training_strength_trend") return true;
  if (capability === "recovery_capacity" && metric === "recovery_quality") return true;
  return false;
}
function expectedEventType(capability) {
  return capability === "dexa_body_composition" ? "dexa_scan" :
    capability === "progress_photos" ? "photo_comparison" : `${capability}_summary`;
}
function descriptor(input) {
  return {
    schemaVersion: PRODUCTION_EVIDENCE_DESCRIPTOR_ADAPTER_VERSION,
    id: input.id, capability: input.capability, observedAt: input.observedAt,
    strength: input.strength, agreement: "supports",
    temporalApplicability: "applicable", independenceGroup: input.independenceGroup,
    quality: { status: "complete", provenanceIntegrity: "high",
      temporalAdequacy: "adequate", comparisonAdequacy: input.measurements.length
        ? "adequate" : "not_required", limitations: input.limitations },
    measurements: input.measurements,
    sourceObservationIds: input.sourceObservationIds,
    sourceClaimIds: input.sourceClaimIds,
  };
}
function measurement(metric, value, unit, observedAt) {
  return { metric, value, unit, observedAt };
}
function mass(value) { return number(value?.value ?? value); }
function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function delta(current, prior) {
  return current == null || prior == null ? null : Number((current - prior).toFixed(3));
}
function parseBodyFatRange(value = "") {
  const match = String(value).match(/(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s*%/u);
  return match ? { min: Number(match[1]), max: Number(match[2]) } : null;
}
function machine(value) {
  return String(value ?? "unknown").normalize("NFKD").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}
function iso(value) {
  const raw = String(value ?? "");
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T23:59:59.999Z` : raw;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) throw incomplete("evidence_timestamp_invalid");
  return new Date(parsed).toISOString();
}
function incomplete(code) {
  const error = new Error(`Production Confidence context incomplete: ${code}.`);
  error.code = code;
  return error;
}
function hash(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
