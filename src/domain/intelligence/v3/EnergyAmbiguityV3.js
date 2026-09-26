import { semanticFingerprint, uniqueStrings } from "./V3Runtime.js";
import { assessEnergyVariabilityV3 } from "./EnergyVariabilityV3.js";
import { PLAN_TOLERANCE_RATIO } from "../CadenceEnergyObservationsV3.js";
import { isComparableNutritionDay } from "./EnergyVariabilityBaselineV3.js";

// Energy execution and ambiguity as first-class V3 interpretation.
//
// Measurement uncertainty is not a reason to lower a Confidence percentage and
// it is not noise to drop. It is structured intelligence that shapes how firmly
// V3 can recommend and what it must not conclude. This module turns the
// source-neutral evidence-quality semantics on current-window Energy
// observations into:
//   - Energy execution findings against the CURRENT Energy Strategy targets
//   - ambiguity findings (intake, wearable estimate, pairing, tension)
//   - a recommendation-strength effect (`temper`) with explicit non-action
//
// Concepts intentionally mirror the Monthly V3 vocabulary (WEARABLE_ESTIMATE,
// ESTIMATE_VS_OUTCOME_TENSION, source reliability) rather than inventing a
// parallel one.

export const EnergyAmbiguityTypeV3 = Object.freeze({
  INTAKE: "energy_intake_uncertainty",
  WEARABLE_ESTIMATE: "energy_wearable_estimate",
  PAIRING: "energy_pairing_incomplete",
  TENSION: "energy_estimate_outcome_tension",
});

export const ENERGY_AMBIGUITY_TYPES_V3 = Object.freeze(Object.values(EnergyAmbiguityTypeV3));

const HIGH_INTAKE_CODES = new Set([
  "intake_partial_subtotal", "intake_source_conflict", "intake_totals_missing",
]);

// `intake_meal_derived_days_<n>_of_<m>`: n of the window's m nutrition days
// have meal-derived (not full-day asserted) calorie totals.
export function mealDerivedCoverageV3(codes = []) {
  const match = codes.map((code) => /^intake_meal_derived_days_(\d+)_of_(\d+)$/u.exec(code)).find(Boolean);
  return match ? { days: Number(match[1]), of: Number(match[2]) } : null;
}

