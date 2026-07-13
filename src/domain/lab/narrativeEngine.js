export const labEvidenceTypes = [
  {
    id: "photos",
    icon: "camera",
    label: "Progress Photos",
    shortLabel: "Photos",
  },
  {
    id: "weight",
    icon: "scale",
    label: "Morning Weight",
    shortLabel: "Weight",
  },
  {
    id: "dexa",
    icon: "scan",
    label: "DEXA",
    shortLabel: "DEXA",
  },
  {
    id: "nutrition",
    icon: "utensils",
    label: "Nutrition",
    shortLabel: "Nutrition",
  },
  {
    id: "training",
    icon: "dumbbell",
    label: "Training",
    shortLabel: "Training",
  },
  {
    id: "recovery",
    icon: "moon",
    label: "Recovery",
    shortLabel: "Recovery",
  },
  {
    id: "labs",
    icon: "testTube",
    label: "Labs",
    shortLabel: "Labs",
  },
  {
    id: "protocol",
    icon: "pill",
    label: "Protocol",
    shortLabel: "Protocol",
  },
  {
    id: "voice",
    icon: "mic",
    label: "Voice Note",
    shortLabel: "Voice",
  },
];

const routineBackground = [
  {
    label: "Multivitamin",
    reason: "Routine supplement context does not materially change today's understanding.",
    type: "protocol",
  },
  {
    label: "Tongkat Ali",
    reason: "Stable background supplement context should not crowd the briefing.",
    type: "protocol",
  },
  {
    label: "Stable protocol schedule",
    reason: "Unchanged protocol context stays in the background unless it explains the new evidence.",
    type: "protocol",
  },
];

export function createNarrativeLabRun({
  baseBriefing,
  evidenceType = "photos",
  interpreterOutput: providedInterpreterOutput = null,
  loggedEvidence: providedLoggedEvidence = null,
} = {}) {
  const evidenceConfig = getNarrativeEvidenceConfig(evidenceType);
  const loggedEvidence =
    providedLoggedEvidence ?? createLoggedEvidence(evidenceConfig, baseBriefing);
  const interpreterOutput =
    providedInterpreterOutput ?? createInterpreterOutput(loggedEvidence, baseBriefing);
  const decision = createNarrativeDecision({
    baseBriefing,
    evidenceConfig,
    interpreterOutput,
    loggedEvidence,
  });

  return {
    decision,
    generatedAt: new Date().toISOString(),
    generatedBriefing: createGeneratedBriefing({
      baseBriefing,
      decision,
      evidenceConfig,
      interpreterOutput,
      loggedEvidence,
    }),
    interpreterOutput,
    loggedEvidence,
    pipeline: [
      "Evidence",
      "Interpreter",
      "Rich Evidence Object",
      "Evidence Engine",
      "Goal Engine",
      "Narrative Engine",
      "Daily Briefing",
    ],
  };
}

function getNarrativeEvidenceConfig(evidenceType) {
  if (evidenceType === "auto") {
    return {
      id: "auto",
      icon: "scan",
      label: "Evidence",
      shortLabel: "Evidence",
    };
  }

  return labEvidenceTypes.find((item) => item.id === evidenceType) ?? labEvidenceTypes[0];
}

export function getFounderStateSummary(baseBriefing) {
  return {
    confidence: baseBriefing?.hero?.confidence ?? 0,
    currentSnapshot: baseBriefing?.currentSnapshot ?? [],
    currentStory: baseBriefing?.hero?.title ?? "Current Founder Alpha state loaded",
    goal: baseBriefing?.hero?.primaryGoal ?? "Visible Abs at Rest",
    knownEvidence: [
      "Weight history",
      "DEXA history",
      "Progress photos",
      "Nutrition context",
      "Protocols",
      "Operating plan",
    ],
  };
}

function createLoggedEvidence(evidenceConfig, baseBriefing) {
  const now = new Date().toISOString();
  const snapshot = baseBriefing?.currentSnapshot ?? [];
  const weight = snapshot.find((item) => /weight/i.test(item.label))?.value;
  const bodyFat = snapshot.find((item) => /body fat|bf/i.test(item.label))?.value;

  const content = {
    dexa:
      "New DEXA result is available and should validate or challenge the model's current prediction.",
    labs:
      "New lab result is available and may affect health confidence, but only if it changes interpretation.",
    nutrition:
      "Nutrition log shows intake stayed inside the current Founder target range.",
    photos:
      "New progress photos are available for visual comparison against Founder history.",
    protocol:
      "A protocol note was logged. It should matter only if it changes the operating plan.",
    recovery:
      "Recovery note indicates sleep quality changed and may affect today's execution.",
    training:
      "Training note indicates performance changed and may affect lean-mass preservation.",
    voice:
      "Voice note captured subjective context that may explain today's evidence.",
    weight:
      "Morning weight was logged and should update the current trend.",
  }[evidenceConfig.id];

  return {
    capturedAt: now,
    currentBodyFat: bodyFat ?? "From current Founder state",
    currentWeight: weight ?? "From current Founder state",
    id: `lab_evidence_${evidenceConfig.id}_${Date.now()}`,
    label: `Today's ${evidenceConfig.label}`,
    summary: content,
    type: evidenceConfig.id,
  };
}

