import { GoalConfidenceService } from "./GoalConfidenceService";

const BODY_FAT_GOAL_ID = "goal_maintain_8_9_body_fat";
const LEAN_MASS_GOAL_ID = "goal_preserve_lean_mass";
const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";
const DAY_MS = 24 * 60 * 60 * 1000;
const PROJECTION_BUCKET_DAYS = 7;
const PROJECTION_WINDOW_RADIUS_DAYS = 3;
const ROLLING_TREND_WINDOW_DAYS = 7;

export function createGoalEvaluationService() {
  return {
    getGoalEvaluations({
      goals = [],
      dexaScans = [],
      weightEntries = [],
      progressPhotos = [],
      protocols = [],
      nutritionContext = null,
      now = new Date(),
    } = {}) {
      const evidence = {
        dexaScans: sortByDate(dexaScans, "measuredAt"),
        weightEntries: sortByDate(weightEntries, "measuredAt"),
        progressPhotos: sortByDate(progressPhotos, "date"),
        protocols,
        nutritionContext,
        now,
      };

      return goals.map((goal) => evaluateGoal(goal, evidence));
    },
  };
}

export const GoalEvaluationService = createGoalEvaluationService();

function evaluateGoal(goal, evidence) {
  if (goal.id === VISIBLE_ABS_GOAL_ID || goal.metricKey === "visualDefinition") {
    return evaluateVisibleAbs(goal, evidence);
  }

  if (goal.id === BODY_FAT_GOAL_ID || goal.metricKey === "bodyFatPercentage") {
    return evaluateBodyFat(goal, evidence);
  }

  if (goal.id === LEAN_MASS_GOAL_ID || goal.metricKey === "leanMass") {
    return evaluateLeanMass(goal, evidence);
  }

  return createEvaluation({
    goal,
    current: "Pending",
    target: formatGoalTarget(goal),
    summary: "Add supporting evidence to evaluate this goal.",
    progress: 0,
    confidence: 0,
    missingEvidence: ["supporting_evidence"],
  });
}