export function deriveEnergyExecutionV3({ goalContract, observations = [] } = {}) {
  const energyStrategy = goalContract?.strategy?.energyStrategy ?? null;
  const energyObservations = observations.filter((item) => item.capabilities?.some((measurement) =>
    /^(execution\.energy_|strategy\.energy_|monthly\.evidence\.)/.test(measurement.capabilityId) ||
    ["execution.nutrition", "execution.activity"].includes(measurement.capabilityId)));
  const metadataOf = (observation, capabilityId) => observation.capabilities
    .find((measurement) => measurement.capabilityId === capabilityId)?.metadata ?? {};
  const byCapability = (capabilityId) => energyObservations.filter((item) =>
    item.capabilities.some((measurement) => measurement.capabilityId === capabilityId));

  const findings = [];
  for (const [capabilityId, dimension] of [
    ["execution.energy_intake", "intake"],
    ["execution.energy_activity", "activity"],
  ]) {
    for (const observation of byCapability(capabilityId)) {
      const plan = metadataOf(observation, capabilityId).plan ?? null;
      if (!plan) continue;
      findings.push(Object.freeze({
        findingId: `energy_execution|${dimension}|${observation.observationId}`,
        dimension,
        observationId: observation.observationId,
        capabilityId,
        state: plan.state,
        targetValue: plan.targetValue,
        observedValue: plan.observedValue,
        deviation: plan.deviation,
        deviationRatio: plan.deviationRatio,
        unit: plan.unit,
        toleranceRatio: plan.toleranceRatio,
        targetSource: plan.targetSource,
        adjustmentAuthorization: plan.authorization,
        measurementType: metadataOf(observation, capabilityId).measurementType ?? null,
      }));
    }
  }

  // Period-level intake variability/predictability (distinct from the
  // per-window findings above): does the PATTERN of daily deviation from the
  // current protocol target materially reduce predictability. Null when
  // there is no intake target to measure deviation against — no claim
  // without a target, never a claim against a universal/invented rate.
  const intakeObservation = byCapability("execution.energy_intake")[0] ?? null;
  const variability = deriveIntakeVariabilityV3({
    intakeObservation,
    intakeTarget: energyStrategy?.intakeTarget,
    effectiveAt: energyStrategy?.effectiveAt,
  });

  const ambiguity = [];
  const intakeCodes = uniqueStrings(energyObservations.flatMap((item) => [
    ...item.limitations, ...item.capabilities.flatMap((measurement) => measurement.metadata?.ambiguity ?? []),
  ]).filter((code) => code.startsWith("intake_")));
  if (intakeCodes.length) {
    // Completeness is coverage-aware: when authoritative full-day totals cover
    // most of the window and only a minority of days are meal-derived, the
    // intake estimate is not materially uncertain on that account (low: no
    // tempering, not surfaced). High-severity codes always win.
    const mealDerived = mealDerivedCoverageV3(intakeCodes);
    const materiality = intakeCodes.some((code) => HIGH_INTAKE_CODES.has(code)) ? "high"
      : mealDerived && mealDerived.days * 2 < mealDerived.of ? "low" : "moderate";
    ambiguity.push(entry(EnergyAmbiguityTypeV3.INTAKE, materiality, intakeCodes,
      idsWithLimitation(energyObservations, "intake_")));
  }
  const intakeTempers = ambiguity.some((item) => item.type === EnergyAmbiguityTypeV3.INTAKE && item.recommendationEffect === "temper");
  const wearable = energyObservations.filter((item) =>
    item.limitations.includes("active_expenditure_is_wearable_estimated") ||
    item.capabilities.some((measurement) => measurement.metadata?.measurementType === "WEARABLE_ESTIMATE"));
  const tensions = energyObservations.flatMap((item) => item.capabilities
    .map((measurement) => measurement.metadata?.tension ?? measurement.metadata?.estimateVsOutcomeTension)
    .filter(Boolean));
  const pairing = byCapability("execution.energy_pairing")[0] ?? null;
  const pairingRatio = pairing
    ? Number(metadataOf(pairing, "execution.energy_pairing").pairing?.pairedCoverageRatio) : NaN;
  // An intake limitation judged immaterial (low: a minority of meal-derived
  // days) must not re-enter through the wearable estimate.
  const otherwiseWeak = intakeTempers || (Number.isFinite(pairingRatio) && pairingRatio < 0.85);
  if (wearable.length) {
    // Active calories are always a wearable estimate. That alone is context:
    // it becomes decision-relevant when the estimate is also contradicted by the
    // outcome (high) or the rest of the Energy picture is weak (moderate).
    ambiguity.push(entry(EnergyAmbiguityTypeV3.WEARABLE_ESTIMATE,
      tensions.length ? "high" : otherwiseWeak ? "moderate" : "low",
      ["active_expenditure_is_wearable_estimated"], wearable.map((item) => item.observationId)));
  }
  if (pairing) {
    const details = metadataOf(pairing, "execution.energy_pairing").pairing ?? {};
    const ratio = Number(details.pairedCoverageRatio);
    if (Number.isFinite(ratio) && ratio < 1) {
      ambiguity.push(entry(EnergyAmbiguityTypeV3.PAIRING,
        ratio < 0.5 ? "high" : ratio < 0.85 ? "moderate" : "low",
        [`paired_days_${details.pairedDayCount}_of_${details.eligibleDayCount}`,
          // Nutrition-only days lack activity; activity-only days lack nutrition.
          ...(details.unpairedNutritionDayCount ? ["activity_missing_for_some_days"] : []),
          ...(details.unpairedActivityDayCount ? ["nutrition_missing_for_some_days"] : [])],
        [pairing.observationId]));
    }
  }
  if (tensions.length) {
    const tension = tensions[0];
    ambiguity.push(entry(EnergyAmbiguityTypeV3.TENSION, tension.materiality ?? "high",
      ["estimate_vs_outcome_tension", ...(tension.lagPlausible ? ["weight_average_lags_energy_balance"] : [])],
      energyObservations.filter((item) => item.capabilities.some((measurement) =>
        measurement.metadata?.tension || measurement.metadata?.estimateVsOutcomeTension))
        .map((item) => item.observationId)));
  }

  const estimateObservation = byCapability("strategy.energy_balance_estimate")[0] ?? null;
  const estimateMeasurement = estimateObservation?.capabilities
    .find((measurement) => measurement.capabilityId === "strategy.energy_balance_estimate") ?? null;
  const estimate = estimateMeasurement ? Object.freeze({
    observationId: estimateObservation.observationId,
    averageKcalPerDay: estimateMeasurement.metadata?.valueAvailable === false ||
      estimateObservation.quality.status === "insufficient" ? null : estimateMeasurement.value,
    comparisonAverageKcalPerDay: estimateMeasurement.comparisonValue ?? null,
    trendDirection: estimateMeasurement.metadata?.trendDirection ?? "not_applicable",
    measurementType: estimateMeasurement.metadata?.measurementType ?? "DERIVED_ESTIMATE",
    pairing: estimateMeasurement.metadata?.pairing ?? null,
    intakeEvidence: estimateMeasurement.metadata?.intakeEvidence ?? null,
    activityEvidence: estimateMeasurement.metadata?.activityEvidence ?? null,
    quality: estimateObservation.quality.status,
  }) : null;

  // An Energy estimate was expected for this window but there is no measured
  // Energy evidence behind it. That absence is itself ambiguity: it must never
  // make a recommendation firmer than a week with partial evidence.
  if (estimateObservation && estimate?.averageKcalPerDay == null && !findings.length && !pairing) {
    ambiguity.push(entry(EnergyAmbiguityTypeV3.PAIRING, "high",
      ["energy_evidence_unavailable"], [estimateObservation.observationId]));
  }

  return Object.freeze({
    energyStrategy,
    estimate,
    findings: Object.freeze(findings),
    ambiguity: Object.freeze(ambiguity),
    variability,
  });
}

