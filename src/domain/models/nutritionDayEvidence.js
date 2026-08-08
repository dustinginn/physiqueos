export const NUTRITION_DAY_SCHEMA_VERSION = "nutrition-day-v1";
export const NutritionDailyTotalsScope = Object.freeze({
  FULL_DAY_SUMMARY: "full_day_summary",
  PARTIAL_MEAL_SUBTOTAL: "partial_meal_subtotal",
  UNKNOWN: "unknown",
});
export const NUTRITION_RECONCILIATION_TOLERANCE = {
  calories: 25,
  protein_g: 2,
  carbs_g: 2,
  fat_g: 2,
};

const DEFAULT_TOTALS = {
  calories: null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  fiber_g: null,
  sugar_g: null,
  sodium_mg: null,
  cholesterol_mg: null,
};

const DEFAULT_TARGETS = {
  calories: null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  fiber_g: null,
  sugar_g: null,
  sodium_mg: null,
  cholesterol_mg: null,
};

const DEFAULT_MACRO_PERCENTAGES = {
  protein: { grams: null, percent_of_calories: null, goal_percent: null },
  carbohydrates: { grams: null, percent_of_calories: null, goal_percent: null },
  fat: { grams: null, percent_of_calories: null, goal_percent: null },
};

const DEFAULT_GOAL_STATUS = {
  calories: { actual: null, goal: null, difference: null, unit: "calories" },
  protein_g: { actual: null, goal: null, difference: null, unit: "g" },
  carbs_g: { actual: null, goal: null, difference: null, unit: "g" },
  fat_g: { actual: null, goal: null, difference: null, unit: "g" },
  fiber_g: { actual: null, goal: null, difference: null, unit: "g" },
  sugar_g: { actual: null, goal: null, difference: null, unit: "g" },
  sodium_mg: { actual: null, goal: null, difference: null, unit: "mg" },
  cholesterol_mg: { actual: null, goal: null, difference: null, unit: "mg" },
};

export function createNutritionDayEvidenceObject({
  capturedAt = null,
  confidence = { extraction: "moderate", interpretation: "moderate" },
  dailyTotals = {},
  date = null,
  goalStatus = {},
  id,
  macroPercentages = {},
  meals = [],
  metadata = {},
  nutrients = [],
  provenance = {},
  quality = { status: "partial", limitations: [] },
  source = {},
  targets = {},
}) {
  return {
    id,
    evidence_type: "nutrition",
    observed_at: date,
    captured_at: capturedAt,
    source: {
      modality: source.modality ?? "manual",
      application: source.application ?? null,
      integration: source.integration ?? null,
      source_artifact_refs: source.source_artifact_refs ?? [],
    },
    metadata: {
      date,
      source: source.application ?? source.modality ?? "manual",
      completeness: metadata.completeness ?? "partial",
      daily_totals_scope: normalizeDailyTotalsScope(
        metadata.daily_totals_scope
      ),
      daily_totals_source_artifact_refs:
        metadata.daily_totals_source_artifact_refs ?? [],
      meal_count: metadata.meal_count ?? meals.length,
      food_count: metadata.food_count ?? countFoods(meals),
      goal_set: metadata.goal_set ?? hasNutritionGoals({ goalStatus, targets }),
      confidence: metadata.confidence ?? "moderate",
      provenance: provenance.source_artifact_refs ?? source.source_artifact_refs ?? [],
    },
    daily_totals: {
      ...DEFAULT_TOTALS,
      ...withoutEmptyValues(dailyTotals),
    },
    targets: {
      ...DEFAULT_TARGETS,
      ...withoutEmptyValues(targets),
    },
    macro_percentages: normalizeMacroPercentages(macroPercentages),
    goal_status: normalizeGoalStatus(goalStatus, {
      dailyTotals,
      targets,
    }),
    nutrients: normalizeVisibleNutrients(nutrients),
    meals: normalizeMeals(meals),
    confidence,
    quality,
    provenance: {
      source_artifact_refs:
        provenance.source_artifact_refs ??
        source.source_artifact_refs ??
        [],
    },
  };
}

