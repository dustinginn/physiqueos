export const LONG_RANGE_OPTIONS = Object.freeze([
  Object.freeze({ id: "1m", label: "1M", months: 1 }),
  Object.freeze({ id: "3m", label: "3M", months: 3 }),
  Object.freeze({ id: "6m", label: "6M", months: 6 }),
  Object.freeze({ id: "1y", label: "1Y", months: 12 }),
  Object.freeze({ id: "all", label: "All", months: null }),
]);

export function resolveLongRangeWindow({
  latestDate = null,
  rangeId = "all",
} = {}) {
  const option =
    LONG_RANGE_OPTIONS.find((item) => item.id === rangeId) ??
    LONG_RANGE_OPTIONS.at(-1);

  return Object.freeze({
    endDate: latestDate,
    id: option.id,
    startDate:
      option.months == null || !latestDate
        ? null
        : subtractCalendarMonths(latestDate, option.months),
  });
}

export function intersectsLongRange(item, window) {
  if (!window?.endDate) return true;
  const start = item.weekStart ?? item.date;
  const end = item.weekEnd ?? item.date;
  return (
    (!window.startDate || end >= window.startDate) &&
    start <= window.endDate
  );
}

function subtractCalendarMonths(dateKey, months) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}
