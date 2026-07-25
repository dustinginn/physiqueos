import { assessPISemanticOverlap } from "./PISemanticOverlapService";
import { assessPISemanticWindowCompatibility } from "./PISemanticWindowCompatibilityService";
import { createTrainingEnergyClaims } from "./TrainingEnergyClaimService";

export const PI_TRAINING_ENERGY_READINESS_VERSION =
  "pi_training_energy_readiness_v1";

const EVENT_TYPES = new Set([
  "body_fat_guardrail",
  "dexa_event",
  "photo_event",
  "goal_completion",
  "goal_transition",
  "milestone",
]);

export function assessPITrainingEnergyReadiness({
  cadence,
  trainingObservations = [],
  energyObservations = [],
  competingCandidates = [],
  renderingCompatible = true,
  memoryCompatible = true,
} = {}) {
  const before = structuredClone({
    cadence,
    trainingObservations,
    energyObservations,
    competingCandidates,
    renderingCompatible,
    memoryCompatible,
  });
  const training = dominantTraining(trainingObservations);
  const balance = energyObservations.find((item) => item.kind === "energy_balance");
  const coverage = energyObservations.find((item) => item.kind === "paired_day_coverage");
  const cadenceWindow = training?.explanationData?.cadenceWindow ?? null;
  const compatibility = assessPISemanticWindowCompatibility(
    training?.evidenceWindow,
    balance?.evidenceWindow
  );
  const claim = createTrainingEnergyClaims({
    trainingObservations,
    energyObservations,
    cadence,
  })[0] ?? null;
  const energyCompleteness = completeness(coverage, cadence);
  const eventConflict = competingCandidates.some((item) =>
    EVENT_TYPES.has(item?.candidateType)
  );
  const overlapAssessments = competingCandidates.map((item) =>
    assessPISemanticOverlap(item, claim)
  );
  const redundantOverlap = competingCandidates.some((item) =>
    item?.semanticOverlap === "redundant"
  ) || overlapAssessments.some((item) =>
    ["redundant", "higher_authority_owned"].includes(item.state)
  );
  const reasons = [
    ...(!training ? ["training_observation_unavailable"] : []),
    ...(!cadenceWindow ? ["cadence_training_window_unavailable"] : []),
    ...(cadenceWindow && cadenceWindow.currentWindowSessionCount < 1
      ? ["no_training_session_in_current_window"] : []),
    ...(compatibility.state !== "exact_match"
      ? [`training_energy_window_${compatibility.state}`] : []),
    ...(training?.status === "insufficient_data"
      ? ["training_evidence_insufficient"] : []),
    ...(energyCompleteness === "missing"
      ? ["energy_evidence_insufficient"] : []),
    ...(cadence === "daily" && energyCompleteness !== "complete"
      ? ["daily_energy_evidence_not_exact"] : []),
    ...(claim?.explanationData?.relationshipState ===
      "training_energy_relationship_insufficient"
      ? ["relationship_evidence_insufficient"] : []),
    ...(eventConflict ? ["higher_authority_event_owns_surface"] : []),
    ...(redundantOverlap ? ["semantic_overlap_redundant"] : []),
    ...(!renderingCompatible ? ["rendering_unsupported"] : []),
    ...(!memoryCompatible ? ["memory_unsupported"] : []),
  ];
  const result = Object.freeze({
    schemaVersion: PI_TRAINING_ENERGY_READINESS_VERSION,
    cadence,
    window: training?.evidenceWindow ?? null,
    trainingEvidence: Object.freeze({
      currentWindowSessionCount: cadenceWindow?.currentWindowSessionCount ?? 0,
      comparisonWindowSessionCount:
        cadenceWindow?.comparisonWindowSessionCount ?? 0,
      sourceWindow: cadenceWindow?.sourceWindow ?? null,
      evidenceWindow: cadenceWindow?.evidenceWindow ?? null,
      comparisonWindow: cadenceWindow?.comparisonWindow ?? null,
      sufficient: Boolean(
        training &&
        cadenceWindow?.currentWindowSessionCount > 0 &&
        training.status !== "insufficient_data"
      ),
    }),
    energyCompleteness,
    compatibility,
    overlap: redundantOverlap
      ? "redundant"
      : overlapAssessments.some((item) => item.state === "partial_overlap")
        ? "partial_overlap"
        : "none",
    eventConflict,
    authorityReady: reasons.length === 0,
    reason: reasons[0] ?? "exact_ready",
    reasons: Object.freeze([...new Set(reasons)]),
    claim,
    repositoryReads: 0,
    runtimeClockReads: 0,
    authoritativeOutputChanges: 0,
    memoryMutations: 0,
  });
  if (JSON.stringify({
    cadence,
    trainingObservations,
    energyObservations,
    competingCandidates,
    renderingCompatible,
    memoryCompatible,
  }) !== JSON.stringify(before)) {
    throw new Error("Training Energy readiness input mutation detected.");
  }
  return result;
}

function dominantTraining(values) {
  return values.find((item) => item.subject?.type === "training_scope") ?? null;
}

function completeness(coverage, cadence) {
  if (!coverage || coverage.status === "insufficient_data") return "missing";
  const complete = Number(coverage.explanationData?.completePairedDays ?? 0);
  const partial = Number(coverage.explanationData?.partialDays ?? 0);
  if (cadence === "daily") {
    return complete === 1 ? "complete" : partial > 0 ? "partial" : "missing";
  }
  return complete > 0 ? partial > 0 ? "partial" : "complete" : "missing";
}