export function createNutritionDayEvidenceFromText({
  capturedAt = null,
  date = null,
  id,
  provenanceRef = "typed_evidence_0",
  sourceArtifactRefs = [provenanceRef],
  sourceModality = "manual",
  text,
}) {
  const dailyTotals = parseDailyNutritionTotals(text);
  const meals = parseMealNutritionText(text, { provenanceRef });

  if (Object.keys(dailyTotals).length === 0 && meals.length === 0) return null;

  return createNutritionDayEvidenceObject({
    capturedAt,
    dailyTotals,
    date,
    id,
    meals,
    metadata: {
      completeness: dailyTotals.calories ? "daily_totals_available" : "partial",
    },
    quality: {
      status: "partial",
      limitations: [
        "Typed nutrition evidence may not represent the full day unless daily totals are provided.",
      ],
    },
    source: {
      modality: sourceModality,
      application: null,
      integration: null,
      source_artifact_refs: sourceArtifactRefs,
    },
    provenance: {
      source_artifact_refs: sourceArtifactRefs,
    },
  });
}

export function parseDailyNutritionTotals(text) {
  const value = String(text ?? "");
  const totals = {};

  assignIfNumber(totals, "calories", matchNumber(value, /(\d[\d,]*)\s*(?:calories|cals|cal)\b/i));
  assignIfNumber(totals, "protein_g", matchNumber(value, /(\d[\d,]*)\s*(?:g\s*)?protein\b/i));
  assignIfNumber(totals, "carbs_g", matchNumber(value, /(\d[\d,]*)\s*(?:g\s*)?(?:carbs|carbohydrates)\b/i));
  assignIfNumber(totals, "fat_g", matchNumber(value, /(\d[\d,]*)\s*(?:g\s*)?fat\b/i));
  assignIfNumber(totals, "fiber_g", matchNumber(value, /(\d[\d,]*)\s*(?:g\s*)?fiber\b/i));
  assignIfNumber(totals, "sugar_g", matchNumber(value, /(\d[\d,]*)\s*(?:g\s*)?sugar\b/i));
  assignIfNumber(totals, "sodium_mg", matchNumber(value, /(\d[\d,]*)\s*(?:mg\s*)?sodium\b/i));
  assignIfNumber(totals, "cholesterol_mg", matchNumber(value, /(\d[\d,]*)\s*(?:mg\s*)?cholesterol\b/i));

  return totals;
}

export function reconcileNutritionDayEvidence({
  dailyTotals = {},
  meals = [],
  tolerance = NUTRITION_RECONCILIATION_TOLERANCE,
} = {}) {
  const normalizedMeals = normalizeMeals(meals);
  const mealSums = sumNutritionTotals(normalizedMeals.map((meal) => meal.totals));
  const differences = Object.fromEntries(
    Object.keys(NUTRITION_RECONCILIATION_TOLERANCE).map((key) => [
      key,
      finiteDifference(dailyTotals[key], mealSums[key]),
    ])
  );
  const comparableKeys = Object.keys(differences).filter(
    (key) => differences[key] !== null
  );
  const withinTolerance =
    comparableKeys.length > 0 &&
    comparableKeys.every(
      (key) => Math.abs(differences[key]) <= (tolerance[key] ?? 0)
    );

  return {
    authoritative_source: hasMeaningfulTotals(dailyTotals)
      ? "daily_totals"
      : "meal_sums",
    status:
      comparableKeys.length === 0
        ? "not_comparable"
        : withinTolerance
          ? "reconciled"
          : "needs_review",
    tolerance: { ...tolerance },
    meal_sums: mealSums,
    differences,
  };
}

// Older pending reviews may contain a gap left by former name-based food
// deduplication. Recover only when item sequence and meal calories independently
// identify one exact duplicate.
export function restoreCollapsedNutritionFoodDuplicates(meal = {}) {
  const foods = Array.isArray(meal.foods) ? meal.foods : [];
  const numericIds = foods
    .map((food) => String(food.id ?? "").match(/^(.*?)(\d+)$/))
    .filter(Boolean);
  if (numericIds.length !== foods.length || foods.length < 2) return foods;
  if (new Set(numericIds.map((match) => match[1])).size !== 1) return foods;

  const numbers = numericIds.map((match) => Number(match[2])).sort((a, b) => a - b);
  const missing = [];
  for (let value = numbers[0]; value <= numbers[numbers.length - 1]; value += 1) {
    if (!numbers.includes(value)) missing.push(value);
  }
  if (missing.length !== 1) return foods;

  const mealCalories = finiteNumber(meal.totals?.calories);
  const foodCalories = foods.reduce(
    (sum, food) => sum + (finiteNumber(food.nutrients?.calories) ?? 0),
    0
  );
  if (mealCalories === null) return foods;
  const gap = mealCalories - foodCalories;
  const duplicate = foods.find(
    (food) => Math.abs((finiteNumber(food.nutrients?.calories) ?? -1) - gap) <= 1
  );
  if (!duplicate || gap <= 0) return foods;

  const recovered = {
    ...duplicate,
    id: `${numericIds[0][1]}${missing[0]}`,
    provenance: {
      ...duplicate.provenance,
      reconciliation: "recovered_collapsed_duplicate",
    },
  };
  return [...foods, recovered].sort(
    (first, second) =>
      Number(String(first.id).match(/(\d+)$/)?.[1] ?? 0) -
      Number(String(second.id).match(/(\d+)$/)?.[1] ?? 0)
  );
}

