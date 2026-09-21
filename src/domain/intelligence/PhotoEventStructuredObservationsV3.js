// V3 photo-observation contract derived from the structured photo intelligence
// the Photo Event already produces (pose interpretations with matched prior
// views). The V3 photo adapter reads `structured_observations`; production
// photo narratives never carried that key, so photo evidence never reached V3.
// This derives it, read-only, from existing structured fields. It does not
// alter the stored narrative, media, analysis, or any accepted Photo output.

export const PHOTO_EVENT_STRUCTURED_OBSERVATIONS_VERSION = "photo_event_structured_observations_v1";

export function derivePhotoStructuredObservationsV3(narrative = {}) {
  const poses = Array.isArray(narrative?.poseInterpretations) ? narrative.poseInterpretations : [];
  const structured = poses.flatMap((pose) => {
    const observations = (pose.observations ?? []).filter((item) => typeof item === "string" && item.trim());
    if (!observations.length) return [];
    const comparable = pose.priorMatchFound === true && pose.comparisonMode === "historical_comparison";
    const baseline = pose.establishesBaseline === true;
    if (!comparable && !baseline) return [];
    const poseId = pose.poseIdentity?.poseId ?? "unknown_pose";
    return [{
      metric: poseId,
      // Qualitative observation; direction is not inferred from prose.
      direction: "observed",
      magnitude: pose.confidence === "high" ? "clear" : "modest",
      comparability: comparable ? "comparable" : "baseline",
      comparable,
      factualSummary: observations.slice(0, 2).join(" "),
      observationCount: observations.length,
      goalRelevance: pose.goalRelevance ?? null,
      contributesToGoalValidation: pose.contributesToGoalValidation === true,
      limitations: [...(pose.limitingFactors ?? [])],
    }];
  });
  const comparable = structured.some((item) => item.comparable);
  return {
    schemaVersion: PHOTO_EVENT_STRUCTURED_OBSERVATIONS_VERSION,
    structured_observations: structured,
    comparison_metadata: { comparable, poseCount: structured.length },
    limitations: [...(narrative.conditionLimitations ?? [])].filter((item) => typeof item === "string"),
  };
}

// The interpretation handed to the V3 photo adapter: the stored narrative plus
// its derived structured observations (never persisted).
export function withStructuredPhotoObservationsV3(narrative = {}) {
  const derived = derivePhotoStructuredObservationsV3(narrative);
  return { ...narrative, ...derived };
}
