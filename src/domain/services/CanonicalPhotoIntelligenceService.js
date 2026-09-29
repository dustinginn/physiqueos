export const CANONICAL_PHOTO_INTELLIGENCE_VERSION = "canonical_photo_intelligence_v1";
export const PHOTO_MAGNITUDE_CALIBRATION_VERSION = "photo_magnitude_calibration_v2";

const MEANINGFUL = new Set(["moderate", "moderate_to_high", "pronounced", "major"]);
const RELIABLE = new Set(["high", "moderate_to_high", "moderate"]);

/**
 * Produces the durable, photo-only Photo Intelligence contract. The producer
 * deliberately accepts no DEXA, weight, training, nutrition, activity, sleep,
 * or other holistic evidence input.
 */
export function createCanonicalPhotoIntelligenceResult({
  caseId,
  baselineDate,
  comparisonDate,
  goalContext = null,
  source = {},
  captureAssessment = {},
  comparability = {},
  visualChange = {},
  confidenceAndLimitations = {},
  unsupportedConclusions = [],
  photoOnlyInterpretation = "",
  photoBriefingCopy = "",
  replayLabel = "PROSPECTIVE",
} = {}) {
  const original = structuredClone(arguments[0] ?? {});
  requireDate(baselineDate, "baselineDate");
  requireDate(comparisonDate, "comparisonDate");

  const regionalObservations = normalizeRegions(visualChange.regions);
  const calibration = calibratePhotoMagnitude({
    reportedMagnitude: visualChange.overallApparentMagnitude ??
      visualChange.overall_apparent_magnitude,
    regionalObservations,
    overallReliability: confidenceAndLimitations.overallReliability ??
      confidenceAndLimitations.overall_reliability,
  });
  const exactPhotoBriefingCopy = realizeCalibratedCopy(
    removeRoutinePhotoCaptureCoaching(photoBriefingCopy), calibration
  );
  const calibratedPhotoOnlyInterpretation = realizeCalibratedInterpretation(
    photoOnlyInterpretation, calibration
  );
  const result = {
    schemaVersion: CANONICAL_PHOTO_INTELLIGENCE_VERSION,
    resultLabel: String(replayLabel),
    comparison: {
      caseId: String(caseId ?? `photo_comparison_${baselineDate}_${comparisonDate}`),
      baselineDate,
      comparisonDate,
      daysElapsed: dayDifference(baselineDate, comparisonDate),
      goalContext: goalContext ? structuredClone(goalContext) : null,
    },
    source: structuredClone(source),
    captureAssessment: structuredClone(captureAssessment),
    comparability: structuredClone(comparability),
    observations: regionalObservations,
    dominantVisualStory: String(
      visualChange.dominantStory ?? visualChange.dominant_story ?? ""
    ),
    overallMagnitude: calibration.magnitude,
    magnitudeCalibration: calibration,
    confidence: normalizeConfidenceAndLimitations(confidenceAndLimitations),
    goalRelativeInterpretation: normalizeGoalInterpretation(
      visualChange.goalRelativeInterpretation ?? visualChange.goal_relative_interpretation
    ),
    unsupportedConclusions: uniqueStrings(unsupportedConclusions),
    photoOnlyInterpretation: calibratedPhotoOnlyInterpretation,
    exactPhotoBriefingCopy,
    provenance: {
      producer: "canonical_photo_intelligence_service",
      producerVersion: CANONICAL_PHOTO_INTELLIGENCE_VERSION,
      calibrationVersion: PHOTO_MAGNITUDE_CALIBRATION_VERSION,
      evidenceClass: "photo_only",
      nonPhotoEvidenceUsed: false,
      resultLabel: String(replayLabel),
    },
  };
  if (JSON.stringify(arguments[0] ?? {}) !== JSON.stringify(original)) {
    throw new Error("Canonical Photo Intelligence input mutation detected.");
  }
  assertPhotoOnly(result);
  return deepFreeze(result);
}

/**
 * The calibration is intentionally asymmetric: it only promotes an already
 * meaningful global call when several independently described, reliable
 * regions agree. A collection of subtle findings can never become major.
 */
