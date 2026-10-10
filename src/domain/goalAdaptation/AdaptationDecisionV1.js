// Phase A (shadow): adaptation eligibility, the post-projection ladder rungs,
// and evidence/adherence coaching.
//
// Runs after the V3 confidence projection, so the trajectory's schedule state
// reaches the recommendation ladder. Nothing here changes the published V3
// recommendation, Goal Confidence or any stored artifact; it returns a separate
// shadow decision for review.

import { GOAL_ADAPTATION_POLICY_V1 } from "./GoalAdaptationPolicyV1.js";
import { AdherenceStatus, CoverageStatus } from "./EvidenceAndAdherenceV1.js";
import { ScheduleState, addDays, daysBetween } from "./ScheduleCorrectionV1.js";

export const EligibilityStatus = Object.freeze({
  CALIBRATING: "calibrating",
  INSUFFICIENT_EVIDENCE: "insufficient_evidence",
  ADHERENCE_COACHING: "adherence_coaching",
  ELIGIBLE: "eligible",
  ELIGIBLE_SAFETY_EXCEPTION: "eligible_safety_exception",
  ELIGIBLE_SUSTAINABILITY_REVIEW: "eligible_sustainability_review",
});

export const AdaptationRung = Object.freeze({
  NONE: "none",
  CALIBRATING: "calibrating",
  EVIDENCE_COACHING: "evidence_coaching",
  ADHERENCE_COACHING: "adherence_coaching",
  PACE_UNVERIFIED: "pace_unverified",
  REVIEW_TIMELINE: "review_timeline",
  RESOLVE_CONSTRAINT_CONFLICT: "resolve_constraint_conflict",
  BELOW_RANGE_WATCH: "below_range_watch",
  BELOW_RANGE_REVIEW: "below_range_review",
  SUSTAINABILITY_REVIEW: "sustainability_review",
});

const PROPOSAL_RUNGS = new Set([
  AdaptationRung.REVIEW_TIMELINE,
  AdaptationRung.RESOLVE_CONSTRAINT_CONFLICT,
  AdaptationRung.BELOW_RANGE_REVIEW,
  AdaptationRung.SUSTAINABILITY_REVIEW,
]);

export function assessAdaptationEligibility({
  asOf,
  phaseStartDate,
  coverage,
  adherence,
  guardrail,
  outcomeTrend = null,
  safety = {},
  policy = GOAL_ADAPTATION_POLICY_V1,
}) {
  const daysInPhase = phaseStartDate ? daysBetween(phaseStartDate, asOf) : null;
  const safetyException = Boolean(
    (policy.safetyExceptions.guardrailBreachedUnsafeDirection && guardrail?.unsafeBreach) ||
    (Number(safety.weightChangePercentPerWeek) >= policy.safetyExceptions.rapidWeightChangePercentPerWeek) ||
    (policy.safetyExceptions.reportedHealthConcern && safety.reportedHealthConcern === true));
  const reasons = [];
  if (daysInPhase != null && daysInPhase < policy.calibration.checkpointDays && !safetyException) {
    return freeze({ status: EligibilityStatus.CALIBRATING, daysInPhase, checkpointDate: addDays(phaseStartDate, policy.calibration.checkpointDays), reasons: ["initial_calibration_checkpoint_not_reached"] });
  }
  if (coverage?.status !== CoverageStatus.SUFFICIENT && !safetyException) {
    return freeze({ status: EligibilityStatus.INSUFFICIENT_EVIDENCE, daysInPhase, reasons: ["evidence_coverage_insufficient"], missing: coverage?.missing ?? [] });
  }
  const nonadherent = adherence?.status === AdherenceStatus.CONSISTENT_NONADHERENCE;
  // Nonadherence in the direction that is driving an unsafe guardrail, or with
  // a stalled/regressing outcome, is evidence the strategy itself may be
  // unsustainable. That justifies a review instead of blocking eligibility.
  const drivesUnsafeGuardrail = guardrail?.unsafePressure && (
    (guardrail.position === "above" && adherence?.direction === "over") ||
    (guardrail.position === "below" && adherence?.direction === "under"));
  if (nonadherent && (drivesUnsafeGuardrail || ["stalled", "regressing"].includes(outcomeTrend))) {
    reasons.push(drivesUnsafeGuardrail ? "consistent_nonadherence_with_unsafe_guardrail_pressure" : "consistent_nonadherence_with_stalled_or_regressing_outcome");
    return freeze({ status: EligibilityStatus.ELIGIBLE_SUSTAINABILITY_REVIEW, daysInPhase, reasons });
  }
  if ([AdherenceStatus.CONSISTENT_NONADHERENCE, AdherenceStatus.INCONSISTENT].includes(adherence?.status) && !safetyException) {
    return freeze({ status: EligibilityStatus.ADHERENCE_COACHING, daysInPhase, reasons: ["coach_adherence_before_adapting_the_goal"], direction: adherence.direction ?? null });
  }
  if (adherence?.status === AdherenceStatus.INSUFFICIENT_DATA) reasons.push("adherence_not_assessable_missing_data_is_not_nonadherence");
  return freeze({ status: safetyException ? EligibilityStatus.ELIGIBLE_SAFETY_EXCEPTION : EligibilityStatus.ELIGIBLE, daysInPhase, reasons });
}

