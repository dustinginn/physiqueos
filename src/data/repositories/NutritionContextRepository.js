import { seedNutritionContext } from "../seed/nutritionContext";

export function createNutritionContextRepository(nutritionContext = null, options = {}) {
  return {
    async getNutritionContext(userId) {
      if (!nutritionContext || nutritionContext.userId !== userId) return null;

      return nutritionContext;
    },

    async saveNutritionContext(context) {
      if (nutritionContext) {
        Object.assign(nutritionContext, context);
      } else {
        nutritionContext = context;
      }
      options.onChange?.();

      return nutritionContext;
    },

    async updateNutritionContext(userId, patch) {
      if (!nutritionContext || nutritionContext.userId !== userId) return null;

      Object.assign(nutritionContext, {
        ...nutritionContext,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      options.onChange?.();

      return nutritionContext;
    },
  };
}

export const NutritionContextRepository =
  createNutritionContextRepository(seedNutritionContext);
