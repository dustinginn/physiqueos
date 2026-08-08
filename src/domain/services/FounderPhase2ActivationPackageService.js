import { createPhaseStrategy } from "../models/phaseStrategy";
import { createPhaseExpectedTrajectory } from "../models/phaseExpectedTrajectory";

export const FOUNDER_PHASE_2_ACTIVATION_PACKAGE_VERSION =
  "founder_lean_mass_phase_2_activation_package_v1";

export function createFounderPhase2ActivationPackageDrafts({
  store, goal, phase, createdAt = "2026-08-02T12:00:00.000Z",
} = {}) {
  validateCanonicalInputs(goal, phase);
  const transition = (store?.goalTransitionDrafts ?? []).find((item) =>
    item.status === "applied" && item.primaryObjective?.id === goal.id);
  if (!transition) throw incomplete("applied_goal_transition_required");
  const protocolTransition = (store?.goalProtocolTransitionDrafts ?? []).find((item) =>
    item.status === "applied" && item.id.endsWith(transition.id));
  if (!protocolTransition) throw incomplete("applied_protocol_transition_required");
  const acceptedGuardrail = transition.guardrails?.find((item) => item.accepted === true &&
    /body fat/i.test(item.text ?? ""));
  if (!acceptedGuardrail || !/8\s*[–—-]\s*9\s*%/u.test(acceptedGuardrail.text)) {
    throw incomplete("accepted_body_fat_guardrail_required");
  }
  const reviews = protocolTransition.protocolReviews ?? protocolTransition.reviews ?? [];
  const retained = (category) => reviews.filter((item) => item.category === category &&
    item.reviewStatus === "accepted" && item.intendedDisposition === "keep")
    .map((item) => item.sourceProtocolId).filter(Boolean).sort();
  const strategyId = `phase_strategy|${goal.id}|${phase.id}|v1`;
  const trajectoryId = `phase_expected_trajectory|${goal.id}|${phase.id}|v1`;
  const transitionLine = (field, path, classification = "accepted_goal_transition") => ({
    field, sourceType: "goal_transition_draft", sourceId: transition.id,
    sourceRevision: transition.draftVersion ?? null, path, classification,
  });
  const protocolLine = (field, path) => ({
    field, sourceType: "goal_protocol_transition_draft", sourceId: protocolTransition.id,
    sourceRevision: protocolTransition.draftVersion ?? null, path,
    classification: "accepted_and_applied_protocol_transition",
  });
  const goalLine = (field, path) => ({
    field, sourceType: "canonical_goal", sourceId: goal.id,
    sourceRevision: goal.revision ?? null, path, classification: "canonical_active_goal",
  });
  const requirementLine = (field, path) => ({
    field, sourceType: "phase_activation_requirement",
    sourceId: FOUNDER_PHASE_2_ACTIVATION_PACKAGE_VERSION,
    sourceRevision: "1", path, classification: "explicit_activation_contract",
  });

  const strategy = createPhaseStrategy({
    strategyId, goalId: goal.id, phaseId: phase.id, revision: 0, status: "draft", createdAt,
    sourceLineage: [
      goalLine("purpose", "target"),
      transitionLine("domains.energy", "operatingState"),
      protocolLine("domains.energy", "protocolReviews[category=energy].proposedChanges"),
      protocolLine("domains.nutrition", "protocolReviews[category=nutrition].proposedChanges"),
      transitionLine("domains.training", "evidenceStrategy.predictiveSignals"),
      protocolLine("domains.training", "protocolReviews[category=training]"),
      protocolLine("domains.activity", "protocolReviews[category=activity].proposedChanges"),
      protocolLine("domains.recovery", "protocolReviews[category=recovery]"),
      transitionLine("domains.coaching", "briefingCadence"),
      requirementLine("domains.coaching", "requiredCadenceTypes"),
      protocolLine("domains.peptides", "protocolReviews[category=peptide]"),
      protocolLine("domains.supplements", "protocolReviews[category=supplement]"),
      transitionLine("domains.guardrailResponse", "guardrails[body_fat]"),
      transitionLine("strategyHypothesis", "evidenceStrategy"),
      goalLine("strategyHypothesis", "target"),
    ],
    purpose: {
      supportLeanMassGain: true,
      protectBodyFatGuardrail: true,
      avoidUnnecessarilyAggressiveSurplus: true,
      preserveGoalRunway: true,
    },
    domains: {
      energy: {
        intent: "move_from_maintenance_calibration_to_controlled_surplus_when_supported",
        adjustmentLogic: "make_small_reversible_changes_from_weight_dexa_photo_training_and_body_fat_pressure",
        fixedCaloriePrescription: false,
        reviewSignals: ["weight_trend", "dexa_composition", "qualifying_photo_change",
          "multi_session_training_response", "body_fat_pressure"],
        confidencePolicy: "daily_evidence_is_context_not_a_direct_confidence_trigger",
      },
      nutrition: {
        proteinTargetBasis: "approximately_one_gram_per_pound_of_body_weight",
        energySupport: "sufficient_energy_and_carbohydrate_for_training_and_recovery",
        intakeFlexibility: "daily_variation_is_interpreted_within_the_weekly_strategy",
        evidenceOwnership: "meal_logging_and_screenshots_remain_evidence_and_execution_owned",
      },
      training: {
        intent: "continue_progressive_overload",
        priorityRule: "prioritize_only_muscle_groups_selected_by_the_active_goal",
        interpretationRule: "multi_session_progression_is_supporting_evidence_not_proof_of_lean_mass_gain",
        executionBoundary: "exercise_selection_and_session_structure_remain_execution_owned",
        retainedProtocolRefs: retained("training"),
      },
      activity: {
        intent: "retain_health_and_body_fat_control_without_undermining_lean_mass_gain",
        interpretationWindow: "weekly",
        adjustmentLogic: "reduce_expenditure_pressure_slightly_when_weight_training_or_recovery_indicates_underfueling",
      },
      recovery: {
        intent: "maintain_recovery_capacity_that_supports_adaptation",
        interpretationRule: "recovery_context_can_explain_response_but_completion_does_not_prove_outcome",
        retainedProtocolRefs: retained("recovery"),
        executionBoundary: "recovery_protocol_details_remain_execution_owned",
      },
      coaching: {
        cadenceTypes: ["midweek", "weekly", "monthly", "dexa_event", "qualifying_photo_event"],
        twiceWeeklyAnchor: ["wednesday", "sunday"],
        confidencePolicy: "confidence_v2_changes_only_through_authorized_briefing_publication",
      },
      peptides: {
        intent: "preserve_existing_accepted_protocol_strategy_without_new_claims",
        retainedProtocolRefs: retained("peptide"),
        executionBoundary: "administration_details_and_completion_remain_execution_owned",
      },
      supplements: {
        intent: "preserve_existing_accepted_protocol_strategy_without_new_claims",
        retainedProtocolRefs: retained("supplement"),
        executionBoundary: "administration_details_and_completion_remain_execution_owned",
      },
      guardrailResponse: {
        acceptedBodyFatRange: { min: 8, max: 9, unit: "percent", approximate: true },
        reviewTriggers: ["rising_body_fat", "increasing_visible_softness",
          "unfavorable_lean_to_fat_outcome"],
        responseRule: "recommend_evidence_based_strategy_review",
        automaticCutAllowed: false,
        majorChangeRequiresUserAuthorization: true,
      },
    },
    strategyHypothesis: {
      hypothesisId: `strategy_hypothesis|${strategyId}`,
      strategyRef: { strategyId, strategyVersion: "1" },
      statement: "controlled_surplus_with_progressive_training_and_recovery_supports_measurable_lean_mass_gain_while_guardrails_remain_independent",
      assumptions: ["maintenance_calibration_is_sufficient_to_support_a_controlled_transition",
        "execution_exposure_is_adequate_for_interpretation"],
      expectedResponses: [
        { responseId: "gradual_upward_weight_movement" },
        { responseId: "multi_session_training_progression" },
        { responseId: "repeat_validated_lean_mass_progress" },
      ],
      validationConditions: ["repeat_dexa_comparison", "qualifying_photo_context",
        "weight_and_training_trend_agreement"],
      falsificationConditions: ["sustained_broad_training_stagnation_with_adequate_exposure",
        "guardrail_pressure_without_favorable_lean_to_fat_response"],
      expectedValidationTimeline: { startRule: "actual_phase_activation",
        targetDate: goal.timeline?.targetDate ?? goal.target?.targetDate },
      requiredExecutionExposure: "sufficient_phase_2_exposure_before_outcome_interpretation",
    },
  });

  const targetDate = goal.timeline?.targetDate ?? goal.target?.targetDate;
  const objectiveRef = `objective|${goal.id}|lean_mass`;
  const range = (suffix, startBoundary, endBoundary, max) => ({
    segmentId: `${trajectoryId}|${suffix}`, startBoundary, endBoundary,
    measurableChangeExpectation: "uncertain_expected_range",
    expectedObjectiveRanges: [{ expectationId: `${trajectoryId}|${suffix}|lean_mass`,
      objectiveRef, min: 0, max, unit: "lb", fullTargetIsPromise: false }],
  });
  const trajectory = createPhaseExpectedTrajectory({
    trajectoryId, goalId: goal.id, phaseId: phase.id, revision: 0, status: "draft", createdAt,
    sourceLineage: [
      goalLine("timeline", "timeline.targetDate"),
      requirementLine("timeline", "projectedActivationSemantics"),
      goalLine("objectiveTrajectory", "target"),
      transitionLine("objectiveTrajectory", "evidenceStrategy.outcomeMeasures"),
      transitionLine("guardrailTrajectory", "guardrails"),
      transitionLine("weightTrajectory", "guardrails[gradual_gain]"),
      transitionLine("weightTrajectory", "evidenceStrategy.predictiveSignals[scale_weight]"),
      transitionLine("trainingTrajectory", "evidenceStrategy.predictiveSignals"),
      transitionLine("milestones", "briefingCadence"),
      protocolLine("milestones", "protocolReviews[category=dexa|photos|briefings]"),
      requirementLine("milestones", "requiredEvidenceMilestones"),
      goalLine("expectedTrajectory", "target"),
    ],
    timeline: {
      projectedStartRule: "first_full_execution_day_after_authorized_phase_1_completion",
      projectedStart: phase.projectedNextPhaseStart ?? "2026-08-16",
      goalTargetDate: targetDate,
      elapsedWindowRule: "derive_from_actual_activation_date",
      remainingWindowRule: "derive_from_actual_activation_date_to_goal_target",
      preActivationEvidenceOwnership: "none",
    },
    objectiveTrajectory: {
      direction: "gradual_lean_mass_gain", partialProgressHasValue: true,
      goalTargetAmount: goal.target.amount, goalTargetUnit: goal.target.unit,
      fullTargetIsPromise: false, repeatValidationRequired: true,
      earlyDEXAInterpretation: "short_term_movement_is_not_automatically_permanent_muscle",
      rangeDerivation: "zero_to_elapsed_goal_fraction_ceiling_with_full_target_cap",
    },
    guardrailTrajectory: {
      acceptedRange: { min: 8, max: 9, unit: "percent", approximate: true },
      independentFromObjective: true,
      pressureSignals: ["increasing_softness", "accelerating_fat_gain"],
      objectiveProgressCancelsPressure: false,
      interruptedBuildConsequence: "future_cut_reduces_remaining_goal_runway",
    },
    weightTrajectory: {
      direction: "deliberate_controlled_upward_movement", universalWeeklyRate: null,
      accelerationWarning: "review_energy_and_composition_pressure",
      stagnationWarning: "review_exposure_energy_training_and_recovery_before_adjustment",
      volatilityWarning: "seek_repeat_trend_before_strategy_change",
    },
    trainingTrajectory: {
      expectation: "priority_movements_generally_improve_over_time",
      isolatedRegressionInvalidatesStrategy: false,
      plateauInvalidatesStrategy: false,
      sustainedBroadStagnationResponse: "may_reduce_confidence_and_trigger_strategy_review",
    },
    milestones: milestones({ trajectoryId, goalId: goal.id, targetDate }),
    expectedTrajectory: { segments: [
      range("early", "actual_activation", "2026-09-15", 4),
      range("validation", "2026-09-16", "2026-10-15", 8),
      range("final", "2026-10-16", targetDate, Number(goal.target.amount)),
    ] },
  });
  return Object.freeze({ version: FOUNDER_PHASE_2_ACTIVATION_PACKAGE_VERSION,
    sourceGoalTransitionId: transition.id, sourceProtocolTransitionId: protocolTransition.id,
    strategy, trajectory });
}

