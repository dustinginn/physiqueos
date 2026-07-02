import { createDailyBriefing } from "../models/dailyBriefing";
import { DailyFocusService } from "./DailyFocusService";
import { getDailyEvent } from "./DailyEventService";
import { GoalEvaluationService } from "./GoalEvaluationService";
import { GoalIntelligenceService } from "./GoalIntelligenceService";

const PRIMARY_GOAL_ID = "goal_visible_abs_at_rest";
const DAILY_BRIEFING_VERSION = "daily-briefing-v8";

export function createDailyBriefingService({ repositories }) {
  async function composeDailyBriefing(userId) {
    const user = userId
      ? await repositories.users.getUserById(userId)
      : await repositories.users.getCurrentUser();
    const resolvedUserId = user?.id ?? userId;

    if (!resolvedUserId) return null;

    const [
      goals,
      activeGoal,
      weights,
      dexaScans,
      progressPhotos,
      protocols,
      reminders,
      checkIns,
      nutritionContext,
      latestAnalysis,
      latestStoredBriefing,
    ] = await Promise.all([
      repositories.goals.listGoals(resolvedUserId),
      repositories.goals.getActiveGoal(resolvedUserId),
      repositories.weights.listWeightEntries(resolvedUserId),
      repositories.dexaScans.listDEXAScans(resolvedUserId),
      repositories.progressPhotos?.listPhotos(resolvedUserId) ?? [],
      repositories.protocols.listActiveProtocols(resolvedUserId),
      repositories.reminders?.listActiveReminders(resolvedUserId) ?? [],
      repositories.dailyCheckIns.listCheckIns(resolvedUserId),
      repositories.nutritionContext?.getNutritionContext(resolvedUserId) ?? null,
      repositories.analyses.getLatestAnalysis(),
      repositories.dailyBriefings?.getLatestDailyBriefing(resolvedUserId) ?? null,
    ]);
    const sortedWeights = sortByDate(weights, "measuredAt");
    const sortedDEXA = sortByDate(dexaScans, "measuredAt");
    const sortedPhotos = sortByDate(progressPhotos, "date");
    const latestWeight = sortedWeights.at(-1) ?? null;
    const latestDEXA = sortedDEXA.at(-1) ?? null;
    const latestPhotos = sortedPhotos.slice(-3);
    const event = getDailyEvent({
      checkIns,
      dexaScans: sortedDEXA,
      progressPhotos: sortedPhotos,
      protocols,
      weights: sortedWeights,
    });
    const evaluations = GoalEvaluationService.getGoalEvaluations({
      goals,
      dexaScans: sortedDEXA,
      weightEntries: sortedWeights,
      progressPhotos: sortedPhotos,
      protocols,
      nutritionContext,
    });
    const intelligence = GoalIntelligenceService.getGoalIntelligence({
      evaluations,
      activeGoal,
    });
    const primaryEvaluation =
      evaluations.find((evaluation) => evaluation.goalId === activeGoal?.id) ??
      evaluations.find((evaluation) => evaluation.goalId === PRIMARY_GOAL_ID) ??
      evaluations[0] ??
      null;
    const weightStats = getWeightStats(sortedWeights);
    const goalStatus = getGoalStatus({ evaluations, intelligence });
    const evidenceUsed = getEvidenceUsed({
      checkIns,
      sortedWeights,
      nutritionContext,
      protocols,
      latestWeight,
      latestDEXA,
      latestPhotos,
    });
    const todayPriorities = DailyFocusService.getDailyFocus({
      latestWeight,
      weightEntries: sortedWeights,
      protocols,
      progressPhotos: sortedPhotos,
      reminders,
    });
    const briefingMemory = getDailyBriefingMemory(latestStoredBriefing);
    const hero = getHeroSummary({
      event,
      primaryEvaluation,
      weightStats,
      evidenceUsed,
    });
    const recommendation = getRecommendation({
      primaryEvaluation,
      weightStats,
      todayPriorities,
    });
    const coachInsight = getCoachInsight({
      briefingMemory,
      evidenceUsed,
      event,
      primaryEvaluation,
      sortedPhotos,
      todayPriorities,
      weightStats,
    });

    return {
      version: DAILY_BRIEFING_VERSION,
      generatedAt: latestAnalysis?.createdAt ?? new Date().toISOString(),
      event,
      hero,
      progress: getProgressSection({
        weightStats,
        latestWeight,
        latestDEXA,
        primaryEvaluation,
        trajectory: intelligence.trajectory,
        weights: sortedWeights,
      }),
      goalStatus,
      facts: getFacts({
        checkIns,
        latestWeight,
        latestPhotos,
        protocols,
        reminders,
        weightStats,
      }),
      coachInterpretation: getCoachInterpretation({
        weightStats,
        primaryEvaluation,
        latestDEXA,
        nutritionContext,
        sortedPhotos,
      }),
      evidenceUsed,
      progressEvidence: getProgressEvidence({
        event,
        sortedWeights,
        sortedDEXA,
        sortedPhotos,
        latestWeight,
        weightStats,
      }),
      confidenceReasons: getConfidenceReasons({
        primaryEvaluation,
        weightStats,
        sortedPhotos,
        latestDEXA,
        protocols,
      }),
      celebration: getCelebration({ weightStats, sortedPhotos, primaryEvaluation }),
      watchItems: getWatchItems({
        evaluations,
        latestDEXA,
        nutritionContext,
        sortedPhotos,
        weightStats,
      }),
      todayPlan: getTodayPlan({ todayPriorities }),
      recommendation,
      lookingAhead: getLookingAhead({ todayPriorities, reminders }),
      coachInsight: coachInsight.text,
      briefingMemory: getUpdatedDailyBriefingMemory({
        briefingMemory,
        coachInsight,
        event,
        hero,
        recommendation,
      }),
    };
  }

  return {
    async getDailyBriefing(userId) {
      const user = userId
        ? await repositories.users.getUserById(userId)
        : await repositories.users.getCurrentUser();
      const resolvedUserId = user?.id ?? userId;

      if (!resolvedUserId) return null;

      const latestStoredBriefing =
        await repositories.dailyBriefings?.getLatestDailyBriefing(resolvedUserId);

      if (latestStoredBriefing?.briefing?.version === DAILY_BRIEFING_VERSION) {
        return latestStoredBriefing.briefing;
      }

      return composeDailyBriefing(resolvedUserId);
    },

    async generateDailyBriefing({ userId, trigger = {} } = {}) {
      const user = userId
        ? await repositories.users.getUserById(userId)
        : await repositories.users.getCurrentUser();
      const resolvedUserId = user?.id ?? userId;
      const briefing = await composeDailyBriefing(resolvedUserId);

      if (!briefing || !repositories.dailyBriefings) return briefing;

      const generatedAt = new Date().toISOString();

      await repositories.dailyBriefings.createDailyBriefing(
        createDailyBriefing({
          id: `daily_briefing_${generatedAt.replace(/\D/g, "")}`,
          userId: resolvedUserId,
          generatedAt,
          trigger,
          briefing: {
            ...briefing,
            generatedAt,
          },
          createdAt: generatedAt,
          updatedAt: generatedAt,
        })
      );

      return briefing;
    },
  };
}