function createInterpreterOutput(loggedEvidence, baseBriefing) {
  if (loggedEvidence.type === "photos") {
    return {
      briefingSummary: {
        biggestChanges: [
          "Waist and midsection are the visual focus.",
          "Upper-body shape remains the preservation signal.",
          "Lower-ab definition is the next milestone to watch.",
        ],
        goalImpact:
          "Photos are high-value evidence for visible abs because the goal is visual, not just numerical.",
        nextStep:
          "Use the photo read as today's lead, then check it against weight trend and DEXA calibration.",
        summary:
          "Today's photos should lead the briefing if they show meaningful visual movement toward visible abs.",
      },
      detailedInterpretation:
        "Use PhotoInterpreter V1 output as the source of truth. The Narrative Engine should not reinterpret images; it should decide how much of the PhotoInterpreter briefing summary belongs in today's Daily Briefing.",
      source: "PhotoInterpreter V1",
    };
  }

  if (loggedEvidence.type === "weight") {
    return {
      briefingSummary: {
        biggestChanges: ["Morning weight updates the trend."],
        goalImpact:
          "Weight matters because it changes the fat-loss trajectory, but it should be checked against photos and DEXA before changing the plan.",
        nextStep: "Lead with the trend, then mention visual evidence only if it supports or challenges the read.",
        summary: "Today's weigh-in is the newest quantitative evidence.",
      },
      detailedInterpretation:
        "The weight interpreter should describe trend direction, day-to-day noise, relationship to recent visual evidence, and confidence impact.",
      source: "Weight trend interpreter",
    };
  }

  if (loggedEvidence.type === "dexa") {
    return {
      briefingSummary: {
        biggestChanges: ["DEXA updates the calibration layer."],
        goalImpact:
          "DEXA can validate or challenge prior predictions about body fat, lean mass, and visible-abs progress.",
        nextStep: "Lead with DEXA and use photos and weight as supporting context.",
        summary: "Today's scan is calibration evidence and deserves the feature presentation.",
      },
      detailedInterpretation:
        "The DEXA interpreter should compare actual values against prior model expectations and update confidence.",
      source: "DEXA interpreter",
    };
  }

  return {
    briefingSummary: {
      biggestChanges: [`${loggedEvidence.label} was logged.`],
      goalImpact:
        "This evidence should lead only if it materially changes today's understanding or execution plan.",
      nextStep: "Mention it only if it changes the decision for today.",
      summary: loggedEvidence.summary,
    },
    detailedInterpretation:
      "This interpreter output is available as context, but the Narrative Engine may omit it if it does not change today's story.",
    source: `${loggedEvidence.label} interpreter`,
  };
}

function createNarrativeDecision({
  baseBriefing,
  evidenceConfig,
  interpreterOutput,
  loggedEvidence,
}) {
  const leadStory = createLeadStory(evidenceConfig, interpreterOutput);
  const supportingEvidence = createSupportingEvidence({
    baseBriefing,
    evidenceConfig,
    loggedEvidence,
  });
  const omittedEvidence = createOmittedEvidence(evidenceConfig);

  return {
    allocation: createAllocation(evidenceConfig, supportingEvidence),
    backgroundEvidence: createBackgroundEvidence(baseBriefing, evidenceConfig),
    goalImpact: interpreterOutput.briefingSummary.goalImpact,
    leadStory,
    omittedEvidence,
    reason:
      "The engine chose the lead story from the new evidence, its goal relevance, freshness, and whether it materially changes today's understanding.",
    supportingEvidence,
    whatChanged: loggedEvidence.summary,
  };
}

function createLeadStory(evidenceConfig, interpreterOutput) {
  return {
    evidenceType: evidenceConfig.id,
    label: `Today's ${evidenceConfig.label}`,
    reason:
      {
        dexa:
          "New calibration evidence can validate or challenge the model more than any routine context.",
        photos:
          "New visual evidence is directly tied to the visible-abs goal and should use the PhotoInterpreter summary as its foundation.",
        weight:
          "New weight evidence updates the trend and can change confidence in the current trajectory.",
      }[evidenceConfig.id] ??
      "This evidence becomes the lead only if it changes today's execution or understanding.",
    summary: interpreterOutput.briefingSummary.summary,
    title: createLeadStoryTitle(evidenceConfig),
  };
}

function createSupportingEvidence({ baseBriefing, evidenceConfig, loggedEvidence }) {
  const base = [...(loggedEvidence?.supportingEvidence ?? [])];

  if (
    evidenceConfig.id !== "weight" &&
    !base.some((item) => item.type === "weight")
  ) {
    base.push({
      label: "Weight trend",
      reason: "Used to check whether today's story matches the current direction.",
      type: "weight",
    });
  }
  if (
    evidenceConfig.id !== "dexa" &&
    !base.some((item) => item.type === "dexa")
  ) {
    base.push({
      label: "Latest DEXA",
      reason: "Used as calibration context, not as today's headline.",
      type: "dexa",
    });
  }
  if (
    evidenceConfig.id !== "photos" &&
    !base.some((item) => item.type === "photos")
  ) {
    base.push({
      label: "Recent progress photos",
      reason: "Used only to support or challenge today's lead evidence.",
      type: "photos",
    });
  }

  const coachInsight = baseBriefing?.coachInsight;
  if (coachInsight) {
    base.push({
      label: "Current coach insight",
      reason: "Provides continuity with the current Founder Alpha briefing.",
      type: "briefing",
    });
  }

  return base.slice(0, 3);
}

function createBackgroundEvidence(baseBriefing, evidenceConfig) {
  const priorities = baseBriefing?.todayPlan ?? [];
  const background = priorities.slice(0, 2).map((item) => ({
    label: item.title ?? item.label,
    reason: "Available operating-plan context, but not automatically part of the lead story.",
    type: "priority",
  }));

  return background;
}

function createOmittedEvidence(evidenceConfig) {
  if (evidenceConfig.id === "protocol") {
    return routineBackground.filter((item) => item.label !== "Stable protocol schedule");
  }

  return routineBackground;
}

function createAllocation(evidenceConfig, supportingEvidence) {
  const leadValue =
    evidenceConfig.id === "dexa" ? 75 : evidenceConfig.id === "photos" ? 70 : 60;
  const supportValue = supportingEvidence.length
    ? Math.round((95 - leadValue) / supportingEvidence.length)
    : 0;
  const support = supportingEvidence.map((item) => ({
    label: item.label,
    value: supportValue,
  }));
  const otherValue = Math.max(
    0,
    100 - leadValue - support.reduce((sum, item) => sum + item.value, 0)
  );

  return [
    { label: evidenceConfig.label, value: leadValue },
    ...support,
    { label: "Everything else", value: otherValue },
  ];
}

