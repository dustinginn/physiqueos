import { isV3BoundArtifact } from "./BriefingV3Projection.js";
import { createMidweekConfidencePresentation } from "./BriefingGoalConfidencePresentationService";
import { createMidweekEditorialNarrative } from "./MidweekBriefingEditorialService";

export const MIDWEEK_PRESENTATION_CONTRACT_V1 =
  "midweek_presentation_contract_v1";

export function prepareMidweekBriefingReviewPresentation({ artifact,
  assessment = null } = {}) {
  if (!artifact?.briefing) return null;
  const briefing = artifact.briefing;
  if (isV3BoundArtifact(artifact)) {
    const lineage = validateMidweekAssessmentBinding({ artifact, assessment });
    return lineage.valid
      ? projectCanonicalMidweekV3(artifact, assessment, lineage)
      : projectCanonicalMidweekFactualFallback(artifact, lineage);
  }
  const editorial = createMidweekEditorialNarrative({
    energyBalance: briefing.energyBalance,
    training: briefing.training,
  });
  const energyPresentation = createMidweekEnergyPresentation(briefing.energyBalance);
  return {
    ...briefing,
    hero: { ...briefing.hero, ...editorial.hero },
    training: {
      ...briefing.training,
      interpretation: editorial.trainingInterpretation,
      watch: editorial.trainingWatch,
    },
    energyBalance: {
      ...briefing.energyBalance,
      ...energyPresentation,
    },
    coachTake: editorial.coachTake,
    goalConfidence: createMidweekConfidencePresentation(
      briefing.goalConfidence,
      { briefing }
    ),
  };
}

// V3-bound Midweek. The stored V3 narrative is the semantic authority. Factual
// Energy, Weight and Training evidence stays available as structured facts; the
// legacy V2 interpretation of that evidence (energy prose, training and weight
// interpretation, coaching decision, open threads, unclear-items) is not
// served, so a hidden V2 body can never become semantic authority.
function projectCanonicalMidweekV3(artifact, assessment, lineage) {
  const briefing = artifact.briefing;
  const narrativeV3 = requireCanonicalMidweekNarrativeV3(briefing);
  const {
    coachingDecision: _coachingDecision,
    openCoachingThreads: _openCoachingThreads,
    sundayContinuity: _sundayContinuity,
    ...factual
  } = briefing;
  const energy = createMidweekEnergyPresentation(briefing.energyBalance);
  const comparisonNarrativeV3 = energyComparisonTextV3(briefing.energyBalance);
  const { remainsUnclear: _remainsUnclear, ...activePhase } = briefing.activePhase ?? {};
  const presentationContract = createMidweekPresentationContract({
    artifact,
    assessment,
    lineage,
    narrativeV3,
  });
  return {
    ...factual,
    presentationModel: "canonical_narrative_v3",
    activePhase: briefing.activePhase ? activePhase : briefing.activePhase,
    energyBalance: {
      ...briefing.energyBalance,
      // Factual values only; interpretation is the V3 Energy statement.
      balanceHeadline: energy.balanceHeadline,
      comparisonNarrative: comparisonNarrativeV3,
      chartTitle: energy.chartTitle,
      headline: null,
      interpretation: narrativeV3.energy?.statement ?? null,
    },
    training: briefing.training
      ? { ...briefing.training, interpretation: null, watch: [] } : briefing.training,
    weightContext: briefing.weightContext
      ? { ...briefing.weightContext, interpretation: null } : briefing.weightContext,
    bodyComposition: briefing.bodyComposition
      ? { ...briefing.bodyComposition, interpretation: null }
      : briefing.bodyComposition,
    coachTake: {
      biggestTakeaway: narrativeV3.coachTake,
      recommendation: narrativeV3.sections.action,
    },
    uncertainty: narrativeV3.uncertainty ?? [],
    presentationContract,
    goalConfidence: createMidweekConfidencePresentation(
      briefing.goalConfidence,
      { briefing }
    ),
  };
}

