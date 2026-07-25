import { createPIObservation } from "./PIObservationService";

export const TRAINING_PI_OBSERVATION_PRODUCER_VERSION =
  "training_performance_v1";

export function adaptTrainingObservationToPIObservation(observation) {
  if (!observation || typeof observation !== "object") {
    throw new Error("A Training observation is required.");
  }

  const subject = getTrainingSubject(observation);
  const supportingEvidenceIds = observation.supporting_session_ids ?? [];

  return createPIObservation({
    // Existing Training IDs are a production compatibility boundary. The
    // shared semantic ID helper is used by new producers, not retrofitted here.
    id: observation.id,
    domain: "training",
    kind: observation.observation_type,
    subject,
    status: observation.status,
    direction: getTrainingDirection(observation.status),
    evidenceWindow: {
      startDate: observation.evidence_date_range?.start,
      endDate: observation.evidence_date_range?.end,
    },
    supportingEvidenceIds,
    confidence: {
      level: observation.confidence,
      method: "training_session_count",
    },
    explanationData: observation.explanation_data,
    provenance: {
      producer: "training_performance_intelligence_service",
      producerVersion: TRAINING_PI_OBSERVATION_PRODUCER_VERSION,
      calculationMethod: "legacy_training_performance_observation",
      sourceEvidenceIds: [
        ...supportingEvidenceIds,
        ...(observation.provenance?.training_session_ids ?? []),
      ],
    },
  });
}

export function adaptTrainingPerformanceReportToPIObservations(report) {
  if (!report || !Array.isArray(report.observations)) {
    throw new Error("A Training performance report with observations is required.");
  }
  return report.observations.map(adaptTrainingObservationToPIObservation);
}

function getTrainingSubject(observation) {
  if (observation.scope === "exercise") {
    return {
      type: "exercise",
      id: observation.exercise?.key,
      label: observation.exercise?.name,
    };
  }
  if (observation.scope === "category") {
    return {
      type: "training_category",
      id: toSemanticKey(observation.category),
      label: observation.category,
    };
  }
  if (observation.scope === "overall") {
    return {
      type: "training_scope",
      id: "resistance",
      label: "Resistance training",
    };
  }
  throw new Error(`Unsupported Training observation scope: ${observation.scope}.`);
}

function getTrainingDirection(status) {
  if (status === "improving") return "positive";
  if (status === "regressing") return "negative";
  if (status === "stable" || status === "plateauing") return "neutral";
  if (status === "insufficient_data") return "not_applicable";
  return "unknown";
}

function toSemanticKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
