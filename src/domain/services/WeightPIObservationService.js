import {
  createPIObservation,
  sortPIObservations,
} from "./PIObservationService";

export const WEIGHT_PI_PRODUCER_VERSION = "weight_pi_v1";
export const DAILY_WEIGHT_PI_KIND = "weight_daily_rolling_average_change";
export const DAILY_WEIGHT_PI_SEMANTIC_HORIZON = "daily";

const SUPPORTED_SCOPES = new Set(["short_window", "average_comparison"]);

export function createWeightPIObservations({
  weights = [],
  observationWindow,
  comparisonWindow = null,
  requestedScopes = ["short_window", "average_comparison"],
  semanticHorizon = "rolling_7_days",
  includeInsufficientData = false,
} = {}) {
  const scopes = normalizeScopes(requestedScopes);
  const current = selectWeightEntries(weights, observationWindow);
  const comparison = comparisonWindow
    ? selectWeightEntries(weights, comparisonWindow)
    : [];
  const observations = [];

  if (scopes.includes("short_window")) {
    const observation = createShortWindowObservation({
      entries: current,
      includeInsufficientData,
      observationWindow,
      semanticHorizon,
    });
    if (observation) observations.push(observation);
  }

  if (scopes.includes("average_comparison")) {
    const observation = createAverageComparisonObservation({
      comparison,
      comparisonWindow,
      current,
      includeInsufficientData,
      observationWindow,
      semanticHorizon,
    });
    if (observation) observations.push(observation);
  }

  return sortPIObservations(observations);
}

export function createDailyWeightPIObservations({
  precomputedAssessment,
  includeInsufficientData = false,
} = {}) {
  const assessment = normalizeDailyAssessment(precomputedAssessment);
  const ids = [
    ...assessment.comparisonEvidenceIds,
    ...assessment.currentEvidenceIds,
  ];
  const sufficient =
    assessment.currentAverage != null &&
    assessment.comparisonAverage != null &&
    assessment.absoluteChange != null &&
    assessment.currentSampleCount > 0 &&
    assessment.comparisonSampleCount > 0;

  if (!sufficient && !includeInsufficientData) return [];
  if (!sufficient) {
    const limitations = dailyWeightLimitations(assessment);
    return [
      createPIObservation({
        domain: "weight",
        kind: DAILY_WEIGHT_PI_KIND,
        semanticScope: `${DAILY_WEIGHT_PI_SEMANTIC_HORIZON}.rolling_average_comparison`,
        subject: weightSubject(),
        status: "insufficient_data",
        direction: "not_applicable",
        evidenceWindow: dailyWeightEvidenceWindow(assessment),
        supportingEvidenceIds: ids,
        confidence: {
          level: ids.length === 1 ? "low" : "unevaluated",
          limitations,
          method: "daily_weight_evidence_sufficiency",
        },
        explanationData: {
          currentSampleCount: assessment.currentSampleCount,
          comparisonSampleCount: assessment.comparisonSampleCount,
          calculationHorizon: DAILY_WEIGHT_PI_SEMANTIC_HORIZON,
          calculationMethod: "daily_last_seven_entries_vs_prior_seven_entries",
          limitations,
        },
        provenance: provenance(
          "daily_last_seven_entries_vs_prior_seven_entries",
          ids
        ),
      }),
    ];
  }

  return [
    createPIObservation({
      domain: "weight",
      kind: DAILY_WEIGHT_PI_KIND,
      semanticScope: `${DAILY_WEIGHT_PI_SEMANTIC_HORIZON}.rolling_average_comparison`,
      subject: weightSubject(),
      status: "observed",
      direction: assessment.direction,
      evidenceWindow: dailyWeightEvidenceWindow(assessment),
      supportingEvidenceIds: ids,
      confidence: sufficiencyConfidence(
        assessment.currentSampleCount + assessment.comparisonSampleCount
      ),
      explanationData: {
        currentAverage: assessment.currentAverage,
        comparisonAverage: assessment.comparisonAverage,
        absoluteChange: assessment.absoluteChange,
        unit: assessment.unit,
        currentSampleCount: assessment.currentSampleCount,
        comparisonSampleCount: assessment.comparisonSampleCount,
        stabilityThreshold: 0,
        currentDateRange: assessment.currentDateRange,
        comparisonDateRange: assessment.comparisonDateRange,
        calculationHorizon: DAILY_WEIGHT_PI_SEMANTIC_HORIZON,
        calculationMethod: "daily_last_seven_entries_vs_prior_seven_entries",
      },
      provenance: provenance(
        "daily_last_seven_entries_vs_prior_seven_entries",
        ids
      ),
    }),
  ];
}

