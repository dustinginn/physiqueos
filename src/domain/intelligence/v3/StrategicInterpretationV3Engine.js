import { reduceCoachingStateV3 } from "./CoachingStateV3.js";
import { evaluateGoalContract, findingMeetsCriterion } from "./DeclarativeGoalEvaluator.js";
import { resolveGoalRelativeAuthority } from "./GoalRelativeAuthorityResolver.js";
import { synthesizeCrossDomainEvidenceV3 } from "./CrossDomainEvidenceSynthesisV3.js";
import {
  applyEnergyAmbiguityToRecommendation,
  deriveEnergyExecutionV3,
  toUncertaintyProfileEntries,
} from "./EnergyAmbiguityV3.js";
import { selectSpecificCoachingObservationsV3 } from
  "./SpecificCoachingObservationV3.js";
import {
  AUTHORITY_ORDER,
  QUALITY_ORDER,
  V3_SCHEMA,
  allPredicates,
  deepFreeze,
  requiredTimestamp,
  semanticFingerprint,
  uniqueStrings,
} from "./V3Runtime.js";

export function createStrategicInterpretationV3({
  goalContract,
  observations,
  priorInterpretation = null,
  priorCoachingState = null,
  evaluationContext,
}) {
  const evaluatedAt = requiredTimestamp(evaluationContext.evaluatedAt, "evaluationContext.evaluatedAt");
  const authorityBindings = resolveGoalRelativeAuthority({ goalContract, observations });
  const evaluatedGoal = evaluateGoalContract({ goalContract, authorityBindings, priorInterpretation });
  const strategyEffectiveness = evaluateStrategy({
    goalContract,
    authorityBindings,
    evaluatedGoal,
    priorInterpretation,
  });
  const phaseTransitionReady = goalContract.phase.transitionCriteria.length > 0 && allPredicates({
    strategy: strategyEffectiveness,
    goalAchievement: evaluatedGoal.goalAchievement,
    guardrail: { aggregateStatus: evaluatedGoal.aggregateGuardrailState },
  }, goalContract.phase.transitionCriteria);
  const crossDomainSynthesis = synthesizeCrossDomainEvidenceV3({
    authorityBindings,
    evaluatedGoal,
    strategyEffectiveness,
    priorInterpretation,
  });
  const evidenceSignals = crossDomainSynthesis.signals;
  const energyExecution = deriveEnergyExecutionV3({ goalContract, observations });
  const uncertaintyProfile = createUncertaintyProfile({
    goalContract,
    observations,
    evaluatedGoal,
    strategyEffectiveness,
    authorityBindings,
    energyExecution,
  });
  const answerEvidenceIds = uniqueStrings([
    ...evaluatedGoal.objectiveFindings.filter((item) => item.changedThisEvaluation)
      .flatMap((item) => item.evidenceIds),
    ...evaluatedGoal.guardrailFindings.filter((item) => item.changedThisEvaluation)
      .flatMap((item) => item.evidenceIds),
  ]);
  const coachingState = reduceCoachingStateV3({
    goalContract,
    priorCoachingState,
    evaluatedAt,
    interpretationContext: {
      strategy: strategyEffectiveness,
      goalAchievement: evaluatedGoal.goalAchievement,
      guardrail: { aggregateStatus: evaluatedGoal.aggregateGuardrailState },
      phase: { transitionReady: phaseTransitionReady },
      answerEvidenceIds,
    },
  });
  const recommendation = applyEnergyAmbiguityToRecommendation(resolveRecommendation({
    goalContract,
    evaluatedGoal,
    strategyEffectiveness,
    phaseTransitionReady,
    coachingState,
    crossDomainSynthesis,
  }), energyExecution);
  const coachingObservationSelection = selectSpecificCoachingObservationsV3({
    goalContract,
    observations,
    crossDomainSynthesis,
    priorInterpretation,
    evaluationContext: { ...evaluationContext, evaluatedAt },
    recommendation,
  });
  const biggestTakeaway = rankTakeaways({
    evaluatedGoal,
    strategyEffectiveness,
    coachingState,
    uncertaintyProfile,
    evidenceSignals,
    crossDomainSynthesis,
    phaseTransitionReady,
  })[0];
  const coachingAffect = deriveCoachingAffect({
    evaluatedGoal,
    strategyEffectiveness,
    uncertaintyProfile,
    evidenceSignals,
    crossDomainSynthesis,
  });

  const semantic = {
    schemaVersion: V3_SCHEMA.strategicInterpretation,
    goalId: goalContract.goalId,
    goalContractId: goalContract.id,
    phaseId: goalContract.phase.phaseId,
    strategyRevisionId: goalContract.strategy.strategyRevisionId,
    predecessorInterpretationId: priorInterpretation?.id ?? null,
    evaluationContext: {
      type: evaluationContext.type,
      evidenceWindow: structuredClone(evaluationContext.evidenceWindow ?? null),
      evidenceCutoff: evaluationContext.evidenceCutoff,
    },
    objectiveFindings: evaluatedGoal.objectiveFindings,
    goalAchievement: evaluatedGoal.goalAchievement,
    guardrailFindings: evaluatedGoal.guardrailFindings,
    aggregateGuardrailState: evaluatedGoal.aggregateGuardrailState,
    strategyEffectiveness,
    phaseTransitionReady,
    uncertaintyProfile,
    ...(energyExecution.estimate || energyExecution.findings.length || energyExecution.ambiguity.length
      ? { energyExecution: {
        energyStrategy: energyExecution.energyStrategy,
        estimate: energyExecution.estimate,
        findings: energyExecution.findings,
        ambiguityIds: energyExecution.ambiguity.map((item) => item.uncertaintyId),
        variability: energyExecution.variability,
      } } : {}),
    evidenceSignals,
    crossDomainSynthesis,
    coachingObservationSelection,
    coachingStateId: coachingState.id,
    questionTransitions: coachingState.transitions,
    nextCoachingQuestion: coachingState.questions.find((item) =>
      item.questionId === coachingState.nextOpenQuestionId) ?? null,
    recommendation,
    biggestTakeaway,
    coachingAffect,
    evidenceObservationIds: observations.map((item) => item.observationId).sort(),
  };
  const interpretation = deepFreeze({
    ...semantic,
    id: `strategic_interpretation_v3|${semanticFingerprint(semantic).slice(7)}`,
    interpretedAt: evaluatedAt,
    semanticFingerprint: semanticFingerprint(semantic),
    lineage: {
      priorStrategyRevisionId: priorInterpretation?.strategyRevisionId ?? null,
      strategyRevisionChanged: strategyEffectiveness.revisionChanged,
      preservedPriorStrategyState: strategyEffectiveness.priorStrategyState,
    },
  });
  return deepFreeze({ interpretation, coachingState, authorityBindings });
}

