const PRIMARY_GOAL_LABEL = "Visible Abs at Rest";

export function createDailyNarrativeStory({
  approvedPhotoLedStory = null,
  briefingMemory = {},
  dailyEvidence = {},
  event = null,
  evidenceUsed = [],
  latestPhotoIntelligence = null,
  narrativeNovelty = null,
  primaryEvaluation = null,
  sortedPhotos = [],
  trainingPerformanceSignal = null,
  weightStats = {},
} = {}) {
  if (latestPhotoIntelligence?.availability === "rich" && approvedPhotoLedStory) {
    return {
      continuity: getContinuity({ briefingMemory, event }),
      coachInsight: {
        theme: "photo_led_golden",
        text: approvedPhotoLedStory.coachInsight,
      },
      hero: approvedPhotoLedStory.hero,
      interpretation: approvedPhotoLedStory.interpretation,
      primaryGoal: PRIMARY_GOAL_LABEL,
      theme: "photo_led_golden",
    };
  }

  if (latestPhotoIntelligence) {
    return createLimitedPhotoStory({ latestPhotoIntelligence, weightStats });
  }

  if (event?.type === "weight_fluctuation_resolved") {
    return createFluctuationResolutionStory({
      briefingMemory,
      event,
      sortedPhotos,
      weightStats,
    });
  }

  if (dailyEvidence?.weight?.status === "updated_today") {
    return createWeightUpdateStory({ narrativeNovelty, sortedPhotos, weightStats });
  }

  return createSteadyPhysiologyStory({
    briefingMemory,
    event,
    evidenceUsed,
    narrativeNovelty,
    primaryEvaluation,
    sortedPhotos,
    trainingPerformanceSignal,
    weightStats,
  });
}

function createFluctuationResolutionStory({ briefingMemory, event, sortedPhotos, weightStats }) {
  const weeklyContext =
    weightStats.weekOverWeek !== null && weightStats.weekOverWeek !== undefined
      ? `The weekly trend is ${formatSigned(weightStats.weekOverWeek)} ${
          weightStats.unit
        }, so the larger read still belongs to the trend rather than yesterday's noise.`
      : "The larger read still belongs to the trend rather than yesterday's noise.";
  const photoContext =
    sortedPhotos.length > 0
      ? "Your latest photos remain the stronger physique context, and today's scale read does not challenge that."
      : "There were no new photos today, so the useful lesson is how the scale behaved after yesterday's bump.";

  return {
    continuity: {
      previousChapter: briefingMemory.previousHeadline ?? null,
      resolvedUncertainty: "yesterday_weight_bump",
      sequence: [
        "temporary scale increase",
        "return toward trend",
        "trend preserved",
        "stay the course",
      ],
    },
    coachInsight: {
      theme: "fluctuation_resolution",
      text:
        "This is exactly why we do not overreact to one morning's weigh-in. Yesterday's increase disappeared as quickly as it arrived, while the overall trend kept behaving the way we would expect during a successful cut. Nothing here suggests changing the plan.",
    },
    hero: {
      title: event?.heroTitle ?? "Yesterday's bump already resolved.",
      summary:
        event?.heroSummary ??
        "Today's weigh-in reinforces that yesterday's increase was normal day-to-day fluctuation, not a new trend.",
    },
    interpretation: [
      "Yesterday's weight bump has already resolved. Today's weigh-in reinforces that the increase behaved like normal day-to-day fluctuation, not a change in direction.",
      `${weeklyContext} ${photoContext} The right response is to keep the plan steady and let repeated check-ins, not one noisy morning, decide whether anything needs to change.`,
    ],
    primaryGoal: PRIMARY_GOAL_LABEL,
    teachingPoint: "Scale volatility only matters when it persists long enough to become a trend.",
    theme: "fluctuation_resolution",
  };
}

function createWeightUpdateStory({ narrativeNovelty, sortedPhotos, weightStats }) {
  const trend =
    weightStats.weekOverWeek !== null && weightStats.weekOverWeek !== undefined
      ? `Your body is still moving in the right direction over the week: ${formatSigned(
          weightStats.weekOverWeek
        )} ${weightStats.unit}.`
      : "One weigh-in is not enough to rewrite the trend.";
  const photoContext =
    sortedPhotos.length > 0
      ? "Yesterday's photos are still the strongest physique read, and today does not give us a reason to change that read."
      : "There were no new photos today, so the lesson is simple: do not overreact to one morning.";

  return {
    coachInsight: {
      theme: "weight_update",
      text: `${trend} ${photoContext} ${
        narrativeNovelty?.noChangeRationale ??
        "I would stay with the current plan unless your body starts giving the same warning several check-ins in a row."
      }`,
    },
    hero: {
      title: weightStats.lowestWeight
        ? "Another low weigh-in matters."
        : "The cut still looks on track.",
      summary: weightStats.lowestWeight
        ? "The useful change today is confirmation: the scale is extending the trend, not creating a new concern."
        : "Today's weigh-in does not change the read: your body is still moving toward the goal.",
    },
    interpretation: null,
    primaryGoal: PRIMARY_GOAL_LABEL,
    theme: "weight_update",
  };
}

