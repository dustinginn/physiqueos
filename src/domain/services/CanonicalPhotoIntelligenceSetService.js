import {
  createCanonicalPhotoIntelligenceFromSession,
  createCanonicalPhotoIntelligenceResult,
} from "./CanonicalPhotoIntelligenceService.js";

export const CANONICAL_PHOTO_INTELLIGENCE_SET_VERSION =
  "canonical_photo_intelligence_set_v1";

const MAGNITUDE_RANK = ["none", "unknown", "subtle", "moderate", "pronounced", "major"];
const RELIABILITY_RANK = ["insufficient", "low", "low_to_moderate", "moderate", "moderate_to_high", "high"];
const COMPARABILITY_RANK = [
  "insufficient", "limited", "limited_to_moderate", "moderate",
  "moderate_to_good", "good", "high",
];

/**
 * Additive set-level producer. Every matched view is first interpreted by the
 * existing photo-only PI producer. The set layer reconciles those immutable
 * view results and preserves their provenance; it never introduces holistic
 * evidence or compares unlike poses.
 */
export function createCanonicalPhotoIntelligenceSetResult({
  setId,
  baselineSet,
  comparisonSet,
  goalContext = null,
  viewComparisons = [],
  unmatchedViews = [],
  setPhotoBriefingCopy = "",
  replayLabel = "PROSPECTIVE",
} = {}) {
  requireSet(baselineSet, "baselineSet");
  requireSet(comparisonSet, "comparisonSet");
  const original = structuredClone(arguments[0] ?? {});
  const views = viewComparisons.map((item, index) =>
    normalizeViewComparison(item, {
      setId: setId ?? `photo_set_comparison_${baselineSet.id}_${comparisonSet.id}`,
      baselineSet,
      comparisonSet,
      goalContext,
      replayLabel,
      index,
    })
  );
  const unmatched = unmatchedViews.map(normalizeUnmatchedView);
  const usable = views.filter((item) => item.matchStatus === "like_for_like");
  const observations = reconcileObservations(usable);
  const corroboration = deriveCrossViewCorroboration(usable);
  const conflicts = deriveCrossViewConflicts(usable);
  const comparability = deriveSetComparability(usable, unmatched);
  const strongestViewMagnitude = strongestMagnitude(usable.map((item) =>
    item.photoIntelligence.overallMagnitude));
  const magnitude = conflicts.length ? "unknown" : strongestViewMagnitude;
  const confidence = deriveSetConfidence(usable, corroboration, conflicts);
  const goalRelativeInterpretation = deriveSetGoalInterpretation(usable, goalContext);
  const dominantVisualStory = usable.map((item) =>
    item.photoIntelligence.dominantVisualStory).filter(Boolean).join(" ");
  const exactPhotoBriefingCopy = String(setPhotoBriefingCopy ||
    buildSetPhotoBriefingCopy(usable, conflicts));
  const result = {
    schemaVersion: CANONICAL_PHOTO_INTELLIGENCE_SET_VERSION,
    resultLabel: String(replayLabel),
    comparison: {
      caseId: String(setId ?? `photo_set_comparison_${baselineSet.id}_${comparisonSet.id}`),
      baselineSetId: String(baselineSet.id),
      comparisonSetId: String(comparisonSet.id),
      baselineDate: baselineSet.identityStatus === "composite" ? null : baselineSet.date,
      baselineDates: uniqueStrings(baselineSet.dates?.length
        ? baselineSet.dates : [baselineSet.date]),
      comparisonDate: comparisonSet.date,
      daysElapsed: baselineSet.identityStatus === "composite" ? null :
        dayDifference(baselineSet.date, comparisonSet.date),
      goalContext: goalContext ? structuredClone(goalContext) : null,
    },
    sets: {
      baseline: normalizeSet(baselineSet),
      comparison: normalizeSet(comparisonSet),
    },
    viewComparisons: views,
    unmatchedViews: unmatched,
    comparability,
    observations,
    dominantVisualStory,
    overallMagnitude: magnitude,
    magnitudeReconciliation: {
      status: conflicts.length ? "mixed_across_views" : "consistent_across_views",
      strongestViewMagnitude,
      viewMagnitudes: usable.map((item) => ({
        viewComparisonId: item.id,
        magnitude: item.photoIntelligence.overallMagnitude,
      })),
    },
    confidence,
    goalRelativeInterpretation,
    crossViewCorroboration: corroboration,
    crossViewConflicts: conflicts,
    unsupportedConclusions: uniqueStrings(usable.flatMap((item) =>
      item.photoIntelligence.unsupportedConclusions ?? [])),
    photoOnlyInterpretation: dominantVisualStory,
    exactPhotoBriefingCopy,
    provenance: {
      producer: "canonical_photo_intelligence_set_service",
      producerVersion: CANONICAL_PHOTO_INTELLIGENCE_SET_VERSION,
      viewProducerVersion: usable[0]?.photoIntelligence.provenance?.producerVersion ?? null,
      evidenceClass: "photo_only",
      nonPhotoEvidenceUsed: false,
      viewConfidenceChanged: false,
      unmatchedViewsTreatedAsNoChange: false,
      resultLabel: String(replayLabel),
    },
  };
  if (JSON.stringify(arguments[0] ?? {}) !== JSON.stringify(original)) {
    throw new Error("Canonical Photo Intelligence set input mutation detected.");
  }
  return deepFreeze(result);
}

