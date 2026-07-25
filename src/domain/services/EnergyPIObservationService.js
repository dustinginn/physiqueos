import {
  createPIObservation,
  sortPIObservations,
} from "./PIObservationService";
import { reconcileEnergyDays } from "./EnergyDailyReconciliationService";
import { createEnergyPresentation } from "./EnergyEvidenceService";

export const ENERGY_PI_PRODUCER_VERSION = "energy_pi_v1";
export const DAILY_ENERGY_PI_SEMANTIC_HORIZON = "daily";

const METRICS = Object.freeze([
  {
    key: "intake",
    kind: "energy_intake",
    field: "calorieIntake",
    subjectId: "caloric_intake",
  },
  {
    key: "expenditure",
    kind: "energy_expenditure",
    field: "estimatedExpenditure",
    subjectId: "estimated_expenditure",
  },
  {
    key: "balance",
    kind: "energy_balance",
    field: "energyBalance",
    subjectId: "estimated_energy_balance",
  },
]);

export function createEnergyPIObservations({
  days = null,
  reconciliationInput = null,
  observationWindow,
  comparisonWindow = null,
  requestedKinds = [
    "energy_intake",
    "energy_expenditure",
    "energy_balance",
    "paired_day_coverage",
  ],
  semanticHorizon = "rolling_7_days",
  includeInsufficientData = false,
} = {}) {
  const reconciled = resolveDays({ days, reconciliationInput });
  const current = selectDays(reconciled, observationWindow);
  const comparison = comparisonWindow
    ? selectDays(reconciled, comparisonWindow)
    : [];
  const kinds = normalizeKinds(requestedKinds);
  const observations = [];

  METRICS.filter((metric) => kinds.includes(metric.kind)).forEach((metric) => {
    const observation = createMetricObservation({
      comparison,
      comparisonWindow,
      current,
      includeInsufficientData,
      metric,
      observationWindow,
      semanticHorizon,
    });
    if (observation) observations.push(observation);
  });

  if (kinds.includes("paired_day_coverage")) {
    const coverage = createCoverageObservation({
      current,
      includeInsufficientData,
      observationWindow,
      semanticHorizon,
    });
    if (coverage) observations.push(coverage);
  }

  return sortPIObservations(observations);
}

export function createDailyEnergyPIObservations({
  precomputedAssessment,
  includeInsufficientData = false,
} = {}) {
  const assessment = normalizeDailyEnergyAssessment(precomputedAssessment);
  const observations = METRICS.map((metric) =>
    createDailyEnergyMetricObservation({
      assessment,
      includeInsufficientData,
      metric,
    })
  ).filter(Boolean);
  const coverage = createDailyEnergyCoverageObservation({
    assessment,
    includeInsufficientData,
  });
  if (coverage) observations.push(coverage);
  return sortPIObservations(observations);
}

function createDailyEnergyMetricObservation({
  assessment,
  includeInsufficientData,
  metric,
}) {
  const value = assessment[metric.field];
  if (value == null && !includeInsufficientData) return null;
  const limitation = `daily_${metric.key}_unavailable`;
  const limitations = dailyMetricLimitations(metric, assessment);
  return createPIObservation({
    domain: "energy",
    kind: metric.kind,
    semanticScope: `${DAILY_ENERGY_PI_SEMANTIC_HORIZON}.${metric.key}`,
    subject: {
      type: "energy_metric",
      id: metric.subjectId,
      label: metric.subjectId.replaceAll("_", " "),
    },
    status: value == null ? "insufficient_data" : "observed",
    direction:
      value == null
        ? "not_applicable"
        : assessment.directions[metric.key] ?? "not_applicable",
    evidenceWindow: {
      startDate: assessment.evidenceDate,
      endDate: assessment.evidenceDate,
    },
    supportingEvidenceIds: assessment.sourceEvidenceIds,
    confidence:
      value == null
        ? {
            level: "unevaluated",
            limitations: [limitation, ...limitations],
            method: "daily_energy_evidence_sufficiency",
          }
        : dailyEnergyConfidence(assessment, limitations),
    explanationData: {
      value,
      unit: "kcal",
      evidenceDate: assessment.evidenceDate,
      nutritionCompleteness: assessment.nutritionCompleteness,
      activityCompleteness: assessment.activityCompleteness,
      pairedStatus: assessment.pairedStatus,
      calculationHorizon: DAILY_ENERGY_PI_SEMANTIC_HORIZON,
      calculationMethod: "daily_precomputed_energy_assessment",
      ...(assessment.calorieIntake != null
        ? { calorieIntake: assessment.calorieIntake }
        : {}),
      ...(assessment.activeCalories != null
        ? { activeCalories: assessment.activeCalories }
        : {}),
      ...(assessment.rmr != null
        ? {
            selectedRmr: assessment.rmr,
            rmrScanId: assessment.rmrScanId,
            rmrScanDate: assessment.rmrScanDate,
          }
        : {}),
      ...(assessment.estimatedExpenditure != null
        ? { estimatedExpenditure: assessment.estimatedExpenditure }
        : {}),
      ...(assessment.energyBalance != null
        ? { energyBalance: assessment.energyBalance }
        : {}),
      limitations,
    },
    provenance: provenance(
      "daily_precomputed_energy_assessment",
      assessment.sourceEvidenceIds
    ),
  });
}

