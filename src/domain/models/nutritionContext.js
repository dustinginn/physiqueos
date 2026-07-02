import { createFieldProvenance, createSource } from "./recordMetadata";

export function createNutritionContext(data = {}) {
  return {
    id: "",
    userId: "",
    estimatedDailyCaloricIntake: {
      min: null,
      max: null,
      unit: "kcal",
    },
    estimatedDailyActiveCalorieBurn: {
      value: null,
      unit: "kcal",
      marginOfErrorPercent: null,
      notes: "",
    },
    source: createSource({ type: "manual_estimate", confidence: "medium" }),
    fieldProvenance: createFieldProvenance(),
    createdAt: "",
    updatedAt: "",
    ...data,
  };
}
