import { createHash } from "node:crypto";

export function createFounderRuntimeSemanticDigest(value) {
  return createHash("sha256")
    .update(stableSerialize(value))
    .digest("hex")
    .toUpperCase();
}

const PROGRESS_PHOTOS_EXECUTION_ID = "execution_progress_photos";
const PROGRESS_PHOTOS_REMINDER_ID = "reminder_weekly_progress_photo_set";
const DEXA_APPOINTMENT_ID = "execution_next_dexa";

export function createCoachingUpdatesSemanticDigest(value) {
  const briefingProtocols = (value?.protocols ?? []).filter((item) =>
    (item.protocolType ?? item.category) === "briefings" && item.status === "active"
  );
  const briefingProtocolIds = new Set(briefingProtocols.map((item) => item.id));
  const currentBriefingVersionIds = new Set(briefingProtocols.map((item) => item.currentVersionId).filter(Boolean));
  const progressPhotoProtocols = (value?.protocols ?? []).filter((item) =>
    item.id === "protocol_progress_photos" ||
    ["progress_photos", "photos"].includes(item.protocolType ?? item.category)
  );
  const progressPhotoProtocolIds = new Set(progressPhotoProtocols.map((item) => item.id));
  const progressPhotoVersionIds = new Set(progressPhotoProtocols.map((item) => item.currentVersionId).filter(Boolean));
  return createFounderRuntimeSemanticDigest({
    // Only the canonical records rendered and submitted by the composite
    // Coaching editor participate in its optimistic-concurrency fence.
    // Evidence Reviews, canonical evidence, unrelated priorities, goals,
    // protocols, executions, and reminders are intentionally absent.
    briefingProtocols: sortById(briefingProtocols.map(projectProtocolRoot)),
    briefingVersions: (value?.protocolVersions ?? []).filter((item) =>
      briefingProtocolIds.has(item.protocolId) && currentBriefingVersionIds.has(item.id)
    ).map(projectCoachingVersion).sort(compareId),
    progressPhotoProtocols: sortById(progressPhotoProtocols.map(projectProtocolRoot)),
    progressPhotoVersions: (value?.protocolVersions ?? []).filter((item) =>
      progressPhotoProtocolIds.has(item.protocolId) && progressPhotoVersionIds.has(item.id)
    ).map(projectProgressPhotoVersion).sort(compareId),
    progressPhotoExecution: (value?.executionItems ?? []).find((item) =>
      item.id === PROGRESS_PHOTOS_EXECUTION_ID
    ) ? projectProgressPhotoExecution((value?.executionItems ?? []).find((item) =>
      item.id === PROGRESS_PHOTOS_EXECUTION_ID
    )) : null,
    progressPhotoReminder: (value?.reminders ?? []).find((item) =>
      item.id === PROGRESS_PHOTOS_REMINDER_ID
    ) ? projectProgressPhotoReminder((value?.reminders ?? []).find((item) =>
      item.id === PROGRESS_PHOTOS_REMINDER_ID
    )) : null,
    dexaAppointment: (value?.executionItems ?? []).find((item) =>
      item.id === DEXA_APPOINTMENT_ID
    ) ? projectDexaAppointment((value?.executionItems ?? []).find((item) =>
      item.id === DEXA_APPOINTMENT_ID
    )) : null,
  });
}

export function createProgressPhotosScheduleSemanticDigest(value) {
  const protocols = (value?.protocols ?? []).filter((item) =>
    item.id === "protocol_progress_photos" ||
    ["progress_photos", "photos"].includes(item.protocolType ?? item.category)
  );
  const protocolIds = new Set(protocols.map((item) => item.id));
  const currentVersionIds = new Set(protocols.map((item) => item.currentVersionId).filter(Boolean));
  return createFounderRuntimeSemanticDigest({
    protocols: sortById(protocols.map(projectProtocolRoot)),
    protocolVersions: (value?.protocolVersions ?? []).filter((item) =>
      protocolIds.has(item.protocolId) && currentVersionIds.has(item.id)
    ).map(projectProgressPhotoVersion).sort(compareId),
    execution: (value?.executionItems ?? []).find((item) =>
      item.id === PROGRESS_PHOTOS_EXECUTION_ID
    ) ? projectProgressPhotoExecution((value?.executionItems ?? []).find((item) =>
      item.id === PROGRESS_PHOTOS_EXECUTION_ID
    )) : null,
    reminder: (value?.reminders ?? []).find((item) =>
      item.id === PROGRESS_PHOTOS_REMINDER_ID
    ) ? projectProgressPhotoReminder((value?.reminders ?? []).find((item) =>
      item.id === PROGRESS_PHOTOS_REMINDER_ID
    )) : null,
  });
}

// These projections intentionally omit persistence representation (database
// row versions, source ordinals, timestamps, completion history, notes, and
// unrelated metadata). The read path returns JSON payloads while the command
// path decorates those same payloads with normalized database versions. A
// concurrency fence must compare editor meaning, not those storage shapes.
function projectProtocolRoot(value = {}) {
  return {
    id: nullable(value.id),
    protocolType: nullable(value.protocolType ?? value.category),
    status: nullable(value.status),
    currentVersionId: nullable(value.currentVersionId),
  };
}