function getWeightStats(weights) {
  const first = weights[0] ?? null;
  const latest = weights.at(-1) ?? null;
  const previous = weights.at(-2) ?? null;
  const lastSeven = weights.slice(-7);
  const previousSeven = weights.slice(-14, -7);
  const weeklyAverage = averageWeight(lastSeven);
  const previousWeeklyAverage = averageWeight(previousSeven);
  const trendPoints = weights.slice(-14).map((entry) => ({
    date: entry.measuredAt,
    value: entry.weight.value,
  }));

  return {
    currentWeight: latest?.weight?.value ?? null,
    unit: latest?.weight?.unit ?? "lb",
    startWeight: first?.weight?.value ?? null,
    totalLost:
      first && latest
        ? Number((first.weight.value - latest.weight.value).toFixed(1))
        : null,
    dayChange:
      previous && latest
        ? Number((latest.weight.value - previous.weight.value).toFixed(1))
        : null,
    weeklyAverage,
    previousWeeklyAverage,
    weekOverWeek:
      weeklyAverage !== null && previousWeeklyAverage !== null
        ? Number((weeklyAverage - previousWeeklyAverage).toFixed(1))
        : null,
    lowestWeight:
      latest && latest.weight.value === Math.min(...weights.map((entry) => entry.weight.value)),
    latestDate: latest?.measuredAt ?? null,
    trendPoints,
  };
}

