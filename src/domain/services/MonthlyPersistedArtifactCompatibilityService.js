const LEGACY_CONFIDENCE_SOURCE = "canonical_pi_snapshot";
const LEGACY_CONFIDENCE_MODEL = "pi_goal_confidence_assessment_v1";

export function projectPersistedMonthlyPresentationForRendering(presentation) {
  const confidence = presentation?.hero?.confidence;
  if (!requiresLegacyConfidenceProjection(confidence)) return presentation;

  return {
    ...presentation,
    hero: {
      ...presentation.hero,
      confidence: {
        ...confidence,
        presentationExplanation: confidence.primaryReason,
      },
    },
  };
}

function requiresLegacyConfidenceProjection(confidence) {
  if (confidence?.source !== LEGACY_CONFIDENCE_SOURCE ||
      confidence?.modelVersion !== LEGACY_CONFIDENCE_MODEL) return false;

  const primaryReason = normalize(confidence.primaryReason);
  const presentationExplanation = normalize(confidence.presentationExplanation);
  return Boolean(
    primaryReason &&
    presentationExplanation &&
    primaryReason !== presentationExplanation
  );
}

function normalize(value) {
  return typeof value === "string" ? value.trim() : "";
}