function deriveIntakeVariabilityV3({ intakeObservation, intakeTarget, effectiveAt }) {
  if (!intakeObservation || !Number.isFinite(intakeTarget?.value) || intakeTarget.value === 0) return null;
  const metadata = intakeObservation.capabilities
    .find((measurement) => measurement.capabilityId === "execution.energy_intake")?.metadata ?? {};
  const periodSeries = metadata.dailySeries ?? [];
  const periodDays = dailyDeviationDays(periodSeries, intakeTarget, effectiveAt);
  return assessEnergyVariabilityV3({
    periodDailyDeviations: periodDays,
    historicalDailyDeviations: historicalDeviationDays({ metadata, periodSeries, intakeTarget, effectiveAt }),
  });
}

// Historical baseline = the equal-length comparison window plus, when the
// cadence supplied one, the bounded preceding lookback (see
// EnergyVariabilityBaselineV3.js). Guarantees, independent of what upstream
// supplied:
//   - no historical day falls on/after the first day of the current period
//     (current-window values are never part of their own baseline, and a day
//     is never counted twice);
//   - the extended lookback is used only when the regime start
//     (effectiveAt) is known. Without it the lookback cannot be proven to sit
//     inside one protocol regime, so only the short comparison window is used
//     and the signal stays conservative rather than mixing regimes.
function historicalDeviationDays({ metadata, periodSeries, intakeTarget, effectiveAt }) {
  const periodDates = (periodSeries ?? []).map((day) => day.date).filter(Boolean).sort();
  const periodStart = periodDates[0] ?? null;
  const merged = new Map();
  for (const day of metadata.comparisonDailySeries ?? []) merged.set(day.date, day);
  if (effectiveAt) {
    for (const day of metadata.baselineDailySeries ?? []) merged.set(day.date, day);
  }
  const preceding = [...merged.values()]
    .filter((day) => !periodStart || day.date < periodStart)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  return dailyDeviationDays(preceding, intakeTarget, effectiveAt);
}

