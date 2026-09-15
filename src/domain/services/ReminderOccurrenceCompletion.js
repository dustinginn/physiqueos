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
    expectedVersion: reminder.version !== null
      && reminder.version !== undefined
      && Number.isSafeInteger(Number(reminder.version))
      ? Number(reminder.version)
      : null,
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

// Named time-of-day buckets, resolved to the SAME hours `getPriorityState`'s
// `getPreferredHour` already uses for priority ordering in
// DailyFocusService.js — one canonical mapping, not two. This is the only
// place a "morning"/"night"-style bucket becomes an actual clock time
// anywhere in the codebase; every other consumer treats `timeOfDay` as
// display text. Native must schedule its local notification at exactly
// this resolved time — never re-deriving a time from a daypart word itself.
const NAMED_TIME_OF_DAY_HOURS = Object.freeze({
  morning: 7,
  afternoon: 14,
  evening: 18,
  night: 21,
  before_bed: 21,
});

// Resolves any of the Operating Plan's dual-purpose `timeOfDay` values
// (already-exact "HH:mm", or a named bucket) into a canonical "HH:mm"
// Native can schedule a local notification against directly. Returns null
// when nothing schedulable is known — Native then has no basis to schedule
// a specific-time notification for that occurrence.
export function resolveScheduledTime(timeOfDay) {
  const value = String(timeOfDay ?? "").trim();
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const hour = NAMED_TIME_OF_DAY_HOURS[value.toLowerCase()];
  return hour === undefined ? null : `${String(hour).padStart(2, "0")}:00`;
}

// The single owner of Native priority-notification classification
// (open_only / direct_completion_allowed / specialized_workflow_required)
// AND scheduling (`scheduledTime`). Native must consume both rather than
// re-deriving priority type or notification timing itself.
// `forceSpecialized` is for priority families whose `executionContract
// .workflow` can resolve to "priority_detail" (an ordinary reminder is
// attached for scheduling) even though the family itself must never expose
// blind direct completion — peptide/dose-aware execution items are the
// current example: completing one has dosing semantics a notification
// action must not bypass. `timeOfDay` is the item's own raw canonical
// schedule value (a reminder's `schedule.timeOfDay`, an execution item's
// `preferredSchedule.timeOfDay`, etc.) — resolved here, once, via
// `resolveScheduledTime`.
export function resolveNotificationAction({ executionContract, completable = false, forceSpecialized = false, timeOfDay = null } = {}) {
  const scheduledTime = resolveScheduledTime(timeOfDay);
  if (!executionContract) {
    return Object.freeze({ classification: "open_only", workflow: null, destination: null, completionCommand: null, scheduledTime });
  }
  const destination = Object.freeze({
    priorityId: executionContract.priorityId,
    occurrenceDate: executionContract.occurrenceDate,
  });
  if (forceSpecialized || executionContract.workflow !== "priority_detail") {
    return Object.freeze({
      classification: "specialized_workflow_required",
      workflow: executionContract.workflow,
      destination,
      completionCommand: null,
      scheduledTime,
    });
  }
  if (completable !== true || executionContract.expectedVersion === null) {
    return Object.freeze({ classification: "open_only", workflow: executionContract.workflow, destination, completionCommand: null, scheduledTime });
  }
  return Object.freeze({
    classification: "direct_completion_allowed",
    workflow: executionContract.workflow,
    destination,
    completionCommand: Object.freeze({
      commandType: "priority.complete.v1",
      expectedVersion: executionContract.expectedVersion,
      payload: Object.freeze({
        priorityId: executionContract.priorityId,
        occurrenceDate: executionContract.occurrenceDate,
      }),
    }),
    scheduledTime,
  });
}

// For priority families with no `executionContract` at all (DEXA
// appointments, grouped Home sessions) — always specialized, since there's
// no canonical reminder identity a notification could safely complete
// directly against.
export function specializedNotificationAction({ workflow, priorityId, occurrenceDate, timeOfDay = null }) {
  return Object.freeze({
    classification: "specialized_workflow_required",
    workflow,
    destination: Object.freeze({ priorityId, occurrenceDate }),
    completionCommand: null,
    scheduledTime: resolveScheduledTime(timeOfDay),
  });
}

// Protocol Support retains its domain workflow regardless of the reminder
// used to schedule it. Editing a Support schedule does not authorize blind
// notification completion; peptide completion remains dose-aware.
export function protocolSupportNotificationAction({ category, ...occurrence }) {
  return specializedNotificationAction({
    ...occurrence,
    workflow: category === "peptide" ? "peptide_protocol" : "priority_detail",
  });
}

// For priorities with no in-app completion action at all — evidence-derived
// tiles like Protein/Activity/Sleep that are satisfied by HealthKit/check-in
// data, not a tap. A notification for one of these can still open its
// detail; it must never offer completion.
export function openOnlyNotificationAction({ priorityId, occurrenceDate }) {
  return Object.freeze({
    classification: "open_only",
    workflow: null,
    destination: Object.freeze({ priorityId, occurrenceDate }),
    completionCommand: null,
    scheduledTime: null,
  });
}
