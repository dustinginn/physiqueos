const DEFAULT_TIME_ZONE = "America/Los_Angeles";

export function reconcileEnergyDays({
  activityDays = [],
  calendarDates = [],
  dexaScans = [],
  nutritionDays = [],
  timeZone = DEFAULT_TIME_ZONE,
} = {}) {
  const byDate = new Map();
  const rmrHistory = createHistoricalRmrIndex(dexaScans, timeZone);

  calendarDates.forEach((date) => {
    const dateKey = getCanonicalLocalDate(date, timeZone);
    if (dateKey) byDate.set(dateKey, createEmptyRow(dateKey));
  });

  nutritionDays.forEach((day) => {
    const date = getCanonicalLocalDate(day.date ?? day.observed_at, timeZone);
    if (!date) return;
    const row = byDate.get(date) ?? createEmptyRow(date);
    row.nutritionDayId = day.id ?? null;
    row.nutritionHref = day.href ?? null;
    row.calorieIntake = finiteNumber(
      day.totals?.calories ?? day.daily_totals?.calories
    );
    row.sources.nutrition = day.sourceEvidence ?? [];
    byDate.set(date, row);
  });

  activityDays.forEach((day) => {
    const date = getCanonicalLocalDate(day.date ?? day.observed_at, timeZone);
    if (!date) return;
    const row = byDate.get(date) ?? createEmptyRow(date);
    row.activityDayId = day.id ?? null;
    row.activityHref = day.href ?? "/progress/activity?context=all";
    row.activeCalories = finiteNumber(
      day.activeCalories ?? day.daily_activity?.move_calories
    );
    row.sources.activity = ["Activity"];
    byDate.set(date, row);
  });

  return [...byDate.values()]
    .map((row) => finalizeRow(row, resolveHistoricalRmr(rmrHistory, row.date)))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function resolveHistoricalRmr(rmrHistory = [], date) {
  let applicable = null;
  for (const record of rmrHistory) {
    if (record.date > date) break;
    applicable = record;
  }
  return applicable;
}

export function createHistoricalRmrIndex(
  dexaScans = [],
  timeZone = DEFAULT_TIME_ZONE
) {
  const sorted = dexaScans
    .map((scan) => ({
      date: getCanonicalLocalDate(scan.measuredAt ?? scan.date, timeZone),
      rmr: finiteNumber(scan.restingMetabolicRate?.value),
      scanId: scan.id ?? scan.canonicalId ?? null,
      authority: String(scan.updatedAt ?? scan.id ?? ""),
    }))
    .filter((scan) => scan.date && scan.rmr != null)
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.authority.localeCompare(right.authority)
    );

  return [
    ...new Map(
      sorted.map(({ authority: _authority, ...scan }) => [scan.date, scan])
    ).values(),
  ];
}

export function getCanonicalLocalDate(value, timeZone = DEFAULT_TIME_ZONE) {
  if (value == null) return null;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function createEmptyRow(date) {
  return {
    date,
    nutritionDayId: null,
    nutritionHref: null,
    activityDayId: null,
    activityHref: null,
    calorieIntake: null,
    activeCalories: null,
    rmr: null,
    rmrScanId: null,
    rmrScanDate: null,
    estimatedExpenditure: null,
    expenditureKind: "unavailable",
    energyBalance: null,
    completeness: "no-paired-evidence",
    sources: { nutrition: [], activity: [] },
  };
}

function finalizeRow(row, rmrRecord) {
  const hasNutrition = row.calorieIntake != null;
  const hasActivity = row.activityDayId != null;
  const hasActiveCalories = row.activeCalories != null;
  const rmr = rmrRecord?.rmr ?? null;
  const estimatedExpenditure =
    rmr != null && hasActiveCalories ? rmr + row.activeCalories : null;
  const energyBalance =
    hasNutrition && estimatedExpenditure != null
      ? row.calorieIntake - estimatedExpenditure
      : null;
  let completeness = "no-paired-evidence";
  if (energyBalance != null) completeness = "complete";
  else if (hasNutrition && !hasActiveCalories) completeness = "nutrition-only";
  else if (!hasNutrition && hasActivity) completeness = "activity-only";
  else if (hasNutrition && hasActiveCalories && rmr == null)
    completeness = "missing-rmr";

  return Object.freeze({
    ...row,
    rmr,
    rmrScanId: rmrRecord?.scanId ?? null,
    rmrScanDate: rmrRecord?.date ?? null,
    estimatedExpenditure,
    expenditureKind:
      estimatedExpenditure == null ? "unavailable" : "estimated_rmr_plus_active",
    energyBalance,
    completeness,
    sources: Object.freeze({
      nutrition: Object.freeze([...row.sources.nutrition]),
      activity: Object.freeze([...row.sources.activity]),
    }),
  });
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
