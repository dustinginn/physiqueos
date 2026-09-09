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

export function createPriorityOccurrenceKey(priorityId, occurrenceDate) {
  const id = String(priorityId ?? "").trim();
  const date = String(occurrenceDate ?? "").trim();
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TypeError("Priority occurrence identity requires a priority ID and intended calendar date.");
  }
  return `${id}:${date}`;
}

export function resolvePriorityExecutionContract({ reminder, occurrenceDate } = {}) {
  if (!reminder?.id) throw new TypeError("Priority execution requires a canonical reminder ID.");
  const identity = {
    priorityId: reminder.id,
    occurrenceDate,
    occurrenceKey: createPriorityOccurrenceKey(reminder.id, occurrenceDate),
  };
  if (reminder.id === "reminder_morning_weight" || reminder.linkedEvidenceType === "weight") {
    return Object.freeze({ ...identity, workflow: "morning_check_in", destination: "/check-in/morning" });
  }
  if (reminder.linkedEvidenceType === "progress_photo") {
    return Object.freeze({ ...identity, workflow: "progress_photos", destination: "/evidence/photos" });
  }
  if (reminder.linkedEvidenceType === "dexa") {
    return Object.freeze({ ...identity, workflow: "dexa_evidence", destination: "/evidence/dexa" });
  }
  return Object.freeze({
    ...identity,
    workflow: "priority_detail",
    destination: `/priorities/${encodeURIComponent(reminder.id)}`,
  });
}
