export const PI_DECISION_SEMANTIC_VERSION = "pi_decision_semantics_v1";

export const PI_DECISION_POLICY = Object.freeze({
  maintain_current_plan: Object.freeze({
    requiresGoal: true,
    requiresPhase: true,
    minimumConfidence: "moderate",
    completeness: "complete",
    disqualifyingConflicts: true,
    eventRule: "routine_events_suppress",
    cadences: Object.freeze(["daily", "midweek", "weekly"]),
    renderingConcept: "evidence_supports_current_plan",
    prohibitedInference: "no_plan_change_or_maintenance_calorie_conclusion",
  }),
  continue_observing: Object.freeze({
    requiresGoal: false,
    requiresPhase: false,
    minimumConfidence: "low",
    completeness: "partial_or_better",
    disqualifyingConflicts: false,
    eventRule: "supporting_only",
    cadences: Object.freeze(["daily", "midweek", "weekly"]),
    renderingConcept: "signal_requires_more_observation",
    prohibitedInference: "no_action_from_provisional_signal",
  }),
  insufficient_evidence_for_change: Object.freeze({
    requiresGoal: false,
    requiresPhase: false,
    minimumConfidence: "unevaluated",
    completeness: "missing_or_partial",
    disqualifyingConflicts: false,
    eventRule: "supporting_only",
    cadences: Object.freeze(["daily", "midweek", "weekly"]),
    renderingConcept: "evidence_does_not_justify_change",
    prohibitedInference: "missing_evidence_is_not_plan_support",
  }),
  review_energy_support: reviewPolicy("energy"),
  review_training_status: reviewPolicy("training"),
  review_recovery_status: reviewPolicy("recovery"),
  review_body_fat_guardrail: reviewPolicy("body_fat_guardrail"),
  conflicting_evidence_continue_observing: Object.freeze({
    requiresGoal: false,
    requiresPhase: false,
    minimumConfidence: "low",
    completeness: "partial_or_better",
    disqualifyingConflicts: false,
    eventRule: "routine_events_suppress",
    cadences: Object.freeze(["daily", "midweek", "weekly"]),
    renderingConcept: "conflict_requires_observation",
    prohibitedInference: "no_forced_causal_explanation",
  }),
});

function reviewPolicy(domain) {
  return Object.freeze({
    requiresGoal: true,
    requiresPhase: false,
    requiredDomain: domain,
    minimumConfidence: "moderate",
    minimumLifecycle: "new_or_material",
    completeness: "domain_complete",
    disqualifyingConflicts: true,
    eventRule: "routine_events_suppress",
    cadences: Object.freeze(["midweek", "weekly"]),
    renderingConcept: `review_${domain}_without_prescription`,
    prohibitedInference: "no_exact_action_diagnosis_or_causality",
  });
}
