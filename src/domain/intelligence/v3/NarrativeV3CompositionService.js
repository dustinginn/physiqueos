import { V3_SCHEMA, deepFreeze, round, semanticFingerprint } from "./V3Runtime.js";

const FIRST_PERSON_SINGULAR = new Set(["i", "me", "my", "mine", "myself", "i'm", "i’m", "i’ve", "i've", "i’d", "i'd", "i’ll", "i'll"]);
const RAW_ENGINE_LANGUAGE = [
  /\b(?:not_assessed|stable_success|outside_target|no_meaningful_change|strategy_supported|strategy_testing|confirm_persistence)\b/iu,
  /\bconfigured guardrail\b/iu,
  /\bno conclusion was manufactured\b/iu,
  /\bRecommendation:\s*/u,
  /\bReason:\s*/u,
];

export function composeNarrativeV3({ goalContract, interpretation, confidence, surface, priorNarrativePlan = null, evaluatedAt }) {
  const primaryObjective = interpretation.objectiveFindings.find((item) => item.priority === "primary") ??
    interpretation.objectiveFindings[0] ?? null;
  const context = narrativeContext(goalContract, interpretation, primaryObjective);
  context.confidence = confidence;
  const publicationContext = {
    kind: interpretation.evaluationContext.type === "event_evidence_boundary" ? "event" : "recurring",
    publishedAt: evaluatedAt,
    eventName: goalContract.vocabulary?.evidence?.eventName ?? "recent check",
  };
  const recencyHours = priorNarrativePlan?.publicationContext?.publishedAt ?
    (Date.parse(evaluatedAt) - Date.parse(priorNarrativePlan.publicationContext.publishedAt)) / 3600000 : null;
  context.recentEventFollowup = Boolean(publicationContext.kind === "recurring" &&
    priorNarrativePlan?.publicationContext?.kind === "event" &&
    priorNarrativePlan.authoritativeFindingCommunicated &&
    priorNarrativePlan.strategicInterpretationId === interpretation.predecessorInterpretationId &&
    recencyHours >= 0 && recencyHours <= goalContract.narrativePolicy.recentEventHours &&
    confidence.projectionPolicy.mode === "continuity_hold" &&
    priorNarrativePlan.recommendation.action === interpretation.recommendation.action &&
    interpretation.recommendation.action === "continue_current_strategy" &&
    interpretation.strategyEffectiveness.feasibility === "demonstrated");
  context.priorEventName = priorNarrativePlan?.publicationContext?.eventName ?? "recent check";
  context.priorConfidenceMovement = priorNarrativePlan?.primaryConfidenceSnapshot?.delta ?? 0;
  const primaryConfidenceSnapshot = { percentage: confidence.currentPercentage, delta: confidence.delta, movement: confidence.movement };
  const confidenceBriefing = { ...composeConfidenceBriefing(context), ...primaryConfidenceSnapshot };
  const confidenceDeepExplanation = composeConfidenceDeepExplanation(context);
  const sections = {
    result: composeResult(context),
    meaning: composeMeaning(context),
    action: composeAction(context),
    watch: composeWatch(context),
    confidence: `${confidenceBriefing.heading}\n${confidenceBriefing.body}`,
  };
  const paragraphs = Object.values(sections).filter(Boolean);
  const headline = firstSentence(sections.result ?? sections.meaning ?? sections.action);
  const coachTake = composeCoachTake(context);
  const finalNarrative = paragraphs.join("\n\n");
  assertNarrativeV3Voice(`${finalNarrative}\n${coachTake}\n${JSON.stringify(confidenceDeepExplanation)}`);

  const semantic = {
    schemaVersion: V3_SCHEMA.narrativePlan,
    surface,
    goalId: goalContract.goalId,
    strategicInterpretationId: interpretation.id,
    confidenceAssessmentId: confidence.id,
    primaryConfidenceSnapshot,
    latestMeaningfulConfidenceChange: confidence.delta !== 0 ? { ...primaryConfidenceSnapshot, assessmentId: confidence.id } : priorNarrativePlan?.goalId === goalContract.goalId ? priorNarrativePlan.latestMeaningfulConfidenceChange ?? null : null,
    nextEvidence: context.nextEvidence,
    publicationContext,
    authoritativeFindingCommunicated: interpretation.objectiveFindings.some((item) =>
      item.changedThisEvaluation && ["decisive", "material"].includes(item.authority) &&
      item.quality === "robust" && item.significance === "major"),
    continuityPolicy: { mode: context.recentEventFollowup ? "recent_event_followup" : "full_briefing", recencyHours, priorNarrativePlanId: priorNarrativePlan?.id ?? null },
    confidenceBriefing,
    confidenceDeepExplanation,
    biggestTakeaway: { ...interpretation.biggestTakeaway, text: headline },
    objectiveStates: interpretation.objectiveFindings.map((item) => ({
      objectiveId: item.objectiveId,
      state: item.state,
      significance: item.significance,
      freshness: item.freshness,
    })),
    goalAchievement: interpretation.goalAchievement,
    strategyEffectiveness: interpretation.strategyEffectiveness,
    guardrailStates: interpretation.guardrailFindings.map((item) => ({
      guardrailId: item.guardrailId,
      status: item.status,
    })),
    uncertaintyTypes: interpretation.uncertaintyProfile.map((item) => ({
      type: item.type,
      materiality: item.materiality,
      surfaced: shouldSurfaceUncertainty(item, interpretation),
    })),
    questionTransitions: interpretation.questionTransitions,
    recommendation: interpretation.recommendation,
    nextEvidencePurpose: interpretation.nextCoachingQuestion?.evidencePurpose ?? null,
    coachingAffect: interpretation.coachingAffect,
    vocabularyBindings: structuredClone(goalContract.vocabulary),
    composition: { headline, sections, paragraphs, finalNarrative, coachTake },
  };
  return deepFreeze({
    ...semantic,
    id: `narrative_plan_v3|${semanticFingerprint(semantic).slice(7)}`,
    semanticFingerprint: semanticFingerprint(semantic),
  });
}

