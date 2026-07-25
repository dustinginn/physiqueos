import { createPIObservation, sortPIObservations } from "./PIObservationService";

export const DEXA_PI_PRODUCER_VERSION = "dexa_pi_v1";

const METRICS = Object.freeze([
  { kind: "dexa_lean_mass_change", key: "leanMass", subject: "lean_mass", label: "Lean mass", defaultUnit: "lb" },
  { kind: "dexa_fat_mass_change", key: "fatMass", subject: "fat_mass", label: "Fat mass", defaultUnit: "lb" },
  { kind: "dexa_body_fat_percentage_change", key: "bodyFatPercentage", subject: "body_fat_percentage", label: "Body-fat percentage", defaultUnit: "%" },
  { kind: "dexa_total_weight_change", key: "totalMass", subject: "body_weight", label: "DEXA weight", defaultUnit: "lb" },
  { kind: "dexa_rmr_change", key: "restingMetabolicRate", subject: "resting_metabolic_rate", label: "Resting metabolic rate", defaultUnit: "kcal/day" },
]);

export function createDEXAPIObservations({ scans = [], includeInsufficientData = true } = {}) {
  const before = structuredClone(scans);
  const eligible = normalizeScans(scans);
  const current = eligible.at(-1) ?? null;
  const prior = eligible.at(-2) ?? null;
  const observations = [];

  if (current) observations.push(snapshotObservation(current));
  if (!current || !prior) {
    if (includeInsufficientData) observations.push(insufficientObservation({
      current,
      prior,
      limitations: [current ? "prior_eligible_dexa_scan_unavailable" : "current_dexa_scan_unavailable"],
    }));
  } else {
    const missing = [];
    for (const metric of METRICS) {
      const comparison = comparableMetric(prior, current, metric);
      if (!comparison.comparable) {
        missing.push(...comparison.limitations);
        continue;
      }
      observations.push(metricObservation(metric, prior, current, comparison));
    }
    if (missing.length && includeInsufficientData) {
      observations.push(insufficientObservation({
        current,
        prior,
        limitations: [...new Set(missing)].sort(),
      }));
    }
  }

  if (JSON.stringify(scans) !== JSON.stringify(before)) {
    throw new Error("DEXA PI input mutation detected.");
  }
  return sortPIObservations(observations);
}

function metricObservation(metric, prior, current, comparison) {
  const delta = round(comparison.current - comparison.prior);
  const ids = [prior.id, current.id];
  return createPIObservation({
    domain: "dexa",
    kind: metric.kind,
    semanticScope: "scan_to_scan",
    subject: { type: "whole_body_metric", id: metric.subject, label: metric.label },
    status: delta === 0 ? "stable" : "observed",
    direction: direction(delta),
    evidenceWindow: scanWindow(prior, current),
    supportingEvidenceIds: ids,
    confidence: {
      level: "high",
      reasons: ["explicit_comparable_dexa_measurements", "immediate_prior_eligible_scan"],
      method: "dexa_measurement_comparability",
    },
    explanationData: {
      currentScanId: current.id,
      comparisonScanId: prior.id,
      currentScanDate: current.date,
      comparisonScanDate: prior.date,
      currentValue: comparison.current,
      priorValue: comparison.prior,
      absoluteChange: delta,
      unit: comparison.unit,
      baselineSelectionMethod: "immediate_prior_eligible_scan",
      comparisonSelectionMethod: "chronological_immediate_prior",
      limitations: [],
    },
    provenance: provenance(ids, "whole_body_scan_to_scan_delta"),
  });
}

