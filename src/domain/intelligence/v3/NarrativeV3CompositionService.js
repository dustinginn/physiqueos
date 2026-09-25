import { ENERGY_AMBIGUITY_CLAUSES_V3 } from "./AmbiguityVocabularyV3.js";
import { V3_SCHEMA, deepFreeze, isSemanticallyEquivalent, round, semanticFingerprint } from "./V3Runtime.js";
import {
  configuredNarrativeCapitalizationTerms,
  naturalizeUserFacingNarrativeProjection,
  naturalizeUserFacingNarrativeText,
} from "../../services/UserFacingObjectLanguageService.js";

const FIRST_PERSON_SINGULAR = new Set(["i", "me", "my", "mine", "myself", "i'm", "i’m", "i’ve", "i've", "i’d", "i'd", "i’ll", "i'll"]);
const RAW_ENGINE_LANGUAGE = [
  /\b(?:not_assessed|stable_success|outside_target|no_meaningful_change|strategy_supported|strategy_testing|confirm_persistence)\b/iu,
  /\bconfigured guardrail\b/iu,
  /\bno conclusion was manufactured\b/iu,
  /\bRecommendation:\s*/u,
  /\bReason:\s*/u,
  /\b(?:direct result|paired (?:energy )?evidence|current operating evidence|estimate-vs-outcome tension|leading-vs-lagging tension|support index|evidence authority|persistence state)\b/iu,
  /\breported intake minus estimated expenditure\b/iu,
  // Undefined generic referents standing in for evidence that was available
  // but not named concretely (the exact defect class the diagnostic found in
  // Confidence's hold/delta-0 explanation): a bare "update"/"signal"/
  // "evidence item" with no concrete subject attached.
  /\b(?:one|an|this) update (?:does not|doesn't|did not|didn't)\b/iu,
  /\ban evidence item\b/iu,
];

export const NARRATIVE_V3_SECTION_PURPOSES = deepFreeze({
  result: "recent_change_worth_knowing",
  meaning: "goal_relative_implication",
  action: "current_coaching_action",
  watch: "specific_bounded_attention",
  confidence: "goal_outlook_movement",
  coachTake: "highest_value_remaining_coaching_point",
});

export function composeNarrativeV3({ goalContract, interpretation, confidence, surface, priorNarrativePlan = null, evaluatedAt }) {
  const primaryObjective = interpretation.objectiveFindings.find((item) => item.priority === "primary") ??
    interpretation.objectiveFindings[0] ?? null;
  const context = narrativeContext(goalContract, interpretation, primaryObjective);
  context.confidence = confidence;
  context.surface = surface;
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
  const currentAuthoritativeEvidenceIds = interpretation.objectiveFindings
    .filter((item) => ["decisive", "material"].includes(item.authority) &&
      ["adequate", "robust"].includes(item.quality))
    .flatMap((item) => item.evidenceIds ?? []);
  context.communicatedEvidenceIds = [...new Set([
    ...(priorNarrativePlan?.communicatedEvidenceIds ?? []),
    ...(publicationContext.kind === "event" ? currentAuthoritativeEvidenceIds : []),
  ])];
  context.anchorPreviouslyCommunicated = currentAuthoritativeEvidenceIds.length > 0 &&
    currentAuthoritativeEvidenceIds.every((id) => context.communicatedEvidenceIds.includes(id));
  context.operatingSignals = interpretation.crossDomainSynthesis?.selectedNarrativeSignals ?? [];
  context.publicationKind = publicationContext.kind;
  context.useRecurringSectionPlan = ["closed_cadence_boundary", "weekly",
    "midweek", "monthly"].includes(interpretation.evaluationContext.type);
  context.specificCoachingObservations =
    interpretation.coachingObservationSelection?.selected ?? [];
  context.reconciliationTensions = interpretation.crossDomainSynthesis?.tensions ?? [];
  context.sectionPlan = allocateNarrativeSections(context);
  const primaryConfidenceSnapshot = { percentage: confidence.currentPercentage, delta: confidence.delta, movement: confidence.movement };
  const casingOptions = {
    preserveTerms: configuredNarrativeCapitalizationTerms(goalContract),
  };
  const confidenceBriefing = naturalizeUserFacingNarrativeProjection({
    ...composeConfidenceBriefing(context), ...primaryConfidenceSnapshot,
  }, casingOptions);
  const confidenceDeepExplanation = naturalizeUserFacingNarrativeProjection(
    composeConfidenceDeepExplanation(context), casingOptions);
  const sections = {
    result: naturalizeUserFacingNarrativeText(composeResult(context),
      casingOptions),
    meaning: naturalizeUserFacingNarrativeText(composeMeaning(context),
      casingOptions),
    action: naturalizeUserFacingNarrativeText(composeAction(context),
      casingOptions),
    watch: naturalizeUserFacingNarrativeText(composeWatch(context),
      casingOptions),
    confidence: `${confidenceBriefing.heading}\n${confidenceBriefing.body}`,
  };
  const paragraphs = Object.values(sections).filter(Boolean);
  const headline = firstSentence(sections.result ?? sections.meaning ?? sections.action);
  if (context.useRecurringSectionPlan) {
    assertHeroOutputBudget({ headline, meaning: sections.meaning });
  }
  const coachTake = naturalizeUserFacingNarrativeText(
    composeCoachTake(context), casingOptions);
  const finalNarrative = paragraphs.join("\n\n");
  assertDistinctSectionComposition({ context, sections, coachTake });
  assertNarrativeV3Voice(`${finalNarrative}\n${coachTake}\n${JSON.stringify(confidenceDeepExplanation)}`);

  const uncertaintyTypes = interpretation.uncertaintyProfile.map((item) => {
    const surfacing = resolveUncertaintySurfacing(item, interpretation, context);
    return {
      type: item.type,
      materiality: item.materiality,
      ...(item.uncertaintyId ? { uncertaintyId: item.uncertaintyId } : {}),
      ...surfacing,
    };
  });
  // Material uncertainty is never silently dropped: it is surfaced in the
  // narrative or it carries an explicit suppression reason.
  const silent = uncertaintyTypes.filter((item) =>
    ["high", "moderate"].includes(item.materiality) && !item.surfaced && !item.suppressionReason);
  if (silent.length) {
    throw new Error(`Narrative V3 dropped material uncertainty without a reason: ${silent.map((item) => item.type).join(", ")}`);
  }

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
      item.quality === "robust" && item.significance === "major") ||
      Boolean(priorNarrativePlan?.authoritativeFindingCommunicated),
    communicatedEvidenceIds: context.communicatedEvidenceIds,
    narrativeSalience: {
      outcomeAnchor: publicationContext.kind === "event" ? "new_finding" :
        context.recentEventFollowup ? "recently_communicated_finding" :
          context.anchorPreviouslyCommunicated ? "background_anchor" : "active_anchor",
      selectedDomainContributions: context.operatingSignals.map((item) => ({
        observationId: item.observationId,
        vocabularyKey: item.vocabularyKey,
        semanticClass: item.semanticClass,
        direction: item.direction,
        salience: item.salience,
      })),
      selectedCoachingObservations: context.specificCoachingObservations.map(
        (item) => ({
          candidateId: item.candidateId,
          topicKey: item.topicKey,
          materialStateKey: item.materialStateKey,
          domain: item.domain,
          type: item.type,
          recommendationMode: item.recommendationCapability.mode,
        }),
      ),
    },
    continuityPolicy: { mode: context.recentEventFollowup ? "recent_event_followup" :
      publicationContext.kind === "recurring" && context.anchorPreviouslyCommunicated &&
        !interpretation.crossDomainSynthesis?.signals?.some((item) => item.novel && item.direction === "contradicts")
        ? "operating_update" : "full_briefing", recencyHours, priorNarrativePlanId: priorNarrativePlan?.id ?? null },
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
    uncertaintyTypes: uncertaintyTypes,
    questionTransitions: interpretation.questionTransitions,
    recommendation: interpretation.recommendation,
    nextEvidencePurpose: interpretation.nextCoachingQuestion?.evidencePurpose ?? null,
    coachingAffect: interpretation.coachingAffect,
    vocabularyBindings: structuredClone(goalContract.vocabulary),
    composition: {
      headline, sections, paragraphs, finalNarrative, coachTake,
      energyAmbiguity: context.energyAmbiguityText ?? null,
      sectionPurposes: NARRATIVE_V3_SECTION_PURPOSES,
      sectionAllocations: context.sectionPlan.allocations,
    },
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

