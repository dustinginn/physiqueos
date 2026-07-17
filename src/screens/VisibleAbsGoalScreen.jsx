import {
  Camera,
  Dumbbell,
  Salad,
  ShieldCheck,
  Syringe,
  Target,
  TrendingDown,
} from "lucide-react";
import { FounderRepositories } from "../data/repositories/founderRepositories";
import { GoalEvaluationService } from "../domain/services/GoalEvaluationService";
import { GoalIntelligenceService } from "../domain/services/GoalIntelligenceService";
import { createTrainingPerformanceIntelligenceReport } from "../domain/services/TrainingPerformanceIntelligenceService";
import { orderWeeklyAveragesNewestFirst } from "../domain/utils/weeklyAverageOrdering";

const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";

export async function getVisibleAbsDossier() {
  const user = await FounderRepositories.users.getCurrentUser();
  const userId = user?.id;
  const [
    goals,
    activeGoal,
    weights,
    dexaScans,
    progressPhotos,
    protocols,
    nutritionContext,
    analyses,
    canonicalEvidence,
  ] = await Promise.all([
    FounderRepositories.goals.listGoals(userId),
    FounderRepositories.goals.getActiveGoal(userId),
    FounderRepositories.weights.listWeightEntries(userId),
    FounderRepositories.dexaScans.listDEXAScans(userId),
    FounderRepositories.progressPhotos.listPhotos(userId),
    FounderRepositories.protocols.listActiveProtocols(userId),
    FounderRepositories.nutritionContext.getNutritionContext(userId),
    FounderRepositories.analyses.listAnalyses(),
    FounderRepositories.canonicalEvidence.listCanonicalEvidenceObjects(userId),
  ]);
  const sortedWeights = sortByDate(weights, "measuredAt");
  const sortedDEXA = sortByDate(dexaScans, "measuredAt");
  const sortedPhotos = sortByDate(progressPhotos, "date");
  const trainingPerformance = createTrainingPerformanceIntelligenceReport({ canonicalObjects: canonicalEvidence });
  const evaluations = GoalEvaluationService.getGoalEvaluations({
    goals,
    dexaScans: sortedDEXA,
    weightEntries: sortedWeights,
    progressPhotos: sortedPhotos,
    protocols,
    nutritionContext,
    photoAnalyses: analyses,
    trainingPerformance,
  });
  const intelligence = GoalIntelligenceService.getGoalIntelligence({
    evaluations,
    activeGoal,
  });
  const evaluation =
    evaluations.find((item) => item.goalId === VISIBLE_ABS_GOAL_ID) ??
    evaluations[0];
  const weightStats = getWeightStats(sortedWeights);

  return {
    progress: evaluation?.progress ?? 0,
    confidence: evaluation?.goalConfidence?.value ?? evaluation?.confidence ?? 0,
    confidenceLevel:
      evaluation?.goalConfidence?.label ??
      getConfidenceLabel(evaluation?.confidence ?? 0),
    confidenceLabel: "Goal confidence",
    confidenceMeaning: evaluation?.projection?.confidenceMeaning ?? null,
    currentBodyFatRange: evaluation?.projection?.currentBodyFatRange ?? "Estimate pending",
    bodyCompositionEstimate: evaluation?.metadata?.bodyCompositionEstimate ?? null,
    timelineExplanation: evaluation?.projection?.supportingExplanation ?? null,
    projectionId: evaluation?.projection?.id ?? null,
    projectedFinish: intelligence.trajectory.projectedFinish,
    daysRemaining: intelligence.trajectory.daysRemaining,
    heroSentence: getHeroSentence({ evaluation, weightStats, sortedPhotos }),
    successCriteria: getSuccessCriteria(evaluation),
    confidenceReasons: getConfidenceReasons(evaluation),
    uncertainty: "Lower abs remain the final visual milestone.",
    evidence: getEvidenceJourney({
      sortedWeights,
      sortedDEXA,
      weightStats,
    }),
    protocols: getSupportingProtocols({ protocols, nutritionContext }),
    timeline: getGoalJourney({ sortedWeights, sortedDEXA, sortedPhotos, protocols }),
  };
}

function getWeightStats(weights) {
  const first = weights[0] ?? null;
  const latest = weights.at(-1) ?? null;

  return {
    totalLost:
      first && latest
        ? Number((first.weight.value - latest.weight.value).toFixed(1))
        : null,
  };
}

function getHeroSentence({ evaluation, weightStats, sortedPhotos }) {
  if (sortedPhotos.length > 0 && weightStats.totalLost >= 10) {
    return "Visual progress is now leading scale progress.";
  }

  return evaluation?.summary ?? "The current protocol continues outperforming expectations.";
}

