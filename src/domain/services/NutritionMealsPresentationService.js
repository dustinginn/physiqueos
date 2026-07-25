import { intersectsLongRange, resolveLongRangeWindow } from "./LongRangeTimeSeriesService";
import { getCanonicalWeekStart } from "./EnergyWeeklyAggregationService";
import { NUTRITION_MACRO_KEYS, getNutritionMacroPresentation } from "../../presentation/nutritionMacroPresentation";
import { NUTRITION_MEAL_SLOT_KEYS } from "../../presentation/nutritionMealPresentation";

export function filterNutritionMealsReport(
  model,
  { rangeId = "all", macroMixSlot = "dinner", trendSlot = "all", trendMetric = "calories" } = {}
) {
  const window = resolveLongRangeWindow({
    latestDate: model.period.latestEvidenceDate,
    rangeId,
  });
  const startDate = latestDate(model.period.startDate, window.startDate);
  const endDate = earliestDate(model.period.endDate, window.endDate);
  const days = model.days.filter((day) =>
    (!startDate || day.date >= startDate) && (!endDate || day.date <= endDate)
  );
  const meals = days.flatMap((day) => day.meals);
  const weeks = aggregateNutritionMealWeeks(days);
  const historyGroups = createMealHistoryGroups(days);
  return Object.freeze({
    rangeId: window.id,
    days: Object.freeze([...days].reverse()),
    meals: Object.freeze([...meals].reverse()),
    historyGroups,
    weeks: Object.freeze([...weeks].reverse()),
    summary: createMealSummary(days, meals),
    distribution: createMealDistribution(meals),
    macroMix: createMealMacroMix(meals, macroMixSlot),
    trend: createMealTrend(weeks, trendSlot, trendMetric),
    recurringMeals: createRecurringMeals(meals),
  });
}

export function createMealHistoryGroups(days = []) {
  return Object.freeze([...days]
    .filter((day) => day.meals?.length)
    .sort((left, right) => right.date.localeCompare(left.date))
    .map((day) => Object.freeze({
      id: `nutrition-meals-history-${day.date}`,
      date: day.date,
      dateLabel: formatHistoryDate(day.date),
      href: day.href,
      mealCount: day.meals.length,
      dailyCalories: day.totals?.calories ?? null,
      dailyMacros: Object.freeze({
        protein: day.totals?.protein_g ?? null,
        carbohydrates: day.totals?.carbs_g ?? null,
        fat: day.totals?.fat_g ?? null,
      }),
      meals: Object.freeze(
        day.meals
          .map((meal, index) => ({ meal, index }))
          .sort((left, right) =>
            mealOrder(left.meal.slot) - mealOrder(right.meal.slot) ||
            left.index - right.index
          )
          .map(({ meal }) => Object.freeze({
            ...meal,
            displayName: mealDisplayName(meal),
            showDistinctName: hasDistinctMealName(meal),
          }))
      ),
    })));
}

