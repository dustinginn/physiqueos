import { DEXA_APPOINTMENT_ID } from "./DexaAppointmentManagementService.js";

export const DEXA_PRIORITY_PREFIX = "dexa-appointment";
export const DexaPriorityStage = Object.freeze({
  WEEK_BEFORE: "week-before",
  DAY_BEFORE: "day-before",
  MORNING_OF: "morning-of",
  APPOINTMENT: "appointment",
  UPLOAD_RESULTS: "upload-results",
});

const PREPARATION_PREFERENCES = Object.freeze({
  [DexaPriorityStage.WEEK_BEFORE]: "week_before",
  [DexaPriorityStage.DAY_BEFORE]: "day_before",
  [DexaPriorityStage.MORNING_OF]: "morning_of",
});

export function projectDexaAppointmentPriority({
  appointment,
  now = new Date(),
  timeZone = appointment?.timezone ?? "America/Los_Angeles",
} = {}) {
  if (!isCurrentScheduledDexaAppointment(appointment)) return null;
  const scheduledDate = appointment.preferredSchedule?.date;
  if (!isDateKey(scheduledDate)) return null;
  const local = getLocalClock(now, timeZone);
  const dayOffset = differenceInCalendarDays(scheduledDate, local.date);
  const appointmentTime = normalizeLocalTime(appointment.preferredSchedule?.timeOfDay);
  const preferences = new Set(appointment.reminderPreferences ?? []);

  if (dayOffset > 7) return null;
  if (dayOffset === 7 && preferences.has(PREPARATION_PREFERENCES[DexaPriorityStage.WEEK_BEFORE])) {
    return createProjection(appointment, DexaPriorityStage.WEEK_BEFORE, scheduledDate, appointmentTime);
  }
  if (dayOffset === 1 && preferences.has(PREPARATION_PREFERENCES[DexaPriorityStage.DAY_BEFORE])) {
    return createProjection(appointment, DexaPriorityStage.DAY_BEFORE, scheduledDate, appointmentTime);
  }
  if (dayOffset > 0) return null;

  const appointmentPassed = dayOffset < 0 || (
    dayOffset === 0 && appointmentTime && local.time >= appointmentTime
  );
  if (appointmentPassed) {
    return appointment.uploadReminder
      ? createProjection(
          appointment,
          DexaPriorityStage.UPLOAD_RESULTS,
          scheduledDate,
          appointmentTime,
        )
      : null;
  }
  if (dayOffset === 0 && preferences.has(PREPARATION_PREFERENCES[DexaPriorityStage.MORNING_OF])) {
    return createProjection(appointment, DexaPriorityStage.MORNING_OF, scheduledDate, appointmentTime);
  }
  if (dayOffset === 0) {
    return createProjection(appointment, DexaPriorityStage.APPOINTMENT, scheduledDate, appointmentTime);
  }
  return null;
}

export function createDexaPriorityId(scheduledDate, stage) {
  return `${DEXA_PRIORITY_PREFIX}:${scheduledDate}:${stage}`;
}

export function parseDexaPriorityId(value) {
  const raw = String(value ?? "");
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // An invalid URL escape cannot be a canonical DEXA priority identity.
  }
  const match = decoded.match(
    /^dexa-appointment:(\d{4}-\d{2}-\d{2}):(week-before|day-before|morning-of|appointment|upload-results)$/,
  );
  return match ? Object.freeze({ scheduledDate: match[1], stage: match[2] }) : null;
}