function createGeneratedBriefing({
  baseBriefing,
  decision,
  evidenceConfig,
  interpreterOutput,
  loggedEvidence,
}) {
  const generatedAt = new Date().toISOString();
  const weightOverlay = createWeightOverlay({ baseBriefing, loggedEvidence });
  const journeyContext = createJourneyContext(baseBriefing, weightOverlay);

  return {
    ...baseBriefing,
    generatedAt,
    currentSnapshot: createCurrentSnapshot({
      baseBriefing,
      loggedEvidence,
      weightOverlay,
    }),
    weightProgress: createWeightProgress({
      baseBriefing,
      weightOverlay,
    }),
    progress: createProgressSection({
      baseBriefing,
      weightOverlay,
    }),
    event: {
      type: "lab_simulation",
      label: loggedEvidence.label,
      evidenceType: loggedEvidence.type,
    },
    hero: {
      ...(baseBriefing?.hero ?? {}),
      confidence: getAdjustedConfidence(baseBriefing, evidenceConfig),
      confidenceLabel: getConfidenceLabel(baseBriefing),
      primaryGoal: baseBriefing?.hero?.primaryGoal ?? "Visible Abs at Rest",
      summary: createHeroSummary({ evidenceConfig, interpreterOutput }),
      title: createHeroTitle(evidenceConfig),
    },
    confidenceReasons: createConfidenceReasons({
      baseBriefing,
      evidenceConfig,
    }),
    interpretation: createInterpretationLines({
      evidenceConfig,
      interpreterOutput,
      journeyContext,
    }),
    currentAssessment: createCurrentAssessment({
      baseBriefing,
      evidenceConfig,
      interpreterOutput,
    }),
    projection: createProjection(baseBriefing, evidenceConfig),
    watchItems: createWatchItems(evidenceConfig),
    coachInsight: createCoachInsight({
      evidenceConfig,
      interpreterOutput,
      journeyContext,
    }),
    lookingAhead: createLookingAhead(evidenceConfig),
  };
}

function createCurrentSnapshot({ baseBriefing, loggedEvidence, weightOverlay }) {
  const snapshot = [...(baseBriefing?.currentSnapshot ?? [])];

  if (!loggedEvidence?.currentWeight || !weightOverlay) return snapshot;
  const weightChange = weightOverlay.dayChange;

  const weightIndex = snapshot.findIndex((item) => /weight/i.test(item.label));
  const nextWeight = {
    label: weightIndex >= 0 ? snapshot[weightIndex].label : "Weight",
    value: loggedEvidence.currentWeight,
  };

  if (weightIndex >= 0) {
    snapshot[weightIndex] = {
      ...snapshot[weightIndex],
      value: loggedEvidence.currentWeight,
    };
  } else {
    snapshot.unshift(nextWeight);
  }

  if (weightChange) {
    const changeIndex = snapshot.findIndex((item) =>
      /yesterday|change|delta/i.test(item.label)
    );
    if (changeIndex >= 0) {
      snapshot[changeIndex] = {
        ...snapshot[changeIndex],
        value:
          weightOverlay.previousWeight != null
            ? `${weightChange.formatted} from ${weightOverlay.previousWeight.toFixed(
                1
              )} ${weightOverlay.unit}`
            : weightChange.formatted,
      };
    }
  }

  const totalLossIndex = snapshot.findIndex((item) => /total loss/i.test(item.label));
  if (totalLossIndex >= 0 && weightOverlay.totalLost != null) {
    snapshot[totalLossIndex] = {
      ...snapshot[totalLossIndex],
      value: `${weightOverlay.totalLost.toFixed(1)} ${weightOverlay.unit}`,
    };
  }

  const lowestIndex = snapshot.findIndex((item) => /lowest/i.test(item.label));
  if (lowestIndex >= 0) {
    snapshot[lowestIndex] = {
      ...snapshot[lowestIndex],
      value: weightOverlay.isLowest
        ? "Yes"
        : `${weightOverlay.lowestWeight.toFixed(1)} ${weightOverlay.unit} remains low`,
    };
  }

  return snapshot;
}

function createWeightProgress({ baseBriefing, weightOverlay }) {
  if (!weightOverlay) return baseBriefing?.weightProgress;

  return {
    ...(baseBriefing?.weightProgress ?? {}),
    points: weightOverlay.points,
    summary:
      weightOverlay.weekOverWeek != null && weightOverlay.weekOverWeek < 0
        ? `Rolling trend remains down ${Math.abs(weightOverlay.weekOverWeek).toFixed(
            1
          )} ${weightOverlay.unit} over the current week.`
        : "Today's weigh-in has been added to the trend.",
    weeklyMomentum: updateWeeklyMomentum({
      weeklyMomentum: baseBriefing?.weightProgress?.weeklyMomentum ?? [],
      weightOverlay,
    }),
  };
}

function createProgressSection({ baseBriefing, weightOverlay }) {
  if (!weightOverlay || !baseBriefing?.progress) return baseBriefing?.progress;

  return {
    ...baseBriefing.progress,
    chart: weightOverlay.chart,
    latestWeightDate: weightOverlay.date,
    metrics: (baseBriefing.progress.metrics ?? []).map((metric) => {
      if (/current weight/i.test(metric.label)) {
        return {
          ...metric,
          value: `${weightOverlay.currentWeight.toFixed(1)} ${weightOverlay.unit}`,
        };
      }
      if (/total lost/i.test(metric.label) && weightOverlay.totalLost != null) {
        return {
          ...metric,
          value: `${weightOverlay.totalLost.toFixed(1)} ${weightOverlay.unit}`,
        };
      }
      if (/weekly average/i.test(metric.label) && weightOverlay.weeklyAverage != null) {
        return {
          ...metric,
          value: `${weightOverlay.weeklyAverage.toFixed(1)} ${weightOverlay.unit}`,
        };
      }
      if (/week over week/i.test(metric.label) && weightOverlay.weekOverWeek != null) {
        return {
          ...metric,
          value: `${formatSignedNumber(weightOverlay.weekOverWeek)} ${weightOverlay.unit}`,
        };
      }

      return metric;
    }),
  };
}