export function findNarrativeV3VoiceViolations(value) {
  const text = String(value ?? "");
  const words = text.match(/\p{L}+(?:[’']\p{L}+)*/gu) ?? [];
  const violations = [];
  for (const word of words) {
    if (FIRST_PERSON_SINGULAR.has(word.toLocaleLowerCase("en-US"))) {
      violations.push(`first_person_singular:${word}`);
    }
  }
  for (const pattern of RAW_ENGINE_LANGUAGE) {
    if (pattern.test(text)) violations.push(`engine_language:${pattern.source}`);
  }
  return [...new Set(violations)];
}

function assertNarrativeV3Voice(value) {
  const violations = findNarrativeV3VoiceViolations(value);
  if (violations.length) throw new Error(`Narrative V3 voice invariant failed: ${violations.join(", ")}`);
}

function narrativeContext(goalContract, interpretation, objective) {
  const guardrails = interpretation.guardrailFindings.filter((item) => item.status !== "not_assessed");
  const consequentialGuardrails = guardrails.filter((item) => ["watch", "pressured", "breached"].includes(item.status));
  const objectiveDefinition = goalContract.objectives.find((item) => item.objectiveId === objective?.objectiveId) ?? null;
  return {
    goalContract,
    interpretation,
    objective,
    objectiveDefinition,
    objectiveWords: objectiveVocabulary(goalContract, objectiveDefinition),
    strategyWords: goalContract.vocabulary?.strategy ?? {},
    guardrails,
    consequentialGuardrails,
    primaryGuardrail: highestPriorityGuardrail(consequentialGuardrails) ?? guardrails.find((item) => item.status === "clear") ?? null,
    nextEvidence: resolveNextEvidence(goalContract, interpretation),
  };
}

function resolveNextEvidence(goalContract, interpretation) {
  const question = interpretation.nextCoachingQuestion;
  const purpose = question?.evidencePurpose ?? interpretation.recommendation.nextEvidencePurpose;
  const requests = (goalContract.evidenceRequests ?? []).filter((request) => request.evidencePurpose === purpose &&
    (!request.questionId || request.questionId === question?.questionId) &&
    (!request.strategyRevisionId || request.strategyRevisionId === interpretation.strategyRevisionId));
  const alternatives = requests.flatMap((request) => request.alternatives);
  const words = alternatives.map((alternative) => goalContract.vocabulary?.evidence?.requests?.[alternative.vocabularyKey]);
  const names = new Set(words.map((item) => item?.displayName));
  const known = alternatives.length > 0 && alternatives.every((item) => item.capabilityIds.length > 0) && names.size === 1 && words.every((item) => item?.displayName);
  return {
    purpose, requestIds: requests.map((item) => item.requestId).filter(Boolean),
    capabilityAlternatives: alternatives.map((item) => item.capabilityIds),
    displayName: known ? words[0].displayName : "check",
    grammaticalNumber: known && words[0].grammaticalNumber === "plural" ? "plural" : "singular",
    namedFromBinding: Boolean(known),
    timing: requests.length === 1 ? requests[0].timing : null,
  };
}

function nextEvidenceName(context) { return `the next ${context.nextEvidence.displayName}`; }
function nextEvidenceVerb(context) { return context.nextEvidence.grammaticalNumber === "plural" ? "are" : "is"; }
function continuationPhrase(context) { return context.objectiveWords.continuationPhrase ?? (isMaintenanceObjective(context.objectiveDefinition) ? "this stability" : "this level of progress"); }

function composeResult(context) {
  const { interpretation, objective } = context;
  if (!objective || objective.state === "not_assessed") {
    return "There is not enough reliable evidence yet to judge the result.";
  }

  const movement = objectiveMovement(context);
  const guardrail = context.primaryGuardrail;
  const guardrailCopy = guardrail ? describeGuardrail(context, guardrail) : null;
  if (context.recentEventFollowup) {
    const signal = interpretation.evidenceSignals.find((item) => item.direction === "supports");
    return [
      `The ${context.priorEventName} already gave a clear answer on ${strategyLabel(context)}: it is working.`,
      signal?.factualSummary ? sentence(signal.factualSummary) : null,
      "Nothing here calls for a change.",
    ].filter(Boolean).join(" ");
  }
  if (objective.freshness === "carried_forward") {
    const currentSignal = interpretation.evidenceSignals.find((item) => item.direction === "supports");
    const signalCopy = currentSignal?.factualSummary ? sentence(currentSignal.factualSummary) : null;
    return [
      `The latest direct result still stands: ${lowerFirst(movement)}`,
      signalCopy ? `The supporting evidence remains encouraging: ${lowerFirst(signalCopy)}` : null,
    ].filter(Boolean).join(" ");
  }

  if (interpretation.coachingAffect.valence === "corrective") {
    if (interpretation.aggregateGuardrailState === "breached") {
      return `The objective moved forward, but the limit takes priority. ${movement} ${guardrailCopy}`;
    }
    return `This needs attention. ${movement}`;
  }

  if (["stable_success", "satisfied"].includes(objective.state) && isMaintenanceObjective(context.objectiveDefinition)) {
    return `This is exactly what success looks like here. ${movement}`;
  }

  if (["progressed", "satisfied", "stable_success"].includes(objective.state)) {
    if (interpretation.coachingAffect.intensity === "strong") {
      return `This is a huge win. ${stripPeriod(movement)}${guardrailCopy ? `, while ${lowerFirst(stripPeriod(guardrailCopy))}.` : "."}`;
    }
    if (context.consequentialGuardrails.length) {
      return `This is a strong result, with one important caveat. ${movement} ${guardrailCopy}`;
    }
    return `Good progress. ${movement}`;
  }

  if (["regressed", "outside_target"].includes(objective.state)) return `This moved the wrong way. ${movement}`;
  return `The result is essentially unchanged. ${movement}`;
}

function composeMeaning(context) {
  const { goalContract, interpretation, objective } = context;
  const strategy = strategyLabel(context);
  const progress = goalProgressSentence(context);
  const inherited = interpretation.strategyEffectiveness.continuity?.inherited;
  if (context.recentEventFollowup) return null;
  let strategyMeaning;

  if (["challenged", "refuted"].includes(interpretation.strategyEffectiveness.feasibility)) {
    strategyMeaning = `The latest evidence is strong enough to question ${strategy}. The earlier result still belongs in the record, but the plan should not continue unchanged.`;
  } else if (interpretation.strategyEffectiveness.feasibility === "demonstrated") {
    strategyMeaning = inherited ?
      `${upperFirst(strategy)} is working, and nothing here changes that conclusion.` :
      interpretation.recommendation.action === "continue_current_strategy" ?
        `${upperFirst(strategy)} is clearly working. There is no reason to second-guess the approach.` :
        `${upperFirst(strategy)} is producing progress, but ${naturalList(context.consequentialGuardrails.map((item) => guardrailLabel(goalContract, item)))} still ${context.consequentialGuardrails.length > 1 ? "need" : "needs"} attention.`;
  } else if (interpretation.strategyEffectiveness.feasibility === "testing") {
    strategyMeaning = `The direction may be encouraging, but there is not enough yet to know whether ${strategy} is doing the job.`;
  } else {
    strategyMeaning = `There is not enough useful evidence yet to judge ${strategy}.`;
  }

  if (isMaintenanceObjective(context.objectiveDefinition) && ["stable_success", "satisfied"].includes(objective?.state)) {
    strategyMeaning = `Holding the target range is the win for ${goalContract.vocabulary?.goal?.displayName ?? goalContract.goalLabel}. ${upperFirst(strategy)} is doing its job.`;
  }
  return [progress, strategyMeaning].filter(Boolean).join(" ");
}

function composeAction(context) {
  const { goalContract, interpretation, consequentialGuardrails, strategyWords } = context;
  const action = interpretation.recommendation.action;
  const continueAction = sentence(safeCoachingActions(context).join(". ") || "Keep executing consistently");
  const reconsideration = strategyWords.reconsiderationTrigger ?
    ` Reconsider only ${lowerFirst(stripPeriod(strategyWords.reconsiderationTrigger))}.` : "";

  if (action === "pause_and_investigate") {
    const names = naturalList(consequentialGuardrails.map((item) => guardrailLabel(goalContract, item)));
    return `Stop pushing the current plan and address ${names || "the limit that was crossed"} first.`;
  }
  if (action === "review_strategy") return "Review the plan before continuing unchanged. The new result is meaningful enough to require a real adjustment.";
  if (action === "transition_goal") return "The goal has been reached. Lock in the result and choose the next target before extending the current plan.";
  if (action === "transition_phase") return `Move into ${goalContract.phase.nextPhaseLabel ?? "the next planned phase"}. The current phase did what it needed to do.`;
  if (action === "continue_with_guardrail_monitoring") {
    const names = naturalList(consequentialGuardrails.map((item) => guardrailLabel(goalContract, item)));
    return `Keep the parts that are working, but tighten attention around ${names}.${reconsideration}`;
  }
  if (interpretation.strategyEffectiveness.feasibility === "demonstrated") {
    return context.recentEventFollowup ? "Stay consistent and keep the plan where it is." :
      `Stay the course. There is no reason to change the plan right now. ${continueAction}${reconsideration}`;
  }
  return `Keep the plan steady while the next useful check comes in. ${continueAction}`;
}

function composeWatch(context) {
  const { interpretation, objectiveWords, primaryGuardrail } = context;
  const purpose = interpretation.nextCoachingQuestion?.evidencePurpose ?? interpretation.recommendation.nextEvidencePurpose;
  const objectivePhrase = objectiveWords.ongoingPhrase ?? `${objectiveLabel(context)} keeps moving in the right direction`;
  const guardrailPhrase = primaryGuardrail?.status === "clear" ?
    ` while ${guardrailLabel(context.goalContract, primaryGuardrail)} stays in a good place` : "";

  if (purpose === "confirm_persistence") {
    if (context.recentEventFollowup) return `${upperFirst(nextEvidenceName(context))} will show whether ${objectivePhrase} continues${guardrailPhrase}.`;
    const contrast = interpretation.strategyEffectiveness.feasibility === "demonstrated" ?
      "—not whether the plan works. That question has been answered" : "";
    return `${upperFirst(nextEvidenceName(context))} ${nextEvidenceVerb(context)} about whether ${objectivePhrase} continues${guardrailPhrase}${contrast}.`;
  }
  if (purpose === "establish_feasibility") return `${upperFirst(nextEvidenceName(context))} should show whether ${strategyLabel(context)} is moving ${objectiveLabel(context)} in the right direction.`;
  if (purpose === "resolve_contradiction") return `${upperFirst(nextEvidenceName(context))} should resolve whether the latest setback is a real change or a one-off result.`;
  if (purpose === "assess_guardrail") return `${upperFirst(nextEvidenceName(context))} should show whether ${naturalList(context.consequentialGuardrails.map((item) => guardrailLabel(context.goalContract, item)))} ${context.consequentialGuardrails.length > 1 ? "are" : "is"} back where ${context.consequentialGuardrails.length > 1 ? "they need" : "it needs"} to be.`;
  if (purpose === "improve_measurement_quality") return "A cleaner, more complete measurement is the next useful step.";
  if (purpose === "improve_attribution") return "Keep the plan stable long enough for the next result to show what is actually driving the change.";
  if (purpose === "establish_phase_readiness") return `${upperFirst(nextEvidenceName(context))} should show whether this phase has earned the planned transition.`;
  if (purpose === "update_forecast") return `${upperFirst(nextEvidenceName(context))} should update how quickly the goal is likely to arrive.`;

  const surfaced = interpretation.uncertaintyProfile.filter((item) => shouldSurfaceUncertainty(item, interpretation));
  if (surfaced.some((item) => ["measurement_coverage", "objective_measurement"].includes(item.type))) {
    return "The next useful step is a cleaner, more complete result.";
  }
  return null;
}

function composeCoachTake(context) {
  const { interpretation, objective, strategyWords, primaryGuardrail } = context;
  if (!objective || objective.state === "not_assessed") {
    return "Hold the plan steady for now. The next useful result needs to be clean enough to guide a decision.";
  }
  if (context.recentEventFollowup) {
    return `The plan is doing its job. Keep the focus on consistent execution; ${nextEvidenceName(context)} ${nextEvidenceVerb(context)} about continued progress.`;
  }
  if (interpretation.recommendation.action === "transition_goal") {
    return "The goal has been reached. Protect the result and choose the next target rather than keep extending the current plan.";
  }
  if (interpretation.recommendation.action === "pause_and_investigate") {
    return `${objectiveMovement(context)} But ${lowerFirst(describeGuardrail(context, primaryGuardrail))} Stop pushing and fix that first.`;
  }
  if (interpretation.recommendation.action === "review_strategy") {
    return `${objectiveMovement(context)} That is enough to question the current plan. Review it before the next block.`;
  }
  if (interpretation.recommendation.action === "continue_with_guardrail_monitoring") {
    return `${objectiveMovement(context)} Keep the progress, but address ${naturalList(context.consequentialGuardrails.map((item) => guardrailLabel(context.goalContract, item)))} before pushing harder.`;
  }

  const progress = goalProgressSentence(context);
  const result = stripPeriod(objectiveMovement(context));
  const guardrail = primaryGuardrail?.status === "clear" ? compactGuardrail(context, primaryGuardrail) : null;
  const watch = composeWatch(context);
  const execute = sentence(strategyWords.executeAction ?? "Keep executing");

  if (interpretation.coachingAffect.intensity === "strong" && interpretation.strategyEffectiveness.feasibility === "demonstrated") {
    const fraction = confidenceTrajectory(context)?.fractionAchieved;
    const position = fraction > 0.5 && fraction < 1 ? "The goal is more than halfway there, and the plan is clearly working." : "The plan is clearly working.";
    const phase = context.goalContract.vocabulary?.phase?.contextName ?? "this phase";
    return `This is exactly what ${phase} needed: ${lowerFirst(stripPeriod(objectiveMovement(context, { includeComparison: false })))}${guardrail ? `, with ${guardrail}.` : "."} ${position} Don't change it. ${stripPeriod(execute)} and use ${nextEvidenceName(context)} to see whether ${continuationPhrase(context)} continues.`;
  }
  if (interpretation.strategyEffectiveness.feasibility === "demonstrated") {
    const acceptedResult = objective.freshness === "carried_forward" ?
      `The direct result still stands: ${lowerFirst(stripPeriod(objectiveMovement(context)))}.` : `${upperFirst(result)}.`;
    return [progress, `${acceptedResult} The plan is working.`, `Stay consistent. ${execute}`, watch].filter(Boolean).join(" ");
  }
  return [result, composeAction(context), watch].filter(Boolean).join(" ");
}

function objectiveMovement(context, { includeComparison = true } = {}) {
  const { objective, objectiveWords } = context;
  const label = objectiveLabel(context);
  const value = formatValue(objective.currentValue, objective.unit, objectiveWords.decimals);
  const change = formatValue(Math.abs(objective.change ?? 0), objective.unit, objectiveWords.decimals);
  const since = includeComparison && objective.comparisonAt ? ` since ${formatDate(objective.comparisonAt)}` : "";

  if (["stable_success", "satisfied"].includes(objective.state) && isMaintenanceObjective(context.objectiveDefinition)) {
    return `${upperFirst(label)} held where it needs to be at ${value}.`;
  }
  if (objective.change != null && ["progressed", "satisfied"].includes(objective.state)) {
    if (objectiveWords.progressVerb) {
      const subject = objectiveWords.subject ?? "You";
      return `${upperFirst(subject)} ${objectiveWords.progressVerb} ${change} of ${label}${since}.`;
    }
    return `${upperFirst(label)} improved by ${change}${since}, reaching ${value}.`;
  }
  if (objective.change != null && ["regressed", "outside_target"].includes(objective.state)) {
    return `${upperFirst(label)} moved away from the target by ${change}${since}, landing at ${value}.`;
  }
  return `${upperFirst(label)} is ${value}.`;
}

function describeGuardrail(context, finding) {
  if (!finding) return null;
  const words = guardrailVocabulary(context.goalContract, finding);
  const label = words.displayName ?? finding.metricCapability.displayName;
  const value = formatValue(finding.currentValue, finding.unit, words.decimals);
  if (finding.status === "clear") return `${upperFirst(label)} stayed ${words.clearDescription ?? "in a good place"} at ${value}.`;
  if (finding.status === "watch") return `${upperFirst(label)} is worth watching at ${value}.`;
  if (finding.status === "pressured") return `${upperFirst(label)} is pressing the limit at ${value}.`;
  return `${upperFirst(label)} moved outside the acceptable range at ${value}.`;
}

function compactGuardrail(context, finding) {
  const words = guardrailVocabulary(context.goalContract, finding);
  const label = words.displayName ?? finding.metricCapability.displayName;
  const value = formatValue(finding.currentValue, finding.unit, words.decimals);
  if (finding.status === "clear") return `${lowerFirst(label)} still ${words.clearDescription ?? "in a good place"} at ${value}`;
  return lowerFirst(stripPeriod(describeGuardrail(context, finding)));
}

function goalProgressSentence(context) {
  const { goalContract, interpretation, objective, objectiveDefinition } = context;
  if (!objective || !objectiveDefinition || isMaintenanceObjective(objectiveDefinition)) return null;
  if (["achieved", "exceeded"].includes(interpretation.goalAchievement)) {
    return `You reached ${goalContract.vocabulary?.goal?.displayName ?? goalContract.goalLabel}.`;
  }
  if (interpretation.goalAchievement !== "in_progress") return null;
  const ratio = confidenceTrajectory(context)?.fractionAchieved;
  const goal = goalContract.vocabulary?.goal?.displayName ?? goalContract.goalLabel;
  if (ratio > 0.5 && ratio < 1) return `You are more than halfway to ${goal}.`;
  if (ratio === 0.5) return `You are halfway to ${goal}.`;
  return null;
}

function safeCoachingActions(context) {
  return context.goalContract.strategy.coachingActions.filter((action) =>
    action.recommendationActions.includes(context.interpretation.recommendation.action) &&
    action.requires.every((requirement) => {
      const collection = requirement.subjectType === "objective" ? context.interpretation.objectiveFindings : context.interpretation.guardrailFindings;
      const finding = collection.find((item) => (item.objectiveId ?? item.guardrailId) === requirement.subjectId);
      const state = finding?.state ?? finding?.status;
      return state !== "not_assessed" && requirement.acceptedStates.includes(state);
    })).map((action) => stripPeriod(action.text));
}

function confidenceTrajectory(context) {
  return context.confidence.goalAchievementOutlook.objectives.find((item) => item.objectiveId === context.objective?.objectiveId)?.trajectory ?? null;
}

function composeConfidenceBriefing(context) {
  const { confidence, interpretation, primaryGuardrail } = context;
  const arrow = confidence.delta > 0 ? "↑" : confidence.delta < 0 ? "↓" : "—";
  const heading = `confidence · ${confidence.currentPercentage}% ${arrow}`;
  if (context.recentEventFollowup) {
    const executionName = context.goalContract.vocabulary?.evidence?.executionName;
    const previousMove = context.priorConfidenceMovement > 0
      ? " after the recent repricing" : "";
    return { heading, body: `Confidence holds${previousMove}. ${executionName && confidence.execution.state === "supportive" ? `${executionName} still supports the plan, and nothing here changes the outlook.` : "Nothing here changes the outlook."}` };
  }
  if (confidence.delta < 0) {
    const reason = interpretation.aggregateGuardrailState === "breached" ? lowerFirst(stripPeriod(describeGuardrail(context, context.consequentialGuardrails[0]))) :
      confidence.execution.state === "deteriorating" ? "execution has meaningfully departed from the plan" :
        ["challenged", "refuted"].includes(interpretation.strategyEffectiveness.feasibility) ? "the latest result calls the plan into question" : "the remaining work is becoming harder to fit into the available time";
    return { heading, body: `Confidence fell because ${reason}. ${interpretation.recommendation.action === "pause_and_investigate" ? "Address that first before pushing ahead." : "The next useful check needs to show that the outlook is improving."}` };
  }
  if (confidence.delta === 0) {
    return { heading, body: confidence.projectionPolicy.mode === "continuity_hold" ?
      "Confidence holds. Nothing new changes the accepted outlook for the goal." :
      "Confidence holds. The latest context does not materially change the outlook for reaching the goal." };
  }
  if (confidence.projectionPolicy.mode === "execution_update") {
    return { heading, body: `Confidence moved up because consistent execution is supporting the goal. ${interpretation.strategyEffectiveness.feasibility === "demonstrated" ? `The plan is working; ${nextEvidenceName(context)} still needs to confirm that progress continued.` : "The next useful result still needs to show that the effort is delivering."}` };
  }
  const trajectory = confidenceTrajectory(context);
  const strong = context.objective?.significance === "major" && context.objective?.quality === "robust";
  const opening = confidence.delta >= 10
    ? "Confidence increased sharply" : "Confidence increased";
  const result = context.objective?.state !== "not_assessed" ? stripPeriod(objectiveMovement(context)) : null;
  const guardrail = primaryGuardrail?.status === "clear" ? compactGuardrail(context, primaryGuardrail) : null;
  const progress = goalProgressSentence(context);
  const time = trajectory?.deadlineContributionApplicable && trajectory.scheduleState === "ahead_with_reserve" ?
    `There is enough time left to finish ahead of schedule if ${continuationPhrase(context)} continues.` :
      trajectory?.deadlineContributionApplicable && trajectory.scheduleState === "at_risk" ?
        "There is still uncertainty about finishing within the remaining time if progress slows." : null;
  return { heading, body: [
    `${opening} because ${strong ? "the plan delivered a standout result" : "the outlook improved"}${result ? `: ${lowerFirst(result)}${guardrail ? `, with ${guardrail}` : ""}` : ""}.`,
    progress,
    time,
  ].filter(Boolean).join(" ") };
}

function composeConfidenceDeepExplanation(context) {
  const { confidence, interpretation, primaryGuardrail } = context;
  const trajectory = confidenceTrajectory(context);
  const remaining = trajectory?.kind === "scalar_target" ?
    `${formatValue(trajectory.remainingRequirement, context.objective.unit, context.objectiveWords.decimals)} remain${trajectory.timeRemainingDays != null ? ` with ${trajectory.timeRemainingDays} days left` : ""}.` :
      trajectory?.kind === "range_duration" ? trajectory.remainingRequirement > 0 ? `${trajectory.remainingRequirement} more successful days are needed.` : "The required period has been completed." : null;
  const demonstrated = interpretation.strategyEffectiveness.feasibility === "demonstrated";
  const nonDirectional = isMaintenanceObjective(context.objectiveDefinition) || trajectory?.kind === "state";
  const time = trajectory?.deadlineContributionApplicable && trajectory.scheduleState === "ahead_with_reserve" ?
    `There is enough time to finish ahead of schedule if ${continuationPhrase(context)} continues.` :
      trajectory?.deadlineContributionApplicable && trajectory.scheduleState === "at_risk" ? "The remaining work is becoming harder to fit into the available time." : null;
  const support = interpretation.evidenceSignals.find((item) => item.direction === "supports");
  return {
    why: [goalProgressSentence(context), `${upperFirst(strategyLabel(context))} ${demonstrated ? "is clearly working" : "still needs a useful outcome check"}.`, time].filter(Boolean).join(" "),
    whatIncreasedIt: context.objective?.state === "progressed" ? [objectiveMovement(context), ...(primaryGuardrail?.status === "clear" ? [describeGuardrail(context, primaryGuardrail)] : [])] : [],
    whatSupportsItNow: [remaining, confidence.execution.state === "supportive" && support?.factualSummary ? sentence(support.factualSummary) : null].filter(Boolean),
    whatIsHoldingItBack: [
      ...(interpretation.strategyEffectiveness.persistence === "emerging" ? [describeRepeatabilityHorizon(context)] : []),
      ...(confidence.execution.state === "deteriorating" ? ["Recent execution is not matching the plan."] : []),
      ...(context.consequentialGuardrails.length ? context.consequentialGuardrails.map((item) => describeGuardrail(context, item)) : []),
    ],
    whatCouldRaiseIt: [
      ...(confidence.execution.configured ? [`Consistent execution can strengthen confidence before ${nextEvidenceName(context)}.`] : []),
      `${upperFirst(nextEvidenceName(context))} ${demonstrated ? nonDirectional ? "confirming that the target is still being held" : "showing that the progress continues" : "showing a meaningful result"}.`,
      ...(!["achieved", "exceeded"].includes(interpretation.goalAchievement) ? ["Reaching the goal."] : []),
    ],
    whatCouldLowerIt: [
      ...(confidence.execution.configured ? ["Meaningful missed work or persistent departures from the plan."] : []),
      ...context.goalContract.guardrails.filter((guardrail) => context.guardrails.some((finding) => finding.guardrailId === guardrail.guardrailId)).map((guardrail) => describeGuardrailRisk(context, guardrail)),
      nonDirectional ? "A new result no longer meeting the target." : "Progress stalling or a new result contradicting the current outlook.",
      ...(trajectory?.deadlineContributionApplicable ? ["Too much work remaining for the time left."] : []),
    ],
    nextEvidence: composeWatch(context),
    assumptions: [
      "The outlook depends on appropriate continued execution.",
      ...(trajectory?.observedRate != null ? ["The forecast uses a reduced recent rate, not an assumption that the latest result repeats exactly."] : []),
      ...(trajectory?.conditionalUnmeasuredProgress > 0 ? ["Consistent execution supports the outlook, but any progress since the last direct check is still unconfirmed."] : []),
      "This is a coaching outlook, not a measured statistical probability.",
    ],
  };
}

function describeRepeatabilityHorizon(context) {
  const timing = context.nextEvidence.timing;
  const reference = context.confidence.goalAchievementOutlook.asOf;
  const scheduledDays = timing?.scheduledAt && reference ? (Date.parse(timing.scheduledAt) - Date.parse(reference)) / 86400000 : null;
  const days = scheduledDays > 0 ? scheduledDays : timing?.cadenceDays;
  if (days >= 14 && days <= 42) return "One excellent response is not a promise that the next few weeks will match it.";
  if (days > 0) return `One excellent response is not a promise that the next ${Math.ceil(days / 7)} weeks will match it.`;
  return context.nextEvidence.namedFromBinding ? `One excellent response does not guarantee the same result until ${nextEvidenceName(context)}.` : "One excellent response still needs a follow-up to show it can be repeated.";
}

function describeGuardrailRisk(context, guardrail) {
  const finding = context.interpretation.guardrailFindings.find((item) => item.guardrailId === guardrail.guardrailId);
  const label = guardrailLabel(context.goalContract, finding ?? guardrail);
  const evaluation = guardrail.evaluation;
  const riskPhrase = guardrailVocabulary(context.goalContract, finding ?? guardrail).riskPhrases?.[evaluation.mode];
  if (riskPhrase) return `${upperFirst(label)} ${stripPeriod(riskPhrase)}.`;
  if (evaluation.mode === "allowed_range") {
    const unit = guardrail.metricCapability.canonicalUnit;
    const min = formatValue(evaluation.allowedRange.min, unit);
    const max = formatValue(evaluation.allowedRange.max, unit);
    return `${upperFirst(label)} moving outside the intended range of ${min} to ${max}.`;
  }
  if (["minimum", "maximum"].includes(evaluation.mode)) {
    return `${upperFirst(label)} ${evaluation.mode === "minimum" ? "falling below" : "rising above"} ${formatValue(evaluation.threshold, guardrail.metricCapability.canonicalUnit)}.`;
  }
  return `${upperFirst(label)} no longer meeting its intended target.`;
}

function shouldSurfaceUncertainty(item, interpretation) {
  if (item.type === "persistence" && interpretation.nextCoachingQuestion?.evidencePurpose === "confirm_persistence") return false;
  if (item.type === "guardrail" && !["pause_and_investigate", "continue_with_guardrail_monitoring"].includes(interpretation.recommendation.action)) return false;
  if (item.type === "causal_attribution" && interpretation.recommendation.nextEvidencePurpose !== "improve_attribution") return false;
  if (item.type === "measurement" && interpretation.strategyEffectiveness.feasibility === "demonstrated") return false;
  if (item.type === "strategy_feasibility" && interpretation.strategyEffectiveness.continuity?.inherited) return false;
  return ["measurement_coverage", "objective_measurement", "strategy_feasibility"].includes(item.type) &&
    interpretation.strategyEffectiveness.feasibility !== "demonstrated";
}

function objectiveVocabulary(goalContract, objectiveDefinition) {
  const key = objectiveDefinition?.vocabularyKey;
  return {
    ...(goalContract.vocabulary?.objective ?? {}),
    ...(key ? goalContract.vocabulary?.objectives?.[key] ?? {} : {}),
  };
}

function guardrailVocabulary(goalContract, finding) {
  const definition = goalContract.guardrails.find((item) => item.guardrailId === finding.guardrailId);
  return definition ? goalContract.vocabulary?.guardrails?.[definition.vocabularyKey] ?? {} : {};
}

function objectiveLabel(context) {
  return context.objectiveWords.displayName ?? context.objective?.metricCapability.displayName ?? "the primary result";
}

function guardrailLabel(goalContract, finding) {
  return guardrailVocabulary(goalContract, finding).displayName ?? finding.metricCapability.displayName;
}

function strategyLabel(context) {
  return context.strategyWords.displayName ?? context.goalContract.strategy.label ?? "the current plan";
}

function highestPriorityGuardrail(findings) {
  const rank = { watch: 1, pressured: 2, breached: 3 };
  return [...findings].sort((left, right) => rank[right.status] - rank[left.status])[0] ?? null;
}

function isMaintenanceObjective(objective) {
  return ["maintain_range", "stability"].includes(objective?.evaluation?.mode);
}

function formatValue(value, unit, configuredDecimals) {
  if (value == null) return "an unknown value";
  const number = Number(value);
  const decimals = Number.isInteger(Number(configuredDecimals)) ? Number(configuredDecimals) :
    Number.isInteger(number) ? 0 : 1;
  const rendered = round(number, decimals).toFixed(decimals);
  if (unit === "%") return `${rendered}%`;
  return `${rendered}${unit ? ` ${unit}` : ""}`;
}

function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return value;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(date);
}

function firstSentence(value) {
  const match = /^.*?[.!?](?:\s|$)/u.exec(String(value ?? ""));
  return match?.[0]?.trim() ?? value ?? "";
}

function sentence(value) {
  const trimmed = String(value ?? "").trim();
  return /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

function stripPeriod(value) {
  return String(value ?? "").replace(/[.]$/u, "");
}

function lowerFirst(value) {
  return value ? `${value[0].toLocaleLowerCase("en-US")}${value.slice(1)}` : value;
}

function upperFirst(value) {
  return value ? `${value[0].toLocaleUpperCase("en-US")}${value.slice(1)}` : value;
}

function naturalList(items) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
