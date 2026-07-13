import { isActiveCanonicalEvidenceObject } from "./CanonicalReadModel";

export function createActivityEvidenceSummary({ canonicalObjects = [], now = new Date() } = {}) {
  const today = dateKey(now);
  const start = addDays(today, -6);
  const days = canonicalObjects
    .filter(isActiveCanonicalEvidenceObject)
    .map((object) => object.payload ?? object)
    .filter((object) => object.evidence_type === "activity_day")
    .filter((object) => object.observed_at >= start && object.observed_at <= today)
    .sort((left, right) => left.observed_at.localeCompare(right.observed_at));
  const knownCalories = days
    .map((day) => Number(day.daily_activity?.move_calories))
    .filter(Number.isFinite);
  const completeDays = days.filter((day) => day.quality?.status === "complete").length;
  const partialDays = days.length - completeDays;

  return {
    windowDays: 7,
    observedDayCount: days.length,
    completeDayCount: completeDays,
    partialDayCount: partialDays,
    missingDayCount: Math.max(0, 7 - days.length),
    recentAverageActiveCalories: knownCalories.length
      ? Math.round(knownCalories.reduce((sum, value) => sum + value, 0) / knownCalories.length)
      : null,
    evidenceConfidence: "moderate",
    executionStatus: "unknown",
    limitation:
      "Direct Activity evidence currently covers only the recent period. Missing evidence means execution is unknown, not missed.",
    historicalClaim:
      "The cut was already progressing before direct Activity evidence began; recent evidence does not establish what caused the broader progress.",
  };
}

function dateKey(value) {
  return (value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
