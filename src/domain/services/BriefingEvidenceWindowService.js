import { getLocalDateKey } from "../utils/localDate";

export const ROUTINE_BRIEFING_CADENCE_VERSION = "routine_briefing_cadence_v2";

export function createPreviousDayEvidenceWindow({ now = new Date(), timeZone = "America/Los_Angeles" } = {}) {
  const today = getDateKeyInTimeZone(now, timeZone);
  const target = new Date(`${today}T12:00:00Z`);
  target.setUTCDate(target.getUTCDate() - 1);
  const date = target.toISOString().slice(0, 10);

  return { id: `daily:${date}:${timeZone}`, cadence: "daily", briefingDate: today, date, start: `${date}T00:00:00`, end: `${date}T23:59:59.999`, relativeLabel: "yesterday", sameDayEvidenceExcluded: true, timeZone, closed: true };
}

export function selectScheduledBriefingCadence({ now = new Date(), timeZone = "America/Los_Angeles", monthlyEnabled = false, coachingUpdates = null } = {}) {
  const parts = getDatePartsInTimeZone(now, timeZone);
  if (monthlyEnabled && parts.day === 1) return "monthly";
  const configured = coachingUpdates ?? legacyCoachingUpdates();
  const day = parts.weekday.toLowerCase();
  const time = getTimeInTimeZone(now, timeZone);
  if (configured.weekly?.enabled && day.startsWith(configured.weekly.day.slice(0, 3)) &&
      time >= configured.weekly.localTime) return "weekly";
  if (configured.midweek?.enabled && day.startsWith(configured.midweek.day.slice(0, 3)) &&
      time >= configured.midweek.localTime) return "midweek";
  if (configured.daily?.enabled) return "daily";
  return "none";
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

export function createMidweekEvidenceWindow({ now = new Date(), timeZone = "America/Los_Angeles", coachingUpdates = null } = {}) {
  const briefingDate = getDateKeyInTimeZone(now, timeZone);
  const configuredDay = coachingUpdates?.midweek?.day ?? "wednesday";
  const currentDay = weekdayIndex(getDatePartsInTimeZone(now, timeZone).weekday);
  const offset = weekdayIndex(configuredDay) - currentDay;
  const resolvedBriefingDate = shiftDateKey(briefingDate, offset);
  const startDate = shiftDateKey(resolvedBriefingDate, -3);
  const endDate = shiftDateKey(resolvedBriefingDate, -1);
  return { id: `midweek:${startDate}:${endDate}:${timeZone}`, cadence: "midweek", briefingDate: resolvedBriefingDate, date: endDate, startDate, endDate, start: `${startDate}T00:00:00`, end: `${endDate}T23:59:59.999`, relativeLabel: "Sunday through Tuesday", sameDayEvidenceExcluded: true, timeZone, closed: true };
}

export function createMonthlyEvidenceWindow({
  now = new Date(),
  timeZone = "America/Los_Angeles",
} = {}) {
  const localDate = getDateKeyInTimeZone(now, timeZone);
  const localDay = Number(localDate.slice(-2));
  const briefingMonth = localDay === 1
    ? shiftMonth(localDate.slice(0, 7), -1)
    : localDate.slice(0, 7);
  const startDate = `${briefingMonth}-01`;
  const endDate = lastDateOfMonth(briefingMonth);
  const deliveryDate = firstDateOfMonth(shiftMonth(briefingMonth, 1));
  const cutoff = localDateTimeToUtc({
    date: endDate,
    time: "23:59:59.999",
    timeZone,
  }).toISOString();

  return {
    id: `monthly:${startDate}:${endDate}:${timeZone}`,
    cadence: "monthly",
    briefingMonth,
    briefingDate: deliveryDate,
    deliveryDate,
    date: endDate,
    startDate,
    endDate,
    start: `${startDate}T00:00:00`,
    end: `${endDate}T23:59:59.999`,
    cutoff,
    relativeLabel: "the previous completed calendar month",
    sameDayEvidenceExcluded: true,
    timeZone,
    closed: localDay === 1,
  };
}

export function createScheduledEvidenceWindow(options = {}) {
  const cadence = selectScheduledBriefingCadence(options);
  if (cadence === "daily") return createPreviousDayEvidenceWindow(options);
  if (cadence === "weekly") return createWeeklyEvidenceWindow(options);
  if (cadence === "midweek") return createMidweekEvidenceWindow(options);
  if (cadence === "monthly") return createMonthlyEvidenceWindow(options);
  return null;
}

export function resolveScheduledBriefingExpectation({
  now = new Date(),
  timeZone = "America/Los_Angeles",
  monthlyEnabled = false,
  coachingUpdates = null,
} = {}) {
  const localDate = getDateKeyInTimeZone(now, timeZone);
  const cadence = selectScheduledBriefingCadence({ now, timeZone, monthlyEnabled, coachingUpdates });
  const evidenceWindow = createScheduledEvidenceWindow({ now, timeZone, monthlyEnabled, coachingUpdates });

  return {
    localDate,
    briefingDate: evidenceWindow?.briefingDate ?? localDate,
    evidenceThroughDate: evidenceWindow?.date ?? null,
    evidenceWindow,
    windowId: evidenceWindow?.id ?? null,
    cadence,
    artifactId: evidenceWindow ? `${cadence}_briefing_${evidenceWindow.date.replaceAll("-", "")}` : null,
    closed: evidenceWindow?.closed === true,
    dailyEligible: cadence === "daily",
    routineBriefingExpected: cadence !== "none",
    productionRoutingStatus: cadence === "none" ? "not_scheduled" : "active",
    cadenceVersion: ROUTINE_BRIEFING_CADENCE_VERSION,
  };
}

function legacyCoachingUpdates() {
  return {
    midweek: { enabled: true, day: "wednesday", localTime: "00:00" },
    weekly: { enabled: true, day: "sunday", localTime: "00:00" },
    daily: { enabled: false },
  };
}

function getTimeInTimeZone(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "2-digit", hour12: false, minute: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.hour === "24" ? "00" : values.hour}:${values.minute}`;
}

function weekdayIndex(value) {
  const key = String(value).slice(0, 3).toLowerCase();
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(key);
}

export function retireLegacyDailyBriefingWork(records = []) {
  return records.map((record) => isLegacyDailyWork(record)
    ? { ...record, status: "retired", retiredBy: ROUTINE_BRIEFING_CADENCE_VERSION, retirementReason: "routine_daily_cadence_retired" }
    : record);
}

function isLegacyDailyWork(record) {
  return record?.cadence === "daily" || record?.briefingType === "daily" || /daily.?briefing/i.test(record?.type ?? record?.jobType ?? "");
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

function shiftMonth(monthKey, months) {
  const date = new Date(`${monthKey}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 7);
}

function firstDateOfMonth(monthKey) {
  return `${monthKey}-01`;
}

function lastDateOfMonth(monthKey) {
  const firstOfFollowing = new Date(`${shiftMonth(monthKey, 1)}-01T12:00:00Z`);
  firstOfFollowing.setUTCDate(firstOfFollowing.getUTCDate() - 1);
  return firstOfFollowing.toISOString().slice(0, 10);
}

function localDateTimeToUtc({ date, time, timeZone }) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, secondWithMilliseconds = "0"] = time.split(":");
  const [second, milliseconds = "0"] = secondWithMilliseconds.split(".");
  const desired = Date.UTC(
    year,
    month - 1,
    day,
    Number(hour),
    Number(minute),
    Number(second),
    Number(milliseconds.padEnd(3, "0").slice(0, 3))
  );
  let guess = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(new Date(guess))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour === "24" ? "0" : parts.hour),
      Number(parts.minute),
      Number(parts.second),
      Number(milliseconds.padEnd(3, "0").slice(0, 3))
    );
    const adjustment = desired - represented;
    guess += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(guess);
}
