import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { getNutritionTimelineReport } from "./NutritionEvidenceContextService";
import { getCanonicalWeekStart } from "./EnergyWeeklyAggregationService";
import {
  NUTRITION_MACRO_KEYS,
  NUTRITION_MACRO_PRESENTATION,
} from "../../presentation/nutritionMacroPresentation";

export async function getNutritionMacrosReport({
  context,
  currentDate = new Date(),
  repositories = FounderRepositories,
} = {}) {
  const { report, timeline } = await getNutritionTimelineReport({
    context,
    currentDate,
    repositories,
  });
  return createNutritionMacrosPageModel({ report, timeline });
}

export function createNutritionMacrosPageModel({ report, timeline }) {
  const days = (report.nutritionDays ?? [])
    .map(toMacroDay)
    .filter((day) => day && NUTRITION_MACRO_KEYS.some((key) => day.macros[key] != null))
    .sort((left, right) => left.date.localeCompare(right.date));

  return Object.freeze({
    timeline: Object.freeze({
      ...timeline,
      currentPath: "/progress/nutrition/reporting/macros",
    }),
    period: Object.freeze({
      startDate: timeline.startDate ?? days.at(0)?.date ?? null,
      endDate: timeline.endDate ?? days.at(-1)?.date ?? null,
      latestEvidenceDate: days.at(-1)?.date ?? null,
    }),
    days: Object.freeze(days),
    weeks: Object.freeze(aggregateNutritionMacroWeeks(days)),
    dataSources: Object.freeze(report.dataSources ?? []),
    target: Object.freeze({
      available: false,
      label: "Targets unavailable for this period",
    }),
  });
}

export function aggregateNutritionMacroWeeks(days = []) {
  const buckets = new Map();
  days.forEach((day) => {
    const start = getCanonicalWeekStart(day.date);
    const values = buckets.get(start) ?? [];
    values.push(day);
    buckets.set(start, values);
  });

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, values]) =>
      Object.freeze({
        id: `nutrition-macros-week-${weekStart}`,
        weekStart,
        weekEnd: addDays(weekStart, 6),
        loggedDayCount: values.length,
        macros: Object.freeze(
          Object.fromEntries(
            NUTRITION_MACRO_KEYS.map((key) => [
              key,
              summarizeMacro(values, key),
            ])
          )
        ),
      })
    );
}

function toMacroDay(day) {
  const macros = Object.fromEntries(
    NUTRITION_MACRO_KEYS.map((key) => {
      const value = Number(day.totals?.[NUTRITION_MACRO_PRESENTATION[key].field]);
      return [key, Number.isFinite(value) && value >= 0 ? value : null];
    })
  );
  return Object.freeze({
    id: day.id,
    date: day.date,
    href: day.href,
    macros: Object.freeze(macros),
    mealCount: day.meals?.length ?? 0,
    sourceLabels: Object.freeze(day.sourceEvidence ?? []),
  });
}

function summarizeMacro(days, key) {
  const values = days
    .filter((day) => day.macros[key] != null)
    .map((day) => ({ date: day.date, value: day.macros[key] }));
  if (!values.length) {
    return Object.freeze({
      average: null,
      count: 0,
      minimum: null,
      maximum: null,
    });
  }
  return Object.freeze({
    average: roundedAverage(values.map((item) => item.value)),
    count: values.length,
    minimum: Math.min(...values.map((item) => item.value)),
    maximum: Math.max(...values.map((item) => item.value)),
  });
}

function roundedAverage(values) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function addDays(value, amount) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