export function prepareDexaAppointmentEvidenceReconciliation(store, {
  canonicalEvidenceId,
  confirmedAt = new Date().toISOString(),
  evidenceDate,
} = {}) {
  const executionItems = store.executionItems ?? [];
  const index = executionItems.findIndex((item) => item.id === DEXA_APPOINTMENT_ID);
  const appointment = index >= 0 ? executionItems[index] : null;
  const completionId = appointment && evidenceDate && canonicalEvidenceId
    ? `${DEXA_APPOINTMENT_ID}:${evidenceDate}:${canonicalEvidenceId}`
    : null;
  const existingCompletion = appointment?.completionHistory?.find(
    (entry) => entry.id === completionId,
  );

  if (existingCompletion) {
    return Object.freeze({
      ok: true,
      outcome: "idempotent",
      appointment,
      completion: existingCompletion,
      completionId,
      index,
      matched: true,
    });
  }
  if (!appointment || !isDateKey(evidenceDate) || !canonicalEvidenceId) {
    return notMatched("current_appointment_unavailable");
  }
  if (!isCurrentScheduledDexaAppointment(appointment)) {
    return notMatched("current_appointment_not_scheduled");
  }
  const confirmationLocalDate = getConfirmationLocalDate(confirmedAt, appointment.timezone);
  if (!confirmationLocalDate || evidenceDate > confirmationLocalDate) {
    return notMatched("evidence_date_is_future");
  }
  if (appointment.preferredSchedule?.date !== evidenceDate) {
    return notMatched("evidence_date_does_not_match_current_appointment");
  }

  const completion = Object.freeze({
    id: completionId,
    canonicalEvidenceId,
    completedAt: confirmedAt,
    evidenceDate,
    evidenceType: "dexa",
    scheduledDate: appointment.preferredSchedule.date,
    source: "DexaAppointmentLifecycleService",
  });
  const candidate = {
    ...structuredClone(appointment),
    active: false,
    status: "completed",
    completedAt: confirmedAt,
    completedByEvidenceId: canonicalEvidenceId,
    completedEvidenceDate: evidenceDate,
    completionHistory: [...(appointment.completionHistory ?? []), completion],
    executionRevision: Number(appointment.executionRevision ?? 1) + 1,
    updatedAt: confirmedAt,
  };

  return Object.freeze({
    ok: true,
    outcome: "ready",
    appointment,
    candidate,
    completion,
    completionId,
    index,
    matched: true,
  });
}

export function applyPreparedDexaAppointmentEvidenceReconciliation(store, prepared) {
  if (prepared.outcome !== "ready") return;
  store.executionItems[prepared.index] = structuredClone(prepared.candidate);
}

export function verifyPreparedDexaAppointmentEvidenceReconciliation(store, prepared) {
  const appointment = store.executionItems?.find((item) => item.id === DEXA_APPOINTMENT_ID);
  return Boolean(
    appointment?.status === "completed" &&
    appointment.completedByEvidenceId === prepared.completion.canonicalEvidenceId &&
    appointment.completionHistory?.filter((entry) => entry.id === prepared.completionId).length === 1,
  );
}

export async function reconcileDexaAppointmentFromConfirmedEvidence({
  repositories,
  canonicalEvidenceId,
  confirmedAt = new Date().toISOString(),
  evidenceDate,
} = {}) {
  const appointment = await repositories.executionItems.getExecutionItemById(DEXA_APPOINTMENT_ID);
  const prepared = prepareDexaAppointmentEvidenceReconciliation(
    { executionItems: appointment ? [appointment] : [] },
    { canonicalEvidenceId, confirmedAt, evidenceDate },
  );
  if (!prepared.matched || prepared.outcome === "idempotent") return prepared;
  await repositories.executionItems.saveExecutionItem(prepared.candidate);
  return Object.freeze({ ...prepared, persisted: true });
}

/**
 * Historical compatibility only. Current appointments are always reconciled
 * through execution_next_dexa first; this path may record an older scan on the
 * legacy execution only when its date predates the current appointment.
 */