function evaluateStrategy({ goalContract, authorityBindings, evaluatedGoal, priorInterpretation }) {
  const revisionId = goalContract.strategy.strategyRevisionId;
  const revisionChanged = Boolean(priorInterpretation && priorInterpretation.strategyRevisionId !== revisionId);
  const priorStrategy = revisionChanged ? null : priorInterpretation?.strategyEffectiveness ?? null;
  const criteria = goalContract.strategy.feasibilityCriteria;
  const criteriaSatisfied = criteria.length > 0 && criteria.every((criterion) => {
    if (criterion.source === "achievement") {
      return criterion.acceptedStates.includes(evaluatedGoal.goalAchievement);
    }
    const collection = criterion.source === "objective" ? evaluatedGoal.objectiveFindings : evaluatedGoal.guardrailFindings;
    return findingMeetsCriterion(collection.find((item) =>
      (item.objectiveId ?? item.guardrailId) === criterion.subjectId), criterion);
  });
  const relevant = authorityBindings.filter((item) => item.usableFor.includes("feasibility"));
  const currentExposureDays = Math.max(0, ...relevant.map((item) => item.exposureDays));
  const currentAdequateExposure = currentExposureDays >= goalContract.strategy.adequateExposure.minimumDays;
  const changedFindings = [
    ...evaluatedGoal.objectiveFindings,
    ...evaluatedGoal.guardrailFindings,
  ].filter((item) => item.changedThisEvaluation);
  const changedCriterionFindings = changedFindings.filter((finding) => criteria.some((criterion) =>
    criterion.source !== "achievement" &&
    (finding.objectiveId ?? finding.guardrailId) === criterion.subjectId));
  const hasNewCriterionEvidence = changedCriterionFindings.length > 0;
  const achievementChanged = criteria.some((criterion) => criterion.source === "achievement") &&
    changedFindings.length > 0;
  const currentDemonstration = criteriaSatisfied && currentAdequateExposure &&
    (hasNewCriterionEvidence || achievementChanged);
  const negativeDecisive = evaluatedGoal.objectiveFindings.some((item) =>
    item.changedThisEvaluation && ["regressed", "outside_target"].includes(item.state) &&
    AUTHORITY_ORDER[item.authority ?? "contextual"] >= AUTHORITY_ORDER.decisive);
  const contradictoryDecisive = relevant.some((item) =>
    item.signalDirection === "contradicts" &&
    AUTHORITY_ORDER[item.role] >= AUTHORITY_ORDER.decisive &&
    QUALITY_ORDER[item.quality.status] >= QUALITY_ORDER.adequate);
  const priorBasisIds = new Set([
    ...(priorInterpretation?.objectiveFindings ?? []).flatMap((item) => item.evidenceIds ?? []),
    ...(priorInterpretation?.guardrailFindings ?? []).flatMap((item) => item.evidenceIds ?? []),
  ]);
  const priorBasisInvalidated = relevant.some((item) => {
    const metadata = item.measurement.metadata ?? {};
    const invalidates = metadata.invalidatesEvidenceIds ?? [];
    return metadata.strategicEvent === "invalidate_prior_basis" ||
      (Array.isArray(invalidates) && invalidates.some((id) => priorBasisIds.has(id)));
  });
  const feasibilityReopened = relevant.some((item) =>
    item.measurement.metadata?.strategicEvent === "reopen_feasibility");
  const challengedByNewEvidence = negativeDecisive || contradictoryDecisive;
  let feasibility = "unknown";
  if (challengedByNewEvidence && priorStrategy?.feasibility === "demonstrated") {
    feasibility = "challenged";
  } else if (currentDemonstration) {
    feasibility = "demonstrated";
  } else if (!priorBasisInvalidated && !feasibilityReopened && priorStrategy?.feasibility) {
    feasibility = priorStrategy.feasibility;
  } else if (relevant.length > 0) {
    feasibility = "testing";
  }

  // Persistence advances only when the evidence that satisfies the configured
  // feasibility criteria is independently new. Execution or another unrelated
  // changed finding can support the outlook, but cannot masquerade as a repeat
  // of the direct outcome that originally demonstrated feasibility.
  const currentDemonstrationFindings = criteria.some((criterion) =>
    criterion.source === "achievement")
    ? evaluatedGoal.objectiveFindings.filter((item) => item.changedThisEvaluation)
    : changedCriterionFindings;
  const currentBasisIds = new Set(currentDemonstrationFindings
    .flatMap((item) => item.evidenceIds ?? []));
  const independentDemonstration = currentDemonstration && [...currentBasisIds].some((id) => !priorBasisIds.has(id));
  let persistence = "not_assessed";
  if (feasibility === "demonstrated") {
    const priorPersistence = priorStrategy?.persistence;
    if (!independentDemonstration && priorPersistence) {
      persistence = priorPersistence;
    } else {
      persistence = priorPersistence === "emerging" ? "repeated" :
        priorPersistence === "repeated" ? "sustained" :
        priorPersistence === "sustained" ? "sustained" : "emerging";
    }
  } else if (feasibility === "challenged") {
    persistence = "disrupted";
  } else if (!priorBasisInvalidated && !feasibilityReopened && priorStrategy?.persistence) {
    persistence = priorStrategy.persistence;
  }

  const preservedPriorConclusion = Boolean(priorStrategy && !currentDemonstration &&
    !challengedByNewEvidence && !priorBasisInvalidated && !feasibilityReopened &&
    feasibility === priorStrategy.feasibility && persistence === priorStrategy.persistence);
  const exposureDays = preservedPriorConclusion ?
    Math.max(currentExposureDays, priorStrategy.exposureDays ?? 0) : currentExposureDays;
  const adequateExposure = exposureDays >= goalContract.strategy.adequateExposure.minimumDays;
  const attributionBindings = authorityBindings.filter((item) => item.usableFor.includes("attribution"));
  const currentAttribution = attributionBindings.some((item) =>
    QUALITY_ORDER[item.quality.status] >= QUALITY_ORDER.adequate &&
    AUTHORITY_ORDER[item.role] >= AUTHORITY_ORDER.material) ? "supported" :
    attributionBindings.length ? "plausible" : "unknown";
  const attribution = preservedPriorConclusion && priorStrategy.attribution !== "unknown" ?
    priorStrategy.attribution : currentAttribution;
  return {
    strategyRevisionId: revisionId,
    feasibility,
    persistence,
    attribution,
    adequateExposure,
    exposureDays,
    revisionChanged,
    continuity: {
      inherited: preservedPriorConclusion,
      reason: preservedPriorConclusion ? "prior_strategy_state_retained" : null,
      currentDemonstration,
      independentDemonstration,
      challengedByAuthoritativeEvidence: challengedByNewEvidence,
      priorBasisInvalidated,
      explicitlyReopened: feasibilityReopened,
    },
    priorStrategyState: revisionChanged ? {
      strategyRevisionId: priorInterpretation.strategyRevisionId,
      feasibility: priorInterpretation.strategyEffectiveness.feasibility,
      persistence: priorInterpretation.strategyEffectiveness.persistence,
      interpretationId: priorInterpretation.id,
    } : null,
  };
}

