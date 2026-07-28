import { createHash } from "node:crypto";

export const PROTOCOL_RECURRENCE_VERSION = "protocol_recurrence_v1";
export const CANONICAL_WEEKDAYS = Object.freeze([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
]);

export class ProtocolRecurrenceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProtocolRecurrenceError";
    this.code = code;
  }
}

export function normalizeProtocolRecurrence(input = {}, {
  fallbackTimezone = null,
  fallbackAnchorDate = null,
  effectiveAt = null,
} = {}) {
  const source = input.recurrence ?? input.schedule ?? input;
  const rawFrequency = source.frequency ?? source.type ?? source.cadence;
  if (String(rawFrequency).toLowerCase() === "biweekly") {
    throw new ProtocolRecurrenceError(
      "AMBIGUOUS_BIWEEKLY",
      "Biweekly is ambiguous. Choose an explicit weekly interval.",
    );
  }
  const frequency = normalizeFrequency(rawFrequency);
  if (frequency === "weekly") {
    const interval = source.interval == null ? 1 : Number(source.interval);
    if (!Number.isInteger(interval) || interval < 1) {
      throw new ProtocolRecurrenceError(
        "INVALID_WEEKLY_INTERVAL",
        "Weekly interval must be a positive integer.",
      );
    }
    const weekdays = normalizeWeekdays(
      source.weekdays ?? source.daysOfWeek ??
      [source.preferredDay ?? source.dayOfWeek].filter(Boolean),
    );
    if (!weekdays.length) {
      throw new ProtocolRecurrenceError(
        "WEEKDAY_REQUIRED",
        "A weekly recurrence requires at least one weekday.",
      );
    }
    const timezone = source.timezone ?? fallbackTimezone;
    if (!timezone) {
      throw new ProtocolRecurrenceError(
        "TIMEZONE_REQUIRED",
        "A weekly recurrence requires an explicit timezone.",
      );
    }
    const anchorDate = dateKey(source.anchorDate ?? fallbackAnchorDate);
    if (!anchorDate) {
      throw new ProtocolRecurrenceError(
        "ANCHOR_REQUIRED",
        "A weekly recurrence requires an anchor date.",
      );
    }
    return Object.freeze({
      recurrenceVersion: PROTOCOL_RECURRENCE_VERSION,
      frequency,
      interval,
      weekdays,
      timeOfDay: source.timeOfDay ?? source.daypart ?? null,
      localTime: source.localTime ?? exactTime(source.timeOfDay) ?? null,
      timezone,
      anchorDate,
      effectiveAt: source.effectiveAt ?? effectiveAt ?? null,
      endDate: dateKey(source.endDate) ?? null,
    });
  }
  if (frequency === "daily") {
    return Object.freeze({
      recurrenceVersion: PROTOCOL_RECURRENCE_VERSION,
      frequency,
      interval: 1,
      weekdays: [],
      timeOfDay: source.timeOfDay ?? source.daypart ?? null,
      localTime: source.localTime ?? exactTime(source.timeOfDay) ?? null,
      timezone: source.timezone ?? fallbackTimezone,
      anchorDate: dateKey(source.anchorDate ?? fallbackAnchorDate),
      effectiveAt: source.effectiveAt ?? effectiveAt ?? null,
      endDate: dateKey(source.endDate) ?? null,
    });
  }
  if (frequency === "scheduled_date") {
    const scheduledDate = dateKey(source.scheduledDate ?? source.date);
    if (!scheduledDate) {
      throw new ProtocolRecurrenceError("SCHEDULED_DATE_REQUIRED", "Scheduled date is required.");
    }
    return Object.freeze({
      recurrenceVersion: PROTOCOL_RECURRENCE_VERSION,
      frequency,
      interval: 1,
      weekdays: [],
      scheduledDate,
      timeOfDay: source.timeOfDay ?? null,
      localTime: source.localTime ?? exactTime(source.timeOfDay) ?? null,
      timezone: source.timezone ?? fallbackTimezone,
      anchorDate: scheduledDate,
      effectiveAt: source.effectiveAt ?? effectiveAt ?? null,
      endDate: scheduledDate,
    });
  }
  throw new ProtocolRecurrenceError("UNSUPPORTED_RECURRENCE", "Choose a supported recurrence.");
}

export function createProtocolRecurrenceIdentity(recurrence) {
  const normalized = normalizeProtocolRecurrence(recurrence, {
    fallbackTimezone: recurrence.timezone,
    fallbackAnchorDate: recurrence.anchorDate,
    effectiveAt: recurrence.effectiveAt,
  });
  const identity = {
    recurrenceVersion: normalized.recurrenceVersion,
    frequency: normalized.frequency,
    interval: normalized.interval,
    weekdays: normalized.weekdays,
    timeOfDay: normalized.timeOfDay,
    localTime: normalized.localTime,
    timezone: normalized.timezone,
    anchorDate: normalized.anchorDate,
    endDate: normalized.endDate,
  };
  return `protocol_recurrence|${createHash("sha256")
    .update(JSON.stringify(identity)).digest("hex")}`;
}

export function hydrateCadenceFromRecurrence(recurrence) {
  if (recurrence?.frequency === "daily") return "daily";
  if (recurrence?.frequency === "scheduled_date") return "scheduled_date";
  if (recurrence?.frequency !== "weekly") return "custom";
  if (recurrence.interval === 1) return "weekly";
  if (recurrence.interval === 2) return "weekly_interval_2";
  return "custom";
}

export function formatProtocolRecurrenceSummary(recurrence) {
  if (recurrence.frequency === "weekly") {
    const cadence = recurrence.interval === 1 ? "Once a week" : `Every ${recurrence.interval} weeks`;
    const day = title(recurrence.weekdays[0]);
    const time = recurrence.timeOfDay ? ` ${String(recurrence.timeOfDay).toLowerCase()}` : "";
    return `${cadence} · ${day}${time}`;
  }
  if (recurrence.frequency === "daily") return "Every day";
  return "Scheduled date";
}

function normalizeFrequency(value) {
  const normalized = String(value ?? "").toLowerCase().replaceAll("-", "_");
  if (["weekly", "once_a_week"].includes(normalized)) return "weekly";
  if (["daily", "every_day"].includes(normalized)) return "daily";
  if (["scheduled_date", "once"].includes(normalized)) return "scheduled_date";
  return normalized;
}
function normalizeWeekdays(values = []) {
  const set = new Set(values.map((item) => String(item).toLowerCase()));
  return CANONICAL_WEEKDAYS.filter((day) => set.has(day));
}
function dateKey(value) {
  const match = String(value ?? "").match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}
function exactTime(value) {
  return /^\d{2}:\d{2}$/.test(String(value ?? "")) ? value : null;
}
function title(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : "";
}