export function createCanonicalPhotoIntelligenceSetFromSession({
  session,
  goalContext = null,
} = {}) {
  if (!session?.id || !session?.captureDate) return null;
  const matched = [];
  const unmatched = [];
  for (const view of session.views ?? []) {
    if (!view.comparison?.previousDate) {
      unmatched.push({
        setRole: "comparison",
        sourceId: view.canonicalPhotoId ?? view.canonicalViewId,
        setId: session.id,
        date: session.captureDate,
        view: poseView(view),
        pose: view.poseId,
        visibleRegions: (view.structuredFindings ?? []).map((item) => item.region)
          .filter(Boolean),
        reason: "no_prior_like_for_like_view",
      });
      continue;
    }
    const sourceIds = new Set(view.provenance?.sourceIds ?? []);
    const synthesisObservations = (session.synthesis?.observations ?? []).filter((item) =>
      (item.sourceEvidenceIds ?? []).some((id) => sourceIds.has(id))
    );
    const photoIntelligence = createCanonicalPhotoIntelligenceFromSession({
      session: {
        ...session,
        id: `${session.id}:${view.poseId}`,
        views: [view],
        synthesis: { ...session.synthesis, observations: synthesisObservations },
      },
      goalContext,
    });
    if (!photoIntelligence) continue;
    matched.push({
      id: `view_comparison_${view.canonicalViewId}`,
      view: poseView(view),
      pose: view.poseId,
      baselineImage: {
        sourceId: view.comparison.previousCanonicalViewId ??
          view.comparison.previousPhotoId ?? view.comparison.previousSessionId,
        date: view.comparison.previousDate,
        setId: view.comparison.previousSessionId ??
          `photo_set_${view.comparison.previousDate}`,
        view: poseView(view),
        pose: view.poseId,
        visibleRegions: photoIntelligence.observations.map((item) => item.region),
      },
      comparisonImage: {
        sourceId: view.canonicalPhotoId ?? view.canonicalViewId,
        date: session.captureDate,
        setId: session.id,
        view: poseView(view),
        pose: view.poseId,
        visibleRegions: photoIntelligence.observations.map((item) => item.region),
      },
      photoIntelligence,
    });
  }
  if (!matched.length) return null;
  const baselineDates = [...new Set(matched.map((item) =>
    item.baselineImage.date))].sort();
  const baselineSetIds = [...new Set(matched.map((item) =>
    item.baselineImage.setId))].sort();
  const compositeBaseline = baselineDates.length > 1 || baselineSetIds.length > 1;
  return createCanonicalPhotoIntelligenceSetResult({
    setId: session.id,
    baselineSet: {
      id: compositeBaseline ? `composite_prior_sets_${session.id}` :
        baselineSetIds[0] ?? `photo_set_${baselineDates[0]}`,
      date: baselineDates[0],
      dates: baselineDates,
      sourceSetIds: baselineSetIds,
      identityStatus: compositeBaseline ? "composite" : "canonical",
    },
    comparisonSet: { id: session.id, date: session.captureDate },
    goalContext,
    viewComparisons: matched,
    unmatchedViews: unmatched,
  });
}

