import { createPICrossDomainClaim } from "./PICrossDomainClaimService";
import { validatePIObservation } from "./PIObservationService";

export const TRAINING_ENERGY_CLAIM_VERSION = "training_energy_claim_v1";

export function createTrainingEnergyClaims({
  trainingObservations = [],
  energyObservations = [],
  cadence = "weekly",
} = {}) {
  const before = structuredClone({ trainingObservations, energyObservations });
  [...trainingObservations, ...energyObservations].forEach(validatePIObservation);
  const training = dominantTraining(trainingObservations);
  const balance = energyObservations.find((item) => item.kind === "energy_balance");
  const coverage = energyObservations.find((item) => item.kind === "paired_day_coverage");
  const compatibility = compatibleWindows(training, balance, cadence);
  const coverageState = energyCoverage(coverage, cadence);
  const sufficient = training && balance && compatibility.compatible &&
    training.status !== "insufficient_data" &&
    balance.status !== "insufficient_data" &&
    coverageState !== "missing";
  const participants = [training, balance, coverage].filter(Boolean);
  const relationshipState = sufficient
    ? relationshipKind(training, balance, coverageState)
    : "training_energy_relationship_insufficient";
  const claim = createClaim({
    kind: "training_energy_relationship",
    relationshipState,
    participants,
    cadence,
    compatibility,
    coverageState,
    training,
    balance,
    coverage,
  });
  if (JSON.stringify({ trainingObservations, energyObservations }) !== JSON.stringify(before)) {
    throw new Error("Training Energy claim input mutation detected.");
  }
  return [claim];
}

function createClaim({ kind, relationshipState, participants, cadence, compatibility, coverageState, training, balance, coverage }) {
  const limitations = [...new Set([
    ...participants.flatMap((item) => item.confidence?.limitations ?? []),
    ...(!compatibility.compatible ? [compatibility.reason] : []),
    ...(coverageState === "partial" ? ["energy_coverage_partial"] : []),
    ...(!training ? ["canonical_training_meaning_unavailable"] : []),
    ...(!balance ? ["energy_balance_unavailable"] : []),
  ])].filter(Boolean).sort();
  const confidence = weakestConfidence(participants, limitations, coverageState);
  const scope = `${trainingScope(training)}.${energyScope(balance)}.${cadence}`;
  return createPICrossDomainClaim({
    kind,
    semanticScope: scope,
    participatingObservationIds: participants.map((item) => item.id),
    participatingDomains: ["training", "energy"],
    evidenceWindow: combinedWindow(participants),
    confidence,
    materiality: { level: "unevaluated", score: null, basis: [], method: "shared_ranking_pending" },
    explanationData: {
      relationship: "training_with_estimated_energy_support",
      relationshipState,
      cadence,
      trainingStatus: training?.status ?? "insufficient_data",
      trainingDirection: training?.direction ?? "not_applicable",
      energyDirection: balance?.direction ?? "not_applicable",
      estimatedBalance: balanceValue(balance),
      energySupportState: energySupport(balance),
      coverageState,
      pairedDayCount: coverage?.explanationData?.completePairedDays ?? 0,
      completeDayCount: coverage?.explanationData?.completePairedDays ?? 0,
      partialDayCount: coverage?.explanationData?.partialDays ?? 0,
      rmrSources: balance?.explanationData?.rmrSources ?? [],
      windowCompatibility: compatibility,
      causalInference: false,
      leanMassConclusion: null,
      maintenanceConclusion: null,
      limitations,
    },
    provenance: {
      producer: "training_energy_claim_service",
      producerVersion: TRAINING_ENERGY_CLAIM_VERSION,
      calculationMethod: "structured_training_energy_relationship",
      sourceObservationIds: participants.map((item) => item.id),
      producerChain: participants.map((item) => ({
        observationId: item.id,
        producer: item.provenance.producer,
        producerVersion: item.provenance.producerVersion,
      })),
    },
    limitations,
  });
}

function relationshipKind(training, balance, coverageState) {
  const support = energySupport(balance);
  if (isVolumeGrowth(training) && ["positive", "neutral"].includes(support)) {
    return "training_volume_growth_with_energy_support";
  }
  if (training.status === "improving") {
    if (support === "positive") return "training_progress_with_positive_energy_support";
    if (support === "neutral") return "training_progress_with_neutral_energy_support";
    return "training_progress_despite_negative_energy_balance";
  }
  if (["stable", "plateauing"].includes(training.status)) {
    if (balance.direction === "falling") return "training_stability_with_declining_energy_support";
    if (support === "positive") return "training_stability_with_positive_energy_balance";
  }
  if (training.status === "regressing") {
    return support === "positive"
      ? "training_decline_despite_positive_energy_balance"
      : "training_decline_with_negative_energy_balance";
  }
  return "training_energy_relationship_insufficient";
}

function dominantTraining(values) {
  return values.find((item) => item.subject?.type === "training_scope") ??
    values.find((item) => item.kind === "training_volume" && item.subject?.type === "training_scope") ??
    null;
}
function isVolumeGrowth(item) {
  return item?.kind === "training_volume" && ["rising", "positive"].includes(item.direction);
}
function energySupport(item) {
  const value = balanceValue(item);
  if (!Number.isFinite(value)) return "unknown";
  if (value > 100) return "positive";
  if (value < -100) return "negative";
  return "neutral";
}
function balanceValue(item) {
  return item?.explanationData?.value ??
    item?.explanationData?.currentAverage ??
    item?.explanationData?.currentTotal ??
    null;
}
function energyCoverage(item, cadence) {
  if (!item || item.status === "insufficient_data") return "missing";
  const complete = Number(item.explanationData?.completePairedDays ?? 0);
  const partial = Number(item.explanationData?.partialDays ?? 0);
  if (cadence === "daily") return complete === 1 ? "complete" : partial ? "partial" : "missing";
  return complete > 0 ? partial > 0 ? "partial" : "complete" : "missing";
}
function compatibleWindows(training, energy, cadence) {
  if (!training || !energy) return { compatible: false, reason: "participant_window_unavailable" };
  const exact = training.evidenceWindow.startDate === energy.evidenceWindow.startDate &&
    training.evidenceWindow.endDate === energy.evidenceWindow.endDate;
  return {
    compatible: exact,
    rule: cadence === "daily" ? "same_day" : "exact_cadence_window",
    reason: exact ? null : "training_energy_window_mismatch",
  };
}
function weakestConfidence(items, limitations, coverageState) {
  const levels = ["unevaluated", "low", "moderate", "high", "very_high"];
  const weakest = items.length
    ? items.map((item) => item.confidence.level).sort((a, b) => levels.indexOf(a) - levels.indexOf(b))[0]
    : "unevaluated";
  const index = Math.max(0, levels.indexOf(weakest) - (coverageState === "partial" ? 1 : 0));
  return { level: levels[index], score: null, reasons: ["weaker_participant_ceiling"], factors: [], limitations, method: "training_energy_weaker_participant" };
}
function trainingScope(item) { return item?.subject?.id ?? "resistance"; }
function energyScope(item) { return item?.subject?.id ?? "estimated_energy_balance"; }
function combinedWindow(items) {
  const starts = items.map((item) => item.evidenceWindow.startDate).filter(Boolean).sort();
  const ends = items.map((item) => item.evidenceWindow.endDate).filter(Boolean).sort();
  return { startDate: starts[0] ?? null, endDate: ends.at(-1) ?? null };
}
