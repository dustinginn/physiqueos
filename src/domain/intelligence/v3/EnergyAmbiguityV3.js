import { semanticFingerprint, uniqueStrings } from "./V3Runtime.js";

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

  const ambiguity = [];
  const intakeCodes = uniqueStrings(energyObservations.flatMap((item) => [
    ...item.limitations, ...item.capabilities.flatMap((measurement) => measurement.metadata?.ambiguity ?? []),
  ]).filter((code) => code.startsWith("intake_")));
  if (intakeCodes.length) {
    ambiguity.push(entry(EnergyAmbiguityTypeV3.INTAKE,
      intakeCodes.some((code) => HIGH_INTAKE_CODES.has(code)) ? "high" : "moderate", intakeCodes,
      idsWithLimitation(energyObservations, "intake_")));
  }
  const wearable = energyObservations.filter((item) =>
    item.limitations.includes("active_expenditure_is_wearable_estimated") ||
    item.capabilities.some((measurement) => measurement.metadata?.measurementType === "WEARABLE_ESTIMATE"));
  const tensions = energyObservations.flatMap((item) => item.capabilities
    .map((measurement) => measurement.metadata?.tension ?? measurement.metadata?.estimateVsOutcomeTension)
    .filter(Boolean));
  if (wearable.length) {
    ambiguity.push(entry(EnergyAmbiguityTypeV3.WEARABLE_ESTIMATE, tensions.length ? "high" : "moderate",
      ["active_expenditure_is_wearable_estimated"], wearable.map((item) => item.observationId)));
  }
  const pairing = byCapability("execution.energy_pairing")[0] ?? null;
  if (pairing) {
    const details = metadataOf(pairing, "execution.energy_pairing").pairing ?? {};
    const ratio = Number(details.pairedCoverageRatio);
    if (Number.isFinite(ratio) && ratio < 1) {
      ambiguity.push(entry(EnergyAmbiguityTypeV3.PAIRING,
        ratio < 0.5 ? "high" : ratio < 0.85 ? "moderate" : "low",
        [`paired_days_${details.pairedDayCount}_of_${details.eligibleDayCount}`,
          ...(details.unpairedActivityDayCount ? ["activity_missing_for_some_days"] : []),
          ...(details.unpairedNutritionDayCount ? ["nutrition_missing_for_some_days"] : [])],
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
    averageKcalPerDay: estimateMeasurement.metadata?.valueAvailable === false ? null : estimateMeasurement.value,
    comparisonAverageKcalPerDay: estimateMeasurement.comparisonValue ?? null,
    trendDirection: estimateMeasurement.metadata?.trendDirection ?? "not_applicable",
    measurementType: estimateMeasurement.metadata?.measurementType ?? "DERIVED_ESTIMATE",
    pairing: estimateMeasurement.metadata?.pairing ?? null,
    intakeEvidence: estimateMeasurement.metadata?.intakeEvidence ?? null,
    activityEvidence: estimateMeasurement.metadata?.activityEvidence ?? null,
    quality: estimateObservation.quality.status,
  }) : null;

  return Object.freeze({
    energyStrategy,
    estimate,
    findings: Object.freeze(findings),
    ambiguity: Object.freeze(ambiguity),
  });
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
