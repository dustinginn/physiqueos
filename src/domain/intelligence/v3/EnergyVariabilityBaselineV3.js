// Historical per-day baseline for EnergyVariabilityV3, independent of the
// length of the briefing cadence window.
//
// Why this exists. EnergyVariabilityV3 needs at least 14 paired historical
// days before it will make any user-relative claim (that minimum is a
// correctness guard and is deliberately NOT lowered here). The recurring
// cadences only supply an equal-length comparison window (3 days for
// Midweek, 7 for Weekly, and the Midweek/Weekly comparison window is the
// same span one week earlier), so on its own the comparison series can never
// reach 14 days and the signal could never fire live. This module defines a
// bounded LOOKBACK that ends the day before the current window starts, so
// the baseline length no longer depends on the cadence window length.
//
// Boundaries this module owns:
//   - The baseline is strictly PRECEDING evidence: it ends the day before the
//     current window starts, so current-window days can never be in it (and
//     are never double counted against themselves).
//   - The baseline is bounded (no unbounded scans): at most
//     ENERGY_VARIABILITY_BASELINE_LOOKBACK_DAYS calendar days.
//   - Only days whose nutrition source is confirmed complete are comparable
//     (review note N7). This is NOT a completeness judgment about the day's
//     intake versus its target: a 1,500, 2,500 or 4,000 kcal day is equally
//     comparable when its source is complete. A day whose source is partial,
//     unknown or missing is simply not comparable, so partial logging can
//     never masquerade as a below-plan day in either the baseline or the
//     pattern counts.
// The active-protocol-regime boundary (energyStrategy.effectiveAt) is applied
// where the strategy is known, in EnergyAmbiguityV3.js, to the baseline and
// the current period alike.

// Six weeks. Rationale: the 14-paired-day minimum must remain reachable even
// when logging is imperfect. With N7 excluding incomplete-source days, a
// 28-day lookback would need >=50% of days to be complete; 42 days needs
// ~33%, so a normally-logging user reaches the minimum without the guard
// being weakened. It is also short enough that the baseline still describes
// current habits (an older window would compare this week to a materially
// different period), and the protocol-regime cut at effectiveAt trims it
// further whenever the strategy changed inside those six weeks.
export const ENERGY_VARIABILITY_BASELINE_LOOKBACK_DAYS = 42;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function shiftDate(value, days) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// The bounded window of preceding days used as the historical baseline for a
// current cadence window. Ends the day before `window.startDate`.
export function resolveEnergyVariabilityBaselineWindow(window, {
  lookbackDays = ENERGY_VARIABILITY_BASELINE_LOOKBACK_DAYS,
} = {}) {
  if (!DATE_PATTERN.test(String(window?.startDate ?? ""))) {
    throw new Error("Energy variability baseline requires a window with startDate (YYYY-MM-DD).");
  }
  return {
    startDate: shiftDate(window.startDate, -lookbackDays),
    endDate: shiftDate(window.startDate, -1),
    ...(window.timeZone ? { timeZone: window.timeZone } : {}),
  };
}

// A day is comparable for variability purposes only when its nutrition source
// is confirmed complete. Rows that carry no completeness at all (legacy
// fixtures that predate the field) are treated as comparable so existing
// evidence shapes keep working; every live row produced by
// CadenceEnergyAssessmentService carries one.
export function isComparableNutritionDay(day) {
  const state = day?.nutritionCompleteness;
  return state === undefined || state === null || state === "complete";
}

// Reduce reconciled per-day rows to the historical baseline series. Pure and
// deterministic: picks rows strictly before the current window, inside the
// bounded baseline window, with a usable intake value and a complete
// nutrition source; one entry per date; ascending.
export function selectEnergyVariabilityBaselineSeries({
  days = [],
  observationWindow,
  baselineWindow,
} = {}) {
  if (!observationWindow?.startDate || !baselineWindow?.startDate || !baselineWindow?.endDate) return [];
  const byDate = new Map();
  for (const day of days ?? []) {
    const date = String(day?.date ?? "").slice(0, 10);
    if (!DATE_PATTERN.test(date)) continue;
    if (date < baselineWindow.startDate || date > baselineWindow.endDate) continue;
    if (date >= observationWindow.startDate) continue;
    if (day.calorieIntake == null || !Number.isFinite(Number(day.calorieIntake))) continue;
    if (!isComparableNutritionDay(day)) continue;
    byDate.set(date, {
      date,
      value: Number(day.calorieIntake),
      nutritionCompleteness: day.nutritionCompleteness ?? null,
    });
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}
