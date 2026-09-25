import { createEvidenceObservationV3 } from "./v3/EvidenceObservationV3.js";

// V2 Energy PI observations -> V3 evidence observations.
//
// The previous adaptation kept a single `energy_balance` observation and read
// its value from fields the V2 producer never sets, so the estimate arrived as
// value 0 / neutral with no coverage. This adapter carries the full Energy
// picture the V2 producer already computed:
//   - the actual current average and its comparison, with rising/falling trend
//   - paired-day counts and coverage ratio
//   - intake and activity levels, compared to the CURRENT Energy Strategy
//     targets when the Goal Contract carries them
//   - Nutrition and Activity coverage for the CURRENT window
//   - source-neutral reliability and intake/wearable ambiguity codes
//   - estimate-versus-outcome tension against the weight outcome
//
// Energy evidence remains narrative/attribution context in the Goal Contract
// (NARRATIVE_CONTEXT_ONLY): richer evidence does not change Confidence. It
// changes what V3 knows, and therefore what it can say and how firmly it can
// recommend.

// Exported so EnergyAmbiguityV3.js's per-day variability wiring uses the
// identical protocol-relative tolerance band as this file's own single-window
// plan comparison, rather than a second, drifting definition of "on plan."
export const PLAN_TOLERANCE_RATIO = 0.1;
const TENSION_MIN_EXPECTED_LB = 0.3;
const TENSION_MIN_OBSERVED_LB = 0.2;
const KCAL_PER_LB = 3500;