function createUncertaintyProfile({ goalContract, observations, evaluatedGoal, strategyEffectiveness, authorityBindings, energyExecution = null }) {
  const uncertainties = [];
  const limited = observations.filter((item) => ["limited", "insufficient"].includes(item.quality.status));
  if (limited.length) uncertainties.push(uncertainty("measurement_coverage", "high", limited.flatMap((item) => item.limitations), limited.map((item) => item.observationId)));
  const directWithLimitations = observations.filter((item) => item.directness === "direct" && item.limitations.length);
  if (directWithLimitations.length) uncertainties.push(uncertainty("measurement", "moderate", directWithLimitations.flatMap((item) => item.limitations), directWithLimitations.map((item) => item.observationId)));
  if (["unknown", "testing"].includes(strategyEffectiveness.feasibility)) uncertainties.push(uncertainty("strategy_feasibility", "high", ["qualifying_strategy_response_not_yet_observed"], []));
  if (strategyEffectiveness.feasibility === "demonstrated" && !["sustained"].includes(strategyEffectiveness.persistence)) uncertainties.push(uncertainty("persistence", "high", ["repeat_qualifying_response_required"], []));
  if (strategyEffectiveness.attribution !== "supported" && strategyEffectiveness.attribution !== "strong") uncertainties.push(uncertainty("causal_attribution", "moderate", ["causal_contribution_not_fully_resolved"], []));
  const unassessedGuardrails = evaluatedGoal.guardrailFindings.filter((item) => item.status === "not_assessed");
  if (unassessedGuardrails.length) uncertainties.push(uncertainty("guardrail", "moderate", unassessedGuardrails.map((item) => `unassessed:${item.guardrailId}`), []));
  const objectiveAuthority = authorityBindings.filter((item) => item.subjectType === "objective");
  if (!objectiveAuthority.length && !evaluatedGoal.objectiveFindings.some((item) => item.freshness === "carried_forward")) uncertainties.push(uncertainty("objective_measurement", "high", ["objective_evidence_unavailable"], []));
  uncertainties.push(...toUncertaintyProfileEntries(energyExecution));
  return uncertainties;
}