function createDailyEnergyCoverageObservation({
  assessment,
  includeInsufficientData,
}) {
  if (
    assessment.sourceEvidenceIds.length === 0 &&
    !includeInsufficientData
  ) return null;
  const complete = assessment.pairedStatus === "complete";
  const limitations = dailyCoverageLimitations(assessment);
  return createPIObservation({
    domain: "energy",
    kind: "paired_day_coverage",
    semanticScope: `${DAILY_ENERGY_PI_SEMANTIC_HORIZON}.paired_day_coverage`,
    subject: {
      type: "energy_evidence",
      id: "paired_day_coverage",
      label: "Paired energy evidence",
    },
    status: complete ? "observed" : "insufficient_data",
    direction: "not_applicable",
    evidenceWindow: {
      startDate: assessment.evidenceDate,
      endDate: assessment.evidenceDate,
    },
    supportingEvidenceIds: assessment.sourceEvidenceIds,
    confidence: dailyEnergyConfidence(assessment, limitations),
    explanationData: {
      evidenceDate: assessment.evidenceDate,
      completePairedDays: complete ? 1 : 0,
      nutritionDays: assessment.nutritionDayId ? 1 : 0,
      activityDays: assessment.activityDayId ? 1 : 0,
      partialDays: complete ? 0 : assessment.sourceEvidenceIds.length > 0 ? 1 : 0,
      nutritionOnlyDays: assessment.pairedStatus === "nutrition-only" ? 1 : 0,
      activityOnlyDays: assessment.pairedStatus === "activity-only" ? 1 : 0,
      missingRmrDays: assessment.pairedStatus === "missing-rmr" ? 1 : 0,
      estimatedExpenditureDays:
        assessment.estimatedExpenditure != null ? 1 : 0,
      nutritionCompleteness: assessment.nutritionCompleteness,
      activityCompleteness: assessment.activityCompleteness,
      pairedStatus: assessment.pairedStatus,
      calculationHorizon: DAILY_ENERGY_PI_SEMANTIC_HORIZON,
      calculationMethod: "daily_precomputed_paired_energy_coverage",
      limitations,
    },
    provenance: provenance(
      "daily_precomputed_paired_energy_coverage",
      assessment.sourceEvidenceIds
    ),
  });
}

function normalizeDailyEnergyAssessment(value = {}) {
  const calorieIntake = finiteNumber(value.calorieIntake);
  const activeCalories = finiteNumber(value.activeCalories);
  const rmr = finiteNumber(value.rmr);
  const estimatedExpenditure = finiteNumber(value.estimatedExpenditure);
  const energyBalance = finiteNumber(value.energyBalance);
  const calculatedExpenditure =
    rmr != null && activeCalories != null ? rmr + activeCalories : null;
  const calculatedBalance =
    calorieIntake != null && estimatedExpenditure != null
      ? calorieIntake - estimatedExpenditure
      : null;
  if (
    estimatedExpenditure != null &&
    calculatedExpenditure != null &&
    estimatedExpenditure !== calculatedExpenditure
  ) throw new Error("Daily Energy expenditure does not match RMR plus active calories.");
  if (
    energyBalance != null &&
    calculatedBalance != null &&
    energyBalance !== calculatedBalance
  ) throw new Error("Daily Energy balance does not match intake minus expenditure.");
  return {
    evidenceDate: requiredDate(value.evidenceDate),
    calorieIntake,
    activeCalories,
    rmr,
    rmrScanId: value.rmrScanId ?? null,
    rmrScanDate: value.rmrScanDate ?? null,
    estimatedExpenditure,
    energyBalance,
    nutritionDayId: value.nutritionDayId ?? null,
    activityDayId: value.activityDayId ?? null,
    nutritionCompleteness: value.nutritionCompleteness ?? "unavailable",
    activityCompleteness: value.activityCompleteness ?? "unavailable",
    pairedStatus: value.pairedStatus ?? "no-paired-evidence",
    directions: normalizeDirections(value.directions),
    sourceEvidenceIds: normalizeEnergyIds([
      ...(value.sourceEvidenceIds ?? []),
      value.nutritionDayId,
      value.activityDayId,
      value.rmrScanId,
    ]),
  };
}