export function createMealDistribution(meals) {
  return Object.freeze(NUTRITION_MEAL_SLOT_KEYS.map((slot) => {
    const values = meals.filter((meal) => meal.slot === slot);
    return Object.freeze({
      slot,
      occurrenceCount: values.length,
      averageCalories: average(values.map((meal) => meal.totals.calories)),
    });
  }));
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

export function createMealMacroMix(meals, slot = "dinner") {
  const selected = meals.filter((meal) => meal.slot === slot);
  const items = NUTRITION_MACRO_KEYS.map((key) => {
    const presentation = getNutritionMacroPresentation(key);
    const field = presentation.field;
    const grams = selected
      .map((meal) => meal.totals[field])
      .filter((value) => value != null)
      .reduce((sum, value) => sum + value, 0);
    return { ...presentation, grams, calories: grams * presentation.caloriesPerGram };
  });
  const totalCalories = items.reduce((sum, item) => sum + item.calories, 0);
  if (!totalCalories) return Object.freeze({ available: false, slot, items: Object.freeze([]) });
  const percentages = roundToHundred(items.map((item) => item.calories / totalCalories * 100));
  return Object.freeze({
    available: true,
    slot,
    items: Object.freeze(items.map((item, index) =>
      Object.freeze({ ...item, percentage: percentages[index] })
    )),
  });
}

export function createMealTrend(weeks, slot, metric) {
  const field = metric === "protein" ? "protein" :
    metric === "carbohydrates" ? "carbohydrates" :
      metric === "fat" ? "fat" : null;
  return Object.freeze(weeks.map((week) => {
    const source = slot === "all" ? week.all : week.slots[slot];
    const value = metric === "mealCount"
      ? source.occurrenceCount
      : field ? source.averages[field] : source.averageCalories;
    return Object.freeze({
      id: `${week.id}-${slot}-${metric}`,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      value,
      occurrenceCount: source.occurrenceCount,
      loggedDayCount: week.loggedDayCount,
    });
  }).filter((week) => week.value != null));
}

export function createRecurringMeals(meals) {
  const groups = new Map();
  meals.filter((meal) => meal.signature).forEach((meal) => {
    const key = `${meal.slot}:${meal.signature}`;
    const values = groups.get(key) ?? [];
    values.push(meal);
    groups.set(key, values);
  });
  return Object.freeze([...groups.values()]
    .filter((values) => values.length >= 2)
    .map((values) => {
      const latest = [...values].sort((a, b) => b.date.localeCompare(a.date))[0];
      return Object.freeze({
        id: `${latest.slot}-${latest.signature}`,
        name: latest.foodNames.join(" + "),
        slot: latest.slot,
        occurrenceCount: values.length,
        averageCalories: average(values.map((meal) => meal.totals.calories)),
        averages: Object.freeze({
          protein: averageValid(values.map((meal) => meal.totals.protein_g)),
          carbohydrates: averageValid(values.map((meal) => meal.totals.carbs_g)),
          fat: averageValid(values.map((meal) => meal.totals.fat_g)),
        }),
        lastEaten: latest.date,
        occurrences: Object.freeze([...values].sort((a, b) => b.date.localeCompare(a.date))),
      });
    })
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount || b.lastEaten.localeCompare(a.lastEaten)));
}

function createMealSummary(days, meals) {
  const counts = Object.fromEntries(NUTRITION_MEAL_SLOT_KEYS.map((slot) => [
    slot, meals.filter((meal) => meal.slot === slot).length,
  ]));
  const mostCommonSlot = NUTRITION_MEAL_SLOT_KEYS
    .filter((slot) => counts[slot] > 0)
    .sort((left, right) => counts[right] - counts[left])[0] ?? null;
  const loggedDays = days.filter((day) => day.meals.length).length;
  return Object.freeze({
    averageMealsPerLoggedDay: loggedDays ? roundOne(meals.length / loggedDays) : null,
    mostCommonSlot,
    averageCaloriesPerMeal: average(meals.map((meal) => meal.totals.calories)),
    loggedDays,
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

function roundToHundred(values) {
  const floors = values.map(Math.floor);
  const order = values.map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  const result = [...floors];
  for (let index = 0; index < 100 - floors.reduce((sum, value) => sum + value, 0); index += 1) {
    result[order[index].index] += 1;
  }
  return result;
}

function average(values) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function averageValid(values) {
  return average(values.filter((value) => value != null));
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

function latestDate(left, right) {
  return [left, right].filter(Boolean).sort().at(-1) ?? null;
}

function earliestDate(left, right) {
  return [left, right].filter(Boolean).sort().at(0) ?? null;
}

function addDays(value, amount) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function mealOrder(slot) {
  const index = NUTRITION_MEAL_SLOT_KEYS.indexOf(slot);
  return index === -1 ? NUTRITION_MEAL_SLOT_KEYS.length : index;
}

function hasDistinctMealName(meal) {
  const slotLabel = NUTRITION_MEAL_SLOT_KEYS.includes(meal.slot)
    ? meal.slot
    : String(meal.slot ?? "");
  return normalizeLabel(meal.name) !== normalizeLabel(slotLabel);
}

function mealDisplayName(meal) {
  const name = String(meal.name ?? "").trim();
  return name || meal.slot || "Meal";
}

function normalizeLabel(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "snack" ? "snacks" : normalized;
}

function formatHistoryDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}
