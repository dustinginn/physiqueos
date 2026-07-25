import {
  createHistoricalRmrIndex,
  getCanonicalLocalDate,
  reconcileEnergyDays,
  resolveHistoricalRmr,
} from "./EnergyDailyReconciliationService";
import {
  resolveActivityEvidenceCompleteness,
  resolveNutritionEvidenceCompleteness,
  resolvePairedEnergyDayCompleteness,
} from "./EnergyEvidenceCompletenessService";

export const CADENCE_ENERGY_ASSESSMENT_SCHEMA_VERSION =
  "cadence_energy_assessment_v1";
export const CADENCE_ENERGY_ASSESSMENT_SERVICE_VERSION =
  "cadence_energy_assessment_service_v1";
export const CADENCE_RMR_STRATEGIES = Object.freeze({
  LATEST_ELIGIBLE_FOR_WINDOW: "latest_eligible_rmr_for_window",
  HISTORICAL_BY_DAY: "historical_rmr_by_day",
});

export function createCadenceEnergyAssessment({
  cadence,
  window,
  comparisonWindow = null,
  timeZone = window?.timeZone ?? "America/Los_Angeles",
  nutritionDays = [],
  activityDays = [],
  dexaScans = [],
  rmrStrategy = CADENCE_RMR_STRATEGIES.HISTORICAL_BY_DAY,
} = {}) {
  const before = structuredClone({ nutritionDays, activityDays, dexaScans });
  const normalizedWindow = normalizeWindow(window, "window");
  const normalizedComparison = comparisonWindow
    ? normalizeWindow(comparisonWindow, "comparisonWindow")
    : null;
  if (!cadence) throw new Error("cadence is required.");
  if (!Object.values(CADENCE_RMR_STRATEGIES).includes(rmrStrategy)) {
    throw new Error(`Unsupported RMR strategy: ${rmrStrategy}`);
  }
  const dates = dateRange(normalizedWindow.startDate, normalizedWindow.endDate);
  const inWindow = (item) =>
    item &&
    getCanonicalLocalDate(item.date, timeZone) >= normalizedWindow.startDate &&
    getCanonicalLocalDate(item.date, timeZone) <= normalizedWindow.endDate;
  const nutrition = nutritionDays.map(normalizeNutrition).filter(inWindow);
  const activity = activityDays.map(normalizeActivity).filter(inWindow);
  const rows = reconcileEnergyDays({
    nutritionDays: nutrition,
    activityDays: activity,
    dexaScans,
    calendarDates: dates,
    timeZone,
  });
  const selectedRmr = rmrStrategy === CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW
    ? resolveHistoricalRmr(createHistoricalRmrIndex(dexaScans, timeZone), normalizedWindow.endDate)
    : null;
  const nutritionStateByDate = new Map(
    nutrition.map((item) => [getCanonicalLocalDate(item.date, timeZone), item.evidenceCompleteness])
  );
  const activityStateByDate = new Map(
    activity.map((item) => [getCanonicalLocalDate(item.date, timeZone), item.evidenceCompleteness])
  );
  const dailyRecords = rows.map((sourceRow) => {
    const row = rmrStrategy === CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW
      ? applyWindowRmr(sourceRow, selectedRmr)
      : sourceRow;
    const nutritionCompleteness =
      nutritionStateByDate.get(row.date) ?? "missing";
    const activityCompleteness =
      activityStateByDate.get(row.date) ?? "missing";
    return {
      ...row,
      nutritionCompleteness,
      activityCompleteness,
      pairedCompleteness: resolvePairedEnergyDayCompleteness(
        nutritionCompleteness,
        activityCompleteness
      ),
      eligibility: {
        nutrition: row.calorieIntake != null,
        activity: row.activeCalories != null,
        paired: row.energyBalance != null,
      },
      completenessLimitations: [
        nutritionCompleteness === "unknown"
          ? "nutrition_completeness_unknown"
          : null,
        activityCompleteness === "unknown"
          ? "activity_completeness_unknown"
          : null,
      ].filter(Boolean),
    };
  });
  const result = buildAssessment({
    cadence,
    window: normalizedWindow,
    comparisonWindow: normalizedComparison,
    timeZone,
    rmrStrategy,
    selectedRmr,
    dailyRecords,
  });
  if (JSON.stringify({ nutritionDays, activityDays, dexaScans }) !== JSON.stringify(before)) {
    throw new Error("Cadence Energy assessment input mutation detected.");
  }
  return deepFreeze(result);
}