export function matchPhotoSetViews({ baselineImages = [], comparisonImages = [] } = {}) {
  const baseline = indexImages(baselineImages);
  const comparison = indexImages(comparisonImages);
  const keys = [...new Set([...baseline.keys(), ...comparison.keys()])].sort();
  const matched = [];
  const unmatched = [];
  for (const key of keys) {
    const before = baseline.get(key) ?? [];
    const after = comparison.get(key) ?? [];
    const count = Math.min(before.length, after.length);
    for (let index = 0; index < count; index += 1) {
      matched.push({ key, baselineImage: before[index], comparisonImage: after[index] });
    }
    before.slice(count).forEach((image) => unmatched.push({
      ...image, setRole: "baseline", reason: "no_comparison_like_for_like_view",
    }));
    after.slice(count).forEach((image) => unmatched.push({
      ...image, setRole: "comparison", reason: "no_prior_like_for_like_view",
    }));
  }
  return deepFreeze({ matched, unmatched });
}

function normalizeViewComparison(item, context) {
  const baselineImage = normalizeImage(item.baselineImage, context.baselineSet);
  const comparisonImage = normalizeImage(item.comparisonImage, context.comparisonSet);
  const view = normalizeView(item.view ?? comparisonImage.view);
  const pose = normalizePose(item.pose ?? comparisonImage.pose);
  const matches = view === baselineImage.view && view === comparisonImage.view &&
    pose === baselineImage.pose && pose === comparisonImage.pose;
  if (!matches) {
    return deepFreeze({
      id: String(item.id ?? `view_comparison_${context.index + 1}`),
      view,
      pose,
      matchStatus: "excluded_pose_mismatch",
      baselineImage,
      comparisonImage,
      photoIntelligence: null,
      exclusionReason: "canonical_pi_requires_like_for_like_view_and_pose",
    });
  }
  const pi = item.photoIntelligence
    ? structuredClone(item.photoIntelligence)
    : createCanonicalPhotoIntelligenceResult({
    ...(item.photoIntelligenceInput ?? {}),
    caseId: item.photoIntelligenceInput?.caseId ??
      `${context.setId}:${view}:${pose}`,
    baselineDate: baselineImage.date,
    comparisonDate: comparisonImage.date,
    goalContext: context.goalContext,
    source: item.photoIntelligenceInput?.source ?? {
      images: [baselineImage, comparisonImage],
    },
    replayLabel: context.replayLabel,
  });
  assertPhotoOnlyViewResult(pi);
  return deepFreeze({
    id: String(item.id ?? `view_comparison_${context.index + 1}`),
    view,
    pose,
    matchStatus: "like_for_like",
    baselineImage,
    comparisonImage,
    visibleRegions: uniqueStrings([
      ...(baselineImage.visibleRegions ?? []),
      ...(comparisonImage.visibleRegions ?? []),
    ]),
    comparability: structuredClone(pi.comparability),
    observations: structuredClone(pi.observations),
    confidence: structuredClone(pi.confidence),
    photoIntelligence: pi,
  });
}

function reconcileObservations(views) {
  return views.flatMap((view) => view.photoIntelligence.observations.map((item, index) => ({
    ...structuredClone(item),
    supportingViewIds: [view.id],
    sourceObservationRefs: [`${view.id}:${index}`],
  })));
}

