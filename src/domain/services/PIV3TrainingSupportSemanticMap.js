export const PI_V3_TRAINING_SUPPORT_SEMANTIC_MAP_VERSION =
  "pi_v3_training_support_semantic_map_v1";

export const PI_V3_TRAINING_SUPPORT_SEMANTIC_MAP = Object.freeze([
  map("daily", "training_performance", "energy_balance", "training_energy", "same_day", "complete_or_partial_paired_energy"),
  map("midweek", "training_performance", "energy_balance", "training_energy", "exact_window", "at_least_one_complete_paired_day"),
  map("weekly", "training_performance", "energy_balance", "training_energy", "exact_window", "at_least_one_complete_paired_day"),
  map("daily", "training_performance", "protein_target_status", "nutrition_training", "same_day", "canonical_nutrition_day"),
  map("midweek", "training_performance", "protein_target_consistency", "nutrition_training", "exact_window", "two_eligible_nutrition_days"),
  map("weekly", "training_performance", "protein_target_consistency", "nutrition_training", "exact_window", "two_eligible_nutrition_days"),
]);

function map(cadence, trainingKind, supportKind, relationshipFamily, windowRule, minimumCompleteness) {
  return Object.freeze({
    cadence,
    trainingKind,
    supportKind,
    relationshipFamily,
    windowRule,
    neutralInterpretation: "contemporaneous_non_causal_relationship",
    minimumCompleteness,
    confidenceCeiling: "weaker_participant",
    goalRole: "goal_context_resolved_downstream",
    insufficiencyCondition: "missing_incompatible_or_structurally_insufficient_participant",
    overlapRisk: relationshipFamily === "training_energy"
      ? ["direct_training", "weight_energy"]
      : ["direct_training", "training_energy"],
  });
}
