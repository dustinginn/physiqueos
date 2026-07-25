import {
  createPIObservation,
  sortPIObservations,
} from "./PIObservationService";

export const RECOVERY_PI_OBSERVATION_VERSION = "recovery_pi_observation_v1";

const KINDS = Object.freeze({
  sleep_duration: "recovery_sleep_duration_change",
  subjective_recovery: "recovery_subjective_state_change",
  soreness: "recovery_soreness_change",
});

export function createRecoveryPIObservations({
  assessment,
  includeInsufficientData = true,
  semanticHorizon = null,
} = {}) {
  if (assessment?.schemaVersion !== "recovery_evidence_assessment_v1") {
    throw new Error("A canonical Recovery evidence assessment is required.");
  }
  const before = structuredClone(assessment);
  const horizon = semanticHorizon ?? assessment.cadence;
  const observations = Object.values(assessment.metricAssessments).map(
    (metric) => metricObservation(metric, assessment, horizon)
  ).filter((observation) =>
    includeInsufficientData || observation.status !== "insufficient_data"
  );
  observations.push(compositeObservation(assessment, horizon));
  if (assessment.conflictState === "conflict") {
    observations.push(conflictObservation(assessment, horizon));
  }
  if (
    includeInsufficientData &&
    ["insufficient", "unknown"].includes(assessment.compositeState)
  ) observations.push(insufficientObservation(assessment, horizon));
  if (JSON.stringify(assessment) !== JSON.stringify(before)) {
    throw new Error("Recovery observation input mutation detected.");
  }
  return sortPIObservations(observations);
}

function metricObservation(metric, assessment, horizon) {
  const semantics = metricSemantics(metric);
  return createPIObservation({
    domain: "recovery",
    kind: KINDS[metric.metric],
    semanticScope: `${horizon}.${metric.metric}`,
    subject: {
      type: "recovery_metric",
      id: metric.metric,
      label: metric.metric.replaceAll("_", " "),
    },
    status: metric.status === "observed"
      ? semantics.status : "insufficient_data",
    direction: metric.direction,
    evidenceWindow: observationWindow(assessment),
    supportingEvidenceIds: unique([
      ...metric.currentEvidenceIds,
      ...metric.comparisonEvidenceIds,
    ]),
    confidence: observationConfidence(metric.confidence, metric.limitations),
    explanationData: {
      metric: metric.metric,
      currentValue: metric.currentValue,
      comparisonValue: metric.comparisonValue,
      currentRecordCount: metric.currentRecordCount,
      comparisonRecordCount: metric.comparisonRecordCount,
      completeness: metric.completeness,
      freshness: metric.freshness,
      physiologicalDiagnosis: false,
      causalInference: false,
      protocolConclusion: null,
      limitations: metric.limitations,
    },
    provenance: provenance("metric_assessment", unique([
      ...metric.currentEvidenceIds,
      ...metric.comparisonEvidenceIds,
    ])),
  });
}

function compositeObservation(assessment, horizon) {
  const state = assessment.compositeState;
  return createPIObservation({
    domain: "recovery",
    kind: "recovery_state",
    semanticScope: `${horizon}.composite`,
    subject: { type: "recovery_scope", id: "whole_body", label: "Recovery evidence" },
    status: state === "improving" ? "improving"
      : state === "stable" ? "stable"
        : state === "strained" ? "regressing"
          : state === "insufficient" || state === "unknown"
            ? "insufficient_data" : "observed",
    direction: state === "improving" ? "positive"
      : state === "strained" ? "negative"
        : state === "stable" ? "stable" : "not_applicable",
    evidenceWindow: observationWindow(assessment),
    supportingEvidenceIds: assessment.evidenceIds,
    confidence: aggregateConfidence(assessment),
    explanationData: {
      compositeState: state,
      conflictState: assessment.conflictState,
      completeness: assessment.completeness,
      freshness: assessment.freshness,
      coveredDayCount: assessment.coveredDayCount,
      expectedDayCount: assessment.expectedDayCount,
      physiologicalDiagnosis: false,
      causalInference: false,
      limitations: assessment.limitations,
    },
    provenance: provenance("composite_assessment", assessment.evidenceIds),
  });
}

