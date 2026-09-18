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
  operatingPlanDetails,
  result,
  priority,
} = {}) {
  assertCanonicalV3Inputs(goalContract, result);
  assertOperatingPlanDetails(operatingPlanDetails);
  const context = createProjectionContext(goalContract, result);
  const semantic = {
    schemaVersion: "narrative_v3_cross_surface_shadow_preview_v2",
    strategicInterpretationId: result.strategicInterpretation.id,
    confidenceAssessmentId: result.confidence.id,
    narrativePlanId: result.narrativePlan.id,
    activeGoal: projectActiveGoal(context),
    priority: projectPriority(goalContract, priority),
    operatingPlanTraining: projectOperatingPlanPurpose(
      operatingPlanDetails.training),
    operatingPlanEnergy: projectOperatingPlanPurpose(
      operatingPlanDetails.energy),
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

// Shadow-only decision-support and Monthly projections for the final Founder
// review. Like the other shadow projections in this module, these models are
// derived from one completed canonical interpretation and deliberately contain
// no command, mutation, publication or client-wiring payload.
export function createNarrativeV3RemainingSurfaceShadowPreviews({
  goalContract,
  result,
  monthlyIntelligence = null,
} = {}) {
  assertCanonicalV3Inputs(goalContract, result);
  const context = createProjectionContext(goalContract, result);
  const semantic = {
    schemaVersion: "narrative_v3_remaining_surface_shadow_preview_v1",
    strategicInterpretationId: result.strategicInterpretation.id,
    confidenceAssessmentId: result.confidence.id,
    narrativePlanId: result.narrativePlan.id,
    monthly: projectMonthly(context, monthlyIntelligence),
    phaseReview: projectPhaseReview(context),
    goalTransitionReview: projectGoalTransitionReview(context),
    goalHubPreviewNeeded: false,
    photo: {
      v3Plumbing: "PRESERVED",
      founderQualityAcceptance: "DEFERRED",
    },
    publication: {
      mode: "shadow_only",
      persistenceWrites: 0,
      artifactWrites: 0,
      clientWiring: false,
      structuralCommands: 0,
    },
  };
  return deepFreeze({
    ...semantic,
    id: `narrative_v3_remaining_surface_shadow|${semanticFingerprint(
      semantic).slice(7)}`,
  });
}

function assertOperatingPlanDetails(details) {
  for (const type of ["training", "energy"]) {
    const detail = details?.[type];
    if (!detail?.title || !detail?.purpose || !Array.isArray(detail.sections)) {
      throw new Error(`Cross-surface preview requires canonical ${type} Operating Plan detail.`);
    }
  }
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
  return { goalContract, result, interpretation, objective,
    objectiveDefinition, objectiveWords, trajectory, guardrail };
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

function projectPriority(goalContract, priority) {
  if (!priority?.name || !priority?.factualInstruction ||
      !priority?.strategicCapability) {
    throw new Error("Priority preview requires a canonical name, instruction and strategic capability.");
  }
  let coaching;
  const objective = configuredObjectiveName(goalContract);
  if (priority.strategicCapability === "nutrition.protein_execution") {
    coaching = `Consistent protein supports the training and recovery behind the current ${
      objective} goal.`;
  } else if (priority.strategicCapability === "training.execution") {
    coaching = `Completing this work helps preserve the training conditions behind the current ${
      objective} goal.`;
  } else {
    coaching = `This action supports the conditions needed to keep the current ${
      objective} goal moving.`;
  }
  return {
    ownership: "STATIC_GOAL_PHASE_PURPOSE",
    dynamicEvidenceReactive: false,
    density: NARRATIVE_V3_DENSITY.ONE_LINE,
    name: priority.name,
    factualInstruction: sentence(priority.factualInstruction),
    goalRelativeCoaching: sentence(coaching),
  };
}

function projectOperatingPlanPurpose(detail) {
  return {
    ownership: "STATIC_GOAL_PHASE_PURPOSE",
    dynamicEvidenceReactive: false,
    density: NARRATIVE_V3_DENSITY.SHORT,
    title: detail.title,
    purpose: detail.purpose,
    goal: detail.goal,
    startedDate: detail.startedDate,
    status: detail.status,
    sections: detail.sections,
  };
}

function projectMonthly(context, monthlyIntelligence = null) {
  if (monthlyIntelligence) return projectMonthlyFromIntelligence(context,
    monthlyIntelligence);
  const { goalContract, result, interpretation, objective, objectiveWords,
    trajectory, guardrail } = context;
  const narrative = result.narrativePlan;
  const trainingSignal = selectNarrativeSignal(interpretation,
    "LEADING_INDICATOR");
  const energySignal = selectNarrativeSignal(interpretation,
    "DERIVED_ESTIMATE");
  const trainingObservation = interpretation.coachingObservationSelection
    ?.selected?.find((item) => item.domain === "training") ?? null;
  const confidence = result.confidence;
  const phaseName = goalContract.vocabulary?.phase?.displayName ??
    goalContract.phase.label;
  const phaseContext = goalContract.vocabulary?.phase?.contextName ??
    "this phase";
  const progress = progressStatement(objective, objectiveWords, trajectory);
  const progressPercent = Number.isFinite(trajectory?.fractionAchieved)
    ? round(trajectory.fractionAchieved * 100) : null;
  const bodyFat = bodyFatFinding(context);
  const trainingSummary = trainingObservation
    ? trainingObservationSummary(trainingObservation)
    : trainingSignal?.factualSummary ?? null;
  const energySummary = energySignal && wasNarrated(result.narrativePlan,
    energySignal.signalId) ? monthlyEnergyCoaching(context, energySignal) : null;
  const changeThemes = [
    {
      label: "Goal trajectory",
      title: progress,
      body: `${upperFirst(strategyName(goalContract))} has produced a clear result, and the Goal remains in progress.`,
      tone: "baseline",
    },
    trainingSummary ? {
      label: "Training",
      title: trainingObservation
        ? `${trainingObservation.subjectLabel} provided the clearest fresh training signal.`
        : "Training remained productive.",
      body: "That progression supports the current plan without replacing the next outcome check.",
      tone: "training",
    } : null,
    energySummary ? {
      label: "Energy",
      title: "The current Energy setup does not need an adjustment.",
      body: energySummary,
      tone: "energy",
    } : null,
  ].filter(Boolean);
  const watch = naturalMonthlyWatch(context);
  return {
    density: NARRATIVE_V3_DENSITY.FULL,
    cadence: {
      calendarDay: 1,
      recurringPrecedence: true,
    },
    hero: {
      eyebrow: "Monthly Briefing",
      period: `Evidence through ${longDate(confidence.evidenceCutoff ??
        narrative.publicationContext?.publishedAt)}`,
      goal: phaseName,
      confidence: {
        score: confidence.currentPercentage,
        band: confidence.confidenceBand,
        priorScore: confidence.priorPercentage,
        delta: confidence.delta,
        movementDirection: presentationMovement(confidence.movement),
        primaryReason: narrative.confidenceBriefing.body,
        presentationExplanation: narrative.confidenceBriefing.body,
        assessmentId: confidence.id,
        assessmentDate: narrative.publicationContext?.publishedAt,
        evidenceCutoff: confidence.evidenceCutoff,
        goalId: confidence.goalId,
        phaseId: goalContract.phase.phaseId,
        source: "canonical_v3_shadow_projection",
        modelVersion: confidence.policyVersion,
        piVersion: "confidence_v3",
      },
      title: progressPercent == null
        ? `${achievementLabel(interpretation.goalAchievement,
          trajectory)}, and the current plan remains appropriate.`
        : `${progressPercent}% of the Goal is complete, and the plan is working.`,
      thesis: `${progress ?? `${upperFirst(objectiveWords.displayName ??
        "Goal progress")} remains in progress.`} Current training supports continuing the plan, while the next ${
        narrative.nextEvidence.displayName} will show whether that progress continues.`,
      highlights: [
        Number.isFinite(trajectory?.completedRequirement) &&
          Number.isFinite(trajectory?.totalRequirement) ?
          { label: "Goal progress", value: `${number(
          trajectory?.completedRequirement, objectiveWords.decimals)} of ${
          number(trajectory?.totalRequirement)} ${objective?.unit}`,
          detail: `${progressPercent}% complete` } :
          { label: "Goal status", value: achievementLabel(
            interpretation.goalAchievement, trajectory),
          detail: "Based on the current Goal criteria" },
        bodyFat ? { label: "Guardrail", value: `${number(bodyFat.value,
          1)}% body fat`, detail: `Inside the ${guardrail.range} range` } : null,
        { label: "Goal Confidence", value: `${confidence.currentPercentage}%`,
          detail: confidence.delta === 0 ? "Holding steady" :
            `${confidence.delta > 0 ? "Up" : "Down"} ${Math.abs(
              confidence.delta)} points` },
      ].filter(Boolean),
    },
    training: trainingSummary ? {
      eyebrow: "Training Progress",
      title: trainingObservation?.narrativeText ?? trainingSummary,
      summary: trainingSummary,
      interpretation: "That supports keeping the current setup in place; it does not replace the next outcome check.",
      next: "Keep executing the current progression and watch whether the same movements continue to advance.",
    } : null,
    energy: energySummary ? {
      eyebrow: "Energy",
      title: "The current Energy setup still fits the result.",
      summary: energySummary,
      interpretation: "There is no reason to change intake or activity just to make an estimate look different while the realized result and guardrail remain favorable.",
    } : null,
    changes: {
      eyebrow: "What Changed",
      title: "The month strengthened the case for staying the course.",
      themes: changeThemes,
    },
    monthAhead: {
      eyebrow: "Month Ahead",
      title: "Keep the build steady and make the next check count.",
      thesis: `${upperFirst(goalContract.vocabulary?.strategy
        ?.continueAction ?? "Keep executing consistently")}. Nothing in the current evidence calls for a structural change.`,
      guidance: [
        { label: "Continue", value: "Keep the current plan in place.",
          detail: trainingObservation
            ? "Maintain the same progression and execution cadence."
            : "Execution remains supportive." },
        { label: "Watch", value: watch,
          detail: "A watch item is not a reason to change the plan by itself." },
        { label: "Next check", value: `Use the next ${
          narrative.nextEvidence.displayName} to test continuation.`,
        detail: "It is testing whether the response continues, not whether the plan worked." },
        { label: "Confidence", value: `${confidence.currentPercentage}% · ${
          confidence.delta === 0 ? "Holding" : "Changed"}`,
        detail: confidence.delta === 0 ?
          "Current evidence supports the outlook without creating a new movement." :
          confidence.movementReason },
      ],
      coachTake: trainingObservation ? monthlyCoachTake(trainingObservation) :
        narrative.composition?.coachTake ?? trainingSummary,
    },
  };
}

function projectMonthlyFromIntelligence(context, intelligence) {
  const { goalContract, result, guardrail } = context;
  const confidence = result.confidence;
  const rows = new Map(intelligence.sourceMatrix.map((item) =>
    [item.domain, item]));
  const outcome = intelligence.sourceMatrix.find((item) =>
    item.measurementType === "DIRECT_OUTCOME") ?? null;
  const training = rows.get("training_performance");
  const split = rows.get("training_split");
  const nutrition = rows.get("nutrition");
  const energy = rows.get("energy");
  const weight = rows.get("weight");
  const outcomeFacts = outcome?.facts ?? {};
  const outcomeName = outcomeFacts.evidenceName ?? "outcome check";
  const configuredObjective = objectiveName(context);
  const periodName = monthName(intelligence.window.endDate);
  const trainingHighlights = intelligence.selectedHighlights.filter((item) =>
    item.domain === "training");
  const primaryTraining = trainingHighlights[0] ?? null;
  const secondaryTraining = trainingHighlights[1] ?? null;
  const shortBreak = split?.facts?.shortBreaks?.[0] ?? null;
  const progress = Number.isFinite(outcomeFacts.goalProgress) &&
    Number.isFinite(outcomeFacts.goalTarget)
    ? `${number(outcomeFacts.goalProgress, 1)} of ${number(
      outcomeFacts.goalTarget)} ${context.objective?.unit}` : null;
  const progressPercent = Number.isFinite(outcomeFacts.goalFraction)
    ? round(outcomeFacts.goalFraction * 100) : null;
  const guardrailValue = Number.isFinite(outcomeFacts.guardrailValue)
    ? outcomeFacts.guardrailValue : null;
  const nextEvidence = result.narrativePlan.nextEvidence.displayName;
  const trainingSummary = compactSentences([
    secondaryTraining?.headline,
    shortBreak?.returnedAt ? `Training paused for ${shortBreak.days} days and was back on schedule by ${shortDate(shortBreak.returnedAt)}.` : null,
  ]);
  const energySegments = energy?.facts?.segments ?? [];
  const earlyEnergy = energySegments.find((item) =>
    item.segment === "september_1_to_12");
  const laterEnergy = energySegments.find((item) =>
    item.segment === "september_13_to_17");
  const energySummary = monthlyCalibratedEnergyCopy({
    energy, earlyEnergy, laterEnergy, objectiveName: objectiveName(context),
  });
  const phaseName = goalContract.vocabulary?.phase?.displayName ??
    goalContract.phase.label;
  const outcomeTitle = Number.isFinite(outcomeFacts.objectiveChange)
    ? `${number(outcomeFacts.objectiveChange, 1)} ${outcomeFacts.objectiveUnit ??
      context.objective?.unit ?? ""} of ${configuredObjective} made ${periodName} a major step forward.`
    : `${periodName} produced a major step forward.`;
  const changeThemes = [
    outcome ? {
      label: "Goal progress",
      title: outcomeTitle,
      body: guardrailValue == null ? "The Goal moved forward without a confirmed guardrail concern." :
        `${upperFirst(guardrail?.label ?? "The primary guardrail")} was ${number(
          guardrailValue, 1)}%, inside the ${guardrail?.range} guardrail.`,
      tone: "baseline",
    } : null,
    primaryTraining ? {
      label: "Training",
      title: `${training?.facts?.sessionCount ?? "The month"} resistance-training sessions kept the plan moving.`,
      body: shortBreak?.returnedAt
        ? `Training took a ${shortBreak.days}-day pause, then returned to the normal rhythm.`
        : "The month stayed close to the established personal training rhythm.",
      tone: "training",
    } : null,
    nutrition && energy ? {
      label: "Nutrition and Energy",
      title: Number.isFinite(nutrition.facts?.average)
        ? `Protein averaged ${number(nutrition.facts.average, 1)} g/day across ${nutrition.facts.usableDays} logged days.`
        : "Nutrition coverage was strong enough to inform the month.",
      body: "The uneven Energy pattern adds context, but it is not strong enough to override the outcomes or justify a change by itself.",
      tone: "energy",
    } : null,
  ].filter(Boolean);
  const weightContext = Number.isFinite(weight?.facts?.first) &&
    Number.isFinite(weight?.facts?.last)
    ? `Morning weight moved from ${number(weight.facts.first, 1)} to ${number(
      weight.facts.last, 1)} lb, useful context that agrees with the direction of the DEXA without identifying the tissue change by itself.` : null;
  return {
    density: NARRATIVE_V3_DENSITY.FULL,
    cadence: { calendarDay: 1, recurringPrecedence: true },
    hero: {
      eyebrow: "Monthly Briefing",
      period: `Evidence through ${longDate(intelligence.window.cutoff)}`,
      goal: phaseName,
      confidence: {
        score: confidence.currentPercentage,
        band: confidence.confidenceBand,
        priorScore: confidence.priorPercentage,
        delta: intelligence.confidenceConsequence.delta,
        movementDirection: presentationMovement(
          intelligence.confidenceConsequence.movement),
        primaryReason: "Confidence holds because the major result remains intact and the newer evidence supports continuing the plan without proving another outcome change.",
        presentationExplanation: `The ${outcomeName} established major progress. Training kept advancing, the guardrail stayed controlled, and no later evidence overturned that result.`,
        assessmentId: confidence.id,
        assessmentDate: result.narrativePlan.publicationContext?.publishedAt,
        evidenceCutoff: intelligence.window.cutoff,
        goalId: confidence.goalId,
        phaseId: goalContract.phase.phaseId,
        source: "canonical_v3_shadow_projection",
        modelVersion: confidence.policyVersion,
        piVersion: "confidence_v3",
      },
      title: `${periodName} moved the Goal forward, and the current plan still fits.`,
      thesis: compactSentences([
        progress ? `The ${outcomeName} moved the Goal to ${progress} complete.` :
          outcome?.statement,
        primaryTraining ? "Training kept progressing around that result." : null,
        "Nothing else in the month creates a reason to change course.",
      ]),
      highlights: [
        progress ? { label: "Goal progress", value: progress,
          detail: `${progressPercent}% complete` } : null,
        guardrailValue == null ? null : { label: "Guardrail",
          value: `${number(guardrailValue, 1)}% ${guardrail?.label}`,
          detail: `Inside the ${guardrail?.range} range` },
        { label: "Goal Confidence", value: `${confidence.currentPercentage}%`,
          detail: "Holding steady" },
      ].filter(Boolean),
    },
    training: primaryTraining ? {
      eyebrow: "Training Progress",
      title: primaryTraining.headline,
      summary: trainingSummary,
      interpretation: `Those personal bests are useful signs that the productive training environment is continuing; they are not a substitute for the next ${nextEvidence}.`,
      next: "Keep the current progression moving and work every major area back into its normal rhythm after any short break.",
    } : null,
    energy: energy ? {
      eyebrow: "Nutrition and Energy",
      title: "The numbers were uneven, but the practical answer is still clear.",
      summary: energySummary,
      interpretation: "Keep the current intake and activity setup while progress remains strong and body fat stays controlled. Reconsider it if those outcomes or training begin to turn.",
    } : null,
    changes: {
      eyebrow: "What Changed",
      title: "The month added a major Goal result and several useful signs that the setup is still working.",
      themes: changeThemes,
      context: weightContext?.replace("the DEXA", `the ${outcomeName}`),
    },
    monthAhead: {
      eyebrow: "Month Ahead",
      title: `${upperFirst(goalContract.vocabulary?.strategy?.continueAction ??
        `Keep ${phaseContext} steady`)} and protect what is working.`,
      thesis: "Carry the current training and nutrition rhythm forward without chasing day-to-day noise.",
      guidance: [
        { label: "Keep", value: "Continue the current plan.",
          detail: primaryTraining
            ? "Keep applying the same progression while the major movements continue to advance."
            : "Training remains productive." },
        { label: "Tighten", value: "Keep every major training area in the rotation.",
          detail: shortBreak ? "The short break resolved once training resumed; the useful test is whether the normal rhythm now holds." : "No persistent split drift was found." },
        guardrail ? { label: "Protect", value: `Keep ${guardrail.label} inside the ${guardrail.range} guardrail.`,
          detail: "That protects the Goal while the current strategy continues." } : null,
        { label: "Next evidence", value: `Use the next ${nextEvidence} to see whether this rate of progress continues.`,
          detail: "No current evidence calls for changing the plan before then." },
      ].filter(Boolean),
      coachTake: primaryTraining
        ? "The best part of the month is that the big Goal result was not isolated—training kept giving you reasons to trust the setup. Keep that rhythm going."
        : "The month moved in the right direction. Keep the plan steady and let the next result earn the next decision.",
    },
  };
}

function monthlyCalibratedEnergyCopy({ energy, earlyEnergy, laterEnergy,
  objectiveName: configuredObjective }) {
  if (!energy) return null;
  if (earlyEnergy && laterEnergy) {
    return `Energy looked higher earlier in the month and lower across the latest five days. The actual ${configuredObjective} result and productive training do not support changing intake just to make those estimates look smoother.`;
  }
  if (energy.facts?.historicalCalibration === "poor_literal_alignment") {
    return `The Energy numbers did not line up cleanly with the realized ${configuredObjective} result, so they remain useful context rather than a reason to change the plan by themselves.`;
  }
  return "The available Energy pattern supports keeping the current setup while outcomes and guardrails remain favorable.";
}

function compactSentences(values) {
  return values.filter(Boolean).join(" ");
}

function shortDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric",
    timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`));
}

function monthName(value) {
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00.000Z`));
}

