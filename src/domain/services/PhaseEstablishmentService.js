import { createHash } from "node:crypto";
import { createPhaseStrategy } from "../models/phaseStrategy";
import { createPhaseExpectedTrajectory } from "../models/phaseExpectedTrajectory";

export const PHASE_EXECUTION_CADENCE = Object.freeze({
  monitoringCadence: "weekly",
  strategicReviewCadence: "monthly",
  strategicReviewAnchor: "dexa_body_composition",
  adjustmentAuthorization: "user_required",
  automaticAdjustmentAllowed: false,
});

export function createAuthorizedPhaseEstablishment({ goal, currentPhase, nextPhase, actorId,
  decisionId, idempotencyKey, decidedAt, projectedStart, caloricIntakeTarget,
  activityExpenditureTarget, sourceArtifactId, sourceEvidenceId = null } = {}) {
  const calories = target(caloricIntakeTarget, "caloricIntakeTarget", { min: 500, max: 10000 });
  const activity = target(activityExpenditureTarget, "activityExpenditureTarget", { min: 0, max: 10000 });
  if (!goal?.id || !currentPhase?.id || !nextPhase?.id || !actorId || !decisionId || !idempotencyKey) {
    throw new TypeError("Phase establishment requires canonical Goal, phases, actor, and decision identity.");
  }
  const targetDate = goal.timeline?.targetDate ?? goal.target?.targetDate ?? nextPhase.targetDate;
  if (!targetDate) throw new TypeError("Phase establishment requires a canonical Goal target date.");
  const base = `phase_establishment|${goal.id}|${nextPhase.id}|${decisionId}`;
  const strategyId = `phase_strategy|${digest(base)}|v1`;
  const trajectoryId = `phase_expected_trajectory|${digest(`${base}|trajectory`)}|v1`;
  const acceptanceId = (id) => `phase_activation_acceptance|${id}|${idempotencyKey}`;
  const lineage = (field, path, classification = "authorized_phase_transition") => ({
    field, sourceType: "phase_review_decision", sourceId: decisionId, sourceRevision: "1",
    path, classification,
  });
  const accepted = (id) => ({ revision: 1, status: "accepted", createdAt: decidedAt,
    acceptedAt: decidedAt, acceptedBy: actorId, acceptanceId: acceptanceId(id),
    acceptanceIdempotencyKey: idempotencyKey, acceptedRevision: 1 });
  const guardrail = extractBodyFatGuardrail(goal.guardrails ?? []);
  const strategy = createPhaseStrategy({
    strategyId, goalId: goal.id, phaseId: nextPhase.id, ...accepted(strategyId),
    sourceLineage: [lineage("purpose", "goal.target"), lineage("domains", "user_authorized_phase_establishment"),
      lineage("strategyHypothesis", "nextPhase.purpose")],
    purpose: { supportLeanMassGain: true, protectBodyFatGuardrail: true,
      avoidUnnecessarilyAggressiveSurplus: true, preserveGoalRunway: true },
    domains: {
      energy: { intent: "execute_user_authorized_phase_targets",
        adjustmentLogic: "reviewed_changes_only", fixedCaloriePrescription: false,
        monitoringCadence: PHASE_EXECUTION_CADENCE.monitoringCadence,
        strategicReviewCadence: PHASE_EXECUTION_CADENCE.strategicReviewCadence,
        strategicReviewAnchor: PHASE_EXECUTION_CADENCE.strategicReviewAnchor,
        adjustmentAuthorization: PHASE_EXECUTION_CADENCE.adjustmentAuthorization,
        automaticAdjustmentAllowed: PHASE_EXECUTION_CADENCE.automaticAdjustmentAllowed },
      nutrition: { intent: "support_phase_objective", executionTargetOwnedBy: "energy_protocol" },
      training: { intent: "progress_toward_phase_objective", interpretationRule: "multi_session_evidence_required" },
      activity: { intent: "hold_a_reviewable_expenditure_baseline", executionTargetOwnedBy: "energy_protocol" },
      recovery: { intent: "preserve_adaptation_capacity", interpretationRule: "context_not_outcome_proof" },
      coaching: { intent: "monitor_and_recommend_adjustments", authorizationBoundary: "user_authorizes_strategy_changes" },
      peptides: { intent: "retain_separately_authorized_protocols" },
      supplements: { intent: "retain_separately_authorized_protocols" },
      guardrailResponse: { acceptedBodyFatRange: guardrail, exactMembershipPreserved: true,
        responseRule: "recommend_review_if_pressure_worsens", automaticChangeAllowed: false },
    },
    strategyHypothesis: {
      hypothesisId: `strategy_hypothesis|${strategyId}`,
      statement: "the_authorized_energy_and_activity_targets_support_the_phase_objective_while_guardrails_are_monitored",
      expectedResponses: [{ responseId: "objective_trend_moves_in_intended_direction" },
        { responseId: "training_and_recovery_remain_supportive" }],
      validationConditions: ["repeat_objective_evidence", "supporting_execution_trends"],
      falsificationConditions: ["material_guardrail_pressure", "sustained_unfavorable_objective_or_training_trend"],
    },
  });
  const milestone = (type, expectedTiming, purpose, evidence, uncertainty, review, completion) => ({
    milestoneId: `${trajectoryId}|${type}`, type, expectedTiming, purpose,
    expectedEvidence: evidence, uncertaintyReduced: uncertainty,
    canTriggerStrategyReview: review, canSupportCompletion: completion,
  });
  const objectiveMax = Number.isFinite(Number(goal.target?.amount)) ? Number(goal.target.amount) : 1;
  const trajectory = createPhaseExpectedTrajectory({
    trajectoryId, goalId: goal.id, phaseId: nextPhase.id, ...accepted(trajectoryId),
    sourceLineage: [lineage("timeline", "goal.timeline"), lineage("objectiveTrajectory", "goal.target"),
      lineage("guardrailTrajectory", "goal.guardrails"), lineage("milestones", "nextPhase")],
    timeline: { projectedStartRule: "review_milestone_boundary",
      projectedStart, goalTargetDate: targetDate, preActivationEvidenceOwnership: "none",
      strategicReviewCadence: PHASE_EXECUTION_CADENCE.strategicReviewCadence,
      strategicReviewAnchor: PHASE_EXECUTION_CADENCE.strategicReviewAnchor },
    objectiveTrajectory: { direction: goal.target?.direction ?? "improve", partialProgressHasValue: true,
      fullTargetIsPromise: false, repeatValidationRequired: true },
    guardrailTrajectory: { acceptedRange: guardrail ?? { state: "not_structured" }, independentFromObjective: true },
    weightTrajectory: { direction: "goal_and_guardrail_aware", universalWeeklyRate: null },
    trainingTrajectory: { expectation: "monitor_repeated_performance", isolatedRegressionInvalidatesStrategy: false },
    milestones: [
      milestone("phase_starting_forecast", { mode: "on_activation" }, "initialize phase forecast", ["accepted_strategy", "accepted_execution_targets"], ["phase_starting_prior"], false, false),
      milestone("first_phase_cadence_review", { mode: "strategic_review_cadence",
        cadence: PHASE_EXECUTION_CADENCE.strategicReviewCadence,
        anchor: PHASE_EXECUTION_CADENCE.strategicReviewAnchor }, "review accumulated response", ["weight", "nutrition", "activity", "training", "recovery", "body_composition"], ["early_response"], true, false),
      milestone("first_post_transition_photo_event", { mode: "next_qualifying_event" }, "add visual context", ["comparable_photos"], ["visual_change"], true, false),
      milestone("objective_comparison", { mode: "next_qualifying_objective_evidence" }, "measure objective response", [goal.target?.metric ?? "objective_evidence"], ["objective_change"], true, false),
      milestone("mid_phase_review", { mode: "midpoint_of_activation_and_target" }, "review strategy and runway", ["objective_and_supporting_evidence"], ["trajectory_feasibility"], true, false),
      milestone("final_goal_assessment", { mode: "goal_target_window" }, "assess objective and guardrails", ["objective_and_guardrail_evidence"], ["goal_outcome"], true, true),
    ],
    expectedTrajectory: { segments: [{ segmentId: `${trajectoryId}|full_window`,
      startBoundary: "actual_activation", endBoundary: targetDate,
      expectedObjectiveRanges: [{ expectationId: `${trajectoryId}|objective`,
        objectiveRef: `objective|${goal.id}|${goal.target?.metric ?? "primary"}`,
        min: 0, max: objectiveMax, unit: goal.target?.unit ?? "canonical_unit" }] }] },
  });
  return deepFreeze({
    schemaVersion: "phase_establishment_v1", strategy, trajectory,
    executionTargets: { caloricIntake: calories, activityExpenditure: activity,
      evaluationCadence: PHASE_EXECUTION_CADENCE.strategicReviewCadence,
      monitoringCadence: PHASE_EXECUTION_CADENCE.monitoringCadence,
      strategicReviewCadence: PHASE_EXECUTION_CADENCE.strategicReviewCadence,
      strategicReviewAnchor: PHASE_EXECUTION_CADENCE.strategicReviewAnchor,
      adjustmentMethod: "user_authorized_reviewed_changes", automaticAdjustmentAllowed: false },
    lineage: { sourceArtifactId, sourceEvidenceId, decisionId, currentPhaseId: currentPhase.id,
      nextPhaseId: nextPhase.id, actorId, authorizedAt: decidedAt },
  });
}

function target(value, field, limits) {
  const amount = Number(value?.value ?? value);
  const unit = value?.unit ?? "kcal/day";
  if (!Number.isInteger(amount) || amount < limits.min || amount > limits.max || unit !== "kcal/day") {
    throw new TypeError(`${field} must be a whole-number kcal/day target within the supported range.`);
  }
  return { value: amount, unit };
}
function extractBodyFatGuardrail(items) { for (const item of items) { const match = String(item?.text ?? "").match(/(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s*%/u); if (match) return { min: Number(match[1]), max: Number(match[2]), unit: "percent", approximate: /approximately|approx/i.test(item.text) }; } return null; }
function digest(value) { return createHash("sha256").update(String(value)).digest("hex").slice(0, 24); }
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
