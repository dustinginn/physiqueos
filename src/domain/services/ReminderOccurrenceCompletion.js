import {
  getLocalDateKey,
  resolveLocalTimeZone,
} from "../utils/localDate.js";

export function resolveReminderOccurrenceDate({
  completedAt = null,
  occurrenceDate = null,
  timeZone = null,
} = {}) {
  const explicit = String(occurrenceDate ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  return getLocalDateKey(
    completedAt ? new Date(completedAt) : new Date(),
    resolveLocalTimeZone(timeZone),
  );
}

export function isReminderOccurrenceCompleted(reminder, {
  occurrenceDate,
  timeZone = null,
} = {}) {
  if (!reminder || !occurrenceDate) return false;
  const resolvedTimeZone = resolveLocalTimeZone(timeZone);
  if (getLocalDateKey(reminder.completedAt, resolvedTimeZone) === occurrenceDate) {
    return true;
  }
  const history = Array.isArray(reminder.completionHistory)
    ? reminder.completionHistory
    : reminder.completionHistory
      ? [reminder.completionHistory]
      : [];
  return history.some((entry) => {
    const explicitDate =
      entry?.occurrenceDate ??
      entry?.occurrence_date ??
      entry?.evidenceDate ??
      entry?.evidence_date;
    if (explicitDate) return String(explicitDate).slice(0, 10) === occurrenceDate;
    return getLocalDateKey(entry?.completedAt, resolvedTimeZone) === occurrenceDate;
  });
}