function parseMealNutritionText(text, { provenanceRef }) {
  const value = String(text ?? "");
  const mealMatch = value.match(/\b(breakfast|lunch|dinner|snack|snacks)\b/i);
  if (!mealMatch) return [];

  const mealName = titleCase(mealMatch[1]);
  const totals = parseDailyNutritionTotals(value);
  const foodText = value
    .replace(/^.*?\bwas\b/i, "")
    .replace(/\b\d[\d,]*\s*(?:calories|cals|cal|carbs|carbohydrates|fat|protein|fiber|sugar|sodium|cholesterol)\b.*$/i, "");
  const foods = foodText
    .split(/\band\b|,/i)
    .map((food) => food.trim().replace(/[.。]+$/g, ""))
    .filter((food) => food && !/\d+\s*(calories|carbs|protein|fat)/i.test(food))
    .map((food, index) => ({
      id: `${slugify(mealName)}_food_${index + 1}`,
      canonical_name: food,
      name: food,
      brand: null,
      serving_size: null,
      servings: null,
      meal: mealName,
      nutrients: { ...DEFAULT_TOTALS },
      visible_nutrients: [],
      provenance_ref: provenanceRef,
      provenance: {
        source_artifact_refs: [provenanceRef],
      },
    }));

  return [
    {
      id: slugify(mealName),
      name: mealName,
      totals,
      foods,
      provenance_ref: provenanceRef,
    },
  ];
}

function normalizeMeals(meals) {
  return (Array.isArray(meals) ? meals : []).map((meal, mealIndex) => {
    const mealId = meal.id ?? `${slugify(meal.name ?? "meal")}_${mealIndex + 1}`;
    return {
    id: mealId,
    name: meal.name ?? "Meal",
    completeness: meal.completeness ?? getMealCompleteness(meal),
    known_foods:
      meal.known_foods ??
      (Array.isArray(meal.foods)
        ? meal.foods
            .map((food) => food.canonical_name ?? food.name)
            .filter(Boolean)
        : []),
    additional_foods_detected:
      Number.isFinite(Number(meal.additional_foods_detected))
        ? Number(meal.additional_foods_detected)
        : null,
    totals: {
      ...DEFAULT_TOTALS,
      ...withoutEmptyValues(meal.totals ?? {}),
    },
    foods: normalizeFoods(meal.foods ?? [], mealId),
    provenance_ref: meal.provenance_ref ?? "unknown",
    provenance: {
      source_artifact_refs:
        meal.provenance?.source_artifact_refs ??
        [meal.provenance_ref ?? "unknown"],
    },
  };
  });
}

function normalizeFoods(foods, mealId = "meal") {
  return (Array.isArray(foods) ? foods : []).map((food, index) => {
    const canonicalName = food.canonical_name ?? food.name ?? `Food ${index + 1}`;

    return {
      id: food.id ?? `${mealId}_food_${index + 1}`,
      canonical_name: canonicalName,
      name: food.name ?? canonicalName,
      brand: food.brand ?? null,
      serving_size: food.serving_size ?? null,
      servings: Number.isFinite(Number(food.servings)) ? Number(food.servings) : null,
      meal: food.meal ?? null,
      nutrients: {
        ...DEFAULT_TOTALS,
        ...withoutEmptyValues(food.nutrients ?? {}),
      },
      percent_of_daily_goals: normalizeFoodPercentOfDailyGoals(
        food.percent_of_daily_goals ?? food.percent_daily_goals ?? {}
      ),
      visible_nutrients: normalizeVisibleNutrients(food.visible_nutrients ?? []),
      provenance_ref: food.provenance_ref ?? "unknown",
      provenance: {
        source_artifact_refs:
          food.provenance?.source_artifact_refs ??
          [food.provenance_ref ?? "unknown"],
      },
    };
  });
}

