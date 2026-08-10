export const STRUCTURED_INTERPRETATION_VERSION =
  "structured_interpretation_v2_shadow_v1";
export const INTERPRETATION_ENGINE_VERSION =
  "interpretation_engine_v2_shadow_v2";

export const ObjectiveStatus = enumValues([
  "ahead", "on_track", "uncertain", "behind", "contradicted",
]);
export const GuardrailStatus = enumValues([
  "clear", "watch", "pressured", "violated",
]);
export const StrategyValidationStatus = enumValues([
  "confirmed", "directionally_supported", "still_calibrating", "mixed",
  "contradicted",
]);
export const EvidenceAgreementStatus = enumValues([
  "strong_convergence", "moderate_convergence", "mixed", "conflicting",
  "insufficient",
]);
export const EvidenceStrength = enumValues([
  "authoritative", "high", "moderate", "low", "insufficient",
]);
export const EvidenceRelevance = enumValues([
  "decisive", "material", "supporting_context", "not_applicable", "unknown",
]);
export const EvidenceAgreement = enumValues([
  "supports", "contradicts", "neutral", "indeterminate",
]);
export const EvidenceQualityStatus = enumValues([
  "robust", "adequate", "limited", "insufficient",
]);

function enumValues(values) {
  return Object.freeze(Object.fromEntries(values.map((value) => [
    value.toUpperCase(), value,
  ])));
}

export function enumSet(value) {
  return new Set(Object.values(value));
}