export async function reconcileHistoricalDexaExecutionFromConfirmedEvidence({
  repositories,
  canonicalEvidenceId,
  confirmedAt = new Date().toISOString(),
  evidenceDate,
} = {}) {
  const [currentAppointment, legacyExecution] = await Promise.all([
    repositories.executionItems.getExecutionItemById(DEXA_APPOINTMENT_ID),
    repositories.executionItems.getExecutionItemById("execution_dexa"),
  ]);
  const currentDate = currentAppointment?.preferredSchedule?.date;
  const confirmationDate = getConfirmationLocalDate(
    confirmedAt,
    currentAppointment?.timezone ?? "America/Los_Angeles",
  );
  const genuinelyHistorical = isDateKey(evidenceDate) &&
    isDateKey(confirmationDate) &&
    evidenceDate <= confirmationDate &&
    (!isDateKey(currentDate) || evidenceDate < currentDate);
  if (!legacyExecution || !canonicalEvidenceId || !genuinelyHistorical) {
    return notMatched("historical_legacy_compatibility_not_applicable");
  }

  const existingCompletion = legacyExecution.completionHistory?.find(
    (entry) => entry.canonicalEvidenceId === canonicalEvidenceId && (
      entry.evidenceDate === evidenceDate ||
      String(entry.id ?? "").includes(`:${evidenceDate}:${canonicalEvidenceId}`)
    ),
  );
  if (existingCompletion) {
    return Object.freeze({
      ok: true,
      outcome: "idempotent",
      matched: true,
      completion: existingCompletion,
      completionId: existingCompletion.id,
      legacy: true,
    });
  }

  const completion = Object.freeze({
    id: `execution_dexa:${evidenceDate}:${canonicalEvidenceId}`,
    canonicalEvidenceId,
    completedAt: confirmedAt,
    evidenceDate,
    evidenceType: "dexa",
    source: "DexaAppointmentLifecycleService:historical-compatibility",
  });
  await repositories.executionItems.saveExecutionItem({
    ...legacyExecution,
    completedAt: confirmedAt,
    completedByEvidenceId: canonicalEvidenceId,
    completionHistory: [...(legacyExecution.completionHistory ?? []), completion],
    updatedAt: confirmedAt,
  });
  return Object.freeze({
    ok: true,
    outcome: "persisted",
    matched: true,
    completion,
    completionId: completion.id,
    legacy: true,
  });
}

export function isCurrentScheduledDexaAppointment(appointment) {
  return Boolean(
    appointment?.id === DEXA_APPOINTMENT_ID &&
    appointment.active !== false &&
    appointment.status === "scheduled",
  );
}

function createProjection(appointment, stage, scheduledDate, appointmentTime) {
  const priorityId = createDexaPriorityId(scheduledDate, stage);
  const timeLabel = formatLocalTime(appointmentTime);
  const dateLabel = formatAppointmentDate(scheduledDate, appointment.timezone);
  const copy = stageCopy(stage, { dateLabel, timeLabel });
  return Object.freeze({
    appointmentId: appointment.id,
    appointmentTime,
    dateLabel,
    executionRevision: appointment.executionRevision ?? 1,
    href: `/priorities/${priorityId}`,
    priorityId,
    scheduledDate,
    stage,
    timeLabel,
    timezone: appointment.timezone ?? "America/Los_Angeles",
    ...copy,
  });
}

function stageCopy(stage, { dateLabel, timeLabel }) {
  if (stage === DexaPriorityStage.WEEK_BEFORE) {
    return { label: "DEXA in 1 week", subtitle: dateLabel, metadata: timeLabel, priority: 32 };
  }
  if (stage === DexaPriorityStage.DAY_BEFORE) {
    return { label: "DEXA tomorrow", subtitle: timeLabel ?? dateLabel, metadata: dateLabel, priority: 10 };
  }
  if (stage === DexaPriorityStage.MORNING_OF) {
    return { label: "DEXA this morning", subtitle: timeLabel ?? "This morning", metadata: dateLabel, priority: 3 };
  }
  if (stage === DexaPriorityStage.APPOINTMENT) {
    return { label: "DEXA appointment", subtitle: timeLabel ?? "Today", metadata: dateLabel, priority: 2 };
  }
  return { label: "Upload DEXA results", subtitle: "Appointment passed", metadata: dateLabel, priority: -10 };
}

function getLocalClock(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function differenceInCalendarDays(left, right) {
  return Math.round((Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86400000);
}

function formatAppointmentDate(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? "UTC",
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatLocalTime(value) {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${period}`;
}

function normalizeLocalTime(value) {
  const text = String(value ?? "");
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : null;
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
}

function getConfirmationLocalDate(value, timeZone) {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return getLocalClock(instant, timeZone ?? "America/Los_Angeles").date;
}

function notMatched(reason) {
  return Object.freeze({ ok: true, outcome: "not_matched", matched: false, reason });
}