function projectCanonicalMidweekFactualFallback(artifact, lineage) {
  const briefing = artifact.briefing;
  const energy = createMidweekEnergyPresentation(briefing.energyBalance);
  const comparisonNarrativeV3 = energyComparisonTextV3(briefing.energyBalance);
  const { remainsUnclear: _remainsUnclear, ...activePhase } =
    briefing.activePhase ?? {};
  return {
    ...briefing,
    presentationModel: "canonical_narrative_v3_factual_fallback",
    activePhase: briefing.activePhase ? activePhase : briefing.activePhase,
    hero: {
      ...briefing.hero,
      verdict: "Midweek Briefing",
      summary: null,
    },
    narrativeV3: null,
    energyBalance: briefing.energyBalance ? {
      ...briefing.energyBalance,
      balanceHeadline: energy.balanceHeadline,
      comparisonNarrative: comparisonNarrativeV3,
      chartTitle: energy.chartTitle,
      headline: null,
      interpretation: null,
    } : briefing.energyBalance,
    training: briefing.training
      ? { ...briefing.training, interpretation: null, watch: [] }
      : briefing.training,
    weightContext: briefing.weightContext
      ? { ...briefing.weightContext, interpretation: null }
      : briefing.weightContext,
    bodyComposition: briefing.bodyComposition
      ? { ...briefing.bodyComposition, interpretation: null }
      : briefing.bodyComposition,
    coachTake: null,
    uncertainty: [],
    goalConfidence: null,
    presentationContract: {
      schemaVersion: MIDWEEK_PRESENTATION_CONTRACT_V1,
      artifactId: artifact.id,
      assessmentId: null,
      lineage,
      lead: {
        headlineClaimId: null,
        headline: "Midweek Briefing",
        meaningClaimId: null,
        meaning: null,
        goal: boundedIdentity(briefing.activeGoal),
        phase: boundedIdentity(briefing.activePhase),
        confidence: null,
      },
      modules: moduleDecisions(briefing),
      coaching: [],
      uncertainty: { visibleItems: [], coveredIds: [] },
      claims: [],
    },
  };
}

export function validateMidweekAssessmentBinding({ artifact,
  assessment } = {}) {
  const expectedAssessmentId = artifact?.confidencePublication?.assessmentId ??
    artifact?.briefing?.goalConfidence?.assessmentId ?? null;
  const actualAssessmentId = assessment?.id ?? assessment?.assessmentId ?? null;
  const failures = [];
  if (!assessment) failures.push("assessment_missing");
  if (assessment && assessment.schemaVersion !==
      "canonical_confidence_assessment_v3") {
    failures.push("assessment_schema_mismatch");
  }
  if (!expectedAssessmentId || expectedAssessmentId !== actualAssessmentId) {
    failures.push("assessment_id_mismatch");
  }
  if (assessment?.briefingArtifactId !== artifact?.id) {
    failures.push("artifact_id_mismatch");
  }
  if (artifact?.evidenceWindow?.id && assessment?.evidenceWindowId !==
      artifact.evidenceWindow.id) {
    failures.push("evidence_window_mismatch");
  }
  const artifactGoalId = artifact?.goalContext?.goalId ??
    artifact?.briefing?.activeGoal?.id ?? null;
  if (artifactGoalId && assessment?.goalId !== artifactGoalId) {
    failures.push("goal_id_mismatch");
  }
  const artifactPhaseId = artifact?.goalContext?.phaseId ??
    artifact?.briefing?.activePhase?.id ?? null;
  if (artifactPhaseId && assessment?.phaseId !== artifactPhaseId) {
    failures.push("phase_id_mismatch");
  }
  const interpretation = assessment?.strategicInterpretation;
  const narrativePlan = assessment?.narrativePlan;
  if (!interpretation?.id || interpretation.id !==
      assessment?.structuredInterpretationId) {
    failures.push("strategic_interpretation_mismatch");
  }
  if (!narrativePlan?.id || narrativePlan.id !==
      assessment?.narrativeAssessmentId) {
    failures.push("narrative_plan_mismatch");
  }
  if (narrativePlan?.strategicInterpretationId !== interpretation?.id) {
    failures.push("narrative_interpretation_mismatch");
  }
  if (artifact?.briefing?.narrativeV3?.strategicInterpretationId !==
      interpretation?.id) {
    failures.push("artifact_interpretation_mismatch");
  }
  return Object.freeze({
    valid: failures.length === 0,
    reason: failures[0] ?? null,
    failures: Object.freeze(failures),
    expectedAssessmentId,
    actualAssessmentId,
    artifactId: artifact?.id ?? null,
    strategicInterpretationId: interpretation?.id ?? null,
    narrativePlanId: narrativePlan?.id ?? null,
  });
}