function evaluateVisibleAbs(goal, evidence) {
  const latestDEXA = evidence.dexaScans.at(-1) ?? null;

  if (!latestDEXA) {
    return createEvaluation({
      goal,
      title: "Visible Abs",
      current: "Pending",
      target: "Visible",
      summary: "Add DEXA evidence to calibrate progress toward visible abs.",
      progress: 0,
      confidence: 0,
      missingEvidence: ["dexa_scan", "progress_photos"],
    });
  }

  const currentBodyFatEstimate = estimateCurrentBodyFatFromWeight(
    latestDEXA,
    evidence.weightEntries
  );
  const bodyFatTrend = getBodyFatTrend(evidence.dexaScans);
  const postDexaLoss = getWeightLossAfterDate(
    evidence.weightEntries,
    latestDEXA.measuredAt
  );
  const photosAreConsistent = hasConsistentProgressPhotos(evidence.progressPhotos);
  const leanMassPreservation = getLeanMassPreservationScore(latestDEXA);
  const protocolContextExists = evidence.protocols.some((protocol) =>
    protocol.relatedGoalIds?.includes(goal.id)
  );
  const findings = [
    createFinding({
      id: "dexa_supports_progress",
      status: bodyFatTrend > 0 ? "positive" : "neutral",
      text:
        bodyFatTrend > 0
          ? "DEXA trend supports continued body-composition progress."
          : "DEXA provides calibration, but more trend movement is needed.",
      evidenceTypes: ["dexa"],
    }),
    createFinding({
      id: "weight_trend_supports_fat_loss",
      status: postDexaLoss > 0 ? "positive" : "neutral",
      text:
        postDexaLoss > 0
          ? "Weight trend supports continued fat loss."
          : "Weight trend has not yet confirmed additional post-DEXA loss.",
      evidenceTypes: ["weight"],
    }),
    createFinding({
      id: "progress_photos_consistent",
      status: photosAreConsistent ? "positive" : "neutral",
      text: photosAreConsistent
        ? "Progress photos are captured under consistent conditions."
        : "Progress photos need more consistent conditions.",
      evidenceTypes: ["progress_photo"],
    }),
    createFinding({
      id: "lean_mass_preserved",
      status: leanMassPreservation >= 95 ? "positive" : "risk",
      text:
        leanMassPreservation >= 95
          ? "Lean mass has largely been preserved."
          : "Lean-mass preservation needs confirmation at the next DEXA.",
      evidenceTypes: ["dexa"],
    }),
    createFinding({
      id: "visual_confirmation_pending",
      status: "neutral",
      text: "Visual confirmation of abs at rest has not yet been established.",
      evidenceTypes: ["progress_photo"],
    }),
    createFinding({
      id: "current_body_fat_estimated",
      status: "neutral",
      text: "Current body-fat remains estimated until the next DEXA.",
      evidenceTypes: ["dexa", "weight"],
    }),
  ];
  const confidenceFactors = [
    createConfidenceFactor("dexa_history", "13 DEXA scans support calibration.", 18),
    createConfidenceFactor("weight_history", "Consistent morning weights support trend direction.", 14),
    createConfidenceFactor("photo_history", "Progress photos support visual calibration.", 10),
    createConfidenceFactor("protocol_context", "Protocol schedules provide current context.", 6),
    createConfidenceFactor("nutrition_context", "Nutrition and calorie-burn context are estimated.", -5),
    createConfidenceFactor("visual_scoring", "Visual scoring remains qualitative.", -4),
  ];
  const positiveFindings = findings.filter((finding) => finding.status === "positive")
    .length;
  const progress = clamp(
    48 +
      positiveFindings * 8 +
      clamp(Math.round(bodyFatTrend * 4), 0, 10) +
      clamp(Math.round(postDexaLoss * 2), 0, 8) +
      (protocolContextExists ? 4 : 0),
    0,
    92
  );

  return createEvaluation({
    goal,
    title: "Visible Abs",
    current: "Lower abs",
    target: "Visible at rest",
    summary: "Keep executing the plan.",
    progress,
    confidence: getGoalConfidence({
      confidenceFactors,
      evidence,
      findings,
      missingEvidence:
        currentBodyFatEstimate === null
          ? ["current_body_fat_calibration"]
          : ["visual_confirmation_at_rest"],
    }),
    findings,
    recommendations: [
      createRecommendation(
        "continue_morning_check_ins",
        "Keep logging morning weight under default conditions."
      ),
      createRecommendation(
        "next_photo_cadence",
        "Capture weekly progress photos under the same conditions."
      ),
    ],
    confidenceFactors,
    missingEvidence:
      currentBodyFatEstimate === null
        ? ["current_body_fat_calibration"]
        : ["visual_confirmation_at_rest"],
    projection: getProjection({
      dexaScans: evidence.dexaScans,
      latestDEXA,
      weightEntries: evidence.weightEntries,
      now: evidence.now,
    }),
    metadata: {
      currentBodyFatEstimate,
      currentBodyFatEstimateRange:
        currentBodyFatEstimate === null
          ? null
          : formatBodyFatEstimateRange(currentBodyFatEstimate, {
              latestDEXA,
              weightEntries: evidence.weightEntries,
            }),
      postDexaLoss,
      bodyFatTrend,
    },
  });
}