function snapshotObservation(current) {
  const values = Object.fromEntries(METRICS.map((metric) => {
    const value = metricValue(current.source, metric);
    return [metric.subject, value.value == null ? null : { value: value.value, unit: value.unit }];
  }));
  return createPIObservation({
    domain: "dexa",
    kind: "dexa_measurement_snapshot",
    semanticScope: `event:${machineKey(current.id)}`,
    subject: { type: "dexa_event", id: `scan:${machineKey(current.id)}`, label: "DEXA measurement snapshot" },
    status: "observed",
    direction: "neutral",
    evidenceWindow: { startDate: current.date, endDate: current.date },
    supportingEvidenceIds: [current.id],
    confidence: {
      level: "high",
      reasons: ["explicit_dexa_scan"],
      method: "dexa_snapshot_provenance",
    },
    explanationData: {
      scanId: current.id,
      scanDate: current.date,
      measurements: values,
      limitations: [],
    },
    provenance: provenance([current.id], "event_scoped_measurement_snapshot"),
  });
}

function insufficientObservation({ current, prior, limitations }) {
  const ids = [prior?.id, current?.id].filter(Boolean);
  const dates = [prior?.date, current?.date].filter(Boolean).sort();
  return createPIObservation({
    domain: "dexa",
    kind: "dexa_insufficient_comparison",
    semanticScope: "scan_to_scan",
    subject: { type: "whole_body_metric", id: "dexa_comparison", label: "DEXA comparison" },
    status: "insufficient_data",
    direction: "not_applicable",
    evidenceWindow: {
      startDate: dates[0] ?? null,
      endDate: dates.at(-1) ?? null,
    },
    supportingEvidenceIds: ids,
    confidence: {
      level: ids.length ? "low" : "unevaluated",
      limitations,
      method: "dexa_measurement_comparability",
    },
    explanationData: {
      currentScanId: current?.id ?? null,
      comparisonScanId: prior?.id ?? null,
      baselineSelectionMethod: "immediate_prior_eligible_scan",
      limitations,
    },
    provenance: provenance(ids, "insufficient_dexa_comparison"),
  });
}

function normalizeScans(scans) {
  return (Array.isArray(scans) ? scans : [])
    .filter((scan) => scan && scan.quality?.status !== "superseded" && scan.status !== "superseded")
    .map((scan) => ({
      id: String(scan.id ?? scan.canonicalId ?? ""),
      date: String(scan.measuredAt ?? scan.date ?? "").slice(0, 10),
      source: scan.payload ?? scan,
    }))
    .filter((scan) => scan.id && /^\d{4}-\d{2}-\d{2}$/.test(scan.date))
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
    .filter((scan, index, values) => index === values.findIndex((other) => other.id === scan.id));
}

function comparableMetric(prior, current, metric) {
  const left = metricValue(prior.source, metric);
  const right = metricValue(current.source, metric);
  const limitations = [];
  if (left.value == null) limitations.push(`comparison_${metric.subject}_unavailable`);
  if (right.value == null) limitations.push(`current_${metric.subject}_unavailable`);
  if (left.value != null && right.value != null && left.unit !== right.unit) {
    limitations.push(`${metric.subject}_unit_mismatch`);
  }
  return {
    comparable: limitations.length === 0,
    prior: left.value,
    current: right.value,
    unit: right.unit,
    limitations,
  };
}

function metricValue(scan, metric) {
  const raw = scan?.[metric.key];
  const candidate = typeof raw === "object" ? raw?.value : raw;
  const value = candidate == null || candidate === "" ? Number.NaN : Number(candidate);
  const unit = typeof raw === "object" ? raw?.unit ?? metric.defaultUnit : metric.defaultUnit;
  return { value: Number.isFinite(value) ? value : null, unit: String(unit) };
}

function scanWindow(prior, current) {
  return {
    startDate: current.date,
    endDate: current.date,
    comparisonStartDate: prior.date,
    comparisonEndDate: prior.date,
  };
}

function provenance(ids, calculationMethod) {
  return {
    producer: "dexa_pi_observation_service",
    producerVersion: DEXA_PI_PRODUCER_VERSION,
    calculationMethod,
    sourceEvidenceIds: ids,
    repositoryReads: 0,
    runtimeClockReads: 0,
  };
}

function direction(delta) {
  if (delta > 0) return "rising";
  if (delta < 0) return "falling";
  return "stable";
}

function round(value) {
  return Number(value.toFixed(2));
}

function machineKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9._|:-]+/g, "_");
}