function uncertainty(type, materiality, reasons, evidenceIds) {
  return {
    uncertaintyId: `uncertainty|${type}|${semanticFingerprint({ reasons, evidenceIds }).slice(7, 23)}`,
    type,
    materiality,
    reasons: uniqueStrings(reasons),
    evidenceIds: uniqueStrings(evidenceIds),
  };
}

function resolveRecommendation({ goalContract, evaluatedGoal, strategyEffectiveness, phaseTransitionReady, coachingState, crossDomainSynthesis }) {
  const nextEvidencePurpose = coachingState.nextEvidencePurpose;
  if (evaluatedGoal.aggregateGuardrailState === "breached") return recommendation("pause_and_investigate", "guardrail_breach", "urgent", nextEvidencePurpose);
  if (["achieved", "exceeded"].includes(evaluatedGoal.goalAchievement) && goalContract.achievementPolicy.onAchieved === "transition_goal") {
    return recommendation("transition_goal", "goal_achieved", "routine", nextEvidencePurpose);
  }
  if (phaseTransitionReady) return recommendation("transition_phase", "phase_criteria_achieved", "routine", nextEvidencePurpose);
  if (["challenged", "refuted"].includes(strategyEffectiveness.feasibility)) return recommendation("review_strategy", "authoritative_contradiction", "attention", nextEvidencePurpose);
  if (crossDomainSynthesis?.recommendationStability?.reason === "new_evidence_confirms_outlook_reversal") {
    return recommendation("review_strategy", "confirmed_leading_reversal", "attention", nextEvidencePurpose);
  }
  if (["watch", "pressured"].includes(evaluatedGoal.aggregateGuardrailState)) return recommendation("continue_with_guardrail_monitoring", strategyEffectiveness.feasibility === "testing" ? "strategy_testing_with_guardrail_watch" : "guardrail_monitoring", "attention", nextEvidencePurpose);
  if (strategyEffectiveness.feasibility === "testing") return recommendation("continue_current_strategy", "strategy_testing", "routine", nextEvidencePurpose);
  if (strategyEffectiveness.feasibility === "unknown") return recommendation("continue_current_strategy", "strategy_unassessed", "routine", nextEvidencePurpose);
  return recommendation("continue_current_strategy", "strategy_supported", "routine", nextEvidencePurpose);
}