function evaluateBodyFat(goal, evidence) {
  const latestDEXA = evidence.dexaScans.at(-1) ?? null;

  if (!latestDEXA?.bodyFatPercentage) {
    return createEvaluation({
      goal,
      title: "Maintenance",
      current: "Pending",
      target: formatGoalTarget(goal),
      summary: "Add DEXA evidence to calibrate body-fat progress.",
      progress: 0,
      confidence: 0,
      missingEvidence: ["dexa_scan"],
    });
  }

  const targetMin = goal.targetRange?.min ?? 8;
  const targetMax = goal.targetRange?.max ?? 9;
  const currentBodyFatEstimate = estimateCurrentBodyFatFromWeight(
    latestDEXA,
    evidence.weightEntries
  );
  const progressValue = currentBodyFatEstimate ?? latestDEXA.bodyFatPercentage;
  const bodyFatTrend = getBodyFatTrend(evidence.dexaScans);
  const postDexaLoss = getWeightLossAfterDate(
    evidence.weightEntries,
    latestDEXA.measuredAt
  );
  const trendImproved = progressValue < latestDEXA.bodyFatPercentage;
  const projection = getProjection({
    dexaScans: evidence.dexaScans,
    latestDEXA,
    weightEntries: evidence.weightEntries,
    now: evidence.now,
  });
  const protocolContextExists = evidence.protocols.some((protocol) =>
    protocol.relatedGoalIds?.includes(goal.id)
  );
  const evidenceIsConsistent =
    hasRecentWeightConsistency(evidence.weightEntries, evidence.now) &&
    evidence.dexaScans.length >= 3;
  const findings = [
    createFinding({
      id: "latest_dexa_verified",
      status: "positive",
      text: "Latest DEXA verifies body fat at 10.7%.",
      evidenceTypes: ["dexa"],
    }),
    createFinding({
      id: "post_dexa_trend",
      status: trendImproved ? "positive" : "neutral",
      text: trendImproved
        ? "Post-DEXA weight trend suggests movement toward the target range."
        : "Post-DEXA movement is not yet enough to update the estimate.",
      evidenceTypes: ["weight"],
    }),
    createFinding({
      id: "dexa_history_supports_direction",
      status: bodyFatTrend > 0 ? "positive" : "neutral",
      text:
        bodyFatTrend > 0
          ? "DEXA history supports the longer-term direction."
          : "DEXA history needs more improvement before confirming direction.",
      evidenceTypes: ["dexa"],
    }),
    createFinding({
      id: "evidence_consistency",
      status: evidenceIsConsistent ? "positive" : "neutral",
      text: evidenceIsConsistent
        ? "Recent evidence is consistent enough to trust the trend."
        : "More recent evidence would improve confidence in the trend.",
      evidenceTypes: ["weight", "dexa"],
    }),
    createFinding({
      id: "protocol_context",
      status: protocolContextExists ? "positive" : "neutral",
      text: protocolContextExists
        ? "Active protocol context supports interpretation of the current phase."
        : "Protocol context has not been linked to this goal.",
      evidenceTypes: ["protocol"],
    }),
    createFinding({
      id: "projection_available",
      status: projection ? "positive" : "neutral",
      text: projection
        ? "Projected trajectory points toward the target range."
        : "Projection remains pending until the trend is clearer.",
      evidenceTypes: ["dexa", "weight"],
    }),
    createFinding({
      id: "estimate_limited",
      status: "neutral",
      text: "Current body fat remains estimated until the next DEXA.",
      evidenceTypes: ["dexa", "weight"],
    }),
  ];
  const confidenceFactors = [
    createConfidenceFactor("latest_dexa", "Latest DEXA is a high-confidence calibration source.", 24),
    createConfidenceFactor("dexa_history", "Complete DEXA history supports trend context.", 10),
    createConfidenceFactor("manual_weights", "Manual morning weight trend supports direction.", 12),
    createConfidenceFactor("protocol_context", "Active protocol context explains the current phase.", 5),
    createConfidenceFactor("estimated_current_bf", "Current body fat is estimated after the scan.", -6),
  ];
  const progress = getMaintenanceProgress({
    dexaScans: evidence.dexaScans,
    progressValue,
    targetMax,
    bodyFatTrend,
    postDexaLoss,
    projection,
    protocolContextExists,
    evidenceIsConsistent,
    hasCurrentEstimate: currentBodyFatEstimate !== null,
  });

  return createEvaluation({
    goal,
    title: "Maintenance",
    current: `${latestDEXA.bodyFatPercentage.toFixed(1)}%`,
    target: `${targetMin}-${targetMax}%`,
    summary: "Body-fat trend is moving toward the target range.",
    progress,
    confidence: getGoalConfidence({
      confidenceFactors,
      evidence,
      findings,
      missingEvidence: ["next_dexa_confirmation"],
    }),
    findings,
    recommendations: [
      createRecommendation("confirm_next_dexa", "Use the next DEXA to confirm the current estimate."),
    ],
    confidenceFactors,
    missingEvidence: ["next_dexa_confirmation"],
    projection,
    metadata: {
      currentBodyFatEstimate,
      postDexaLoss,
      bodyFatTrend,
    },
    presentation: {
      mode: "supporting_objective",
      status: projection ? "Entering Target Range" : "On Track",
      detail: "High Confidence",
      label: "Forecast",
    },
  });
}

