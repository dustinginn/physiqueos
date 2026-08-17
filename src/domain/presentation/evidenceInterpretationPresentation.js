// Turns the raw evidence available between DEXA scans into what it currently *means*, not what
// it's *for*. Weight/energy trend context is only ever computed from evidence measured on or
// after the current phase's own start date — pre-phase evidence is never treated as proof of
// how the body is responding to the current phase's plan. When there isn't enough post-phase
// evidence yet, saying so honestly is the correct answer; this module never fabricates a trend.

const MIN_POST_PHASE_ENTRIES = 4;
const MIN_POST_PHASE_DAYS = 5;
const STABLE_THRESHOLD_LB_PER_WEEK = 0.2;

export function describeWeightAndEnergyInterpretation({
  weightEntries = [],
  phaseStartDate = null,
  currentDate = new Date(),
  caloricIntakeTarget = null,
  activityExpenditureTarget = null,
  goalDirection = null,
} = {}) {
  const currentIso = toIsoDate(currentDate);
  const daysSincePhaseStart = phaseStartDate ? daysBetween(phaseStartDate, currentIso) : null;
  const postPhaseEntries = phaseStartDate
    ? weightEntries
      .filter((entry) => Number.isFinite(weightValue(entry)) && entryDate(entry) >= phaseStartDate)
      .sort((a, b) => entryDate(a).localeCompare(entryDate(b)))
    : [];
  const targetsClause = describeTargets({ caloricIntakeTarget, activityExpenditureTarget });

  if (!phaseStartDate || daysSincePhaseStart == null ||
      daysSincePhaseStart < MIN_POST_PHASE_DAYS || postPhaseEntries.length < MIN_POST_PHASE_ENTRIES) {
    return [
      "It's still early in this phase for weight and energy trends to mean much on their own.",
      targetsClause,
      "The next DEXA will be the real read on whether this is working.",
    ].filter(Boolean).join(" ");
  }

  const trend = classifyWeightTrend(postPhaseEntries);
  return [
    describeTrendAgainstDirection(trend, goalDirection),
    targetsClause,
    "DEXA is still what ultimately confirms body composition, not scale weight alone.",
  ].filter(Boolean).join(" ");
}

function classifyWeightTrend(entries) {
  const first = entries[0];
  const last = entries[entries.length - 1];
  const days = daysBetween(entryDate(first), entryDate(last)) || 1;
  const change = weightValue(last) - weightValue(first);
  const perWeek = (change / days) * 7;
  if (Math.abs(perWeek) < STABLE_THRESHOLD_LB_PER_WEEK) return { direction: "stable", perWeek };
  return { direction: perWeek > 0 ? "up" : "down", perWeek };
}

function describeTrendAgainstDirection(trend, goalDirection) {
  if (trend.direction === "stable") return "Weight has stayed roughly flat so far.";
  const verb = trend.direction === "up" ? "trending up" : "trending down";
  const aligned = (goalDirection === "increase" && trend.direction === "up") ||
    (goalDirection === "decrease" && trend.direction === "down");
  if (aligned) return `Weight has been ${verb}, consistent with the plan.`;
  if (goalDirection === "increase" || goalDirection === "decrease") {
    return `Weight has been ${verb} — worth watching against where the plan intends it to go.`;
  }
  return `Weight has been ${verb}.`;
}

function describeTargets({ caloricIntakeTarget, activityExpenditureTarget }) {
  const parts = [];
  if (Number.isFinite(caloricIntakeTarget?.value)) {
    parts.push(`${formatNumber(caloricIntakeTarget.value)} ${caloricIntakeTarget.unit ?? "kcal/day"} intake`);
  }
  if (Number.isFinite(activityExpenditureTarget?.value)) {
    parts.push(`${formatNumber(activityExpenditureTarget.value)} ${activityExpenditureTarget.unit ?? "kcal/day"} activity`);
  }
  return parts.length ? `The current targets are ${parts.join(" and ")}.` : null;
}

function entryDate(entry) { return entry?.measuredAt ?? entry?.date ?? ""; }
function weightValue(entry) { return Number(entry?.weight?.value ?? entry?.value); }
function toIsoDate(value) { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10); }
function daysBetween(start, end) {
  if (!start || !end) return null;
  const n = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
  return Number.isFinite(n) ? n : null;
}
function formatNumber(value) { return Number.isInteger(value) ? value.toLocaleString("en-US") : Number(value).toFixed(1); }
