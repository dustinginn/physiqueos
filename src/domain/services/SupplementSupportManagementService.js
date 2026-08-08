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

export const SupplementSupportOutcome = Object.freeze({
  SUCCESS: "success",
  UNCHANGED: "unchanged",
  INVALID: "invalid",
  NOT_FOUND: "not_found",
  VERSION_CONFLICT: "version_conflict",
  PERSISTENCE_FAILURE: "persistence_failure",
  PUBLICATION_FAILURE: "publication_failure",
});

const LOSSLESS_CADENCES = new Set([
  "daily",
  "weekly",
  "specific_days",
  "specific_weekdays",
  "every_x_days",
  "every_other_day",
]);

export function createSupplementSupportHydrationModel({
  executionItem = null,
  protocol = null,
  reminder = null,
} = {}) {
  const legacyCadence = executionItem?.cadence?.type ??
    protocol?.schedule?.type ??
    protocol?.schedule?.frequency ??
    null;
  const compatibilityIssue = legacyCadence && !LOSSLESS_CADENCES.has(legacyCadence)
    ? `The current ${humanize(legacyCadence)} schedule cannot be edited safely with this Support editor yet.`
    : null;
  const startDate =
    executionItem?.preferredSchedule?.startDate ||
    protocol?.startDate ||
    dateOnly(executionItem?.createdAt) ||
    dateOnly(protocol?.createdAt) ||
    "";
  const sourceExecution = executionItem
    ? {
        ...executionItem,
        preferredSchedule: {
          ...executionItem.preferredSchedule,
          startDate,
        },
      }
    : legacyExecutionFromProtocol(protocol, startDate);
  const supportSchedule = hydrateSupportSchedule(sourceExecution, protocol);
  const dose = executionItem?.dose ?? protocolDose(protocol);

  return Object.freeze({
    compatibilityIssue,
    executionRevision: executionItem?.executionRevision ?? null,
    draft: normalizeSupplementSupportDraft({
      dose,
      supportSchedule,
      reminderPreference: reminder
        ? reminder.active === false ? "none" : "remind"
        : ["remind", "in_app"].includes(executionItem?.reminderPreference)
          ? "remind"
          : "none",
      notes: executionItem?.notes ?? "",
    }),
    source: executionItem ? "canonical_execution" : "protocol_compatibility",
  });
}

export function buildSupplementSupportDraftFromFormData(formData) {
  const get = (key) => String(formData.get(key) ?? "").trim();
  let supportSchedule;
  try {
    supportSchedule = normalizeSupportSchedule(JSON.parse(get("supportScheduleJson")));
  } catch {
    return { malformed: true };
  }

  return normalizeSupplementSupportDraft({
    dose: { amount: get("doseAmount"), unit: get("doseUnit") },
    supportSchedule,
    reminderPreference: get("reminderPreference"),
    notes: get("notes"),
  });
}

export function normalizeSupplementSupportDraft(value = {}) {
  const supportSchedule = normalizeSupportSchedule(value.supportSchedule);
  return {
    dose: {
      amount: clean(value.dose?.amount).slice(0, 40),
      unit: clean(value.dose?.unit).slice(0, 40),
    },
    supportSchedule,
    ...supportScheduleToExecution(supportSchedule),
    reminderPreference: value.reminderPreference === "remind" ? "remind" : "none",
    notes: String(value.notes ?? "").trim().slice(0, 1000),
    ...(value.malformed === true ? { malformed: true } : {}),
  };
}

export function validateSupplementSupportDraft(value = {}) {
  if (value.malformed) return ["Review the Support settings and try again."];
  return validateSupportSchedule(value.supportSchedule);
}