export function calibratePhotoMagnitude({
  reportedMagnitude,
  regionalObservations = [],
  overallReliability = "unknown",
} = {}) {
  const reported = normalizeMagnitude(reportedMagnitude);
  const directional = regionalObservations.filter((item) =>
    polarity(item) && MEANINGFUL.has(item.apparentMagnitude) &&
    RELIABLE.has(item.confidence)
  );
  const counts = ["positive", "negative"].map((direction) => ({
    direction,
    regions: new Set(directional.filter((item) =>
      polarity(item) === direction && !/overall|whole|global/i.test(item.region)
    ).map((item) => item.region)),
  })).sort((left, right) => right.regions.size - left.regions.size);
  const aligned = counts[0];
  const hasGlobalAnchor = directional.some((item) =>
    /overall|whole|global/i.test(item.region) && item.confidence === "high" &&
    polarity(item) === aligned.direction
  );
  const reliabilitySupportsPromotion = [
    "high", "moderate_to_high", "moderate-to-high",
  ].includes(String(overallReliability).toLowerCase());
  const majorEvidence = hasGlobalAnchor && aligned.regions.size >= 4 &&
    reliabilitySupportsPromotion;
  const promoted = ["moderate", "pronounced", "major"].includes(reported) &&
    majorEvidence;
  const magnitude = promoted ? "major" :
    ["pronounced", "major"].includes(reported) ? "moderate" : reported;

  return {
    magnitude,
    reportedMagnitude: reported,
    promotionApplied: promoted,
    rule: promoted
      ? "meaningful_global_anchor_plus_four_reliable_directional_regions"
      : "preserve_reported_photo_magnitude",
    alignedDirection: aligned.regions.size ? aligned.direction : null,
    reliableDirectionalRegionCount: aligned.regions.size,
    subtleFindingsCannotPromote: true,
  };
}

export function canonicalPhotoIntelligenceFromBlindResult(blind, {
  replayLabel = "SECOND PASS — POST-REVEAL CALIBRATED REPLAY",
} = {}) {
  const confidence = blind.reliability ?? blind.confidence_and_limitations ?? {};
  const goal = blind.goal_relative_interpretation ?? {};
  return createCanonicalPhotoIntelligenceResult({
    caseId: blind.case?.id,
    baselineDate: blind.case?.baseline_date,
    comparisonDate: blind.case?.comparison_date,
    goalContext: blind.case?.goal_context,
    source: blind.source,
    captureAssessment: blind.capture_assessment,
    comparability: blind.comparability,
    visualChange: {
      ...blind.visual_change,
      goalRelativeInterpretation: goal,
    },
    confidenceAndLimitations: {
      overallReliability: confidence.overall_confidence ?? confidence.overall_reliability,
      rationale: confidence.confidence_summary ?? confidence.rationale,
      limitations: confidence.uncertainty_and_confounders ?? confidence.material_confounders,
    },
    unsupportedConclusions: blind.unsupported_conclusions,
    photoOnlyInterpretation: blind.pi_level_interpretation,
    photoBriefingCopy: blind.sample_photo_briefing_copy ?? blind.exact_sample_photo_briefing_copy,
    replayLabel,
  });
}

