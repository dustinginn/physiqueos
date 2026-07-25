import {
  RECOVERY_EVIDENCE_SCHEMA_VERSION,
  RECOVERY_METRICS,
} from "../models/RecoveryEvidenceModel";
import {
  RECOVERY_PI_METRICS,
  RECOVERY_PI_THRESHOLDS,
} from "./RecoveryPISemanticContract";

export const RECOVERY_EVIDENCE_ASSESSMENT_VERSION =
  "recovery_evidence_assessment_v1";

export function assessRecoveryEvidence(input = {}) {
  const before = structuredClone(input);
  const cadence = requiredCadence(input.cadence);
  const window = requiredWindow(input.currentWindow ?? input.window, "currentWindow");
  const comparisonWindow = input.comparisonWindow
    ? requiredWindow(input.comparisonWindow, "comparisonWindow")
    : null;
  const timezone = requiredText(input.timezone, "timezone");
  const expectedDates = normalizeDates(
    input.expectedDates ?? datesBetween(window.startDate, window.endDate)
  );
  const threshold = {
    ...RECOVERY_PI_THRESHOLDS[cadence],
    ...(input.thresholdPolicy ?? {}),
  };
  const records = eligibleRecords(input.records ?? []);
  const current = select(records, window);
  const comparison = comparisonWindow ? select(records, comparisonWindow) : [];
  const currentDates = unique(current.map((record) => record.evidenceDate));
  const comparisonDates = unique(comparison.map((record) => record.evidenceDate));
  const metricAssessments = Object.fromEntries(
    RECOVERY_METRICS.map((metric) => [
      metric,
      assessMetric(metric, current, comparison, cadence, threshold, window),
    ])
  );
  const interpretable = Object.values(metricAssessments).filter(
    (metric) => metric.status === "observed"
  );
  const directional = interpretable.filter((metric) =>
    ["rising", "falling", "stable"].includes(metric.direction)
  );
  const conflictState = detectConflict(metricAssessments);
  const thresholdMet = currentDates.length >= threshold.minimumCurrentDates;
  const compositeState = composite(directional, conflictState, thresholdMet);
  const coveredDayCount = currentDates.length;
  const completeDayCount = expectedDates.filter((date) =>
    RECOVERY_METRICS.every((metric) =>
      current.some((record) => record.metric === metric && record.evidenceDate === date)
    )
  ).length;
  const partialDayCount = expectedDates.filter((date) =>
    current.some((record) => record.evidenceDate === date) &&
    !RECOVERY_METRICS.every((metric) =>
      current.some((record) => record.metric === metric && record.evidenceDate === date)
    )
  ).length;
  const limitations = unique([
    ...(current.length ? [] : ["recovery_evidence_unavailable"]),
    ...(!thresholdMet ? ["recovery_cadence_threshold_not_met"] : []),
    ...(comparison.length ? [] : ["recovery_comparison_unavailable"]),
    ...(coveredDayCount < expectedDates.length
      ? ["recovery_evidence_coverage_partial"]
      : []),
    ...(conflictState === "conflict" ? ["recovery_metrics_conflict"] : []),
  ]);
  const result = {
    schemaVersion: RECOVERY_EVIDENCE_ASSESSMENT_VERSION,
    cadence,
    window,
    comparisonWindow,
    timezone,
    status: current.length ? (thresholdMet ? "assessed" : "insufficient") : "missing",
    completeness: current.length === 0
      ? "missing"
      : coveredDayCount === expectedDates.length && completeDayCount === expectedDates.length
        ? "complete"
        : "partial",
    freshness: current.length ? "current" : comparison.length ? "recent" : "missing",
    metricAssessments,
    compositeState,
    conflictState,
    expectedDayCount: expectedDates.length,
    coveredDayCount,
    completeDayCount,
    partialDayCount,
    missingDayCount: Math.max(0, expectedDates.length - coveredDayCount),
    comparisonCoveredDayCount: comparisonDates.length,
    evidenceIds: unique([...current, ...comparison].map((record) => record.id)),
    sourceCoverage: sourceCoverage(current),
    limitations,
    provenance: {
      producer: "recovery_evidence_assessment_service",
      producerVersion: RECOVERY_EVIDENCE_ASSESSMENT_VERSION,
      repositoryReads: 0,
      runtimeClockReads: 0,
      threshold,
      sourcePolicy: input.sourcePolicy ?? "structured_manual_check_in_only",
    },
  };
  if (JSON.stringify(input) !== JSON.stringify(before)) {
    throw new Error("Recovery assessment input mutation detected.");
  }
  return result;
}