function deriveCrossViewCorroboration(views) {
  const groups = groupDirectionalObservations(views);
  return [...groups.entries()].flatMap(([underlyingConclusion, values]) => {
    const directions = new Map();
    values.forEach((item) => {
      const direction = observationPolarity(item.observation);
      if (!direction) return;
      if (!directions.has(direction)) directions.set(direction, new Set());
      directions.get(direction).add(item.viewId);
    });
    return [...directions.entries()].filter(([, viewIds]) => viewIds.size >= 2)
      .map(([direction, viewIds]) => ({
        underlyingConclusion,
        metric: values[0].observation.metric,
        regions: uniqueStrings(values.map((item) => item.observation.region)).sort(),
        direction,
        supportingViewIds: [...viewIds].sort(),
        confidenceEffect: "set_interpretation_strengthened",
        viewConfidenceChanged: false,
      }));
  }).sort((left, right) =>
    left.underlyingConclusion.localeCompare(right.underlyingConclusion));
}

function deriveCrossViewConflicts(views) {
  return [...groupDirectionalObservations(views).entries()]
    .flatMap(([underlyingConclusion, values]) => {
    const positive = new Set(values.filter((item) =>
      observationPolarity(item.observation) === "positive").map((item) => item.viewId));
    const negative = new Set(values.filter((item) =>
      observationPolarity(item.observation) === "negative").map((item) => item.viewId));
    if (!positive.size || !negative.size) return [];
    return [{
      underlyingConclusion,
      metric: values[0].observation.metric,
      regions: uniqueStrings(values.map((item) => item.observation.region)).sort(),
      status: "mixed_across_views",
      positiveViewIds: [...positive].sort(),
      negativeViewIds: [...negative].sort(),
      confidenceEffect: "set_interpretation_not_strengthened",
    }];
  }).sort((left, right) =>
    left.underlyingConclusion.localeCompare(right.underlyingConclusion));
}

function groupDirectionalObservations(views) {
  const groups = new Map();
  for (const view of views) {
    for (const observation of view.photoIntelligence.observations) {
      const underlyingConclusion = String(observation.underlyingConclusion ??
        `${observation.region ?? "unknown"}:${observation.metric ?? "unknown"}`)
        .toLowerCase();
      if (!groups.has(underlyingConclusion)) groups.set(underlyingConclusion, []);
      groups.get(underlyingConclusion).push({ viewId: view.id, observation });
    }
  }
  return groups;
}

function deriveSetConfidence(views, corroboration, conflicts) {
  if (!views.length) return {
    overallReliability: "insufficient",
    setInterpretationEffect: "no_like_for_like_views",
    viewConfidenceChanged: false,
  };
  const reliabilities = views.map((item) =>
    normalizeReliability(item.photoIntelligence.confidence?.overallReliability));
  const weakest = reliabilities.sort((left, right) =>
    RELIABILITY_RANK.indexOf(left) - RELIABILITY_RANK.indexOf(right))[0];
  return {
    overallReliability: weakest,
    setInterpretationEffect: conflicts.length ? "mixed_across_views" :
      corroboration.length ? "conclusion_scoped_corroboration" : "unchanged",
    viewConfidenceChanged: false,
    globallyStrengthened: false,
  };
}

function deriveSetComparability(views, unmatched) {
  if (!views.length) return {
    overall: "insufficient",
    matchedViewCount: 0,
    unmatchedViewCount: unmatched.length,
    perView: [],
  };
  const perView = views.map((item) => ({
    viewComparisonId: item.id,
    view: item.view,
    pose: item.pose,
    rating: normalizeComparability(item.photoIntelligence.comparability?.overall),
  }));
  const overall = [...perView].sort((left, right) =>
    COMPARABILITY_RANK.indexOf(left.rating) -
    COMPARABILITY_RANK.indexOf(right.rating))[0].rating;
  return {
    overall,
    matchedViewCount: views.length,
    unmatchedViewCount: unmatched.length,
    perView,
  };
}

