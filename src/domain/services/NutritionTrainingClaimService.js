import { createPICrossDomainClaim } from "./PICrossDomainClaimService";
import { validatePIObservation } from "./PIObservationService";

export const NUTRITION_TRAINING_CLAIM_VERSION = "nutrition_training_claim_v1";

export function createNutritionTrainingClaims({
  trainingObservations = [],
  nutritionAssessment,
} = {}) {
  const before = structuredClone({ trainingObservations, nutritionAssessment });
  trainingObservations.forEach(validatePIObservation);
  const training = trainingObservations.find((item) => item.subject?.type === "training_scope") ?? null;
  const compatible = Boolean(training && nutritionAssessment &&
    training.evidenceWindow.startDate === nutritionAssessment.window.startDate &&
    training.evidenceWindow.endDate === nutritionAssessment.window.endDate);
  const relationshipState = relationship(training, nutritionAssessment, compatible);
  const claim = buildClaim(training, nutritionAssessment, compatible, relationshipState);
  if (JSON.stringify({ trainingObservations, nutritionAssessment }) !== JSON.stringify(before)) {
    throw new Error("Nutrition Training claim input mutation detected.");
  }
  return [claim];
}

function buildClaim(training, nutrition, compatible, relationshipState) {
  const limitations = [...new Set([
    ...(training?.confidence?.limitations ?? []),
    ...(nutrition?.limitations ?? []),
    ...(!compatible ? ["nutrition_training_window_mismatch"] : []),
    ...(!training ? ["canonical_training_meaning_unavailable"] : []),
    ...(!nutrition ? ["nutrition_support_assessment_unavailable"] : []),
  ])].sort();
  const ids = [training?.id, nutrition?.id].filter(Boolean);
  const evidenceIds = [...new Set([
    ...(training?.supportingEvidenceIds ?? []),
    ...(nutrition?.supportingEvidenceIds ?? []),
  ])].sort();
  return createPICrossDomainClaim({
    kind: "nutrition_training_relationship",
    semanticScope: `${training?.subject?.id ?? "resistance"}.protein_support.${nutrition?.cadence ?? "unknown"}`,
    participatingObservationIds: ids,
    participatingDomains: ["training", "nutrition"],
    evidenceWindow: {
      startDate: training?.evidenceWindow?.startDate ?? nutrition?.window?.startDate ?? null,
      endDate: training?.evidenceWindow?.endDate ?? nutrition?.window?.endDate ?? null,
    },
    confidence: weakerConfidence(training?.confidence, nutrition?.confidence, limitations),
    materiality: { level: "unevaluated", score: null, basis: [], method: "shared_ranking_pending" },
    explanationData: {
      relationship: "training_with_protein_support",
      relationshipState,
      trainingStatus: training?.status ?? "insufficient_data",
      trainingDirection: training?.direction ?? "not_applicable",
      proteinConsistency: nutrition?.proteinConsistency ?? "unknown",
      nutritionCompleteness: nutrition?.completeness ?? "missing",
      cadence: nutrition?.cadence ?? "unknown",
      windowCompatibility: { compatible, rule: nutrition?.cadence === "daily" ? "same_day" : "exact_cadence_window" },
      expectedDayCount: nutrition?.expectedDayCount ?? 0,
      completeDayCount: nutrition?.completeDayCount ?? 0,
      partialDayCount: nutrition?.partialDayCount ?? 0,
      missingDayCount: nutrition?.missingDayCount ?? 0,
      proteinTargetMetDayCount: nutrition?.proteinTargetMetDayCount ?? 0,
      proteinTargetMissedDayCount: nutrition?.proteinTargetMissedDayCount ?? 0,
      targetSource: nutrition?.target ? {
        sourceId: nutrition.target.sourceId,
        version: nutrition.target.version,
        effectiveDate: nutrition.target.effectiveDate,
        historicalProvenanceAvailable: Boolean(nutrition.target.effectiveDate),
      } : null,
      calorieBalanceInterpretation: null,
      causalInference: false,
      muscleGainConclusion: null,
      foodQualityJudgment: null,
      limitations,
    },
    provenance: {
      producer: "nutrition_training_claim_service",
      producerVersion: NUTRITION_TRAINING_CLAIM_VERSION,
      calculationMethod: "structured_training_protein_support_relationship",
      sourceObservationIds: ids,
      sourceEvidenceIds: evidenceIds,
      producerChain: [
        ...(training ? [{ observationId: training.id, producer: training.provenance.producer, producerVersion: training.provenance.producerVersion }] : []),
        ...(nutrition ? [{ observationId: nutrition.id, producer: nutrition.provenance.producer, producerVersion: nutrition.provenance.producerVersion }] : []),
      ],
    },
    limitations,
  });
}

function relationship(training, nutrition, compatible) {
  if (!training || !nutrition || !compatible || training.status === "insufficient_data") return "nutrition_training_relationship_insufficient";
  const consistency = nutrition.proteinConsistency;
  const incomplete = nutrition.completeness !== "complete";
  if (isVolumeGrowth(training)) return incomplete
    ? "training_volume_growth_with_incomplete_nutrition_support"
    : consistent(consistency)
      ? "training_volume_growth_with_consistent_protein_support"
      : "nutrition_training_relationship_insufficient";
  if (training.status === "improving") return incomplete
    ? "training_progress_despite_incomplete_nutrition_evidence"
    : consistent(consistency)
      ? "training_progress_with_consistent_protein_support"
      : "nutrition_training_relationship_insufficient";
  if (["stable", "plateauing"].includes(training.status) && consistent(consistency)) {
    return "training_stability_with_consistent_protein_support";
  }
  if (training.status === "regressing") return consistent(consistency)
    ? "training_decline_despite_adequate_protein_support"
    : ["inconsistently_met", "consistently_missed"].includes(consistency)
      ? "training_decline_with_inconsistent_protein_support"
      : "nutrition_training_relationship_insufficient";
  return "nutrition_training_relationship_insufficient";
}
function consistent(value) { return ["consistently_met", "mostly_met"].includes(value); }
function isVolumeGrowth(item) { return item?.kind === "training_volume" && ["rising", "positive"].includes(item.direction); }
function weakerConfidence(left, right, limitations) {
  const levels = ["unevaluated", "low", "moderate", "high", "very_high"];
  const values = [left?.level ?? "unevaluated", right?.level ?? "unevaluated"];
  const weakest = values.sort((a, b) => levels.indexOf(a) - levels.indexOf(b))[0];
  return { level: weakest, score: null, reasons: ["weaker_participant_ceiling"], factors: [], limitations, method: "nutrition_training_weaker_participant" };
}
