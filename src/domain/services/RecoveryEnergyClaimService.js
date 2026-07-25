import { createPICrossDomainClaim } from "./PICrossDomainClaimService";
import { validatePIObservation } from "./PIObservationService";

export const RECOVERY_ENERGY_CLAIM_VERSION = "recovery_energy_claim_v1";

export function createRecoveryEnergyClaims({
  recoveryAssessment,
  recoveryObservations = [],
  energyObservations = [],
  cadence,
} = {}) {
  [...recoveryObservations, ...energyObservations].forEach(validatePIObservation);
  const recovery = recoveryObservations.find((item) => item.kind === "recovery_state");
  const energy = energyObservations.find((item) => item.kind === "energy_balance");
  const coverage = energyObservations.find((item) => item.kind === "paired_day_coverage");
  const compatible = exactWindow(recovery, energy);
  const coverageState = energyCoverage(coverage, cadence);
  const sufficient = Boolean(
    recovery && energy && compatible &&
    recovery.status !== "insufficient_data" &&
    energy.status !== "insufficient_data" &&
    coverageState !== "missing" &&
    recoveryAssessment?.conflictState !== "conflict" &&
    !["insufficient", "unknown", "mixed"].includes(recoveryAssessment?.compositeState)
  );
  const energyState = support(energy);
  const relationshipState = sufficient
    ? relationship(recoveryAssessment.compositeState, energyState)
    : "recovery_energy_relationship_insufficient";
  const participants = [recovery, energy, coverage].filter(Boolean);
  const claimLimitations = limitations(
    participants, recoveryAssessment, sufficient, compatible, coverageState
  );
  return [createPICrossDomainClaim({
    kind: "recovery_energy_relationship",
    semanticScope: `recovery.estimated_energy_balance.${cadence}`,
    participatingObservationIds: participants.map((item) => item.id),
    participatingDomains: ["recovery", "energy"],
    evidenceWindow: combinedWindow(participants),
    confidence: confidence(participants, recoveryAssessment, sufficient, coverageState, claimLimitations),
    materiality: {
      level: "unevaluated", score: null, basis: [],
      method: "shared_ranking_pending",
    },
    explanationData: {
      relationship: "recovery_with_estimated_energy_support",
      relationshipState,
      cadence,
      recoveryState: recoveryAssessment?.compositeState ?? "unknown",
      recoveryCompleteness: recoveryAssessment?.completeness ?? "missing",
      recoveryFreshness: recoveryAssessment?.freshness ?? "missing",
      energySupportState: energyState,
      coverageState,
      pairedDayCount: coverage?.explanationData?.completePairedDays ?? 0,
      rmrSources: energy?.explanationData?.rmrSources ?? [],
      exactWindowCompatible: compatible,
      physiologicalDiagnosis: false,
      causalInference: false,
      protocolConclusion: null,
      limitations: claimLimitations,
    },
    provenance: {
      producer: "recovery_energy_claim_service",
      producerVersion: RECOVERY_ENERGY_CLAIM_VERSION,
      calculationMethod: "structured_observational_relationship",
      sourceObservationIds: participants.map((item) => item.id),
      producerChain: participants.map((item) => ({
        observationId: item.id,
        producer: item.provenance.producer,
        producerVersion: item.provenance.producerVersion,
      })),
    },
    limitations: claimLimitations,
  })];
}

function relationship(recovery, energy) {
  if (recovery === "strained") {
    return energy === "positive"
      ? "recovery_strain_despite_positive_energy_support"
      : "recovery_strain_with_negative_energy_balance";
  }
  if (recovery === "improving" && energy === "negative") {
    return "recovery_improvement_despite_negative_energy_balance";
  }
  return energy === "positive"
    ? "recovery_stability_with_positive_energy_support"
    : "recovery_stability_with_neutral_energy_support";
}
function support(item) {
  const value = item?.explanationData?.value ??
    item?.explanationData?.currentAverage ??
    item?.explanationData?.currentTotal ?? null;
  if (!Number.isFinite(value)) return "unknown";
  if (value > 100) return "positive";
  if (value < -100) return "negative";
  return "neutral";
}
function energyCoverage(item, cadence) {
  if (!item || item.status === "insufficient_data") return "missing";
  const complete = Number(item.explanationData?.completePairedDays ?? 0);
  const partial = Number(item.explanationData?.partialDays ?? 0);
  if (cadence === "daily") return complete === 1 ? "complete" : partial ? "partial" : "missing";
  return complete > 0 ? partial > 0 ? "partial" : "complete" : "missing";
}
function exactWindow(left, right) {
  return Boolean(left && right &&
    left.evidenceWindow.startDate === right.evidenceWindow.startDate &&
    left.evidenceWindow.endDate === right.evidenceWindow.endDate);
}
function confidence(participants, assessment, sufficient, coverageState, claimLimitations) {
  const order = ["unevaluated", "low", "moderate", "high", "very_high"];
  const levels = participants.map((item) => item.confidence.level);
  let level = levels.length
    ? levels.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0]
    : "unevaluated";
  if (!sufficient) level = "unevaluated";
  if (
    (assessment?.completeness === "partial" || coverageState === "partial") &&
    order.indexOf(level) > 1
  ) level = "low";
  return {
    level, score: null, reasons: ["weaker_participant_ceiling"],
    factors: [], limitations: claimLimitations,
    method: "recovery_energy_weaker_participant",
  };
}
function limitations(participants, assessment, sufficient, compatible, coverageState) {
  return unique([
    ...participants.flatMap((item) => item.confidence?.limitations ?? []),
    ...(assessment?.limitations ?? []),
    ...(!compatible ? ["recovery_energy_window_mismatch"] : []),
    ...(coverageState === "partial" ? ["energy_coverage_partial"] : []),
    ...(!sufficient ? ["recovery_energy_relationship_insufficient"] : []),
  ]);
}
function combinedWindow(items) {
  const starts = items.map((item) => item.evidenceWindow.startDate).filter(Boolean).sort();
  const ends = items.map((item) => item.evidenceWindow.endDate).filter(Boolean).sort();
  return { startDate: starts[0] ?? null, endDate: ends.at(-1) ?? null };
}
function unique(values) { return [...new Set(values.filter(Boolean))].sort(); }