function projectPhaseReview(context) {
  const { goalContract, result, interpretation, trajectory, guardrail } = context;
  const achieved = ["achieved", "exceeded"].includes(
    interpretation.goalAchievement);
  const hasNextPhase = Boolean(goalContract.phase.nextPhaseLabel);
  const shouldTransition = achieved && hasNextPhase;
  const currentPhase = goalContract.vocabulary?.phase?.displayName ??
    goalContract.phase.label;
  const nextPhase = goalContract.phase.nextPhaseLabel;
  const progress = Number.isFinite(trajectory?.fractionAchieved)
    ? `${round(trajectory.fractionAchieved * 100)}% of the Goal is complete`
    : `${achievementLabel(interpretation.goalAchievement, trajectory)}`;
  const recommendationLabel = shouldTransition
    ? `Review beginning ${nextPhase}` : `Continue ${currentPhase}`;
  const explanation = shouldTransition
    ? `The current phase has completed its job, and the Goal evidence supports reviewing the planned transition to ${nextPhase}.`
    : `${upperFirst(progress)}. The current phase is still doing its job: the plan has produced meaningful progress, training remains supportive, and ${
      guardrail ? `${guardrail.label} remains inside the ${guardrail.range} guardrail` :
        "no assessed guardrail requires a change"}.`;
  return {
    density: NARRATIVE_V3_DENSITY.MEDIUM,
    eyebrow: "Phase Review",
    recommendationLabel,
    explanation,
    currentEvidence: result.narrativePlan.confidenceDeepExplanation.why,
    changeConditions: phaseChangeConditions(context),
    unresolved: shouldTransition
      ? `Founder review is still required before ${nextPhase} can begin.`
      : `The next ${result.narrativePlan.nextEvidence.displayName} still needs to show whether this response continues.`,
    decisionOptions: [
      shouldTransition ? { label: `Begin ${nextPhase}`, recommended: true } :
        { label: `Continue ${currentPhase}`, recommended: true },
      ...(hasNextPhase && !shouldTransition
        ? [{ label: `Review ${nextPhase}`, recommended: false }] : []),
    ],
    founderAuthority: "This is a recommendation only. Nothing changes until you choose and confirm a decision.",
  };
}

