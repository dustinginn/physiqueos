import { getLocalDateKey } from "../utils/localDate";

export function createPreviousDayEvidenceWindow({ now = new Date(), timeZone = "America/Los_Angeles" } = {}) {
  const today = getDateKeyInTimeZone(now, timeZone);
  const target = new Date(`${today}T12:00:00Z`);
  target.setUTCDate(target.getUTCDate() - 1);
  const date = target.toISOString().slice(0, 10);

  return { id: `daily:${date}:${timeZone}`, cadence: "daily", briefingDate: today, date, start: `${date}T00:00:00`, end: `${date}T23:59:59.999`, relativeLabel: "yesterday", sameDayEvidenceExcluded: true, timeZone, closed: true };
}

export function selectScheduledBriefingCadence({ now = new Date(), timeZone = "America/Los_Angeles", monthlyEnabled = false } = {}) {
  const parts = getDatePartsInTimeZone(now, timeZone);
  if (monthlyEnabled && parts.day === 1) return "monthly";
  return parts.weekday === "Sun" ? "weekly" : "daily";
}

export function createWeeklyEvidenceWindow({ now = new Date(), timeZone = "America/Los_Angeles" } = {}) {
  const today = getDateKeyInTimeZone(now, timeZone);
  const endDate = shiftDateKey(today, -1);
  const startDate = shiftDateKey(endDate, -6);

  return {
    id: `weekly:${startDate}:${endDate}:${timeZone}`,
    cadence: "weekly",
    briefingDate: today,
    date: endDate,
    startDate,
    endDate,
    start: `${startDate}T00:00:00`,
    end: `${endDate}T23:59:59.999`,
    relativeLabel: "this completed week",
    sameDayEvidenceExcluded: true,
    timeZone,
    closed: true,
  };
}

export function createScheduledEvidenceWindow(options = {}) {
  return selectScheduledBriefingCadence(options) === "weekly"
    ? createWeeklyEvidenceWindow(options)
    : createPreviousDayEvidenceWindow(options);
}

export function isRecordAvailableByWindow(record, window, fields = []) {
  if (!window?.date) return true;
  const value = fields
    .map((field) => record?.[field] ?? record?.payload?.[field])
    .find(Boolean);
  return !value || String(value).slice(0, 10) <= window.date;
}

function getDateKeyInTimeZone(value, timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  } catch {
    return getLocalDateKey(value);
  }
}

function getDatePartsInTimeZone(value, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "numeric", month: "numeric", timeZone, weekday: "short", year: "numeric",
  });
  return Object.fromEntries(
    formatter.formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.type === "day" ? Number(part.value) : part.value])
  );
}

function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
