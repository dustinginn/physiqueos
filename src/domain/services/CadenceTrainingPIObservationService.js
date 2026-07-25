import { adaptTrainingPerformanceReportToPIObservations } from "./TrainingPIObservationAdapter";
import { createPIObservation } from "./PIObservationService";

export const CADENCE_TRAINING_PI_OBSERVATION_VERSION =
  "cadence_training_pi_observation_v1";

export function createCadenceTrainingPIObservations({
  report,
  canonicalTrainingEvidence = [],
  cadence,
  evidenceWindow,
  comparisonWindow = null,
  windowTimeZone = null,
} = {}) {
  const before = structuredClone({
    report, canonicalTrainingEvidence, cadence, evidenceWindow,
    comparisonWindow, windowTimeZone,
  });
  const source = adaptTrainingPerformanceReportToPIObservations(report);
  const sessions = canonicalTrainingEvidence.map(unwrap).filter((item) =>
    item?.evidence_type === "training" && item.id
  );
  const current = sessions.filter((item) => inside(sessionDate(item), evidenceWindow));
  const comparison = comparisonWindow
    ? sessions.filter((item) => inside(sessionDate(item), comparisonWindow))
    : [];
  const sourceDates = sessions.map(sessionDate).filter(Boolean).sort();
  const sourceWindow = {
    startDate: sourceDates[0] ?? null,
    endDate: sourceDates.at(-1) ?? null,
  };
  const currentIds = unique(current.map((item) => item.id));
  const comparisonIds = unique(comparison.map((item) => item.id));
  const observations = source.map((item) => createPIObservation({
    ...item,
    evidenceWindow: {
      startDate: evidenceWindow.startDate,
      endDate: evidenceWindow.endDate,
      comparisonStartDate: comparisonWindow?.startDate ?? null,
      comparisonEndDate: comparisonWindow?.endDate ?? null,
    },
    explanationData: {
      ...item.explanationData,
      cadenceWindow: {
        cadence,
        evidenceWindow: {
          startDate: evidenceWindow.startDate,
          endDate: evidenceWindow.endDate,
        },
        comparisonWindow: comparisonWindow ? {
          startDate: comparisonWindow.startDate,
          endDate: comparisonWindow.endDate,
        } : null,
        sourceWindow,
        windowTimeZone,
        eligibleSessionCount: sessions.length,
        currentWindowSessionCount: current.length,
        comparisonWindowSessionCount: comparison.length,
        evidenceIds: currentIds,
        comparisonEvidenceIds: comparisonIds,
        authoritativeEligible: current.length > 0,
        limitations: current.length ? [] : ["no_training_session_in_current_window"],
      },
    },
    provenance: {
      ...item.provenance,
      cadenceWindowProducer: "cadence_training_pi_observation_service",
      cadenceWindowProducerVersion: CADENCE_TRAINING_PI_OBSERVATION_VERSION,
    },
  }));
  if (JSON.stringify({
    report, canonicalTrainingEvidence, cadence, evidenceWindow,
    comparisonWindow, windowTimeZone,
  }) !== JSON.stringify(before)) {
    throw new Error("Cadence Training PI input mutation detected.");
  }
  return observations;
}

function unwrap(value) {
  return value?.payload ? { ...value.payload, id: value.payload.id ?? value.canonicalId } : value;
}
function sessionDate(value) {
  return String(value?.observed_at ?? value?.date ?? "").slice(0, 10);
}
function inside(value, window) {
  return Boolean(value && window && value >= window.startDate && value <= window.endDate);
}
function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}