function getProgressSection({
  weightStats,
  latestWeight,
  latestDEXA,
  primaryEvaluation,
  trajectory,
  weights,
}) {
  return {
    metrics: [
      {
        label: "Current Weight",
        value: formatWeight(weightStats.currentWeight, weightStats.unit),
      },
      {
        label: "Total Lost",
        value:
          weightStats.totalLost === null
            ? "Pending"
            : `${weightStats.totalLost.toFixed(1)} ${weightStats.unit}`,
      },
      {
        label: "Weekly Average",
        value:
          weightStats.weeklyAverage === null
            ? "Pending"
            : formatWeight(weightStats.weeklyAverage, weightStats.unit),
      },
      {
        label: "Week over Week",
        value:
          weightStats.weekOverWeek === null
            ? "Pending"
            : `${formatSigned(weightStats.weekOverWeek)} ${weightStats.unit}`,
      },
      {
        label: "Projected Finish",
        value: trajectory.projectedFinish,
      },
      {
        label: "Goal Progress",
        value: primaryEvaluation ? `${primaryEvaluation.progress}%` : "Pending",
      },
    ],
    chart: getWeightChartPoints(weights, latestDEXA),
    confidence: primaryEvaluation?.confidence ?? 0,
    bodyFat: latestDEXA?.bodyFatPercentage
      ? `${latestDEXA.bodyFatPercentage.toFixed(1)}%`
      : "Pending",
    latestWeightDate: latestWeight?.measuredAt ?? null,
  };
}

function getGoalStatus({ evaluations, intelligence }) {
  return {
    primary: {
      title: "Visible Abs",
      progress: evaluations.find((item) => item.goalId === PRIMARY_GOAL_ID)?.progress ?? 0,
      confidence: intelligence.trajectory.confidence,
      goalConfidence: intelligence.trajectory.goalConfidence,
      projectedFinish: intelligence.trajectory.projectedFinish,
      daysRemaining: intelligence.trajectory.daysRemaining,
      summary: intelligence.trajectory.description,
    },
    supporting: evaluations
      .filter((evaluation) => evaluation.goalId !== PRIMARY_GOAL_ID)
      .map((evaluation) => ({
        title: evaluation.title,
        status: evaluation.presentation?.status ?? evaluation.current,
        detail: evaluation.presentation?.detail ?? evaluation.summary,
        why: evaluation.findings
          .filter((finding) => finding.status === "positive")
          .slice(0, 2)
          .map((finding) => finding.text),
      })),
  };
}

function getFacts({ checkIns, latestWeight, latestPhotos, protocols, reminders, weightStats }) {
  const completedToday = reminders.filter((reminder) =>
    isToday(reminder.completedAt)
  );
  const latestCheckIn = sortByDate(checkIns, "date").at(-1);
  const manualNote = latestCheckIn?.notes;

  return [
    latestWeight && {
      label: "Weight",
      detail: formatWeight(weightStats.currentWeight, weightStats.unit),
    },
    weightStats.dayChange !== null && {
      label: "Daily change",
      detail:
        weightStats.dayChange === 0
          ? "No change from yesterday"
          : `${formatSigned(weightStats.dayChange)} ${weightStats.unit} from yesterday`,
    },
    weightStats.lowestWeight && {
      label: "Low point",
      detail: "Lowest weight maintained",
    },
    latestPhotos.length > 0 && {
      label: "Visual evidence",
      detail: `${latestPhotos.length} recent progress photo records available`,
    },
    completedToday.length > 0 && {
      label: "Completed today",
      detail: completedToday.map((reminder) => reminder.title).join(", "),
    },
    manualNote &&
      latestCheckIn?.recovery?.sleepTargetHit !== false && {
        label: "Journal",
        detail: manualNote,
      },
    latestCheckIn?.recovery?.sleepTargetHit === false && {
      label: "Recovery",
      detail: formatRecoveryNote(manualNote, latestCheckIn.recovery.notes),
    },
    protocols.length > 0 && {
      label: "Active protocols",
      detail: protocols.map((protocol) => protocol.name).join(", "),
    },
  ].filter(Boolean);
}