// Recurring-cadence hero budget: a short headline and a one-to-two sentence
// body, so the hero stays a period-level synthesis rather than absorbing
// detail that belongs in a factual module. Deterministic, not a subjective
// LLM check.
const HERO_HEADLINE_MAX_CHARS = 160;
const HERO_BODY_MAX_SENTENCES = 2;

function assertHeroOutputBudget({ headline, meaning }) {
  if (headline && headline.length > HERO_HEADLINE_MAX_CHARS) {
    throw new Error(`Narrative V3 hero headline exceeds ${HERO_HEADLINE_MAX_CHARS} characters: ${headline.length}`);
  }
  const sentenceCount = countSentences(meaning);
  if (sentenceCount > HERO_BODY_MAX_SENTENCES) {
    throw new Error(`Narrative V3 hero body exceeds ${HERO_BODY_MAX_SENTENCES} sentences: ${sentenceCount}`);
  }
}

function countSentences(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  return (text.match(/[.!?](?:\s|$)/gu) ?? []).length || 1;
}

// Semantic-equivalence distinctness within one narrative plan's six main
// surfaces. Confidence's own deep-explanation free text (the Confidence
// detail sheet) is a separate, secondary expansion surface — it may
// legitimately restate supporting context in more depth without that being
// the harmful duplication this guards against, so it is intentionally not
// compared here as a hard-fail invariant (that would block briefing
// generation for many ordinary, legitimate cases). Energy-module and
// confidence-reason cross-file text get the corresponding soft check — an
// omission, not a thrown error — at the presentation-contract boundary in
// `MidweekBriefingPresentationService.js`'s `createMidweekPresentationContract`,
// where Energy's statement and the confidence-reason claim both become
// visible at once.
function assertDistinctSectionComposition({ context, sections, coachTake }) {
  if (!context.useRecurringSectionPlan) return;
  const values = { ...sections, coachTake };
  const entries = Object.entries(values).filter(([, value]) => value);
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length;
      rightIndex += 1) {
      const [leftName, left] = entries[leftIndex];
      const [rightName, right] = entries[rightIndex];
      if (isSemanticallyEquivalent(left, right)) {
        throw new Error(`Narrative V3 section redundancy: ${leftName} and ${rightName}`);
      }
    }
  }
  const usedTopics = new Map();
  for (const [section, allocationValue] of Object.entries(
    context.sectionPlan.allocations)) {
    for (const topic of allocationValue.topicKeys ?? []) {
      if (!topic || ["goal_implication", "recommendation", "next_assessment",
        "confidence_movement", "coach_emphasis", "no_material_change"].includes(topic)) {
        continue;
      }
      if (usedTopics.has(topic)) {
        throw new Error(`Narrative V3 topic reused by ${usedTopics.get(topic)} and ${section}: ${topic}`);
      }
      usedTopics.set(topic, section);
    }
  }
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
  const eligibleRequests = (goalContract.evidenceRequests ?? []).filter((request) =>
    (!request.strategyRevisionId || request.strategyRevisionId === interpretation.strategyRevisionId));
  const requests = eligibleRequests.filter((request) => request.evidencePurpose === purpose &&
    (!request.questionId || request.questionId === question?.questionId) &&
    (!request.strategyRevisionId || request.strategyRevisionId === interpretation.strategyRevisionId));
  // When the question lifecycle is complete, the contract may no longer name a
  // purpose even though it still identifies one unambiguous direct assessment.
  // Preserve that natural name without guessing across multiple alternatives.
  const namingRequests = purpose == null && requests.length === 0
    ? eligibleRequests.filter((request) => !request.questionId)
    : requests;
  const alternatives = namingRequests.flatMap((request) => request.alternatives);
  const words = alternatives.map((alternative) => goalContract.vocabulary?.evidence?.requests?.[alternative.vocabularyKey]);
  const names = new Set(words.map((item) => item?.displayName));
  const known = alternatives.length > 0 && alternatives.every((item) => item.capabilityIds.length > 0) && names.size === 1 && words.every((item) => item?.displayName);
  return {
    purpose, requestIds: namingRequests.map((item) => item.requestId).filter(Boolean),
    capabilityAlternatives: alternatives.map((item) => item.capabilityIds),
    displayName: known ? words[0].displayName : "check",
    grammaticalNumber: known && words[0].grammaticalNumber === "plural" ? "plural" : "singular",
    namedFromBinding: Boolean(known),
    timing: namingRequests.length === 1 ? namingRequests[0].timing : null,
  };
}