export function createSupplementSupportManagementService({
  runtimeStorePath,
  liveStore,
  now = () => new Date(),
  createUnitOfWork = (options) => createFounderStoreUnitOfWork(options),
  faults = {},
} = {}) {
  if (!runtimeStorePath || !liveStore) {
    throw new Error("Supplement Support management requires a bound Founder store.");
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
        let recordId;
        let expectedExecution;
        let expectedReminder;
        let preservedLegacy;
        let preservedReminderHistory;
        const staged = await transaction.mutate((store) => {
          const protocol = store.protocols?.find((item) =>
            item.id === command.protocolId &&
            item.userId === command.userId &&
            item.category === "supplement" &&
            item.status === "active"
          );
          if (!protocol) {
            throw typed(SupplementSupportOutcome.NOT_FOUND, "This supplement is no longer available.");
          }
          if (
            !protocol.currentVersionId ||
            protocol.currentVersionId !== command.supplementVersionId ||
            !store.protocolVersions?.some((item) =>
              item.id === protocol.currentVersionId && item.status === "active" && !item.endedAt
            )
          ) {
            throw typed(SupplementSupportOutcome.VERSION_CONFLICT, "This supplement changed while you were editing it.");
          }
          if (
            ![...(protocol.currentGoalIds ?? []), ...(protocol.relatedGoalIds ?? [])].includes(command.goalId) ||
            !store.goals?.some((goal) =>
              goal.id === command.goalId && goal.userId === command.userId && goal.status === "active"
            )
          ) {
            throw typed(SupplementSupportOutcome.INVALID, "The supported strategy is unavailable.");
          }

          const draft = normalizeSupplementSupportDraft(command.draft);
          const errors = validateSupplementSupportDraft(draft);
          if (errors.length) throw typed(SupplementSupportOutcome.INVALID, errors[0]);

          store.executionItems ??= [];
          recordId = `execution_supplement_${protocol.id}`;
          const matches = store.executionItems.filter((item) =>
            item.type === "supplement" && item.protocolRootId === protocol.id
          );
          if (matches.length > 1) {
            throw typed(SupplementSupportOutcome.INVALID, "This Supplement Support item is not available to edit right now.");
          }
          const existing = matches[0] ?? null;
          if (
            existing &&
            Number(command.expectedRevision) !== Number(existing.executionRevision ?? 1)
          ) {
            throw typed(SupplementSupportOutcome.VERSION_CONFLICT, "This Support schedule changed while you were editing it.");
          }
          if (
            !existing &&
            command.expectedRevision !== null &&
            command.expectedRevision !== undefined &&
            command.expectedRevision !== ""
          ) {
            throw typed(SupplementSupportOutcome.VERSION_CONFLICT, "This Support schedule changed while you were editing it.");
          }
          if (existing && !LOSSLESS_CADENCES.has(existing.cadence?.type)) {
            throw typed(SupplementSupportOutcome.INVALID, "This legacy schedule cannot be changed safely with the current Support editor.");
          }

          const timestamp = now().toISOString();
          preservedLegacy = legacySemantic(existing);
          const executionCandidate = {
            ...(existing ?? {}),
            id: existing?.id ?? recordId,
            userId: command.userId,
            type: "supplement",
            title: protocol.name,
            description: existing?.description ?? "Supplement Support",
            active: true,
            protocolRootId: protocol.id,
            supplementVersionId: protocol.currentVersionId,
            linkedStrategyIds: existing?.linkedStrategyIds ?? [protocol.id],
            linkedGoalIds: existing?.linkedGoalIds ?? [command.goalId],
            dose: draft.dose,
            cadence: draft.cadence,
            preferredSchedule: draft.preferredSchedule,
            reminderPreference: draft.reminderPreference,
            notes: draft.notes,
            executionRevision: (existing?.executionRevision ?? 0) + 1,
            author: command.author,
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
          };
          recordId = executionCandidate.id;
          const executionChanged = !existing || executionSemantic(existing) !== executionSemantic(executionCandidate);
          expectedExecution = executionSemantic(executionCandidate);
          if (executionChanged) {
            const index = existing ? store.executionItems.findIndex((item) => item.id === existing.id) : -1;
            if (index >= 0) store.executionItems[index] = executionCandidate;
            else store.executionItems.push(executionCandidate);
          }

          store.reminders ??= [];
          const reminderMatches = store.reminders.filter((item) =>
            item.userId === command.userId &&
            item.type === "supplement_reminder" &&
            item.linkedEntityId === protocol.id
          );
          if (reminderMatches.length > 1) {
            throw typed(SupplementSupportOutcome.INVALID, "This Supplement Support reminder is not available to edit right now.");
          }
          const reminder = reminderMatches[0] ?? null;
          preservedReminderHistory = reminderHistory(reminder);
          const reminderCandidate = {
            ...(reminder ?? {}),
            id: reminder?.id ?? `reminder_${protocol.id}`,
            userId: command.userId,
            title: protocol.name,
            type: "supplement_reminder",
            linkedEntityType: "protocol",
            linkedEntityId: protocol.id,
            linkedExecutionId: executionCandidate.id,
            relatedGoalIds: reminder?.relatedGoalIds ?? executionCandidate.linkedGoalIds,
            schedule: {
              ...supportScheduleToReminder(draft.supportSchedule, "supplement"),
              timezone: reminder?.schedule?.timezone ?? null,
            },
            persistenceMode: reminder?.persistenceMode ?? "scheduled",
            active: draft.reminderPreference === "remind",
            createdAt: reminder?.createdAt ?? timestamp,
            updatedAt: timestamp,
          };
          expectedReminder = reminderSemantic(reminderCandidate);
          const reminderChanged = !reminder || reminderSemantic(reminder) !== expectedReminder;
          if (reminderChanged) {
            const index = reminder ? store.reminders.findIndex((item) => item.id === reminder.id) : -1;
            if (index >= 0) store.reminders[index] = reminderCandidate;
            else store.reminders.push(reminderCandidate);
          }

          if (!executionChanged && !reminderChanged) {
            throw typed(SupplementSupportOutcome.UNCHANGED, "No changes to save.");
          }
          faults.afterWrite?.(store, executionCandidate);
          return {
            created: !existing,
            executionId: executionCandidate.id,
            executionRevision: executionChanged
              ? executionCandidate.executionRevision
              : existing.executionRevision ?? 1,
            reminderId: reminderCandidate.id,
          };
        });

        const committed = await transaction.commit({
          validateFinalized(store) {
            faults.beforeVerification?.(store);
            const executions = store.executionItems.filter((item) =>
              item.type === "supplement" && item.protocolRootId === command.protocolId
            );
            const reminders = store.reminders.filter((item) =>
              item.userId === command.userId &&
              item.type === "supplement_reminder" &&
              item.linkedEntityId === command.protocolId
            );
            return Boolean(
              executions.length === 1 &&
              executions[0].id === recordId &&
              executionSemantic(executions[0]) === expectedExecution &&
              legacySemantic(executions[0]) === preservedLegacy &&
              reminders.length === 1 &&
              reminderSemantic(reminders[0]) === expectedReminder &&
              reminderHistory(reminders[0]) === preservedReminderHistory
            );
          },
        });
        return {
          outcome: SupplementSupportOutcome.SUCCESS,
          committed: true,
          revision: committed.revision,
          ...staged,
        };
      } catch (error) {
        const own = findTyped(error);
        if (own) return { outcome: own.outcome, committed: false, reason: own.message };
        if (error?.committed) {
          return {
            outcome: SupplementSupportOutcome.PUBLICATION_FAILURE,
            committed: true,
            reason: "The Support settings saved but could not refresh.",
          };
        }
        return {
          outcome: error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT
            ? SupplementSupportOutcome.VERSION_CONFLICT
            : SupplementSupportOutcome.PERSISTENCE_FAILURE,
          committed: false,
          reason: "We could not update this Supplement Support. Nothing was changed.",
        };
      }
    },
  };
}