function getSuccessCriteria(evaluation) {
  const leanMassPreserved = evaluation?.findings?.some(
    (finding) => finding.id === "lean_mass_preserved" && finding.status === "positive"
  );

  return [
    {
      label: "Upper abs consistently visible",
      status: "Achieved",
      symbol: "✓",
      className: "bg-[#ECFDF3] text-[#15803D]",
    },
    {
      label: "Lower abs visible at rest",
      status: "In progress",
      symbol: "○",
      className: "bg-[#FFF7ED] text-[#C2410C]",
    },
    {
      label: "Lean mass preserved",
      status: leanMassPreserved ? "On track" : "Monitor",
      symbol: leanMassPreserved ? "✓" : "○",
      className: leanMassPreserved ? "bg-[#ECFDF3] text-[#15803D]" : "bg-[#FFF7ED] text-[#C2410C]",
    },
    {
      label: "Maintain training performance",
      status: "On track",
      symbol: "✓",
      className: "bg-[#ECFDF3] text-[#15803D]",
    },
  ];
}

function getConfidenceReasons(evaluation) {
  const positives =
    evaluation?.findings
      ?.filter((finding) => finding.status === "positive")
      .map((finding) => finding.text) ?? [];

  return [
    "Weight trend remains consistent.",
    "Progress photos increased confidence.",
    "Latest DEXA supports the body-fat estimate.",
    "Nutrition remains within target range.",
    ...positives.slice(0, 1),
  ].slice(0, 5);
}

function getEvidenceJourney({ sortedWeights, sortedDEXA, weightStats }) {
  const weightPoints = sortedWeights.map((entry) => ({
    date: entry.measuredAt,
    label: formatShortDate(entry.measuredAt),
    value: entry.weight.value,
    unit: entry.weight.unit,
    isLatest: entry === sortedWeights.at(-1),
  }));
  const weeklyMomentum = getWeeklyMomentum(sortedWeights);
  const dexaScans = sortedDEXA.slice(-3).map((scan) => ({
    date: scan.measuredAt,
    label: formatShortDate(scan.measuredAt),
    bodyFat: scan.bodyFatPercentage,
    fatMass: scan.fatMass?.value ?? 0,
  }));

  return {
    weight: {
      summary:
        weightStats.totalLost !== null
          ? `Weight has moved down ${weightStats.totalLost.toFixed(1)} lb across the cut, with weekly averages showing the goal is still advancing.`
          : "Weight history is still building.",
      points: weightPoints,
      weeklyMomentum,
    },
    dexa: {
      summary:
        "DEXA confirms meaningful body-fat reduction since 5/24. Lean mass remains the key metric to protect, but the scan trend supports the current body-fat trajectory.",
      scans: dexaScans,
    },
    visual: {
      summary:
        "Recent photos show visible upper-ab definition, strong oblique separation, and improving back definition. Remaining work is concentrated in lower abs and lower back, which is expected at this stage of the cut.",
      strengths: [
        "Excellent V-taper",
        "Upper abs consistently visible",
        "Obliques well-developed",
        "Back definition improving",
        "Strong muscle-retention appearance",
      ],
      focus: ["Lower abs", "Lower back"],
    },
  };
}

function getSupportingProtocols({ protocols, nutritionContext }) {
  const items = protocols
    .filter((protocol) => protocol.relatedGoalIds?.includes(VISIBLE_ABS_GOAL_ID))
    .map((protocol) => ({
      color: protocol.category === "peptide" ? "effort" : "primary",
      icon: protocol.category === "peptide" ? Syringe : Target,
      name: protocol.name,
      reason:
        protocol.name === "Retatrutide"
          ? "Supports nutritional adherence during the cut."
          : "Supports lean-mass preservation during the cut.",
    }));

  if (nutritionContext?.estimatedDailyCaloricIntake) {
    items.push({
      color: "success",
      icon: Salad,
      name: "Nutrition",
      reason: "Current intake range supports the planned deficit.",
    });
  }

  items.push({
    color: "evidence",
    icon: Dumbbell,
    name: "Training",
    reason: "Resistance work and daily activity support the goal without replacing direct evidence.",
  });

  return items;
}