export function createCadenceEnergyComparison(currentAssessment, comparisonAssessment) {
  validateCadenceEnergyAssessment(currentAssessment);
  validateCadenceEnergyAssessment(comparisonAssessment);
  const compatible =
    currentAssessment.rmr.strategy === comparisonAssessment.rmr.strategy;
  return deepFreeze({
    schemaVersion: "cadence_energy_comparison_v1",
    currentWindow: currentAssessment.window,
    comparisonWindow: comparisonAssessment.window,
    intake: compareMetric(currentAssessment.intake.average, comparisonAssessment.intake.average),
    estimatedExpenditure: compareMetric(
      currentAssessment.estimatedExpenditure.average,
      comparisonAssessment.estimatedExpenditure.average
    ),
    netBalance: compareMetric(
      currentAssessment.netBalance.average,
      comparisonAssessment.netBalance.average
    ),
    coverage: {
      currentRatio: currentAssessment.coverage.coverageRatio,
      comparisonRatio: comparisonAssessment.coverage.coverageRatio,
      change: difference(
        currentAssessment.coverage.coverageRatio,
        comparisonAssessment.coverage.coverageRatio
      ),
    },
    rmrStrategyCompatible: compatible,
    limitations: compatible ? [] : ["rmr_strategy_mismatch"],
  });
}

export function isCadenceEnergyAssessment(value) {
  return Boolean(
    value &&
    value.schemaVersion === CADENCE_ENERGY_ASSESSMENT_SCHEMA_VERSION &&
    value.window?.startDate &&
    value.window?.endDate &&
    Array.isArray(value.dailyRecords)
  );
}

export function validateCadenceEnergyAssessment(value) {
  if (!isCadenceEnergyAssessment(value)) {
    throw new Error("Invalid cadence Energy assessment.");
  }
  return value;
}