export function createMidweekPresentationContract({ artifact, assessment,
  lineage, narrativeV3 } = {}) {
  const briefing = artifact.briefing;
  const narrativePlan = assessment.narrativePlan;
  const selected = assessment.strategicInterpretation
    ?.coachingObservationSelection?.selected ?? [];
  const allocations = narrativePlan?.composition?.sectionAllocations ?? {};
  const resultCandidate = allocatedCandidate(allocations.result, selected);
  const coachCandidate = allocatedCandidate(allocations.coachTake, selected);
  const resultClaimId = claimId({ assessment, section: "result",
    allocation: allocations.result, candidate: resultCandidate });
  const meaningClaimId = claimId({ assessment, section: "meaning",
    allocation: allocations.meaning });
  const actionClaimId = claimId({ assessment, section: "action",
    allocation: allocations.action });
  const watchClaimId = claimId({ assessment, section: "watch",
    allocation: allocations.watch });
  const confidenceClaimId = claimId({ assessment, section: "confidence",
    allocation: allocations.confidence });
  const coachClaimId = claimId({ assessment, section: "coachTake",
    allocation: allocations.coachTake, candidate: coachCandidate });
  const claims = [];
  const addClaim = (claim) => {
    if (!claim?.text || claims.some((item) =>
      normalizeClaimText(item.text) === normalizeClaimText(claim.text))) {
      return false;
    }
    claims.push(Object.freeze(claim));
    return true;
  };
  addClaim({ claimId: resultClaimId, kind: "result",
    primarySurface: "lead.headline", text: narrativeV3.summary,
    candidateId: resultCandidate?.candidateId ?? null });
  const meaningIncluded = addClaim({ claimId: meaningClaimId, kind: "meaning",
    primarySurface: "lead.meaning", text: narrativeV3.sections.meaning,
    candidateId: null });
  const coaching = [];
  if (addClaim({ claimId: actionClaimId, kind: "action",
    primarySurface: "coaching.action", text: narrativeV3.sections.action,
    candidateId: null })) {
    coaching.push(sectionDecision("action", "What To Do", actionClaimId,
      narrativeV3.sections.action));
  }
  if (addClaim({ claimId: watchClaimId, kind: "watch",
    primarySurface: "coaching.watch", text: narrativeV3.sections.watch,
    candidateId: null })) {
    coaching.push(sectionDecision("watch", "What To Watch", watchClaimId,
      narrativeV3.sections.watch));
  }
  const confidenceReason = assessment.narrativeExplanation?.text ??
    briefing.goalConfidence?.primaryReason ?? null;
  const confidenceReasonDistinct = confidenceReason && !claims.some((item) =>
    normalizeClaimText(item.text) === normalizeClaimText(confidenceReason));
  claims.push(Object.freeze({ claimId: confidenceClaimId,
    kind: "confidence", primarySurface: "lead.confidence",
    text: confidenceReasonDistinct ? confidenceReason : null,
    candidateId: null }));
  const secondMovement = Boolean(resultCandidate && coachCandidate &&
    resultCandidate.subjectId !== coachCandidate.subjectId);
  const coachDecisionChanging = allocationDecisionChanging(
    allocations.coachTake);
  if ((!secondMovement || coachDecisionChanging) && addClaim({
    claimId: coachClaimId,
    kind: "coach_take",
    primarySurface: "coaching.coach_take",
    text: narrativeV3.coachTake,
    candidateId: coachCandidate?.candidateId ?? null,
  })) {
    coaching.push(sectionDecision("coachTake", "Coach's Take", coachClaimId,
      narrativeV3.coachTake));
  }
  const uncertainty = boundedUncertainty({ narrativeV3, assessment });
  return Object.freeze({
    schemaVersion: MIDWEEK_PRESENTATION_CONTRACT_V1,
    artifactId: artifact.id,
    assessmentId: assessment.id ?? assessment.assessmentId,
    lineage,
    lead: Object.freeze({
      headlineClaimId: resultClaimId,
      headline: narrativeV3.summary,
      meaningClaimId: meaningIncluded ? meaningClaimId : null,
      meaning: meaningIncluded ? narrativeV3.sections.meaning : null,
      goal: boundedIdentity(briefing.activeGoal),
      phase: boundedIdentity(briefing.activePhase),
      confidence: Object.freeze({
        claimId: confidenceClaimId,
        primarySurface: "lead.confidence",
        assessmentId: assessment.id ?? assessment.assessmentId,
        score: assessment.currentPercentage,
        band: assessment.confidenceBand,
        movement: assessment.movement,
        movementDirection: confidenceMovementDirection(assessment.movement),
        delta: assessment.priorPercentage == null ? null :
          assessment.currentPercentage - assessment.priorPercentage,
        reason: confidenceReasonDistinct ? confidenceReason : null,
        primaryReason: confidenceReasonDistinct ? confidenceReason : null,
        movementLabel: briefing.goalConfidence?.movementLabel ??
          confidenceMovementLabel(assessment),
      }),
    }),
    modules: moduleDecisions(briefing),
    coaching: Object.freeze(coaching),
    uncertainty,
    claims: Object.freeze(claims),
    suppressed: Object.freeze({
      resultSection: "owned_by_lead_headline",
      meaningSection: "owned_by_lead_meaning",
      confidenceSection: "owned_by_lead_confidence",
      coachTake: secondMovement && !coachDecisionChanging
        ? "second_movement_not_decision_changing" : null,
    }),
  });
}

