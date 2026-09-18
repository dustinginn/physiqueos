import { deriveCanonicalGoalProgress } from "../confidence/GoalProgressContextService.js";
import { createEvidenceObservationV3 } from "./v3/EvidenceObservationV3.js";
import { createGoalContractV3 } from "./v3/GoalContractV3.js";

const METRIC_CAPABILITIES = Object.freeze({
  lean_mass: "body_composition.lean_mass",
  dexa_lean_mass: "body_composition.lean_mass",
  fat_mass: "body_composition.fat_mass",
  dexa_fat_mass: "body_composition.fat_mass",
  body_fat: "body_composition.body_fat_percentage",
  body_fat_percentage: "body_composition.body_fat_percentage",
  total_mass: "body_mass.level",
  dexa_weight: "body_mass.level",
  weight: "body_mass.level",
});

export function buildProductionConfidenceNarrativeV3Input({
  goal,
  phase,
  store,
  evidenceCutoff,
} = {}) {
  const goalContract = buildGoalContractV3FromCanonical({
    goal, phase, store, evidenceCutoff,
  });
  const observations = createCanonicalEvidenceObservationsV3({
    goalContract, goal, phase, store, evidenceCutoff,
  });
  return Object.freeze({ goalContract, observations });
}

export function buildGoalContractV3FromCanonical({
  goal,
  phase,
  store,
  evidenceCutoff,
} = {}) {
  if (!goal?.id) throw new Error("A canonical Goal is required.");
  if (!phase?.id) throw new Error("A canonical Phase is required.");
  const configured = goal.goalContractV3 ?? goal.strategicContractV3 ??
    goal.confidenceV3Contract ?? null;
  if (configured?.schemaVersion === "goal_contract_v3") {
    if (configured.goalId !== goal.id) {
      throw new Error("Configured Goal Contract V3 belongs to a different Goal.");
    }
    if (configured.phase?.phaseId && configured.phase.phaseId !== phase.id) {
      throw new Error("Configured Goal Contract V3 belongs to a different Phase.");
    }
    return configured;
  }
  if (configured) {
    return createGoalContractV3({
      ...configured,
      goalId: goal.id,
      phase: { ...configured.phase, phaseId: phase.id },
    });
  }

  const target = goal.target ?? {};
  const metric = machine(target.metric);
  const capability = target.capabilityId ?? METRIC_CAPABILITIES[metric] ??
    (metric ? `custom.${metric}` : null);
  if (!capability) {
    throw new Error("Canonical Goal requires a configured V3 contract or target capability.");
  }
  const progress = deriveCanonicalGoalProgress({
    goal,
    canonicalStore: store,
    activePhase: phase,
    asOf: evidenceCutoff,
  });
  const strategyRevisionId = resolveStrategyRevisionId(goal, phase);
  const baseline = number(target.baselineValue ?? goal.baseline?.value ??
    progress.baseline?.value);
  const targetValue = resolveTargetValue(target, baseline);
  const direction = ["increase", "decrease"].includes(target.direction)
    ? target.direction : null;
  const maintenanceRange = normalizeRange(target.targetRange ??
    target.maintenanceRange);
  const mode = maintenanceRange ? "maintain_range" :
    direction === "decrease" ? "decrease" :
      direction === "increase" ? "increase" :
        target.mode === "stability" ? "stability" : "custom_declarative";
  if (mode === "custom_declarative" && !target.predicate) {
    throw new Error("Non-scalar Goals require an explicit declarative V3 contract.");
  }
  const objectiveId = target.objectiveId ?? `objective|${capability}`;
  const successCriteria = target.successCriteria ?? scalarSuccessCriteria({
    direction, targetValue, maintenanceRange,
  });
  const forecast = createForecast({
    target, goal, baseline, targetValue, direction, maintenanceRange,
  });
  const configuredGuardrails = goal.v3Guardrails ?? goal.guardrailsV3 ?? [];
  const guardrails = configuredGuardrails.map((guardrail, index) =>
    normalizeConfiguredGuardrail(guardrail, index));
  const policies = [
    {
      policyId: `objective_direct|${objectiveId}`,
      subjectType: "objective",
      subjectId: objectiveId,
      capabilityPattern: capability,
      role: "decisive",
      minimumQuality: "adequate",
      participation: "DIRECT_CONFIDENCE_INPUT",
      usableFor: ["objective", "trajectory", "feasibility"],
    },
    {
      policyId: `strategy_outcome|${objectiveId}`,
      subjectType: "strategy",
      subjectId: strategyRevisionId,
      capabilityPattern: capability,
      role: "decisive",
      minimumQuality: "adequate",
      participation: "PERSISTENCE_CONFIRMATION_INPUT",
      usableFor: ["feasibility", "persistence", "attribution"],
    },
    ...guardrails.map((guardrail) => ({
      policyId: `guardrail|${guardrail.guardrailId}`,
      subjectType: "guardrail",
      subjectId: guardrail.guardrailId,
      capabilityPattern: guardrail.metricCapability.id ??
        guardrail.metricCapability,
      role: "material",
      minimumQuality: "adequate",
      participation: "GUARDRAIL",
      usableFor: ["guardrail"],
    })),
    ...(goal.evidencePoliciesV3 ?? []),
  ];
  return createGoalContractV3({
    goalId: goal.id,
    contractVersion: goal.goalContractVersion ?? goal.version ?? "canonical_v1",
    goalLabel: goal.title ?? goal.name ?? "Active Goal",
    phase: {
      phaseId: phase.id,
      label: phase.title ?? phase.name ?? null,
      startedAt: phase.startedAt ?? phase.startDate ?? null,
      nextPhaseLabel: phase.nextPhaseLabel ?? null,
      transitionCriteria: phase.transitionCriteriaV3 ?? [],
    },
    strategy: {
      strategyRevisionId,
      label: phase.strategyLabel ?? goal.strategyLabel ?? "the current plan",
      adequateExposure: {
        minimumDays: number(phase.minimumStrategyExposureDays ??
          goal.minimumStrategyExposureDays) ?? 0,
      },
      coachingActions: goal.safeCoachingActionsV3 ?? [],
      feasibilityCriteria: [{
        source: "objective",
        subjectId: objectiveId,
        acceptedStates: maintenanceRange
          ? ["stable_success", "satisfied"]
          : ["progressed", "satisfied"],
        minimumAuthority: "material",
        minimumSignificance: maintenanceRange ? "none" : "meaningful",
      }],
    },
    objectives: [{
      objectiveId,
      priority: "primary",
      importance: 1,
      metricCapability: {
        namespace: capability.split(".")[0],
        key: capability.split(".").slice(1).join("."),
        valueKind: maintenanceRange ? "scalar" : "scalar",
        canonicalUnit: target.unit ?? null,
        displayName: target.displayName ?? humanize(metric),
      },
      evaluation: {
        mode,
        baselineValue: baseline,
        targetValue,
        targetRange: maintenanceRange,
        desiredDirection: direction,
        meaningfulChangeThreshold: number(target.meaningfulChangeThreshold) ?? 0,
        significanceBands: target.significanceBands ?? [],
        successCriteria,
        exceededCriteria: target.exceededCriteria ?? [],
        predicate: target.predicate ?? null,
      },
      vocabularyKey: target.vocabularyKey ?? objectiveId,
      forecast,
    }],
    guardrails,
    strategicQuestions: goal.strategicQuestionsV3 ??
      defaultStrategicQuestions(strategyRevisionId),
    evidencePolicies: policies,
    evidenceRequests: goal.evidenceRequestsV3 ?? [],
    objectiveDecisionPolicy: goal.objectiveDecisionPolicyV3 ??
      { mode: "all_required" },
    achievementPolicy: goal.achievementPolicyV3 ??
      { onAchieved: "transition_goal" },
    narrativePolicy: goal.narrativePolicyV3 ?? { recentEventHours: 24 },
    vocabulary: goal.v3Vocabulary ?? {
      goal: { displayName: goal.title ?? goal.name ?? "the active goal" },
      objective: {
        displayName: target.displayName ?? humanize(metric),
        unit: target.unit ?? null,
        ongoingPhrase: "the current response",
      },
      phase: { displayName: phase.title ?? phase.name ?? "the current phase" },
      strategy: { displayName: phase.strategyLabel ?? "the current plan" },
      evidence: {},
    },
  });
}

