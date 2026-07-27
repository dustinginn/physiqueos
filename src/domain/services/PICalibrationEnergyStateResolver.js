import {
  createPISemanticFingerprint,
} from "./PILowerLevelConfidenceContracts";

export const PI_CALIBRATION_ENERGY_STATE_VERSION =
  "pi_calibration_energy_state_v1";
export const PI_CALIBRATION_ENERGY_STATES = Object.freeze([
  "insufficient_or_incomplete",
  "persistent_deficit",
  "near_maintenance",
  "large_surplus",
]);
export const PI_CALIBRATION_ENERGY_RELIABILITY = Object.freeze([
  "insufficient",
  "directional",
  "reliable",
]);

// Versioned defaults reconcile existing PI evidence confidence (four supported
// days) with the established conservative calibration bands used by Event
// context. Completeness and persistence gates prevent numeric-only authority.
export const PI_CALIBRATION_ENERGY_DEFAULTS = Object.freeze({
  version: "pi_calibration_energy_thresholds_v1",
  deficitBelowKcalPerDay: -150,
  surplusAboveKcalPerDay: 250,
  minimumDirectionalPairs: 2,
  minimumReliablePairs: 4,
  minimumCompletePairs: 3,
  minimumPersistentDirectionalPairs: 3,
  minimumCoverageRatio: 0.7,
});

export function resolvePICalibrationEnergyState(input = {}) {
  validateContext(input);
  const config = { ...PI_CALIBRATION_ENERGY_DEFAULTS, ...(input.config ?? {}) };
  const rows = [...(input.dailyRecords ?? [])]
    .map(normalizeRow)
    .sort((left, right) => left.date.localeCompare(right.date));
  const paired = rows.filter((row) => row.energyBalance != null);
  const complete = paired.filter((row) => row.pairedCompleteness === "complete");
  const partial = paired.filter((row) =>
    ["partial", "unknown"].includes(row.pairedCompleteness)
  );
  const nutritionIds = ids(rows.map((row) => row.nutritionDayId));
  const activityIds = ids(rows.map((row) => row.activityDayId));
  const pairedDayIdentities = paired.map((row) =>
    `${row.date}|${row.nutritionDayId}|${row.activityDayId}`
  );
  const balances = paired.map((row) => row.energyBalance);
  const average = balances.length
    ? Math.round(balances.reduce((sum, value) => sum + value, 0) / balances.length)
    : null;
  const total = balances.length
    ? Math.round(balances.reduce((sum, value) => sum + value, 0))
    : null;
  const eligibleDays = Math.max(rows.length, input.eligibleDayCount ?? 0);
  const coverageRatio = eligibleDays ? paired.length / eligibleDays : 0;
  const matchedInputs = rows.filter((row) =>
    row.nutritionDayId && row.activityDayId
  );
  const expenditureComplete =
    matchedInputs.length > 0 && matchedInputs.every((row) =>
    row.estimatedExpenditure != null && row.rmr != null &&
    row.activeCalories != null
  );
  const numericDirection = directionFor(average, config);
  const persistentCount = paired.filter((row) =>
    directionFor(row.energyBalance, config) === numericDirection
  ).length;
  const reliable =
    paired.length >= config.minimumReliablePairs &&
    complete.length >= config.minimumCompletePairs &&
    coverageRatio >= config.minimumCoverageRatio &&
    expenditureComplete &&
    persistentCount >= config.minimumPersistentDirectionalPairs;
  const directional =
    paired.length >= config.minimumDirectionalPairs && expenditureComplete;
  const reliability = reliable
    ? "reliable"
    : directional
      ? "directional"
      : "insufficient";
  const state = reliable
    ? stateForDirection(numericDirection)
    : "insufficient_or_incomplete";
  const evidenceCutoff = normalizeCutoff(
    input.evidenceCutoff,
    rows.at(-1)?.date
  );
  const semantic = {
    interpretationVersion: PI_CALIBRATION_ENERGY_STATE_VERSION,
    thresholdVersion: config.version,
    goalId: input.goalId,
    phaseId: input.phaseId,
    operatingState: input.operatingState,
    rollingWindowId: input.rollingWindowId,
    state,
    reliability,
    direction: state === "near_maintenance"
      ? "neutral"
      : state === "persistent_deficit"
        ? "negative"
        : state === "large_surplus"
          ? "positive"
          : "not_applicable",
    strength: reliable ? "high" : directional ? "moderate" : "low",
    canonicalNutritionIds: nutritionIds,
    canonicalActivityIds: activityIds,
    pairedDayIdentities,
    evidenceCutoff,
  };
  const limitingReasons = [
    paired.length < config.minimumReliablePairs ? "paired_coverage_insufficient" : null,
    complete.length < config.minimumCompletePairs ? "complete_pair_coverage_insufficient" : null,
    coverageRatio < config.minimumCoverageRatio ? "rolling_window_coverage_insufficient" : null,
    !expenditureComplete ? "estimated_expenditure_basis_incomplete" : null,
    persistentCount < config.minimumPersistentDirectionalPairs ? "direction_not_persistent" : null,
  ].filter(Boolean);
  const interpretationFingerprint = createPISemanticFingerprint(semantic);
  return deepFreeze({
    schemaVersion: PI_CALIBRATION_ENERGY_STATE_VERSION,
    id: `pi_energy_interpretation|${interpretationFingerprint.slice(7)}`,
    ...semantic,
    pairedDayCount: paired.length,
    completePairCount: complete.length,
    partialPairCount: partial.length,
    averageEstimatedDailyBalance: average,
    totalEstimatedBalance: total,
    reliabilityStatus: reliability,
    limitingReasons,
    interpretationFingerprint,
    publicationEligible: reliable && state !== "insufficient_or_incomplete",
  });
}

function validateContext(input) {
  if (
    input.semanticGoalType !== "build_lean_mass" ||
    input.semanticPhaseType !== "establish_maintenance" ||
    input.operatingState !== "calibration"
  ) {
    throw new Error("unsupported_goal_phase_operating_state");
  }
  for (const field of ["goalId", "phaseId", "rollingWindowId"]) {
    if (!input[field]) throw new Error(`${field} is required.`);
  }
}
function normalizeRow(row = {}) {
  return {
    date: String(row.date ?? ""),
    nutritionDayId: row.nutritionDayId ?? null,
    activityDayId: row.activityDayId ?? null,
    energyBalance: finite(row.energyBalance),
    estimatedExpenditure: finite(row.estimatedExpenditure),
    rmr: finite(row.rmr),
    activeCalories: finite(row.activeCalories),
    pairedCompleteness: row.pairedCompleteness ?? row.completeness ?? "unknown",
  };
}
function directionFor(value, config) {
  if (!Number.isFinite(value)) return "unknown";
  if (value < config.deficitBelowKcalPerDay) return "deficit";
  if (value > config.surplusAboveKcalPerDay) return "surplus";
  return "near_maintenance";
}
function stateForDirection(direction) {
  return ({
    deficit: "persistent_deficit",
    surplus: "large_surplus",
    near_maintenance: "near_maintenance",
  })[direction] ?? "insufficient_or_incomplete";
}
function normalizeCutoff(value, fallbackDate) {
  const source = value ?? (fallbackDate ? `${fallbackDate}T23:59:59.999Z` : null);
  if (!Number.isFinite(Date.parse(source))) throw new Error("evidenceCutoff is required.");
  return new Date(source).toISOString();
}
function finite(value) {
  const number = Number(value);
  return value == null || value === "" || !Number.isFinite(number) ? null : number;
}
function ids(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
