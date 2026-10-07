import { createDailyCheckIn } from "../models/dailyCheckIn.js";
import { createPriorityOccurrenceKey } from "./ReminderOccurrenceCompletion.js";

// The ONE writer of a dated priority-occurrence reconciliation entry
// (`dailyCheckIns[daily_check_in_<date>].reconciliation[]`). Morning Check-In
// (prior-day completed/skipped/note) and `priority.skip.v1` (today's skip)
// both write through here so a "skipped" occurrence has exactly one shape and
// one meaning everywhere it is read (Home, notification horizon, Priority
// Detail, next-morning selection).

export function createPriorityReconciliationCheckInId(date) {
  return `daily_check_in_${String(date).replaceAll("-", "_")}`;
}

export function createPriorityReconciliationCheckIn({ date, recordedAt, userId }) {
  return createDailyCheckIn({
    id: createPriorityReconciliationCheckInId(date),
    userId,
    date,
    source: {
      type: "manual",
      name: "Morning Reconciliation",
      externalId: null,
      importedAt: null,
      confidence: "medium",
      notes: "Founder Alpha morning reconciliation.",
    },
    fieldProvenance: {
      imported: ["reconciliation"],
      computed: [],
    },
    createdAt: recordedAt,
    updatedAt: recordedAt,
  });
}

export function createPriorityReconciliationEntry({
  priorityId,
  occurrenceDate,
  disposition,
  note = null,
  recordedAt,
}) {
  return {
    key: createPriorityOccurrenceKey(priorityId, occurrenceDate),
    priorityId,
    // Compatibility alias for records and clients created before execution-
    // backed Priority Skip. New readers use `priorityId ?? reminderId`.
    reminderId: priorityId,
    occurrenceDate,
    status: disposition,
    note: normalizeReconciliationNote(note),
    recordedAt,
  };
}

// Returns the check-in with each entry upserted by canonical occurrence key.
// Entries already present for other occurrences are preserved verbatim.
export function upsertPriorityReconciliationEntries(checkIn, entries, recordedAt) {
  const byKey = new Map(
    (checkIn.reconciliation ?? []).map((item) => [
      createPriorityOccurrenceKey(
        getPriorityReconciliationId(item),
        item.occurrenceDate ?? checkIn.date
      ),
      item,
    ])
  );
  for (const entry of entries) byKey.set(entry.key, entry);
  return {
    ...checkIn,
    reconciliation: [...byKey.values()],
    updatedAt: recordedAt,
  };
}

export function findPriorityOccurrenceReconciliation(checkIn, priorityId, occurrenceDate) {
  if (!checkIn || !Array.isArray(checkIn.reconciliation)) return null;
  return checkIn.reconciliation.find((item) =>
    getPriorityReconciliationId(item) === priorityId &&
    (item.occurrenceDate ?? checkIn.date) === occurrenceDate
  ) ?? null;
}

export function getPriorityReconciliationId(item) {
  return item?.priorityId ?? item?.reminderId ?? null;
}

export function isPriorityOccurrenceSkipped(checkIn, priorityId, occurrenceDate) {
  return String(
    findPriorityOccurrenceReconciliation(checkIn, priorityId, occurrenceDate)?.status ?? ""
  ).toLowerCase() === "skipped";
}

export function normalizeReconciliationNote(value) {
  const text = String(value ?? "").trim();
  return text || null;
}