function recommendation(action, reason, urgency, nextEvidencePurpose) {
  return { action, reason, urgency, nextEvidencePurpose };
}

function rankTakeaways({ evaluatedGoal, strategyEffectiveness, coachingState, uncertaintyProfile, evidenceSignals, phaseTransitionReady, crossDomainSynthesis }) {
  const candidates = [];
  for (const item of evaluatedGoal.guardrailFindings.filter((finding) => finding.changedThisEvaluation)) {
    const priority = item.status === "breached" ? 100 : item.status === "pressured" ? 90 : item.status === "watch" ? 72 : 35;
    candidates.push({ type: "guardrail", referenceId: item.findingId, priority, reason: `guardrail_${item.status}` });
  }
  if (["achieved", "exceeded", "regressed"].includes(evaluatedGoal.goalAchievement)) candidates.push({ type: "goal_achievement", referenceId: evaluatedGoal.goalAchievement, priority: 95, reason: `goal_${evaluatedGoal.goalAchievement}` });
  for (const transition of coachingState.transitions.filter((item) => item.to === "answered")) candidates.push({ type: "question_transition", referenceId: transition.questionId, priority: 88, reason: "strategic_question_answered" });
  for (const item of evaluatedGoal.objectiveFindings) {
    const freshness = item.changedThisEvaluation ? 0 : -35;
    const authority = { decisive: 15, material: 10, supporting: 5, contextual: 0 }[item.authority] ?? 0;
    const significance = { major: 12, meaningful: 8, minor: 3, none: 0 }[item.significance] ?? 0;
    candidates.push({ type: "objective", referenceId: item.findingId, priority: 55 + freshness + authority + significance, reason: `${item.freshness}_${item.state}` });
  }
  if (phaseTransitionReady) candidates.push({ type: "phase_transition", referenceId: "phase_transition_ready", priority: 86, reason: "phase_criteria_achieved" });
  if (strategyEffectiveness.revisionChanged) candidates.push({ type: "strategy_revision", referenceId: strategyEffectiveness.strategyRevisionId, priority: 82, reason: "new_strategy_scope" });
  if (strategyEffectiveness.continuity?.inherited) candidates.push({ type: "strategy_continuity", referenceId: strategyEffectiveness.strategyRevisionId, priority: 80, reason: "prior_strategy_state_retained" });
  for (const signal of evidenceSignals) candidates.push({ type: "evidence_signal", referenceId: signal.signalId, priority: signal.novel ? signal.direction === "contradicts" ? 78 : signal.direction === "supports" ? 70 : 52 : 38, reason: `${signal.direction}_${signal.quality}` });
  if (crossDomainSynthesis?.tensions?.length) candidates.push({ type: "evidence_reconciliation", referenceId: crossDomainSynthesis.tensions[0].type, priority: 76, reason: crossDomainSynthesis.tensions[0].type.toLocaleLowerCase("en-US") });
  for (const item of uncertaintyProfile.filter((uncertaintyItem) => uncertaintyItem.materiality === "high")) candidates.push({ type: "uncertainty", referenceId: item.uncertaintyId, priority: 60, reason: item.type });
  return candidates.sort((a, b) => b.priority - a.priority || a.referenceId.localeCompare(b.referenceId));
}

