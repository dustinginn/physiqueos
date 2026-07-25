import { createNutritionSupportAssessment } from "./NutritionSupportAssessmentService";
import { createNutritionTrainingClaims } from "./NutritionTrainingClaimService";
import { createTrainingEnergyClaims } from "./TrainingEnergyClaimService";
import { assessPISemanticOverlap } from "./PISemanticOverlapService";

export const PI_V3_TRAINING_SUPPORT_SHADOW_VERSION =
  "pi_v3_training_support_shadow_v1";

export function createPIV3TrainingSupportShadowResult({
  cadence,
  window,
  trainingObservations = [],
  energyObservations = [],
  nutritionDays = [],
  proteinTarget = null,
} = {}) {
  const before = structuredClone({
    cadence, window, trainingObservations, energyObservations,
    nutritionDays, proteinTarget,
  });
  const nutritionAssessment = createNutritionSupportAssessment({
    nutritionDays,
    target: proteinTarget,
    window,
    cadence,
  });
  const trainingEnergyClaims = createTrainingEnergyClaims({
    trainingObservations,
    energyObservations,
    cadence,
  });
  const nutritionTrainingClaims = createNutritionTrainingClaims({
    trainingObservations,
    nutritionAssessment,
  });
  const overlap = assessPISemanticOverlap(
    trainingEnergyClaims[0],
    nutritionTrainingClaims[0]
  );
  const result = Object.freeze({
    schemaVersion: PI_V3_TRAINING_SUPPORT_SHADOW_VERSION,
    cadence,
    window: structuredClone(window),
    nutritionAssessment,
    claims: Object.freeze([
      ...trainingEnergyClaims,
      ...nutritionTrainingClaims,
    ]),
    overlap,
    authority: Object.freeze({
      state: "shadow_only",
      artifactMutation: false,
      memoryMutation: false,
      recommendationMutation: false,
    }),
    provenance: Object.freeze({
      producer: "pi_v3_training_support_shadow_service",
      producerVersion: PI_V3_TRAINING_SUPPORT_SHADOW_VERSION,
      repositoryReads: 0,
      persistenceWrites: 0,
      runtimeClockReads: 0,
    }),
  });
  if (JSON.stringify({
    cadence, window, trainingObservations, energyObservations,
    nutritionDays, proteinTarget,
  }) !== JSON.stringify(before)) {
    throw new Error("PI V3 Training support shadow input mutation detected.");
  }
  return result;
}
