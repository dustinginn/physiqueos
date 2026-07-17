const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_LOWER_SPREAD = 0.45;
const BASE_UPPER_SPREAD = 0.75;
const MIN_LOWER_SPREAD = 0.3;
const MIN_UPPER_SPREAD = 0.38;

export function createBodyCompositionEstimate({
  latestDEXA,
  weightEntries = [],
  progressPhotos = [],
  photoAnalyses = [],
  trainingPerformance = null,
  now = new Date(),
} = {}) {
  const weights = [...weightEntries].sort((a, b) => String(a.measuredAt).localeCompare(String(b.measuredAt)));
  const latestWeight = weights.at(-1) ?? null;
  if (!latestDEXA?.totalMass?.value || !latestDEXA?.fatMass?.value || !latestWeight?.weight?.value || latestWeight.measuredAt < latestDEXA.measuredAt) return null;

  const currentWeight = latestWeight.weight.value;
  const totalWeightChange = currentWeight - latestDEXA.totalMass.value;
  const loss = Math.max(0, -totalWeightChange);
  const postDexaWeights = weights.filter((entry) => entry.measuredAt >= latestDEXA.measuredAt);
  const rolling = getRollingWeight(postDexaWeights);
  const fatLossRatio = rolling.lossRatePerDay > 0 ? 0.72 : 0.62;
  const fatMassFloor = latestDEXA.fatMass.value * 0.72;
  const estimatedFatMass = Math.max(fatMassFloor, latestDEXA.fatMass.value - loss * fatLossRatio);
  const anchorOtherMass = Math.max(0, latestDEXA.totalMass.value - latestDEXA.fatMass.value - (latestDEXA.leanMass?.value ?? latestDEXA.totalMass.value - latestDEXA.fatMass.value));
  const estimatedLeanMass = currentWeight - estimatedFatMass - anchorOtherMass;
  const point = estimatedFatMass / currentWeight * 100;
  const daysSinceDEXA = daysBetween(latestDEXA.measuredAt, latestWeight.measuredAt);
  const scaleOnly = postDexaWeights.length > 1 && daysSinceDEXA >= 7;
  const baseLowerSpread = scaleOnly ? BASE_LOWER_SPREAD : 0.2;
  const baseUpperSpread = scaleOnly ? BASE_UPPER_SPREAD : 0.3;
  const photoConstraint = assessPhotoConstraint({ photoAnalyses, progressPhotos });
  const performanceConstraint = assessPerformanceConstraint(trainingPerformance);
  const lowerReduction = photoConstraint.lowerReduction + performanceConstraint.lowerReduction;
  const upperReduction = photoConstraint.upperReduction + performanceConstraint.upperReduction;
  const lowerSpread = Math.max(MIN_LOWER_SPREAD, baseLowerSpread - lowerReduction);
  const upperSpread = Math.max(MIN_UPPER_SPREAD, baseUpperSpread - upperReduction);
  const lower = Math.max(0, point - lowerSpread);
  const upper = point + upperSpread;
  const evidenceThroughDate = [latestWeight.measuredAt, photoConstraint.evidenceThroughDate, performanceConstraint.evidenceThroughDate].filter(Boolean).sort().at(-1);

  return {
    id: `body_composition_estimate_${latestDEXA.id ?? latestDEXA.measuredAt}_${latestWeight.measuredAt}_${evidenceThroughDate}`,
    asOfDate: toDateKey(now), evidenceThroughDate,
    anchorDEXAId: latestDEXA.id ?? null, anchorDate: latestDEXA.measuredAt,
    anchorWeight: latestDEXA.totalMass.value, anchorFatMass: latestDEXA.fatMass.value,
    anchorLeanMass: latestDEXA.leanMass?.value ?? null,
    currentWeight, rollingWeight: rolling.value, totalWeightChange,
    pointEstimateBodyFatPercent: round(point, 3), lowerBodyFatPercent: round(lower, 3), upperBodyFatPercent: round(upper, 3),
    estimatedFatMass: round(estimatedFatMass, 3), estimatedLeanMass: round(estimatedLeanMass, 3),
    allocationAssumptions: {
      pointFatLossRatio: fatLossRatio, fatMassFloor: round(fatMassFloor, 3), anchorOtherMass: round(anchorOtherMass, 3),
      scaleOnlyLowerBodyFatPercent: round(Math.max(0, point - baseLowerSpread), 3),
      scaleOnlyUpperBodyFatPercent: round(point + baseUpperSpread, 3),
      lowerBoundFatLossRatio: allocationRatio(latestDEXA.fatMass.value, currentWeight, lower, loss),
      upperBoundFatLossRatio: allocationRatio(latestDEXA.fatMass.value, currentWeight, upper, loss),
    },
    photoConstraint, performanceConstraint,
    uncertaintyDrivers: [
      `${daysSinceDEXA} days since the latest DEXA`,
      ...(photoConstraint.eligible ? [] : [photoConstraint.reason]),
      ...(performanceConstraint.eligible ? [] : [performanceConstraint.reason]),
      "Photos and training constrain plausible tissue allocation but do not directly measure fat or lean mass.",
    ].filter(Boolean),
    evidenceQuality: {
      scale: postDexaWeights.length >= 7 ? "high" : postDexaWeights.length >= 3 ? "moderate" : "low",
      photos: photoConstraint.quality, performance: performanceConstraint.quality,
    },
    method: "DEXA-calibrated weight trend constrained by longitudinal photos and resistance performance",
    confidenceMeaning: "The interval reflects plausible post-DEXA fat-versus-lean allocation; it is separate from confidence in the overall goal trajectory.",
  };
}

