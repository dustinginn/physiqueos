import {
  intersectsLongRange,
  LONG_RANGE_OPTIONS,
  resolveLongRangeWindow,
} from "./LongRangeTimeSeriesService";

export const ENERGY_RANGE_OPTIONS = LONG_RANGE_OPTIONS;

export function filterWeeklyEnergyByRange(
  weeks = [],
  rangeId = "all",
  latestEvidenceDate = null
) {
  if (weeks.length === 0) return [];

  const latestDate =
    latestEvidenceDate ??
    [...weeks]
      .map((week) => week.weekEnd)
      .filter(Boolean)
      .sort()
      .at(-1) ??
    null;
  if (!latestDate) return [];
  const window = resolveLongRangeWindow({ latestDate, rangeId });

  return weeks.filter((week) => intersectsLongRange(week, window));
}

export function getRecentFourWeeklyEnergy(weeks = []) {
  return [...weeks]
    .sort((left, right) => right.weekStart.localeCompare(left.weekStart))
    .slice(0, 4);
}

export function reconcileSelectedWeekId(weeks = [], selectedId = null) {
  if (weeks.length === 0) return null;
  if (weeks.some((week) => week.id === selectedId)) return selectedId;
  return [...weeks].sort((left, right) =>
    right.weekStart.localeCompare(left.weekStart)
  )[0].id;
}