function deriveSetGoalInterpretation(views, goalContext) {
  const values = views.map((item) =>
    item.photoIntelligence.goalRelativeInterpretation).filter(Boolean);
  if (!values.length) return null;
  const decisive = values.map((item) => item.direction).filter((direction) =>
    !["uncertain", "neutral"].includes(direction));
  const directions = new Set(decisive);
  const direction = directions.size > 1 ? "mixed" :
    directions.size === 1 ? [...directions][0] : "uncertain";
  const supportingViewCount = values.filter((item) =>
    item.direction === "supportive").length;
  const representative = values.find((item) => item.direction === direction) ?? values[0];
  return {
    direction,
    strength: direction === "supportive" && supportingViewCount > 1
      ? "cross_view_visual_support" : representative.strength,
    interpretation: values.map((item) => item.interpretation).filter(Boolean).join(" "),
    photoOnlyStrategyImplication: direction === "supportive"
      ? "The reconciled photo set supports the Goal direction, but does not establish a strategy change without independent evidence."
      : direction === "mixed"
        ? "The views are mixed; the photo set does not support a directional strategy conclusion."
        : representative.photoOnlyStrategyImplication,
    goalContext: goalContext ? structuredClone(goalContext) : null,
  };
}

function buildSetPhotoBriefingCopy(views, conflicts = []) {
  if (!views.length) return "No like-for-like photo views were available for comparison.";
  if (views.length === 1) return views[0].photoIntelligence.exactPhotoBriefingCopy;
  const labels = [...new Set(views.map((item) => item.view))];
  const viewText = labels.length === 2 ? `${labels[0]} and ${labels[1]}` :
    `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
  if (conflicts.length) {
    const topics = conflicts.map((item) => {
      const regions = item.regions?.length ? item.regions.join("/") : "the visible region";
      return `${regions.replace(/_/g, " ")} ${String(item.metric).replace(/_/g, " ")}`;
    }).join(" and ");
    return `The matched ${viewText} views give a mixed picture for ${topics}. ` +
      "One view moves in a positive direction while another moves the other way, so the photos do not support a single overall call for that change.";
  }
  const observations = views.flatMap((view) =>
    view.photoIntelligence.observations.map((item) => ({ ...item, view: view.view })))
    .filter((item) => item.observation && observationPolarity(item))
    .sort((left, right) => observationPriority(right) - observationPriority(left));
  const selected = [];
  const seen = new Set();
  for (const item of observations) {
    const key = `${item.view}:${item.region}`;
    if (seen.has(key)) continue;
    selected.push(item.observation);
    seen.add(key);
    if (selected.length === 3) break;
  }
  if (!selected.length) {
    const stories = views.map((view) => view.photoIntelligence.dominantVisualStory)
      .filter(Boolean);
    return stories.length
      ? `Across the matched ${viewText} views, ${stories.join(" ")}`
      : `The matched ${viewText} views do not show a reliable directional change.`;
  }
  return `Across the matched ${viewText} views, ${selected.join(" ")}`.trim();
}

function observationPriority(item) {
  return MAGNITUDE_RANK.indexOf(item.apparentMagnitude) * 10 +
    RELIABILITY_RANK.indexOf(normalizeReliability(item.confidence));
}

function indexImages(images) {
  const index = new Map();
  for (const image of images) {
    const normalized = normalizeImage(image, {
      id: image.setId ?? "unknown_set", date: image.date,
    });
    const key = `${normalized.view}:${normalized.pose}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(normalized);
  }
  return index;
}

function normalizeImage(image = {}, set = {}) {
  return {
    sourceId: String(image.sourceId ?? image.id ?? ""),
    setId: String(image.setId ?? set.id ?? ""),
    date: String(image.date ?? set.date ?? ""),
    view: normalizeView(image.view),
    pose: normalizePose(image.pose ?? image.poseId),
    visibleRegions: uniqueStrings(image.visibleRegions),
    mimeType: image.mimeType ?? null,
    pixelWidth: image.pixelWidth ?? null,
    pixelHeight: image.pixelHeight ?? null,
    provenance: image.provenance ?? null,
  };
}

