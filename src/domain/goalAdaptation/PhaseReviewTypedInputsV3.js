// Phase A (dormant): typed Phase Review inputs.
//
// `deriveGoalAwarePhaseReviewInputs` (GoalAwarePhaseReviewRecommendationService)
// reads guardrail ranges from guardrail prose and evidence trend/uncertainty from
// narrative text with regular expressions. This replacement derives the same
// input contract from typed V3 fields and a structured guardrail evaluation, so
// briefing wording can never change a phase decision. It is not wired in yet:
// the live Phase Review read path is unchanged until a separate gated switch.

import { daysBetween } from "./ScheduleCorrectionV1.js";

export function derivePhaseReviewInputsFromV3({
  goal,
  phase,
  nextPhase,
  interpretation,
  guardrail,
  extensionDays = 14,
  asOf,
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(asOf ?? ""))) throw new TypeError("asOf must be a YYYY-MM-DD local date.");
  const targetDate = goal?.timeline?.targetDate ?? goal?.target?.targetDate ?? null;
  const objective = interpretation?.objectiveFindings?.[0] ?? null;
  const strategy = interpretation?.strategyEffectiveness ?? {};
  const range = guardrail?.position === "within" ? 0 : guardrail?.deviation ?? null;
  const span = guardrail?.span ?? null;
  const deviationMagnitude = guardrail?.position == null ? "unknown" : guardrail.position === "within" ? "none" :
    guardrail.unsafeBreach || (span != null && range > Math.max(0.1, span)) ? "material" : "slight";
  const objectiveState = objective?.state ?? objective?.status ?? null;
  const evidenceTrend = ["regressed", "regressing", "contradicted"].includes(objectiveState) || strategy.feasibility === "refuted" ? "worsening" :
    objectiveState === "insufficient_evidence" || objectiveState == null ? "unstable" :
      ["progressed", "satisfied", "achieved"].includes(objectiveState) ? "favorable" : "stable";
  const highUncertainty = (interpretation?.uncertaintyProfile ?? []).some((item) => item.materiality === "high");
  const uncertainty = highUncertainty || ["emerging", "not_assessed"].includes(strategy.persistence) || strategy.feasibility === "testing" ? "bounded" : "low";
  return Object.freeze({
    nextPhaseId: nextPhase?.id ?? null,
    phaseEvidenceConclusion: interpretation?.phaseTransitionReady === true ? "conclusively_satisfied" : "unresolved",
    forecastStatus: null,
    guardrailStatus: guardrail?.position == null ? "unknown" : guardrail.position === "within" ? "inside" : guardrail.position,
    guardrailDeviationMagnitude: deviationMagnitude,
    evidenceTrend,
    uncertainty,
    remainingGoalDays: targetDate ? daysBetween(asOf, targetDate) : null,
    extensionDays,
    nextPhaseMonitorable: Boolean(nextPhase),
    nextPhaseAdjustable: Boolean(nextPhase),
    phaseElapsedDays: phase?.startDate ?? phase?.startedAt ? daysBetween(phase.startDate ?? phase.startedAt, asOf) : null,
    inputSource: "typed_v3_fields",
  });
}
