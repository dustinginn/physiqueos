import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { getNutritionTimelineReport } from "./NutritionEvidenceContextService";
import { getCanonicalWeekStart } from "./EnergyWeeklyAggregationService";
import { NUTRITION_MEAL_SLOT_KEYS } from "../../presentation/nutritionMealPresentation";

const TOTAL_FIELDS = ["calories", "protein_g", "carbs_g", "fat_g"];

export async function getNutritionMealsReport({
  context,
  currentDate = new Date(),
  repositories = FounderRepositories,
} = {}) {
  const { report, timeline } = await getNutritionTimelineReport({
    context,
    currentDate,
    repositories,
  });
  return createNutritionMealsPageModel({ report, timeline });
}

export function createNutritionMealsPageModel({ report, timeline }) {
  const days = (report.nutritionDays ?? [])
    .map(toMealDay)
    .sort((left, right) => left.date.localeCompare(right.date));
  return Object.freeze({
    timeline: Object.freeze({
      ...timeline,
      currentPath: "/progress/nutrition/reporting/meals",
    }),
    period: Object.freeze({
      startDate: timeline.startDate ?? days.at(0)?.date ?? null,
      endDate: timeline.endDate ?? days.at(-1)?.date ?? null,
      latestEvidenceDate: days.at(-1)?.date ?? null,
    }),
    days: Object.freeze(days),
    dataSources: Object.freeze(report.dataSources ?? []),
  });
}

export function aggregateNutritionMealWeeks(days = []) {
  const buckets = new Map();
  days.forEach((day) => {
    const start = getCanonicalWeekStart(day.date);
    const bucket = buckets.get(start) ?? [];
    bucket.push(day);
    buckets.set(start, bucket);
  });
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, values]) => {
      const meals = values.flatMap((day) => day.meals);
      return Object.freeze({
        id: `nutrition-meals-week-${weekStart}`,
        weekStart,
        weekEnd: addDays(weekStart, 6),
        loggedDayCount: values.filter((day) => day.meals.length).length,
        mealCount: meals.length,
        slots: Object.freeze(Object.fromEntries(
          NUTRITION_MEAL_SLOT_KEYS.map((slot) => [
            slot,
            summarizeMeals(meals.filter((meal) => meal.slot === slot)),
          ])
        )),
        all: summarizeMeals(meals),
      });
    })
    .filter((week) => week.mealCount > 0);
}

function toMealDay(day) {
  return Object.freeze({
    id: day.id,
    date: day.date,
    href: day.href,
    totals: Object.freeze(Object.fromEntries(
      TOTAL_FIELDS.map((field) => [field, validNumber(day.totals?.[field])])
    )),
    sourceLabels: Object.freeze(day.sourceEvidence ?? []),
    meals: Object.freeze((day.meals ?? []).map((meal, order) =>
      toCanonicalMeal(meal, day, order)
    ).filter(Boolean)),
  });
}

function toCanonicalMeal(meal, day, order) {
  const slot = normalizeSlot(meal.name);
  if (!slot) return null;
  const totals = Object.freeze(Object.fromEntries(
    TOTAL_FIELDS.map((field) => [field, validNumber(meal.totals?.[field])])
  ));
  if (totals.calories == null) return null;
  const foodNames = Object.freeze((meal.foods ?? [])
    .map((food) => String(food.canonical_name ?? food.name ?? "").trim())
    .filter(Boolean));
  return Object.freeze({
    id: meal.id ?? `${day.id}-${slot}-${order}`,
    date: day.date,
    dayId: day.id,
    href: day.href,
    slot,
    name: String(meal.name || slot),
    totals,
    foodCount: foodNames.length,
    foodNames,
    signature: foodNames.length
      ? foodNames.map(normalizeFoodName).sort().join("|")
      : null,
  });
}

function summarizeMeals(meals) {
  return Object.freeze({
    occurrenceCount: meals.length,
    averageCalories: average(meals.map((meal) => meal.totals.calories)),
    averages: Object.freeze({
      protein: averageValid(meals.map((meal) => meal.totals.protein_g)),
      carbohydrates: averageValid(meals.map((meal) => meal.totals.carbs_g)),
      fat: averageValid(meals.map((meal) => meal.totals.fat_g)),
    }),
  });
}

function normalizeSlot(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "snack") return "snacks";
  return NUTRITION_MEAL_SLOT_KEYS.includes(normalized) ? normalized : null;
}

function normalizeFoodName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function validNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function average(values) {
  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;
}

function averageValid(values) {
  return average(values.filter((value) => value != null));
}

function addDays(value, amount) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