function projectGoalTransitionReview(context) {
  const { goalContract, result, interpretation, trajectory, guardrail } = context;
  const achieved = ["achieved", "exceeded"].includes(
    interpretation.goalAchievement);
  const goalName = goalContract.vocabulary?.goal?.displayName ??
    goalContract.goalLabel;
  const phaseName = goalContract.vocabulary?.phase?.displayName ??
    goalContract.phase.label;
  const strategy = strategyName(goalContract);
  return {
    density: NARRATIVE_V3_DENSITY.MEDIUM,
    eyebrow: "Goal Review",
    status: achieved ? "Ready for completion review" :
      achievementLabel(interpretation.goalAchievement, trajectory),
    recommendationLabel: achieved ? "Review Goal completion and what comes next" :
      `Keep ${goalName} active`,
    explanation: achieved
      ? `The Goal result supports a Founder review of completion before a new Goal is authorized.`
      : Number.isFinite(trajectory?.completedRequirement) &&
        Number.isFinite(trajectory?.totalRequirement)
        ? `No Goal transition is warranted right now. You have completed ${number(
        trajectory?.completedRequirement, 1)} of the ${number(
        trajectory?.totalRequirement)} ${context.objective?.unit}, ${strategy} is working, and ${
        guardrail ? `${guardrail.label} remains inside the ${guardrail.range} guardrail` :
          "no assessed guardrail requires a change"}.`
        : `No Goal transition is warranted right now. ${upperFirst(
          strategy)} remains appropriate, and the current Goal criteria are still in progress.`,
    strategy: achieved ? "The current strategy should remain historical once completion is confirmed." :
      `${upperFirst(strategy)} remains appropriate for ${phaseName}.`,
    nextStructuralAction: achieved
      ? "If you confirm completion, preserve this Goal and its interpretation as history before authorizing the next Goal."
      : `Keep the current Goal and ${phaseName} active. Revisit transition when the Goal is achieved or new evidence materially changes the outlook.`,
    decisionOptions: achieved
      ? [{ label: "Review Goal completion", recommended: true },
        { label: "Continue current Goal", recommended: false }]
      : [{ label: "Continue current Goal", recommended: true }],
    founderAuthority: "You remain the decision-maker. This review does not complete, replace, or transition the Goal.",
  };
}