export function createCanonicalEvidenceObservationsV3({
  goalContract,
  goal,
  phase,
  store,
  evidenceCutoff,
} = {}) {
  const cutoff = timestamp(evidenceCutoff, "evidenceCutoff");
  const observations = [
    ...adaptCanonicalDexaScans({ goalContract, phase, scans: store?.dexaScans, cutoff }),
    ...adaptCanonicalWeightEntries({ goalContract, phase, entries: store?.weightEntries, cutoff }),
    ...adaptCanonicalPhotoObservations({ goalContract, phase, store, cutoff }),
    ...(store?.v3EvidenceObservations ?? []),
  ];
  const byId = new Map();
  for (const input of observations) {
    const observation = input?.schemaVersion === "evidence_observation_v3"
      ? input : createEvidenceObservationV3(input);
    if (Date.parse(observation.observedAt) <= Date.parse(cutoff)) {
      byId.set(observation.observationId, observation);
    }
  }
  return Object.freeze([...byId.values()].sort((left, right) =>
    left.observedAt.localeCompare(right.observedAt) ||
    left.observationId.localeCompare(right.observationId)));
}

export function adaptCanonicalDexaScans({
  goalContract,
  phase,
  scans = [],
  cutoff,
} = {}) {
  const active = scans.filter((scan) => isActive(scan) &&
    observedAt(scan) && Date.parse(observedAt(scan)) <= Date.parse(cutoff))
    .sort((left, right) => observedAt(left).localeCompare(observedAt(right)));
  return active.map((scan, index) => {
    const prior = active[index - 1] ?? null;
    const currentAt = observedAt(scan);
    const priorAt = prior ? observedAt(prior) : null;
    return createEvidenceObservationV3({
      observationId: scan.id,
      canonicalRecordId: scan.id,
      sourceType: "canonical_dexa",
      displayLabel: scan.displayLabel ?? "Body-composition scan",
      observedAt: currentAt,
      status: scan.status ?? "active",
      relatedGoalIds: scan.relatedGoalIds ?? [],
      phaseId: scan.phaseId ?? null,
      strategyRevisionId: revisionForObservation(goalContract, currentAt),
      highSalienceEvent: true,
      evidenceWindow: priorAt ? {
        startDate: priorAt.slice(0, 10),
        endDate: currentAt.slice(0, 10),
      } : null,
      directness: "direct",
      quality: {
        status: prior ? "robust" : "adequate",
        provenance: "canonical_dexa_record",
        precision: "reported",
        completeness: "canonical_measurements",
        comparability: prior ? "canonical_comparison" : "baseline_only",
        coverageRatio: 1,
      },
      exposureDays: priorAt ? daysBetween(priorAt, currentAt) :
        daysBetween(goalContract.phase.startedAt, currentAt),
      capabilities: [
        measure("body_mass.level", mass(scan.totalMass), mass(prior?.totalMass), "lb", priorAt, "Total mass"),
        measure("body_composition.lean_mass", mass(scan.leanMass), mass(prior?.leanMass), "lb", priorAt, "Lean tissue"),
        measure("body_composition.fat_mass", mass(scan.fatMass), mass(prior?.fatMass), "lb", priorAt, "Fat mass"),
        measure("body_composition.body_fat_percentage", number(scan.bodyFatPercentage), number(prior?.bodyFatPercentage), "%", priorAt, "Body fat"),
      ].filter((item) => item.value != null),
      limitations: scan.limitations ?? [],
      sourceReferences: [scan.id],
    });
  });
}