function deriveCoachingAffect({ evaluatedGoal, strategyEffectiveness, uncertaintyProfile, evidenceSignals, crossDomainSynthesis }) {
  if (evaluatedGoal.aggregateGuardrailState === "breached") return { valence: "corrective", intensity: "strong", urgency: "urgent", celebrationCeiling: "none", directness: "direct" };
  if (["challenged", "refuted"].includes(strategyEffectiveness.feasibility)) return { valence: "corrective", intensity: "measured", urgency: "attention", celebrationCeiling: "restrained", directness: "direct" };
  if (crossDomainSynthesis?.recommendationStability?.reason === "new_evidence_confirms_outlook_reversal") return { valence: "corrective", intensity: "measured", urgency: "attention", celebrationCeiling: "restrained", directness: "direct" };
  const positiveObjective = evaluatedGoal.objectiveFindings.some((item) => item.changedThisEvaluation && ["progressed", "satisfied", "stable_success"].includes(item.state));
  const strongestPositiveSignificance = evaluatedGoal.objectiveFindings
    .filter((item) => item.changedThisEvaluation && ["progressed", "satisfied", "stable_success"].includes(item.state))
    .reduce((strongest, item) =>
      SIGNIFICANCE_RANK[item.significance] > SIGNIFICANCE_RANK[strongest] ? item.significance : strongest,
    "none");
  const positiveSignal = evidenceSignals.some((item) => item.direction === "supports");
  const inheritedPositiveObjective = strategyEffectiveness.continuity?.inherited &&
    evaluatedGoal.objectiveFindings.some((item) =>
      item.freshness === "carried_forward" &&
      ["progressed", "satisfied", "stable_success"].includes(item.state));
  const highUncertainty = uncertaintyProfile.some((item) => item.materiality === "high");
  const configuredCeilings = evaluatedGoal.guardrailFindings.filter((item) => ["watch", "pressured"].includes(item.status)).map((item) => item.consequencePolicy.celebrationCeiling).filter(Boolean);
  const celebrationCeiling = configuredCeilings[0] ?? "strong";
  if (positiveObjective) {
    const resultIntensity = strongestPositiveSignificance === "major" ? "strong" :
      strongestPositiveSignificance === "meaningful" ? "measured" : "restrained";
    const intensity = celebrationCeiling === "strong" ? resultIntensity :
      celebrationCeiling === "measured" && ["strong", "measured"].includes(resultIntensity) ? "measured" : "restrained";
    return { valence: "positive", intensity, urgency: evaluatedGoal.aggregateGuardrailState === "watch" ? "attention" : "routine", celebrationCeiling, directness: "direct" };
  }
  if (inheritedPositiveObjective && strategyEffectiveness.feasibility === "demonstrated") {
    return { valence: "positive", intensity: "measured", urgency: "routine", celebrationCeiling, directness: "direct" };
  }
  if (positiveSignal) return { valence: "positive", intensity: highUncertainty ? "restrained" : "measured", urgency: evaluatedGoal.aggregateGuardrailState === "watch" ? "attention" : "routine", celebrationCeiling, directness: "measured" };
  return { valence: "neutral", intensity: "restrained", urgency: "routine", celebrationCeiling, directness: "measured" };
}

const SIGNIFICANCE_RANK = { none: 0, minor: 1, meaningful: 2, major: 3 };
