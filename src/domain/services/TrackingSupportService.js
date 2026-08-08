import {
  formatSupportScheduleSummary,
  hydrateSupportSchedule,
} from "../models/SupportScheduleModel";

export const MORNING_WEIGH_IN_EXECUTION_ID = "execution_morning_weigh_in";
export const MORNING_WEIGH_IN_REMINDER_ID = "reminder_morning_weight";

export function resolveMorningWeighInSupport({ executionItems = [], protocols = [], reminders = [], userId = null } = {}) {
  const executionItem = executionItems.find(
    (item) => item.id === MORNING_WEIGH_IN_EXECUTION_ID && item.active !== false
  );
  if (!executionItem || userId && executionItem.userId !== userId) return null;
  const protocolId = executionItem.protocolRootId ?? executionItem.linkedProtocolId;
  const protocol = protocols.find((item) =>
    item.id === protocolId && item.status === "active" &&
    (item.category === "weight" || item.protocolType === "weight")
  );
  const reminder = reminders.find((item) =>
    item.id === MORNING_WEIGH_IN_REMINDER_ID && item.linkedEntityId === protocolId
  );
  if (!protocol || !reminder) return null;
  if (userId && (protocol.userId !== userId || reminder.userId !== userId)) return null;
  const supportSchedule = hydrateSupportSchedule(executionItem, protocol);
  return Object.freeze({
    executionItem,
    protocol,
    reminder,
    supportSchedule,
    supportSummary: formatSupportScheduleSummary(supportSchedule),
  });
}

export function isMorningWeighInDue(supportSchedule, localDate) {
  if (!supportSchedule || !/^\d{4}-\d{2}-\d{2}$/.test(localDate ?? "")) return false;
  if (supportSchedule.startDate && localDate < supportSchedule.startDate) return false;
  if (supportSchedule.endDate && localDate > supportSchedule.endDate) return false;
  if (supportSchedule.frequency === "daily") return true;
  if (supportSchedule.frequency === "every_x_days") {
    if (!supportSchedule.startDate) return false;
    const elapsed = dateDifference(supportSchedule.startDate, localDate);
    return elapsed >= 0 && elapsed % supportSchedule.intervalDays === 0;
  }
  const dayName = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    [new Date(`${localDate}T12:00:00Z`).getUTCDay()];
  return supportSchedule.daysOfWeek.includes(dayName);
}

export function isMorningWeighInSatisfied({ checkIns = [], latestWeight = null, reminder = null, timeZone, weightEntries = [], localDate } = {}) {
  if (checkIns.some((item) => item.date === localDate && Boolean(item.weightEntryId))) return true;
  if ([latestWeight, ...weightEntries].filter(Boolean).some(
    (item) => evidenceDate(item.measuredAt ?? item.observedAt, timeZone) === localDate
  )) return true;
  return (reminder?.completionHistory ?? []).some((entry) =>
    String(entry.evidenceDate ?? entry.occurrenceDate ?? "").slice(0, 10) === localDate
  );
}

function evidenceDate(value, timeZone) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(date);
}

function dateDifference(start, end) {
  return Math.floor((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000);
}