function assessMetric(metric, current, comparison, cadence, threshold, window) {
  const currentRows = current.filter((record) => record.metric === metric);
  const comparisonRows = comparison.filter((record) => record.metric === metric);
  const currentDates = unique(currentRows.map((record) => record.evidenceDate));
  const thresholdMet = currentDates.length >= threshold.minimumCurrentDates;
  const currentValue = aggregate(metric, currentRows);
  const comparisonValue = aggregate(metric, comparisonRows);
  const direction = comparisonValue == null || currentValue == null
    ? "not_applicable"
    : currentValue > comparisonValue ? "rising"
      : currentValue < comparisonValue ? "falling" : "stable";
  const limitations = unique([
    ...(!currentRows.length ? [`${metric}_unavailable`] : []),
    ...(!thresholdMet ? [`${cadence}_${metric}_threshold_not_met`] : []),
    ...(!comparisonRows.length ? [`${metric}_comparison_unavailable`] : []),
  ]);
  const normal = currentDates.length >= threshold.normalConfidenceDates;
  return {
    metric,
    status: currentRows.length && (cadence === "daily" || thresholdMet)
      ? "observed" : "insufficient",
    direction,
    currentValue,
    comparisonValue,
    currentRecordCount: currentRows.length,
    comparisonRecordCount: comparisonRows.length,
    currentEvidenceIds: unique(currentRows.map((record) => record.id)),
    comparisonEvidenceIds: unique(comparisonRows.map((record) => record.id)),
    confidence: {
      level: !currentRows.length ? "unevaluated"
        : normal && comparisonRows.length ? "moderate" : "low",
      ceiling: RECOVERY_PI_METRICS[metric].confidenceCeiling,
      method: "recovery_coverage_comparison_freshness",
      limitations,
    },
    completeness: currentRows.length
      ? currentDates.length === datesBetween(window.startDate, window.endDate).length
        ? "complete" : "partial"
      : "missing",
    freshness: currentRows.length ? "current" : "missing",
    limitations,
  };
}

function eligibleRecords(records) {
  const byId = new Map();
  records.forEach((record) => {
    if (
      record?.schemaVersion !== RECOVERY_EVIDENCE_SCHEMA_VERSION ||
      !RECOVERY_METRICS.includes(record.metric) ||
      ["invalid", "superseded"].includes(record.status) ||
      record.supersededByEvidenceId
    ) return;
    byId.set(record.id, structuredClone(record));
  });
  return [...byId.values()].sort((a, b) =>
    `${a.evidenceDate}|${a.metric}|${a.id}`.localeCompare(
      `${b.evidenceDate}|${b.metric}|${b.id}`
    )
  );
}
function select(records, window) {
  return records.filter((record) =>
    record.evidenceDate >= window.startDate && record.evidenceDate <= window.endDate
  );
}
function aggregate(metric, rows) {
  if (!rows.length) return null;
  const scale = RECOVERY_PI_METRICS[metric].orderedScale;
  const values = rows.map((row) => scale ? scale.indexOf(row.value) : Number(row.value));
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100;
}
function detectConflict(metrics) {
  const semantic = Object.values(metrics)
    .filter((metric) => ["rising", "falling"].includes(metric.direction))
    .map((metric) => {
      const definition = RECOVERY_PI_METRICS[metric.metric];
      return metric.direction === definition.improvingDirection ? "improving" : "strained";
    });
  return semantic.includes("improving") && semantic.includes("strained")
    ? "conflict" : "none";
}
function composite(metrics, conflictState, thresholdMet) {
  if (!thresholdMet || !metrics.length) return "insufficient";
  if (conflictState === "conflict") return "mixed";
  const states = metrics.map((metric) => {
    const definition = RECOVERY_PI_METRICS[metric.metric];
    if (metric.direction === "stable") return "stable";
    return metric.direction === definition.improvingDirection ? "improving" : "strained";
  });
  if (states.every((state) => state === "stable")) return "stable";
  if (states.every((state) => ["stable", "improving"].includes(state))) return "improving";
  if (states.every((state) => ["stable", "strained"].includes(state))) return "strained";
  return "mixed";
}
function sourceCoverage(records) {
  return Object.fromEntries(unique(records.map((record) => record.source.kind)).map(
    (source) => [source, records.filter((record) => record.source.kind === source).length]
  ));
}
function requiredCadence(value) {
  if (!["daily", "midweek", "weekly"].includes(value)) throw new Error("Unsupported Recovery cadence.");
  return value;
}
function requiredWindow(value, field) {
  if (!value?.startDate || !value?.endDate || value.startDate > value.endDate) {
    throw new Error(`${field} requires a valid bounded window.`);
  }
  return { startDate: value.startDate, endDate: value.endDate };
}
function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value;
}
function normalizeDates(values) { return unique(values); }
function unique(values) { return [...new Set(values.filter(Boolean).map(String))].sort(); }
function datesBetween(startDate, endDate) {
  const dates = [];
  for (
    let cursor = Date.parse(`${startDate}T12:00:00Z`);
    cursor <= Date.parse(`${endDate}T12:00:00Z`);
    cursor += 86400000
  ) dates.push(new Date(cursor).toISOString().slice(0, 10));
  return dates;
}
