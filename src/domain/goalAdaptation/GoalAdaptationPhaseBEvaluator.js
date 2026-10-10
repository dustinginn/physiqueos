// Phase B (dormant): one entry point from evidence to ranked options.
//
// Runs the accepted Phase A shadow decision, calibrates energy from the user's
// own history, and, when Phase A reaches a proposal rung, builds the ranked
// options with energy, timeline, projection, tradeoffs and validation. It can
// also revalidate a previously shown recommendation (on entry and at
// approval). Pure: no reads, writes, notifications or persisted proposals.

import { GOAL_ADAPTATION_POLICY_V1, resolveGoalArchetype } from "./GoalAdaptationPolicyV1.js";
import { evaluateGoalAdaptationShadow } from "./GoalAdaptationShadowEvaluator.js";
import { calibrateEnergy } from "./EnergyCalibrationV1.js";
import { buildAdaptationOptions, revalidateRecommendation } from "./AdaptationOptionsV1.js";
import { structureV3Guardrail } from "./StructuredGuardrailV1.js";
import { AdaptationRung } from "./AdaptationDecisionV1.js";

export const GOAL_ADAPTATION_PHASE_B_VERSION = "goal_adaptation_phase_b_v1";

const PROPOSAL_RUNGS = new Set([
  AdaptationRung.REVIEW_TIMELINE, AdaptationRung.RESOLVE_CONSTRAINT_CONFLICT, AdaptationRung.BELOW_RANGE_REVIEW,
  AdaptationRung.SUSTAINABILITY_REVIEW, AdaptationRung.GUARDRAIL_REVIEW, AdaptationRung.STRATEGY_REVIEW,
  AdaptationRung.GOAL_ACHIEVED, AdaptationRung.PHASE_TIME_LIMIT_REVIEW,
]);

export function evaluateGoalAdaptationPhaseB({
  body = null,
  calibrationPeriods = [],
  plan = null,
  observedIntakeKcal = null,
  shownRecommendation = null,
  policy = GOAL_ADAPTATION_POLICY_V1,
  ...phaseAInputs
}) {
  const phaseA = evaluateGoalAdaptationShadow({ ...phaseAInputs, policy });
  const archetype = resolveGoalArchetype(phaseAInputs.goal, policy);
  const calibration = calibrateEnergy({ periods: calibrationPeriods, plannedActivityKcal: plan?.activityKcal ?? null, asOf: phaseAInputs.asOf, policy });
  const latest = (calibration.periods ?? []).filter((item) => item.used).at(-1) ?? null;
  const latestRaw = latest ? calibrationPeriods.find((item) => item.end === latest.end) : null;
  const progress = {
    remaining: phaseAInputs.trajectory?.remainingRequirement ?? null,
    measuredRatePerDay: latestRaw && latestRaw.dLean != null && archetype === "lean_mass_gain" ? latestRaw.dLean / latestRaw.days : phaseA.schedule.measuredRate ?? null,
    fatRatePerDay: latestRaw && latestRaw.dFat != null ? latestRaw.dFat / latestRaw.days : null,
  };
  const structured = phaseAInputs.v3Guardrail ? structureV3Guardrail(phaseAInputs.v3Guardrail, { archetype, policy }) : null;
  const rung = phaseA.decision.rung;
  const options = PROPOSAL_RUNGS.has(rung) ? buildAdaptationOptions({
    rung, archetype, asOf: phaseAInputs.asOf, goal: phaseAInputs.goal, body, progress,
    guardrail: structured ? { structured: structured.structured, evaluation: phaseA.guardrail } : null,
    calibration, plan, schedule: phaseA.schedule, observedIntakeKcal,
    evidenceSufficient: phaseA.coverage.status === "sufficient", policy,
  }) : null;
  const snapshot = options ? {
    createdOn: phaseAInputs.asOf,
    evidenceFingerprint: phaseA.evidenceFingerprint,
    maintenanceEstimateKcal: calibration.maintenanceKcal?.estimate ?? null,
    recommendedKind: options.recommendedKind,
  } : null;
  const revalidation = shownRecommendation ? revalidateRecommendation({
    recommendation: shownRecommendation, current: { evidenceFingerprint: phaseA.evidenceFingerprint, calibration, options }, asOf: phaseAInputs.asOf, policy,
  }) : null;
  return Object.freeze({
    version: GOAL_ADAPTATION_PHASE_B_VERSION,
    mode: "shadow",
    persisted: false,
    phaseA,
    calibration,
    progress,
    options,
    recommendationSnapshot: snapshot,
    revalidation,
  });
}
