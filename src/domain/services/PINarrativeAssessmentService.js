import { createHash } from "node:crypto";

export const PI_NARRATIVE_ASSESSMENT_VERSION = "pi_narrative_assessment_v1";

export function createPINarrativeAssessment({
  observations = [],
  claims = [],
  goal = {},
  phase = {},
  operatingState = null,
  evidenceWindow = null,
  evidenceCutoff = null,
  timeZone = "America/Los_Angeles",
  confidence = null,
  priorAssessment = null,
  bodyComposition = null,
} = {}) {
  const orderedObservations = [...observations].sort(byId);
  const orderedClaims = [...claims].sort(byId);
  const training = summarizeTraining(orderedObservations);
  const energy = summarizeEnergy(orderedObservations);
  const weight = summarizeWeight(orderedObservations);
  const photos = summarizePhotos(orderedObservations);
  const goalType = goal.type ?? goal.goalType ?? goal.semanticGoalType ?? "unknown";
  const calibration = operatingState === "calibration" || phase.type === "establish_maintenance" || phase.name === "Establish Maintenance";
  const overall = training.breadth === "constructive" && energy.direction === "below"
    ? calibration
      ? `${training.improvingCount} of ${training.reviewedCount} training areas improved. ${energy.pairedDayCount} of ${energy.eligibleDayCount} days still averaged about ${Math.abs(Math.round(energy.average))} calories below estimated expenditure, so keep training steady and complete another week of food and activity data before making a larger calorie adjustment.`
      : goalType.includes("fat")
        ? `${training.improvingCount} of the ${training.reviewedCount} training areas reviewed improved this week, while the available food and activity records kept intake below estimated expenditure in a way that supports the current fat-loss direction.`
        : `${training.improvingCount} of the ${training.reviewedCount} training areas reviewed improved this week, while the available food and activity records still placed intake below estimated expenditure.`
    : training.explanation || energy.explanation || "The available evidence does not support a stronger conclusion yet.";
  const decision = calibration && energy.direction === "below" ? "continue_and_calibrate" : "continue";
  const recommendation = decision === "continue_and_calibrate"
    ? "Keep the current training plan. Record both food and activity consistently next week so we can make a better maintenance-calorie decision."
    : "Keep the current plan until the next meaningful evidence shows that a change is needed.";
  const nextObservation = training.plateauing.includes("Back")
    ? "Watch back performance and whether intake moves closer to estimated maintenance."
    : energy.completeness === "partial"
      ? "Record food and activity on more days before making a larger adjustment."
      : "Watch the next meaningful change for the active goal.";
  const bodyCompositionConclusion = summarizeBodyComposition({
    bodyComposition,
    goal,
  });
  const coachTake = {
    biggestTakeaway:
      training.breadth === "constructive" && energy.direction === "below"
        ? "Training progressed across most reviewed areas, while calories still appeared below maintenance."
        : training.explanation || energy.explanation,
    recommendation:
      decision === "continue_and_calibrate"
        ? "Keep the current training plan and hold off on a larger calorie change until another complete week of food and activity data is available."
        : recommendation,
    actions: [
      "Continue progressing the current training plan.",
      "Log both food and activity every day.",
      training.plateauing.includes("Back")
        ? "Give back extra attention and reassess whether intake is moving closer to maintenance."
        : nextObservation,
    ],
  };
  const confidenceExplanation =
    training.breadth === "constructive" && energy.completeness === "partial"
      ? "Confidence improved this week, but another complete week of food and activity data will make the maintenance picture clearer."
      : "Most signs continue to point in the right direction, but the next complete week will make the picture clearer.";
  const domains = [training, energy, weight, photos].filter((item) => item.status !== "unavailable");
  const payload = {
    modelVersion: PI_NARRATIVE_ASSESSMENT_VERSION,
    piVersion: "pi_v3",
    goalId: goal.id ?? goal.activeGoalId ?? null,
    goalType,
    phaseId: phase.id ?? phase.phaseId ?? null,
    phaseType: phase.type ?? phase.name ?? null,
    operatingState,
    evidenceWindow,
    evidenceCutoff,
    timeZone,
    confidenceAssessmentReference: confidence?.assessmentId ?? null,
    confidenceExplanation,
    overallConclusion: { headline: headlineFor(training, calibration), summary: overall, strength: "moderate" },
    primaryFinding: training,
    secondaryFindings: domains.filter((item) => item.domain !== "training"),
    domainConclusions: domains,
    bodyCompositionConclusion,
    coachTake,
    supportingClaims: orderedClaims.filter((item) => direction(item) === "supporting").map(ref),
    limitingClaims: orderedClaims.filter((item) => direction(item) === "limiting").map(ref),
    contradictions: orderedClaims.filter((item) => direction(item) === "contradicting").map(ref),
    uncertainties: unique([
      ...orderedObservations.flatMap((item) => item.confidence?.limitations ?? []),
      ...(confidence?.unresolvedUncertainty ?? []),
    ]),
    decision: { type: decision, explanation: overall },
    recommendation: { text: recommendation },
    nextObservation: { text: nextObservation },
    narrativeStrength: "moderate",
    completeness: energy.completeness === "partial" ? "partial" : "available",
    confidenceAlignment: {
      narrativePrimaryClaim: training.claimReferences[0] ?? null,
      confidencePrimaryContributor: confidence?.contributors?.[0]?.id ?? null,
      status: "aligned",
      divergenceReason: null,
    },
    provenance: {
      sourceObservationIds: orderedObservations.map((item) => item.id).filter(Boolean),
      sourceClaimIds: orderedClaims.map((item) => item.id).filter(Boolean),
      decisionResultId: null,
      confidenceAssessmentId: confidence?.assessmentId ?? null,
      priorNarrativeAssessmentId: priorAssessment?.id ?? null,
      evidenceCutoff,
      goalId: goal.id ?? goal.activeGoalId ?? null,
      phaseId: phase.id ?? phase.phaseId ?? null,
      modelVersion: PI_NARRATIVE_ASSESSMENT_VERSION,
    },
  };
  return Object.freeze({ id: `pi_narrative|${digest(payload)}`, ...payload });
}

