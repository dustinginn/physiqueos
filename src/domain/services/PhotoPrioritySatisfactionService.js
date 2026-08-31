import { isConfirmedUsablePhoto } from "../models/progressPhotoPoseVocabulary";
import { normalizeProtocolRecurrence } from "./ProtocolRecurrenceNormalizationService";
import { isProtocolDateOnCycle } from "./ProtocolOccurrenceResolver";

export const PHOTO_PRIORITY_SATISFACTION_TYPE = "progress_photo_session_confirmed";

export function evaluatePhotoPrioritySatisfaction({ reminder, canonicalSession, evidenceDate } = {}) {
  const date = String(evidenceDate ?? canonicalSession?.lastObservedAt ?? canonicalSession?.payload?.captureDate ?? "").slice(0, 10);
  const payload = canonicalSession?.payload ?? canonicalSession ?? {};
  const usableViews = (payload.photos ?? []).filter(isConfirmedUsablePhoto);
  const occurrenceKey = `${reminder?.id}:${date}`;
  const idempotencyKey = `${occurrenceKey}:${canonicalSession?.canonicalId ?? payload.sessionId ?? "missing"}`;
  const scheduled = reminderMatchesDate(reminder, date);
  const eligible = Boolean(
    reminder?.active &&
    reminder.linkedEvidenceType === "progress_photo" &&
    canonicalSession &&
    canonicalSession.quality?.status !== "superseded" &&
    payload.provisional !== true &&
    usableViews.length > 0 &&
    scheduled
  );
  return {
    eligible,
    reason: eligible ? "A confirmed canonical progress-photo session satisfies this scheduled occurrence." :
      !scheduled ? "The evidence date does not match this scheduled occurrence." :
      usableViews.length === 0 ? "No active, usable, user-confirmed photo view is available." :
      "The canonical PhotoSession is not eligible.",
    priorityId: reminder?.id ?? null,
    evidenceDate: date,
    canonicalPhotoSessionId: canonicalSession?.canonicalId ?? payload.sessionId ?? null,
    satisfactionType: PHOTO_PRIORITY_SATISFACTION_TYPE,
    evidenceSource: "canonical_photo_session",
    occurrenceKey,
    idempotencyKey,
  };
}

export async function satisfyPhotoPriorityFromCanonicalSession({
  repositories, userId, canonicalSession, evidenceDate, confirmedAt = new Date().toISOString(),
} = {}) {
  const reminders = await repositories.reminders.listActiveReminders(userId);
  const reminder = reminders.find((item) =>
    item.linkedEvidenceType === "progress_photo" && item.linkedEntityType === "progress_photo_set"
  );
  const result = evaluatePhotoPrioritySatisfaction({ reminder, canonicalSession, evidenceDate });
  if (!result.eligible) return { ...result, persisted: false };
  const existing = (reminder.completionHistory ?? []).find((item) => item.idempotencyKey === result.idempotencyKey);
  if (existing) return { ...result, persisted: false, record: existing, idempotent: true };
  const record = await repositories.reminders.completeReminderFromEvidence(reminder.id, {
    id: result.idempotencyKey,
    ...result,
    canonicalEvidenceId: result.canonicalPhotoSessionId,
    completedAt: confirmedAt,
    confirmationTimestamp: confirmedAt,
  });
  return { ...result, persisted: Boolean(record), record, idempotent: false };
}

function reminderMatchesDate(reminder, dateKey) {
  if (!reminder || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const date = new Date(`${dateKey}T12:00:00Z`);
  const day = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][date.getUTCDay()];
  const schedule = reminder.schedule ?? {};
  if (schedule.type === "daily" || schedule.cadence === "daily") return true;
  if (Number(schedule.interval ?? 1) > 1) {
    try {
      const recurrence = normalizeProtocolRecurrence(schedule, {
        fallbackTimezone: schedule.timezone,
        fallbackAnchorDate: schedule.anchorDate,
      });
      return isProtocolDateOnCycle(recurrence, dateKey);
    } catch {
      return false;
    }
  }
  const days = schedule.daysOfWeek?.length ? schedule.daysOfWeek : [schedule.preferredDay ?? schedule.dayOfWeek].filter(Boolean);
  return days.includes(day);
}