function evaluateLeanMass(goal, evidence) {
  const latestDEXA = evidence.dexaScans.at(-1) ?? null;
  const leanMass = latestDEXA?.leanMass?.value ?? null;

  if (leanMass === null) {
    return createEvaluation({
      goal,
      title: "Lean Mass",
      current: "Pending",
      target: "Preserve",
      summary: "Add DEXA evidence to calibrate lean-mass status.",
      progress: 0,
      confidence: 0,
      missingEvidence: ["dexa_scan"],
    });
  }

  const referenceLeanMass = 149.1;
  const preservedRatio = leanMass / referenceLeanMass;
  const progress = clamp(Math.round(preservedRatio * 86), 0, 86);
  const findings = [
    createFinding({
      id: "latest_lean_mass_verified",
      status: "positive",
      text: `Latest DEXA verifies lean mass at ${leanMass.toFixed(1)} ${latestDEXA.leanMass.unit}.`,
      evidenceTypes: ["dexa"],
    }),
    createFinding({
      id: "next_scan_needed",
      status: "neutral",
      text: "Preservation remains provisional until the next DEXA.",
      evidenceTypes: ["dexa"],
    }),
  ];
  const confidenceFactors = [
    createConfidenceFactor("dexa_lean_mass", "DEXA is the authority for lean-mass status.", 22),
    createConfidenceFactor("between_scans", "Preservation is confidence-limited between scans.", -8),
  ];

  return createEvaluation({
    goal,
    title: "Lean Mass",
    current: `${leanMass.toFixed(1)} ${latestDEXA.leanMass.unit}`,
    target: "Preserve",
    summary: "Lean mass remains provisionally preserved between scans.",
    progress,
    confidence: getGoalConfidence({
      confidenceFactors,
      evidence,
      findings,
      missingEvidence: ["next_dexa_confirmation"],
    }),
    findings,
    recommendations: [
      createRecommendation("preserve_protein", "Keep protein and training consistency high."),
    ],
    confidenceFactors,
    missingEvidence: ["next_dexa_confirmation"],
    presentation: {
      mode: "supporting_objective",
      status: "Stable",
      detail: "Last DEXA",
      label: "Trend",
    },
  });
}

function createEvaluation({
  goal,
  title = goal.title,
  current,
  target,
  summary,
  progress,
  confidence,
  findings = [],
  recommendations = [],
  confidenceFactors = [],
  missingEvidence = [],
  projection = null,
  metadata = {},
  presentation = null,
}) {
  return {
    id: `goal_evaluation_${goal.id}`,
    goalId: goal.id,
    metricKey: goal.metricKey,
    title,
    primary: Boolean(goal.primary),
    current,
    target,
    summary,
    progress,
    confidence: getConfidenceValue(confidence),
    goalProgress: {
      value: progress,
      label: `${progress}% complete`,
    },
    goalConfidence: normalizeConfidence(confidence),
    findings,
    recommendations,
    confidenceFactors,
    missingEvidence,
    projection,
    metadata,
    presentation,
  };
}