function createWeightOverlay({ baseBriefing, loggedEvidence }) {
  const currentWeight = parseWeightValue(loggedEvidence?.currentWeight);
  if (currentWeight == null) return null;

  const date = loggedEvidence?.capturedAt?.slice(0, 10) ?? getTodayKey();
  const unit = parseWeightUnit(loggedEvidence?.currentWeight) ?? "lb";
  const basePoints = getBaseWeightPoints(baseBriefing);
  if (basePoints.length === 0) return null;

  const points = mergeWeightPoint({
    date,
    points: basePoints,
    unit,
    value: currentWeight,
  });
  const values = points.map((point) => point.value);
  const startWeight = points[0]?.value ?? null;
  const previousPoint = points.length >= 2 ? points.at(-2) : null;
  const dayChange =
    previousPoint?.value != null
      ? {
          formatted: `${formatSignedNumber(
            Number((currentWeight - previousPoint.value).toFixed(1))
          )} ${unit}`,
          value: Number((currentWeight - previousPoint.value).toFixed(1)),
        }
      : getWeightChange(loggedEvidence?.summary);
  const weeklyAverage = averagePointValue(points.slice(-7));
  const previousWeeklyAverage = averagePointValue(points.slice(-14, -7));
  const weekOverWeek =
    weeklyAverage != null && previousWeeklyAverage != null
      ? Number((weeklyAverage - previousWeeklyAverage).toFixed(1))
      : null;

  return {
    chart: normalizeWeightPoints(points),
    currentWeight,
    date,
    dayChange,
    isLowest: currentWeight <= Math.min(...values),
    lowestWeight: Math.min(...values),
    previousWeight: previousPoint?.value ?? null,
    points: normalizeWeightPoints(points).map((point) => ({
      ...point,
      id: point.date,
      unit,
    })),
    totalLost:
      startWeight == null ? null : Number((startWeight - currentWeight).toFixed(1)),
    unit,
    weekOverWeek,
    weeklyAverage,
  };
}