export function adaptEnergyObservationsV3({
  observations = [],
  goalContract,
  phase = null,
  artifactId,
  evidenceCutoff,
  fallbackWindow = null,
} = {}) {
  const energy = observations.filter((item) => item?.domain === "energy");
  const intake = energy.find((item) => item.kind === "energy_intake");
  const expenditure = energy.find((item) => item.kind === "energy_expenditure");
  const coverage = energy.find((item) => item.kind === "paired_day_coverage");
  // The producer omits the balance when it cannot be formed (for example food
  // logged but no activity recorded). The remaining Energy evidence is still
  // real, so the estimate is carried as explicitly unavailable, never dropped.
  const balance = energy.find((item) => item.kind === "energy_balance") ??
    ((intake || expenditure || coverage) ? {
      id: "energy.balance_unavailable",
      kind: "energy_balance",
      status: "insufficient_data",
      direction: "not_applicable",
      evidenceWindow: (coverage ?? intake ?? expenditure).evidenceWindow ?? null,
      explanationData: {},
      confidence: { limitations: [] },
      supportingEvidenceIds: [],
    } : null);
  if (!balance) return [];
  const weight = observations.find((item) => item?.domain === "weight" &&
    item.kind === "weight_average_change" && item.status !== "insufficient_data");
  const energyStrategy = goalContract?.strategy?.energyStrategy ?? null;
  const window = balance.evidenceWindow ?? fallbackWindow ?? null;
  const observedAt = timestamp(window?.endDate ?? evidenceCutoff);
  const base = {
    relatedGoalIds: [goalContract.goalId],
    phaseId: phase?.id ?? goalContract.phase.phaseId,
    strategyRevisionId: goalContract.strategy.strategyRevisionId,
    highSalienceEvent: false,
    evidenceWindow: window,
    observedAt,
    status: "active",
  };
  const idFor = (suffix) => `cadence_v3|${artifactId ?? evidenceCutoff}|${suffix}`;
  const pairing = describePairing(coverage);
  const intakeEvidence = coverage?.explanationData?.intakeEvidence ??
    intake?.explanationData?.intakeEvidence ?? balance.explanationData?.intakeEvidence ?? null;
  const activityEvidence = coverage?.explanationData?.activityEvidence ??
    expenditure?.explanationData?.activityEvidence ?? balance.explanationData?.activityEvidence ?? null;
  const ambiguity = collectAmbiguityCodes(balance, intake, expenditure, coverage);
  const tension = deriveOutcomeTension({ balance, weight });
  const result = [];

  // 1. The estimate itself, with its real value, trend, comparison and quality.
  const average = number(balance.explanationData?.currentAverage);
  result.push(createEvidenceObservationV3({
    ...base,
    observationId: idFor(balance.id),
    canonicalRecordId: balance.canonicalRecordId ?? balance.id,
    sourceType: "canonical_energy_observation",
    displayLabel: "Estimated energy balance",
    directness: "behavioral",
    quality: {
      status: qualityStatus({ confidence: balance.confidence, pairing, intakeEvidence }),
      provenance: balance.provenance?.producer ?? "energy_pi_observation_service",
      precision: "derived",
      completeness: pairing.quality === "complete" ? "reported" : "partial",
      comparability: number(balance.explanationData?.comparisonAverage) != null ? "comparable" : "unknown",
      coverageRatio: pairing.pairedCoverageRatio,
    },
    capabilities: [{
      capabilityId: "strategy.energy_balance_estimate",
      value: average ?? 0,
      unit: "kcal/day",
      comparisonValue: number(balance.explanationData?.comparisonAverage),
      factualSummary: describeBalance({ balance, pairing }),
      metadata: {
        signalDirection: "neutral",
        trendDirection: balance.direction ?? "not_applicable",
        measurementType: "DERIVED_ESTIMATE",
        valueAvailable: average != null,
        pairing,
        intakeEvidence,
        activityEvidence,
        ambiguity,
        ...(tension ? { estimateVsOutcomeTension: tension } : {}),
      },
    }],
    limitations: [...(balance.confidence?.limitations ?? []), ...ambiguity,
      ...(tension ? ["estimate_vs_outcome_tension"] : [])],
    sourceReferences: balance.supportingEvidenceIds ?? [],
  }));

  // 2. Intake against the current Energy Strategy target.
  const intakeAverage = number(intake?.explanationData?.currentAverage);
  if (intakeAverage != null) {
    const plan = compareToPlan(intakeAverage, energyStrategy?.intakeTarget, energyStrategy);
    result.push(createEvidenceObservationV3({
      ...base,
      observationId: idFor("energy|intake"),
      canonicalRecordId: `${intake.canonicalRecordId ?? intake.id}`,
      sourceType: "canonical_energy_observation",
      displayLabel: "Calorie intake",
      directness: "behavioral",
      quality: {
        status: qualityFromReliability(intakeEvidence?.weakestReliability, intake.confidence?.level),
        provenance: intake.provenance?.producer ?? "energy_pi_observation_service",
        precision: "derived",
        completeness: "reported",
        comparability: number(intake.explanationData?.comparisonAverage) != null ? "comparable" : "unknown",
        coverageRatio: ratioOf(intakeEvidence?.usableDayCount, pairing.eligibleDayCount),
      },
      capabilities: [{
        capabilityId: "execution.energy_intake",
        value: intakeAverage,
        unit: "kcal/day",
        comparisonValue: number(intake.explanationData?.comparisonAverage),
        factualSummary: describeIntake({ intakeAverage, plan, intakeEvidence }),
        metadata: {
          signalDirection: planSignal(plan),
          trendDirection: intake.direction ?? "not_applicable",
          measurementType: "RECORDED_INPUT",
          plan,
          intakeEvidence,
          ambiguity: intakeAmbiguity(intakeEvidence),
          // Per-day source, additive-only, for EnergyVariabilityV3. Carried
          // through unchanged from the V2 PI producer; no consumer of the
          // average-based fields above is affected by its presence.
          dailySeries: intake.explanationData?.dailySeries ?? [],
          comparisonDailySeries: intake.explanationData?.comparisonDailySeries ?? [],
        },
      }],
      limitations: [...(intake.confidence?.limitations ?? []), ...intakeAmbiguity(intakeEvidence)],
      sourceReferences: intake.supportingEvidenceIds ?? [],
    }));
  }

  // 3. Activity expenditure (a wearable-derived estimate) against its target.
  const activeAverage = number(expenditure?.explanationData?.componentAverages?.activeCalories);
  if (activeAverage != null) {
    const plan = compareToPlan(activeAverage, energyStrategy?.activityTarget, energyStrategy);
    result.push(createEvidenceObservationV3({
      ...base,
      observationId: idFor("energy|activity"),
      canonicalRecordId: `${expenditure.canonicalRecordId ?? expenditure.id}|active`,
      sourceType: "canonical_energy_observation",
      displayLabel: "Active calories",
      directness: "behavioral",
      quality: {
        status: qualityFromReliability(activityEvidence?.weakestReliability, expenditure.confidence?.level),
        provenance: expenditure.provenance?.producer ?? "energy_pi_observation_service",
        precision: "estimated",
        completeness: "reported",
        comparability: "unknown",
        coverageRatio: ratioOf(activityEvidence?.dayCount, pairing.eligibleDayCount),
      },
      capabilities: [{
        capabilityId: "execution.energy_activity",
        value: activeAverage,
        unit: "kcal/day",
        factualSummary: describeActivity({ activeAverage, plan, activityEvidence }),
        metadata: {
          signalDirection: planSignal(plan),
          measurementType: "WEARABLE_ESTIMATE",
          plan,
          activityEvidence,
          ambiguity: activityAmbiguity(activityEvidence),
        },
      }],
      limitations: [...activityAmbiguity(activityEvidence)],
      sourceReferences: expenditure.supportingEvidenceIds ?? [],
    }));
  }

  // 4. Energy pairing quality for the current window.
  if (coverage) {
    result.push(createEvidenceObservationV3({
      ...base,
      observationId: idFor("energy|pairing"),
      canonicalRecordId: coverage.canonicalRecordId ?? coverage.id,
      sourceType: "canonical_energy_observation",
      displayLabel: "Energy pairing",
      directness: "behavioral",
      quality: {
        status: pairing.pairedCoverageRatio >= 0.85 ? "adequate"
          : pairing.pairedCoverageRatio >= 0.5 ? "limited" : "insufficient",
        provenance: coverage.provenance?.producer ?? "energy_pi_observation_service",
        precision: "derived",
        completeness: pairing.quality === "complete" ? "reported" : "partial",
        comparability: "unknown",
        coverageRatio: pairing.pairedCoverageRatio,
      },
      capabilities: [{
        capabilityId: "execution.energy_pairing",
        value: pairing.pairedCoverageRatio,
        factualSummary: `Food and activity were both recorded on ${pairing.pairedDayCount} of ${pairing.eligibleDayCount} days.`,
        metadata: { signalDirection: "neutral", measurementType: "DERIVED_ESTIMATE", pairing },
      }],
      limitations: (coverage.confidence?.limitations ?? []).filter((code) =>
        ["nutrition_without_activity", "activity_without_nutrition", "paired_inputs_without_historical_rmr"].includes(code)),
      sourceReferences: coverage.supportingEvidenceIds ?? [],
    }));
  }

  // 5 and 6. Current-window Nutrition and Activity coverage. These replace any
  // stale prior-cadence coverage for the same capability (see supersession).
  if (intakeEvidence && pairing.eligibleDayCount) {
    result.push(createEvidenceObservationV3({
      ...base,
      observationId: idFor("nutrition|coverage"),
      canonicalRecordId: "nutrition|coverage",
      sourceType: "canonical_nutrition_observation",
      displayLabel: "nutrition coverage",
      directness: "behavioral",
      quality: {
        status: qualityFromReliability(intakeEvidence.weakestReliability, "moderate",
          ratioOf(intakeEvidence.usableDayCount, pairing.eligibleDayCount)),
        provenance: "canonical_nutrition_day_authority",
        precision: "derived",
        completeness: intakeEvidence.usableDayCount === pairing.eligibleDayCount ? "reported" : "partial",
        comparability: "unknown",
        coverageRatio: ratioOf(intakeEvidence.usableDayCount, pairing.eligibleDayCount),
      },
      capabilities: [{
        capabilityId: "execution.nutrition",
        value: ratioOf(intakeEvidence.usableDayCount, pairing.eligibleDayCount),
        factualSummary: `Nutrition daily totals covered ${intakeEvidence.usableDayCount} of ${pairing.eligibleDayCount} days in the briefing window${describeBasis(intakeEvidence)}.`,
        metadata: {
          signalDirection: "neutral",
          measurementType: "RECORDED_INPUT",
          intakeEvidence,
          ambiguity: intakeAmbiguity(intakeEvidence),
        },
      }],
      limitations: intakeAmbiguity(intakeEvidence),
      sourceReferences: intake?.supportingEvidenceIds ?? [],
    }));
  }
  if (activityEvidence && pairing.eligibleDayCount) {
    result.push(createEvidenceObservationV3({
      ...base,
      observationId: idFor("activity|coverage"),
      canonicalRecordId: "activity|coverage",
      sourceType: "canonical_activity_observation",
      displayLabel: "activity coverage",
      directness: "behavioral",
      quality: {
        status: qualityFromReliability(activityEvidence.weakestReliability, "moderate",
          ratioOf(activityEvidence.dayCount, pairing.eligibleDayCount)),
        provenance: "canonical_activity_day",
        precision: "estimated",
        completeness: activityEvidence.dayCount === pairing.eligibleDayCount ? "reported" : "partial",
        comparability: "unknown",
        coverageRatio: ratioOf(activityEvidence.dayCount, pairing.eligibleDayCount),
      },
      capabilities: [{
        capabilityId: "execution.activity",
        value: ratioOf(activityEvidence.dayCount, pairing.eligibleDayCount),
        factualSummary: `Activity evidence covered ${activityEvidence.dayCount} of ${pairing.eligibleDayCount} days in the briefing window (wearable estimate).`,
        metadata: {
          signalDirection: "neutral",
          measurementType: "WEARABLE_ESTIMATE",
          activityEvidence,
          ambiguity: activityAmbiguity(activityEvidence),
        },
      }],
      limitations: activityAmbiguity(activityEvidence),
      sourceReferences: expenditure?.supportingEvidenceIds ?? [],
    }));
  }

  // 7. Estimate-versus-outcome tension, when the energy estimate and the weight
  // outcome point in opposite directions.
  if (tension) {
    result.push(createEvidenceObservationV3({
      ...base,
      observationId: idFor("energy|outcome_tension"),
      canonicalRecordId: "energy|outcome_tension",
      sourceType: "canonical_energy_observation",
      displayLabel: "Energy estimate versus outcome",
      directness: "behavioral",
      quality: {
        status: "adequate",
        provenance: "energy_estimate_outcome_comparison",
        precision: "derived",
        completeness: "reported",
        comparability: "comparable",
        coverageRatio: pairing.pairedCoverageRatio,
      },
      capabilities: [{
        capabilityId: "strategy.energy_outcome_tension",
        value: tension.expectedWeightChangeLb - tension.observedWeightChangeLb,
        unit: "lb",
        factualSummary: `The energy estimate implies about ${signed(tension.expectedWeightChangeLb)} lb over the window, while average weight moved ${signed(tension.observedWeightChangeLb)} lb.`,
        metadata: { signalDirection: "neutral", measurementType: "ESTIMATE_VS_OUTCOME_TENSION", tension },
      }],
      limitations: ["estimate_vs_outcome_tension"],
      sourceReferences: [...(balance.supportingEvidenceIds ?? []), ...(weight?.supportingEvidenceIds ?? [])].slice(0, 40),
    }));
  }
  return result;
}