export function formatBodyCompositionRange(estimate) {
  return estimate ? `~${estimate.lowerBodyFatPercent.toFixed(1)}-${estimate.upperBodyFatPercent.toFixed(1)}%` : null;
}

function assessPhotoConstraint({ photoAnalyses, progressPhotos }) {
  const comparableDates = new Set(progressPhotos.filter(hasComparableConditions).map((photo) => String(photo.date ?? photo.capturedAt).slice(0, 10)));
  const relevant = photoAnalyses.flatMap((analysis) => {
    const date = String(analysis.createdAt ?? analysis.observedAt ?? "").slice(0, 10);
    return (analysis.metadata?.structuredObservations ?? analysis.structuredObservations ?? []).map((observation) => ({ ...observation, date }));
  }).filter((observation) => observation.type !== "limitation" && observation.supportsGoal !== false && ["high", "moderate"].includes(observation.confidence) && ["Midsection", "Upper body", "Back", "Overall physique", "Proportions"].includes(observation.region));
  const observationDates = new Set(relevant.map((item) => item.date).filter(Boolean));
  const sessionCount = Math.min(comparableDates.size || observationDates.size, observationDates.size);
  const eligible = sessionCount >= 3 && relevant.length >= 6;
  const quality = eligible && sessionCount >= 5 && relevant.length >= 10 ? "high" : eligible ? "moderate" : "low";
  const strength = quality === "high" ? 1 : quality === "moderate" ? 0.65 : 0;
  return {
    eligible, quality, comparableSessionCount: sessionCount, structuredObservationCount: relevant.length,
    evidenceThroughDate: [...observationDates].sort().at(-1) ?? null,
    lowerReduction: round(0.08 * strength, 3), upperReduction: round(0.18 * strength, 3),
    reason: eligible ? "Multiple comparable sessions contain consistent structured observations of visual progression and maintained shape." : "Comparable longitudinal photo coverage is insufficient or conflicting.",
    meaning: "Photo evidence changes scenario plausibility; it does not supply a body-fat measurement.",
  };
}

function assessPerformanceConstraint(report) {
  const summary = report?.summary ?? {};
  const observations = report?.exerciseObservations ?? [];
  const comparable = observations.filter((item) => item.status !== "insufficient_data");
  const supportive = comparable.filter((item) => ["stable", "improving", "plateauing"].includes(item.status));
  const regressing = comparable.filter((item) => item.status === "regressing");
  const sufficientExposure = (summary.resistance_sessions_last_30_days ?? 0) >= 4 && comparable.length >= 2;
  const broadRegression = regressing.length >= Math.max(2, Math.ceil(comparable.length / 2));
  const eligible = sufficientExposure && !broadRegression && supportive.length >= 2;
  const quality = eligible && comparable.length >= 4 && (summary.resistance_sessions_last_30_days ?? 0) >= 8 ? "high" : eligible ? "moderate" : "low";
  const strength = quality === "high" ? 1 : quality === "moderate" ? 0.6 : 0;
  return {
    eligible, quality, sessionsLast30Days: summary.resistance_sessions_last_30_days ?? 0,
    comparableExerciseCount: comparable.length, supportiveExerciseCount: supportive.length, regressingExerciseCount: regressing.length,
    recentPrCount: summary.recent_pr_count ?? 0,
    evidenceThroughDate: report?.overallObservation?.evidence_date_range?.end ?? null,
    lowerReduction: round(0.04 * strength, 3), upperReduction: round(0.18 * strength, 3),
    reason: eligible ? "A recent pattern across multiple comparable resistance movements makes substantial lean-mass loss less plausible." : broadRegression ? "Broad resistance-performance deterioration prevents a preservation constraint." : "Recent comparable resistance exposure is insufficient; an isolated PR is not treated as proof of preservation.",
    meaning: "Performance constrains substantial lean-loss scenarios but does not confirm lean mass.",
  };
}

function hasComparableConditions(photo) {
  const c = photo.conditions ?? {};
  return c.morning && c.fasted && c.postWorkout === false && c.pump === false && c.sameLighting !== false;
}
function getRollingWeight(entries) {
  const recent = entries.slice(-7);
  const value = recent.length ? recent.reduce((sum, item) => sum + item.weight.value, 0) / recent.length : null;
  const elapsed = entries.length > 1 ? Math.max(1, daysBetween(entries[0].measuredAt, entries.at(-1).measuredAt)) : 0;
  return { value: value === null ? null : round(value, 3), lossRatePerDay: elapsed ? (entries[0].weight.value - entries.at(-1).weight.value) / elapsed : 0 };
}
function allocationRatio(anchorFat, currentWeight, bodyFatPercent, loss) { return loss > 0 ? round((anchorFat - currentWeight * bodyFatPercent / 100) / loss, 3) : null; }
function daysBetween(a, b) { return Math.max(0, Math.floor((new Date(`${String(b).slice(0, 10)}T12:00:00`) - new Date(`${String(a).slice(0, 10)}T12:00:00`)) / DAY_MS)); }
function toDateKey(value) { const date = value instanceof Date ? value : new Date(value); return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-"); }
function round(value, digits) { return Number(value.toFixed(digits)); }