export function createCanonicalPhotoIntelligenceFromSession({
  session,
  goalContext = null,
} = {}) {
  if (!session?.id || !session?.captureDate) return null;
  const priorDates = [...new Set(session.views?.map((view) =>
    view.comparison?.previousDate
  ).filter(Boolean).sort() ?? [])];
  const baselineDate = priorDates[0];
  if (!baselineDate) return null;
  const observations = [
    ...(session.synthesis?.observations ?? []),
    ...(session.views ?? []).flatMap((view) => view.structuredFindings ?? []),
  ].map((item) => ({
    region: item.region ?? "photo_evidence",
    metric: item.metric ?? "unknown",
    direction: item.direction ?? "unknown",
    apparent_magnitude: item.magnitude ?? "unknown",
    confidence: item.confidence ?? "low",
    observation: item.change ?? item.description ?? "",
    basis: item.basis ?? [],
    confounders: item.limitations ?? [],
  }));
  const ranked = observations.map((item) => normalizeMagnitude(item.apparent_magnitude));
  const reportedMagnitude = ranked.includes("pronounced") ? "pronounced" :
    ranked.includes("moderate") ? "moderate" : ranked.includes("subtle") ? "subtle" : "none";
  const sourceIds = [...new Set((session.views ?? []).flatMap((view) =>
    [
      view.canonicalPhotoId,
      view.comparison?.previousCanonicalViewId,
      view.comparison?.previousSessionId,
      ...(view.provenance?.sourceIds ?? []),
    ].filter(Boolean)
  ))].sort();
  const visualSummary = observations.map((item) => item.observation)
    .filter(Boolean).join(" ");
  return createCanonicalPhotoIntelligenceResult({
    caseId: session.id,
    baselineDate,
    comparisonDate: session.captureDate,
    goalContext,
    source: {
      photoSessionId: session.id,
      sourceEvidenceIds: sourceIds,
      comparisonDates: priorDates,
    },
    captureAssessment: {
      views: (session.views ?? []).map((view) => ({
        poseId: view.poseId,
        conditionDifferences: view.conditionDifferences ?? [],
      })),
    },
    comparability: {
      overall: session.views?.every((view) => view.comparisonStatus === "comparable")
        ? "high" : "moderate",
    },
    visualChange: {
      dominantStory: visualSummary,
      overallApparentMagnitude: reportedMagnitude,
      regions: observations,
      goalRelativeInterpretation: deriveSessionGoalRelativeInterpretation({
        goalContext,
        observations,
        visualSummary,
        reportedMagnitude,
      }),
    },
    confidenceAndLimitations: {
      overallReliability: "moderate",
      limitations: [...new Set((session.views ?? []).flatMap((view) =>
        view.conditionDifferences ?? []
      ))],
    },
    unsupportedConclusions: STANDARD_UNSUPPORTED_CONCLUSIONS,
    photoOnlyInterpretation: visualSummary,
    photoBriefingCopy: visualSummary,
  });
}

function deriveSessionGoalRelativeInterpretation({
  goalContext,
  observations,
  visualSummary,
  reportedMagnitude,
} = {}) {
  const goal = goalContext?.activeGoal;
  if (!goal) return null;
  const title = String(goal.title ?? goal.type ?? "the active goal");
  const buildingGoal = /build.*(?:lean )?mass|muscle|hypertrophy|lean gain/i.test(title);
  const relevantMetric = buildingGoal
    ? /muscular|fullness|size|lean|definition|conditioning|softness|waist/i
    : /lean|definition|conditioning|softness|waist|flatness|abdominal/i;
  const signals = observations.filter((item) => relevantMetric.test(
    `${item.metric} ${item.region}`
  )).map(polarity).filter(Boolean);
  const positive = signals.filter((value) => value === "positive").length;
  const negative = signals.filter((value) => value === "negative").length;
  const direction = positive > negative ? "supportive" :
    negative > positive ? "counter_directional" :
      signals.length ? "mixed" : "uncertain";
  const strength = direction === "supportive" &&
    MEANINGFUL.has(normalizeMagnitude(reportedMagnitude))
    ? "moderate_visual_support" : direction === "supportive"
      ? "emerging_visual_support" : "limited_visual_support";
  const directionText = direction === "supportive" ? "supports" :
    direction === "counter_directional" ? "runs counter to" :
      direction === "mixed" ? "is mixed relative to" : "does not yet resolve";
  const implication = direction === "supportive"
    ? "Treat this as photo-only supporting evidence; it does not establish a strategy change without independent evidence."
    : direction === "counter_directional"
      ? "Treat this as counter-directional photo evidence; it may warrant review, but it does not establish a strategy change without independent evidence."
      : direction === "mixed"
        ? "Treat this as mixed photo evidence; it does not support a directional strategy conclusion without independent evidence."
        : "The photo evidence is insufficient for a goal-direction or strategy conclusion.";
  return {
    direction,
    strength,
    interpretation: `The photo-only direction ${directionText} ${title}. ${visualSummary}`.trim(),
    photoOnlyStrategyImplication: implication,
  };
}

export function removeRoutinePhotoCaptureCoaching(value = "") {
  return String(value)
    .replace(/,?\s*so stay the course and (?:use|take|capture) (?:the )?(?:next )?(?:matched )?(?:front[- ]relaxed )?(?:photo|photos|setup|capture)[^.?!]*[.?!]?\s*$/i, ".")
    .replace(/\s*(?:Stay the course,? and )?(?:use|take|capture) (?:a |the )?(?:next )?(?:matched )?(?:front[- ]relaxed )?(?:photo|photos|setup|capture)[^.?!]*[.?!]?\s*$/i, "")
    .replace(/\s*In the next comparison, PhysiqueOS will watch[^.?!]*[.?!]?\s*$/i, "")
    .trim();
}