function milestones({ trajectoryId, goalId, targetDate }) {
  const item = (type, expectedTiming, purpose, expectedEvidence, uncertaintyReduced,
    canTriggerStrategyReview, canSupportCompletion) => ({
    milestoneId: `${trajectoryId}|milestone|${type}`, type, expectedTiming, purpose,
    expectedEvidence, uncertaintyReduced, canTriggerStrategyReview, canSupportCompletion,
  });
  return [
    item("phase_starting_forecast", { mode: "on_activation" },
      "initialize_phase_specific_confidence_without_phase_2_outcome_evidence",
      ["accepted_strategy", "accepted_expected_trajectory", "prior_history_references"],
      ["starting_prior_for_phase_2"], false, false),
    item("first_phase_cadence_review", { mode: "first_midweek_or_weekly_after_activation" },
      "assess_initial_execution_and_response_context",
      ["weight_trend", "training_trend", "nutrition_and_recovery_context"],
      ["early_execution_adequacy"], true, false),
    item("first_post_transition_photo_event", { mode: "next_qualifying_scheduled_event_after_activation" },
      "add_visual_body_composition_context",
      ["comparable_progress_photo_interpretation"], ["visible_softness_and_shape_change"], true, false),
    item("objective_comparison", { mode: "window", earliest: "2026-09-01", latest: "2026-09-30",
      fallback: "next_consistently_prepared_objective_comparison" },
      "repeat_objective_body_composition_measurement",
      ["dexa_lean_mass", "dexa_fat_mass", "dexa_body_fat"],
      ["lean_mass_change", "fat_gain_pressure", "measurement_repeatability"], true, false),
    item("mid_phase_review", { mode: "derived", rule: "midpoint_of_actual_activation_and_target" },
      "review_strategy_response_and_remaining_goal_runway",
      ["objective_if_available", "weight", "photos", "training", "recovery"],
      ["trajectory_feasibility", "strategy_response"], true, false),
    item("final_goal_assessment", { mode: "window", earliest: "2026-10-24", latest: targetDate },
      "assess_goal_objective_and_independent_guardrails",
      ["prepared_objective_comparison", "guardrail_evidence", "supporting_trends"],
      ["goal_completion_status"], true, true),
  ];
}
function validateCanonicalInputs(goal, phase) {
  if (!goal?.id || goal.status !== "active" || goal.primary !== true ||
      goal.target?.metric !== "lean_mass" || goal.target?.direction !== "increase" ||
      Number(goal.target?.amount) !== 10 ||
      (goal.timeline?.targetDate ?? goal.target?.targetDate) !== "2026-10-31") {
    throw incomplete("canonical_build_lean_mass_goal_required");
  }
  if (!phase?.id || phase.goalId && phase.goalId !== goal.id ||
      !["planned", "upcoming"].includes(phase.status)) {
    throw incomplete("canonical_planned_phase_2_required");
  }
}
function incomplete(code) { const error = new Error(`Founder Phase 2 activation package incomplete: ${code}.`);
  error.code = `FOUNDER_PHASE_2_${code.toUpperCase()}`; return error; }