function nextEvidenceName(context) { return `the next ${context.nextEvidence.displayName}`; }
function nextEvidenceVerb(context) { return context.nextEvidence.grammaticalNumber === "plural" ? "are" : "is"; }
function continuationPhrase(context) { return context.objectiveWords.continuationPhrase ?? (isMaintenanceObjective(context.objectiveDefinition) ? "this stability" : "this level of progress"); }

// Hero/Result claim scope, from broadest to narrowest. `holistic`/`domain`
// both come from cross-domain synthesis (`context.operatingSignals`, already
// a synthesized signal spanning evidence, not a raw single fact) and are
// treated as one tier here since the current interpretation layer does not
// yet distinguish a period-level synthesis from a single selected domain
// signal; `detail` is a single movement/metric-specific claim
// (`SpecificCoachingObservationV3`). `none` is the generic no-material-change
// fallback. A `detail` claim may win Result/headline ONLY when it is
// deterministically decision-changing (the same primitive already gating a
// second movement into Coach's Take, `evaluateSecondMovementNarrativeAllocation`)
// — never merely because it is the strongest specific claim available.
const NarrativeClaimScope = Object.freeze({
  HOLISTIC: "holistic", DOMAIN: "domain", DETAIL: "detail", NONE: "none",
});

function allocateNarrativeSections(context) {
  if (!context.useRecurringSectionPlan) {
    return { mode: "event_focused", content: {}, allocations: eventAllocations() };
  }
  const [resultObservation, secondObservation] =
    distinctObservationSubjects(context.specificCoachingObservations);
  const energySignal = context.operatingSignals.find((item) =>
    item.semanticClass === "DERIVED_ESTIMATE" &&
    /energy/iu.test(`${item.capabilityId} ${item.vocabularyKey}`));
  // Energy-family evidence speaks through the Energy branch (estimate and
  // ambiguity), never as the week's "result" signal.
  const operatingSignal = context.operatingSignals.find((item) =>
    item !== energySignal && item.factualSummary && !isEnergyFamilySignal(item));
  const signalClauses = coachingClauses(operatingSignal?.factualSummary);
  const resultDecisionChanging = resultObservation?.recommendationCapability?.decisionChanging === true;
  const holisticResultText = signalClauses[0] ? sentence(signalClauses[0]) : null;
  let resultScope = NarrativeClaimScope.NONE;
  const resultText = holisticResultText
    ? (resultScope = NarrativeClaimScope.HOLISTIC, holisticResultText)
    : resultObservation && resultDecisionChanging
      ? (resultScope = NarrativeClaimScope.DETAIL, realizeCoachingObservation(resultObservation, "result"))
      : context.interpretation.recommendation.action === "continue_current_strategy"
        ? "Nothing here calls for a change."
        : null;
  // Confidence's own deep-explanation "what supports it now" independently
  // draws on the same operatingSignals pool (see composeConfidenceDeepExplanation
  // below) — record which signal Result already surfaced so that list doesn't
  // restate it.
  context.resultOperatingSignal = resultScope === NarrativeClaimScope.HOLISTIC
    ? operatingSignal : null;
  // A movement claim that exists but is not decision-changing, and has no
  // holistic signal to defer to, stays out of the hero entirely — it remains
  // available as a structured Training fact, never promoted here merely for
  // being the strongest specific claim on hand.
  const meaningText = recurringMeaning(context, {
    resultObservation: resultScope === NarrativeClaimScope.DETAIL ? resultObservation : null,
    operatingSignal,
  });
  const secondMovementDecision = evaluateSecondMovementNarrativeAllocation({
    candidate: secondObservation,
    recommendationAction: context.interpretation.recommendation.action,
    goalPhaseMeaning: meaningText,
    broadDomainSynthesis: hasBroadDomainSynthesis({
      context, candidate: secondObservation,
    }),
  });
  const coachObservation = secondMovementDecision.allowed
    ? secondObservation : null;
  const actionText = recurringAction(context);
  const energyText = translateEnergyForCoaching(context, energySignal);
  // The Energy module's own factual interpretation now carries this
  // ambiguity text directly (see `composeEnergyStatementV3` in
  // BriefingV3Projection.js) — Watch must not repeat it; Watch stays
  // reserved for the next forward-looking trigger, distinct from any
  // factual-module interpretation.
  const ambiguityText = translateEnergyAmbiguityForCoaching(context);
  context.energyAmbiguityText = ambiguityText;
  const watchText = energyText ?? recurringNextCheck(context);
  const gatedResultObservation = resultScope === NarrativeClaimScope.DETAIL
    ? resultObservation : null;
  const coachText = coachObservation
    ? realizeCoachingObservation(coachObservation, "coach_take")
    : signalClauses[1]
      ? `${upperFirst(sentence(signalClauses[1]))} That is the one area to watch over the next few sessions, not a reason to change the whole plan.`
      : recurringCoachTake(context, { resultObservation: gatedResultObservation, operatingSignal });
  const allocations = {
    result: allocation("recent_change_worth_knowing",
      gatedResultObservation?.topicKey ?? operatingSignal?.signalId ?? "no_material_change",
      {
        scope: resultScope,
        ...(gatedResultObservation ? { candidateIds: [gatedResultObservation.candidateId] } : {}),
        ...(resultObservation && !gatedResultObservation
          ? { suppressedCandidateIds: [resultObservation.candidateId],
            suppressionReason: resultScope === NarrativeClaimScope.HOLISTIC
              ? "detail_subordinate_to_holistic_claim"
              : "detail_not_decision_changing" }
          : {}),
      }),
    meaning: allocation("goal_relative_implication", "goal_implication"),
    action: allocation("current_coaching_action", "recommendation"),
    watch: allocation("specific_bounded_attention",
      energyText ? energySignal?.signalId : "next_assessment"),
    confidence: allocation("goal_outlook_movement", "confidence_movement"),
    coachTake: allocation("highest_value_remaining_coaching_point",
      coachObservation?.topicKey ?? (signalClauses[1]
        ? `${operatingSignal?.signalId}|secondary_angle` : "coach_emphasis"),
      coachObservation ? {
        candidateIds: [coachObservation.candidateId],
        decisionChanging: true,
        allocationReason: "decision_changing",
      } : {
        allocationReason: secondObservation
          ? secondMovementDecision.reasonCode : "broad_synthesis",
        suppressedCandidateIds: secondObservation?.candidateId
          ? [secondObservation.candidateId] : [],
      }),
  };
  return {
    mode: "recurring_distinct_sections",
    content: { result: resultText, meaning: meaningText, action: actionText,
      watch: watchText, coachTake: coachText },
    allocations,
  };
}

