// Phase A (shadow): goal-specific evidence coverage and plan adherence.
//
// Coverage asks "do we have enough evidence to judge this goal?". Adherence
// asks "on the days we can see, did execution match the plan?". They are
// separate: a missing day is never counted as nonadherence, and DEXA (or any
// body-composition scan) is never required, only recorded as added precision.

import { GOAL_ADAPTATION_POLICY_V1 } from "./GoalAdaptationPolicyV1.js";

export const CoverageStatus = Object.freeze({ SUFFICIENT: "sufficient", INSUFFICIENT: "insufficient" });
export const AdherenceStatus = Object.freeze({
  ADEQUATE: "adequate",
  INCONSISTENT: "inconsistent",
  CONSISTENT_NONADHERENCE: "consistent_nonadherence",
  INSUFFICIENT_DATA: "insufficient_data",
  NOT_APPLICABLE: "not_applicable",
});

// signals: { [domain]: { daysPerWeek: number[] , source?: "healthkit" | "manual" | "mixed" } }
// optional: bodyCompositionScans (dates), validatedPhotoSessions (count)
export function assessEvidenceCoverage({ archetype, signals = {}, bodyCompositionScanDates = [], validatedPhotoSessions = 0, policy = GOAL_ADAPTATION_POLICY_V1 } = {}) {
  const definition = policy.archetypes[archetype];
  if (!definition) return Object.freeze({ status: CoverageStatus.INSUFFICIENT, reason: "unknown_goal_archetype", domains: [], missing: [], precision: "unknown" });
  const domains = definition.required.map((requirement) => evaluateRequirement(requirement, signals, policy));
  const missing = domains.filter((item) => item.status !== CoverageStatus.SUFFICIENT);
  return Object.freeze({
    archetype,
    status: missing.length ? CoverageStatus.INSUFFICIENT : CoverageStatus.SUFFICIENT,
    domains,
    missing: missing.map((item) => ({ domain: item.domain, missingReason: item.missingReason, promptAllowed: item.promptAllowed })),
    precision: bodyCompositionScanDates.length ? "measured_body_composition_available" : "estimated_without_body_composition_scan",
    precisionNote: bodyCompositionScanDates.length ? null : definition.uncertaintyWithoutPrecision,
    bodyCompositionScanRequired: false,
    supportingPhotoSessions: policy.photos.countAsEvidenceOnlyWhenValidated ? validatedPhotoSessions : 0,
  });
}

function evaluateRequirement(requirement, signals, policy) {
  if (requirement.anyOf) {
    const options = requirement.anyOf.map((item) => evaluateRequirement(item, signals, policy));
    const met = options.find((item) => item.status === CoverageStatus.SUFFICIENT);
    if (met) return { ...met, satisfiedBy: met.domain, domain: options.map((item) => item.domain).join("|") };
    const best = options.sort((a, b) => b.observedDaysPerWeek - a.observedDaysPerWeek)[0];
    return { ...best, domain: options.map((item) => item.domain).join("|") };
  }
  const signal = signals[requirement.domain] ?? {};
  const weeks = (signal.daysPerWeek ?? []).filter((value) => Number.isFinite(Number(value)));
  const observed = weeks.length ? weeks.reduce((sum, value) => sum + Number(value), 0) / weeks.length : 0;
  const sufficient = weeks.length > 0 && observed >= requirement.minDaysPerWeek;
  const healthKitCanonical = signal.source === "healthkit" && policy.healthKit.canonicalDomainsNeverPromptManually.includes(requirement.domain);
  return {
    domain: requirement.domain,
    status: sufficient ? CoverageStatus.SUFFICIENT : CoverageStatus.INSUFFICIENT,
    observedDaysPerWeek: Math.round(observed * 10) / 10,
    requiredDaysPerWeek: requirement.minDaysPerWeek,
    source: signal.source ?? null,
    missingReason: sufficient ? null : healthKitCanonical ? "no_data_synced" : weeks.length ? "not_logged_often_enough" : "not_logged",
    promptAllowed: !sufficient && !healthKitCanonical,
  };
}

// weeks: [{ weekStart, measuredDays, withinDays, overDays, underDays }] for one target (e.g. intake)
export function assessPlanAdherence({ weeks = [], hasTarget = true, policy = GOAL_ADAPTATION_POLICY_V1 } = {}) {
  if (!hasTarget) return Object.freeze({ status: AdherenceStatus.NOT_APPLICABLE, weeks: [] });
  const rules = policy.adherence;
  const assessed = weeks.map((week) => {
    const measured = Number(week.measuredDays ?? 0);
    if (measured < rules.minimumMeasuredDaysPerWeek) return { ...week, status: AdherenceStatus.INSUFFICIENT_DATA, direction: null, share: null };
    const share = Number(week.withinDays ?? 0) / measured;
    const over = Number(week.overDays ?? 0);
    const under = Number(week.underDays ?? 0);
    const direction = over > under ? "over" : under > over ? "under" : over ? "mixed" : null;
    return { ...week, share: Math.round(share * 1000) / 1000, direction, status: share >= rules.adequateShareOfMeasuredDays ? AdherenceStatus.ADEQUATE : AdherenceStatus.INCONSISTENT };
  });
  const measuredWeeks = assessed.filter((week) => week.status !== AdherenceStatus.INSUFFICIENT_DATA);
  if (!measuredWeeks.length) return Object.freeze({ status: AdherenceStatus.INSUFFICIENT_DATA, weeks: assessed, note: "missing_data_is_not_nonadherence" });
  let trailingOff = 0;
  for (const week of [...measuredWeeks].reverse()) { if (week.status === AdherenceStatus.INCONSISTENT) trailingOff += 1; else break; }
  const totalMeasured = measuredWeeks.reduce((sum, week) => sum + Number(week.measuredDays), 0);
  if (totalMeasured < rules.minimumMeasuredDaysForJudgement) return Object.freeze({ status: AdherenceStatus.INSUFFICIENT_DATA, measuredDays: totalMeasured, weeks: assessed, note: "too_few_measured_days_to_judge" });
  const totalWithin = measuredWeeks.reduce((sum, week) => sum + Number(week.withinDays ?? 0), 0);
  const recentDirections = measuredWeeks.slice(-rules.consistentNonadherenceWeeks).map((week) => week.direction);
  const consistentDirection = recentDirections.every((value) => value && value === recentDirections[0]) ? recentDirections[0] : "mixed";
  const status = trailingOff >= rules.consistentNonadherenceWeeks ? AdherenceStatus.CONSISTENT_NONADHERENCE :
    totalWithin / totalMeasured >= rules.adequateShareOfMeasuredDays ? AdherenceStatus.ADEQUATE : AdherenceStatus.INCONSISTENT;
  return Object.freeze({
    status,
    share: Math.round((totalWithin / totalMeasured) * 1000) / 1000,
    measuredDays: totalMeasured,
    consecutiveOffPlanWeeks: trailingOff,
    direction: status === AdherenceStatus.ADEQUATE ? null : consistentDirection,
    weeks: assessed,
    note: "days_without_data_are_not_counted_as_nonadherence",
  });
}
