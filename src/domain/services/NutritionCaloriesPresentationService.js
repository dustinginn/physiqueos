import {
  intersectsLongRange,
  resolveLongRangeWindow,
} from "./LongRangeTimeSeriesService";

export function filterNutritionCaloriesReport(model, rangeId = "all") {
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
  const days = model.days.filter(
    (day) =>
      (!startDate || day.date >= startDate) &&
      (!evidenceEnd || day.date <= evidenceEnd)
  );
  const weeks = model.weeks.filter((week) =>
    intersectsLongRange(week, {
      startDate,
      endDate: evidenceEnd,
    })
  );

  return Object.freeze({
    rangeId: window.id,
    startDate,
    endDate: coverageEnd,
    days: Object.freeze([...days].reverse()),
    weeks: Object.freeze([...weeks].reverse()),
    summary: createPeriodSummary(days, {
      startDate,
      endDate: coverageEnd,
    }),
  });
}

function createPeriodSummary(days, { startDate, endDate }) {
  if (days.length === 0) {
    return Object.freeze({
      averageCalories: null,
      loggedDays: 0,
      calendarDays: countCalendarDays(startDate, endDate),
      lowestDay: null,
      highestDay: null,
    });
  }

  const lowestDay = days.reduce((lowest, day) =>
    day.calories < lowest.calories ? day : lowest
  );
  const highestDay = days.reduce((highest, day) =>
    day.calories > highest.calories ? day : highest
  );

  return Object.freeze({
    averageCalories: average(days.map((day) => day.calories)),
    loggedDays: days.length,
    calendarDays: countCalendarDays(startDate, endDate),
    lowestDay,
    highestDay,
  });
}

function average(values) {
  if (values.length === 0) return null;
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