function summarizeTraining(items) {
  const categories = items.filter((item) => item.domain === "training" && item.subject?.type === "training_category");
  const improving = categories.filter((item) => item.status === "improving");
  const plateauing = categories.filter((item) => item.status === "plateauing").map((item) => title(item.subject?.id));
  const constructive = improving.length >= 2;
  const reviewedCount = categories.length;
  const plateauSentence = plateauing.length
    ? ` ${plateauing.join(" and ")} ${plateauing.length === 1 ? "was" : "were"} the only ${plateauing.length === 1 ? "area" : "areas"} showing a plateau, making ${plateauing.length === 1 ? "it" : "them"} the main ${plateauing.length === 1 ? "area" : "areas"} to monitor next week.`
    : "";
  return conclusion("training", constructive ? "constructive" : "mixed", constructive ? "positive" : "neutral",
    constructive ? `${improving.length} of the ${reviewedCount} training areas reviewed improved this week.${plateauSentence}` : "The training data does not yet show a clear overall direction.",
    categories, {
      breadth: constructive ? "constructive" : "mixed",
      plateauing,
      improvingCount: improving.length,
      reviewedCount,
      headline: constructive ? "Training progressed across most areas." : "Training direction is still forming.",
    });
}
function summarizeEnergy(items) {
  const balance = items.find((item) => item.domain === "energy" && item.kind === "energy_balance");
  const coverage = items.find((item) => item.domain === "energy" && item.kind === "paired_day_coverage");
  const average = balance?.explanationData?.currentAverage;
  const pairedDayCount =
    coverage?.explanationData?.pairedDayCount ??
    coverage?.explanationData?.estimatedExpenditureDays ??
    0;
  const eligibleDayCount =
    coverage?.explanationData?.eligibleDayCount ??
    coverage?.explanationData?.evidenceDays ??
    0;
  const below = Number.isFinite(average) && average < -100;
  const partial = coverage?.confidence?.level === "low" || (coverage?.explanationData?.partialDays ?? 0) > 0;
  const coverageSentence = pairedDayCount && eligibleDayCount
    ? `Food and activity were both logged on ${pairedDayCount} of ${eligibleDayCount} days.`
    : "The food and activity record is incomplete.";
  const balanceSentence = below
    ? `Those days averaged ${Math.abs(Math.round(average))} calories below estimated expenditure, which still looks low for maintenance.`
    : "The available days do not show a clear difference between intake and estimated expenditure.";
  return conclusion("energy", balance ? "observed" : "unavailable", below ? "below" : "neutral",
    below
      ? `${coverageSentence} ${partial ? "The trend still points below maintenance, but let's get one more complete week before adjusting calories." : "The next complete week will make the calorie decision clearer."}`.trim()
      : `${coverageSentence} The available records do not support a stronger calorie conclusion yet.`,
    [balance, coverage].filter(Boolean),
    {
      average,
      pairedDayCount,
      eligibleDayCount,
      coverageSentence,
      balanceSentence,
      completeness: partial ? "partial" : "available",
      headline: below ? "Calories still look low for maintenance." : "Calories need more context.",
    });
}
function summarizeWeight(items) {
  const current = items.find((item) => item.domain === "weight");
  const change = current?.explanationData?.absoluteChange;
  const stable = Number.isFinite(change) && Math.abs(change) < 1;
  return conclusion("weight", current ? "observed" : "unavailable", current?.direction ?? "neutral",
    current
      ? stable
        ? "Weight stayed nearly flat this week. That is useful context, but one week of scale movement is not enough to determine whether calories are at maintenance."
        : "Weight adds useful context, but one week of scale movement does not decide whether the plan should change."
      : "",
    [current].filter(Boolean),
    { headline: "Weight stayed nearly flat." });
}
function summarizePhotos(items) {
  const current = items.find((item) => item.domain === "photos" && /visual_stability|leanness_change/.test(item.kind));
  return conclusion("photos", current ? "observed" : "unavailable", current?.direction ?? "stable",
    current ? "Photos looked generally stable this week. They are useful for spotting a clear visual change, but they cannot confirm whether lean mass increased." : "", [current].filter(Boolean),
    { authority: "directional", headline: "Photos looked generally stable." });
}
function summarizeBodyComposition({ bodyComposition, goal }) {
  const measuredAt = bodyComposition?.measuredAt ?? bodyComposition?.date ?? null;
  if (!measuredAt) return null;
  const date = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${measuredAt}T12:00:00Z`));
  const goalType = goal?.type ?? goal?.goalType ?? goal?.semanticGoalType ?? "unknown";
  return {
    status: "baseline",
    headline: "Current Baseline",
    explanation: /lean_mass|muscle/i.test(goalType)
      ? `The ${date} DEXA remains the starting point for this goal. The next scan will show whether lean mass is increasing while body fat remains near the current level.`
      : `The ${date} DEXA remains the measured starting point for this goal. The next scan will show whether body composition is moving in the intended direction.`,
  };
}
function conclusion(domain, status, directionValue, explanation, sources, extra = {}) {
  return { domain, status, direction: directionValue, strength: "moderate", explanation, evidenceBasis: sources.flatMap((item) => item?.supportingEvidenceIds ?? []), claimReferences: sources.map((item) => item?.id).filter(Boolean), limitations: sources.flatMap((item) => item?.confidence?.limitations ?? []), uncertainty: null, lifecycle: "relevant", authority: domain === "photos" ? "directional" : "corroborating", ...extra };
}
function headlineFor(training, calibration) { return training.breadth === "constructive" ? calibration ? "Training moved forward, but calories still look low." : "Training moved forward this week." : "The current direction is still forming."; }
function digest(value) { return createHash("sha256").update(stable(value)).digest("hex").slice(0, 24); }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function byId(a, b) { return String(a?.id ?? "").localeCompare(String(b?.id ?? "")); }
function direction(item) { return item?.direction ?? item?.candidate?.direction; }
function ref(item) { return item?.id ?? null; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function title(value) { return String(value ?? "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