function createLimitedPhotoStory({ latestPhotoIntelligence, weightStats }) {
  const scaleContext =
    weightStats.dayChange !== null &&
    weightStats.dayChange !== undefined &&
    weightStats.dayChange > 0
      ? `The scale being up ${weightStats.dayChange.toFixed(
          1
        )} ${weightStats.unit} today is normal noise, not a reason to change the plan. `
      : "";
  const summary =
    latestPhotoIntelligence.interpretation.coach_briefing_insert ??
    latestPhotoIntelligence.briefing?.summary ??
    "Today's photos are the most important new evidence.";

  return {
    coachInsight: {
      theme: "photo_interpreter",
      text: `${scaleContext}${summary}`.trim(),
    },
    hero: {
      title: "Your photos show how the cut is moving.",
      summary: latestPhotoIntelligence.briefing?.summary ?? summary,
    },
    interpretation: null,
    primaryGoal: PRIMARY_GOAL_LABEL,
    theme: "photo_interpreter",
  };
}

function createSteadyPhysiologyStory({
  briefingMemory,
  event,
  evidenceUsed,
  narrativeNovelty,
  primaryEvaluation,
  sortedPhotos,
  trainingPerformanceSignal,
  weightStats,
}) {
  const evidenceAgreement =
    weightStats.weekOverWeek !== null &&
    weightStats.weekOverWeek <= 0 &&
    sortedPhotos.length > 0 &&
    evidenceUsed.some((item) => item.label === "DEXA progress");
  const eventLead = event?.coachLead ? `${event.coachLead} ` : "";
  const candidates = [];

  if (event?.type === "new_low_weight") {
    candidates.push({
      theme: "new_low",
      text: "The only thing that really changed today is another low weigh-in, and that matters because it confirms the trend rather than creating a new concern. The job now is to keep the last stretch boring, protect muscle, and avoid fixing something that is clearly still working.",
    });
  }

  if (event?.type === "held_low_weight") {
    candidates.push({
      theme: "stabilization",
      text: "Holding the low marks a durability test. The useful question is no longer whether the plan can create movement; it is whether your body can stabilize at the new level while muscle, recovery, and visual quality stay protected.",
    });
  }

  if (evidenceAgreement) {
    candidates.push({
      theme: "evidence_alignment",
      text: "Weight, the last DEXA, and recent photos still support the cut. That is enough reason to keep the plan steady; the better question now is whether training quality stays intact while body weight trends lower.",
    });
  }

  if (trainingPerformanceSignal?.shouldMention) {
    candidates.push({
      theme: "performance_preservation",
      text: `${trainingPerformanceSignal.coachLine} That supports the lean-mass-preservation side of the visible-abs goal, so the decision today is to protect training quality while the cut keeps working.`,
    });
  }

  candidates.push({
    theme: "steady_execution",
    text:
      primaryEvaluation?.projection?.daysRemaining
        ? `You are moving from proving the plan toward finishing it well. With ${primaryEvaluation.projection.daysRemaining} left, the smarter move is patience: ${
            narrativeNovelty?.noChangeRationale ??
            "keep the conditions steady and let the next strong check-in tell us whether anything needs to change."
          }`
        : primaryEvaluation?.summary ??
          "The current phase is about making the picture clearer without making the plan louder. Keep the inputs steady, keep the evidence clean, and let the trend do the talking.",
  });

  const selected =
    candidates.find(
      (candidate) => candidate.theme !== briefingMemory.previousCoachInsightTheme
    ) ?? candidates[0];

  return {
    coachInsight: {
      theme: selected.theme,
      text: `${eventLead}${selected.text}`.trim(),
    },
    hero: {
      title: event?.heroTitle ?? getHeroInsight({ primaryEvaluation, weightStats }),
      summary:
        event?.heroSummary ??
        getHeroConfidenceSummary({
          evidenceUsed,
          primaryEvaluation,
          sortedPhotos,
          weightStats,
        }),
    },
    interpretation: null,
    primaryGoal: PRIMARY_GOAL_LABEL,
    theme: selected.theme,
  };
}

function getContinuity({ briefingMemory, event }) {
  return {
    previousChapter: briefingMemory.previousHeadline ?? null,
    previousEvent: briefingMemory.previousEvidenceEvent ?? null,
    currentEvent: event?.type ?? null,
  };
}

function getHeroInsight({ primaryEvaluation, weightStats }) {
  if (weightStats.lowestWeight) return "New low confirmed.";
  if (weightStats.weekOverWeek !== null && weightStats.weekOverWeek <= 0) {
    return "Goal trajectory unchanged.";
  }

  return primaryEvaluation?.projection
    ? "The timeline still looks steady."
    : "A few more check-ins will make the picture clearer.";
}

function getHeroConfidenceSummary({
  evidenceUsed,
  primaryEvaluation,
  sortedPhotos,
  weightStats,
}) {
  if (weightStats.lowestWeight) {
    return "The latest weigh-in validates the prior trend instead of forcing a new interpretation.";
  }

  if (evidenceUsed.length >= 4 && sortedPhotos.length > 0) {
    return "Weight, your last DEXA, and recent photos still support the visible-abs trajectory.";
  }

  if (primaryEvaluation?.projection?.daysRemaining) {
    return `The current plan still looks capable of getting you there in ${primaryEvaluation.projection.daysRemaining}.`;
  }

  return "The plan still looks reasonable, and a few more check-ins will make the picture clearer.";
}

function formatSigned(value) {
  if (!Number.isFinite(value)) return "0.0";

  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}