function getBaseWeightPoints(baseBriefing) {
  const points =
    baseBriefing?.weightProgress?.points?.length > 0
      ? baseBriefing.weightProgress.points
      : baseBriefing?.progress?.chart ?? [];

  return points
    .map((point) => ({
      date: point.date,
      isDexa: Boolean(point.isDexa),
      unit: point.unit ?? "lb",
      value: Number(point.value),
    }))
    .filter((point) => point.date && Number.isFinite(point.value))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function mergeWeightPoint({ date, points, unit, value }) {
  const merged = points
    .filter((point) => point.date !== date)
    .map((point) => ({ ...point, isLatest: false }));

  merged.push({
    date,
    isDexa: false,
    unit,
    value,
  });

  return merged.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function normalizeWeightPoints(points) {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const lastIndex = points.length - 1;

  return points.map((point, index) => ({
    ...point,
    isLatest: index === lastIndex,
    isStart: index === 0,
    label: formatShortDate(point.date),
    normalized: Number(((max - point.value) / range).toFixed(4)),
  }));
}

function updateWeeklyMomentum({ weeklyMomentum, weightOverlay }) {
  if (!Array.isArray(weeklyMomentum) || weeklyMomentum.length === 0) {
    return weeklyMomentum;
  }

  const next = [...weeklyMomentum];
  const rollingIndex = next.findIndex((row) => /rolling/i.test(row.label));
  const row = {
    ...(rollingIndex >= 0 ? next[rollingIndex] : next.at(-1)),
    average: weightOverlay.weeklyAverage,
    change: weightOverlay.weekOverWeek,
    period: getRollingPeriod(weightOverlay.points),
    unit: weightOverlay.unit,
  };

  if (rollingIndex >= 0) {
    next[rollingIndex] = row;
  } else {
    next[next.length - 1] = row;
  }

  return next;
}

function getRollingPeriod(points) {
  const lastSeven = points.slice(-7);
  const first = lastSeven[0]?.date;
  const last = lastSeven.at(-1)?.date;
  if (!first || !last) return "";

  return `${formatShortDate(first)}-${formatShortDate(last)}`;
}

function createHeroTitle(evidenceConfig) {
  return (
    {
      dexa: "Your body-composition model has been recalibrated.",
      photos: "Your photos show how the cut is moving.",
      weight: "Your weight trend updated today.",
    }[evidenceConfig.id] ?? `${evidenceConfig.shortLabel} has been logged.`
  );
}

function createLeadStoryTitle(evidenceConfig) {
  return (
    {
      dexa: "DEXA leads today",
      photos: "Photos lead today",
      weight: "Weight trend leads today",
    }[evidenceConfig.id] ?? `${evidenceConfig.shortLabel} leads today`
  );
}

function createHeroSummary({ evidenceConfig, interpreterOutput }) {
  const summary = getBriefingSummary(interpreterOutput);

  if (evidenceConfig.id === "photos") {
    const weightChange = getWeightChange(summary.supportingContext);
    const weightContext =
      weightChange?.value > 0
        ? `The scale was up ${formatWeightMagnitude(
            weightChange
          )} this morning, but today's photos remain the stronger signal.`
        : null;

    return compactArray([stripWeightContext(summary.summary), weightContext]).join(" ");
  }
  if (evidenceConfig.id === "weight") {
    return "Today's weigh-in helps clarify whether the current cut is still moving in the right direction.";
  }
  if (evidenceConfig.id === "dexa") {
    return "The new scan gives PhysiqueOS a stronger body-composition anchor for visible-abs progress.";
  }

  return `${evidenceConfig.shortLabel} was logged and added to today's context.`;
}

function createInterpretationLines({
  evidenceConfig,
  interpreterOutput,
  journeyContext,
}) {
  const summary = getBriefingSummary(interpreterOutput);

  if (evidenceConfig.id === "photos") {
    const supportingContextLine =
      summary.supportingContext && !summary.summary?.includes(summary.supportingContext)
        ? summary.supportingContext
        : null;

    return createPhotoInterpretationLines({
      journeyContext,
      observations: interpreterOutput.structuredObservations ?? [],
      summary,
      supportingContextLine,
    });
  }

  if (evidenceConfig.id === "weight") {
    return compactArray([
      summary.summary,
      formatBiggestChanges(summary.biggestChanges),
      summary.whyTheyMatter,
      summary.goalImpact,
    ]);
  }

  if (evidenceConfig.id === "dexa") {
    return compactArray([
      summary.summary,
      summary.whyTheyMatter,
      summary.goalImpact,
    ]);
  }

  return compactArray([summary.summary, summary.goalImpact]);
}

function createCurrentAssessment({ baseBriefing, evidenceConfig, interpreterOutput }) {
  const summary = getBriefingSummary(interpreterOutput);
  const baseAssessment = baseBriefing?.currentAssessment ?? [];
  const projection = baseBriefing?.projection?.find((item) =>
    /arrival|remaining|finish|forecast/i.test(item.label)
  )?.value;

  if (evidenceConfig.id === "photos") {
    return createPhysiologicalAssessment({
      fatLossDetail:
        "The photo read is positive, and the same-morning weigh-in does not challenge it. A small scale bump is normal noise when the visual trend is still moving.",
      fatLossValue: "Strengthening",
      forecastDetail:
        projection && projection !== "Pending"
          ? `The forecast remains intact at ${projection}; today's evidence supports the existing window rather than changing it.`
          : "The forecast remains intact, but the next DEXA or matching photo set would improve precision.",
      forecastValue: projection && projection !== "Pending" ? projection : "On track",
      muscleDetail:
        "Chest, shoulders, and arms continue to look well maintained while the torso gets leaner.",
      muscleValue: "Maintained",
      protocolDetail:
        summary.nextStep ??
        "No visual or weight evidence suggests the protocol or nutrition strategy needs to change today.",
      protocolValue: "Continue",
      visualDetail:
        "Today's photos give us a clearer visual read: waist, taper, rib-to-waist transition, and upper/mid-ab definition are moving in the right direction.",
      visualValue: "Improving",
    });
  }

  if (evidenceConfig.id === "weight") {
    return createPhysiologicalAssessment({
      fatLossDetail: summary.goalImpact,
      fatLossValue: "Updated",
      forecastDetail:
        projection && projection !== "Pending"
          ? `The goal window remains ${projection} unless future evidence challenges the current rate.`
          : "The forecast needs visual or DEXA confirmation before it should move materially.",
      forecastValue: projection && projection !== "Pending" ? projection : "Watching",
      muscleDetail:
        findAssessmentDetail(baseAssessment, /muscle|lean/i) ??
        "Lean-mass confidence still depends on DEXA and visual preservation signals, not one weigh-in.",
      muscleValue: findAssessmentValue(baseAssessment, /muscle|lean/i) ?? "Watching",
      protocolDetail: summary.nextStep,
      protocolValue: "Keep context",
      visualDetail:
        "Weight is useful context, but photos remain the clearer read on visible-abs progress.",
      visualValue: "Awaiting photo read",
    });
  }

  if (evidenceConfig.id === "dexa") {
    return createPhysiologicalAssessment({
      fatLossDetail: summary.goalImpact,
      fatLossValue: "Recalibrated",
      forecastDetail:
        "DEXA can move the forecast after the scan is reconciled with photo and weight history.",
      forecastValue: "Rechecking",
      muscleDetail:
        "DEXA is the strongest lean-mass calibration point and should update preservation confidence.",
      muscleValue: "Recalibrated",
      protocolDetail: summary.nextStep,
      protocolValue: "Review",
      visualDetail:
        "Photos still show whether the visible-abs goal is showing up visually after DEXA updates the body-composition anchor.",
      visualValue: "Cross-check",
    });
  }

  return createPhysiologicalAssessment({
    fatLossDetail:
      findAssessmentDetail(baseAssessment, /fat|trajectory|weight/i) ??
      summary.goalImpact,
    fatLossValue: findAssessmentValue(baseAssessment, /fat|trajectory|weight/i) ?? "Watching",
    forecastDetail:
      findAssessmentDetail(baseAssessment, /forecast|finish|project/i) ??
      "Goal forecast remains dependent on the next high-value evidence update.",
    forecastValue:
      projection && projection !== "Pending"
        ? projection
        : findAssessmentValue(baseAssessment, /forecast|finish|project/i) ?? "Watching",
    muscleDetail:
      findAssessmentDetail(baseAssessment, /muscle|lean/i) ??
      "Lean-mass preservation remains part of the model even when today's evidence is not visual.",
    muscleValue: findAssessmentValue(baseAssessment, /muscle|lean/i) ?? "Watching",
    protocolDetail:
      findAssessmentDetail(baseAssessment, /protocol|plan/i) ??
      summary.nextStep,
    protocolValue: findAssessmentValue(baseAssessment, /protocol|plan/i) ?? "Continue",
    visualDetail:
      findAssessmentDetail(baseAssessment, /visual|photo/i) ??
      "Visual confirmation remains active but unchanged by this evidence.",
    visualValue: findAssessmentValue(baseAssessment, /visual|photo/i) ?? "Unchanged",
  });
}

function createPhysiologicalAssessment({
  fatLossDetail,
  fatLossValue,
  forecastDetail,
  forecastValue,
  muscleDetail,
  muscleValue,
  protocolDetail,
  protocolValue,
  visualDetail,
  visualValue,
}) {
  return [
    {
      detail: fatLossDetail,
      label: "Fat Loss Trajectory",
      tone: "success",
      value: fatLossValue,
    },
    {
      detail: muscleDetail,
      label: "Muscle Preservation",
      tone: "primary",
      value: muscleValue,
    },
    {
      detail: protocolDetail,
      label: "Protocol Read",
      tone: "evidence",
      value: protocolValue,
    },
    {
      detail: visualDetail,
      label: "Visual Confirmation",
      tone: "success",
      value: visualValue,
    },
    {
      detail: forecastDetail,
      label: "Goal Forecast",
      tone: "primary",
      value: forecastValue,
    },
  ];
}

function createProjection(baseBriefing, evidenceConfig) {
  if (evidenceConfig.id === "dexa") {
    return [
      {
        detail: "Calibration evidence can move projection confidence after comparison with prior expectations.",
        label: "Projection confidence",
        value: "Recalibrating",
      },
    ];
  }

  return baseBriefing?.projection ?? [];
}

function createWatchItems(evidenceConfig) {
  if (evidenceConfig.id === "photos") {
    return [
      {
        detail: "Confirm whether lower-ab definition continues while upper-body shape remains preserved.",
        title: "Next visual milestone",
      },
      {
        detail: "Use the next weigh-in and DEXA anchor to confirm the photo read.",
        title: "Evidence confirmation",
      },
    ];
  }

  return [
    {
      detail: "Check whether the next evidence source supports or challenges today's read.",
      title: "Cross-check the story",
    },
  ];
}

function createLookingAhead(evidenceConfig) {
  return [
    {
      detail:
        evidenceConfig.id === "photos"
          ? "The next comparison should show whether the tighter waist and lower-ab trend continue."
          : "The next briefing should revisit this only if new evidence changes today's read.",
      title: "What PhysiqueOS will watch next",
    },
  ];
}

function createCoachInsight({ evidenceConfig, interpreterOutput, journeyContext }) {
  const summary = getBriefingSummary(interpreterOutput);

  if (evidenceConfig.id === "photos") {
    const weightChange = getWeightChangeFromInterpreter(interpreterOutput);
    if (weightChange?.value > 0) {
      return compactArray([
        `The easiest mistake today would be giving too much meaning to the ${formatWeightMagnitude(
          weightChange
        )} scale increase.`,
        "Small bumps like that are normal, especially this late in a cut.",
        "What matters more is that today's photos still show the visual direction we want: tighter waist, cleaner taper, and maintained upper-body shape.",
        "When the long-term trend and the photos agree, I would not change the plan because of one slightly higher weigh-in.",
      ]).join(" ");
    }

    return compactArray([
      getJourneyChapterSentence(journeyContext),
      summary.nextStep ?? "Based on today's evidence, stay the course.",
      "The next milestone is continued lower-ab definition while keeping the upper-body shape you have preserved through the cut.",
    ]).join(" ");
  }

  if (evidenceConfig.id === "weight") {
    return "Today's weight is useful, but one weigh-in should not drive a plan change by itself. Keep executing, then let the next visual check and DEXA anchor confirm whether the trend is still behaving the way we expect.";
  }

  if (evidenceConfig.id === "dexa") {
    return "This scan gives us a cleaner anchor for the plan. The important question now is whether the scan supports the visible-abs trajectory while lean mass stays protected.";
  }

  return `${evidenceConfig.shortLabel} has been added to today's context. Keep the plan focused on the evidence that changes what you should do next.`;
}

function createConfidenceReasons({ baseBriefing, evidenceConfig }) {
  const base = baseBriefing?.confidenceReasons ?? [];
  const leadReason = {
    label:
      evidenceConfig.id === "photos"
        ? "Photos reviewed"
        : evidenceConfig.id === "dexa"
          ? "DEXA reviewed"
          : `${evidenceConfig.label} logged`,
    tone: evidenceConfig.id === "dexa" ? "evidence" : "success",
  };

  return [leadReason, ...base].slice(0, 4);
}

function getAdjustedConfidence(baseBriefing, evidenceConfig) {
  const current = baseBriefing?.hero?.confidence ?? 70;
  if (evidenceConfig.id === "dexa") return Math.min(96, current + 5);
  if (evidenceConfig.id === "photos") return Math.min(94, current + 3);
  if (evidenceConfig.id === "weight") return Math.min(92, current + 2);

  return current;
}

function getConfidenceLabel(baseBriefing) {
  return baseBriefing?.hero?.confidenceLabel ?? "Confidence";
}

function getBriefingSummary(interpreterOutput) {
  return interpreterOutput?.briefingSummary ?? {};
}

function createPhotoInterpretationLines({
  journeyContext,
  observations,
  summary,
  supportingContextLine,
}) {
  const selected = selectHighValueObservations(observations);
  const summaryChanges = summary.biggestChanges ?? [];
  const waist = findBestObservation({
    observations: selected,
    patterns: [/waist|lower abdomen|midsection|torso/i],
    summaryChanges,
  });
  const ribToWaist = findBestObservation({
    observations: selected,
    patterns: [/rib-to-waist|rib.*waist|oblique|transition/i],
    summaryChanges,
  });
  const proportion = findBestObservation({
    observations: selected,
    patterns: [/shoulder-to-waist|ratio|taper|proportion|v-taper/i],
    summaryChanges,
  });
  const conditioning = findBestObservation({
    observations: selected,
    patterns: [/conditioning|leaner|sharper|definition|separation|upper.*ab|mid.*ab|abdominal/i],
    summaryChanges,
  });
  const distinctConditioning =
    hasSameObservation(conditioning, [waist, ribToWaist, proportion])
      ? findObservation(
          selected,
          /conditioning|leaner|sharper|definition|separation|upper.*ab|mid.*ab|abdominal/i,
          [waist, ribToWaist, proportion]
        )
      : conditioning;
  const lowerAbs = findObservation(
    selected,
    /lower abs|lower-ab|not fully|milestone|emerge/i
  );
  const upperBody = findBestObservation({
    observations: selected,
    patterns: [/upper body|chest|shoulder|arm/i],
    summaryChanges,
  });
  const uncertainty = findObservation(
    selected,
    /lower abs|not yet|uncertain|pose|lighting|harder|limited|emerging/i
  );
  const weightSupport = findObservation(observations, /weight|scale|weigh/i);
  const weightChange = getWeightChange(weightSupport?.change);

  return compactArray([
    createOpeningPhotoInterpretation({ journeyContext, summary }),
    createScaleReconciliationLine(weightChange),
    createPhotoWaistAndProportionLine({
      proportion,
      ribToWaist,
      waist,
    }),
    createPhotoConditioningLine({
      conditioning: distinctConditioning,
      lowerAbs,
    }),
    createObservationSentence({
      fallback:
        "Chest, shoulders, and arms continue looking well maintained, which matters because the goal is to reveal the physique without giving back upper-body shape.",
      lead: "The preservation signal",
      observations: [upperBody],
    }),
    createEmergingEndpointLine({ conditioning: distinctConditioning, uncertainty }),
    createSupportContextLine({
      supportingContextLine,
      weightSupport,
    }) ??
      "The recent weight trend and latest DEXA provide useful context for this visual read.",
    journeyContext?.totalLoss
      ? `That matters more in this refinement phase: after ${journeyContext.totalLoss} of loss and several check-ins, photos are now helping answer whether the final look is arriving while muscle stays preserved.`
      : null,
  ]);
}

function createOpeningPhotoInterpretation({ journeyContext, summary }) {
  const stage = journeyContext?.projection
    ? "At this point in the cut, the useful question is refinement: are the final visual details arriving while the plan stays stable?"
    : "At this phase of the cut, the useful question is whether visual evidence is confirming the direction of the plan.";

  return compactArray([stripWeightContext(summary.summary), stage]).join(" ");
}

function createPhotoWaistAndProportionLine({ proportion, ribToWaist, waist }) {
  const waistText =
    waist?.change ??
    "The waist looks modestly tighter, which is the clearest visual sign that the cut is still moving.";
  const ribToWaistText =
    ribToWaist?.change ??
    "The rib-to-waist transition looks cleaner, giving the torso a sharper read.";
  const proportionText =
    hasSpecificText(proportion?.change, /shoulder-to-waist|ratio|taper|v-taper|proportion/i)
      ? proportion.change
      :
    "The stronger taper makes the shoulder-to-waist ratio look a little more athletic.";
  const changes = uniqueSentences([waistText, ribToWaistText, proportionText]);

  return `The clearest visual read: ${changes
    .map((change) => ensureSentenceEnding(sentenceCase(change)))
    .join(" ")}`;
}

function createPhotoConditioningLine({ conditioning, lowerAbs }) {
  const conditioningText =
    conditioning?.change ??
    "Overall torso conditioning looks a little sharper, especially through the upper and midsection.";
  const lowerAbsText =
    lowerAbs?.change ??
    "Lower-ab definition is still the remaining visual milestone, so this is encouraging evidence rather than a finished endpoint.";
  const changes = uniqueSentences([conditioningText, lowerAbsText]);

  return `The conditioning read: ${changes
    .map((change) => ensureSentenceEnding(sentenceCase(change)))
    .join(" ")}`;
}

function createEmergingEndpointLine({ conditioning, uncertainty }) {
  if (
    uncertainty?.change &&
    conditioning?.change &&
    normalizeForComparison(uncertainty.change) !==
      normalizeForComparison(conditioning.change)
  ) {
    return `${sentenceCase(
      uncertainty.change
    )} That keeps the read in the category of emerging confirmation rather than a finished endpoint.`;
  }

  return "Taken together, this is useful direction, not a dramatic one-day conclusion. I would treat it as emerging confirmation that the cut is still working.";
}

function createScaleReconciliationLine(weightChange) {
  if (!weightChange || weightChange.value <= 0) return null;

  return `Although the scale was up ${formatWeightMagnitude(
    weightChange
  )} this morning, that is normal day-to-day noise at this stage of the cut. The photos are the stronger signal today, and they continue showing the visual changes we were expecting.`;
}

function hasSpecificText(value, pattern) {
  return pattern.test(String(value ?? ""));
}

function getWeightChangeFromInterpreter(interpreterOutput) {
  const observation = interpreterOutput?.structuredObservations?.find((item) =>
    /weight|scale|weigh/i.test(`${item.region} ${item.change}`)
  );

  return getWeightChange(observation?.change);
}

function getWeightChange(value) {
  const text = String(value ?? "");
  const match =
    text.match(/([+-]\d+(?:\.\d+)?)\s*(lb|lbs|pounds)?/i) ??
    text.match(/\b(up|down)\s+(\d+(?:\.\d+)?)\s*(lb|lbs|pounds)?/i);
  if (!match) return null;
  const parsed =
    match[1]?.toLowerCase?.() === "up"
      ? Number(match[2])
      : match[1]?.toLowerCase?.() === "down"
        ? -Number(match[2])
        : Number(match[1]);
  if (!Number.isFinite(parsed)) return null;

  return {
    formatted: `${parsed > 0 ? "+" : ""}${parsed.toFixed(1)} lb`,
    value: parsed,
  };
}

function formatWeightMagnitude(weightChange) {
  return `${Math.abs(weightChange.value).toFixed(1)} lb`;
}

function selectHighValueObservations(observations = []) {
  const score = {
    high: 3,
    medium: 2,
    supporting: 2,
    limitation: 1,
  };

  return [...observations]
    .filter((observation) => observation?.change)
    .sort((a, b) => {
      const positiveDelta =
        getGoalSignalScore(b.change) - getGoalSignalScore(a.change);
      if (positiveDelta !== 0) return positiveDelta;

      const importanceDelta =
        (score[b.importance] ?? 1) - (score[a.importance] ?? 1);
      if (importanceDelta !== 0) return importanceDelta;

      const confidenceDelta =
        (score[b.confidence] ?? 1) - (score[a.confidence] ?? 1);
      return confidenceDelta;
    })
    .slice(0, 8);
}

function findBestObservation({ observations, patterns, summaryChanges }) {
  const summaryMatch = summaryChanges.find((change) =>
    patterns.some((pattern) => pattern.test(change))
  );

  if (summaryMatch) {
    return {
      change: summaryMatch,
      confidence: "moderate",
      importance: "high",
      region: "PhotoInterpreter briefing summary",
    };
  }

  return observations.find((observation) =>
    patterns.some((pattern) =>
      pattern.test(`${observation.region} ${observation.change}`)
    )
  );
}

function findObservation(observations, pattern, excluded = []) {
  const excludedKeys = new Set(
    excluded.filter(Boolean).map((observation) => normalizeForComparison(observation.change))
  );

  return observations.find((observation) =>
    pattern.test(`${observation.region} ${observation.change}`) &&
    !excludedKeys.has(normalizeForComparison(observation.change))
  );
}

function hasSameObservation(observation, others) {
  const key = normalizeForComparison(observation?.change);
  if (!key) return false;

  return others
    .filter(Boolean)
    .some((other) => normalizeForComparison(other.change) === key);
}

function createObservationSentence({ fallback, lead, observations }) {
  const changes = observations
    .filter(Boolean)
    .map((observation) => sentenceCase(observation.change));

  if (changes.length === 0) return fallback;
  if (changes.length === 1) return `${lead}: ${changes[0]}`;

  return `${lead}: ${changes.map(ensureSentenceEnding).join(" ")}`;
}

function createSupportContextLine({ supportingContextLine, weightSupport }) {
  if (supportingContextLine) {
    const contextChange = getWeightChange(supportingContextLine);
    return contextChange?.value > 0 ? null : supportingContextLine;
  }
  if (weightSupport?.change) {
    const weightChange = getWeightChange(weightSupport.change);
    if (weightChange?.value > 0) {
      return null;
    }

    return `The same-morning weigh-in supports the photo read: ${sentenceCase(
      weightSupport.change
    )}`;
  }

  return null;
}

function findAssessmentDetail(assessment, pattern) {
  return assessment.find((item) => pattern.test(`${item.label} ${item.value}`))
    ?.detail;
}

function findAssessmentValue(assessment, pattern) {
  return assessment.find((item) => pattern.test(`${item.label} ${item.detail}`))
    ?.value;
}

function getGoalSignalScore(value) {
  const text = String(value ?? "");
  let score = 0;
  if (/waist|lower abdomen|abs|abdominal|shoulder-to-waist|taper|conditioning|leaner|definition|separation/i.test(text)) {
    score += 3;
  }
  if (/maintained|preserved|no visible size loss|fullness/i.test(text)) {
    score += 2;
  }
  if (/unchanged|stable|consistent|no meaningful/i.test(text)) {
    score -= 1;
  }
  if (/uncertain|pose|lighting|harder|limited/i.test(text)) {
    score -= 1;
  }

  return score;
}

function createJourneyContext(baseBriefing, weightOverlay) {
  const snapshot = baseBriefing?.currentSnapshot ?? [];
  const totalLoss = snapshot.find((item) => /total loss/i.test(item.label))?.value;
  const bodyFat = snapshot.find((item) => /body fat/i.test(item.label))?.value;
  const projection = baseBriefing?.projection?.find((item) =>
    /arrival|remaining/i.test(item.label)
  )?.value;

  return {
    bodyFat,
    projection,
    totalLoss:
      weightOverlay?.totalLost != null
        ? `${weightOverlay.totalLost.toFixed(1)} ${weightOverlay.unit}`
        : totalLoss,
  };
}

function getJourneyChapterSentence(journeyContext) {
  if (journeyContext?.projection && journeyContext.projection !== "Pending") {
    return `You are in the refinement phase of this cut, not the early guessing phase. With ${journeyContext.projection} still showing on the goal window, today's job is to protect what is working and let the final visual details keep arriving.`;
  }

  if (journeyContext?.totalLoss) {
    return `You are roughly six weeks into the dedicated cut, so the important question is no longer whether weight can move; it is whether the physique keeps tightening while muscle stays preserved.`;
  }

  return "This is a refinement-phase update: visual progress is showing up, and the scale is giving supporting context rather than creating a reason to second-guess the plan.";
}

function compactArray(items) {
  return items.filter((item) => typeof item === "string" && item.trim().length > 0);
}

function uniqueSentences(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = normalizeForComparison(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeForComparison(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function averagePointValue(points) {
  if (!points || points.length === 0) return null;
  const total = points.reduce((sum, point) => sum + point.value, 0);

  return Number((total / points.length).toFixed(1));
}

function parseWeightValue(value) {
  const match = String(value ?? "").match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseWeightUnit(value) {
  return String(value ?? "").match(/\b(lb|lbs|kg)\b/i)?.[1]?.replace("lbs", "lb");
}

function formatSignedNumber(value) {
  if (value > 0) return `+${value.toFixed(1)}`;

  return value.toFixed(1);
}

function formatShortDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return String(value);

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(new Date(year, month - 1, day));
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function sentenceCase(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";

  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function ensureSentenceEnding(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/[.!?]$/.test(text)) return text;

  return `${text}.`;
}

function formatBiggestChanges(changes) {
  if (!Array.isArray(changes) || changes.length === 0) return null;
  if (changes.length === 1) return changes[0];

  return `The biggest changes: ${changes.join(" ")}`;
}

function stripWeightContext(value) {
  return String(value ?? "")
    .replace(/\s*This morning's weigh-in adds (?:useful support|context, not concern):\s*(?:Morning weight changed [+-]\d+(?:\.\d+)? lb\.?|The scale was (?:up|down) \d+(?:\.\d+)? lb this morning\.?)/i, "")
    .trim();
}