function describePairing(coverage) {
  const data = coverage?.explanationData ?? {};
  const eligible = number(data.eligibleDayCount) ?? number(data.evidenceDays) ?? 0;
  const paired = number(data.pairedDayCount) ??
    (number(data.completePairedDays) ?? 0) + (number(data.partialPairedDays ?? data.partialDays) ?? 0);
  const ratio = number(data.pairedCoverageRatio) ?? (eligible ? paired / eligible : 0);
  return {
    eligibleDayCount: eligible,
    pairedDayCount: paired,
    completePairedDayCount: number(data.completePairedDays) ?? paired,
    partialPairedDayCount: number(data.partialPairedDays ?? data.partialDays) ?? 0,
    unpairedNutritionDayCount: number(data.nutritionOnlyDays) ?? 0,
    unpairedActivityDayCount: number(data.activityOnlyDays) ?? 0,
    pairedCoverageRatio: round(ratio, 3),
    completenessWeightedCoverageRatio: round(number(data.completenessWeightedCoverageRatio) ?? ratio, 3),
    quality: eligible && paired === eligible ? "complete" : paired ? "partial" : "insufficient",
  };
}

function compareToPlan(observed, target, energyStrategy) {
  if (!Number.isFinite(target?.value) || !Number.isFinite(observed)) return null;
  const deviation = round(observed - target.value, 1);
  const ratio = round(deviation / target.value, 4);
  return {
    targetValue: target.value,
    unit: target.unit ?? "kcal/day",
    observedValue: round(observed, 1),
    deviation,
    deviationRatio: ratio,
    toleranceRatio: PLAN_TOLERANCE_RATIO,
    state: Math.abs(ratio) <= PLAN_TOLERANCE_RATIO ? "on_plan" : ratio < 0 ? "below_plan" : "above_plan",
    authorization: energyStrategy?.adjustmentAuthorization ?? null,
    targetSource: energyStrategy?.protocolVersionId ?? null,
  };
}