function normalizeDailyAssessment(value = {}) {
  const currentAverage = finiteNumber(value.currentAverage);
  const comparisonAverage = finiteNumber(value.comparisonAverage);
  const suppliedChange = finiteNumber(value.absoluteChange);
  const absoluteChange =
    suppliedChange ??
    (currentAverage != null && comparisonAverage != null
      ? round(currentAverage - comparisonAverage)
      : null);
  const direction =
    absoluteChange == null ? "not_applicable" : movementDirection(absoluteChange);
  if (
    value.direction != null &&
    value.direction !== direction
  ) {
    throw new Error("Daily Weight direction does not match the precomputed delta.");
  }
  return {
    currentAverage,
    comparisonAverage,
    absoluteChange,
    direction,
    unit: value.unit ?? "lb",
    currentSampleCount: nonNegativeInteger(value.currentSampleCount),
    comparisonSampleCount: nonNegativeInteger(value.comparisonSampleCount),
    currentDateRange: normalizeDateRange(value.currentDateRange),
    comparisonDateRange: normalizeDateRange(value.comparisonDateRange),
    currentEvidenceIds: normalizeIds(value.currentEvidenceIds),
    comparisonEvidenceIds: normalizeIds(value.comparisonEvidenceIds),
  };
}

function dailyWeightEvidenceWindow(assessment) {
  return {
    startDate: assessment.currentDateRange?.startDate ?? null,
    endDate: assessment.currentDateRange?.endDate ?? null,
    comparisonStartDate: assessment.comparisonDateRange?.startDate ?? null,
    comparisonEndDate: assessment.comparisonDateRange?.endDate ?? null,
  };
}

function dailyWeightLimitations(assessment) {
  return [
    assessment.currentSampleCount === 0
      ? "no_weight_entries_in_current_daily_rolling_set"
      : null,
    assessment.comparisonSampleCount === 0
      ? "no_weight_entries_in_comparison_daily_rolling_set"
      : null,
    assessment.currentAverage == null
      ? "current_daily_rolling_average_unavailable"
      : null,
    assessment.comparisonAverage == null
      ? "comparison_daily_rolling_average_unavailable"
      : null,
  ].filter(Boolean);
}

function normalizeDateRange(value) {
  if (!value) return null;
  return {
    startDate: String(value.startDate ?? "").slice(0, 10) || null,
    endDate: String(value.endDate ?? "").slice(0, 10) || null,
  };
}