function realizeCalibratedCopy(value, calibration) {
  if (!calibration.promotionApplied) return String(value);
  return String(value)
    .replace(/\bmeaningful movement toward\b/i, "a clear visual transformation toward")
    .replace(/\bmeaningful visual progress\b/i, "a clear visual transformation");
}

function realizeCalibratedInterpretation(value, calibration) {
  if (!calibration.promotionApplied) return String(value);
  return String(value)
    .replace(/\bmoderate and meaningful improvement\b/i, "major and unmistakable improvement")
    .replace(/\bmoderate improvement\b/i, "major improvement")
    .replace(/\bmeaningful progress, not a dramatic full-physique transformation\b/i,
      "a clear, high-magnitude visual transformation");
}

const STANDARD_UNSUPPORTED_CONCLUSIONS = Object.freeze([
  "exact body-fat percentage or numerical body-composition change",
  "pounds of fat, lean mass, or muscle gained or lost",
  "causation by training, nutrition, medication, supplements, or lifestyle",
  "health status or physiological mechanism",
]);

function normalizeRegions(values = []) {
  return (Array.isArray(values) ? values : []).map((value) => ({
    region: String(value.region ?? "photo_evidence"),
    metric: String(value.metric ?? "unknown"),
    direction: String(value.direction ?? "unknown").toLowerCase(),
    apparentMagnitude: normalizeMagnitude(
      value.apparentMagnitude ?? value.apparent_magnitude
    ),
    confidence: String(value.confidence ?? "unknown").toLowerCase()
      .replace(/-/g, "_"),
    observation: String(value.observation ?? value.change ?? ""),
    basis: uniqueStrings(value.basis),
    confounders: uniqueStrings(value.confounders ?? value.limitations),
  }));
}

function normalizeMagnitude(value) {
  const normalized = String(value ?? "unknown").toLowerCase().replace(/-/g, "_");
  if (["none_detected", "no_clear_change"].includes(normalized)) return "none";
  if (normalized === "subtle_to_moderate") return "moderate";
  return ["none", "subtle", "moderate", "pronounced", "major", "unknown"]
    .includes(normalized) ? normalized : "unknown";
}

function polarity(item) {
  const direction = String(item?.direction ?? "").toLowerCase();
  if (direction === "improved") return "positive";
  if (direction === "worsened") return "negative";
  const inverseMetric = /softness|fatness|waist_(?:size|width)|abdominal_projection/.test(
    String(item?.metric ?? "").toLowerCase()
  );
  if (direction === "increased") return inverseMetric ? "negative" : "positive";
  if (["decreased", "reduced"].includes(direction)) {
    return inverseMetric ? "positive" : "negative";
  }
  return null;
}

function normalizeConfidenceAndLimitations(value) {
  return {
    overallReliability: String(value.overallReliability ?? "unknown")
      .toLowerCase().replace(/-/g, "_"),
    rationale: String(value.rationale ?? ""),
    limitations: uniqueStrings(value.limitations),
  };
}

function normalizeGoalInterpretation(value) {
  if (!value) return null;
  return {
    direction: String(value.direction ?? "unknown"),
    strength: String(value.strength ?? "unknown"),
    interpretation: String(value.interpretation ?? value.summary ?? ""),
    photoOnlyStrategyImplication: String(
      value.photo_only_strategy_implication ?? value.photoOnlyStrategyImplication ?? ""
    ),
  };
}

function assertPhotoOnly(result) {
  if (result.provenance.nonPhotoEvidenceUsed !== false) {
    throw new Error("Canonical Photo Intelligence must remain photo-only.");
  }
  const body = JSON.stringify(result);
  if (/"(?:dexa|weight|training|nutrition|activity|sleep)Evidence"\s*:/i.test(body)) {
    throw new Error("Canonical Photo Intelligence contains holistic evidence.");
  }
}

function requireDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) {
    throw new Error(`Canonical Photo Intelligence requires ${label}.`);
  }
}

function dayDifference(start, end) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
