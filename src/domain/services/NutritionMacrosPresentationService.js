import {
  intersectsLongRange,
  resolveLongRangeWindow,
} from "./LongRangeTimeSeriesService";
import {
  getNutritionMacroPresentation,
  NUTRITION_MACRO_KEYS,
} from "../../presentation/nutritionMacroPresentation";

export function filterNutritionMacrosReport(
  model,
  { macroKey = "protein", rangeId = "all" } = {}
) {
  const selectedMacro = getNutritionMacroPresentation(macroKey);
  const window = resolveLongRangeWindow({
    latestDate: model.period.latestEvidenceDate,
    rangeId,
  });
  const startDate = latestDate(model.period.startDate, window.startDate);
  const evidenceEnd = earliestDate(model.period.endDate, window.endDate);
  const coverageEnd =
    window.id === "all"
      ? model.period.endDate
      : earliestDate(model.period.endDate, window.endDate);
  const chronologicalDays = model.days.filter(
    (day) =>
      (!startDate || day.date >= startDate) &&
      (!evidenceEnd || day.date <= evidenceEnd)
  );
  const chronologicalWeeks = model.weeks.filter((week) =>
    intersectsLongRange(week, { startDate, endDate: evidenceEnd })
  );

  return Object.freeze({
    rangeId: window.id,
    selectedMacro,
    days: Object.freeze([...chronologicalDays].reverse()),
    weeks: Object.freeze([...chronologicalWeeks].reverse()),
    summary: createSelectedMacroSummary(chronologicalDays, selectedMacro.key, {
      startDate,
      endDate: coverageEnd,
    }),
    distribution: createMacroDistribution(chronologicalDays),
    averages: createMacroAverages(chronologicalDays),
  });
}

export function createMacroDistribution(days) {
  const items = NUTRITION_MACRO_KEYS.map((key) => {
    const presentation = getNutritionMacroPresentation(key);
    const grams = sumValid(days.map((day) => day.macros[key]));
    return {
      ...presentation,
      grams,
      calories: grams * presentation.caloriesPerGram,
    };
  });
  const totalCalories = items.reduce((sum, item) => sum + item.calories, 0);
  if (totalCalories <= 0) {
    return Object.freeze({ available: false, items: Object.freeze([]) });
  }
  const exact = items.map((item) => (item.calories / totalCalories) * 100);
  const percentages = roundPercentagesToHundred(exact);
  return Object.freeze({
    available: true,
    totalCalories,
    items: Object.freeze(
      items.map((item, index) => Object.freeze({
        ...item,
        percentage: percentages[index],
      }))
    ),
  });
}

function createMacroAverages(days) {
  return Object.freeze(
    NUTRITION_MACRO_KEYS.map((key) => {
      const values = days
        .map((day) => day.macros[key])
        .filter((value) => value != null);
      return Object.freeze({
        ...getNutritionMacroPresentation(key),
        average: values.length ? roundedAverage(values) : null,
        count: values.length,
      });
    })
  );
}

function createSelectedMacroSummary(days, key, { startDate, endDate }) {
  const values = days
    .filter((day) => day.macros[key] != null)
    .map((day) => ({ ...day, value: day.macros[key] }));
  if (!values.length) {
    return Object.freeze({
      average: null,
      loggedDays: 0,
      calendarDays: countCalendarDays(startDate, endDate),
      lowestDay: null,
      highestDay: null,
    });
  }
  return Object.freeze({
    average: roundedAverage(values.map((item) => item.value)),
    loggedDays: values.length,
    calendarDays: countCalendarDays(startDate, endDate),
    lowestDay: values.reduce((lowest, day) =>
      day.value < lowest.value ? day : lowest
    ),
    highestDay: values.reduce((highest, day) =>
      day.value > highest.value ? day : highest
    ),
  });
}

function roundPercentagesToHundred(values) {
  const floors = values.map(Math.floor);
  let remaining = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = values
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  const result = [...floors];
  for (let index = 0; index < remaining; index += 1) {
    result[order[index].index] += 1;
  }
  return result;
}

function sumValid(values) {
  return values
    .filter((value) => value != null)
    .reduce((sum, value) => sum + value, 0);
}

function roundedAverage(values) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function countCalendarDays(startDate, endDate) {
  if (!startDate || !endDate || startDate > endDate) return 0;
  return (
    Math.round(
      (new Date(`${endDate}T12:00:00Z`) -
        new Date(`${startDate}T12:00:00Z`)) /
        86400000
    ) + 1
  );
}

function latestDate(left, right) {
  return [left, right].filter(Boolean).sort().at(-1) ?? null;
}

function earliestDate(left, right) {
  return [left, right].filter(Boolean).sort().at(0) ?? null;
}