export function adaptCanonicalPhotoObservations({
  goalContract,
  phase,
  store,
  cutoff,
} = {}) {
  const analyses = [
    ...(store?.photoAnalyses ?? []),
    ...(store?.analyses ?? []).filter((item) =>
      String(item.type ?? item.analysisType ?? "").toLowerCase().includes("photo") ||
      item.interpretation?.structured_observations),
  ];
  return analyses.flatMap((analysis) => {
    const interpreted = analysis.interpretation ?? analysis.result ?? analysis;
    const structured = interpreted.structured_observations ??
      interpreted.structuredObservations ?? [];
    if (!structured.length) return [];
    const at = observedAt(analysis) ?? timestamp(interpreted.captureDate, "photo observedAt");
    if (Date.parse(at) > Date.parse(cutoff)) return [];
    const comparable = interpreted.comparison_metadata?.comparable ??
      interpreted.comparisonMetadata?.comparable ??
      structured.some((item) => item.comparable === true ||
        item.comparability === "comparable");
    return [createEvidenceObservationV3({
      observationId: analysis.id ?? `photo_observation|${at}`,
      canonicalRecordId: analysis.canonicalEvidenceId ?? analysis.id,
      sourceType: "canonical_photo_observation",
      displayLabel: analysis.displayLabel ?? "Progress-photo comparison",
      observedAt: at,
      status: analysis.status ?? "active",
      relatedGoalIds: analysis.relatedGoalIds ?? [],
      phaseId: analysis.phaseId ?? null,
      strategyRevisionId: revisionForObservation(goalContract, at),
      highSalienceEvent: Boolean(analysis.eventId),
      evidenceWindow: interpreted.comparisonMetadata?.window ??
        interpreted.comparison_metadata?.window ?? null,
      directness: "proxy",
      quality: {
        status: comparable ? "adequate" : "insufficient",
        provenance: "canonical_structured_photo_observation",
        precision: "qualitative",
        completeness: structured.length ? "structured_observations_present" : "missing",
        comparability: comparable ? "comparable" : "not_comparable",
        coverageRatio: null,
      },
      exposureDays: number(interpreted.comparisonMetadata?.intervalDays ??
        interpreted.comparison_metadata?.interval_days) ?? 0,
      capabilities: structured.map((item) => ({
        capabilityId: `visual.${machine(item.metric ?? "unknown")}`,
        value: item.direction ?? "unknown",
        comparisonValue: null,
        change: null,
        factualSummary: item.factualSummary ?? item.observation ??
          item.summary ?? null,
        metadata: {
          direction: item.direction ?? "unknown",
          magnitude: item.magnitude ?? "unknown",
          comparability: item.comparability ?? (comparable ? "comparable" : "not_comparable"),
        },
      })),
      limitations: interpreted.limitations ?? [],
      sourceReferences: [
        ...(analysis.sourceReferences ?? []),
        ...(analysis.photoSetId ? [analysis.photoSetId] : []),
      ],
    })];
  });
}