export function evaluateSecondMovementNarrativeAllocation({ candidate,
  recommendationAction, goalPhaseMeaning, broadDomainSynthesis } = {}) {
  if (!candidate) return deepFreeze({ allowed: false,
    reasonCode: "no_second_movement" });
  const explicitlyDecisionChanging =
    candidate.recommendationCapability?.decisionChanging === true;
  if (!explicitlyDecisionChanging || !recommendationAction ||
      recommendationAction === "continue_current_strategy") {
    return deepFreeze({ allowed: false,
      reasonCode: "second_movement_not_decision_changing" });
  }
  if (!String(goalPhaseMeaning ?? "").trim()) {
    return deepFreeze({ allowed: false,
      reasonCode: "goal_phase_meaning_not_satisfied" });
  }
  if (!broadDomainSynthesis) return deepFreeze({ allowed: false,
    reasonCode: "broad_domain_synthesis_not_satisfied" });
  return deepFreeze({ allowed: true, reasonCode: "decision_changing" });
}

function hasBroadDomainSynthesis({ context, candidate }) {
  if (!candidate) return false;
  return context.operatingSignals.some((signal) => {
    const source = `${signal.sourceType ?? ""} ${signal.capabilityId ?? ""}`;
    return (candidate.domain !== "energy" &&
        /energy|nutrition|activity/iu.test(source)) ||
      (candidate.domain !== "training" &&
        /training|performance/iu.test(source)) ||
      (candidate.domain !== "weight" &&
        /weight|composition|outcome/iu.test(source));
  });
}

function eventAllocations() {
  return {
    result: allocation("recent_change_worth_knowing", "new_outcome"),
    meaning: allocation("goal_relative_implication", "goal_progress"),
    action: allocation("current_coaching_action", "recommendation"),
    watch: allocation("specific_bounded_attention", "next_assessment"),
    confidence: allocation("goal_outlook_movement", "confidence_movement"),
    coachTake: allocation("highest_value_remaining_coaching_point",
      "event_synthesis", { intentionalEventSynthesis: true }),
  };
}

function allocation(purpose, topicKey, extra = {}) {
  return { purpose, topicKeys: [topicKey].filter(Boolean), ...extra };
}

function distinctObservationSubjects(observations) {
  const result = [];
  const subjects = new Set();
  for (const item of observations) {
    if (subjects.has(item.subjectId)) continue;
    subjects.add(item.subjectId);
    result.push(item);
    if (result.length === 2) break;
  }
  return result;
}

