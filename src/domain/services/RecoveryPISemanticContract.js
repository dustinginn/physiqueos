export const RECOVERY_PI_SEMANTIC_VERSION = "recovery_pi_semantics_v1";

export const RECOVERY_PI_THRESHOLDS = Object.freeze({
  daily: Object.freeze({ minimumCurrentDates: 1, normalConfidenceDates: 1 }),
  midweek: Object.freeze({ minimumCurrentDates: 2, normalConfidenceDates: 2 }),
  weekly: Object.freeze({ minimumCurrentDates: 2, normalConfidenceDates: 3 }),
});

export const RECOVERY_PI_METRICS = Object.freeze({
  sleep_duration: Object.freeze({
    values: "numeric_hours_0_to_24",
    orderedScale: null,
    improvingDirection: "rising",
    strainedDirection: "falling",
    requiresComparisonForDirection: true,
    confidenceCeiling: "moderate",
  }),
  subjective_recovery: Object.freeze({
    values: Object.freeze(["poor", "below_average", "average", "good", "excellent"]),
    orderedScale: Object.freeze(["poor", "below_average", "average", "good", "excellent"]),
    improvingDirection: "rising",
    strainedDirection: "falling",
    requiresComparisonForDirection: true,
    confidenceCeiling: "moderate",
  }),
  soreness: Object.freeze({
    values: Object.freeze(["none", "mild", "moderate", "high", "severe"]),
    orderedScale: Object.freeze(["none", "mild", "moderate", "high", "severe"]),
    improvingDirection: "falling",
    strainedDirection: "rising",
    requiresComparisonForDirection: true,
    confidenceCeiling: "moderate",
  }),
});

export const RECOVERY_PI_RELATIONSHIPS = Object.freeze({
  training: Object.freeze([
    "training_progress_with_stable_recovery",
    "training_progress_with_improving_recovery",
    "training_progress_despite_strained_recovery",
    "training_stability_with_strained_recovery",
    "training_decline_with_strained_recovery",
    "training_decline_despite_stable_recovery",
    "training_volume_growth_with_stable_recovery",
    "training_volume_growth_with_declining_recovery",
    "training_recovery_relationship_insufficient",
  ]),
  energy: Object.freeze([
    "recovery_stability_with_positive_energy_support",
    "recovery_stability_with_neutral_energy_support",
    "recovery_strain_with_negative_energy_balance",
    "recovery_strain_despite_positive_energy_support",
    "recovery_improvement_despite_negative_energy_balance",
    "recovery_energy_relationship_insufficient",
  ]),
});
