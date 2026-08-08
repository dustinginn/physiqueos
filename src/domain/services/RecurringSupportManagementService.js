import {
  createFounderStoreUnitOfWork,
  FounderStoreUnitOfWorkErrorCode,
} from "../../data/repositories/FounderStoreUnitOfWork";
import {
  hydrateSupportSchedule,
  normalizeSupportSchedule,
  supportScheduleToExecution,
  supportScheduleToReminder,
  validateSupportSchedule,
} from "../models/SupportScheduleModel";

export const RecurringSupportOutcome = Object.freeze({
  SUCCESS: "success",
  UNCHANGED: "unchanged",
  INVALID: "invalid",
  NOT_FOUND: "not_found",
  VERSION_CONFLICT: "version_conflict",
  PERSISTENCE_FAILURE: "persistence_failure",
  PUBLICATION_FAILURE: "publication_failure",
});

export function createRecurringSupportHydrationModel({
  executionItem,
  protocol,
  reminder,
} = {}) {
  const existingStartDate =
    executionItem?.preferredSchedule?.startDate ||
    executionItem?.preferredSchedule?.anchorDate ||
    protocol?.startDate ||
    dateOnly(protocol?.activatedAt) ||
    dateOnly(executionItem?.createdAt) ||
    "";
  const supportSchedule = hydrateSupportSchedule(
    {
      ...executionItem,
      preferredSchedule: {
        ...executionItem?.preferredSchedule,
        startDate: existingStartDate,
      },
    },
    protocol
  );

  return Object.freeze({
    executionRevision: executionItem?.executionRevision ?? 1,
    supportSchedule,
    reminderPreference: reminder
      ? reminder.active === false
        ? "none"
        : "remind"
      : ["remind", "in_app"].includes(executionItem?.reminderPreference)
        ? "remind"
        : "none",
    notes: executionItem?.notes ?? "",
  });
}

export function buildRecurringSupportDraftFromFormData(formData) {
  const get = (key) => String(formData.get(key) ?? "").trim();
  let supportSchedule;
  try {
    supportSchedule = normalizeSupportSchedule(
      JSON.parse(get("supportScheduleJson"))
    );
  } catch {
    return { malformed: true };
  }

  return normalizeRecurringSupportDraft({
    supportSchedule,
    reminderPreference: get("reminderPreference"),
    notes: get("notes"),
  });
}

export function normalizeRecurringSupportDraft(value = {}) {
  const supportSchedule = normalizeSupportSchedule(value.supportSchedule);
  return {
    supportSchedule,
    ...supportScheduleToExecution(supportSchedule),
    reminderPreference: value.reminderPreference === "remind" ? "remind" : "none",
    notes: String(value.notes ?? "").trim().slice(0, 1000),
    ...(value.malformed === true ? { malformed: true } : {}),
  };
}

export function validateRecurringSupportDraft(value = {}) {
  if (value.malformed) return ["Review the Support settings and try again."];
  return validateSupportSchedule(value.supportSchedule);
}

