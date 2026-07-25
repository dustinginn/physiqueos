import { createPICrossDomainClaim } from "./PICrossDomainClaimService";
import { validatePIObservation } from "./PIObservationService";

export const RECOVERY_TRAINING_CLAIM_VERSION =
  "recovery_training_claim_v1";

export function createRecoveryTrainingClaims({
  recoveryAssessment,
  recoveryObservations = [],
  trainingObservations = [],
  cadence,
} = {}) {
  [...recoveryObservations, ...trainingObservations].forEach(validatePIObservation);
  const recovery = recoveryObservations.find(
    (item) => item.kind === "recovery_state"
  );
  const training = dominantTraining(trainingObservations);
  const compatible = exactWindow(recovery, training);
  const sufficient = Boolean(
    recovery &&
    training &&
    compatible &&
    !["insufficient_data"].includes(recovery.status) &&
    !["insufficient_data"].includes(training.status) &&
    recoveryAssessment?.conflictState !== "conflict" &&
    !["insufficient", "unknown", "mixed"].includes(
      recoveryAssessment?.compositeState
    )
  );
  const relationshipState = sufficient
    ? relationship(training, recoveryAssessment.compositeState)
    : "training_recovery_relationship_insufficient";
  const participants = [training, recovery].filter(Boolean);
  return [createPICrossDomainClaim({
    kind: "recovery_training_relationship",
    semanticScope: `${training?.subject?.id ?? "resistance"}.recovery.${cadence}`,
    participatingObservationIds: participants.map((item) => item.id),
    participatingDomains: ["training", "recovery"],
    evidenceWindow: combinedWindow(participants),
    confidence: confidence(participants, recoveryAssessment, sufficient),
    materiality: {
      level: "unevaluated", score: null, basis: [],
      method: "shared_ranking_pending",
    },
    explanationData: {
      relationship: "training_with_recovery_context",
      relationshipState,
      cadence,
      trainingStatus: training?.status ?? "insufficient_data",
      trainingDirection: training?.direction ?? "not_applicable",
      recoveryState: recoveryAssessment?.compositeState ?? "unknown",
      recoveryCompleteness: recoveryAssessment?.completeness ?? "missing",
      recoveryFreshness: recoveryAssessment?.freshness ?? "missing",
      recoveryCoveredDayCount: recoveryAssessment?.coveredDayCount ?? 0,
      exactWindowCompatible: compatible,
      physiologicalDiagnosis: false,
      causalInference: false,
      protocolConclusion: null,
      limitations: limitations(participants, recoveryAssessment, sufficient, compatible),
    },
    provenance: provenance(participants),
    limitations: limitations(participants, recoveryAssessment, sufficient, compatible),
  })];
}

function relationship(training, recovery) {
  const volume = training.kind === "training_volume" &&
    ["rising", "positive"].includes(training.direction);
  if (volume) {
    return recovery === "strained"
      ? "training_volume_growth_with_declining_recovery"
      : "training_volume_growth_with_stable_recovery";
  }
  if (training.status === "improving") {
    if (recovery === "improving") return "training_progress_with_improving_recovery";
    if (recovery === "strained") return "training_progress_despite_strained_recovery";
    return "training_progress_with_stable_recovery";
  }
  if (["stable", "plateauing"].includes(training.status) && recovery === "strained") {
    return "training_stability_with_strained_recovery";
  }
  if (training.status === "regressing") {
    return recovery === "strained"
      ? "training_decline_with_strained_recovery"
      : "training_decline_despite_stable_recovery";
  }
  return "training_recovery_relationship_insufficient";
}
function dominantTraining(values) {
  return values.find((item) => item.subject?.type === "training_scope") ??
    values.find((item) => item.kind === "training_volume") ?? null;
}
function exactWindow(left, right) {
  return Boolean(left && right &&
    left.evidenceWindow.startDate === right.evidenceWindow.startDate &&
    left.evidenceWindow.endDate === right.evidenceWindow.endDate);
}
function confidence(participants, assessment, sufficient) {
  const order = ["unevaluated", "low", "moderate", "high", "very_high"];
  const levels = participants.map((item) => item.confidence.level);
  let level = levels.length
    ? levels.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0]
    : "unevaluated";
  if (!sufficient) level = "unevaluated";
  if (assessment?.completeness === "partial" && order.indexOf(level) > 1) level = "low";
  const claimLimitations = limitations(participants, assessment, sufficient, true);
  return {
    level, score: null, reasons: ["weaker_participant_ceiling"],
    factors: [], limitations: claimLimitations,
    method: "recovery_training_weaker_participant",
  };
}
function limitations(participants, assessment, sufficient, compatible) {
  return unique([
    ...participants.flatMap((item) => item.confidence?.limitations ?? []),
    ...(assessment?.limitations ?? []),
    ...(!compatible ? ["recovery_training_window_mismatch"] : []),
    ...(!sufficient ? ["recovery_training_relationship_insufficient"] : []),
  ]);
}
function combinedWindow(items) {
  const starts = items.map((item) => item.evidenceWindow.startDate).filter(Boolean).sort();
  const ends = items.map((item) => item.evidenceWindow.endDate).filter(Boolean).sort();
  return { startDate: starts[0] ?? null, endDate: ends.at(-1) ?? null };
}
function provenance(participants) {
  return {
    producer: "recovery_training_claim_service",
    producerVersion: RECOVERY_TRAINING_CLAIM_VERSION,
    calculationMethod: "structured_observational_relationship",
    sourceObservationIds: participants.map((item) => item.id),
    producerChain: participants.map((item) => ({
      observationId: item.id,
      producer: item.provenance.producer,
      producerVersion: item.provenance.producerVersion,
    })),
  };
}
function unique(values) { return [...new Set(values.filter(Boolean))].sort(); }