// A day before the current protocol revision took effect was measured
// against a different target; including it would compare today's discipline
// to a target that no longer applies. Excluded from both the current period
// and the historical baseline alike, not just the baseline, since either can
// in principle span a boundary. A day whose nutrition source is not confirmed
// complete (N7) is excluded from both as well: partial logging must never
// masquerade as a below-plan day. That is a comparability rule, not a
// completeness judgment — distance from target never excludes a day.
function dailyDeviationDays(series, target, effectiveAt) {
  const cutoff = effectiveAt ? String(effectiveAt).slice(0, 10) : null;
  return (series ?? [])
    .filter((day) => !cutoff || day.date >= cutoff)
    .filter((day) => isComparableNutritionDay(day))
    .map((day) => ({
      date: day.date,
      hasPairedEvidence: Number.isFinite(day.value),
      deviationRatio: Number.isFinite(day.value)
        ? (day.value - target.value) / target.value / PLAN_TOLERANCE_RATIO
        : null,
    }));
}

// Ambiguity shapes recommendation strength; it never rewrites the action and
// never changes a Confidence percentage.
export function applyEnergyAmbiguityToRecommendation(recommendation, energy) {
  // Only interpretations that actually observed Energy evidence are shaped by
  // it. A Strategy alone with no Energy observation leaves the recommendation
  // exactly as it was (for example an evidence Event that carries no Energy).
  if (!energy || (!energy.estimate && !energy.findings.length && !energy.ambiguity.length)) return recommendation;
  const decisionRelevant = energy.ambiguity.filter((item) => item.recommendationEffect === "temper");
  const nonAction = [];
  if (energy.energyStrategy?.adjustmentAuthorization === "user_required" ||
      energy.energyStrategy?.automaticAdjustmentAllowed === false) {
    nonAction.push("no_automatic_energy_target_change");
  }
  if (decisionRelevant.length) nonAction.push("no_energy_target_change_on_the_estimate_alone");
  return {
    ...recommendation,
    strength: decisionRelevant.length ? "tempered" : "firm",
    ...(nonAction.length ? { nonAction } : {}),
    ...(decisionRelevant.length ? { ambiguityDrivers: decisionRelevant.map((item) => item.uncertaintyId) } : {}),
  };
}

export function toUncertaintyProfileEntries(energy) {
  return (energy?.ambiguity ?? []).map((item) => ({ ...item }));
}

function entry(type, materiality, reasons, evidenceIds) {
  const reasonList = uniqueStrings(reasons);
  const ids = uniqueStrings(evidenceIds);
  return {
    uncertaintyId: `uncertainty|${type}|${semanticFingerprint({ reasons: reasonList, evidenceIds: ids }).slice(7, 23)}`,
    type,
    domain: "energy",
    materiality,
    reasons: reasonList,
    evidenceIds: ids,
    // Moderate and high Energy ambiguity tempers how firmly Energy can be used
    // for a calorie decision; low ambiguity does not.
    recommendationEffect: materiality === "low" ? "none" : "temper",
  };
}

function idsWithLimitation(observations, prefix) {
  return observations.filter((item) =>
    item.limitations.some((code) => code.startsWith(prefix)) ||
    item.capabilities.some((measurement) =>
      (measurement.metadata?.ambiguity ?? []).some((code) => code.startsWith(prefix))))
    .map((item) => item.observationId);
}