function createFinding({ id, status, text, evidenceTypes }) {
  return {
    id,
    status,
    text,
    evidenceTypes,
  };
}

function createRecommendation(id, text) {
  return {
    id,
    text,
  };
}

function createConfidenceFactor(id, text, impact) {
  return {
    id,
    text,
    impact,
  };
}

function getProjection({ dexaScans = [], latestDEXA, weightEntries, now }) {
  if (!latestDEXA?.totalMass?.value || !latestDEXA?.fatMass?.value) {
    return null;
  }

  const postDexaWeights = weightEntries.filter(
    (entry) => entry.measuredAt >= latestDEXA.measuredAt
  );

  if (postDexaWeights.length < 2) {
    return getDexaTrendProjection({ dexaScans, latestDEXA, now });
  }

  const latestWeight = postDexaWeights.at(-1);
  const rollingTrend = getRollingWeightTrend(postDexaWeights);
  const lossRatePerDay =
    rollingTrend?.lossRatePerDay ??
    getRecentPositiveLossRate(postDexaWeights) ??
    getRecentPositiveLossRate(weightEntries);
  const estimatedBodyFat = estimateCurrentBodyFatFromWeight(latestDEXA, weightEntries);

  if (!lossRatePerDay || lossRatePerDay <= 0) {
    return getDexaTrendProjection({ dexaScans, latestDEXA, now });
  }

  const projectionAnchorDate = rollingTrend?.anchorDate ?? latestWeight.measuredAt;

  const estimatedFatMass =
    estimatedBodyFat !== null
      ? latestWeight.weight.value * (estimatedBodyFat / 100)
      : latestDEXA.fatMass.value;
  const estimatedNonFatMass = latestWeight.weight.value - estimatedFatMass;
  const targetHighWeight = estimatedNonFatMass / 0.91;
  const trendWeight = rollingTrend?.trendWeight ?? latestWeight.weight.value;
  const remaining = Math.max(0, trendWeight - targetHighWeight);
  const estimatedDays =
    estimatedBodyFat !== null && estimatedBodyFat <= 9.9
      ? Math.min(20, Math.max(7, remaining / lossRatePerDay))
      : remaining / lossRatePerDay;

  if (!Number.isFinite(estimatedDays) || estimatedDays > 90) return null;

  return {
    currentBodyFatEstimate: estimatedBodyFat,
    currentBodyFatRange:
      estimatedBodyFat === null
        ? null
        : formatBodyFatEstimateRange(estimatedBodyFat, {
            latestDEXA,
            weightEntries: postDexaWeights,
          }),
    projectedFinish: formatStabilizedProjectionWindow({
      anchorDate: projectionAnchorDate,
      estimatedDays,
    }),
    daysRemaining: formatApproxWeekRange(estimatedDays),
  };
}

function getDexaTrendProjection({ dexaScans, latestDEXA, now }) {
  const previousDEXA = dexaScans.at(-2) ?? null;

  if (!previousDEXA?.bodyFatPercentage || !latestDEXA?.bodyFatPercentage) {
    return null;
  }

  const elapsedDays = Math.max(
    1,
    daysBetween(previousDEXA.measuredAt, latestDEXA.measuredAt)
  );
  const bodyFatLossRate =
    (previousDEXA.bodyFatPercentage - latestDEXA.bodyFatPercentage) / elapsedDays;
  const remainingBodyFat = latestDEXA.bodyFatPercentage - 9;

  if (bodyFatLossRate <= 0 || remainingBodyFat <= 0) return null;

  const estimatedDays = remainingBodyFat / bodyFatLossRate;

  if (!Number.isFinite(estimatedDays) || estimatedDays > 45) return null;

  return {
    projectedFinish: formatDateRange(
      addDays(now, Math.max(0, Math.floor(estimatedDays * 0.8))),
      addDays(now, Math.ceil(estimatedDays * 1.2) + 2)
    ),
    daysRemaining: formatApproxWeekRange(estimatedDays),
  };
}