export function createRecurringSupportManagementService({
  runtimeStorePath,
  liveStore,
  now = () => new Date(),
  createUnitOfWork = (options) => createFounderStoreUnitOfWork(options),
  faults = {},
} = {}) {
  if (!runtimeStorePath || !liveStore) {
    throw new Error("Recurring Support management requires a bound Founder store.");
  }

  return {
    async save(command = {}) {
      const transaction = createUnitOfWork({
        filePath: runtimeStorePath,
        liveStore,
        now,
        stageFrom: liveStore,
      }).begin();
      try {
        let expectedExecution;
        let expectedReminder;
        let preservedReminderHistory;
        const staged = await transaction.mutate((store) => {
          const protocol = store.protocols?.find(
            (item) =>
              item.id === command.protocolId &&
              item.userId === command.userId &&
              item.status === "active" &&
              item.category === command.protocolCategory
          );
          const execution = store.executionItems?.find(
            (item) =>
              item.id === command.executionId &&
              item.userId === command.userId &&
              [item.protocolRootId, item.linkedProtocolId].includes(command.protocolId)
          );
          if (!protocol || !execution) {
            throw typed(
              RecurringSupportOutcome.NOT_FOUND,
              "This Support item is no longer available."
            );
          }
          if (
            Number(command.expectedRevision) !==
            Number(execution.executionRevision ?? 1)
          ) {
            throw typed(
              RecurringSupportOutcome.VERSION_CONFLICT,
              "This Support schedule changed while you were editing it."
            );
          }

          const draft = normalizeRecurringSupportDraft(command.draft);
          const errors = validateRecurringSupportDraft(draft);
          if (errors.length) {
            throw typed(RecurringSupportOutcome.INVALID, errors[0]);
          }

          const timestamp = now().toISOString();
          const executionCandidate = {
            ...execution,
            cadence: draft.cadence,
            preferredSchedule: draft.preferredSchedule,
            reminderPreference: draft.reminderPreference,
            notes: draft.notes,
            executionRevision: (execution.executionRevision ?? 0) + 1,
            updatedAt: timestamp,
          };
          const executionChanged =
            executionSemantic(execution) !== executionSemantic(executionCandidate);
          expectedExecution = executionSemantic(executionCandidate);
          if (executionChanged) {
            const executionIndex = store.executionItems.findIndex(
              (item) => item.id === execution.id
            );
            store.executionItems[executionIndex] = executionCandidate;
          }

          store.reminders ??= [];
          const reminderMatches = store.reminders.filter(
            (item) =>
              item.userId === command.userId &&
              (item.id === command.reminderId ||
                (item.linkedEntityId === protocol.id &&
                  ["protocol_reminder", "recovery_reminder"].includes(item.type)))
          );
          if (reminderMatches.length !== 1) {
            throw typed(
              RecurringSupportOutcome.INVALID,
              "This Support reminder is not available to edit right now."
            );
          }
          const reminder = reminderMatches[0];
          preservedReminderHistory = reminderHistory(reminder);
          const reminderSchedule = supportScheduleToReminder(
            draft.supportSchedule,
            execution.timingContext ?? protocol.schedule?.timingContext ?? protocol.category
          );
          const reminderCandidate = {
            ...reminder,
            schedule: {
              ...reminderSchedule,
              timezone: reminder.schedule?.timezone ?? null,
            },
            active: draft.reminderPreference === "remind",
            updatedAt: timestamp,
          };
          const reminderChanged =
            reminderSemantic(reminder) !== reminderSemantic(reminderCandidate);
          expectedReminder = reminderSemantic(reminderCandidate);
          if (reminderChanged) {
            const reminderIndex = store.reminders.findIndex(
              (item) => item.id === reminder.id
            );
            store.reminders[reminderIndex] = reminderCandidate;
          }

          if (!executionChanged && !reminderChanged) {
            throw typed(RecurringSupportOutcome.UNCHANGED, "No changes to save.");
          }
          faults.afterWrite?.(store, executionCandidate);
          return {
            executionId: execution.id,
            executionRevision: executionChanged
              ? executionCandidate.executionRevision
              : execution.executionRevision ?? 1,
            reminderId: reminder.id,
          };
        });

        const committed = await transaction.commit({
          validateFinalized(store) {
            faults.beforeVerification?.(store);
            const execution = store.executionItems?.find(
              (item) => item.id === command.executionId
            );
            const reminder = store.reminders?.find(
              (item) => item.id === command.reminderId
            );
            return Boolean(
              execution &&
                reminder &&
                executionSemantic(execution) === expectedExecution &&
                reminderSemantic(reminder) === expectedReminder &&
                reminderHistory(reminder) === preservedReminderHistory
            );
          },
        });
        return {
          outcome: RecurringSupportOutcome.SUCCESS,
          committed: true,
          revision: committed.revision,
          ...staged,
        };
      } catch (error) {
        const own = findTyped(error);
        if (own) return { outcome: own.outcome, committed: false, reason: own.message };
        if (error?.committed) {
          return {
            outcome: RecurringSupportOutcome.PUBLICATION_FAILURE,
            committed: true,
            reason: "The Support schedule saved but could not refresh.",
          };
        }
        return {
          outcome:
            error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT
              ? RecurringSupportOutcome.VERSION_CONFLICT
              : RecurringSupportOutcome.PERSISTENCE_FAILURE,
          committed: false,
          reason: "We could not update this Support schedule. Nothing was changed.",
        };
      }
    },
  };
}

function executionSemantic(item) {
  return JSON.stringify({
    cadence: item.cadence,
    preferredSchedule: item.preferredSchedule,
    reminderPreference: item.reminderPreference,
    notes: item.notes,
    priority: item.priority,
  });
}

function reminderSemantic(item) {
  return JSON.stringify({ active: item.active, schedule: item.schedule });
}

function reminderHistory(item) {
  return JSON.stringify({
    completedAt: item.completedAt ?? null,
    completionHistory: item.completionHistory ?? null,
  });
}

function dateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}/.test(value ?? "")
    ? String(value).slice(0, 10)
    : "";
}

function typed(outcome, message) {
  const error = new Error(message);
  error.recurringSupportOutcome = outcome;
  return error;
}

function findTyped(error) {
  let current = error;
  while (current) {
    if (current.recurringSupportOutcome) {
      return { outcome: current.recurringSupportOutcome, message: current.message };
    }
    current = current.cause;
  }
  return null;
}
