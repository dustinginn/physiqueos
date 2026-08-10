import { createHash } from "node:crypto";
import { resolveCommittedPhaseContext } from "../services/FounderPhaseCorrectionService";

export const PRODUCTION_GOAL_CONTRACT_ADAPTER_VERSION =
  "production_goal_contract_adapter_v2";
export const PRODUCTION_EVIDENCE_DESCRIPTOR_ADAPTER_VERSION =
  "production_evidence_descriptor_adapter_v3";

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
  artifact, piEnvelope = null, authoritativeDescriptors = [],
  supportingDescriptors = [],
} = {}) {
  const cutoff = iso(artifact?.evidenceCutoff ??
    `${artifact?.evidenceWindow?.endDate ?? artifact?.evidenceWindow?.cutoff}T23:59:59.999Z`);
  const descriptors = [
    ...authoritativeDescriptors,
    ...supportingDescriptors,
    ...adaptCadencePIObservations({ artifact, piEnvelope, cutoff }),
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

export function adaptBriefingArtifactToExecutionContext({
  artifact, piEnvelope = null, cadence, operatingState = null,
} = {}) {
  const observations = cadenceObservations({ artifact, piEnvelope });
  const executionRefs = observations.filter((item) =>
    item.domain === "training" && (item.supportingEvidenceIds?.length ?? 0) > 0)
    .flatMap((item) => item.explanationData?.summary?.cadenceWindow
      ?.evidenceIds ?? item.explanationData?.cadenceWindow?.evidenceIds ??
      item.supportingEvidenceIds ?? []);
  return freeze({
    // Execution exposure and evidence completeness are separate concepts. A
    // closed cadence window with canonical Training execution can be adequate
    // even while another evidence domain remains partial.
    adequacy: artifact?.evidenceWindow?.closed !== false && executionRefs.length
      ? "adequate" : "unknown",
    elapsedTimeAdequacy: cadence === "midweek" ? "partial" : "adequate",
    refs: [...new Set(executionRefs.map(String))].sort(),
    operatingState,
    evidenceCompleteness: cadenceEvidenceCompleteness({ artifact, piEnvelope }),
  });
}

function cadenceEvidenceCompleteness({ artifact, piEnvelope }) {
  const explicit = piEnvelope?.evidenceCompleteness;
  if (explicit) return normalizeCadenceCompleteness(explicit);
  const weekly = artifact?.briefing?.weeklyNarrative?.context
    ?.evidenceCompleteness;
  if (weekly) return normalizeCadenceCompleteness(weekly);
  const midweek = artifact?.briefing?.evidenceCompleteness;
  if (midweek) return normalizeCadenceCompleteness(midweek);
  const coverage = piEnvelope?.coverage;
  return coverage ? normalizeCadenceCompleteness(coverage) : {
    overall: "unknown", domains: {},
  };
}

function normalizeCadenceCompleteness(value) {
  if (typeof value === "string") return { overall: completenessState(value),
    domains: {} };
  const domains = Object.fromEntries(Object.entries(value ?? {})
    .filter(([key]) => key !== "overall")
    .map(([key, state]) => [key, completenessState(state)]));
  const states = Object.values(domains);
  const overall = value?.overall ? completenessState(value.overall) :
    states.length && states.every((state) => state === "complete")
      ? "complete"
      : states.some((state) => ["complete", "partial"].includes(state))
        ? "partial" : "unknown";
  return { overall, domains };
}

function completenessState(value) {
  if (typeof value === "string") {
    return ({ available: "complete", complete: "complete", partial: "partial",
      missing: "missing", unavailable: "missing", unknown: "unknown" })[
      value] ?? "unknown";
  }
  if (!value || typeof value !== "object") return "unknown";
  if (typeof value.state === "string") return completenessState(value.state);
  const expected = Number(value.expectedDays);
  const complete = Number(value.completeDays ?? value.observedDays ??
    value.sessions);
  if (Number.isFinite(expected) && expected > 0 && Number.isFinite(complete)) {
    return complete >= expected ? "complete" : complete > 0 ? "partial" : "missing";
  }
  return "unknown";
}

function adaptCadencePIObservations({ artifact, piEnvelope, cutoff }) {
  const observations = cadenceObservations({ artifact, piEnvelope });
  const selected = [
    selectObservation(observations, "training", [
      (item) => item.id === "performance|overall|resistance",
      (item) => item.kind === "training_performance" &&
        item.subject?.type === "overall",
    ]),
    selectObservation(observations, "energy", [
      (item) => item.kind === "energy_balance",
    ]),
    selectObservation(observations, "weight", [
      (item) => item.kind === "weight_average_change",
    ]),
    selectObservation(observations, "recovery", [
      (item) => item.kind === "recovery_state",
      (item) => item.kind === "recovery_insufficient_evidence",
    ]),
  ].filter(Boolean);
  const claims = selectedCadenceClaims({ artifact, piEnvelope });
  const descriptors = selected.map((item) => cadenceDescriptor({
    item,
    cutoff,
    sourceClaimIds: claims.filter((claim) =>
      claim.participatingDomains?.includes(item.domain))
      .map((claim) => claim.id),
  }));
  const photo = cadencePhotoDescriptor({
    observations, cutoff,
    sourceClaimIds: claims.filter((claim) =>
      claim.participatingDomains?.includes("photos")).map((claim) => claim.id),
  });
  return photo ? [...descriptors, photo] : descriptors;
}

function cadenceObservations({ artifact, piEnvelope }) {
  const values = piEnvelope?.observations ??
    artifact?.briefing?.weeklyNarrative?.context?.pi?.observations ?? [];
  return Array.isArray(values) ? values : [];
}

function selectedCadenceClaims({ artifact, piEnvelope }) {
  const selection = piEnvelope?.selection ?? piEnvelope?.rankedClaims ??
    artifact?.briefing?.weeklyNarrative?.context?.pi?.rankedClaims ?? {};
  return ["primary", "supporting", "background"].flatMap((key) =>
    (selection?.[key] ?? []).map((entry) => entry?.candidate ?? entry))
    .filter((item) => item?.id);
}

function selectObservation(values, domain, preferences) {
  const candidates = values.filter((item) => item?.domain === domain);
  for (const preference of preferences) {
    const match = candidates.find(preference);
    if (match) return match;
  }
  return null;
}

function cadenceDescriptor({ item, cutoff, sourceClaimIds }) {
  const limitations = [...new Set([
    ...(item.confidence?.limitations ?? []),
    ...(item.explanationData?.limitations ?? []),
  ].filter(Boolean).map(String))].sort();
  return {
    schemaVersion: PRODUCTION_EVIDENCE_DESCRIPTOR_ADAPTER_VERSION,
    id: `evidence_descriptor|cadence_pi|${item.id}`,
    capability: cadenceCapability(item.domain),
    observedAt: iso(item.evidenceWindow?.endDate ?? cutoff),
    strength: cadenceStrength(item.confidence?.level),
    agreement: cadenceAgreement(item),
    temporalApplicability: "applicable",
    independenceGroup: `cadence_pi|${item.domain}|${
      item.evidenceWindow?.startDate ?? "unknown"}|${
      item.evidenceWindow?.endDate ?? "unknown"}`,
    quality: {
      status: item.status === "insufficient_data" ? "limited" : "complete",
      provenanceIntegrity: item.provenance?.producer ? "high" : "adequate",
      temporalAdequacy: "adequate",
      comparisonAdequacy: hasComparison(item) ? "adequate" : "not_required",
      limitations,
    },
    measurements: cadenceMeasurements(item, cutoff),
    sourceObservationIds: [item.id],
    sourceClaimIds: [...new Set(sourceClaimIds.map(String))].sort(),
    sourceEvidenceIds: cadenceSourceEvidenceIds([item]),
  };
}

function cadencePhotoDescriptor({ observations, cutoff, sourceClaimIds }) {
  const values = observations.filter((item) =>
    item?.domain === "photos" &&
    item.kind !== "photo_comparability" &&
    item.kind !== "photo_insufficient_comparison" &&
    item.status !== "insufficient_data" &&
    ["high", "moderate", "low"].includes(item.confidence?.level));
  if (!values.length) return null;
  const sourceObservationIds = [...new Set(values.map((item) => item.id))].sort();
  const limitations = [...new Set(values.flatMap((item) => [
    ...(item.confidence?.limitations ?? []),
    ...(item.explanationData?.limitations ?? []),
  ]).filter(Boolean).map(String))].sort();
  const dates = values.map((item) => item.evidenceWindow?.endDate)
    .filter(Boolean).sort();
  const windowStarts = values.map((item) => item.evidenceWindow?.startDate)
    .filter(Boolean).sort();
  return {
    schemaVersion: PRODUCTION_EVIDENCE_DESCRIPTOR_ADAPTER_VERSION,
    id: `evidence_descriptor|cadence_pi|photos|${
      hash(sourceObservationIds).slice(0, 16)}`,
    capability: "progress_photos",
    observedAt: iso(dates.at(-1) ?? cutoff),
    strength: weakestCadenceStrength(values.map((item) =>
      cadenceStrength(item.confidence?.level))),
    agreement: cadencePhotoAgreement(values),
    temporalApplicability: "applicable",
    // A cadence window receives one visual vote regardless of pose or metric
    // count. Photo Event publication remains a separate occurrence boundary.
    independenceGroup: `cadence_pi|photos|${windowStarts[0] ?? "unknown"}|${
      dates.at(-1) ?? "unknown"}`,
    quality: {
      status: "complete",
      provenanceIntegrity: values.every((item) => item.provenance?.producer)
        ? "high" : "adequate",
      temporalAdequacy: "adequate",
      comparisonAdequacy: "adequate",
      limitations,
    },
    measurements: [],
    sourceObservationIds,
    sourceClaimIds: [...new Set(sourceClaimIds.map(String))].sort(),
    sourceEvidenceIds: cadenceSourceEvidenceIds(values),
  };
}

function cadenceCapability(domain) {
  return ({ training: "training_progression", energy: "energy_availability",
    weight: "body_weight_trend", recovery: "recovery_capacity" })[domain];
}

function cadenceStrength(value) {
  return ({ very_high: "high", high: "high", moderate: "moderate",
    low: "low" })[value] ?? "insufficient";
}

function cadenceAgreement(item) {
  if (item.domain !== "training") return "indeterminate";
  if (item.status === "improving" && item.direction === "positive") {
    return "supports";
  }
  if (item.status === "regressing" && item.direction === "negative") {
    return "contradicts";
  }
  return "neutral";
}

function cadencePhotoAgreement(values) {
  const roles = values.map((item) => {
    const direction = item.direction;
    if (item.kind === "photo_whole_body_softness_change") {
      return direction === "falling" ? "supports" :
        direction === "rising" ? "contradicts" : "neutral";
    }
    if (["photo_leanness_change", "photo_abdominal_definition_change",
      "photo_muscularity_change"].includes(item.kind)) {
      return direction === "rising" ? "supports" :
        direction === "falling" ? "contradicts" : "neutral";
    }
    if (item.kind === "photo_visual_stability" && direction === "stable") {
      return "supports";
    }
    return "neutral";
  });
  const supporting = roles.includes("supports");
  const contradicting = roles.includes("contradicts");
  return supporting && contradicting ? "indeterminate" :
    supporting ? "supports" : contradicting ? "contradicts" : "neutral";
}

function weakestCadenceStrength(values) {
  const rank = { insufficient: 0, low: 1, moderate: 2, high: 3,
    authoritative: 4 };
  return values.reduce((result, value) =>
    rank[value] < rank[result] ? value : result, values[0] ?? "insufficient");
}

function cadenceSourceEvidenceIds(values) {
  return [...new Set(values.flatMap((item) => [
    ...(item.provenance?.sourceEvidenceIds ?? []),
    ...(item.supportingEvidenceIds ?? []),
  ]).filter(Boolean).map(String))].sort();
}

function hasComparison(item) {
  return Boolean(item.evidenceWindow?.comparisonStartDate ||
    Number.isFinite(Number(item.explanationData?.comparisonSampleCount)));
}

function cadenceMeasurements(item, cutoff) {
  const data = item.explanationData ?? {};
  const observedAt = iso(item.evidenceWindow?.endDate ?? cutoff);
  if (item.domain === "weight" && Number.isFinite(Number(data.absoluteChange))) {
    return [measurement("body_weight_change_lb", Number(data.absoluteChange),
      data.unit ?? "lb", observedAt)];
  }
  return [];
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
