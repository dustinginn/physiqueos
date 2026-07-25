export const NUTRITION_MACRO_KEYS = Object.freeze([
  "protein",
  "carbohydrates",
  "fat",
]);

export const NUTRITION_MACRO_PRESENTATION = Object.freeze({
  protein: Object.freeze({
    key: "protein",
    field: "protein_g",
    label: "Protein",
    caloriesPerGram: 4,
    color: "var(--macro-protein)",
    foregroundClassName: "text-[var(--macro-protein)]",
    backgroundClassName:
      "bg-[color-mix(in_srgb,var(--macro-protein)_13%,transparent)]",
  }),
  carbohydrates: Object.freeze({
    key: "carbohydrates",
    field: "carbs_g",
    label: "Carbohydrates",
    caloriesPerGram: 4,
    color: "var(--macro-carbohydrates)",
    foregroundClassName: "text-[var(--macro-carbohydrates)]",
    backgroundClassName:
      "bg-[color-mix(in_srgb,var(--macro-carbohydrates)_13%,transparent)]",
  }),
  fat: Object.freeze({
    key: "fat",
    field: "fat_g",
    label: "Fat",
    caloriesPerGram: 9,
    color: "var(--macro-fat)",
    foregroundClassName: "text-[var(--macro-fat)]",
    backgroundClassName:
      "bg-[color-mix(in_srgb,var(--macro-fat)_13%,transparent)]",
  }),
});

export function getNutritionMacroPresentation(key) {
  return (
    NUTRITION_MACRO_PRESENTATION[key] ??
    NUTRITION_MACRO_PRESENTATION.protein
  );
}
