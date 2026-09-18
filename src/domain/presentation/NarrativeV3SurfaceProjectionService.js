import { deepFreeze, round, semanticFingerprint } from
  "../intelligence/v3/V3Runtime.js";

export const NARRATIVE_V3_DENSITY = deepFreeze({
  GLANCE: "GLANCE",
  ONE_LINE: "ONE_LINE",
  SHORT: "SHORT",
  MEDIUM: "MEDIUM",
  FULL: "FULL",
});

export const BRIEFING_V3_DENSITY_CONTRACTS = deepFreeze({
  midweek: {
    purpose: "coaching_check_in",
    defaultDensity: NARRATIVE_V3_DENSITY.SHORT,
    primaryQuestion: "What happened in the last few days that is worth mentioning?",
    evidenceDriven: true,
    retellGoalStory: false,
    fillEmptySections: false,
    expandWhen: "new_decision_relevant_evidence",
  },
  weekly: {
    purpose: "weekly_coaching_review",
    defaultDensity: NARRATIVE_V3_DENSITY.SHORT,
    maximumRoutineDensity: NARRATIVE_V3_DENSITY.MEDIUM,
    primaryQuestions: ["How did the week go?", "Does anything need changing?"],
    evidenceDriven: true,
    replayRecentEvent: false,
    fillEmptySections: false,
    expandWhen: "meaningful_strategic_change",
  },
  monthly: {
    purpose: "comprehensive_recurring_strategic_synthesis",
    defaultDensity: NARRATIVE_V3_DENSITY.MEDIUM,
    maximumDensity: NARRATIVE_V3_DENSITY.FULL,
    calendarDay: 1,
    recurringPrecedence: true,
    evidenceDriven: true,
    fillEmptySections: false,
  },
  dexa_event: {
    purpose: "deep_high_authority_body_composition_interpretation",
    defaultDensity: NARRATIVE_V3_DENSITY.FULL,
    evidenceDriven: true,
    eventMayDominate: true,
    fillEmptySections: false,
  },
  photo_event: {
    purpose: "structured_photo_event_strategic_interpretation",
    defaultDensity: NARRATIVE_V3_DENSITY.FULL,
    v3Plumbing: "PRESERVED",
    founderQualityAcceptance: "DEFERRED",
    evidenceDriven: true,
    fillEmptySections: false,
  },
  photo_briefing: {
    purpose: "structured_photo_briefing_strategic_interpretation",
    defaultDensity: NARRATIVE_V3_DENSITY.MEDIUM,
    v3Plumbing: "PRESERVED",
    founderQualityAcceptance: "DEFERRED",
    evidenceDriven: true,
    fillEmptySections: false,
  },
});

// Shadow-only projections for intended V3 consumers. These functions compose
// presentation from a completed canonical interpretation; they do not score,
// publish, persist or wire any application surface.
export function createNarrativeV3CrossSurfaceShadowPreviews({
  goalContract,
  result,
  priority,
} = {}) {
  assertCanonicalV3Inputs(goalContract, result);
  const context = createProjectionContext(goalContract, result);
  const semantic = {
    schemaVersion: "narrative_v3_cross_surface_shadow_preview_v1",
    strategicInterpretationId: result.strategicInterpretation.id,
    confidenceAssessmentId: result.confidence.id,
    narrativePlanId: result.narrativePlan.id,
    activeGoal: projectActiveGoal(context),
    priority: projectPriority(context, priority),
    operatingPlanTraining: projectTrainingRationale(context),
    operatingPlanEnergy: projectEnergyRationale(context),
    publication: {
      mode: "shadow_only",
      persistenceWrites: 0,
      artifactWrites: 0,
      clientWiring: false,
    },
  };
  return deepFreeze({
    ...semantic,
    id: `narrative_v3_cross_surface_shadow|${semanticFingerprint(
      semantic).slice(7)}`,
  });
}

function assertCanonicalV3Inputs(goalContract, result) {
  if (goalContract?.schemaVersion !== "goal_contract_v3") {
    throw new Error("Cross-surface V3 previews require a canonical Goal Contract V3.");
  }
  if (result?.confidence?.schemaVersion !== "confidence_assessment_v3" ||
      result?.narrativePlan?.schemaVersion !== "narrative_plan_v3" ||
      result?.strategicInterpretation?.schemaVersion !==
        "strategic_interpretation_v3") {
    throw new Error("Cross-surface V3 previews require one completed canonical V3 interpretation.");
  }
  if (result.confidence.strategicInterpretationId !==
      result.strategicInterpretation.id ||
      result.narrativePlan.confidenceAssessmentId !== result.confidence.id) {
    throw new Error("Cross-surface V3 preview inputs must share canonical lineage.");
  }
}