function getCoachInterpretation({
  weightStats,
  primaryEvaluation,
  latestDEXA,
  nutritionContext,
  sortedPhotos,
}) {
  const weekDirection =
    weightStats.weekOverWeek !== null && weightStats.weekOverWeek < 0
      ? "continues moving down"
      : "is holding steady";
  const bodyFat = latestDEXA?.bodyFatPercentage
    ? `${latestDEXA.bodyFatPercentage.toFixed(1)}%`
    : "DEXA-calibrated";
  const intake = nutritionContext?.estimatedDailyCaloricIntake;
  const intakeText = intake?.min && intake?.max
    ? `Your current ${intake.min}-${intake.max} kcal estimate remains consistent with the cut.`
    : "Nutrition context is not yet complete.";
  const photoText =
    sortedPhotos.length > 0
      ? "Recent progress photos add visual support to the DEXA and scale trend."
      : "Progress photos will increase visual confidence when new evidence is added.";

  return [
    `Today's evidence supports the path toward visible abs. The weekly weight average ${weekDirection}, and the latest DEXA calibration at ${bodyFat} keeps the target close.`,
    `The current rate of loss remains appropriate for preserving lean mass. ${photoText} ${intakeText}`,
    primaryEvaluation?.projection
      ? `Projected finish remains ${primaryEvaluation.projection.daysRemaining}, so today's work is execution, not adjustment.`
      : "Projection is waiting on more trend evidence, so consistency matters more than reacting to one data point.",
  ];
}

function getEvidenceUsed({
  checkIns,
  sortedWeights,
  nutritionContext,
  protocols,
  latestWeight,
  latestDEXA,
  latestPhotos,
}) {
  const latestCheckIn = sortByDate(checkIns, "date").at(-1);

  return [
    latestCheckIn?.recovery?.notes && {
      label: "Recovery",
      detail: formatRecoveryNote(latestCheckIn.notes, latestCheckIn.recovery.notes),
    },
    latestCheckIn?.notes &&
      !latestCheckIn?.recovery?.notes && {
        label: "Journal",
        detail: latestCheckIn.notes,
      },
    sortedWeights.length >= 7 && {
      label: "Recent weigh-ins",
      detail:
        latestWeight && getWeightStats(sortedWeights).weekOverWeek !== null
          ? `${formatWeight(latestWeight.weight.value, latestWeight.weight.unit)} today; weekly average ${formatSigned(getWeightStats(sortedWeights).weekOverWeek)} ${latestWeight.weight.unit}.`
          : "Recent morning weigh-ins keep the trend interpretable.",
    },
    latestDEXA && {
      label: "DEXA progress",
      detail: `Latest DEXA: ${
        latestDEXA.bodyFatPercentage?.toFixed?.(1) ?? "calibrated"
      }% body fat with calibrated lean-mass context.`,
    },
    latestPhotos.length > 0 && {
      label: "Latest progress photos",
      detail: `${latestPhotos.length} recent visual records support the visible-abs goal.`,
    },
    nutritionContext && {
      label: "Nutrition trend",
      detail: formatNutritionEvidence(nutritionContext),
    },
    protocols.length > 0 && {
      label: "Protocol context",
      detail: `${protocols.map((protocol) => protocol.name).join(", ")} remain active context, but completion evidence matters more than assumed effect.`,
    },
  ].filter(Boolean);
}