function selectNarrativeSignal(interpretation, semanticClass) {
  return interpretation.crossDomainSynthesis?.selectedNarrativeSignals?.find(
    (item) => item.semanticClass === semanticClass) ?? null;
}

function wasNarrated(narrativePlan, signalId) {
  return Object.values(narrativePlan.composition?.sectionAllocations ?? {})
    .some((allocation) => allocation.topicKeys?.includes(signalId));
}

function trainingObservationSummary(observation) {
  const basis = observation.evidenceBasis ?? {};
  if (Number.isFinite(basis.currentValue) &&
      Number.isFinite(basis.previousValue)) {
    return `${observation.subjectLabel} moved from ${number(
      basis.previousValue)} to ${number(basis.currentValue)}${
      basis.unit ? ` ${basis.unit}` : ""} across the latest comparable exposures.`;
  }
  return observation.narrativeText;
}

function monthlyCoachTake(observation) {
  return `${observation.subjectLabel} is worth recognizing. Keep building from that progress without changing the broader plan.`;
}

function bodyFatFinding(context) {
  const finding = context.interpretation.guardrailFindings.find((item) =>
    /body.?fat/iu.test(item.metricCapability?.id ?? "") &&
      Number.isFinite(item.currentValue));
  return finding ? { value: finding.currentValue, status: finding.status } : null;
}