function createProjectionContext(goalContract, result) {
  const interpretation = result.strategicInterpretation;
  const objective = interpretation.objectiveFindings.find((item) =>
    item.priority === "primary") ?? interpretation.objectiveFindings[0] ?? null;
  const objectiveDefinition = goalContract.objectives.find((item) =>
    item.objectiveId === objective?.objectiveId) ?? null;
  const trajectory = result.confidence.goalAchievementOutlook.objectives.find(
    (item) => item.objectiveId === objective?.objectiveId)?.trajectory ?? null;
  const objectiveWords = {
    ...(goalContract.vocabulary?.objective ?? {}),
    ...(objectiveDefinition?.vocabularyKey
      ? goalContract.vocabulary?.objectives?.[
        objectiveDefinition.vocabularyKey] ?? {}
      : {}),
  };
  const guardrail = selectPrimaryGuardrail(goalContract, interpretation);
  const trainingObservation =
    interpretation.coachingObservationSelection?.selected?.find((item) =>
      item.domain === "training") ?? null;
  const trainingSignal = interpretation.crossDomainSynthesis?.signals?.find(
    (item) => item.semanticClass === "LEADING_INDICATOR" &&
      /training/iu.test(`${item.capabilityId} ${item.vocabularyKey} ${
        item.sourceType}`)) ?? null;
  const energySignal = interpretation.crossDomainSynthesis?.signals?.find(
    (item) => item.semanticClass === "DERIVED_ESTIMATE" &&
      /energy/iu.test(`${item.capabilityId} ${item.vocabularyKey} ${
        item.sourceType}`)) ?? null;
  const energyTension = interpretation.crossDomainSynthesis?.tensions?.find(
    (item) => item.lowerAuthorityObservationIds?.includes(
      energySignal?.observationId)) ?? null;
  return { goalContract, result, interpretation, objective,
    objectiveDefinition, objectiveWords, trajectory, guardrail,
    trainingObservation, trainingSignal, energySignal, energyTension };
}

function projectActiveGoal(context) {
  const { goalContract, interpretation, objective, objectiveWords,
    trajectory, guardrail } = context;
  const progress = progressStatement(objective, objectiveWords, trajectory);
  const strategy = strategyName(goalContract);
  const strategySentence = interpretation.strategyEffectiveness.feasibility ===
    "demonstrated"
    ? `${upperFirst(strategy)} is working, and current training still supports staying the course.`
    : `${upperFirst(strategy)} still needs a clear outcome before it should be treated as proven.`;
  const guardrailSentence = guardrail?.finding.status === "clear"
    ? `${upperFirst(guardrail.label)} remains inside the ${guardrail.range} guardrail.`
    : guardrail ? `${upperFirst(guardrail.label)} is the main limit to watch right now.`
      : null;
  const next = `Keep the current setup in place. ${upperFirst(
    nextEvidenceName(context))} will show whether ${ongoingProgressPhrase(
    context)} continues.`;
  return {
    density: NARRATIVE_V3_DENSITY.MEDIUM,
    heading: goalContract.goalLabel,
    status: achievementLabel(interpretation.goalAchievement, trajectory),
    progress,
    strategy: strategySentence,
    guardrail: guardrailSentence,
    next,
  };
}

function projectPriority(context, priority) {
  if (!priority?.name || !priority?.factualInstruction ||
      !priority?.strategicCapability) {
    throw new Error("Priority preview requires a canonical name, instruction and strategic capability.");
  }
  let coaching;
  if (priority.strategicCapability === "nutrition.protein_execution") {
    coaching = `Consistent protein supports the training and recovery behind the current ${
      objectiveName(context)} progress.`;
  } else if (priority.strategicCapability === "training.execution") {
    coaching = `Completing this work helps preserve the training conditions behind the current ${
      objectiveName(context)} progress.`;
  } else {
    coaching = `This action supports the conditions needed to keep the current ${
      objectiveName(context)} goal moving.`;
  }
  return {
    density: NARRATIVE_V3_DENSITY.ONE_LINE,
    name: priority.name,
    factualInstruction: sentence(priority.factualInstruction),
    goalRelativeCoaching: sentence(coaching),
  };
}

function projectTrainingRationale(context) {
  const specific = context.trainingObservation?.narrativeText;
  const support = specific ? sentence(specific) :
    context.trainingSignal?.direction === "supports"
      ? "Comparable training performance is still moving in the right direction."
      : "The current training setup remains appropriate while performance holds.";
  const rationale = `${support} Keep the current training structure while that continues; reconsider it if comparable performance flattens or declines across several sessions.`;
  return {
    density: NARRATIVE_V3_DENSITY.SHORT,
    heading: "Training rationale",
    rationale,
  };
}