function adaptCanonicalWeightEntries({ goalContract, entries = [], cutoff }) {
  const active = entries.filter((entry) => isActive(entry) && observedAt(entry) &&
    Date.parse(observedAt(entry)) <= Date.parse(cutoff))
    .sort((left, right) => observedAt(left).localeCompare(observedAt(right)));
  return active.map((entry, index) => {
    const prior = active[index - 1] ?? null;
    const value = number(entry.weight?.value ?? entry.value);
    if (value == null) return null;
    return createEvidenceObservationV3({
      observationId: entry.id ?? `weight|${observedAt(entry)}`,
      canonicalRecordId: entry.id ?? null,
      sourceType: "canonical_weight",
      displayLabel: "Scale weight",
      observedAt: observedAt(entry),
      status: entry.status ?? "active",
      relatedGoalIds: entry.relatedGoalIds ?? [],
      strategyRevisionId: revisionForObservation(goalContract, observedAt(entry)),
      directness: "direct",
      quality: {
        status: "adequate",
        provenance: "canonical_weight_record",
        precision: "reported",
        completeness: "single_measurement",
        comparability: prior ? "longitudinal" : "baseline_only",
      },
      exposureDays: prior ? daysBetween(observedAt(prior), observedAt(entry)) : 0,
      capabilities: [measure(
        "body_mass.level",
        value,
        number(prior?.weight?.value ?? prior?.value),
        entry.weight?.unit ?? entry.unit ?? "lb",
        prior ? observedAt(prior) : null,
        "Scale weight",
      )],
      sourceReferences: [entry.id].filter(Boolean),
    });
  }).filter(Boolean);
}

function resolveStrategyRevisionId(goal, phase) {
  return goal.currentStrategyRevision?.id ?? goal.strategyRevisionId ??
    phase.strategyRevisionId ?? phase.currentStrategyRevision?.id ??
    `phase_strategy|${phase.id}|v1`;
}

function revisionForObservation(goalContract, at) {
  const startedAt = goalContract.phase.startedAt;
  return !startedAt || Date.parse(at) >= Date.parse(startedAt)
    ? goalContract.strategy.strategyRevisionId : null;
}

function createForecast({ target, goal, baseline, targetValue, direction, maintenanceRange }) {
  if (target.forecastV3) return target.forecastV3;
  if (maintenanceRange && number(target.requiredDurationDays) > 0) {
    return {
      version: "goal_outlook_v1",
      kind: "range_duration",
      baselineValue: baseline,
      targetValue: null,
      direction: null,
      startedAt: goal.timeline?.startDate ?? null,
      deadlineAt: goal.timeline?.targetDate ?? null,
      requiredDurationDays: number(target.requiredDurationDays),
      durationCapabilityId: target.durationCapabilityId,
    };
  }
  if (baseline != null && targetValue != null && direction) {
    return {
      version: "goal_outlook_v1",
      kind: "scalar_target",
      baselineValue: baseline,
      targetValue,
      direction,
      startedAt: goal.timeline?.startDate ?? goal.startDate ?? null,
      deadlineAt: goal.timeline?.targetDate ?? null,
    };
  }
  return null;
}