function planSignal(plan) {
  if (!plan) return "neutral";
  return plan.state === "on_plan" ? "supports" : "neutral";
}

function deriveOutcomeTension({ balance, weight }) {
  const estimate = number(balance?.explanationData?.currentAverage);
  const observed = number(weight?.explanationData?.absoluteChange);
  const days = number(balance?.explanationData?.currentSampleCount);
  if (estimate == null || observed == null || !days) return null;
  const expected = round(estimate * days / KCAL_PER_LB, 2);
  const opposite = Math.sign(expected) !== 0 && Math.sign(observed) !== 0 &&
    Math.sign(expected) !== Math.sign(observed);
  if (!opposite || Math.abs(expected) < TENSION_MIN_EXPECTED_LB ||
      Math.abs(observed) < TENSION_MIN_OBSERVED_LB) return null;
  const prior = number(balance.explanationData?.comparisonAverage);
  // The weight average lags energy balance; a prior window that points the same
  // way as the outcome makes part of the tension plausible rather than unexplained.
  const lagPlausible = prior != null && Math.sign(prior) === Math.sign(observed) && Math.abs(prior) >= 100;
  return {
    type: "estimate_vs_outcome_tension",
    estimateAverageKcalPerDay: estimate,
    expectedWeightChangeLb: expected,
    observedWeightChangeLb: observed,
    priorWindowBalanceKcalPerDay: prior,
    lagPlausible,
    materiality: lagPlausible ? "moderate" : "high",
  };
}

