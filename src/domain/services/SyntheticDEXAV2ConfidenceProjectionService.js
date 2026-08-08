export const SYNTHETIC_DEXA_V2_CONFIDENCE_PROJECTION_VERSION =
  "synthetic_dexa_v2_confidence_projection_v1";

const SYNTHETIC_CURRENT = 58;
const SYNTHETIC_PRIOR = 50;

export function projectSyntheticDEXAV2Confidence({
  forecastAssessment,
  narrativeAssessment,
  previousForecastContext,
} = {}) {
  if (forecastAssessment?.forecastMetadata?.shadowOnly !== true ||
      narrativeAssessment?.provenance?.shadowOnly !== true) {
    throw new Error("Synthetic numeric confidence projection is preview-only.");
  }
  if (forecastAssessment.confidenceBand !== "moderate" ||
      forecastAssessment.movement?.direction !== "increase") {
    throw new Error("Synthetic confidence projection no longer matches the canonical Forecast.");
  }
  if (previousForecastContext?.confidenceBand !== "developing") {
    throw new Error("Synthetic confidence projection requires the accepted Developing prior Forecast.");
  }
  if (narrativeAssessment.forecastRef !== forecastAssessment.id) {
    throw new Error("Synthetic confidence projection requires canonical Narrative lineage.");
  }
  return deepFreeze({
    schemaVersion: SYNTHETIC_DEXA_V2_CONFIDENCE_PROJECTION_VERSION,
    previewOnly: true,
    persisted: false,
    published: false,
    calibrationAuthority: false,
    score: SYNTHETIC_CURRENT,
    priorScore: SYNTHETIC_PRIOR,
    delta: SYNTHETIC_CURRENT - SYNTHETIC_PRIOR,
    band: forecastAssessment.confidenceBand,
    movementDirection: "increased",
    movementMagnitude: "material",
    presentationExplanation: narrativeAssessment.confidenceExplanation.text,
    forecastRef: forecastAssessment.id,
    narrativeRef: narrativeAssessment.id,
    rationale: "upper_moderate_after_first_objective_validation_with_pace_and_durability_uncertainty",
  });
}

function deepFreeze(value) {
  Object.values(value).forEach((child) => {
    if (child && typeof child === "object" && !Object.isFrozen(child)) deepFreeze(child);
  });
  return Object.freeze(value);
}