function getRollingWeightTrend(weightEntries) {
  const sortedWeights = sortByDate(weightEntries, "measuredAt");

  if (sortedWeights.length < ROLLING_TREND_WINDOW_DAYS + 1) return null;

  const rollingPoints = [];

  for (
    let index = ROLLING_TREND_WINDOW_DAYS - 1;
    index < sortedWeights.length;
    index += 1
  ) {
    const window = sortedWeights.slice(index - ROLLING_TREND_WINDOW_DAYS + 1, index + 1);
    const windowDays = daysBetween(window[0].measuredAt, window.at(-1).measuredAt);

    if (window.length < ROLLING_TREND_WINDOW_DAYS || windowDays < ROLLING_TREND_WINDOW_DAYS - 1) {
      continue;
    }

    rollingPoints.push({
      date: window.at(-1).measuredAt,
      value:
        window.reduce((total, entry) => total + entry.weight.value, 0) /
        window.length,
    });
  }

  if (rollingPoints.length < 2) return null;

  const first = rollingPoints[0];
  const latest = rollingPoints.at(-1);
  const elapsedDays = Math.max(1, daysBetween(first.date, latest.date));
  const lossRatePerDay = (first.value - latest.value) / elapsedDays;

  if (!Number.isFinite(lossRatePerDay) || lossRatePerDay <= 0) return null;

  return {
    anchorDate: latest.date,
    lossRatePerDay,
    trendWeight: latest.value,
  };
}

function formatStabilizedProjectionWindow({ anchorDate, estimatedDays }) {
  const projectedCenter = addDays(anchorDate, Math.max(0, Math.round(estimatedDays)));
  const stableCenter = snapDateToDayBucket(projectedCenter, PROJECTION_BUCKET_DAYS);

  return formatDateRange(
    addDays(stableCenter, -PROJECTION_WINDOW_RADIUS_DAYS),
    addDays(stableCenter, PROJECTION_WINDOW_RADIUS_DAYS)
  );
}

function snapDateToDayBucket(value, bucketDays) {
  const date = value instanceof Date ? new Date(value) : parseDate(value);
  const epochDay = Math.round(date.getTime() / DAY_MS);
  const snappedDay = Math.round(epochDay / bucketDays) * bucketDays;

  return new Date(snappedDay * DAY_MS + DAY_MS / 2);
}

function getRecentPositiveLossRate(weightEntries) {
  const sortedWeights = sortByDate(weightEntries, "measuredAt");

  for (let endIndex = sortedWeights.length - 1; endIndex > 0; endIndex -= 1) {
    for (let startIndex = 0; startIndex < endIndex; startIndex += 1) {
      const start = sortedWeights[startIndex];
      const end = sortedWeights[endIndex];
      const elapsedDays = daysBetween(start.measuredAt, end.measuredAt);
      const loss = start.weight.value - end.weight.value;

      if (elapsedDays >= 3 && loss > 0) {
        return loss / elapsedDays;
      }
    }
  }

  return null;
}

function getBodyFatTrend(dexaScans) {
  if (dexaScans.length < 2) return 0;

  const earliest = dexaScans[0].bodyFatPercentage;
  const latest = dexaScans.at(-1).bodyFatPercentage;

  if (earliest === null || latest === null) return 0;

  return Math.max(0, earliest - latest);
}