function dailyMetricLimitations(metric, assessment) {
  return [
    metric.key !== "intake" && assessment.estimatedExpenditure != null
      ? "expenditure_is_estimated_rmr_plus_active_calories"
      : null,
    metric.key !== "intake" && assessment.rmr == null
      ? "historical_rmr_unavailable"
      : null,
    assessment.nutritionCompleteness !== "complete"
      ? "daily_nutrition_evidence_incomplete"
      : null,
    assessment.activityCompleteness !== "complete"
      ? "daily_activity_evidence_incomplete"
      : null,
  ].filter(Boolean);
}

function dailyCoverageLimitations(assessment) {
  return [
    assessment.pairedStatus === "nutrition-only"
      ? "nutrition_without_activity"
      : null,
    assessment.pairedStatus === "activity-only"
      ? "activity_without_nutrition"
      : null,
    assessment.pairedStatus === "missing-rmr"
      ? "paired_inputs_without_historical_rmr"
      : null,
    assessment.estimatedExpenditure != null
      ? "expenditure_is_estimated_rmr_plus_active_calories"
      : null,
  ].filter(Boolean);
}

function dailyEnergyConfidence(assessment, limitations) {
  const complete =
    assessment.nutritionCompleteness === "complete" &&
    assessment.activityCompleteness === "complete" &&
    assessment.pairedStatus === "complete";
  return {
    level: complete ? "moderate" : assessment.sourceEvidenceIds.length ? "low" : "unevaluated",
    reasons: complete ? ["complete_daily_paired_energy_evidence"] : [],
    limitations,
    method: "daily_energy_evidence_sufficiency",
  };
}

function normalizeDirections(value = {}) {
  const result = {};
  ["intake", "expenditure", "balance"].forEach((key) => {
    if (["rising", "falling", "stable", "not_applicable"].includes(value[key])) {
      result[key] = value[key];
    }
  });
  return result;
}

function normalizeEnergyIds(value) {
  return [...new Set(value.filter(Boolean).map(String))].sort();
}

function requiredDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Daily Energy evidenceDate must use YYYY-MM-DD.");
  }
  return value;
}

function createMetricObservation({
  comparison,
  comparisonWindow,
  current,
  includeInsufficientData,
  metric,
  observationWindow,
  semanticHorizon,
}) {
  const currentRows = current.filter((day) => day[metric.field] != null);
  const comparisonRows = comparison.filter((day) => day[metric.field] != null);
  if (currentRows.length === 0) {
    return includeInsufficientData
      ? createInsufficientMetricObservation({
          current,
          metric,
          observationWindow,
          semanticHorizon,
        })
      : null;
  }

  const currentAverage = average(
    currentRows.map((day) => day[metric.field])
  );
  const comparisonAverage =
    comparisonRows.length > 0
      ? average(comparisonRows.map((day) => day[metric.field]))
      : null;
  const change =
    comparisonAverage == null ? null : currentAverage - comparisonAverage;
  const supportingRows = [...comparisonRows, ...currentRows];
  const limitations = metricLimitations(metric, current);
  const sourceEvidenceIds = evidenceIds(supportingRows);
  const rmrSources = getRmrSources(supportingRows);

  return createPIObservation({
    domain: "energy",
    kind: metric.kind,
    semanticScope: `${semanticHorizon}.${metric.key}`,
    subject: {
      type: "energy_metric",
      id: metric.subjectId,
      label: metric.subjectId.replaceAll("_", " "),
    },
    status: "observed",
    direction: change == null ? "not_applicable" : movementDirection(change),
    evidenceWindow: {
      ...observationWindow,
      comparisonStartDate:
        comparisonRows.length > 0 ? comparisonWindow?.startDate ?? null : null,
      comparisonEndDate:
        comparisonRows.length > 0 ? comparisonWindow?.endDate ?? null : null,
    },
    supportingEvidenceIds: sourceEvidenceIds,
    confidence: energyConfidence(currentRows.length, limitations),
    explanationData: {
      currentAverage,
      ...(comparisonAverage == null
        ? {}
        : {
            comparisonAverage,
            absoluteChange: change,
            comparisonSampleCount: comparisonRows.length,
          }),
      currentSampleCount: currentRows.length,
      calculationHorizon: semanticHorizon,
      calculationMethod: "energy_period_average",
      unit: "kcal",
      ...(rmrSources.length > 0 ? { rmrSources } : {}),
      limitations,
    },
    provenance: provenance("energy_period_average", sourceEvidenceIds),
  });
}