export function formatSupplementSupportSummary(item) {
  if (!item) return "Not configured";
  const type = item.cadence?.type;
  let cadence;
  if (type === "daily") cadence = "Daily";
  else if (type === "every_other_day") cadence = "Every other day";
  else if (type === "every_x_days") {
    const interval = Number(item.cadence?.interval ?? item.preferredSchedule?.intervalDays ?? 1);
    cadence = interval === 2 ? "Every other day" : `Every ${interval} ${interval === 1 ? "day" : "days"}`;
  } else if (["specific_days", "specific_weekdays"].includes(type)) {
    cadence = formatDays(item.preferredSchedule?.daysOfWeek);
  } else if (type === "weekly") {
    const day = formatDays(item.preferredSchedule?.daysOfWeek);
    cadence = day ? `Weekly · ${day}` : "Weekly";
  } else {
    return "Current schedule needs review";
  }
  return [cadence, formatTiming(item.preferredSchedule?.timeOfDay)].filter(Boolean).join(" · ");
}

function legacyExecutionFromProtocol(protocol, startDate) {
  const rawCadence = protocol?.schedule?.type ?? protocol?.schedule?.frequency ?? "daily";
  const cadence = rawCadence === "every_other_day"
    ? { type: "every_other_day" }
    : { type: rawCadence === "weekly_days" ? "specific_days" : rawCadence };
  return {
    cadence,
    preferredSchedule: {
      daysOfWeek: protocol?.schedule?.daysOfWeek ?? protocol?.frequency?.daysOfWeek ?? [],
      timeOfDay: protocol?.schedule?.timeOfDay ?? "morning",
      startDate,
      endDate: protocol?.endDate ?? null,
    },
  };
}