function projectCoachingVersion(value = {}) {
  const canonical = value.coachingUpdates;
  const legacy = value.change?.reviewedChanges;
  return {
    id: nullable(value.id),
    protocolId: nullable(value.protocolId),
    coachingUpdates: canonical ? {
      schemaVersion: nullable(canonical.schemaVersion),
      timeZone: nullable(canonical.timeZone),
      midweek: projectSurface(canonical.midweek),
      weekly: projectSurface(canonical.weekly),
      monthly: projectMonthlySurface(canonical.monthly),
      dailyEnabled: canonical.daily?.enabled === true,
      eventBriefings: {
        photo: canonical.eventBriefings?.photo !== false,
        dexa: canonical.eventBriefings?.dexa !== false,
      },
      notificationPreference: nullable(canonical.notificationPreference),
    } : null,
    legacy: canonical ? null : {
      cadence: nullable(legacy?.cadence),
      days: normalizedStrings(legacy?.days),
      dailyEvidenceCollection: legacy?.dailyEvidenceCollection === true,
    },
  };
}

function projectProgressPhotoVersion(value = {}) {
  const recurrence = value.recurrence ?? value.change?.reviewedChanges?.recurrence ?? null;
  return {
    id: nullable(value.id),
    protocolId: nullable(value.protocolId),
    recurrence: projectRecurrence(recurrence),
  };
}

function projectProgressPhotoExecution(value = {}) {
  return {
    id: nullable(value.id),
    active: value.active === true,
    cadence: value.cadence ? {
      type: nullable(value.cadence.type),
      interval: positiveNumber(value.cadence.interval),
    } : null,
    preferredSchedule: projectPreferredSchedule(value.preferredSchedule),
  };
}

function projectProgressPhotoReminder(value = {}) {
  return {
    id: nullable(value.id),
    active: value.active === true,
    schedule: projectRecurrence(value.schedule),
  };
}

function projectDexaAppointment(value = {}) {
  return {
    id: nullable(value.id),
    executionRevision: positiveNumber(value.executionRevision ?? 1),
    active: value.active === true,
    status: nullable(value.status),
    preferredSchedule: projectPreferredSchedule(value.preferredSchedule),
    timezone: nullable(value.timezone),
    reminderPreferences: normalizedStrings(value.reminderPreferences),
    uploadReminder: value.uploadReminder === true,
    preparationNote: String(value.preparationNote ?? "").trim(),
    linkedGoalIds: normalizedStrings(value.linkedGoalIds),
  };
}

function projectSurface(value = {}) {
  return {
    enabled: value.enabled === true,
    day: nullable(value.day),
    localTime: nullable(value.localTime),
  };
}

function projectMonthlySurface(value = {}) {
  return {
    enabled: value.enabled === true,
    dayOfMonth: positiveNumber(value.dayOfMonth),
    localTime: nullable(value.localTime),
  };
}

function projectRecurrence(value) {
  if (!value) return null;
  return {
    recurrenceVersion: nullable(value.recurrenceVersion),
    type: nullable(value.type),
    cadence: nullable(value.cadence),
    frequency: nullable(value.frequency),
    unit: nullable(value.unit),
    interval: positiveNumber(value.interval),
    weekdays: normalizedStrings(value.weekdays ?? value.daysOfWeek),
    dayOfWeek: nullable(value.dayOfWeek),
    preferredDay: nullable(value.preferredDay),
    timeOfDay: nullable(value.timeOfDay),
    localTime: nullable(value.localTime),
    timezone: nullable(value.timezone),
    anchorDate: calendarDate(value.anchorDate),
    effectiveAt: calendarDate(value.effectiveAt),
    endDate: calendarDate(value.endDate),
  };
}

function projectPreferredSchedule(value) {
  if (!value) return null;
  return {
    date: calendarDate(value.date),
    daysOfWeek: normalizedStrings(value.daysOfWeek),
    timeOfDay: nullable(value.timeOfDay),
    timezone: nullable(value.timezone),
    anchorDate: calendarDate(value.anchorDate),
  };
}

function sortById(values) { return [...values].sort(compareId); }
function compareId(left, right) { return String(left?.id ?? "").localeCompare(String(right?.id ?? "")); }
function normalizedStrings(values) { return [...new Set(values ?? [])].map(String).sort(); }
function nullable(value) { return value == null || value === "" ? null : String(value); }
function calendarDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "invalid:Date" : value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (!text) return null;
  // Schedule fields are calendar dates, not instants. An ISO timestamp with
  // an explicit offset retains the written calendar component rather than
  // being shifted through the machine's timezone.
  const leadingDate = text.match(/^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/)?.[1];
  if (leadingDate && isValidCalendarDate(leadingDate)) return leadingDate;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  // Invalid values remain part of the digest. Collapsing them to null would
  // make distinct corrupt/concurrent states compare equal and fail open.
  return `invalid:${text}`;
}
function isValidCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}
function positiveNumber(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; }

export function createFounderRuntimeFileHash(raw) {
  return createHash("sha256").update(raw).digest("hex").toUpperCase();
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