function scalarSuccessCriteria({ direction, targetValue, maintenanceRange }) {
  if (maintenanceRange) return [{
    version: "declarative_predicate_v1",
    path: "current",
    operator: "between",
    min: maintenanceRange.min,
    max: maintenanceRange.max,
  }];
  if (targetValue == null || !direction) return [];
  return [{
    version: "declarative_predicate_v1",
    path: "current",
    operator: direction === "decrease" ? "lte" : "gte",
    value: targetValue,
  }];
}

function defaultStrategicQuestions(strategyRevisionId) {
  return [{
    questionId: `question|${strategyRevisionId}|feasibility`,
    kind: "feasibility",
    priority: 50,
    text: "Has the current plan produced a qualifying Goal result?",
    strategyRevisionId,
    evidencePurpose: "establish_feasibility",
    answerWhen: predicate("strategy.feasibility", "in", ["demonstrated"]),
    answerCode: "strategy_feasibility_demonstrated",
    nextQuestionOnAnswer: {
      questionId: `question|${strategyRevisionId}|persistence`,
      kind: "persistence",
      priority: 40,
      text: "Has the qualifying result repeated or held?",
      strategyRevisionId,
      evidencePurpose: "confirm_persistence",
      answerWhen: predicate("strategy.persistence", "in", ["repeated", "sustained"]),
      answerCode: "strategy_persistence_confirmed",
    },
  }, {
    questionId: `question|${strategyRevisionId}|contradiction`,
    kind: "contradiction",
    priority: 90,
    text: "Does the latest authoritative result require the plan to be reconsidered?",
    strategyRevisionId,
    evidencePurpose: "resolve_contradiction",
    raiseWhen: predicate("strategy.feasibility", "in", ["challenged", "refuted"]),
    answerWhen: predicate("strategy.feasibility", "eq", "demonstrated"),
    answerCode: "strategy_contradiction_resolved",
  }];
}

function normalizeConfiguredGuardrail(input, index) {
  if (!input?.guardrailId && !input?.id) {
    throw new Error(`Configured guardrail ${index} requires an id.`);
  }
  return {
    ...input,
    guardrailId: input.guardrailId ?? input.id,
    metricCapability: input.metricCapability ?? input.capability,
    evaluation: input.evaluation,
  };
}

function predicate(path, operator, valuesOrValue) {
  return {
    version: "declarative_predicate_v1",
    path,
    operator,
    ...(Array.isArray(valuesOrValue)
      ? { values: valuesOrValue } : { value: valuesOrValue }),
  };
}

function measure(capabilityId, value, comparisonValue, unit, comparisonAt, label) {
  return {
    capabilityId,
    value,
    comparisonValue,
    comparisonAt,
    change: value != null && comparisonValue != null
      ? Number((value - comparisonValue).toFixed(3)) : null,
    unit,
    factualSummary: value == null ? null :
      comparisonValue == null
        ? `${label} measured ${value}${unit ? ` ${unit}` : ""}.`
        : `${label} measured ${value}${unit ? ` ${unit}` : ""}, a change of ${Number((value - comparisonValue).toFixed(3))}${unit ? ` ${unit}` : ""}.`,
  };
}

function resolveTargetValue(target, baseline) {
  if (number(target.targetValue) != null) return number(target.targetValue);
  if (number(target.amount) == null || baseline == null) return null;
  return target.direction === "decrease"
    ? baseline - number(target.amount) : baseline + number(target.amount);
}

function normalizeRange(value) {
  if (!value) return null;
  const min = number(value.min ?? value.lowerBound);
  const max = number(value.max ?? value.upperBound);
  return min != null && max != null ? { min, max } : null;
}

function observedAt(value) {
  const source = value?.observedAt ?? value?.measuredAt ?? value?.capturedAt ??
    value?.date ?? null;
  if (!source || !Number.isFinite(Date.parse(source))) return null;
  return new Date(source).toISOString();
}

function timestamp(value, field) {
  if (!value || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} must be a valid timestamp.`);
  }
  return new Date(value).toISOString();
}

function isActive(value) {
  return value && !value.superseded && !value.retracted &&
    !["superseded", "retracted", "deleted", "inactive"].includes(value.status);
}

function daysBetween(start, end) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000));
}

function mass(value) {
  return number(value?.value ?? value);
}

function number(value) {
  if (value == null || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function machine(value) {
  return String(value ?? "").normalize("NFKD").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function humanize(value) {
  return machine(value).replaceAll("_", " ") || "Goal result";
}
