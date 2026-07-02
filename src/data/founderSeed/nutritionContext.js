import { createNutritionContext } from "../../domain/models/nutritionContext";

export const founderNutritionContext = createNutritionContext({
  id: "nutrition_context_founder_alpha",
  userId: "user_founder_001",
  estimatedDailyCaloricIntake: {
    min: 1900,
    max: 2200,
    unit: "kcal",
    source: {
      type: "manual_estimate",
      name: "Founder",
      externalId: null,
      importedAt: null,
      confidence: "medium",
      notes: "Founder Alpha estimated daily caloric intake range.",
    },
  },
  estimatedDailyActiveCalorieBurn: {
    value: 1000,
    unit: "kcal",
    marginOfErrorPercent: 30,
    notes:
      "Apple Watch active calorie estimate; Founder Alpha should account for up to 30% possible wearable error.",
    source: {
      type: "apple_watch_manual_estimate",
      name: "Founder",
      externalId: null,
      importedAt: null,
      confidence: "medium",
      notes: "Manual Founder Alpha estimate from Apple Watch active calories.",
    },
  },
  source: {
    type: "manual_estimate",
    name: "Founder",
    externalId: null,
    importedAt: null,
    confidence: "medium",
    notes: "Manual Founder Alpha nutrition and energy context. Context only; does not override observed evidence.",
  },
  fieldProvenance: {
    imported: [
      "estimatedDailyCaloricIntake",
      "estimatedDailyActiveCalorieBurn",
    ],
    computed: [],
  },
  createdAt: null,
  updatedAt: null,
});