function getGoalJourney({ sortedWeights, sortedDEXA, sortedPhotos, protocols }) {
  const firstWeight = sortedWeights[0];
  const firstPhoto = sortedPhotos[0];
  const retatrutide = protocols.find((protocol) => protocol.name === "Retatrutide");
  const tesamorelin = protocols.find((protocol) => protocol.name === "Tesamorelin");
  const latestDEXA = sortedDEXA.at(-1);

  return [
    firstWeight && {
      date: formatShortDate(firstWeight.measuredAt),
      title: "Started cut",
      detail: `${firstWeight.weight.value.toFixed(1)} ${firstWeight.weight.unit} starting evidence.`,
    },
    firstPhoto && {
      date: formatShortDate(firstPhoto.date),
      title: "First progress photos",
      detail: "Visual evidence began under comparable conditions.",
    },
    retatrutide && {
      date: formatShortDate(retatrutide.startDate),
      title: "Started Retatrutide",
      detail: "Nutrition-adherence context entered the operating plan.",
    },
    tesamorelin && {
      date: formatShortDate(tesamorelin.startDate),
      title: "Started Tesamorelin",
      detail: "Lean-mass preservation context entered the operating plan.",
    },
    latestDEXA && {
      date: formatShortDate(latestDEXA.measuredAt),
      title: "DEXA confirmed 10.7%",
      detail: "High-confidence body-composition calibration.",
    },
    {
      date: "Today",
      title: "Current Goal Status",
      detail: "Lower abs and lower back remain the final focus.",
    },
  ].filter(Boolean);
}

function getWeeklyMomentum(weights) {
  const first = weights[0];
  const latest = weights.at(-1);

  if (!first || !latest) return [];

  const weeks = [];
  const start = parseDateKey(first.measuredAt);
  const latestDate = parseDateKey(latest.measuredAt);
  let cursor = start;
  let previousAverage = null;
  let weekNumber = 1;

  while (cursor <= latestDate) {
    const end = addDays(cursor, 6);
    const entries = weights.filter((entry) =>
      isWithinRange(parseDateKey(entry.measuredAt), cursor, end)
    );

    if (entries.length > 0 && end <= latestDate) {
      const average = averageWeight(entries);

      weeks.push({
        label: `Week ${weekNumber}`,
        period: `${formatShortDate(toDateKey(cursor))}-${formatShortDate(toDateKey(end))}`,
        sortDate: toDateKey(cursor),
        average,
        change:
          previousAverage === null
            ? null
            : Number((average - previousAverage).toFixed(1)),
        unit: entries.at(-1)?.weight?.unit ?? "lb",
      });
      previousAverage = average;
    }

    cursor = addDays(cursor, 7);
    weekNumber += 1;
  }

  const rollingEnd = latestDate;
  const rollingStart = addDays(rollingEnd, -6);
  const previousRollingStart = addDays(rollingStart, -7);
  const previousRollingEnd = addDays(rollingStart, -1);
  const rollingEntries = weights.filter((entry) =>
    isWithinRange(parseDateKey(entry.measuredAt), rollingStart, rollingEnd)
  );
  const previousRollingEntries = weights.filter((entry) =>
    isWithinRange(parseDateKey(entry.measuredAt), previousRollingStart, previousRollingEnd)
  );
  const rollingAverage = averageWeight(rollingEntries);
  const previousRollingAverage = averageWeight(previousRollingEntries);

  if (rollingEntries.length > 0) {
    weeks.push({
      label: "Current Rolling 7 Days",
      period: `${formatShortDate(toDateKey(rollingStart))}-${formatShortDate(toDateKey(rollingEnd))}`,
      sortDate: toDateKey(rollingStart),
      average: rollingAverage,
      change:
        previousRollingAverage === null
          ? null
          : Number((rollingAverage - previousRollingAverage).toFixed(1)),
      unit: rollingEntries.at(-1)?.weight?.unit ?? "lb",
    });
  }

  return orderWeeklyAveragesNewestFirst(weeks.slice(-6));
}

function averageWeight(weights) {
  if (weights.length === 0) return null;

  return Number((weights.reduce((sum, entry) => sum + entry.weight.value, 0) / weights.length).toFixed(1));
}

function sortByDate(records, field) {
  return [...records].sort((a, b) => String(a[field]).localeCompare(String(b[field])));
}

function parseDateKey(value) {
  const [year, month, day] = String(value).split("-").map(Number);

  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const next = new Date(date);

  next.setDate(next.getDate() + days);

  return next;
}

function isWithinRange(date, start, end) {
  return date >= start && date <= end;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatShortDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  const date =
    year && month && day
      ? new Date(year, month - 1, day)
      : new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getConfidenceLabel(confidence) {
  if (confidence >= 90) return "Very High";
  if (confidence >= 80) return "High";
  if (confidence >= 55) return "Moderate";

  return "Building";
}