function collectAmbiguityCodes(...observations) {
  const codes = new Set();
  for (const item of observations) {
    for (const code of item?.confidence?.limitations ?? []) {
      if (RECOGNIZED_AMBIGUITY.has(code)) codes.add(code);
    }
    for (const code of item?.explanationData?.limitations ?? []) {
      if (RECOGNIZED_AMBIGUITY.has(code)) codes.add(code);
    }
  }
  return [...codes].sort();
}

const RECOGNIZED_AMBIGUITY = new Set([
  "intake_meal_derived_unverified",
  "intake_meal_capture_flagged_partial",
  "intake_partial_subtotal",
  "intake_source_conflict",
  "intake_totals_missing",
  "active_expenditure_is_wearable_estimated",
  "expenditure_is_estimated_rmr_plus_active_calories",
  "some_days_lack_complete_paired_energy_evidence",
  "nutrition_without_activity",
  "activity_without_nutrition",
]);

function intakeAmbiguity(evidence) {
  return (evidence?.ambiguity ?? []).filter((code) => code.startsWith("intake_"));
}

function activityAmbiguity(evidence) {
  return evidence ? ["active_expenditure_is_wearable_estimated"] : [];
}

// Measurement quality only: coverage, capture reliability and source conflict.
// Estimate-versus-outcome tension is carried as its own ambiguity, not as a
// downgrade of the measurement.
function qualityStatus({ confidence, pairing, intakeEvidence }) {
  if (pairing.pairedCoverageRatio < 0.5 || intakeEvidence?.weakestReliability === "low" ||
      intakeEvidence?.ambiguity?.includes("intake_source_conflict")) return "limited";
  return confidence?.level === "high" || confidence?.level === "very_high" ? "robust"
    : confidence?.level === "moderate" ? "adequate" : "limited";
}

