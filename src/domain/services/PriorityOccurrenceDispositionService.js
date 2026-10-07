import {
  DexaPriorityStage,
  parseDexaPriorityId,
  projectDexaAppointmentPriority,
} from "./DexaAppointmentLifecycleService.js";
import {
  ExecutionPriorityOperationalState,
  findExecutionForProtocol,
  projectExecutionPriority,
} from "./ExecutionPriorityProjectionService.js";
import { reminderAppliesToday } from "./DailyFocusService.js";
import { getLocalDateKey } from "../utils/localDate.js";
import {
  resolveExecutionPriorityContract,
  resolvePriorityExecutionContract,
} from "./ReminderOccurrenceCompletion.js";
import {
  MORNING_WEIGH_IN_REMINDER_ID,
  isMorningWeighInDue,
  resolveMorningWeighInSupport,
} from "./TrackingSupportService.js";

const TERMINAL_PRIORITY_STATUSES = new Set([
  "archived", "cancelled", "completed", "dismissed", "moved",
  "rescheduled", "resolved", "skipped", "superseded",
]);
const COMPLETED_PRIORITY_STATUSES = new Set(["completed", "resolved"]);

const SUPPORT_REMINDER_TYPES = new Set([
  "protocol_reminder",
  "recovery_reminder",
  "supplement_reminder",
]);

export const PriorityDispositionTargetKind = Object.freeze({
  REMINDER: "reminder",
  EXECUTION: "execution",
});

// Resolves only Server-known public priority identities. Clients cannot name
// a collection or choose the persistence target. Reminder identity is exact;
// the only execution-backed family currently recognized is the projected
// `execution_next_dexa` stage identity.
export function resolvePriorityDispositionSource({
  executionItems = [],
  priorityId,
  reminders = [],
} = {}) {
  const reminder = reminders.find((item) => String(item?.id) === String(priorityId));
  if (reminder) {
    return Object.freeze({
      kind: PriorityDispositionTargetKind.REMINDER,
      collection: "reminders",
      record: reminder,
    });
  }

  const parsedDexa = parseDexaPriorityId(priorityId);
  if (!parsedDexa) return null;
  const executionItem = executionItems.find((item) => item?.id === "execution_next_dexa");
  if (!executionItem ||
      String(executionItem.preferredSchedule?.date) !== parsedDexa.scheduledDate) {
    return null;
  }
  return Object.freeze({
    kind: PriorityDispositionTargetKind.EXECUTION,
    collection: "executionItems",
    record: executionItem,
    dexa: parsedDexa,
  });
}

export function isPriorityDispositionSourceCompleted(source, {
  isReminderCompleted,
  occurrenceDate,
  timeZone,
} = {}) {
  if (!source) return false;
  if (source.kind === PriorityDispositionTargetKind.REMINDER) {
    return isReminderCompleted(source.record, { occurrenceDate, timeZone });
  }
  const item = source.record;
  return COMPLETED_PRIORITY_STATUSES.has(
    String(item?.status ?? "").toLowerCase()
  ) || Boolean(item?.completedAt || item?.completedByEvidenceId);
}

export function isPriorityDispositionSourceSatisfiedByEvidence(source, {
  dexaScans = [],
  timeZone,
} = {}) {
  if (source?.kind !== PriorityDispositionTargetKind.EXECUTION || !source.dexa) return false;
  return dexaScans.some((scan) => {
    const value = scan?.measuredAt ?? scan?.scanDate ?? scan?.date;
    if (!value) return false;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
      ? String(value)
      : getLocalDateKey(value, timeZone);
    return date === source.dexa.scheduledDate;
  });
}

export function resolveActionablePriorityDisposition({
  executionItems = [],
  now,
  occurrenceDate,
  priorityId,
  protocols = [],
  reminders = [],
  source,
  timeZone,
} = {}) {
  if (!source || !isOpenSource(source.record)) return null;

  if (source.kind === PriorityDispositionTargetKind.EXECUTION) {
    const projection = projectDexaAppointmentPriority({
      appointment: source.record,
      now,
      timeZone: source.record?.timezone ?? timeZone,
    });
    if (!projection || projection.priorityId !== priorityId) return null;
    return Object.freeze({
      source,
      executionContract: resolvePriorityDispositionExecutionContract(source, {
        occurrenceDate,
        priorityId,
        destination: projection.href,
      }),
    });
  }

  const reminder = source.record;
  if (!isUserFacing(reminder)) return null;
  if (reminder.id === MORNING_WEIGH_IN_REMINDER_ID || reminder.linkedEvidenceType === "weight") {
    const support = resolveMorningWeighInSupport({
      executionItems,
      protocols,
      reminders: [reminder],
    });
    if (!support || !isMorningWeighInDue(support.supportSchedule, occurrenceDate)) return null;
  } else if (SUPPORT_REMINDER_TYPES.has(reminder.type)) {
    const protocol = protocols.find((item) => String(item?.id) === String(reminder.linkedEntityId));
    if (!protocol || !["peptide", "recovery", "supplement"].includes(protocol.category)) {
      return null;
    }
    const { executionItem } = findExecutionForProtocol(executionItems, protocol.id);
    const projection = projectExecutionPriority({
      executionItem,
      localDate: occurrenceDate,
      now,
      protocol,
      reminder,
      timeZone,
    });
    if (projection.operationalState !== ExecutionPriorityOperationalState.ACTIONABLE ||
        projection.occurrenceEligible !== true || projection.completable !== true) {
      return null;
    }
  } else if (!reminderAppliesToday(reminder, dayName(occurrenceDate), occurrenceDate)) {
    return null;
  }

  return Object.freeze({
    source,
    executionContract: resolvePriorityExecutionContract({ reminder, occurrenceDate }),
  });
}

export function resolvePriorityDispositionExecutionContract(source, {
  destination = null,
  occurrenceDate,
  priorityId,
} = {}) {
  if (source?.kind === PriorityDispositionTargetKind.REMINDER) {
    return resolvePriorityExecutionContract({
      reminder: source.record,
      occurrenceDate,
    });
  }
  if (source?.kind === PriorityDispositionTargetKind.EXECUTION && source.dexa) {
    const upload = source.dexa.stage === DexaPriorityStage.UPLOAD_RESULTS;
    return resolveExecutionPriorityContract({
      executionItem: source.record,
      occurrenceDate,
      priorityId,
      workflow: upload ? "dexa_evidence" : "dexa_appointment",
      destination: destination ?? (upload
        ? "/evidence/dexa"
        : "/profile/operating-plan/execution/dexa"),
    });
  }
  return null;
}

function isOpenSource(record) {
  if (!record?.id || record.active === false) return false;
  if (record.archived === true || record.archivedAt || record.cancelledAt ||
      record.dismissedAt || record.supersededAt || record.supersededBy) return false;
  return !TERMINAL_PRIORITY_STATUSES.has(
    String(record.status ?? record.resolution ?? "").toLowerCase()
  );
}

function isUserFacing(record) {
  return record.internal !== true && record.internalOnly !== true &&
    record.userFacing !== false && record.visibility !== "internal";
}

function dayName(dateKey) {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    [new Date(`${dateKey}T12:00:00Z`).getUTCDay()];
}