function monthlyEnergyCoaching(context, signal) {
  const watch = context.result.narrativePlan.composition?.sections?.watch;
  if (watch && !/paired|derived|estimate-vs|authority|support index/iu.test(
    watch)) return watch;
  if (signal.direction === "supports") {
    return `Energy intake looks compatible with the current ${
      objectiveName(context)} goal. Keep the current setup while the realized result and guardrails remain favorable.`;
  }
  return `The Energy numbers look lower than expected on paper, but the realized result does not support changing the setup on that estimate alone.`;
}

function naturalMonthlyWatch(context) {
  if (context.guardrail) {
    return `Keep ${context.guardrail.label} inside the ${
      context.guardrail.range} guardrail.`;
  }
  const watch = context.result.narrativePlan.composition?.sections?.watch;
  if (watch && !/paired|derived|estimate-vs|authority|support index/iu.test(
    watch)) return watch;
  return `Watch for a meaningful change in ${objectiveName(context)} or current execution.`;
}

function phaseChangeConditions(context) {
  const conditions = [];
  if (context.guardrail) conditions.push(`${upperFirst(
    context.guardrail.label)} moving outside the ${context.guardrail.range} guardrail.`);
  conditions.push("Training performance materially declining across enough comparable work to change the outlook.");
  conditions.push(`The next ${context.result.narrativePlan.nextEvidence.displayName} stalling or contradicting the current result.`);
  conditions.push("The Goal being achieved and ready for completion review.");
  return conditions;
}

function longDate(value) {
  if (!value) return "the current evidence cutoff";
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(new Date(value));
}

function presentationMovement(value) {
  return ({ increase: "increased", decrease: "decreased",
    no_meaningful_change: "held" })[value] ?? value;
}

function configuredObjectiveName(goalContract) {
  const primary = goalContract.objectives.find((item) =>
    item.priority === "primary") ?? goalContract.objectives[0];
  const configured = primary?.vocabularyKey
    ? goalContract.vocabulary?.objectives?.[primary.vocabularyKey]
    : null;
  return configured?.displayName ??
    goalContract.vocabulary?.objective?.displayName ??
    primary?.metricCapability?.displayName ?? "Goal";
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
