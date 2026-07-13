export function composeNarrativeSurface({
  artifactType = "scheduled",
  currentChapter = null,
  coachInsight,
  confidence,
  eventType = null,
  hero,
  interpretation = [],
  projection = null,
  recommendation = null,
  temporalContext = null,
  trainingPerformance = null,
  weight = null,
  storyTheme = null,
  evidenceCoverage = null,
} = {}) {
  if (artifactType !== "event") {
    return composeScheduledNarrative({ confidence, evidenceCoverage, projection, recommendation, storyTheme, temporalContext, trainingPerformance, weight });
  }

  const analyticalInterpretation = interpretation.filter(isAnalyticalInterpretation);
  const voicedCoachInsight = String(coachInsight ?? "").replace(
    /Today does not call for a protocol change\./i,
    "No protocol change is recommended today."
  );
  const timeline = projection?.projectedFinish ?? projection?.daysRemaining ?? null;
  const timelineLine = timeline
    ? `The current evidence still points toward ${timeline}; use the next scheduled measurement to confirm that path.`
    : null;

  const eventTitles = {
    progress_photo: "Your latest photos move the visual story forward.",
    dexa: "The new DEXA recalibrates the cut.",
  };

  return {
    hero: {
      ...hero,
      currentChapter,
      confidence,
      title: eventTitles[eventType] ?? hero?.title,
    },
    interpretation: analyticalInterpretation,
    coachInsight: [voicedCoachInsight, timelineLine].filter(Boolean).join(" "),
  };
}

function composeScheduledNarrative({ confidence, evidenceCoverage, projection, recommendation, storyTheme, temporalContext, trainingPerformance, weight }) {
  const relative = temporalContext?.relativeLabel === "yesterday" ? "Yesterday" : "The completed evidence window";
  const dayLabel = formatWeekday(temporalContext?.date);
  const weeklyDirection = weight?.weekOverWeek != null && weight.weekOverWeek < 0 ? "downward" : "established";
  const trainingNarrative = getTrainingNarrative(trainingPerformance, weeklyDirection);
  const observations = [
    `${dayLabel}'s weigh-in stayed aligned with the trend.`,
    trainingNarrative.support,
    projection?.projectedFinish
      ? "We're still moving toward the next scheduled measurement."
      : "We're still moving in the right direction.",
  ];
  const changeContext = weight?.dayChange == null
    ? "The completed weigh-in fits the bigger picture without changing it."
    : `The ${formatMagnitude(weight.dayChange, weight.unit)} is normal day-to-day movement. The rolling trend is still ${weeklyDirection === "downward" ? "moving down" : "intact"}.`;
  const recommendationText = recommendation?.narrativePriority === "material"
    ? recommendation.summary ?? recommendation.title
    : "Keep execution steady. Preserve training quality and let the trend continue doing its job.";

  const narrative = {
    hero: {
      currentChapter: "final_stretch",
      confidence,
      confidenceLabel: getConfidenceLabel(confidence),
      primaryGoal: "Visible Abs at Rest",
      title: "Another day of confirmation.",
      summary: `${relative}'s weigh-in fit right into the trend we've been building. Everything still points in the same direction as the cut approaches its finish line.`,
    },
    supportingObservations: observations.slice(0, 3),
    interpretation: [
      changeContext,
      trainingNarrative.interpretation,
    ],
    coachInsight: `${dayLabel} gave us another steady day. There's nothing here to chase this close to the finish line.`,
    coachInsightView: {
      intro: `${dayLabel} gave us another steady day. There's nothing here to chase this close to the finish line.`,
      currentFocusLabel: "Current Focus",
      currentFocusBody: recommendationText,
    },
  };
  const energyNarrative = getEnergyBalanceNarrative(evidenceCoverage?.energyBalanceExecutionContext);
  if (energyNarrative?.interpretation) narrative.interpretation.push(energyNarrative.interpretation);
  if (energyNarrative?.coachResponse) {
    narrative.coachInsightView.currentFocusBody = energyNarrative.coachResponse;
  }

  if (storyTheme === "fluctuation_resolution") {
    narrative.hero.title = "Yesterday's bump settled right back into the trend.";
    narrative.hero.summary = "The completed weigh-in behaved like normal day-to-day fluctuation rather than a change in direction.";
    narrative.interpretation[0] = "Yesterday's scale movement settled without changing the picture. The rolling trend is still moving in the same direction.";
    narrative.coachInsight = "The quick resolution is a useful reminder: do not overreact to one weigh-in.";
    narrative.coachInsightView.intro = narrative.coachInsight;
  } else if (storyTheme === "new_low" || (storyTheme === "weight_update" && weight?.lowestWeight)) {
    narrative.hero.title = `${dayLabel} set another low.`;
    narrative.hero.summary = `${relative}'s weigh-in extended the established downward trend.`;
    narrative.interpretation[0] = `${relative}'s new low confirms the trend built across the prior weeks. One value remains part of a pattern rather than a complete assessment by itself.`;
    narrative.coachInsight = "Another low is restrained confirmation, not a reason to force a faster result. No protocol change is recommended.";
    narrative.coachInsightView.intro = narrative.coachInsight;
  }

  narrative.narrationAudit = {
    ...auditNarrative(narrative),
    evidenceCoverage: evidenceCoverage?.domains ?? {},
  };
  return narrative;
}