function coachingClauses(value) {
  return String(value ?? "").split(/;\s*/u).map((item) =>
    stripPeriod(item.trim())).filter(Boolean);
}

function recurringMeaning(context, { resultObservation, operatingSignal }) {
  const trainingSignal = /training/iu.test(`${operatingSignal?.capabilityId ?? ""} ${operatingSignal?.vocabularyKey ?? ""} ${operatingSignal?.sourceType ?? ""}`);
  if (resultObservation?.domain === "training" || trainingSignal) {
    const phase = context.goalContract.vocabulary?.phase?.contextName ??
      "this phase";
    const check = context.nextEvidence.namedFromBinding
      ? `${context.nextEvidence.displayName} checks` : "outcome checks";
    return `Training is still moving in the direction ${phase} needs between ${check}.`;
  }
  if (operatingSignal?.semanticClass === "EXECUTION_SUPPORT") {
    return "The work supporting the goal is staying consistent enough to keep the current approach in place.";
  }
  if (operatingSignal?.semanticClass === "LEADING_INDICATOR") {
    return `${upperFirst(operatingSignal.displayLabel ?? "The latest update")} is moving in the direction the goal needs.`;
  }
  if (context.interpretation.strategyEffectiveness.feasibility === "demonstrated") {
    return context.recentEventFollowup
      ? `${upperFirst(context.priorEventName)} already answered the big question; this update is about keeping the productive conditions in place.`
      : "The goal remains on course, and this check-in does not change that.";
  }
  return null;
}

function recurringAction(context) {
  const action = context.interpretation.recommendation.action;
  if (action !== "continue_current_strategy") return null;
  const safe = safeCoachingActions(context)[0] ?? "Keep executing consistently";
  return `${sentence(safe)} Keep the current setup in place.`;
}

function recurringNextCheck(context) {
  const purpose = context.interpretation.nextCoachingQuestion?.evidencePurpose ??
    context.interpretation.recommendation.nextEvidencePurpose;
  if (purpose === "confirm_persistence") {
    const objectivePhrase = context.objectiveWords.ongoingPhrase ??
      `${objectiveLabel(context)} keeps moving in the right direction`;
    const guardrail = context.primaryGuardrail?.status === "clear"
      ? ` while ${guardrailLabel(context.goalContract,
        context.primaryGuardrail)} stays in a good place` : "";
    return `${upperFirst(nextEvidenceName(context))} will show whether ${objectivePhrase} continues${guardrail}.`;
  }
  return composeWatchFallback(context);
}

function recurringCoachTake(context, { resultObservation, operatingSignal }) {
  if (resultObservation) {
    return "This was a useful check-in. Keep building on the result and save adjustments for evidence that would actually change the decision.";
  }
  if (operatingSignal?.direction === "supports") {
    return "This was a useful check-in. Keep stacking work like this and save adjustments for evidence that would actually change the decision.";
  }
  if (context.interpretation.recommendation.action === "continue_current_strategy") {
    return "Nothing needs fixing right now. Keep the next few days clean and consistent.";
  }
  return recurringAction(context);
}

function realizeCoachingObservation(candidate, purpose) {
  const label = coachingSubject(candidate.subjectLabel);
  const basis = candidate.evidenceBasis ?? {};
  if (candidate.type === "volume_milestone") {
    if (purpose === "coach_take") {
      return `${label} hit another session-volume best. That is a real training milestone.`;
    }
    return basis.percentChange != null
      ? `${label} set another session-volume best, ${formatCompactPercent(
        basis.percentChange)} above the previous one.`
      : sentence(candidate.narrativeText);
  }
  if (candidate.type === "longitudinal_progression" &&
      Number(basis.percentChange) > 0) {
    if (purpose === "coach_take") {
      return Number(basis.percentChange) >= 25
        ? `${label} took a nice jump from the previous comparable session. That is worth recognizing.`
        : `${label} moved forward again. That is useful progress to keep building on.`;
    }
    return `${label} improved ${formatCompactPercent(basis.percentChange)} from the previous comparable session.`;
  }
  if (candidate.type === "first_weighted_work") {
    return purpose === "coach_take"
      ? `${label} moved into weighted work for the first time in this phase. That is a big personal milestone.`
      : sentence(candidate.narrativeText);
  }
  if (candidate.type === "load_milestone") {
    return purpose === "coach_take"
      ? `${label} reaching ${formatCoachingMeasurement(basis.currentValue,
        basis.unit)} is a training milestone worth recognizing.`
      : sentence(candidate.narrativeText);
  }
  if (candidate.type === "related_movement_contrast") {
    return sentence(candidate.narrativeText);
  }
  if (candidate.type === "sustained_plateau") {
    return purpose === "coach_take"
      ? `${label} has been flat long enough to deserve attention, but it does not justify changing the whole plan.`
      : sentence(candidate.narrativeText);
  }
  return sentence(candidate.narrativeText);
}

function isEnergyFamilySignal(signal) {
  return /^(?:execution\.energy_|strategy\.energy_|execution\.nutrition|execution\.activity)/u
    .test(String(signal?.capabilityId ?? ""));
}