function confidenceMovementDirection(value) {
  return ({ increase: "increased", decrease: "decreased",
    no_meaningful_change: "held" })[value] ?? value;
}

function confidenceMovementLabel(assessment) {
  const delta = assessment.priorPercentage == null ? null :
    assessment.currentPercentage - assessment.priorPercentage;
  if (assessment.movement === "increase") return `▲ +${Math.abs(delta ?? 0)}`;
  if (assessment.movement === "decrease") return `▼ −${Math.abs(delta ?? 0)}`;
  if (assessment.movement === "no_meaningful_change") {
    return "— No meaningful change";
  }
  return "Initial assessment";
}

function moduleDecisions(briefing) {
  const energy = briefing.energyBalance;
  const energyPoints = Array.isArray(energy?.chartPoints)
    ? energy.chartPoints : [];
  const pairedDayCount = energyPoints.filter((item) => item.complete).length;
  const hasEnergy = Boolean(energy && (pairedDayCount > 0 ||
    energyPoints.length > 0 || (energy.warnings ?? []).length > 0));
  const weightCount = Number(briefing.weightContext?.observations ?? 0);
  const hasBodyComposition = Boolean(briefing.bodyComposition?.newScan ||
    briefing.bodyComposition?.baseline);
  const training = briefing.training;
  const hasTraining = Boolean(training &&
    (Number(training.sessionsCompleted ?? training.trainingDayCount ?? 0) > 0 ||
      (training.highlights ?? []).length > 0 ||
      (training.priorityCategories ?? []).length > 0));
  return Object.freeze([
    moduleDecision("energy", "energyBalance", hasEnergy,
      pairedDayCount > 0 ? "paired_evidence" :
        hasEnergy ? "decision_relevant_missingness" : "no_eligible_evidence",
      { order: 1, pairedDayCount, chartIncluded: pairedDayCount >= 2,
        chartReason: pairedDayCount >= 2 ? "minimum_pair_count_met" :
          "insufficient_paired_days" }),
    moduleDecision("weight", "weightContext", weightCount >= 2,
      weightCount >= 2 ? "sufficient_observations" :
        weightCount > 0 ? "insufficient_observations" : "no_eligible_evidence",
      { order: 2, observationCount: weightCount }),
    moduleDecision("body_composition", "bodyComposition",
      hasBodyComposition,
      briefing.bodyComposition?.newScan ? "new_scan" :
        hasBodyComposition ? "phase_baseline" : "no_eligible_evidence",
      { order: 3 }),
    moduleDecision("training", "training", hasTraining,
      hasTraining ? "qualifying_training_evidence" : "no_eligible_evidence",
      { order: 4 }),
    moduleDecision("recovery", "recovery", false,
      "no_eligible_evidence", { order: 5 }),
  ]);
}