function buildAssessment({
  cadence,
  window,
  comparisonWindow,
  timeZone,
  rmrStrategy,
  selectedRmr,
  dailyRecords,
}) {
  const nutritionRows = dailyRecords.filter((row) => row.calorieIntake != null);
  const activityRows = dailyRecords.filter((row) => row.activeCalories != null);
  const paired = dailyRecords.filter((row) => row.energyBalance != null);
  const nutritionIds = ids(dailyRecords.map((row) => row.nutritionDayId));
  const activityIds = ids(dailyRecords.map((row) => row.activityDayId));
  const rmrIds = ids(dailyRecords.map((row) => row.rmrScanId));
  const hasRmr = dailyRecords.some((row) => row.rmr != null);
  const missing = dailyRecords.filter(
    (row) => row.calorieIntake == null && row.activeCalories == null
  ).length;
  const pairedComplete = paired.filter(
    (row) => row.pairedCompleteness === "complete"
  ).length;
  const pairedPartial = paired.filter(
    (row) => row.pairedCompleteness === "partial"
  ).length;
  const pairedUnknown = paired.filter(
    (row) => row.pairedCompleteness === "unknown"
  ).length;
  return {
    schemaVersion: CADENCE_ENERGY_ASSESSMENT_SCHEMA_VERSION,
    cadence,
    window,
    comparisonWindow,
    timeZone,
    intake: metricSummary(nutritionRows, "calorieIntake", {
      completeDayCount: countState(dailyRecords, "nutritionCompleteness", "complete"),
      partialDayCount: countState(dailyRecords, "nutritionCompleteness", "partial"),
      unknownDayCount: countState(dailyRecords, "nutritionCompleteness", "unknown"),
      missingDayCount: dailyRecords.length - nutritionRows.length,
      evidenceIds: nutritionIds,
    }),
    activity: metricSummary(activityRows, "activeCalories", {
      completeDayCount: countState(dailyRecords, "activityCompleteness", "complete"),
      partialDayCount: countState(dailyRecords, "activityCompleteness", "partial"),
      unknownDayCount: countState(dailyRecords, "activityCompleteness", "unknown"),
      missingDayCount: dailyRecords.length - activityRows.length,
      evidenceIds: activityIds,
    }),
    rmr: {
      value: selectedRmr?.rmr ?? singleValue(dailyRecords.map((row) => row.rmr)),
      unit: "kcal/day",
      sourceType: rmrIds.length ? "dexa" : hasRmr ? "explicit_fallback" : null,
      sourceDexaId: selectedRmr?.scanId ?? (rmrIds.length === 1 ? rmrIds[0] : null),
      sourceDexaDate: selectedRmr?.date ?? singleValue(
        dailyRecords.map((row) => row.rmrScanDate)
      ),
      strategy: rmrStrategy,
      selectionMethod: rmrStrategy,
      latestEligibleUsedAcrossFullWindow:
        rmrStrategy === CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW,
      historicalPerDaySelection:
        rmrStrategy === CADENCE_RMR_STRATEGIES.HISTORICAL_BY_DAY,
      limitations: !hasRmr
        ? ["rmr_unavailable"]
        : rmrIds.length
          ? []
          : ["rmr_evidence_id_unavailable"],
    },
    estimatedExpenditure: metricSummary(
      dailyRecords.filter((row) => row.estimatedExpenditure != null),
      "estimatedExpenditure",
      { method: "rmr_plus_active_calories", estimated: true }
    ),
    netBalance: {
      ...metricSummary(paired, "energyBalance"),
      direction: balanceDirection(average(paired.map((row) => row.energyBalance))),
    },
    coverage: {
      eligibleDayCount: dailyRecords.length,
      pairedDayCount: paired.length,
      completePairedDayCount: pairedComplete,
      partialPairedDayCount: pairedPartial,
      unknownPairedDayCount: pairedUnknown,
      unpairedNutritionDayCount: dailyRecords.filter(
        (row) => row.completeness === "nutrition-only"
      ).length,
      unpairedActivityDayCount: dailyRecords.filter(
        (row) => row.completeness === "activity-only"
      ).length,
      missingDayCount: missing,
      state: pairedComplete === dailyRecords.length
        ? "complete"
        : paired.length
          ? "partial"
          : "insufficient",
      coverageRatio: dailyRecords.length
        ? (pairedComplete + pairedPartial * 0.5) / dailyRecords.length
        : 0,
    },
    dailyRecords,
    supportingEvidenceIds: ids([...nutritionIds, ...activityIds, ...rmrIds]),
    limitations: ids([
      ...(paired.length < dailyRecords.length ? ["paired_coverage_incomplete"] : []),
      ...(pairedPartial ? ["paired_coverage_partial"] : []),
      ...(pairedUnknown ? ["paired_completeness_unknown"] : []),
      ...(!hasRmr
        ? ["rmr_unavailable"]
        : rmrIds.length
          ? []
          : ["rmr_evidence_id_unavailable"]),
    ]),
    provenance: {
      service: "CadenceEnergyAssessmentService",
      serviceVersion: CADENCE_ENERGY_ASSESSMENT_SERVICE_VERSION,
      calculationMethod: "canonical_reconciled_rmr_plus_active",
      sourceEvidenceIds: ids([...nutritionIds, ...activityIds, ...rmrIds]),
      window,
      comparisonWindow,
      rmrSelectionMethod: rmrStrategy,
      repositoryReads: 0,
    },
  };
}