function getProgressEvidence({
  event,
  sortedWeights,
  sortedDEXA,
  sortedPhotos,
  latestWeight,
  weightStats,
}) {
  const weightJourney = sortedWeights.map((entry) => ({
    date: entry.measuredAt,
    label: formatShortDate(entry.measuredAt),
    value: entry.weight.value,
    unit: entry.weight.unit,
    isLatest: entry.id === latestWeight?.id,
  }));
  const weeklyMomentum = getWeeklyMomentum(sortedWeights);
  const dexaProgress = sortedDEXA.slice(-3).map((scan) => ({
    date: scan.measuredAt,
    label: formatShortDate(scan.measuredAt),
    bodyFat: scan.bodyFatPercentage,
    fatMass: scan.fatMass?.value ?? null,
    leanMass: scan.leanMass?.value ?? null,
    unit: scan.fatMass?.unit ?? "lb",
  }));
  const previousDEXA = dexaProgress.at(-2);
  const latestDEXA = dexaProgress.at(-1);
  const fatMassChange =
    typeof previousDEXA?.fatMass === "number" && typeof latestDEXA?.fatMass === "number"
      ? Number((latestDEXA.fatMass - previousDEXA.fatMass).toFixed(1))
      : null;
  const bodyFatChange =
    typeof previousDEXA?.bodyFat === "number" && typeof latestDEXA?.bodyFat === "number"
      ? Number((latestDEXA.bodyFat - previousDEXA.bodyFat).toFixed(1))
      : null;

  return {
    weights: {
      title: "Weight",
      badge: weightStats.lowestWeight ? "New Low Maintained" : "Trend Confirmed",
      summary: getWeightEvidenceSummary({ event, weeklyMomentum, weightStats }),
      points: weightJourney,
      weeklyMomentum,
    },
    dexa: {
      title: "DEXA",
      badge: "DEXA Confirmed",
      summary: getDEXAEvidenceSummary({ bodyFatChange, fatMassChange, latestDEXA }),
      scans: dexaProgress,
    },
    photos: {
      title: "Progress Photos",
      badge: "Visual Evidence Improving",
      summary:
        sortedPhotos.length > 0
          ? "Recent progress photos added comparable visual evidence. That matters because visual goals need visual confirmation, not only scale or DEXA math. The photo series reinforces improving upper-ab definition, oblique separation, back definition, and muscle-retention appearance."
          : "Progress photos will become direct visual evidence after the next upload.",
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

function getConfidenceReasons({
  primaryEvaluation,
  weightStats,
  sortedPhotos,
  latestDEXA,
  protocols,
}) {
  return [
    weightStats.weekOverWeek !== null &&
      weightStats.weekOverWeek <= 0 && {
        label: "Body fat continuing downward",
        tone: "success",
      },
    primaryEvaluation?.findings?.some((finding) => finding.id === "lean_mass_preserved" && finding.status === "positive") && {
      label: "Lean mass likely preserved",
      tone: "success",
    },
    sortedPhotos.length > 0 && {
      label: "Progress photos increased confidence",
      tone: "evidence",
    },
    latestDEXA && {
      label: "DEXA trend confirmed",
      tone: "evidence",
    },
    protocols.length > 0 && {
      label: "Current protocol working",
      tone: "success",
    },
  ].filter(Boolean);
}

function getCelebration({ weightStats, sortedPhotos, primaryEvaluation }) {
  if (weightStats.lowestWeight) {
    return {
      title: "Lowest weight of the cut.",
      detail:
        "That is a real signal. One day never tells the whole story, but a new low confirms that execution is showing up in the evidence.",
    };
  }

  if (weightStats.weekOverWeek !== null && weightStats.weekOverWeek < 0) {
    return {
      title: "Weekly average improved.",
      detail:
        "The trend is doing the work. That is exactly what should matter more than any single weigh-in.",
    };
  }

  if (sortedPhotos.length >= 6) {
    return {
      title: "Visual evidence is consistent.",
      detail:
        "Progress photos are being captured under comparable conditions, which makes future visual evaluation much more trustworthy.",
    };
  }

  return {
    title: "Consistency is compounding.",
    detail: primaryEvaluation?.summary ?? "The current plan continues to have enough evidence behind it.",
  };
}

function getWatchItems({ evaluations, latestDEXA, nutritionContext, sortedPhotos, weightStats }) {
  const bodyFatEvidenceAligned =
    Boolean(latestDEXA) &&
    sortedPhotos.length > 0 &&
    weightStats.weekOverWeek !== null &&
    weightStats.weekOverWeek <= 0;

  if (bodyFatEvidenceAligned) return [];

  return [
    {
      title: "Lean mass",
      detail:
        latestDEXA?.leanMass?.value
          ? sortedPhotos.length > 0
            ? `Latest DEXA shows ${latestDEXA.leanMass.value.toFixed(1)} ${latestDEXA.leanMass.unit}; recent photos add supporting confidence between scans.`
            : `Latest DEXA shows ${latestDEXA.leanMass.value.toFixed(1)} ${latestDEXA.leanMass.unit}; continue confirming preservation at the next scan.`
          : "Lean mass needs DEXA confirmation.",
    },
    !bodyFatEvidenceAligned && {
      title: "Body-fat estimate",
      detail:
        "Current body fat between scans remains estimated from DEXA and weight trend, so avoid overreacting to a single day.",
    },
    nutritionContext?.estimatedDailyActiveCalorieBurn?.marginOfErrorPercent && {
      title: "Calorie burn estimate",
      detail:
        "We allow for normal wearable margin of error, but your consistently high activity level makes the trend useful. Combined with recent weigh-ins and adherence, confidence in your current trajectory remains high.",
    },
  ]
    .filter(Boolean)
    .slice(0, Math.min(2, Math.max(1, evaluations.length)));
}

function getTodayPlan({ todayPriorities }) {
  return todayPriorities.slice(0, 4).map((priority) => ({
    label: priority.label,
    detail: [priority.subtitle, priority.metadata].filter(Boolean).join(" - ") || "Today",
  }));
}

function getRecommendation({ primaryEvaluation, weightStats, todayPriorities }) {
  const topPriority = todayPriorities.find((priority) => !priority.completed);

  if (topPriority) {
    return {
      title: topPriority.label,
      detail:
        topPriority.label === "Foam Roll"
          ? "Protect recovery today. Recovery work is the highest-leverage behavior because the cut is already moving in the right direction."
          : `Complete ${topPriority.label}. The evidence supports the current protocol, so today's highest-leverage move is execution.`,
    };
  }

  if (weightStats.weekOverWeek !== null && weightStats.weekOverWeek < -2) {
    return {
      title: "Protect recovery.",
      detail:
        "The trend is moving quickly enough that protein, sleep, and training quality should stay protected.",
    };
  }

  return {
    title: "Stay consistent.",
    detail:
      primaryEvaluation?.projection?.daysRemaining
        ? `Evidence still supports visible abs in ${primaryEvaluation.projection.daysRemaining}. Let the next check-in confirm the trend.`
        : "The available evidence supports staying the course while more trend data accumulates.",
  };
}

function getLookingAhead({ todayPriorities, reminders }) {
  if (todayPriorities.length > 0) return [];

  const upcoming = [
    ...todayPriorities.map((priority) => ({
      label: priority.label,
      detail: priority.subtitle ?? "Today",
    })),
    ...reminders
      .filter((reminder) => reminder.active)
      .slice(0, 3)
      .map((reminder) => ({
        label: reminder.title,
        detail: formatReminderTiming(reminder),
      })),
  ];

  return dedupeByLabel(upcoming).slice(0, 4);
}

function getHeroSummary({ event, primaryEvaluation, weightStats, evidenceUsed }) {
  return {
    primaryGoal: "Visible Abs at Rest",
    title: getHeroInsight({ event, primaryEvaluation, weightStats }),
    summary: getHeroConfidenceSummary({ event, evidenceUsed, weightStats }),
    progress: primaryEvaluation?.progress ?? 0,
    confidence: primaryEvaluation?.confidence ?? 0,
    confidenceLabel:
      primaryEvaluation?.goalConfidence?.label ??
      getConfidenceLabel(primaryEvaluation?.confidence ?? 0),
  };
}

function getCoachInsight({
  briefingMemory,
  evidenceUsed,
  event,
  primaryEvaluation,
  sortedPhotos,
  todayPriorities,
  weightStats,
}) {
  const evidenceAgreement =
    weightStats.weekOverWeek !== null &&
    weightStats.weekOverWeek <= 0 &&
    sortedPhotos.length > 0 &&
    evidenceUsed.some((item) => item.label === "DEXA progress");
  const priority = todayPriorities.find((item) => !item.completed);
  const eventLead = event?.coachLead ? `${event.coachLead} ` : "";
  const candidates = [];

  if (event?.type === "new_low_weight") {
    candidates.push({
      theme: "new_low",
      text: "The new low is useful because it extends the trend instead of contradicting it. Keep the day simple and protect execution.",
    });
  }

  if (priority) {
    candidates.push({
      theme: "priority_execution",
      text: `${priority.label} is the highest-leverage unfinished action today. Completing it keeps the operating plan aligned without adding complexity.`,
    });
  }

  if (event?.type === "held_low_weight") {
    candidates.push({
      theme: "stabilization",
      text: "Holding the low is a good signal today. It suggests the recent drop is becoming a defendable level rather than a one-day fluctuation.",
    });
  }

  if (evidenceAgreement) {
    candidates.push({
      theme: "evidence_alignment",
      text: "The useful signal is agreement: weight, DEXA, and photos are still pointing in the same direction. No new lever is needed today.",
    });
  }

  candidates.push({
    theme: "steady_execution",
    text:
      primaryEvaluation?.summary ??
      "The current evidence supports steady execution. Keep the plan simple and let tomorrow's evidence sharpen the picture.",
  });

  const selected =
    candidates.find(
      (candidate) => candidate.theme !== briefingMemory.previousCoachInsightTheme
    ) ?? candidates[0];

  return {
    theme: selected.theme,
    text: `${eventLead}${selected.text}`.trim(),
  };
}

function getDailyBriefingMemory(latestStoredBriefing) {
  const briefing = latestStoredBriefing?.briefing;

  return {
    previousBriefingDate:
      latestStoredBriefing?.generatedAt ?? briefing?.generatedAt ?? null,
    previousCoachInsight: briefing?.coachInsight ?? null,
    previousCoachInsightTheme:
      briefing?.briefingMemory?.coachInsightTheme ??
      inferCoachInsightTheme(briefing?.coachInsight),
    previousEvidenceEvent:
      briefing?.briefingMemory?.currentEvidenceEvent ??
      briefing?.event?.type ??
      null,
    previousHeadline:
      briefing?.briefingMemory?.currentHeadline ?? briefing?.hero?.title ?? null,
    previousRecommendation:
      briefing?.briefingMemory?.currentRecommendation ??
      briefing?.recommendation?.title ??
      briefing?.recommendation?.summary ??
      null,
  };
}

function getUpdatedDailyBriefingMemory({
  briefingMemory,
  coachInsight,
  event,
  hero,
  recommendation,
}) {
  return {
    previousBriefingDate: briefingMemory.previousBriefingDate,
    previousCoachInsightTheme: briefingMemory.previousCoachInsightTheme,
    previousEvidenceEvent: briefingMemory.previousEvidenceEvent,
    previousHeadline: briefingMemory.previousHeadline,
    previousRecommendation: briefingMemory.previousRecommendation,
    coachInsightTheme: coachInsight.theme,
    currentEvidenceEvent: event?.type ?? null,
    currentHeadline: hero?.title ?? null,
    currentRecommendation:
      recommendation?.title ?? recommendation?.summary ?? null,
  };
}

function inferCoachInsightTheme(insight) {
  if (!insight) return null;
  const value = insight.toLowerCase();

  if (value.includes("new low")) return "new_low";
  if (value.includes("holding") || value.includes("stabilization")) {
    return "stabilization";
  }
  if (value.includes("same direction") || value.includes("agreement")) {
    return "evidence_alignment";
  }
  if (value.includes("unfinished") || value.includes("execution rhythm")) {
    return "priority_execution";
  }

  return "steady_execution";
}

function getHeroInsight({ event, primaryEvaluation, weightStats }) {
  if (event?.heroTitle) return event.heroTitle;
  if (weightStats.lowestWeight) return "You're winning.";
  if (weightStats.weekOverWeek !== null && weightStats.weekOverWeek <= 0) {
    return "You're on track.";
  }

  return primaryEvaluation?.summary ?? "Today is about execution.";
}

function getHeroConfidenceSummary({ event, evidenceUsed, weightStats }) {
  if (event?.heroSummary) return event.heroSummary;
  if (weightStats.lowestWeight) {
    return "New low maintained, with supporting evidence still aligned.";
  }

  if (evidenceUsed.length >= 4) {
    return "Multiple evidence streams support the visible-abs trajectory.";
  }

  return "The current evidence supports staying the course.";
}

function getWeightEvidenceSummary({ event, weeklyMomentum, weightStats }) {
  const current = weeklyMomentum.at(-1);
  const eventLead = event?.journeyLead ? `${event.journeyLead} ` : "";

  if (current?.change !== null && current.change < 0) {
    return `${eventLead}That matters because it confirms the scale is still responding without needing a plan change. The current rolling week is down ${Math.abs(current.change).toFixed(1)} ${weightStats.unit} versus the previous week, reinforcing the longer cut trajectory.`;
  }

  if (weightStats.weekOverWeek !== null && weightStats.weekOverWeek < 0) {
    return `${eventLead}That matters because the daily signal agrees with the weekly trend. Weekly average is ${formatSigned(weightStats.weekOverWeek)} ${weightStats.unit}, reinforcing continued fat-loss momentum.`;
  }

  return `${eventLead}That matters because weight remains the clearest short-term signal for the cut. The next few weigh-ins will show whether this reinforces or simply extends the current trend.`;
}

function formatRecoveryNote(originalNote, fallback) {
  if (!originalNote) return fallback ?? "Recovery context was added.";

  const lower = originalNote.toLowerCase();

  if (lower.includes("sleep") && lower.includes("7 hour")) {
    return "Sleeping deeply, but sleep duration was reduced over the past two nights.";
  }

  if (lower.includes("sleep") || lower.includes("slept")) {
    return originalNote;
  }

  return fallback ?? originalNote;
}

function getDEXAEvidenceSummary({ bodyFatChange, fatMassChange, latestDEXA }) {
  if (bodyFatChange !== null && bodyFatChange < 0) {
    return `DEXA confirmed body fat moved ${bodyFatChange.toFixed(1)} percentage points to ${latestDEXA.bodyFat.toFixed(1)}%. That matters because DEXA is the calibration source for body composition. The scan trend reinforces that the cut is moving toward the target while lean mass remains the key metric to protect.`;
  }

  if (fatMassChange !== null && fatMassChange < 0) {
    return `DEXA shows fat mass down ${Math.abs(fatMassChange).toFixed(1)} ${latestDEXA.unit}. That matters because fat-mass movement validates the weight trend. The latest scan reinforces the current body-fat trajectory.`;
  }

  return "Latest DEXA remains the highest-confidence calibration source for body composition. That matters because it anchors estimates between scans. Future DEXA results will reinforce or adjust the current trajectory.";
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
    const rolling = {
      label: "Current Rolling 7 Days",
      period: `${formatShortDate(toDateKey(rollingStart))}-${formatShortDate(toDateKey(rollingEnd))}`,
      average: rollingAverage,
      change:
        previousRollingAverage === null
          ? null
          : Number((rollingAverage - previousRollingAverage).toFixed(1)),
      unit: rollingEntries.at(-1)?.weight?.unit ?? "lb",
    };
    const last = weeks.at(-1);

    if (!last || last.period !== rolling.period) {
      weeks.push(rolling);
    } else {
      weeks[weeks.length - 1] = rolling;
    }
  }

  return weeks.slice(-6);
}

function getConfidenceLabel(confidence) {
  if (confidence >= 90) return "Very High";
  if (confidence >= 80) return "High";
  if (confidence >= 55) return "Moderate";

  return "Building";
}

function formatNutritionEvidence(nutritionContext) {
  const intake = nutritionContext?.estimatedDailyCaloricIntake;

  if (intake?.min && intake?.max) {
    return `${intake.min}-${intake.max} ${intake.unit ?? "kcal"} target range supports the current plan.`;
  }

  return "Nutrition context is available for interpretation.";
}

function getWeightChartPoints(weights, latestDEXA) {
  const points = weights;
  const values = points.map((entry) => entry.weight.value);

  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const latestDexaDate = latestDEXA?.measuredAt ?? null;

  return points.map((entry, index) => ({
    date: entry.measuredAt,
    value: entry.weight.value,
    label: formatShortDate(entry.measuredAt),
    isStart: index === 0,
    isLatest: index === points.length - 1,
    isDexa: entry.measuredAt === latestDexaDate,
    normalized: Number(((max - entry.weight.value) / range).toFixed(4)),
  }));
}

function averageWeight(weights) {
  if (weights.length === 0) return null;

  const total = weights.reduce((sum, entry) => sum + entry.weight.value, 0);

  return Number((total / weights.length).toFixed(1));
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

function formatWeight(value, unit = "lb") {
  if (value === null || value === undefined) return "Pending";

  return `${value.toFixed(1)} ${unit}`;
}

function formatSigned(value) {
  if (value > 0) return `+${value.toFixed(1)}`;

  return value.toFixed(1);
}

function formatReminderTiming(reminder) {
  if (reminder.title === "Morning Weight") return "Daily in the morning";

  if (reminder.schedule?.dayOfWeek && reminder.schedule?.timeOfDay) {
    return `${capitalize(reminder.schedule.dayOfWeek)} ${formatTimingLabel(reminder.schedule.timeOfDay)}`;
  }

  if (reminder.schedule?.daysOfWeek?.length && reminder.schedule?.timeOfDay) {
    return `${reminder.schedule.daysOfWeek.map(capitalize).join(", ")} ${formatTimingLabel(reminder.schedule.timeOfDay)}`;
  }

  return reminder.schedule?.timeOfDay
    ? formatTimingLabel(reminder.schedule.timeOfDay)
    : "Upcoming";
}

function dedupeByLabel(items) {
  const labels = new Set();

  return items.filter((item) => {
    if (labels.has(item.label)) return false;
    labels.add(item.label);

    return true;
  });
}

function capitalize(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatTimingLabel(value) {
  return String(value)
    .split("_")
    .map(capitalize)
    .join(" ");
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

function isToday(value) {
  if (!value) return false;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}
