import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { getNutritionTimelineReport } from "./NutritionEvidenceContextService";
import { getCanonicalWeekStart } from "./EnergyWeeklyAggregationService";
export { filterNutritionCaloriesReport } from "./NutritionCaloriesPresentationService";

export async function getNutritionCaloriesReport({
  context,
  currentDate = new Date(),
  repositories = FounderRepositories,
} = {}) {
  const { report, timeline } = await getNutritionTimelineReport({
    context,
    currentDate,
    repositories,
  });

  return createNutritionCaloriesPageModel({ report, timeline });
}

export function createNutritionCaloriesPageModel({ report, timeline }) {
  const days = (report.nutritionDays ?? [])
    .map(toCalorieDay)
    .filter(Boolean)
    .sort((left, right) => left.date.localeCompare(right.date));
  const periodStart = timeline.startDate ?? days.at(0)?.date ?? null;
  const periodEnd = timeline.endDate ?? days.at(-1)?.date ?? null;
  const weeks = aggregateNutritionCalorieWeeks(days);

  return Object.freeze({
    timeline: Object.freeze({
      ...timeline,
      currentPath: "/progress/nutrition/reporting/calories",
    }),
    period: Object.freeze({
      startDate: periodStart,
      endDate: periodEnd,
      latestEvidenceDate: days.at(-1)?.date ?? null,
    }),
    days: Object.freeze(days),
    weeks: Object.freeze(weeks),
    dataSources: Object.freeze(report.dataSources ?? []),
    target: Object.freeze({
      available: false,
      label: "Target unavailable for this period",
    }),
  });
}

export function aggregateNutritionCalorieWeeks(days = []) {
  const buckets = new Map();

  days.forEach((day) => {
    const weekStart = getCanonicalWeekStart(day.date);
    const values = buckets.get(weekStart) ?? [];
    values.push(day);
    buckets.set(weekStart, values);
  });

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, values]) => {
      const calories = values.map((day) => day.calories);
      return Object.freeze({
        id: `nutrition-calories-week-${weekStart}`,
        weekStart,
        weekEnd: addDays(weekStart, 6),
        averageCalories: average(calories),
        loggedDayCount: values.length,
        minimumCalories: Math.min(...calories),
        maximumCalories: Math.max(...calories),
      });
    });
}

function toCalorieDay(day) {
  const calories = Number(day.totals?.calories);
  if (!Number.isFinite(calories)) return null;

  return Object.freeze({
    id: day.id,
    date: day.date,
    calories,
    href: day.href,
    mealCount: day.meals?.length ?? 0,
    sourceLabels: Object.freeze(day.sourceEvidence ?? []),
  });
}

function average(values) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function addDays(value, amount) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