function moduleDecision(id, payloadKey, included, reasonCode, extra) {
  return Object.freeze({ id, payloadKey, included, reasonCode, ...extra });
}

function sectionDecision(section, label, claimIdValue, text) {
  return Object.freeze({ section, label, claimId: claimIdValue,
    primarySurface: `coaching.${section === "coachTake" ?
      "coach_take" : section}`, text });
}

function boundedUncertainty({ narrativeV3, assessment }) {
  const plan = assessment.narrativePlan?.uncertaintyTypes ?? [];
  const source = new Map((narrativeV3.uncertainty ?? [])
    .map((item) => [item.uncertaintyId ?? item.type, item]));
  const coveredIds = [];
  const visibleItems = [];
  for (const item of plan) {
    const id = item.uncertaintyId ?? item.type;
    if (!id) continue;
    if (item.surfacedIn === "watch" || item.surfacedIn === "module") {
      coveredIds.push(id);
      continue;
    }
    if (item.surfaced !== true || visibleItems.length >= 2) continue;
    const detail = source.get(id) ?? {};
    const text = plainUncertaintyText(detail.text);
    if (!text) continue;
    visibleItems.push(Object.freeze({
      uncertaintyId: id,
      type: item.type ?? detail.type ?? null,
      materiality: item.materiality ?? detail.materiality ?? null,
      primarySurface: "still_unresolved",
      text,
    }));
  }
  return Object.freeze({ visibleItems: Object.freeze(visibleItems),
    coveredIds: Object.freeze(coveredIds) });
}

function plainUncertaintyText(value) {
  const text = String(value ?? "").trim();
  if (!text || /(?:suppressionReason|uncertaintyId|evidence[_ ]coverage|pairedDayCount)/u
    .test(text)) return null;
  return text;
}

function allocatedCandidate(allocationValue, selected) {
  const topics = new Set(allocationValue?.topicKeys ?? []);
  return selected.find((item) => topics.has(item.topicKey)) ?? null;
}

function allocationDecisionChanging(value) {
  return value?.decisionChanging === true ||
    value?.allocationReason === "decision_changing" ||
    value?.reasonCode === "decision_changing";
}

function claimId({ assessment, section, allocation, candidate }) {
  if (candidate?.candidateId) return candidate.candidateId;
  const topic = allocation?.topicKeys?.[0] ?? section;
  return `midweek_claim|${assessment.id ?? assessment.assessmentId}|${section}|${topic}`;
}