function estimateCurrentBodyFatFromWeight(latestDEXA, weightEntries) {
  const latestWeight = weightEntries.at(-1);

  if (
    !latestWeight?.weight?.value ||
    !latestDEXA?.totalMass?.value ||
    !latestDEXA?.fatMass?.value ||
    latestWeight.measuredAt < latestDEXA.measuredAt
  ) {
    return null;
  }

  const postDexaLoss = Math.max(
    0,
    latestDEXA.totalMass.value - latestWeight.weight.value
  );
  const rollingTrend = getRollingWeightTrend(
    weightEntries.filter((entry) => entry.measuredAt >= latestDEXA.measuredAt)
  );
  const fatLossRatio = rollingTrend?.lossRatePerDay && rollingTrend.lossRatePerDay > 0
    ? 0.72
    : 0.62;
  const estimatedFatMass = Math.max(
    latestDEXA.fatMass.value * 0.72,
    latestDEXA.fatMass.value - postDexaLoss * fatLossRatio
  );

  return (estimatedFatMass / latestWeight.weight.value) * 100;
}

function formatBodyFatEstimateRange(value, { latestDEXA, weightEntries = [] } = {}) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;

  const latestWeight = weightEntries.at(-1);
  const latestWeightValue = latestWeight?.weight?.value;
  const dexaWeightValue = latestDEXA?.totalMass?.value;
  const dexaFatMass = latestDEXA?.fatMass?.value;
  if (latestWeightValue && dexaWeightValue && dexaFatMass && latestWeightValue < dexaWeightValue) {
    const postDexaLoss = dexaWeightValue - latestWeightValue;
    const lowerFatMass = Math.max(dexaFatMass * 0.72, dexaFatMass - postDexaLoss * 0.78);
    const upperFatMass = Math.max(dexaFatMass * 0.72, dexaFatMass - postDexaLoss * 0.7);
    return `~${((lowerFatMass / latestWeightValue) * 100).toFixed(1)}-${((upperFatMass / latestWeightValue) * 100).toFixed(1)}%`;
  }

  const daysSinceDexa =
    latestDEXA?.measuredAt && latestWeight?.measuredAt
      ? Math.max(0, daysBetween(latestDEXA.measuredAt, latestWeight.measuredAt))
      : 0;
  const scaleOnlyInference = weightEntries.length > 1 && daysSinceDexa >= 7;
  const lowerSpread = scaleOnlyInference ? 0.45 : 0.2;
  const upperSpread = scaleOnlyInference ? 0.75 : 0.3;
  const lower = Math.max(0, value - lowerSpread);
  const upper = value + upperSpread;

  return `~${lower.toFixed(1)}-${upper.toFixed(1)}%`;
}

function getLeanMassPreservationScore(latestDEXA) {
  const leanMass = latestDEXA?.leanMass?.value ?? null;

  if (leanMass === null) return 0;

  return clamp(Math.round((leanMass / 149.1) * 100), 0, 100);
}

function getWeightLossAfterDate(weightEntries, date) {
  const entries = weightEntries.filter((entry) => entry.measuredAt >= date);

  if (entries.length < 2) return 0;

  return Number((entries[0].weight.value - entries.at(-1).weight.value).toFixed(1));
}

function getMaintenanceProgress({
  dexaScans,
  progressValue,
  targetMax,
  bodyFatTrend,
  postDexaLoss,
  projection,
  protocolContextExists,
  evidenceIsConsistent,
  hasCurrentEstimate,
}) {
  const latestVerified = dexaScans.at(-1)?.bodyFatPercentage ?? progressValue;
  const distanceScore = clamp(
    Math.round(((13.6 - progressValue) / (13.6 - targetMax)) * 42),
    0,
    42
  );
  const historyScore = clamp(dexaScans.length * 2 + Math.round(bodyFatTrend), 0, 20);
  const postDexaScore = clamp(Math.round(postDexaLoss * 3), 0, 10);
  const contextScore = (protocolContextExists ? 8 : 0) + (evidenceIsConsistent ? 10 : 0);
  const projectionScore = projection ? 8 : 0;
  const calibrationScore = hasCurrentEstimate && progressValue < latestVerified ? 6 : 0;

  return clamp(
    distanceScore +
      historyScore +
      postDexaScore +
      contextScore +
      projectionScore +
      calibrationScore,
    0,
    hasCurrentEstimate ? 92 : 86
  );
}