function translateEnergyForCoaching(context, signal) {
  if (!signal) return null;
  const tension = context.reconciliationTensions.some((item) =>
    item.lowerAuthorityObservationIds.includes(signal.observationId));
  if (tension && context.interpretation.recommendation.action ===
      "continue_current_strategy") return null;
  const guardrail = context.guardrails.find((item) =>
    item.status === "clear" && /fat|composition/iu.test(
      `${item.metricCapability?.id ?? ""} ${guardrailLabel(
        context.goalContract, item)}`));
  if (signal.direction === "supports") {
    const magnitude = signal.significance === "minor"
      ? "a little above the estimate" : "above the estimate";
    return `Energy intake ran ${magnitude} this week. That fits the current goal${guardrail
      ? `; keep an eye on ${guardrailLabel(context.goalContract, guardrail)} as ${phaseReference(context)} continues`
      : ", so no adjustment is needed"}.`;
  }
  if (signal.direction === "contradicts") {
    return "The energy trend is running low enough to watch. If progress or training starts to stall, revisit the current intake setup.";
  }
  return null;
}

// Energy ambiguity branch. The sentence is derived from the structured
// ambiguity types and their reasons (see AmbiguityVocabularyV3), never from
// fixed copy for a single week.
function translateEnergyAmbiguityForCoaching(context) {
  const items = context.interpretation.uncertaintyProfile.filter((item) =>
    item.domain === "energy" && item.recommendationEffect === "temper" &&
    ENERGY_AMBIGUITY_CLAUSES_V3[item.type]);
  if (!items.length) return null;
  const clauses = items.map((item) => ENERGY_AMBIGUITY_CLAUSES_V3[item.type](item));
  // Watch states only the uncertainty itself — what to keep an eye on — not a
  // recommendation. "Keep calorie targets where they are" is action-shaped
  // content and belongs in Action/Recommendation, which already covers the
  // continue_current_strategy case on its own; Watch must not duplicate it.
  return `Treat the calorie estimate as directional: ${naturalList(clauses)}.`;
}

function phaseReference(context) {
  return context.goalContract.vocabulary?.phase?.contextName ?? "this phase";
}

function coachingSubject(value) {
  const text = String(value ?? "This movement");
  return `${text.charAt(0).toLocaleUpperCase("en-US")}${text.slice(1)}`;
}

function formatCompactPercent(value) {
  return `${round(Number(value), 1).toFixed(Number.isInteger(Number(value)) ? 0 : 1)}%`;
}