function createCoverageObservation({
  current,
  includeInsufficientData,
  observationWindow,
  semanticHorizon,
}) {
  if (current.length === 0 && !includeInsufficientData) return null;

  const summary = createEnergyPresentation({ days: current }).summary;
  const audit = auditDays(current);
  const sourceEvidenceIds = evidenceIds(current);
  const insufficient = audit.completePairedDays === 0;
  const limitations = coverageLimitations(audit);
  const rmrSources = getRmrSources(current);

  return createPIObservation({
    domain: "energy",
    kind: "paired_day_coverage",
    semanticScope: `${semanticHorizon}.paired_day_coverage`,
    subject: {
      type: "energy_evidence",
      id: "paired_day_coverage",
      label: "Paired energy evidence",
    },
    status: insufficient ? "insufficient_data" : "observed",
    direction: "not_applicable",
    evidenceWindow: observationWindow,
    supportingEvidenceIds: sourceEvidenceIds,
    confidence: energyConfidence(audit.completePairedDays, limitations),
    explanationData: {
      evidenceDays: summary.evidenceDays,
      completePairedDays: audit.completePairedDays,
      nutritionDays: audit.nutritionDays,
      activityDays: audit.activityDays,
      partialDays: audit.partialDays,
      nutritionOnlyDays: audit.nutritionOnlyDays,
      activityOnlyDays: audit.activityOnlyDays,
      missingRmrDays: audit.missingRmrDays,
      estimatedExpenditureDays: audit.estimatedExpenditureDays,
      calculationHorizon: semanticHorizon,
      ...(rmrSources.length > 0 ? { rmrSources } : {}),
      limitations,
    },
    provenance: provenance("energy_paired_day_coverage", sourceEvidenceIds),
  });
}

function createInsufficientMetricObservation({
  current,
  metric,
  observationWindow,
  semanticHorizon,
}) {
  const sourceEvidenceIds = evidenceIds(current);
  const limitation = `no_${metric.key}_values_in_observation_window`;
  return createPIObservation({
    domain: "energy",
    kind: metric.kind,
    semanticScope: `${semanticHorizon}.${metric.key}`,
    subject: {
      type: "energy_metric",
      id: metric.subjectId,
      label: metric.subjectId.replaceAll("_", " "),
    },
    status: "insufficient_data",
    direction: "not_applicable",
    evidenceWindow: observationWindow,
    supportingEvidenceIds: sourceEvidenceIds,
    confidence: {
      level: "unevaluated",
      limitations: [limitation],
      method: "energy_evidence_sufficiency",
    },
    explanationData: {
      sampleCount: 0,
      calculationHorizon: semanticHorizon,
      limitations: [limitation],
    },
    provenance: provenance("energy_evidence_sufficiency", sourceEvidenceIds),
  });
}

function resolveDays({ days, reconciliationInput }) {
  if (days != null && reconciliationInput != null) {
    throw new Error("Provide either days or reconciliationInput, not both.");
  }
  if (days != null) {
    if (!Array.isArray(days)) throw new Error("days must be an array.");
    return [...days];
  }
  return reconcileEnergyDays(reconciliationInput ?? {});
}

function selectDays(days, window) {
  if (!window?.startDate || !window?.endDate) {
    throw new Error("Energy observationWindow requires startDate and endDate.");
  }
  return days
    .filter(
      (day) => day.date >= window.startDate && day.date <= window.endDate
    )
    .sort((left, right) => left.date.localeCompare(right.date));
}

