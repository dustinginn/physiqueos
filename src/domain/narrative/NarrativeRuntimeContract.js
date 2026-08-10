export const NARRATIVE_ASSESSMENT_VERSION =
  "narrative_assessment_v2_shadow_v1";
export const NARRATIVE_ENGINE_VERSION = "narrative_engine_v2_shadow_v2";
export const NARRATIVE_PRODUCTION_ENGINE_VERSION =
  "narrative_engine_v2_production_v2";

export const CoachingDirection = enumValues([
  "stay_the_course",
  "continue_calibration",
  "monitor_closely",
  "prepare_adjustment",
  "strategy_review_recommended",
]);

export const NarrativeTranslationStatus = enumValues([
  "translated", "partially_translated", "unknown",
]);

function enumValues(values) {
  return Object.freeze(Object.fromEntries(values.map((value) => [
    value.toUpperCase(), value,
  ])));
}

export function enumSet(value) {
  return new Set(Object.values(value));
}