function composeResult(context) {
  const { interpretation, objective } = context;
  if (!objective || objective.state === "not_assessed") {
    return "There is not enough reliable evidence yet to judge the result.";
  }
  if (context.useRecurringSectionPlan) {
    return context.sectionPlan.content.result;
  }

  const movement = objectiveMovement(context);
  const guardrail = context.primaryGuardrail;
  const guardrailCopy = guardrail ? describeGuardrail(context, guardrail) : null;
  if (context.recentEventFollowup) {
    return [
      `The ${context.priorEventName} already established that ${strategyLabel(context)} is working.`,
      composeOperatingEvidence(context),
      composeEvidenceTension(context),
      "Nothing here calls for a change.",
    ].filter(Boolean).join(" ");
  }
  if (objective.freshness === "carried_forward") {
    const operatingEvidence = composeOperatingEvidence(context);
    return [
      operatingEvidence ?? (interpretation.recommendation.action ===
        "continue_current_strategy"
        ? "Nothing in the current evidence calls for a change."
        : null),
      composeEvidenceTension(context),
      context.anchorPreviouslyCommunicated
        ? `${upperFirst(nextEvidenceName(context))} already established that ${strategyLabel(context)} is working.`
        : `The latest outcome still stands: ${lowerFirst(movement)}`,
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
  if (context.useRecurringSectionPlan) {
    return context.sectionPlan.content.meaning;
  }
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

function composeOperatingEvidence(context) {
  if (context.specificCoachingObservations.length) {
    return context.specificCoachingObservations
      .map((item) => sentence(item.narrativeText)).join(" ");
  }
  const signals = context.operatingSignals.filter((item) => item.factualSummary);
  if (!signals.length) return null;
  const summaries = signals.map((item) => stripPeriod(sentence(item.factualSummary)));
  if (summaries.length === 1) return `${summaries[0]}.`;
  const [first, second] = summaries;
  const relationship = signals[0].direction === signals[1].direction
    ? signals[0].direction === "contradicts" ? "At the same time" : "Alongside that"
    : "At the same time";
  return `${first}. ${relationship}, ${lowerFirst(second)}.`;
}

function composeEvidenceTension(context) {
  const tension = context.reconciliationTensions[0];
  if (!tension) return null;
  if (tension.type === "ESTIMATE_VS_OUTCOME_TENSION" &&
      context.interpretation.recommendation.action ===
        "continue_current_strategy" &&
      context.specificCoachingObservations.length) return null;
  const lowerSignal = context.interpretation.crossDomainSynthesis?.signals.find((item) =>
    tension.lowerAuthorityObservationIds.includes(item.observationId));
  const label = lowerSignal?.displayLabel ?? "One current measure";
  if (tension.type === "ESTIMATE_VS_OUTCOME_TENSION") {
    return `${upperFirst(label)} points the other way on paper, but the realized result carries more weight; that estimate alone is not enough to change the plan.`;
  }
  if (tension.type === "LEADING_VS_LAGGING_TENSION") {
    return `${upperFirst(label)} has weakened, but one early signal does not erase the progress already established. It is worth watching closely.`;
  }
  if (tension.type === "TRANSIENT_NOISE") {
    return `${upperFirst(label)} is a weak isolated signal, so it does not change the broader conclusion yet.`;
  }
  if (tension.type === "PEER_CONTRADICTION") {
    return "Two similarly strong signals disagree. Hold the conclusion lightly until the conflict is resolved.";
  }
  if (tension.type === "CONFIRMED_REVERSAL") {
    return "Several current signals now point to a real change. The earlier result still counts, but it no longer supports staying on autopilot.";
  }
  return null;
}

function composeCoachTension(context) {
  const tension = context.reconciliationTensions[0];
  if (!tension) return null;
  if (tension.type === "ESTIMATE_VS_OUTCOME_TENSION" &&
      context.interpretation.recommendation.action ===
        "continue_current_strategy" &&
      context.specificCoachingObservations.length) return null;
  const lowerSignal = context.interpretation.crossDomainSynthesis?.signals.find((item) =>
    tension.lowerAuthorityObservationIds.includes(item.observationId));
  const label = lowerFirst(lowerSignal?.displayLabel ?? "weaker signal");
  if (tension.type === "ESTIMATE_VS_OUTCOME_TENSION") {
    return `The ${label} is worth watching, but it is not enough by itself to outweigh the stronger realized result.`;
  }
  if (tension.type === "LEADING_VS_LAGGING_TENSION") {
    return `The ${label} deserves attention, but it has not overturned the progress already established.`;
  }
  if (tension.type === "TRANSIENT_NOISE") {
    return `The ${label} is too weak and isolated to change the plan yet.`;
  }
  if (tension.type === "CONFIRMED_REVERSAL") {
    return "The current evidence has genuinely turned. Review the plan instead of relying on the earlier result.";
  }
  return composeEvidenceTension(context);
}

function composeAction(context) {
  const { goalContract, interpretation, consequentialGuardrails, strategyWords } = context;
  const action = interpretation.recommendation.action;
  if (context.useRecurringSectionPlan &&
      context.sectionPlan.content.action) {
    return context.sectionPlan.content.action;
  }
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
  if (context.useRecurringSectionPlan) {
    return context.sectionPlan.content.watch;
  }
  return composeWatchFallback(context);
}

function composeWatchFallback(context) {
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
  if (context.useRecurringSectionPlan) {
    return context.sectionPlan.content.coachTake;
  }
  if (context.recentEventFollowup) {
    const specific = context.specificCoachingObservations[0];
    const observation = specific
      ? `${sentence(specific.narrativeText)} ` : "";
    const suggestion = specific?.recommendationCapability?.capable
      ? `${sentence(specific.recommendationCapability.text)} ` : "";
    const support = context.interpretation.crossDomainSynthesis?.operatingSupport === "supportive"
      ? "The current work supports staying the course. " : "";
    return `${observation}${suggestion}The last ${context.nextEvidence.displayName} still supports the plan, and the plan is doing its job. ${support}Keep the focus on consistent execution; ${nextEvidenceName(context)} ${nextEvidenceVerb(context)} about continued progress.`;
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
      context.anchorPreviouslyCommunicated ? `The last ${context.nextEvidence.displayName} still supports the plan.` :
        `The latest outcome still stands: ${lowerFirst(stripPeriod(objectiveMovement(context)))}.` : `${upperFirst(result)}.`;
    const operatingConclusion = context.interpretation.crossDomainSynthesis?.operatingSupport === "supportive"
      ? "The current work supports staying the course." : null;
    const specific = context.specificCoachingObservations[0];
    const specificTake = specific ? sentence(specific.narrativeText) : null;
    const suggestion = specific?.recommendationCapability?.capable
      ? sentence(specific.recommendationCapability.text) : null;
    return [specificTake, suggestion, operatingConclusion,
      composeCoachTension(context), progress,
      `${acceptedResult} The plan is working.`, `Stay consistent. ${execute}`, watch]
      .filter(Boolean).join(" ");
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
  const heading = `Confidence · ${confidence.currentPercentage}% ${arrow}`;
  if (context.recentEventFollowup) {
    const previousMove = context.priorConfidenceMovement > 0
      ? " after the recent jump" : "";
    const training = context.operatingSignals.find((item) =>
      item.semanticClass === "LEADING_INDICATOR" && item.direction === "supports");
    return { heading, body: `Confidence holds${previousMove}. ${training
      ? "Training continued to move in the right direction, so the outlook is unchanged."
      : "Nothing in this update changes the outlook."}` };
  }
  if (confidence.delta < 0) {
    const reason = interpretation.aggregateGuardrailState === "breached" ? lowerFirst(stripPeriod(describeGuardrail(context, context.consequentialGuardrails[0]))) :
      confidence.execution.state === "deteriorating" ? "execution has meaningfully departed from the plan" :
        ["challenged", "refuted"].includes(interpretation.strategyEffectiveness.feasibility) ? "the latest result calls the plan into question" : "the remaining work is becoming harder to fit into the available time";
    return { heading, body: `Confidence fell because ${reason}. ${interpretation.recommendation.action === "pause_and_investigate" ? "Address that first before pushing ahead." : "The next useful check needs to show that the outlook is improving."}` };
  }
  if (confidence.delta === 0) {
    const specific = context.specificCoachingObservations[0];
    // The concrete evidence that mattered, named directly — never a generic
    // stand-in noun like "update"/"signal"/"evidence item"/"movement" with no
    // referent. Phrased direction-neutrally: the candidate here may be a
    // positive milestone or a plateau worth watching, and this is only ever
    // Confidence's own reason, never a restatement of the hero or a module.
    const evidenceLabel = specific ? coachingSubject(specific.subjectLabel) : null;
    return { heading, body: evidenceLabel
      ? `Confidence holds. ${evidenceLabel}’s recent result does not move the overall goal outlook by itself; the rest of the evidence still needs to confirm the trend before confidence can shift.`
      : confidence.projectionPolicy.mode === "continuity_hold" ?
        "Confidence holds. Nothing new changes the outlook for the goal." :
        "Confidence holds. This check-in does not change the outlook for reaching the goal." };
  }
  if (confidence.projectionPolicy.mode === "execution_update") {
    return { heading, body: `Confidence moved up because consistent execution is supporting the goal. ${interpretation.strategyEffectiveness.feasibility === "demonstrated" ? `The plan is working; ${nextEvidenceName(context)} still needs to confirm that progress continued.` : "The next useful result still needs to show that the effort is delivering."}` };
  }
  const trajectory = confidenceTrajectory(context);
  const strong = context.objective?.significance === "major" && context.objective?.quality === "robust";
  const opening = confidence.delta >= 10
    ? "Confidence jumped" : "Confidence increased";
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
  const currentSupport = context.operatingSignals
    // Already surfaced as the hero Result — Confidence's own supporting-
    // evidence list adds other current support, not a restatement of it.
    .filter((item) => item !== context.resultOperatingSignal)
    .filter((item) => item.direction === "supports" && item.factualSummary)
    .map((item) => item.semanticClass === "DERIVED_ESTIMATE"
      ? translateEnergyForCoaching(context, item)
      : coachingClauses(item.factualSummary)[0])
    .filter(Boolean).map(sentence);
  return {
    why: [goalProgressSentence(context), `${upperFirst(strategyLabel(context))} ${demonstrated ? "is clearly working" : "still needs a useful outcome check"}.`, time].filter(Boolean).join(" "),
    whatIncreasedIt: context.objective?.state === "progressed" ? [objectiveMovement(context), ...(primaryGuardrail?.status === "clear" ? [describeGuardrail(context, primaryGuardrail)] : [])] : [],
    whatSupportsItNow: [remaining, ...currentSupport].filter(Boolean),
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
      ...(trajectory?.deadlineContributionApplicable
        ? ["Falling far enough behind that there is no longer enough time to finish the goal."]
        : []),
    ],
    nextEvidence: composeWatch(context),
    assumptions: [
      "The outlook depends on appropriate continued execution.",
      ...(trajectory?.observedRate != null ? ["The forecast uses a reduced recent rate, not an assumption that the latest result repeats exactly."] : []),
      ...(trajectory?.conditionalUnmeasuredProgress > 0 ? ["Consistent execution supports the outlook, but any progress since the last outcome check is still unconfirmed."] : []),
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
    const range = formatNaturalRange(evaluation.allowedRange.min,
      evaluation.allowedRange.max, unit);
    return `${upperFirst(label)} moving outside the intended range of ${range}.`;
  }
  if (["minimum", "maximum"].includes(evaluation.mode)) {
    return `${upperFirst(label)} ${evaluation.mode === "minimum" ? "falling below" : "rising above"} ${formatValue(evaluation.threshold, guardrail.metricCapability.canonicalUnit)}.`;
  }
  return `${upperFirst(label)} no longer meeting its intended target.`;
}

function formatNaturalRange(minimum, maximum, unit) {
  const compact = (value) => Number(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
  const suffix = unit === "%" ? "%" : unit ? ` ${unit}` : "";
  return `${compact(minimum)}–${compact(maximum)}${suffix}`;
}

function formatCoachingMeasurement(value, unit) {
  if (!Number.isFinite(Number(value))) return "a new best";
  return `${Number(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`;
}

function resolveUncertaintySurfacing(item, interpretation, context) {
  if (item.domain === "energy") {
    if (item.recommendationEffect === "temper") {
      // Surfaced via the Energy module's own factual interpretation, not
      // Watch (see composeEnergyStatementV3 / the watchText change above) —
      // "module" is the same value `boundedUncertainty()` already recognizes
      // as covered, keeping it out of the separate Still Unresolved list.
      return context.energyAmbiguityText
        ? { surfaced: true, surfacedIn: "module", suppressionReason: null }
        : { surfaced: false, suppressionReason: "energy_context_unavailable_for_narrative" };
    }
    return { surfaced: false, suppressionReason: "low_materiality_no_recommendation_effect" };
  }
  if (shouldSurfaceUncertainty(item, interpretation)) {
    return { surfaced: true, surfacedIn: "watch", suppressionReason: null };
  }
  return { surfaced: false, suppressionReason: legacySuppressionReason(item, interpretation) };
}

function legacySuppressionReason(item, interpretation) {
  if (item.type === "persistence" && interpretation.nextCoachingQuestion?.evidencePurpose === "confirm_persistence") {
    return "covered_by_next_evidence_purpose";
  }
  if (item.type === "guardrail") return "guardrail_not_relevant_to_current_recommendation";
  if (item.type === "causal_attribution") return "attribution_is_not_the_next_evidence_purpose";
  if (item.type === "measurement" && interpretation.strategyEffectiveness.feasibility === "demonstrated") {
    return "strategy_feasibility_already_demonstrated";
  }
  if (item.type === "strategy_feasibility" && interpretation.strategyEffectiveness.continuity?.inherited) {
    return "strategy_state_inherited_from_prior_evaluation";
  }
  if (["measurement_coverage", "objective_measurement"].includes(item.type) &&
      interpretation.strategyEffectiveness.feasibility === "demonstrated") {
    return "strategy_feasibility_demonstrated_measurement_gap_not_decision_relevant";
  }
  return "not_decision_relevant_for_recurring_narrative";
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