function conflictObservation(assessment, horizon) {
  return createPIObservation({
    domain: "recovery",
    kind: "recovery_metric_conflict",
    semanticScope: `${horizon}.metric_conflict`,
    subject: { type: "recovery_scope", id: "metric_conflict", label: "Recovery metric conflict" },
    status: "observed",
    direction: "unknown",
    evidenceWindow: observationWindow(assessment),
    supportingEvidenceIds: assessment.evidenceIds,
    confidence: {
      level: "low",
      reasons: ["structured_metrics_conflict"],
      limitations: assessment.limitations,
      method: "recovery_conflict_visibility",
    },
    explanationData: {
      conflictState: assessment.conflictState,
      compositeState: assessment.compositeState,
      diagnosis: null,
      limitations: assessment.limitations,
    },
    provenance: provenance("metric_conflict", assessment.evidenceIds),
  });
}

function insufficientObservation(assessment, horizon) {
  return createPIObservation({
    domain: "recovery",
    kind: "recovery_insufficient_evidence",
    semanticScope: `${horizon}.evidence_sufficiency`,
    subject: { type: "recovery_evidence", id: "coverage", label: "Recovery evidence coverage" },
    status: "insufficient_data",
    direction: "not_applicable",
    evidenceWindow: observationWindow(assessment),
    supportingEvidenceIds: assessment.evidenceIds,
    confidence: {
      level: "unevaluated",
      limitations: assessment.limitations,
      method: "recovery_evidence_threshold",
    },
    explanationData: {
      coveredDayCount: assessment.coveredDayCount,
      expectedDayCount: assessment.expectedDayCount,
      threshold: assessment.provenance.threshold,
      limitations: assessment.limitations,
    },
    provenance: provenance("evidence_sufficiency", assessment.evidenceIds),
  });
}

function metricSemantics(metric) {
  if (metric.direction === "stable" || metric.direction === "not_applicable") {
    return { status: metric.direction === "stable" ? "stable" : "observed" };
  }
  const improving = metric.metric === "soreness"
    ? metric.direction === "falling" : metric.direction === "rising";
  return { status: improving ? "improving" : "regressing" };
}
function aggregateConfidence(assessment) {
  const levels = Object.values(assessment.metricAssessments)
    .filter((metric) => metric.status === "observed")
    .map((metric) => metric.confidence.level);
  const order = ["unevaluated", "low", "moderate", "high", "very_high"];
  const weakest = levels.length
    ? levels.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0]
    : "unevaluated";
  return {
    level: assessment.conflictState === "conflict" && order.indexOf(weakest) > 1
      ? "low" : weakest,
    reasons: assessment.coveredDayCount
      ? [`${assessment.coveredDayCount}_covered_recovery_dates`] : [],
    limitations: assessment.limitations,
    method: "recovery_weaker_metric_ceiling",
  };
}
function observationConfidence(confidence, limitations) {
  return {
    level: confidence.level,
    reasons: [],
    limitations,
    method: confidence.method,
  };
}
function observationWindow(assessment) {
  return {
    ...assessment.window,
    ...(assessment.comparisonWindow
      ? {
          comparisonStartDate: assessment.comparisonWindow.startDate,
          comparisonEndDate: assessment.comparisonWindow.endDate,
        }
      : {}),
  };
}
function provenance(calculationMethod, ids) {
  return {
    producer: "recovery_pi_observation_service",
    producerVersion: RECOVERY_PI_OBSERVATION_VERSION,
    calculationMethod,
    sourceEvidenceIds: ids,
  };
}
function unique(values) { return [...new Set(values.filter(Boolean))].sort(); }