function sumNutritionTotals(totals = []) {
  return Object.fromEntries(
    Object.keys(DEFAULT_TOTALS).map((key) => {
      const values = totals
        .map((entry) => finiteNumber(entry?.[key]))
        .filter((value) => value !== null);
      return [key, values.length ? values.reduce((sum, value) => sum + value, 0) : null];
    })
  );
}

function finiteDifference(authoritative, compared) {
  const first = finiteNumber(authoritative);
  const second = finiteNumber(compared);
  return first === null || second === null ? null : first - second;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasMeaningfulTotals(totals = {}) {
  return Object.values(totals).some((value) => finiteNumber(value) !== null);
}

function normalizeFoodPercentOfDailyGoals(percentages = {}) {
  return {
    calories: normalizePercentage(percentages.calories),
    protein: normalizePercentage(percentages.protein ?? percentages.protein_g),
    carbs: normalizePercentage(percentages.carbs ?? percentages.carbohydrates ?? percentages.carbs_g),
    fat: normalizePercentage(percentages.fat ?? percentages.fat_g),
    fiber: normalizePercentage(percentages.fiber ?? percentages.fiber_g),
    sugar: normalizePercentage(percentages.sugar ?? percentages.sugar_g),
    sodium: normalizePercentage(percentages.sodium ?? percentages.sodium_mg),
    cholesterol: normalizePercentage(
      percentages.cholesterol ?? percentages.cholesterol_mg
    ),
  };
}

function normalizePercentage(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;

  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function countFoods(meals = []) {
  return meals.reduce(
    (count, meal) => count + (Array.isArray(meal.foods) ? meal.foods.length : 0),
    0
  );
}

function hasNutritionGoals({ goalStatus = {}, targets = {} }) {
  return [...Object.values(goalStatus), ...Object.values(targets)].some((value) => {
    if (value === null || value === undefined || value === "") return false;
    if (typeof value === "object") {
      return Object.values(value).some(
        (nestedValue) => nestedValue !== null && nestedValue !== undefined && nestedValue !== ""
      );
    }

    return true;
  });
}

function getMealCompleteness(meal = {}) {
  if (meal.completeness) return meal.completeness;
  if (Number(meal.additional_foods_detected) > 0) return "partial";
  if (Array.isArray(meal.foods) && meal.foods.length > 0) return "known_foods_available";

  return "unknown";
}

function normalizeMacroPercentages(macroPercentages = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_MACRO_PERCENTAGES).map(([key, defaults]) => [
      key,
      {
        ...defaults,
        ...withoutEmptyValues(macroPercentages[key] ?? {}),
      },
    ])
  );
}

function normalizeGoalStatus(goalStatus = {}, { dailyTotals = {}, targets = {} } = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_GOAL_STATUS).map(([key, defaults]) => {
      const actual = goalStatus[key]?.actual ?? dailyTotals[key] ?? null;
      const goal = goalStatus[key]?.goal ?? targets[key] ?? null;
      const difference =
        goalStatus[key]?.difference ??
        (Number.isFinite(Number(actual)) && Number.isFinite(Number(goal))
          ? Number(actual) - Number(goal)
          : null);

      return [
        key,
        {
          ...defaults,
          ...withoutEmptyValues(goalStatus[key] ?? {}),
          actual,
          goal,
          difference,
        },
      ];
    })
  );
}

function normalizeVisibleNutrients(nutrients) {
  return (Array.isArray(nutrients) ? nutrients : []).map((nutrient) => ({
    name: nutrient.name ?? "Nutrient",
    total: nutrient.total ?? null,
    goal: nutrient.goal ?? null,
    remaining: nutrient.remaining ?? null,
    unit: nutrient.unit ?? null,
    percent_daily_value: nutrient.percent_daily_value ?? null,
    provenance_ref: nutrient.provenance_ref ?? "unknown",
  }));
}

function assignIfNumber(target, key, value) {
  if (Number.isFinite(value)) target[key] = value;
}

function matchNumber(value, pattern) {
  const match = value.match(pattern);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function titleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function withoutEmptyValues(object) {
  return Object.fromEntries(
    Object.entries(object ?? {}).filter(
      ([, value]) => value !== null && value !== undefined && value !== ""
    )
  );
}

function normalizeDailyTotalsScope(value) {
  return Object.values(NutritionDailyTotalsScope).includes(value)
    ? value
    : NutritionDailyTotalsScope.UNKNOWN;
}