function normalizeClaimText(value) {
  return String(value ?? "").toLocaleLowerCase("en-US")
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function boundedIdentity(value) {
  if (!value) return null;
  return Object.freeze({ id: value.id ?? null,
    name: value.name ?? value.title ?? null });
}

function requireCanonicalMidweekNarrativeV3(briefing) {
  const narrative = briefing.narrativeV3;
  const confidence = briefing.goalConfidence;
  const required = [
    narrative?.summary,
    narrative?.sections?.result,
    narrative?.sections?.meaning,
    narrative?.sections?.action,
    narrative?.sections?.watch,
    narrative?.sections?.confidence,
    narrative?.coachTake,
  ];
  if (confidence?.modelVersion !== "canonical_confidence_assessment_v3" ||
      confidence?.piVersion !== "confidence_v3" ||
      required.some((value) => typeof value !== "string" || !value.trim())) {
    throw new Error(
      "A V3 Midweek publication requires complete canonical Narrative V3."
    );
  }
  return narrative;
}

export function createMidweekEnergyPresentation(energy = {}) {
  const chartPoints = Array.isArray(energy.chartPoints) ? energy.chartPoints : [];
  const complete = chartPoints.filter((point) => point.complete);
  const missing = chartPoints.filter((point) => !point.complete);
  const conclusion = ({
    probably_below: "Intake is below estimated expenditure",
    probably_above: "Intake is above estimated expenditure",
    roughly_at: "Intake and expenditure are close",
    unclear: "More food and activity data needed",
  })[energy.balanceDirection] ?? "More food and activity data needed";
  const amount = Math.abs(Math.round(Number(energy.estimatedDailyBalanceMidpoint)));
  const balanceHeadline = !Number.isFinite(amount)
    ? "No daily estimate yet"
    : amount < 25
      ? "About even day to day"
      : `${amount.toLocaleString("en-US")} kcal/day ${energy.estimatedDailyBalanceMidpoint < 0 ? "below" : "above"}`;
  let interpretation;
  if (!complete.length) {
    interpretation = "Food or activity is missing for each day so far. Keep the plan steady and fill in what you can before Sunday.";
  } else {
    const days = complete.map((point) => longDay(point.date));
    const dayText = days.length === 1 ? days[0]
      : days.length === 2 ? `${days[0]} and ${days[1]}`
        : `${days.slice(0, -1).join(", ")}, and ${days.at(-1)}`;
    const missingText = missing.length
      ? ` ${longDay(missing[0].date)} is missing data, which is another reason to wait for Sunday’s review.`
      : "";
    interpretation = energy.balanceDirection === "probably_below"
      ? `${dayText} ${days.length === 1 ? "suggests" : "suggest"} you’re still below maintenance.${missingText} Keep calories steady for now.`
      : `${dayText} look close to maintenance.${missingText} Keep calories steady for now.`;
  }
  return Object.freeze({
    headline: conclusion,
    balanceHeadline,
    interpretation,
    comparisonNarrative: energyComparisonText(energy),
    chartTitle: "Energy Balance, Sunday–Tuesday",
  });
}

// Legacy V2 comparison text — unconditional, exactly as it always was. V2
// historical Midweek briefings must keep their original read-time-computed
// presentation unchanged; this task's content-quality fixes apply to the V3
// content-generation path only (see energyComparisonTextV3 below, used
// exclusively by the V3 projection functions).
function energyComparisonText(energy) {
  const previous = energy.comparison?.averageBalance;
  const current = Number.isFinite(energy.estimatedAverageDailyBalance)
    ? energy.estimatedAverageDailyBalance
    : energy.estimatedDailyBalanceMidpoint;
  if (!Number.isFinite(previous) || !Number.isFinite(current)) {
    return "The prior comparable period does not have enough paired evidence for a directional comparison.";
  }
  const change = Math.round(current - previous);
  const direction = Math.abs(change) < 25 ? "was similar to" : change > 0 ? "was higher than" : "was lower than";
  const rmr = energy.rmrProvenance?.sourceDexaDate
    ? ` Estimated expenditure uses the DEXA RMR available on ${shortDate(energy.rmrProvenance.sourceDexaDate)} plus active calories.`
    : " Estimated expenditure is limited because an eligible RMR source is unavailable.";
  return `Average estimated balance ${direction} the prior comparable period by ${Math.abs(change).toLocaleString("en-US")} kcal/day.${rmr}`;
}

// A kcal/day change smaller than this does not change what someone would do
// differently from the prior period, so it stays out of the V3 coaching
// text — the raw numbers are still visible in the metric tiles either way.
const MATERIAL_PRIOR_PERIOD_CHANGE_KCAL = 150;

// V3-only: materiality-gated comparison + a compact, subordinate methodology
// note included only when the RMR source is actually a limitation (missing),
// never unconditionally. Used exclusively by projectCanonicalMidweekV3 /
// projectCanonicalMidweekFactualFallback — never by the V2 legacy path
// above, which keeps its own always-on text unchanged.
function energyComparisonTextV3(energy) {
  const previous = energy.comparison?.averageBalance;
  const current = Number.isFinite(energy.estimatedAverageDailyBalance)
    ? energy.estimatedAverageDailyBalance
    : energy.estimatedDailyBalanceMidpoint;
  const parts = [];
  if (Number.isFinite(previous) && Number.isFinite(current)) {
    const change = Math.round(current - previous);
    if (Math.abs(change) >= MATERIAL_PRIOR_PERIOD_CHANGE_KCAL) {
      const direction = change > 0 ? "higher than" : "lower than";
      parts.push(`Average estimated balance was ${direction} the prior comparable period by ${Math.abs(change).toLocaleString("en-US")} kcal/day.`);
    }
  }
  if (!energy.rmrProvenance?.sourceDexaDate) {
    parts.push("Estimated expenditure is limited because an eligible RMR source is unavailable.");
  }
  return parts.length ? parts.join(" ") : null;
}

function longDay(value) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}

function shortDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}