function qualityFromReliability(reliability, level, coverageRatio = 1) {
  if (reliability === "none" || coverageRatio < 0.5) return "insufficient";
  if (reliability === "low" || coverageRatio < 0.85) return "limited";
  if (reliability === "high" && (level === "high" || level === "very_high")) return "robust";
  return "adequate";
}

function describeBalance({ balance, pairing }) {
  const average = number(balance.explanationData?.currentAverage);
  if (average == null) return "The energy estimate is available, but its value could not be determined.";
  const prior = number(balance.explanationData?.comparisonAverage);
  return `Estimated energy balance averaged ${signed(average)} kcal/day across ${pairing.pairedDayCount} paired days` +
    ` (RMR plus active calories)${prior != null ? `; the prior comparable window averaged ${signed(prior)} kcal/day` : ""}.`;
}

function describeIntake({ intakeAverage, plan, intakeEvidence }) {
  const against = plan
    ? `, ${Math.abs(plan.deviation)} kcal/day ${plan.deviation < 0 ? "below" : plan.deviation > 0 ? "above" : "at"} the ${plan.targetValue} kcal/day target`
    : "";
  return `Calorie intake averaged ${round(intakeAverage, 0)} kcal/day${against}${describeBasis(intakeEvidence)}.`;
}

function describeActivity({ activeAverage, plan, activityEvidence }) {
  const against = plan
    ? `, ${Math.abs(plan.deviation)} kcal/day ${plan.deviation < 0 ? "below" : plan.deviation > 0 ? "above" : "at"} the ${plan.targetValue} kcal/day target`
    : "";
  return `Active calories averaged ${round(activeAverage, 0)} kcal/day${against} (wearable estimate${activityEvidence?.weakestReliability === "moderate" ? " read from screenshots" : ""}).`;
}

function describeBasis(evidence) {
  if (!evidence?.byTier) return "";
  const tiers = Object.keys(evidence.byTier);
  if (tiers.length === 1 && tiers[0] === "meal_derived_unverified") return " (meal-derived totals, moderate reliability)";
  if (tiers.length === 1 && tiers[0] === "full_day_asserted") return " (full-day totals)";
  return "";
}

function ratioOf(part, whole) {
  return whole > 0 && Number.isFinite(part) ? round(part / whole, 3) : null;
}

function number(value) {
  const parsed = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function signed(value) {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function timestamp(value) {
  const text = String(value ?? "");
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text;
  return new Date(normalized).toISOString();
}