// belowRangeHistory: chronological list of prior evaluations' guardrail
// positions for this goal (most recent last), e.g. ["within", "below", "below"].
export function resolveAdaptationRung({
  eligibility,
  schedule,
  guardrail,
  belowRangeHistory = [],
  confirmedByBodyCompositionEvidence = false,
  triggerFamily,
  photoEvidenceReliable = false,
  policy = GOAL_ADAPTATION_POLICY_V1,
}) {
  const trigger = policy.triggers[triggerFamily] ?? "link_only";
  const originates = trigger === "originate" || trigger === "originate_optional" ||
    (trigger === "originate_if_reliable_and_corroborated" && photoEvidenceReliable === true);
  const rung = selectRung({ eligibility, schedule, guardrail, belowRangeHistory, confirmedByBodyCompositionEvidence, policy });
  const proposalRung = PROPOSAL_RUNGS.has(rung);
  return freeze({
    rung,
    triggerFamily,
    trigger,
    originatesProposal: proposalRung && originates,
    linkOnly: proposalRung && !originates,
    automaticChangeAllowed: false,
    coaching: coachingFor({ rung, eligibility, guardrail, schedule, triggerFamily, policy }),
  });
}

function selectRung({ eligibility, schedule, guardrail, belowRangeHistory, confirmedByBodyCompositionEvidence, policy }) {
  switch (eligibility?.status) {
    case EligibilityStatus.CALIBRATING: return AdaptationRung.CALIBRATING;
    case EligibilityStatus.INSUFFICIENT_EVIDENCE: return AdaptationRung.EVIDENCE_COACHING;
    case EligibilityStatus.ADHERENCE_COACHING: return AdaptationRung.ADHERENCE_COACHING;
    case EligibilityStatus.ELIGIBLE_SUSTAINABILITY_REVIEW: return AdaptationRung.SUSTAINABILITY_REVIEW;
    default: break;
  }
  const atRisk = [ScheduleState.AT_RISK, ScheduleState.DEADLINE_PASSED].includes(schedule?.scheduleState);
  if (atRisk && guardrail?.unsafePressure) return AdaptationRung.RESOLVE_CONSTRAINT_CONFLICT;
  if (atRisk) return AdaptationRung.REVIEW_TIMELINE;
  if (guardrail?.position === "below" && guardrail.meaning === "coaching") {
    const recent = [...belowRangeHistory, "below"].slice(-policy.belowRange.persistenceWeeklyEvaluations);
    const persistent = recent.length >= policy.belowRange.persistenceWeeklyEvaluations && recent.every((item) => item === "below");
    return persistent || (policy.belowRange.orConfirmedByNextBodyCompositionEvidence && confirmedByBodyCompositionEvidence)
      ? AdaptationRung.BELOW_RANGE_REVIEW : AdaptationRung.BELOW_RANGE_WATCH;
  }
  if (schedule?.paceUnverified) return AdaptationRung.PACE_UNVERIFIED;
  return AdaptationRung.NONE;
}

const DOMAIN_COPY = Object.freeze({
  body_weight: "Log your morning weight on at least 4 days this week, before food or fluids.",
  training_performance: "Log your training sessions so progress can be compared week to week.",
  nutrition_intake: "Log what you eat on at least 5 days this week.",
  activity_energy: "Keep your activity tracking on so your daily activity is captured.",
  daily_evidence: "Log at least 5 days of food or activity this week.",
});

function coachingFor({ rung, eligibility, guardrail, schedule, triggerFamily, policy }) {
  const placement = policy.coaching.placement[triggerFamily] ?? [];
  if (!placement.length) return [];
  const items = [];
  if (rung === AdaptationRung.EVIDENCE_COACHING) {
    for (const missing of eligibility.missing ?? []) {
      if (!missing.promptAllowed) continue; // HealthKit-canonical domains are never prompted manually.
      const domain = String(missing.domain).split("|")[0];
      if (DOMAIN_COPY[domain]) items.push({ kind: "missing_evidence", domain, text: DOMAIN_COPY[domain] });
    }
  }
  if (rung === AdaptationRung.ADHERENCE_COACHING) {
    items.push({ kind: "adherence", text: eligibility.direction === "over"
      ? "Most logged days ran above your calorie target. Aim to land within your target range on most days this week."
      : eligibility.direction === "under"
        ? "Most logged days ran below your calorie target. Aim to reach your target range on most days this week."
        : "Your intake varied a lot from your target. Aim to land within your target range on most days this week." });
  }
  if (rung === AdaptationRung.BELOW_RANGE_WATCH) {
    items.push({ kind: "below_range_watch", text: "Body fat is a little below your preferred range. That isn't a problem on its own; keep fueling your training and we'll watch the trend." });
  }
  if (rung === AdaptationRung.PACE_UNVERIFIED) {
    items.push({ kind: "pace_unverified", text: `${schedule.timeRemainingDays} days remain to your goal date. Keep your weigh-ins and training logs consistent so your pace can be checked.` });
  }
  return items.map((item) => ({ ...item, placement: placement[placement.length - 1] }));
}

function freeze(value) { return Object.freeze(value); }