function normalizeSet(set) {
  return {
    id: String(set.id),
    date: String(set.date),
    dates: uniqueStrings(set.dates?.length ? set.dates : [set.date]),
    sourceSetIds: uniqueStrings(set.sourceSetIds?.length ? set.sourceSetIds : [set.id]),
    identityStatus: set.identityStatus === "composite" ? "composite" : "canonical",
    cadenceContext: set.cadenceContext ?? null,
  };
}

function assertPhotoOnlyViewResult(result) {
  if (result?.schemaVersion !== "canonical_photo_intelligence_v1" ||
      result?.provenance?.producer !== "canonical_photo_intelligence_service" ||
      result?.provenance?.evidenceClass !== "photo_only" ||
      result?.provenance?.nonPhotoEvidenceUsed !== false) {
    throw new Error(
      "Canonical Photo Intelligence set requires a verified photo-only canonical view result."
    );
  }
  const forbiddenEvidenceKeys = new Set([
    "dexa", "weightEvidence", "trainingEvidence", "nutritionEvidence",
    "activityEvidence", "sleepEvidence", "measuredEvidence",
    "independentEvidence", "holisticSynthesis",
  ]);
  const pending = [result];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object") continue;
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenEvidenceKeys.has(key)) {
        throw new Error(
          "Canonical Photo Intelligence set rejects non-photo evidence in a supplied view result."
        );
      }
      pending.push(child);
    }
  }
}

function normalizeUnmatchedView(item = {}) {
  return {
    setRole: item.setRole === "baseline" ? "baseline" : "comparison",
    sourceId: String(item.sourceId ?? ""),
    setId: String(item.setId ?? ""),
    date: String(item.date ?? ""),
    view: normalizeView(item.view),
    pose: normalizePose(item.pose),
    visibleRegions: uniqueStrings(item.visibleRegions),
    mimeType: item.mimeType ?? null,
    pixelWidth: item.pixelWidth ?? null,
    pixelHeight: item.pixelHeight ?? null,
    provenance: item.provenance ?? null,
    status: "not_compared",
    reason: String(item.reason ?? "no_like_for_like_view"),
    interpretedAsNoChange: false,
  };
}

function strongestMagnitude(values) {
  return [...values].sort((left, right) =>
    MAGNITUDE_RANK.indexOf(right) - MAGNITUDE_RANK.indexOf(left))[0] ?? "unknown";
}

function observationPolarity(item) {
  const direction = String(item?.direction ?? "").toLowerCase();
  if (direction === "improved") return "positive";
  if (direction === "worsened") return "negative";
  const inverse = /softness|fatness|waist_(?:size|width)|abdominal_projection/.test(
    String(item?.metric ?? "").toLowerCase()
  );
  if (direction === "increased") return inverse ? "negative" : "positive";
  if (["decreased", "reduced"].includes(direction)) return inverse ? "positive" : "negative";
  return null;
}

function poseView(view = {}) {
  return normalizeView(view.pose?.view ?? view.view ?? view.poseId);
}

function normalizeView(value) {
  const text = String(value ?? "unknown").toLowerCase();
  if (/back|rear/.test(text)) return "back";
  if (/front/.test(text)) return "front";
  if (/side|profile/.test(text)) return "side";
  return text || "unknown";
}

function normalizePose(value) {
  const text = String(value ?? "unknown").toLowerCase().replace(/_/g, "-");
  return text || "unknown";
}

function normalizeReliability(value) {
  const normalized = String(value ?? "insufficient").toLowerCase().replace(/-/g, "_");
  return RELIABILITY_RANK.includes(normalized) ? normalized : "insufficient";
}

function normalizeComparability(value) {
  const normalized = String(value ?? "insufficient").toLowerCase().replace(/-/g, "_");
  return COMPARABILITY_RANK.includes(normalized) ? normalized : "insufficient";
}

function requireSet(set, label) {
  if (!set?.id || !/^\d{4}-\d{2}-\d{2}$/.test(String(set.date ?? ""))) {
    throw new Error(`Canonical Photo Intelligence set requires ${label} id and date.`);
  }
}

function dayDifference(start, end) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) -
    Date.parse(`${start}T00:00:00Z`)) / 86400000);
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