function getEnergyBalanceNarrative(context) {
  if (!context?.selectedForInterpretation) return null;
  const hasNutrition = Boolean(context.nutrition);
  const hasActivity = Boolean(context.activity);
  if (hasNutrition && hasActivity && context.combinedAlignment === "aligned") {
    return { interpretation: "Nutrition and total-day activity stayed right where we wanted them. Together, they matched the pace that has been working without changing the bigger picture.", coachResponse: null };
  }
  if (hasNutrition && hasActivity) {
    return { interpretation: "Nutrition and total-day activity pulled in different directions, so they do not tell as clear a story as weight and training.", coachResponse: "Bring nutrition and total-day activity back together while keeping training steady." };
  }
  if (hasNutrition) {
    return { interpretation: "The completed nutrition record fills in part of the day, but total-day activity is missing, so we cannot judge how the two worked together.", coachResponse: null };
  }
  if (hasActivity) {
    return { interpretation: "We have complete total-day activity, but nutrition is missing. Activity alone cannot tell us how the full day came together.", coachResponse: null };
  }
  return null;
}

function getTrainingNarrative(signal, weeklyDirection) {
  if (!signal?.shouldMention) {
    return {
      support: "Training is holding up well.",
      interpretation: "Training continues to hold up well during the cut. That is encouraging this late in the process, even though training alone cannot tell us exactly what is happening with lean mass.",
    };
  }
  const exercise = signal.recentPrs?.[0] ?? signal.improvingExercises?.[0] ?? "a recent lift";
  if (signal.status === "recent_pr") {
    return {
      support: `A recent ${exercise} PR is another sign that strength is holding up.`,
      interpretation: `Training continues to hold up well. A recent ${exercise} PR is encouraging while body weight is still ${weeklyDirection === "downward" ? "trending down" : "following the established trend"}. One PR does not tell the whole story, but it is another sign that strength has not broadly fallen off.`,
    };
  }
  if (signal.status === "regressing") {
    return {
      support: "Training performance is showing a decline.",
      interpretation: "Training has slipped across several comparable sessions. That pattern is worth noticing, although it does not tell us by itself that muscle has been lost.",
    };
  }
  if (signal.status === "improving") {
    return {
      support: `${exercise} is still progressing.`,
      interpretation: `${exercise} continues to progress while the cut moves forward. Training is still responding well despite the deficit.`,
    };
  }
  return {
    support: "Training performance remains steady.",
    interpretation: "Training remains steady. At this stage of the cut, holding performance is a positive result because strength has not broadly fallen off.",
  };
}

function auditNarrative(narrative) {
  const supports = narrative.supportingObservations ?? [];
  const interpretation = narrative.interpretation ?? [];
  const allNarration = [narrative.hero?.summary, ...supports, ...interpretation, narrative.coachInsight, narrative.coachInsightView?.currentFocusBody].filter(Boolean);
  const jargon = /training-quality signal|materially|subordinate|physiological|functional preservation|directionally|concordant|broader assessment|energy-balance strategy|positive performance signal|current trajectory/i;
  const sentenceLengths = allNarration.flatMap((item) => String(item).split(/[.!?]+/).map((sentence) => sentence.trim().split(/\s+/).filter(Boolean).length).filter(Boolean));
  return {
    longHeroSupport: supports.filter((item) => item.length > 90),
    heroInterpretationDuplicates: findNearDuplicates(supports, interpretation),
    interpretationCoachDuplicates: findNearDuplicates(interpretation, [narrative.coachInsight]),
    jargon: [...supports, ...interpretation].filter((item) => jargon.test(item)),
    recommendationLeakage: interpretation.filter((item) => /\bshould\b|recommend|current focus|protocol change|\bkeep\b/i.test(item)),
    flatCurrentFocus: /current focus\s*:/i.test(narrative.coachInsight ?? ""),
    voice: {
      averageSentenceWords: sentenceLengths.length ? Number((sentenceLengths.reduce((sum, value) => sum + value, 0) / sentenceLengths.length).toFixed(1)) : 0,
      longestSentenceWords: sentenceLengths.length ? Math.max(...sentenceLengths) : 0,
      overlyComplexSentences: sentenceLengths.filter((length) => length > 26).length,
      jargonDensity: allNarration.length ? Number((allNarration.filter((item) => jargon.test(item)).length / allNarration.length).toFixed(2)) : 0,
    },
  };
}

function findNearDuplicates(left, right) {
  return left.flatMap((a) => right.filter((b) => tokenOverlap(a, b) >= 0.72).map((b) => ({ left: a, right: b })));
}

function tokenOverlap(left, right) {
  const a = new Set(String(left).toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const b = new Set(String(right).toLowerCase().match(/[a-z]{4,}/g) ?? []);
  if (!a.size || !b.size) return 0;
  return [...a].filter((token) => b.has(token)).length / Math.min(a.size, b.size);
}

function formatWeekday(date) {
  if (!date) return "Previous day";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function formatMagnitude(value, unit = "lb") {
  const magnitude = Math.abs(value).toFixed(1);
  if (value === 0) return "weight hold";
  return `${magnitude} ${unit} ${value > 0 ? "increase" : "decrease"}`;
}

function getConfidenceLabel(confidence = 0) {
  if (confidence >= 90) return "Very High";
  if (confidence >= 80) return "High";
  if (confidence >= 55) return "Moderate";
  return "Building";
}

function isAnalyticalInterpretation(value) {
  const text = String(value ?? "");
  return !/\b(recommend|should|keep the plan|stay the course|current focus|next priority|protocol change|adjust(?:ment)?|forecast|projected|transition)\b/i.test(text);
}