function auditDays(days) {
  const nutritionDays = days.filter((day) => day.nutritionDayId).length;
  const activityDays = days.filter((day) => day.activityDayId).length;
  const completePairedDays = days.filter(
    (day) =>
      (day.pairedCompleteness ?? day.completeness) === "complete"
  ).length;
  const nutritionOnlyDays = days.filter(
    (day) => day.completeness === "nutrition-only"
  ).length;
  const activityOnlyDays = days.filter(
    (day) => day.completeness === "activity-only"
  ).length;
  const missingRmrDays = days.filter(
    (day) => day.completeness === "missing-rmr"
  ).length;
  return {
    nutritionDays,
    activityDays,
    completePairedDays,
    nutritionOnlyDays,
    activityOnlyDays,
    missingRmrDays,
    partialDays: days.filter((day) =>
      ["partial", "unknown"].includes(day.pairedCompleteness)
    ).length || (
      days.length - completePairedDays -
      days.filter((day) => day.completeness === "no-paired-evidence").length
    ),
    estimatedExpenditureDays: days.filter(
      (day) => day.expenditureKind === "estimated_rmr_plus_active"
    ).length,
  };
}

function metricLimitations(metric, days) {
  const limitations = [];
  if (metric.key !== "intake") {
    if (
      days.some(
        (day) => day.expenditureKind === "estimated_rmr_plus_active"
      )
    ) {
      limitations.push("expenditure_is_estimated_rmr_plus_active_calories");
    }
    if (days.some((day) => day.rmrScanId == null)) {
      limitations.push("some_days_lack_historical_rmr");
    }
  }
  if (metric.key === "balance" && days.some((day) => day.energyBalance == null)) {
    limitations.push("some_days_lack_complete_paired_energy_evidence");
  }
  return limitations;
}

function coverageLimitations(audit) {
  return [
    audit.nutritionOnlyDays > 0 ? "nutrition_without_activity" : null,
    audit.activityOnlyDays > 0 ? "activity_without_nutrition" : null,
    audit.missingRmrDays > 0 ? "paired_inputs_without_historical_rmr" : null,
    audit.estimatedExpenditureDays > 0
      ? "expenditure_is_estimated_rmr_plus_active_calories"
      : null,
  ].filter(Boolean);
}

function energyConfidence(sampleCount, limitations) {
  const level =
    sampleCount >= 4 && limitations.length === 0
      ? "high"
      : sampleCount >= 2
        ? "moderate"
        : sampleCount === 1
          ? "low"
          : "unevaluated";
  return {
    level,
    reasons: sampleCount > 0 ? [`${sampleCount}_supported_energy_days`] : [],
    limitations,
    method: "energy_evidence_sufficiency",
  };
}

function evidenceIds(days) {
  return days.flatMap((day) =>
    [day.nutritionDayId, day.activityDayId, day.rmrScanId].filter(Boolean)
  );
}

function getRmrSources(days) {
  const byIdentity = new Map();
  days.forEach((day) => {
    if (!day.rmrScanId || day.rmr == null) return;
    const source = {
      scanId: day.rmrScanId,
      scanDate: day.rmrScanDate ?? null,
      value: day.rmr,
      unit: "kcal_per_day",
    };
    byIdentity.set(
      `${source.scanId}|${source.scanDate}|${source.value}`,
      source
    );
  });
  return [...byIdentity.values()].sort(
    (left, right) =>
      String(left.scanDate).localeCompare(String(right.scanDate)) ||
      left.scanId.localeCompare(right.scanId)
  );
}

function provenance(calculationMethod, sourceEvidenceIds) {
  return {
    producer: "energy_pi_observation_service",
    producerVersion: ENERGY_PI_PRODUCER_VERSION,
    calculationMethod,
    sourceEvidenceIds,
  };
}

function movementDirection(change) {
  if (change > 0) return "rising";
  if (change < 0) return "falling";
  return "stable";
}

function normalizeKinds(kinds) {
  if (!Array.isArray(kinds)) throw new Error("requestedKinds must be an array.");
  const supported = new Set([
    ...METRICS.map((metric) => metric.kind),
    "paired_day_coverage",
  ]);
  const unique = [...new Set(kinds)];
  unique.forEach((kind) => {
    if (!supported.has(kind)) {
      throw new Error(`Unsupported Energy PI kind: ${kind}.`);
    }
  });
  return unique;
}

function average(values) {
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length
  );
}

function finiteNumber(value) {
  const number = Number(value);
  return value == null || value === "" || !Number.isFinite(number)
    ? null
    : number;
}