function projectEnergyRationale(context) {
  const objective = objectiveName(context);
  const guardrailCondition = context.guardrail
    ? `${context.guardrail.label} moves outside ${context.guardrail.range}`
    : "a Goal guardrail deteriorates";
  let rationale;
  if (context.energyTension?.type === "ESTIMATE_VS_OUTCOME_TENSION" &&
      context.interpretation.recommendation.action ===
        "continue_current_strategy") {
    rationale = `Keep the current Energy strategy in place: the numbers look lower than expected on paper, but the realized ${objective} progress and productive training do not support changing intake from that estimate alone. Reconsider if progress stalls, training deteriorates, or ${guardrailCondition}.`;
  } else if (context.energySignal?.direction === "supports") {
    rationale = `The current Energy strategy fits the Goal while ${
      context.guardrail?.label ?? "the important limits"} remains controlled. Reconsider if ${guardrailCondition} or training and progress stop moving together.`;
  } else if (context.energySignal?.direction === "contradicts") {
    rationale = `The current Energy strategy deserves attention because progress and training are no longer clearly supported. Reconsider the setup if that pattern continues across enough reliable evidence.`;
  } else {
    rationale = `Keep the current Energy strategy steady while realized ${objective} progress and training remain productive. Reconsider if progress stalls, training deteriorates, or ${guardrailCondition}.`;
  }
  return {
    density: NARRATIVE_V3_DENSITY.SHORT,
    heading: "Energy rationale",
    rationale,
  };
}

function progressStatement(objective, words, trajectory) {
  if (!objective) return null;
  if (trajectory?.kind === "scalar_target" && Number.isFinite(
    trajectory.fractionAchieved)) {
    const completed = trajectory.completedRequirement;
    const target = trajectory.totalRequirement;
    return `You have added ${number(completed, words.decimals)} of the ${
      number(target)} ${objective.unit} of ${
      words.displayName} in this Goal.`;
  }
  return `${upperFirst(words.displayName ?? objective.metricCapability.displayName)} is ${
    number(objective.currentValue, words.decimals)}${unitSuffix(objective.unit)}.`;
}

function achievementLabel(state, trajectory) {
  const labels = { not_assessed: "Not assessed", in_progress: "In progress",
    achieved: "Achieved", exceeded: "Exceeded", regressed: "Needs attention" };
  const fraction = Number.isFinite(trajectory?.fractionAchieved)
    ? ` · ${round(trajectory.fractionAchieved * 100)}% complete` : "";
  return `${labels[state] ?? "In progress"}${fraction}`;
}

function selectPrimaryGuardrail(goalContract, interpretation) {
  const finding = interpretation.guardrailFindings.find((item) =>
    item.status !== "not_assessed" && /body.?fat/iu.test(
      item.metricCapability?.id ?? "")) ??
    interpretation.guardrailFindings.find((item) => item.status !==
      "not_assessed");
  if (!finding) return null;
  const definition = goalContract.guardrails.find((item) =>
    item.guardrailId === finding.guardrailId);
  const words = goalContract.vocabulary?.guardrails?.[
    definition?.vocabularyKey] ?? {};
  return {
    finding,
    label: words.displayName ?? finding.metricCapability.displayName,
    range: definition?.evaluation.mode === "allowed_range"
      ? naturalRange(definition.evaluation.allowedRange.min,
        definition.evaluation.allowedRange.max,
        definition.metricCapability.canonicalUnit)
      : null,
  };
}

function nextEvidenceName(context) {
  return context.result.narrativePlan.nextEvidence.namedFromBinding
    ? `the next ${context.result.narrativePlan.nextEvidence.displayName}`
    : "the next check";
}

function ongoingProgressPhrase(context) {
  return context.objectiveWords.ongoingPhrase ??
    `${objectiveName(context)} keeps moving in the right direction`;
}

function objectiveName(context) {
  return context.objectiveWords.displayName ??
    context.objective?.metricCapability.displayName ?? "Goal";
}

function strategyName(goalContract) {
  return goalContract.vocabulary?.strategy?.displayName ??
    goalContract.strategy.label ?? "the current plan";
}

function naturalRange(minimum, maximum, unit) {
  return `${number(minimum)}–${number(maximum)}${unit === "%" ? "%" :
    unit ? ` ${unit}` : ""}`;
}

function number(value, decimals) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals === 1 ? 1 : 0,
    maximumFractionDigits: decimals ?? 2,
  });
}

function unitSuffix(unit) {
  return unit === "%" ? "%" : unit ? ` ${unit}` : "";
}

function sentence(value) {
  const text = String(value ?? "").trim();
  return /[.!?]$/u.test(text) ? text : `${text}.`;
}

function upperFirst(value) {
  const text = String(value ?? "");
  return `${text.charAt(0).toLocaleUpperCase("en-US")}${text.slice(1)}`;
}