function normalizeIds(value) {
  return [...new Set(Array.isArray(value) ? value.map(String) : [])].sort();
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function createShortWindowObservation({
  entries,
  includeInsufficientData,
  observationWindow,
  semanticHorizon,
}) {
  if (entries.length < 2) {
    return includeInsufficientData
      ? createInsufficientObservation({
          kind: "weight_short_window_change",
          observationWindow,
          scope: `${semanticHorizon}.short_window`,
          entries,
          requiredEvidence: "at_least_two_weight_entries",
        })
      : null;
  }

  const first = entries[0];
  const latest = entries.at(-1);
  const absoluteChange = round(latest.value - first.value);

  return createPIObservation({
    domain: "weight",
    kind: "weight_short_window_change",
    semanticScope: `${semanticHorizon}.short_window`,
    subject: weightSubject(),
    status: "observed",
    direction: movementDirection(absoluteChange),
    evidenceWindow: observationWindow,
    supportingEvidenceIds: entries.map((entry) => entry.id),
    confidence: sufficiencyConfidence(entries.length),
    explanationData: {
      currentValue: latest.value,
      priorValue: first.value,
      absoluteChange,
      unit: latest.unit,
      sampleCount: entries.length,
      calculationHorizon: semanticHorizon,
      calculationMethod: "first_to_last_weight_change",
    },
    provenance: provenance(
      "first_to_last_weight_change",
      entries.map((entry) => entry.id)
    ),
  });
}

function createAverageComparisonObservation({
  comparison,
  comparisonWindow,
  current,
  includeInsufficientData,
  observationWindow,
  semanticHorizon,
}) {
  if (current.length === 0 || comparison.length === 0 || !comparisonWindow) {
    return includeInsufficientData
      ? createInsufficientObservation({
          kind: "weight_average_change",
          observationWindow,
          comparisonWindow,
          scope: `${semanticHorizon}.average_comparison`,
          entries: [...comparison, ...current],
          requiredEvidence: "weight_entries_in_both_comparison_windows",
        })
      : null;
  }

  const currentAverage = average(current.map((entry) => entry.value));
  const comparisonAverage = average(comparison.map((entry) => entry.value));
  const absoluteChange = round(currentAverage - comparisonAverage);
  const ids = [...comparison, ...current].map((entry) => entry.id);

  return createPIObservation({
    domain: "weight",
    kind: "weight_average_change",
    semanticScope: `${semanticHorizon}.average_comparison`,
    subject: weightSubject(),
    status: "observed",
    direction: movementDirection(absoluteChange),
    evidenceWindow: {
      ...observationWindow,
      comparisonStartDate: comparisonWindow.startDate,
      comparisonEndDate: comparisonWindow.endDate,
    },
    supportingEvidenceIds: ids,
    confidence: sufficiencyConfidence(current.length + comparison.length),
    explanationData: {
      currentAverage,
      comparisonAverage,
      absoluteChange,
      unit: current.at(-1)?.unit ?? comparison.at(-1)?.unit ?? null,
      currentSampleCount: current.length,
      comparisonSampleCount: comparison.length,
      calculationHorizon: semanticHorizon,
      calculationMethod: "comparison_window_average_change",
    },
    provenance: provenance("comparison_window_average_change", ids),
  });
}

function createInsufficientObservation({
  comparisonWindow = null,
  entries,
  kind,
  observationWindow,
  requiredEvidence,
  scope,
}) {
  return createPIObservation({
    domain: "weight",
    kind,
    semanticScope: scope,
    subject: weightSubject(),
    status: "insufficient_data",
    direction: "not_applicable",
    evidenceWindow: {
      ...observationWindow,
      comparisonStartDate: comparisonWindow?.startDate ?? null,
      comparisonEndDate: comparisonWindow?.endDate ?? null,
    },
    supportingEvidenceIds: entries.map((entry) => entry.id),
    confidence: {
      level: entries.length === 1 ? "low" : "unevaluated",
      limitations: [requiredEvidence],
      method: "weight_evidence_sufficiency",
    },
    explanationData: {
      sampleCount: entries.length,
      requiredEvidence,
    },
    provenance: provenance(
      "weight_evidence_sufficiency",
      entries.map((entry) => entry.id)
    ),
  });
}

function selectWeightEntries(weights, window) {
  if (!window?.startDate || !window?.endDate) {
    throw new Error("Weight observationWindow requires startDate and endDate.");
  }
  return weights
    .map(normalizeWeightEntry)
    .filter(Boolean)
    .filter(
      (entry) =>
        entry.date >= window.startDate && entry.date <= window.endDate
    )
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
}

function normalizeWeightEntry(entry = {}) {
  const value = finiteNumber(entry.weight?.value ?? entry.value);
  const date = String(entry.measuredAt ?? entry.date ?? "").slice(0, 10);
  if (!entry.id || !date || value == null) return null;
  return {
    id: String(entry.id),
    date,
    value,
    unit: entry.weight?.unit ?? entry.unit ?? "lb",
  };
}

function weightSubject() {
  return {
    type: "whole_body_metric",
    id: "body_weight",
    label: "Body weight",
  };
}

function movementDirection(change) {
  if (change > 0) return "rising";
  if (change < 0) return "falling";
  return "stable";
}

function sufficiencyConfidence(sampleCount) {
  return {
    level: sampleCount >= 4 ? "moderate" : "low",
    reasons: [`${sampleCount}_weight_entries`],
    method: "weight_evidence_sufficiency",
  };
}

function provenance(calculationMethod, sourceEvidenceIds) {
  return {
    producer: "weight_pi_observation_service",
    producerVersion: WEIGHT_PI_PRODUCER_VERSION,
    calculationMethod,
    sourceEvidenceIds,
  };
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) throw new Error("requestedScopes must be an array.");
  const unique = [...new Set(scopes)];
  unique.forEach((scope) => {
    if (!SUPPORTED_SCOPES.has(scope)) {
      throw new Error(`Unsupported Weight PI scope: ${scope}.`);
    }
  });
  return unique;
}

function average(values) {
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function round(value) {
  return Number(value.toFixed(1));
}

function finiteNumber(value) {
  const number = Number(value);
  return value == null || value === "" || !Number.isFinite(number)
    ? null
    : number;
}