function protocolDose(protocol) {
  return {
    amount: clean(protocol?.dose?.amount ?? protocol?.dose?.value),
    unit: clean(protocol?.dose?.unit ?? protocol?.doseUnit),
  };
}

function executionSemantic(item) {
  return JSON.stringify({
    dose: item?.dose ?? null,
    cadence: item?.cadence ?? null,
    preferredSchedule: item?.preferredSchedule ?? null,
    reminderPreference: item?.reminderPreference ?? null,
    notes: item?.notes ?? null,
  });
}

function legacySemantic(item) {
  return JSON.stringify({
    priority: item?.priority ?? null,
    timeline: item?.timeline ?? null,
    timelineHistory: item?.timelineHistory ?? null,
    completionHistory: item?.completionHistory ?? null,
  });
}

function reminderSemantic(item) {
  return JSON.stringify({ active: item?.active ?? null, schedule: item?.schedule ?? null });
}

function reminderHistory(item) {
  return JSON.stringify({
    completedAt: item?.completedAt ?? null,
    completionHistory: item?.completionHistory ?? null,
  });
}

function formatDays(days = []) {
  const names = {
    sunday: "Sun", monday: "Mon", tuesday: "Tue", wednesday: "Wed",
    thursday: "Thu", friday: "Fri", saturday: "Sat",
  };
  return [...new Set(days)].map((day) => names[day]).filter(Boolean).join(", ");
}

function formatTiming(value) {
  if (!value) return "";
  if (/^\d{2}:\d{2}$/.test(value)) {
    const [hour, minute] = value.split(":").map(Number);
    return new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return humanize(value);
}

function dateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}/.test(value ?? "") ? String(value).slice(0, 10) : "";
}

function clean(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function humanize(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function typed(outcome, message) {
  const error = new Error(message);
  error.supplementSupportOutcome = outcome;
  return error;
}

function findTyped(error) {
  let current = error;
  while (current) {
    if (current.supplementSupportOutcome) {
      return { outcome: current.supplementSupportOutcome, message: current.message };
    }
    current = current.cause;
  }
  return null;
}
