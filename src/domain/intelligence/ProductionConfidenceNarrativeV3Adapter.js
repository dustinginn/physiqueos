import { deriveCanonicalGoalProgress } from "../confidence/GoalProgressContextService.js";
import { adaptEnergyObservationsV3 } from "./CadenceEnergyObservationsV3.js";
import { createV3EvidenceUniverse } from "./V3EvidenceUniverse.js";
import { resolveCurrentStrategyAuthority } from
  "../strategy/CurrentStrategyAuthority.js";
import { createTrainingPerformanceIntelligenceReport } from
  "../services/TrainingPerformanceIntelligenceService.js";
import { adaptTrainingPerformanceReportToPIObservations } from
  "../services/TrainingPIObservationAdapter.js";
import { createEvidenceObservationV3 } from "./v3/EvidenceObservationV3.js";
import { createGoalContractV3 } from "./v3/GoalContractV3.js";
import { deriveCadenceCoachingDetailsV3 } from
  "./v3/SpecificCoachingObservationV3.js";

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
  // One consistent, cutoff-bounded, goal-owned evidence universe for every
  // publisher, regardless of the shape of the store it hands to V3.
  const universe = createV3EvidenceUniverse({ store, goal, phase, evidenceCutoff });
  const goalContract = buildGoalContractV3FromCanonical({
    goal, phase, store: universe, evidenceCutoff,
  });
  const observations = createCanonicalEvidenceObservationsV3({
    goalContract, goal, phase, store: universe, evidenceCutoff,
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
    // Re-normalize stored contracts through the current additive schema so
    // older V3 contracts safely receive newly introduced semantic defaults.
    return createGoalContractV3(withCanonicalGoalVocabularyV3(configured,
      goal));
  }
  if (configured) {
    return createGoalContractV3({
      ...withCanonicalGoalVocabularyV3(configured, goal),
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
  const configuredGuardrails = resolveGoalGuardrailsV3(goal);
  const guardrails = configuredGuardrails.map((guardrail, index) =>
    normalizeConfiguredGuardrail(guardrail, index));
  const inferredEvidenceBinding = inferDirectAssessmentBindingV3({
    objectiveCapability: capability,
    guardrails,
  });
  const significance = deriveSignificanceSemanticsV3({
    target, baseline, targetValue, direction, maintenanceRange,
  });
  const vocabulary = deriveGoalContractVocabularyV3({
    goal, phase, target, metric, capability, direction, maintenanceRange,
    baseline, targetValue, guardrails: configuredGuardrails,
    inferredEvidenceBinding,
  });
  const policies = [
    {
      policyId: `objective_direct|${objectiveId}`,
      subjectType: "objective",
      subjectId: objectiveId,
      capabilityPattern: capability,
      role: "decisive",
      semanticClass: "OUTCOME_EVIDENCE",
      vocabularyKey: inferredEvidenceBinding?.vocabularyKey ?? "primary_outcome",
      reconciliationGroup: `outcome|${objectiveId}`,
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
      semanticClass: "OUTCOME_EVIDENCE",
      vocabularyKey: inferredEvidenceBinding?.vocabularyKey ?? "primary_outcome",
      reconciliationGroup: `outcome|${objectiveId}`,
      minimumQuality: "adequate",
      participation: "PERSISTENCE_CONFIRMATION_INPUT",
      usableFor: ["feasibility", "persistence"],
    },
    ...guardrails.map((guardrail) => ({
      policyId: `guardrail|${guardrail.guardrailId}`,
      subjectType: "guardrail",
      subjectId: guardrail.guardrailId,
      capabilityPattern: guardrail.metricCapability.id ??
        guardrail.metricCapability,
      role: "material",
      semanticClass: "GUARDRAIL",
      vocabularyKey: guardrail.vocabularyKey,
      minimumQuality: "adequate",
      participation: "GUARDRAIL",
      usableFor: ["guardrail"],
    })),
    ...supportingEvidencePoliciesV3({
      strategyRevisionId,
      guardrails,
    }),
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
      ...currentStrategyContractFields({ goal, phase, store, evidenceCutoff }),
      adequateExposure: {
        minimumDays: number(phase.minimumStrategyExposureDays ??
          goal.minimumStrategyExposureDays) ?? 0,
      },
      coachingActions: goal.safeCoachingActionsV3 ??
        defaultSafeCoachingActionsV3(objectiveId),
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
        meaningfulChangeThreshold: significance.meaningfulChangeThreshold,
        significanceBands: significance.significanceBands,
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
    evidenceRequests: goal.evidenceRequestsV3 ??
      inferredEvidenceRequestsV3({
        binding: inferredEvidenceBinding,
        strategyRevisionId,
        cadenceDays: goal.evidenceCadenceDaysV3 ??
          target.evidenceCadenceDays ?? null,
      }),
    objectiveDecisionPolicy: goal.objectiveDecisionPolicyV3 ??
      { mode: "all_required" },
    achievementPolicy: goal.achievementPolicyV3 ??
      { onAchieved: "transition_goal" },
    narrativePolicy: goal.narrativePolicyV3 ?? { recentEventHours: 24 },
    coachingObservationPolicy: goal.coachingObservationPolicyV3 ??
      phase.coachingObservationPolicyV3 ?? {},
    vocabulary,
  });
}

function withCanonicalGoalVocabularyV3(configured, goal) {
  const target = goal?.target ?? {};
  const canonicalObjectiveName = goal?.v3Vocabulary?.objective?.displayName ??
    target.objectiveNoun ?? target.displayName ?? humanize(machine(
      target.metric));
  if (!canonicalObjectiveName) return configured;
  return {
    ...configured,
    vocabulary: {
      ...configured.vocabulary,
      objective: {
        ...configured.vocabulary?.objective,
        displayName: canonicalObjectiveName,
      },
    },
  };
}

function deriveSignificanceSemanticsV3({
  target, baseline, targetValue, direction, maintenanceRange,
} = {}) {
  const configured = Array.isArray(target.significanceBands)
    ? target.significanceBands : [];
  const explicitMeaningful = number(target.meaningfulChangeThreshold);
  if (configured.length || maintenanceRange || !direction || baseline == null ||
      targetValue == null) {
    return {
      meaningfulChangeThreshold: explicitMeaningful ?? 0,
      significanceBands: configured,
    };
  }
  const requirement = Math.abs(targetValue - baseline);
  if (!(requirement > 0)) {
    return { meaningfulChangeThreshold: explicitMeaningful ?? 0,
      significanceBands: [] };
  }
  // These are proportions of the configured Goal requirement, not thresholds
  // attached to any Goal name or evidence source. A result that closes 30% of
  // the whole requirement is major; 5% is meaningful; 1% is minor.
  const meaningful = positiveNumber(explicitMeaningful) ??
    positiveNumber(target.meaningfulChangeFraction * requirement) ??
    requirement * 0.05;
  const major = positiveNumber(target.majorChangeThreshold) ??
    positiveNumber(target.majorChangeFraction * requirement) ??
    requirement * 0.3;
  const minor = positiveNumber(target.minorChangeThreshold) ??
    positiveNumber(target.minorChangeFraction * requirement) ??
    requirement * 0.01;
  return {
    meaningfulChangeThreshold: meaningful,
    significanceBands: [
      { significance: "major", minimumAbsoluteChange: major },
      { significance: "meaningful", minimumAbsoluteChange: meaningful },
      { significance: "minor", minimumAbsoluteChange: minor },
    ],
  };
}

function deriveGoalContractVocabularyV3({
  goal, phase, target, metric, capability, direction, maintenanceRange,
  baseline, targetValue, guardrails, inferredEvidenceBinding,
} = {}) {
  const objectiveName = target.objectiveNoun ?? target.displayName ??
    humanize(metric);
  const phaseName = phase.title ?? phase.name ?? "the current phase";
  const phaseContext = phase.contextName ?? phase.narrativeContext ??
    derivePhaseContextNameV3(phaseName);
  const targetPhrase = target.naturalTargetPhrase ??
    deriveNaturalTargetPhraseV3({ target, metric, objectiveName, direction,
      maintenanceRange, baseline, targetValue });
  const derived = {
    goal: { displayName: targetPhrase ?? "the goal" },
    objective: {
      displayName: objectiveName,
      unit: target.unit ?? null,
      decimals: configuredDecimalsV3(target, target.unit),
      ...deriveObjectiveActionVocabularyV3({ capability, direction,
        maintenanceRange, unit: target.unit }),
    },
    phase: { displayName: phaseName, contextName: phaseContext },
    strategy: {
      displayName: phase.strategyLabel ?? goal.strategyLabel ??
        deriveStrategyDisplayNameV3(phaseContext),
      continueAction: phase.continueAction ?? goal.continueActionV3 ??
        "Keep executing consistently",
      executeAction: phase.executeAction ?? goal.executeActionV3 ??
        "Keep executing",
      reconsiderationTrigger: phase.reconsiderationTrigger ??
        goal.reconsiderationTriggerV3 ?? "if something meaningful changes",
    },
    evidence: {
      ...(inferredEvidenceBinding ? {
        eventName: inferredEvidenceBinding.displayName,
        requests: {
          [inferredEvidenceBinding.vocabularyKey]: {
            displayName: inferredEvidenceBinding.displayName,
            grammaticalNumber: inferredEvidenceBinding.grammaticalNumber,
          },
        },
      } : {}),
      ...(hasCapabilityV3(guardrails, "performance.training_support_index")
        ? { executionName: "Training" } : {}),
    },
    guardrails: Object.fromEntries(guardrails.map((guardrail) => [
      guardrail.vocabularyKey ?? guardrail.guardrailId ?? guardrail.id,
      deriveGuardrailVocabularyV3(guardrail),
    ])),
  };
  return mergeVocabularyV3(derived, goal.v3Vocabulary ?? {});
}

function deriveObjectiveActionVocabularyV3({ capability, direction,
  maintenanceRange, unit } = {}) {
  if (maintenanceRange) return { ongoingPhrase: "this stability" };
  const [, key = ""] = String(capability ?? "").split(".");
  const unitIsMass = /^(?:lb|lbs|kg|kilograms?|pounds?)$/iu.test(
    String(unit ?? ""));
  const massLike = unitIsMass || /(?:^|_)(?:mass|weight)(?:$|_)/u.test(key);
  if (massLike && direction === "increase") {
    return { subject: "you", progressVerb: "added",
      ongoingPhrase: "this kind of progress" };
  }
  if (massLike && direction === "decrease") {
    return { subject: "you", progressVerb: "lost",
      ongoingPhrase: "this kind of progress" };
  }
  return { ongoingPhrase: direction ? "this kind of progress" :
    "the current response" };
}

function deriveNaturalTargetPhraseV3({ target, metric, objectiveName, direction,
  maintenanceRange, baseline, targetValue } = {}) {
  if (maintenanceRange) return `the ${objectiveName} goal`;
  const configuredAmount = positiveNumber(target.amount);
  const amount = configuredAmount ?? (direction && baseline != null &&
    targetValue != null ? Math.abs(targetValue - baseline) : null);
  if (amount == null) return `the ${objectiveName} goal`;
  const unit = target.unit ? ` ${target.unit}` : "";
  const noun = adjectivePhraseV3(humanize(metric) || objectiveName);
  return `the ${formatContractNumberV3(amount)}${unit} ${noun} goal`;
}

function derivePhaseContextNameV3(value) {
  const words = String(value ?? "").trim().split(/\s+/u).filter(Boolean);
  const last = machine(words.at(-1));
  const naturalContextNouns = new Set([
    "build", "block", "cycle", "phase", "calibration", "maintenance",
    "cut", "taper", "recovery",
  ]);
  return naturalContextNouns.has(last) ? `this ${last}` : "this phase";
}

function deriveStrategyDisplayNameV3(phaseContext) {
  const context = String(phaseContext ?? "").replace(/^this\s+/iu, "");
  return context && context !== "phase" ? `the ${context} plan` :
    "the current plan";
}

function deriveGuardrailVocabularyV3(guardrail = {}) {
  const capability = typeof guardrail.metricCapability === "string"
    ? guardrail.metricCapability : guardrail.metricCapability?.id ?? "";
  const capabilityName = humanize(capability.split(".").at(-1));
  const withoutInternalSuffix = capabilityName
    .replace(/\s+(?:support|capacity)\s+index$/iu, "")
    .replace(/\s+percentage$/iu, "");
  const naturalCapabilityName = capability.startsWith("performance.") &&
    withoutInternalSuffix === "training" ? "training performance" :
    withoutInternalSuffix;
  const displayName = guardrail.displayName ?? guardrail.label ??
    guardrail.vocabulary?.displayName ?? (naturalCapabilityName || "the limit");
  const riskPhrases = guardrail.vocabulary?.riskPhrases ??
    (guardrail.evaluation?.mode === "minimum" && /index$/iu.test(capabilityName)
      ? { minimum: "materially declining" } : undefined);
  return {
    displayName,
    decimals: guardrail.vocabulary?.decimals ??
      configuredDecimalsV3(guardrail, guardrail.metricCapability?.canonicalUnit),
    ...(guardrail.evaluation?.mode === "allowed_range"
      ? { clearDescription: guardrail.vocabulary?.clearDescription ?? "controlled" }
      : {}),
    ...(riskPhrases ? { riskPhrases } : {}),
    ...(guardrail.vocabulary ?? {}),
  };
}

function defaultSafeCoachingActionsV3(objectiveId) {
  return [{
    actionId: `continue_consistent_execution|${objectiveId}`,
    text: "Keep executing consistently",
    recommendationActions: ["continue_current_strategy"],
    requires: [],
  }];
}

function mergeVocabularyV3(derived, configured) {
  const evidenceRequests = { ...(derived.evidence?.requests ?? {}),
    ...(configured.evidence?.requests ?? {}) };
  const evidence = {
    ...derived.evidence,
    ...(configured.evidence ?? {}),
    ...(Object.keys(evidenceRequests).length
      ? { requests: evidenceRequests } : {}),
  };
  if (!Object.keys(evidenceRequests).length) delete evidence.requests;
  return {
    ...derived,
    ...configured,
    goal: { ...derived.goal, ...(configured.goal ?? {}) },
    objective: { ...derived.objective, ...(configured.objective ?? {}) },
    objectives: { ...(derived.objectives ?? {}),
      ...(configured.objectives ?? {}) },
    phase: { ...derived.phase, ...(configured.phase ?? {}) },
    strategy: { ...derived.strategy, ...(configured.strategy ?? {}) },
    evidence,
    guardrails: { ...derived.guardrails, ...(configured.guardrails ?? {}) },
  };
}

function hasCapabilityV3(guardrails, capabilityId) {
  return guardrails.some((guardrail) => {
    const capability = typeof guardrail.metricCapability === "string"
      ? guardrail.metricCapability : guardrail.metricCapability?.id;
    return capability === capabilityId;
  });
}

function configuredDecimalsV3(value, unit) {
  if (Number.isInteger(Number(value?.decimals))) return Number(value.decimals);
  const capability = typeof value?.metricCapability === "string"
    ? value.metricCapability : value?.metricCapability?.id;
  const precisionHint = unit ?? capability ?? "";
  return precisionHint === "%" || /(?:_percentage|^(?:lb|lbs|kg)$)/iu.test(
    String(precisionHint)) ? 1 : 0;
}

function adjectivePhraseV3(value) {
  return String(value ?? "result").trim().split(/\s+/u).join("-");
}

function formatContractNumberV3(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function positiveNumber(value) {
  const result = number(value);
  return result != null && result > 0 ? result : null;
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
    ...adaptLatestCanonicalCadenceObservationsV3({
      goalContract, phase, store, cutoff,
    }),
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

export function adaptCadenceEvidenceObservationsV3({
  goalContract,
  phase,
  artifact,
  piEnvelope = null,
  evidenceCutoff,
  canonicalTrainingEvidence = [],
} = {}) {
  const rawValues = piEnvelope?.observations ?? piEnvelope?.shadow?.observations ??
    artifact?.briefing?.weeklyNarrative?.context?.pi?.observations ?? [];
  const richEnergy = hasRichEnergyObservationsV3(rawValues);
  const values = selectRepresentativeCadenceObservationsV3(rawValues, {
    excludeEnergy: richEnergy,
  });
  const cutoff = timestamp(evidenceCutoff, "evidenceCutoff");
  const energyObservations = richEnergy
    ? adaptEnergyObservationsV3({
      observations: rawValues,
      goalContract,
      phase,
      artifactId: artifact?.id,
      evidenceCutoff: cutoff,
      fallbackWindow: artifact?.evidenceWindow ?? null,
    }) : [];
  return [...energyObservations, ...values.filter((item) => item?.id && item?.domain).flatMap((item) => {
    const capability = cadenceCapabilityV3(item);
    if (!capability) return [];
    const observed = timestamp(item.evidenceWindow?.endDate ?? cutoff,
      "cadence observation observedAt");
    const direction = item.direction === "negative" ||
      ["regressing", "deteriorating", "missed"].includes(item.status)
      ? "contradicts" : item.direction === "positive" ||
        ["improving", "supportive", "complete"].includes(item.status)
        ? "supports" : "neutral";
    const references = item.supportingEvidenceIds ?? [];
    return [createEvidenceObservationV3({
      observationId: `cadence_v3|${artifact?.id ?? cutoff}|${item.id}`,
      canonicalRecordId: item.canonicalRecordId ?? item.id,
      sourceType: `canonical_${item.domain}_observation`,
      displayLabel: item.displayLabel ?? humanize(item.domain),
      observedAt: observed,
      status: "active",
      relatedGoalIds: [goalContract.goalId],
      phaseId: phase?.id ?? goalContract.phase.phaseId,
      strategyRevisionId: goalContract.strategy.strategyRevisionId,
      highSalienceEvent: false,
      evidenceWindow: item.evidenceWindow ?? artifact?.evidenceWindow ?? null,
      directness: item.domain === "weight" ? "direct" : "behavioral",
      quality: {
        status: item.status === "insufficient_data" ? "insufficient" :
          ["high", "very_high"].includes(item.confidence?.level) ? "robust" :
            item.confidence?.level === "moderate" ? "adequate" : "limited",
        provenance: item.provenance?.producer ?? "canonical_cadence_observation",
        precision: "derived",
        completeness: item.status === "insufficient_data" ? "insufficient" : "reported",
        comparability: item.evidenceWindow?.comparisonStartDate ? "comparable" : "unknown",
        coverageRatio: item.confidence?.coverageRatio ?? null,
      },
      capabilities: [{
        capabilityId: capability,
        value: cadenceValueV3(item),
        factualSummary: item.factualSummary ?? item.explanationData?.summary?.text ?? null,
        metadata: { signalDirection: direction },
      }],
      coachingDetails: deriveCadenceCoachingDetailsV3({
        domain: item.domain,
        rawObservations: rawValues,
        canonicalTrainingEvidence,
        evidenceWindow: item.evidenceWindow ?? artifact?.evidenceWindow ?? null,
      }),
      limitations: item.confidence?.limitations ?? [],
      sourceReferences: references,
    })];
  })];
}

// The rich Energy adaptation applies whenever the Energy producer supplied
// measured or evidence-quality detail, including a window whose estimate could
// not be formed (for example food logged but no activity recorded). Only old
// records that carry neither fall back to the flat adaptation.
function hasRichEnergyObservationsV3(values) {
  return Array.isArray(values) && values.some((item) =>
    item?.domain === "energy" && ["energy_balance", "energy_intake", "energy_expenditure", "paired_day_coverage"].includes(item.kind) &&
    (Number.isFinite(Number(item.explanationData?.currentAverage)) && item.explanationData?.currentAverage !== null ||
      Boolean(item.explanationData?.intakeEvidence || item.explanationData?.activityEvidence)));
}

function selectRepresentativeCadenceObservationsV3(values, { excludeEnergy = false } = {}) {
  if (!Array.isArray(values)) return [];
  const selected = [
    selectCadenceObservationV3(values, "training", [
      (item) => item.id === "performance|overall|resistance",
      (item) => item.kind === "training_performance" &&
        item.subject?.type === "overall",
    ]),
    excludeEnergy ? null : selectCadenceObservationV3(values, "energy", [
      (item) => item.kind === "energy_balance",
    ]),
    selectCadenceObservationV3(values, "nutrition", [
      (item) => item.kind === "nutrition_summary",
    ]),
    selectCadenceObservationV3(values, "activity", [
      (item) => item.kind === "activity_summary",
    ]),
    selectCadenceObservationV3(values, "weight", [
      (item) => item.kind === "weight_average_change" &&
        item.status !== "insufficient_data",
      (item) => item.kind === "weight_short_window_change" &&
        item.status !== "insufficient_data",
    ]),
    selectCadenceObservationV3(values, "recovery", [
      (item) => item.kind === "recovery_state",
      (item) => item.kind === "recovery_insufficient_evidence",
    ]),
  ].filter(Boolean);
  return selected;
}

function selectCadenceObservationV3(values, domain, preferences) {
  const candidates = values.filter((item) => item?.domain === domain);
  for (const preference of preferences) {
    const selected = candidates.find(preference);
    if (selected) return selected;
  }
  return candidates.length === 1 ? candidates[0] : null;
}

export function adaptLatestCanonicalCadenceObservationsV3({
  goalContract,
  phase,
  store,
  cutoff,
} = {}) {
  const historyByAssessmentId = new Map((store?.goalConfidenceHistory ?? [])
    .filter((item) => item?.assessmentId && item?.assessment)
    .map((item) => [item.assessmentId, item.assessment]));
  const candidates = (store?.dailyBriefings ?? []).flatMap((artifact) => {
    const piEnvelope = artifact?.briefing?.weeklyNarrative?.context?.pi ??
      artifact?.briefing?.context?.pi ??
      { observations: deriveBriefingCadenceObservationsV3(artifact?.briefing) };
    if (!Array.isArray(piEnvelope?.observations) || !piEnvelope.observations.length) {
      return [];
    }
    const assessmentId = artifact?.confidencePublication?.assessmentId ??
      artifact?.briefing?.confidencePublication?.assessmentId ?? null;
    const assessment = historyByAssessmentId.get(assessmentId) ?? null;
    const artifactGoalId = artifact?.goalId ?? artifact?.sourceRevisions?.goalId ??
      artifact?.briefing?.activeGoal?.id ?? null;
    const artifactPhaseId = artifact?.phaseId ?? artifact?.sourceRevisions?.phaseId ??
      artifact?.briefing?.activePhase?.id ?? null;
    const artifactCutoff = observedArtifactCutoff(artifact);
    if (!artifactCutoff || Date.parse(artifactCutoff) > Date.parse(cutoff)) return [];
    const boundGoalId = assessment?.goalId ?? artifactGoalId;
    const boundPhaseId = assessment?.phaseId ?? artifactPhaseId;
    if (boundGoalId !== goalContract.goalId ||
      boundPhaseId !== goalContract.phase.phaseId) return [];
    return [{ artifact, piEnvelope, artifactCutoff }];
  }).sort((left, right) => right.artifactCutoff.localeCompare(left.artifactCutoff));
  const latest = candidates[0];
  if (!latest) return [];
  const canonicalTrainingEvidence = canonicalTrainingEvidenceThroughV3({
    store,
    cutoff: latest.artifactCutoff,
    phaseStart: goalContract.phase.startedAt,
  });
  const detailedTrainingObservations = canonicalTrainingEvidence.length
    ? adaptTrainingPerformanceReportToPIObservations(
        createTrainingPerformanceIntelligenceReport({
          canonicalObjects: canonicalTrainingEvidence,
          now: new Date(latest.artifactCutoff),
          generatedAt: latest.artifactCutoff,
        }),
      )
    : [];
  const sourceObservations = latest.piEnvelope.observations ??
    latest.piEnvelope.shadow?.observations ?? [];
  const sourceIds = new Set(sourceObservations.map((item) => item.id));
  const piEnvelope = {
    ...latest.piEnvelope,
    observations: [
      ...sourceObservations,
      ...detailedTrainingObservations.filter((item) => !sourceIds.has(item.id)),
    ],
  };
  return adaptCadenceEvidenceObservationsV3({
    goalContract,
    phase,
    artifact: latest.artifact,
    piEnvelope,
    evidenceCutoff: latest.artifactCutoff,
    canonicalTrainingEvidence,
  });
}

function canonicalTrainingEvidenceThroughV3({ store, cutoff, phaseStart }) {
  return (store?.canonicalEvidenceObjects ?? []).filter((candidate) => {
    const payload = candidate?.payload ?? candidate;
    const observed = String(payload?.observed_at ?? payload?.date ?? "").slice(0, 10);
    if (payload?.evidence_type !== "training" || !observed) return false;
    if (Date.parse(`${observed}T23:59:59.999Z`) > Date.parse(cutoff)) return false;
    if (phaseStart && observed < String(phaseStart).slice(0, 10)) return false;
    return candidate?.quality?.status !== "superseded" &&
      payload?.quality?.status !== "superseded";
  });
}

function deriveBriefingCadenceObservationsV3(briefing = {}) {
  const window = briefing.evidenceWindow ?? null;
  const observations = [];
  const training = briefing.training;
  if (training && (training.performanceTrend || training.performanceHeadline ||
      training.interpretation)) {
    const direction = directionFromStateV3(training.performanceTrend);
    observations.push({
      id: "performance|overall|resistance",
      displayLabel: "Training performance",
      domain: "training",
      kind: "training_performance",
      subject: { type: "overall" },
      status: training.performanceTrend ?? "available",
      direction,
      factualSummary: joinNaturalSentencesV3([
        training.performanceHeadline,
        training.interpretation,
      ]),
      evidenceWindow: window,
      confidence: {
        level: Number(training.sessionsCompleted) >= 2 ? "moderate" : "low",
      },
      supportingEvidenceIds: (training.highlights ?? [])
        .map((item) => item.id).filter(Boolean),
    });
  }

  const energy = briefing.energyBalance;
  if (energy && Number(energy.comparableDays) > 0) {
    const balance = number(energy.estimatedAverageDailyBalance ??
      energy.estimatedDailyBalanceMidpoint ?? energy.averageBalance);
    const direction = energy.balanceDirection === "probably_below" ||
      (balance != null && balance < 0) ? "negative" :
      energy.balanceDirection === "probably_above" ||
        (balance != null && balance > 0) ? "positive" : "neutral";
    observations.push({
      id: "energy|derived_balance_estimate",
      displayLabel: "Energy estimate",
      domain: "energy",
      kind: "energy_balance",
      status: "available",
      direction,
      value: balance,
      factualSummary: balance == null ? "The energy estimate is available, but its direction is unclear." :
        `Reported intake minus estimated expenditure averaged ${formatSignedNumberV3(balance)} kcal/day across ${energy.comparableDays} comparable ${Number(energy.comparableDays) === 1 ? "day" : "days"}${energy.reliability === "limited" ? ", with limited coverage" : ""}.`,
      evidenceWindow: window,
      confidence: {
        level: energy.reliability === "high" ? "high" :
          energy.reliability === "moderate" ? "moderate" : "low",
        coverageRatio: number(energy.comparableDays) && number(briefing.evidenceCompleteness?.activity?.expectedDays)
          ? Math.min(1, Number(energy.comparableDays) /
            Number(briefing.evidenceCompleteness.activity.expectedDays)) : null,
        limitations: [
          ...(energy.warnings ?? []),
          "expenditure_is_estimated",
        ],
      },
      supportingEvidenceIds: [],
    });
  }

  const weight = briefing.weightContext;
  if (weight && number(weight.averageWeight) != null) {
    observations.push({
      id: "weight|average_change",
      displayLabel: "Weight context",
      domain: "weight",
      kind: "weight_average_change",
      status: "available",
      direction: "neutral",
      value: number(weight.averageWeight),
      factualSummary: number(weight.changeFromPriorComparable) == null
        ? `Average scale weight was ${weight.averageWeight} lb.`
        : `Average scale weight was ${weight.averageWeight} lb, ${Math.abs(Number(weight.changeFromPriorComparable))} lb ${Number(weight.changeFromPriorComparable) >= 0 ? "higher" : "lower"} than the prior comparable average.`,
      evidenceWindow: window,
      confidence: { level: Number(weight.observations) >= 3 ? "moderate" : "low" },
      supportingEvidenceIds: [],
    });
  }

  const completeness = briefing.evidenceCompleteness ?? {};
  for (const domain of ["nutrition", "activity", "recovery"]) {
    const evidence = completeness[domain];
    if (!evidence || number(evidence.expectedDays) == null) continue;
    const complete = number(evidence.completeDays) ?? 0;
    const expected = number(evidence.expectedDays) ?? 0;
    observations.push({
      id: `${domain}|coverage`,
      displayLabel: `${humanize(domain)} coverage`,
      domain,
      kind: domain === "nutrition" ? "nutrition_summary" :
        domain === "activity" ? "activity_summary" :
          complete > 0 ? "recovery_state" : "recovery_insufficient_evidence",
      status: complete > 0 ? "available" : "insufficient_data",
      direction: "neutral",
      value: expected > 0 ? complete / expected : 0,
      factualSummary: `${humanize(domain).replace(/^./u, (character) => character.toLocaleUpperCase("en-US"))} evidence covered ${complete} of ${expected} days in the briefing window.`,
      evidenceWindow: window,
      confidence: {
        level: complete === expected && expected > 0 ? "moderate" : "low",
        coverageRatio: expected > 0 ? complete / expected : 0,
        limitations: complete < expected ? [`${domain}_coverage_incomplete`] : [],
      },
      supportingEvidenceIds: [],
    });
  }
  return observations;
}

function directionFromStateV3(value) {
  if (["improving", "supportive", "positive", "complete"].includes(value)) {
    return "positive";
  }
  if (["regressing", "deteriorating", "negative", "missed"].includes(value)) {
    return "negative";
  }
  return "neutral";
}

function joinNaturalSentencesV3(values) {
  return values.filter(Boolean).map((value) => {
    const text = String(value).trim();
    return /[.!?]$/u.test(text) ? text : `${text}.`;
  }).join(" ");
}

function formatSignedNumberV3(value) {
  const rounded = Number(Number(value).toFixed(1));
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export function adaptCanonicalDexaScans({
  goalContract,
  phase,
  scans = [],
  cutoff,
} = {}) {
  const active = scans.filter((scan) => isActive(scan) &&
    observedAt(scan) && Date.parse(observedAt(scan)) <= Date.parse(cutoff) &&
    hasDexaMeasurement(scan))
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

function currentStrategyContractFields({ goal, phase, store, evidenceCutoff }) {
  const authority = resolveCurrentStrategyAuthority({
    goal, phase,
    phaseStrategies: store?.phaseStrategies ?? [],
    protocols: store?.protocols ?? [],
    protocolVersions: store?.protocolVersions ?? [],
    evidenceCutoff,
  });
  return {
    ...(authority.energyStrategy ? { energyStrategy: authority.energyStrategy } : {}),
    ...(authority.phaseStrategy ? { operatingState: authority.operatingState } : {}),
  };
}

function resolveStrategyRevisionId(goal, phase) {
  return goal.currentStrategyRevision?.id ?? goal.strategyRevisionId ??
    goal.timeline?.activePhaseStrategyId ?? phase.activePhaseStrategyId ??
    phase.strategyRevisionId ?? phase.currentStrategyRevision?.id ??
    `phase_strategy|${phase.id}|v1`;
}

function hasDexaMeasurement(scan) {
  return [
    mass(scan?.totalMass),
    mass(scan?.leanMass),
    mass(scan?.fatMass),
    number(scan?.bodyFatPercentage),
  ].some((value) => value != null);
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

function inferDirectAssessmentBindingV3({
  objectiveCapability,
  guardrails,
} = {}) {
  const source = directAssessmentSourceV3(objectiveCapability);
  if (!source) return null;
  const capabilityIds = [objectiveCapability, ...guardrails
    .map((guardrail) => typeof guardrail.metricCapability === "string"
      ? guardrail.metricCapability
      : guardrail.metricCapability?.id ?? null)
    .filter((capabilityId) => capabilityId &&
      directAssessmentSourceV3(capabilityId)?.vocabularyKey ===
        source.vocabularyKey)];
  return {
    ...source,
    capabilityIds: [...new Set(capabilityIds)],
  };
}

function directAssessmentSourceV3(capabilityId) {
  const id = String(capabilityId ?? "").toLocaleLowerCase("en-US");
  if (id.startsWith("body_composition.")) {
    return {
      vocabularyKey: "canonical_dexa_assessment",
      displayName: "DEXA",
      grammaticalNumber: "singular",
    };
  }
  if (/^performance\.(?:load|strength|one_rep_max|repetition_max|power)(?:$|\.)/u
    .test(id)) {
    return {
      vocabularyKey: "canonical_strength_assessment",
      displayName: "strength assessment",
      grammaticalNumber: "singular",
    };
  }
  if (/^performance\.(?:time|time_trial|cardio|pace|distance)(?:$|\.)/u
    .test(id)) {
    return {
      vocabularyKey: "canonical_time_trial",
      displayName: "time trial",
      grammaticalNumber: "singular",
    };
  }
  return null;
}

function inferredEvidenceRequestsV3({
  binding,
  strategyRevisionId,
  cadenceDays,
} = {}) {
  if (!binding) return [];
  return ["establish_feasibility", "confirm_persistence", "resolve_contradiction"]
    .map((evidencePurpose) => ({
      requestId: `evidence_request|${strategyRevisionId}|${evidencePurpose}`,
      strategyRevisionId,
      evidencePurpose,
      timing: {
        cadenceDays: number(cadenceDays),
      },
      alternatives: [{
        capabilityIds: binding.capabilityIds,
        vocabularyKey: binding.vocabularyKey,
      }],
    }));
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

function resolveGoalGuardrailsV3(goal) {
  const configured = goal.v3Guardrails ?? goal.guardrailsV3;
  if (Array.isArray(configured)) return configured;
  return (goal.guardrails ?? [])
    .filter((item) => item?.accepted !== false)
    .map(adaptLegacyGuardrailV3)
    .filter(Boolean);
}

export function adaptLegacyGuardrailV3(input) {
  const text = String(input.text ?? input.description ?? "");
  const bodyFatRange = /body[\s-]*fat/i.test(text) ? parseNumericRange(text) : null;
  if (bodyFatRange) {
    const span = bodyFatRange.max - bodyFatRange.min;
    return {
      guardrailId: input.id,
      metricCapability: "body_composition.body_fat_percentage",
      evaluation: {
        mode: "allowed_range",
        allowedRange: { ...bodyFatRange, approximate: /approximately|about/i.test(text) },
      },
      severityBands: [
        { status: "breached", minimumDeviation: span * 1.5 },
        { status: "pressured", minimumDeviation: span * 0.5 },
        { status: "watch", minimumDeviation: 0 },
      ],
      consequencePolicy: {
        confidenceImpact: -1,
        recommendationConstraint: "monitor",
        celebrationCeiling: "measured",
        escalationLevel: "attention",
      },
      vocabularyKey: input.id,
    };
  }
  if (/strength|training performance/i.test(text) &&
      /avoid|maintain|preserve|no\s+(?:sustained\s+)?regression/i.test(text)) {
    return minimumIndexGuardrail(input, "performance.training_support_index",
      -2);
  }
  if (/recovery/i.test(text) && /maintain|preserve|avoid/i.test(text)) {
    return minimumIndexGuardrail(input, "execution.recovery", -1);
  }
  return null;
}

function minimumIndexGuardrail(input, capabilityId, confidenceImpact) {
  return {
    guardrailId: input.id,
    metricCapability: capabilityId,
    evaluation: { mode: "minimum", threshold: 0 },
    severityBands: [
      { status: "breached", minimumDeviation: 1 },
      { status: "watch", minimumDeviation: 0 },
    ],
    consequencePolicy: {
      confidenceImpact,
      recommendationConstraint: confidenceImpact <= -2 ? "review" : "monitor",
      celebrationCeiling: confidenceImpact <= -2 ? "restrained" : "measured",
    },
    vocabularyKey: input.id,
  };
}

// Energy execution evidence relative to the current Energy Strategy. These are
// narrative/attribution context: they inform what V3 can say and how firmly it
// can recommend, and never change the Confidence percentage by themselves.
function energyStrategyEvidencePoliciesV3(strategyRevisionId) {
  const policy = (capabilityPattern, suffix, semanticClass, vocabularyKey, group, extra = {}) => ({
    policyId: `strategy_${suffix}|${strategyRevisionId}`,
    subjectType: "execution",
    subjectId: strategyRevisionId,
    capabilityPattern,
    role: "contextual",
    semanticClass,
    vocabularyKey,
    reconciliationGroup: group,
    minimumQuality: "limited",
    participation: "NARRATIVE_CONTEXT_ONLY",
    usableFor: ["narrative", "attribution", "execution"],
    signalRules: directionSignalRules("minor"),
    ...extra,
  });
  return [
    policy("execution.energy_intake", "energy_intake", "EXECUTION_SUPPORT",
      "energy_intake_execution", "energy_intake_plan"),
    policy("execution.energy_activity", "energy_activity", "EXECUTION_SUPPORT",
      "energy_activity_execution", "energy_activity_plan"),
    policy("execution.energy_pairing", "energy_pairing", "CONTEXTUAL_EVIDENCE",
      "energy_pairing_quality", "energy_pairing", { usableFor: ["narrative", "attribution"] }),
    policy("strategy.energy_outcome_tension", "energy_outcome_tension", "DERIVED_ESTIMATE",
      "energy_outcome_tension", "energy_outcome_tension", { usableFor: ["narrative", "attribution"] }),
  ];
}

function supportingEvidencePoliciesV3({ strategyRevisionId, guardrails }) {
  const policies = [{
    policyId: `strategy_training_support|${strategyRevisionId}`,
    subjectType: "strategy",
    subjectId: strategyRevisionId,
    capabilityPattern: "performance.training_support_index",
    role: "supporting",
    semanticClass: "LEADING_INDICATOR",
    vocabularyKey: "training_performance",
    reconciliationGroup: "productive_stimulus",
    minimumQuality: "adequate",
    participation: "PERSISTENCE_CONFIRMATION_INPUT",
    usableFor: ["feasibility", "persistence", "attribution", "execution"],
    signalRules: {
      supportsWhen: predicate("measurement.value", "gte", 1),
      contradictsWhen: predicate("measurement.value", "lte", -1),
      significance: "meaningful",
    },
  }, {
    policyId: `strategy_nutrition_context|${strategyRevisionId}`,
    subjectType: "execution",
    subjectId: strategyRevisionId,
    capabilityPattern: "execution.nutrition",
    role: "supporting",
    semanticClass: "EXECUTION_SUPPORT",
    vocabularyKey: "nutrition_execution",
    reconciliationGroup: "strategy_execution",
    minimumQuality: "limited",
    participation: "NARRATIVE_CONTEXT_ONLY",
    usableFor: ["narrative", "attribution", "execution"],
    signalRules: directionSignalRules("minor"),
  }, {
    policyId: `strategy_energy_estimate|${strategyRevisionId}`,
    subjectType: "attribution",
    subjectId: strategyRevisionId,
    capabilityPattern: "strategy.energy_balance_estimate",
    role: "contextual",
    semanticClass: "DERIVED_ESTIMATE",
    vocabularyKey: "energy_estimate",
    reconciliationGroup: "energy_availability",
    minimumQuality: "limited",
    participation: "NARRATIVE_CONTEXT_ONLY",
    usableFor: ["narrative", "attribution"],
    signalRules: directionSignalRules("minor"),
  }, ...energyStrategyEvidencePoliciesV3(strategyRevisionId), {
    policyId: `strategy_monthly_evidence_matrix|${strategyRevisionId}`,
    subjectType: "attribution",
    subjectId: strategyRevisionId,
    capabilityPattern: "monthly.evidence.*",
    role: "contextual",
    semanticClass: "CONTEXTUAL_EVIDENCE",
    vocabularyKey: "monthly_evidence_matrix",
    reconciliationGroup: "monthly_evidence_matrix",
    minimumQuality: "limited",
    participation: "NARRATIVE_CONTEXT_ONLY",
    usableFor: ["narrative", "attribution"],
  }, {
    policyId: `strategy_activity_context|${strategyRevisionId}`,
    subjectType: "execution",
    subjectId: strategyRevisionId,
    capabilityPattern: "execution.activity",
    role: "contextual",
    semanticClass: "CONTEXTUAL_EVIDENCE",
    vocabularyKey: "activity_context",
    reconciliationGroup: "energy_availability",
    minimumQuality: "limited",
    participation: "NARRATIVE_CONTEXT_ONLY",
    usableFor: ["narrative", "attribution", "execution"],
    signalRules: directionSignalRules("minor"),
  }, {
    policyId: `strategy_recovery_context|${strategyRevisionId}`,
    subjectType: "execution",
    subjectId: strategyRevisionId,
    capabilityPattern: "execution.recovery",
    role: "supporting",
    semanticClass: "EXECUTION_SUPPORT",
    vocabularyKey: "recovery_support",
    reconciliationGroup: "strategy_execution",
    minimumQuality: "limited",
    participation: "NARRATIVE_CONTEXT_ONLY",
    usableFor: ["narrative", "execution"],
    signalRules: directionSignalRules("minor"),
  }, {
    policyId: `strategy_weight_context|${strategyRevisionId}`,
    subjectType: "attribution",
    subjectId: strategyRevisionId,
    capabilityPattern: "body_mass.level",
    role: "contextual",
    semanticClass: "CONTEXTUAL_EVIDENCE",
    vocabularyKey: "weight_context",
    reconciliationGroup: "outcome_context",
    minimumQuality: "limited",
    participation: "NARRATIVE_CONTEXT_ONLY",
    usableFor: ["narrative", "attribution"],
  }, {
    policyId: `strategy_photo_context|${strategyRevisionId}`,
    subjectType: "attribution",
    subjectId: strategyRevisionId,
    capabilityPattern: "visual.*",
    role: "contextual",
    semanticClass: "CONTEXTUAL_EVIDENCE",
    vocabularyKey: "visual_context",
    reconciliationGroup: "outcome_context",
    minimumQuality: "adequate",
    participation: "NARRATIVE_CONTEXT_ONLY",
    usableFor: ["narrative", "attribution"],
    signalRules: directionSignalRules("minor"),
  }, {
    policyId: `strategy_priority_execution|${strategyRevisionId}`,
    subjectType: "execution",
    subjectId: strategyRevisionId,
    capabilityPattern: "execution.priorities",
    role: "supporting",
    semanticClass: "EXECUTION_SUPPORT",
    vocabularyKey: "priority_execution",
    reconciliationGroup: "strategy_execution",
    minimumQuality: "limited",
    participation: "PERSISTENCE_CONFIRMATION_INPUT",
    usableFor: ["narrative", "execution", "attribution"],
    signalRules: directionSignalRules("minor"),
  }];
  for (const guardrail of guardrails) {
    const capability = typeof guardrail.metricCapability === "string"
      ? guardrail.metricCapability : guardrail.metricCapability.id ??
        `${guardrail.metricCapability.namespace}.${guardrail.metricCapability.key}`;
    if (!["performance.training_support_index", "execution.recovery"].includes(
      capability)) continue;
    policies.push({
      policyId: `support_guardrail|${guardrail.guardrailId}`,
      subjectType: "guardrail",
      subjectId: guardrail.guardrailId,
      capabilityPattern: capability,
      role: "material",
      semanticClass: "GUARDRAIL",
      vocabularyKey: guardrail.vocabularyKey,
      minimumQuality: "adequate",
      participation: "GUARDRAIL",
      usableFor: ["guardrail"],
    });
  }
  return policies;
}

function directionSignalRules(significance) {
  return {
    supportsWhen: predicate("measurement.metadata.signalDirection", "eq", "supports"),
    contradictsWhen: predicate("measurement.metadata.signalDirection", "eq", "contradicts"),
    significance,
  };
}

function parseNumericRange(value) {
  const match = String(value).match(/(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)/u);
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  return Number.isFinite(min) && Number.isFinite(max) && min <= max
    ? { min, max } : null;
}

function observedArtifactCutoff(artifact) {
  const value = artifact?.evidenceCutoff ?? artifact?.evidenceWindow?.cutoff ??
    artifact?.evidenceWindow?.endDate ?? null;
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T23:59:59.999Z` : value;
  return Number.isFinite(Date.parse(normalized))
    ? new Date(normalized).toISOString() : null;
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

function cadenceCapabilityV3(item) {
  return ({
    training: "performance.training_support_index",
    nutrition: "execution.nutrition",
    energy: "strategy.energy_balance_estimate",
    activity: "execution.activity",
    recovery: "execution.recovery",
    weight: "body_mass.level",
    photos: "appearance.qualitative_progress",
  })[item.domain] ?? null;
}

function cadenceValueV3(item) {
  const numeric = [item.value, item.currentValue,
    item.explanationData?.value].map(Number).find(Number.isFinite);
  if (numeric != null) return numeric;
  if (item.direction === "positive" || item.status === "improving") return 1;
  if (item.direction === "negative" || item.status === "regressing") return -1;
  return 0;
}
