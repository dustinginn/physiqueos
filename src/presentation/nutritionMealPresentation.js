export const NUTRITION_MEAL_SLOT_KEYS = [
  "breakfast",
  "lunch",
  "dinner",
  "snacks",
];

export const NUTRITION_MEAL_SLOT_PRESENTATION = Object.freeze({
  breakfast: Object.freeze({
    key: "breakfast",
    label: "Breakfast",
    icon: "☀",
    color: "var(--meal-breakfast)",
    foregroundClassName: "text-[var(--meal-breakfast)]",
    backgroundClassName: "bg-[color-mix(in_srgb,var(--meal-breakfast)_12%,transparent)]",
  }),
  lunch: Object.freeze({
    key: "lunch",
    label: "Lunch",
    icon: "◐",
    color: "var(--meal-lunch)",
    foregroundClassName: "text-[var(--meal-lunch)]",
    backgroundClassName: "bg-[color-mix(in_srgb,var(--meal-lunch)_12%,transparent)]",
  }),
  dinner: Object.freeze({
    key: "dinner",
    label: "Dinner",
    icon: "☾",
    color: "var(--meal-dinner)",
    foregroundClassName: "text-[var(--meal-dinner)]",
    backgroundClassName: "bg-[color-mix(in_srgb,var(--meal-dinner)_12%,transparent)]",
  }),
  snacks: Object.freeze({
    key: "snacks",
    label: "Snacks",
    icon: "•",
    color: "var(--meal-snacks)",
    foregroundClassName: "text-[var(--meal-snacks)]",
    backgroundClassName: "bg-[color-mix(in_srgb,var(--meal-snacks)_12%,transparent)]",
  }),
});

export function getNutritionMealSlotPresentation(key) {
  return NUTRITION_MEAL_SLOT_PRESENTATION[key] ??
    NUTRITION_MEAL_SLOT_PRESENTATION.dinner;
}
