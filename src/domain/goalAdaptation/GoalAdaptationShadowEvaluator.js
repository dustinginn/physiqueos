// Phase A (shadow): one entry point that turns a V3 evaluation (live, or a
// persisted assessment) plus evidence/adherence signals into a reviewable
// "would have said" decision. It is pure: no reads, no writes, no
// notifications, no proposals persisted. Production callers never invoke it.

import { GOAL_ADAPTATION_POLICY_V1, resolveGoalArchetype } from "./GoalAdaptationPolicyV1.js";
import { assessEvidenceCoverage, assessPlanAdherence } from "./EvidenceAndAdherenceV1.js";
import { correctScheduleForElapsedTime } from "./ScheduleCorrectionV1.js";
import { evaluateStructuredGuardrail, structureV3Guardrail } from "./StructuredGuardrailV1.js";
import { createHash } from "node:crypto";
import { assessAdaptationEligibility, resolveAdaptationRung, resolveDeferral } from "./AdaptationDecisionV1.js";

export const GOAL_ADAPTATION_SHADOW_VERSION = "goal_adaptation_shadow_v1";

export function evaluateGoalAdaptationShadow({
  goal,
  phaseStartDate,
  asOf,
  triggerFamily,
  trajectory,
  outlookAsOf = null,
  v3Guardrail = null,
  guardrailMeasurement = {},
  belowRangeHistory = [],
  confirmedByBodyCompositionEvidence = false,
  baseRecommendation = null,
  coverageSignals = {},
  bodyCompositionScanDates = [],
  validatedPhotoSessions = 0,
  adherenceWeeks = [],
  hasAdherenceTarget = true,
  outcomeTrend = null,
  safety = {},
  photoEvidenceReliable = false,
  goalAchievement = null,
  phaseState = null,
  outcomeTrendDays = 0,
  priorRecommendation = null,
  policy = GOAL_ADAPTATION_POLICY_V1,
}) {
  const archetype = resolveGoalArchetype(goal, policy);
  const schedule = correctScheduleForElapsedTime(trajectory ? { ...trajectory, outlookAsOf: outlookAsOf ?? trajectory.outlookAsOf } : null, { asOf, atRiskRatio: policy.schedule.atRiskRatio, minimumEvidenceSpanDays: policy.schedule.minimumEvidenceSpanDays });
  const structured = v3Guardrail ? structureV3Guardrail(v3Guardrail, { archetype, policy }) : null;
  const guardrail = evaluateStructuredGuardrail(structured, guardrailMeasurement);
  const coverage = assessEvidenceCoverage({ archetype, signals: coverageSignals, bodyCompositionScanDates, validatedPhotoSessions, policy });
  const adherence = assessPlanAdherence({ weeks: adherenceWeeks, hasTarget: hasAdherenceTarget, policy });
  const eligibility = assessAdaptationEligibility({ asOf, phaseStartDate, coverage, adherence, guardrail, outcomeTrend, safety, policy });
  const rungDecision = resolveAdaptationRung({ eligibility, schedule, guardrail, belowRangeHistory, confirmedByBodyCompositionEvidence, triggerFamily, photoEvidenceReliable, goalAchievement, phaseState, outcomeTrend, outcomeTrendDays, policy });
  // Material evidence: the latest outcome measurement, the guardrail position
  // and severity, the schedule state and the rung itself.
  const evidenceFingerprint = `sha256_${createHash("sha256").update(JSON.stringify([
    outlookAsOf ?? trajectory?.outlookAsOf ?? null, guardrail.position ?? null, guardrail.severity ?? null, schedule.scheduleState, rungDecision.rung,
  ])).digest("hex").slice(0, 32)}`;
  const deferral = resolveDeferral({ priorRecommendation, currentEvidenceFingerprint: evidenceFingerprint, currentRung: rungDecision.rung, triggerFamily, policy });
  const decision = Object.freeze({ ...rungDecision, deferral, originatesProposal: rungDecision.originatesProposal && deferral.surface });
  return Object.freeze({
    version: GOAL_ADAPTATION_SHADOW_VERSION,
    policyVersion: policy.version,
    mode: "shadow",
    persisted: false,
    asOf,
    archetype,
    triggerFamily,
    baseRecommendation: baseRecommendation ? { action: baseRecommendation.action, reason: baseRecommendation.reason ?? null } : null,
    schedule,
    guardrail,
    coverage,
    adherence: { status: adherence.status, share: adherence.share ?? null, direction: adherence.direction ?? null, consecutiveOffPlanWeeks: adherence.consecutiveOffPlanWeeks ?? 0 },
    eligibility,
    evidenceFingerprint,
    decision,
  });
}

// Pulls the shadow inputs straight from a live V3 pipeline result.
export function shadowInputsFromV3({ goalContract, interpretation, confidence }) {
  const objective = confidence?.goalAchievementOutlook?.objectives?.[0] ?? null;
  const bodyFatGuardrail = (goalContract?.guardrails ?? []).find((item) =>
    String(item.metricCapability?.capabilityId ?? item.metricCapability ?? "").includes("body_fat"));
  const finding = bodyFatGuardrail ? (interpretation?.guardrailFindings ?? []).find((item) => item.guardrailId === bodyFatGuardrail.guardrailId) : null;
  return {
    trajectory: objective?.trajectory ?? null,
    outlookAsOf: confidence?.goalAchievementOutlook?.asOf ?? null,
    v3Guardrail: bodyFatGuardrail ?? null,
    guardrailMeasurement: { value: finding?.currentValue ?? null },
    baseRecommendation: interpretation?.recommendation ?? null,
  };
}