function applyWindowRmr(row, rmrRecord) {
  const estimatedExpenditure =
    rmrRecord?.rmr != null && row.activeCalories != null
      ? rmrRecord.rmr + row.activeCalories
      : null;
  const energyBalance =
    row.calorieIntake != null && estimatedExpenditure != null
      ? row.calorieIntake - estimatedExpenditure
      : null;
  let completeness = "no-paired-evidence";
  if (energyBalance != null) completeness = "complete";
  else if (row.calorieIntake != null && row.activeCalories == null)
    completeness = "nutrition-only";
  else if (row.calorieIntake == null && row.activityDayId != null)
    completeness = "activity-only";
  else if (row.calorieIntake != null && row.activeCalories != null)
    completeness = "missing-rmr";
  return {
    ...row,
    rmr: rmrRecord?.rmr ?? null,
    rmrScanId: rmrRecord?.scanId ?? null,
    rmrScanDate: rmrRecord?.date ?? null,
    estimatedExpenditure,
    expenditureKind: estimatedExpenditure == null
      ? "unavailable"
      : "estimated_rmr_plus_active",
    energyBalance,
    completeness,
  };
}

function normalizeNutrition(item) {
  const payload = item?.payload ?? item;
  const date = payload.date ?? payload.observed_at ?? item?.lastObservedAt;
  if (!date) return null;
  return {
    id: item?.canonicalId ?? item?.id ?? payload.id ?? null,
    date,
    totals: payload.totals ?? payload.daily_totals,
    daily_totals: payload.daily_totals,
    sourceEvidence: payload.sourceEvidence ?? [],
    evidenceCompleteness: resolveNutritionEvidenceCompleteness(item),
  };
}

function normalizeActivity(item) {
  const payload = item?.payload ?? item;
  const date = payload.date ?? payload.observed_at ?? item?.lastObservedAt;
  if (!date) return null;
  return {
    id: item?.canonicalId ?? item?.id ?? payload.id ?? null,
    date,
    activeCalories:
      payload.activeCalories ?? payload.daily_activity?.move_calories,
    evidenceCompleteness: resolveActivityEvidenceCompleteness(item),
  };
}

function metricSummary(rows, key, extras = {}) {
  const values = rows.map((row) => row[key]).filter(Number.isFinite);
  return {
    total: sum(values),
    average: average(values),
    eligibleDayCount: values.length,
    ...extras,
  };
}
function countState(rows, field, state) {
  return rows.filter((row) => row[field] === state).length;
}

function compareMetric(current, previous) {
  const change = difference(current, previous);
  return { current, previous, change, direction: movement(change) };
}
function movement(value) {
  if (!Number.isFinite(value)) return "not_applicable";
  if (value > 0) return "rising";
  if (value < 0) return "falling";
  return "stable";
}
function balanceDirection(value) {
  if (!Number.isFinite(value)) return "unclear";
  if (value > 100) return "probably_above";
  if (value < -100) return "probably_below";
  return "roughly_at";
}
function difference(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) ? left - right : null;
}
function sum(values) {
  return values.length ? round(values.reduce((total, value) => total + value, 0)) : null;
}
function average(values) {
  return values.length ? round(values.reduce((total, value) => total + value, 0) / values.length) : null;
}
function round(value) {
  return Math.round(value * 10) / 10;
}
function singleValue(values) {
  const unique = ids(values);
  return unique.length === 1 ? unique[0] : null;
}
function ids(values) {
  return [...new Set(values.filter((value) => value != null))].sort();
}
function dateRange(startDate, endDate) {
  const result = [];
  for (let value = startDate; value <= endDate;) {
    result.push(value);
    const date = new Date(`${value}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    value = date.toISOString().slice(0, 10);
  }
  return result;
}
function normalizeWindow(value, field) {
  if (!value?.startDate || !value?.endDate) {
    throw new Error(`${field} requires startDate and endDate.`);
  }
  return {
    ...value,
    startDate: getCanonicalLocalDate(value.startDate, value.timeZone),
    endDate: getCanonicalLocalDate(value.endDate, value.timeZone),
  };
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