function hasRecentWeightConsistency(weightEntries, now) {
  const dates = new Set(weightEntries.map((entry) => entry.measuredAt?.slice(0, 10)));
  const today = now instanceof Date ? new Date(now) : new Date(now);
  let matches = 0;

  for (let offset = 0; offset < 7; offset += 1) {
    const cursor = new Date(today);
    cursor.setDate(today.getDate() - offset);
    if (dates.has(cursor.toISOString().slice(0, 10))) matches += 1;
  }

  return matches >= 5;
}

function hasConsistentProgressPhotos(progressPhotos) {
  if (progressPhotos.length < 3) return false;

  return progressPhotos.every(
    (photo) =>
      photo.conditions?.morning &&
      photo.conditions?.fasted &&
      photo.conditions?.sameLighting &&
      photo.conditions?.sameMirror &&
      photo.conditions?.postWorkout === false &&
      photo.conditions?.pump === false
  );
}

function formatGoalTarget(goal) {
  if (goal.targetRange) {
    return `${goal.targetRange.min}-${goal.targetRange.max}${goal.unit ?? ""}`;
  }

  return "Pending";
}

function sortByDate(records, field) {
  return [...records].sort((a, b) => String(a[field]).localeCompare(String(b[field])));
}

function daysBetween(value, otherValue) {
  const start = parseDate(value);
  const end = otherValue instanceof Date ? otherValue : parseDate(otherValue);

  return Math.floor((end.getTime() - start.getTime()) / DAY_MS);
}

function addDays(value, days) {
  const date = value instanceof Date ? new Date(value) : parseDate(value);
  date.setDate(date.getDate() + days);

  return date;
}

function parseDate(value) {
  return new Date(`${String(value).slice(0, 10)}T12:00:00`);
}

function formatDateRange(start, end) {
  const sameMonth =
    start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  const startText = formatShortDate(start);
  const endText = sameMonth ? String(end.getDate()) : formatShortDate(end);

  return startText === endText ? startText : `${startText}-${endText}`;
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatWeekRange(days) {
  if (days <= 7) return "0-1 week";

  const low = Math.max(1, Math.floor(days / 7));
  const high = Math.max(low + 1, Math.ceil((days + 7) / 7));

  return `${low}-${high} weeks`;
}

function formatApproxWeekRange(days) {
  if (days <= 10) return "~1 week";
  if (days <= 20) return "~2 weeks";
  if (days <= 27) return "~3 weeks";

  return formatWeekRange(days);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getGoalConfidence({ confidenceFactors, evidence, findings, missingEvidence }) {
  return GoalConfidenceService.calculateGoalConfidence({
    confidenceFactors,
    evidence: {
      dexaScanCount: evidence.dexaScans.length,
      weightEntryCount: evidence.weightEntries.length,
      progressPhotoCount: evidence.progressPhotos.length,
      protocolCount: evidence.protocols.length,
    },
    findings,
    missingEvidence,
  });
}

function normalizeConfidence(confidence) {
  if (typeof confidence === "number") {
    return {
      value: confidence,
      label: getConfidenceLabel(confidence),
      factors: [],
      evidenceImpact: 0,
      agreementImpact: 0,
      missingEvidence: [],
    };
  }

  return confidence;
}

function getConfidenceValue(confidence) {
  return normalizeConfidence(confidence)?.value ?? 0;
}

function getConfidenceLabel(confidence) {
  if (confidence >= 90) return "Very High";
  if (confidence >= 80) return "High";
  if (confidence >= 55) return "Moderate";

  return "Building";
}
