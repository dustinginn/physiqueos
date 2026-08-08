import fs from "node:fs";
import {
  FounderStoreUnitOfWorkErrorCode,
  createFounderStoreUnitOfWork,
  getFounderStoreRevision,
} from "../../data/repositories/FounderStoreUnitOfWork.js";
import {
  createFounderRuntimeFileHash,
  createFounderRuntimeSemanticDigest,
} from "./FounderRuntimeSemanticDigest.js";
import {
  applyPreparedActiveProtocolSuccessor,
  prepareActiveProtocolSuccessorTransition,
} from "./ActiveProtocolSuccessorService.js";
import {
  createProtocolRecurrenceIdentity,
  formatProtocolRecurrenceSummary,
  hydrateCadenceFromRecurrence,
  normalizeProtocolRecurrence,
} from "./ProtocolRecurrenceNormalizationService.js";
import {
  formatNextProtocolOccurrence,
  getNextProtocolOccurrence,
} from "./ProtocolOccurrenceResolver.js";

export const PROGRESS_PHOTOS_EXECUTION_ID = "execution_progress_photos";
export const PROGRESS_PHOTOS_REMINDER_ID = "reminder_weekly_progress_photo_set";

export function createProgressPhotosExecutionScheduleService({
  runtimeStorePath,
  liveStore,
  now = () => new Date(),
  createUnitOfWork = (options) => createFounderStoreUnitOfWork(options),
  readPersistedBaseline = () => readProgressPhotosPersistedBaseline(runtimeStorePath),
} = {}) {
  if (!runtimeStorePath || !liveStore) {
    throw new Error("Progress Photos scheduling requires a bound Founder store.");
  }
  return {
    hydrate() {
      const baseline = readPersistedBaseline();
      return createProgressPhotosExecutionHydrationModel(baseline.store, baseline);
    },
    prepare(command) {
      return prepareProgressPhotosScheduleSuccessor(liveStore, command, now());
    },
    async save(command) {
      let baseline;
      try {
        baseline = readPersistedBaseline();
      } catch (error) {
        return rejected("persistence_failure", error.message);
      }
      const conflict = validateCommandBaseline(baseline, command);
      if (conflict) return conflict;
      const immutableBaseline = structuredClone(baseline.store);
      const prepared = prepareProgressPhotosScheduleSuccessor(
        structuredClone(immutableBaseline), command, now());
      if (!prepared.ok || prepared.outcome === "unchanged") return prepared;
      const unit = createUnitOfWork({
        filePath: runtimeStorePath,
        liveStore,
        now,
        stageFrom: immutableBaseline,
        validatePersistedBaseline(current) {
          const fresh = readPersistedBaseline();
          return persistedBaselineMatches(current, fresh, baseline);
        },
      });
      const transaction = unit.begin();
      try {
        await transaction.mutate((store) => {
          const currentPreparation = prepareProgressPhotosScheduleSuccessor(store, command, now());
          if (!currentPreparation.ok || currentPreparation.outcome === "unchanged") {
            throw new ProgressPhotosScheduleFailure(
              currentPreparation.outcome,
              currentPreparation.reason ?? currentPreparation.outcome,
            );
          }
          applyPreparedProgressPhotosScheduleSuccessor(store, currentPreparation);
        });
        const committed = await transaction.commit({
          validateFinalized(candidate) {
            return verifyCandidate(candidate, prepared);
          },
        });
        return Object.freeze({
          outcome: "success",
          committed: true,
          revision: committed.revision,
          commitId: committed.commitId,
          protocolId: prepared.protocolId,
          successorVersionId: prepared.successorVersionId,
          nextOccurrence: prepared.nextOccurrence,
        });
      } catch (error) {
        const outcome = mapTransactionFailure(error);
        return Object.freeze({
          outcome,
          committed: error?.committed === true,
          reason: outcomeMessage(outcome),
        });
      }
    },
  };
}

export function createProgressPhotosExecutionHydrationModel(store, baseline = null) {
  const execution = store.executionItems?.find((item) => item.id === PROGRESS_PHOTOS_EXECUTION_ID);
  const root = store.protocols?.find((item) =>
    item.status === "active" && item.protocolType === "photos");
  const version = store.protocolVersions?.find((item) => item.id === root?.currentVersionId);
  const reminder = store.reminders?.find((item) => item.id === PROGRESS_PHOTOS_REMINDER_ID);
  if (!execution || !root || !version) return null;
  const recurrence = recurrenceFromVersion(version, root, execution, reminder);
  const nextOccurrence = getNextProtocolOccurrence(recurrence, recurrence.anchorDate);
  const intervalTwoRecurrence = normalizeProtocolRecurrence({
    ...recurrence, interval: 2,
  }, {
    fallbackTimezone: recurrence.timezone,
    fallbackAnchorDate: recurrence.anchorDate,
    effectiveAt: recurrence.effectiveAt,
  });
  const intervalTwoNextOccurrence = getNextProtocolOccurrence(
    intervalTwoRecurrence, intervalTwoRecurrence.anchorDate);
  return Object.freeze({
    item: {
      ...structuredClone(execution),
      supportStrategyLabel: "Supports your Progress Photos Strategy",
      cadence: {
        type: hydrateCadenceFromRecurrence(recurrence),
        interval: recurrence.interval,
      },
      preferredSchedule: {
        ...structuredClone(execution.preferredSchedule ?? {}),
        daysOfWeek: recurrence.weekdays,
        timeOfDay: recurrence.timeOfDay,
        timezone: recurrence.timezone,
        anchorDate: recurrence.anchorDate,
        nextDueAt: nextOccurrence?.scheduledLocalDate ?? null,
      },
      recurrence,
      recurrenceIdentity: createProtocolRecurrenceIdentity(recurrence),
      reminderEnabled: reminder?.active !== false,
      scheduleSummary: formatProtocolRecurrenceSummary(recurrence),
      nextOccurrenceSummary: formatNextProtocolOccurrence(nextOccurrence),
      intervalTwoNextDueAt: intervalTwoNextOccurrence?.scheduledLocalDate ?? null,
      intervalTwoNextOccurrenceSummary:
        formatNextProtocolOccurrence(intervalTwoNextOccurrence),
      schedulePreviews: {
        weekly: {
          summary: formatProtocolRecurrenceSummary(recurrence),
          next: formatNextProtocolOccurrence(nextOccurrence),
        },
        weekly_interval_2: {
          summary: formatProtocolRecurrenceSummary(intervalTwoRecurrence),
          next: formatNextProtocolOccurrence(intervalTwoNextOccurrence),
        },
      },
    },
    context: {
      protocolId: root.id,
      expectedCurrentVersionId: version.id,
      expectedRevision: baseline?.revision ?? getFounderStoreRevision(store),
      expectedSemanticDigest:
        baseline?.semanticDigest ?? createFounderRuntimeSemanticDigest(store),
      expectedLastCommitId: baseline?.lastCommitId ?? store.lastCommitId ?? null,
      expectedFileHash: baseline?.fileHash ?? null,
    },
  });
}

export function prepareProgressPhotosReminderEnablement(store, command = {}) {
  const reminder = store.reminders?.find((item) => item.id === PROGRESS_PHOTOS_REMINDER_ID);
  if (!reminder) {
    return rejected("not_found", "The Progress Photos reminder is unavailable.");
  }
  if (typeof command.enabled !== "boolean") {
    return rejected("invalid", "Choose whether Progress Photos reminders are enabled.");
  }
  if ((reminder.active !== false) === command.enabled) {
    return Object.freeze({
      ok: true,
      outcome: "unchanged",
      changed: false,
      enabled: command.enabled,
      reminderId: reminder.id,
    });
  }
  return Object.freeze({
    ok: true,
    outcome: "ready",
    changed: true,
    enabled: command.enabled,
    reminderId: reminder.id,
  });
}

export function applyPreparedProgressPhotosReminderEnablement(store, prepared) {
  const reminder = store.reminders?.find((item) => item.id === prepared.reminderId);
  if (!reminder) throw new Error("The Progress Photos reminder is unavailable.");
  reminder.active = prepared.enabled;
}

export function verifyPreparedProgressPhotosReminderEnablement(store, prepared) {
  const reminder = store.reminders?.find((item) => item.id === prepared.reminderId);
  return reminder?.active === prepared.enabled;
}

export function readProgressPhotosPersistedBaseline(runtimeStorePath) {
  const raw = fs.readFileSync(runtimeStorePath);
  const store = JSON.parse(raw.toString("utf8"));
  return Object.freeze({
    store,
    fileHash: createFounderRuntimeFileHash(raw),
    semanticDigest: createFounderRuntimeSemanticDigest(store),
    revision: getFounderStoreRevision(store),
    lastCommitId: store.lastCommitId ?? null,
  });
}

export function prepareProgressPhotosScheduleSuccessor(store, command, timestamp = new Date()) {
  const root = store.protocols?.find((item) => item.id === command.protocolId);
  const current = store.protocolVersions?.find((item) =>
    item.id === command.expectedCurrentVersionId && item.protocolId === root?.id);
  const execution = store.executionItems?.find((item) => item.id === PROGRESS_PHOTOS_EXECUTION_ID);
  const reminder = store.reminders?.find((item) => item.id === PROGRESS_PHOTOS_REMINDER_ID);
  if (!root || !current || !execution || !reminder) {
    return rejected("not_found", "The active Progress Photos schedule is unavailable.");
  }
  if (getFounderStoreRevision(store) !== Number(command.expectedRevision)
      || createFounderRuntimeSemanticDigest(store) !== command.expectedSemanticDigest) {
    return rejected("version_conflict", "The Progress Photos schedule changed while editing.");
  }
  let recurrence;
  try {
    recurrence = normalizeProtocolRecurrence(command.recurrence, {
      fallbackTimezone: "America/Los_Angeles",
      fallbackAnchorDate: "2026-07-25",
      effectiveAt: command.effectiveDate,
    });
  } catch (error) {
    return rejected("invalid", error.message);
  }
  const existing = recurrenceFromVersion(current, root, execution, reminder);
  if (createProtocolRecurrenceIdentity(existing) === createProtocolRecurrenceIdentity(recurrence)) {
    return Object.freeze({ ok: true, outcome: "unchanged", committed: false, recurrence });
  }
  const nextOccurrence = getNextProtocolOccurrence(recurrence, recurrence.anchorDate);
  if (!nextOccurrence) return rejected("invalid", "The next occurrence could not be resolved.");
  const successorPayload = {
    intent: current.intent?.summary ? structuredClone(current.intent)
      : { summary: "Capture comparable progress photos." },
    expectations: structuredClone(current.expectations ?? []),
    evaluationWindows: structuredClone(current.evaluationWindows ?? []),
    coachingPolicy: structuredClone(current.coachingPolicy ?? {}),
    reviewTriggers: structuredClone(current.reviewTriggers ?? []),
    evidenceBasis: structuredClone(current.evidenceBasis ?? {}),
    phaseContext: structuredClone(current.phaseContext ?? null),
    recurrence,
    recurrenceIdentity: createProtocolRecurrenceIdentity(recurrence),
    change: {
      reviewedChanges: {
        ...(structuredClone(current.change?.reviewedChanges ?? {})),
        recurrence,
      },
    },
  };
  const transition = prepareActiveProtocolSuccessorTransition(store, {
    protocolId: root.id,
    expectedCurrentVersionId: current.id,
    effectiveDate: command.effectiveDate,
    successorVersion: successorPayload,
    goalAssociation: current.goalLinks?.[0],
    provenance: {
      author: command.author,
      reason: "Update Progress Photos execution schedule.",
      confirmation: { confirmedByUser: true, authority: "founder_confirmation" },
      details: { source: "progress_photos_execution_editor" },
    },
  }, timestamp);
  if (!transition.ok) return rejected(transition.outcome, transition.reason);
  return Object.freeze({
    ok: true,
    outcome: "ready",
    protocolId: root.id,
    currentVersionId: current.id,
    successorVersionId: transition.successor.id,
    recurrence,
    recurrenceIdentity: successorPayload.recurrenceIdentity,
    nextOccurrence,
    successorTransition: transition,
    executionId: execution.id,
    reminderId: reminder.id,
  });
}

function recurrenceFromVersion(version, root, execution, reminder) {
  return normalizeProtocolRecurrence(
    version.recurrence ?? version.change?.reviewedChanges?.recurrence ??
      reminder?.schedule ?? {
        type: execution.cadence?.type,
        interval: execution.cadence?.interval,
        daysOfWeek: execution.preferredSchedule?.daysOfWeek,
        timeOfDay: execution.preferredSchedule?.timeOfDay,
      },
    {
      fallbackTimezone: reminder?.schedule?.timezone ?? "America/Los_Angeles",
      fallbackAnchorDate: reminder?.schedule?.anchorDate ??
        reminder?.completionHistory?.[0]?.evidenceDate ?? "2026-07-25",
      effectiveAt: version.effectiveAt ?? root.activatedAt,
    },
  );
}
function reconcileProjection(store, prepared) {
  const item = store.executionItems.find((entry) => entry.id === prepared.executionId);
  item.cadence = {
    type: "weekly",
    interval: prepared.recurrence.interval,
    recurrenceVersion: prepared.recurrence.recurrenceVersion,
  };
  item.preferredSchedule = {
    ...(item.preferredSchedule ?? {}),
    daysOfWeek: prepared.recurrence.weekdays,
    timeOfDay: prepared.recurrence.timeOfDay,
    timezone: prepared.recurrence.timezone,
    anchorDate: prepared.recurrence.anchorDate,
    nextDueAt: prepared.nextOccurrence.scheduledLocalDate,
  };
  item.protocolRootId = prepared.protocolId;
  item.protocolVersionId = prepared.successorVersionId;
}

export function applyPreparedProgressPhotosScheduleSuccessor(store, prepared) {
  applyPreparedActiveProtocolSuccessor(store, prepared.successorTransition);
  reconcileProjection(store, prepared);
  reconcileReminder(store, prepared);
}

export function verifyPreparedProgressPhotosScheduleSuccessor(store, prepared) {
  return verifyCandidate(store, prepared);
}
function reconcileReminder(store, prepared) {
  const reminder = store.reminders.find((entry) => entry.id === prepared.reminderId);
  reminder.schedule = {
    ...(reminder.schedule ?? {}),
    type: "weekly",
    cadence: "weekly",
    frequency: "weekly",
    interval: prepared.recurrence.interval,
    unit: "week",
    daysOfWeek: prepared.recurrence.weekdays,
    preferredDay: prepared.recurrence.weekdays[0],
    dayOfWeek: prepared.recurrence.weekdays[0],
    timeOfDay: prepared.recurrence.timeOfDay,
    timezone: prepared.recurrence.timezone,
    anchorDate: prepared.recurrence.anchorDate,
    recurrenceVersion: prepared.recurrence.recurrenceVersion,
  };
  reminder.nextDueAt = prepared.nextOccurrence.scheduledLocalDate;
}
function verifyCandidate(store, prepared) {
  const root = store.protocols.find((item) => item.id === prepared.protocolId);
  const versions = store.protocolVersions.filter((item) => item.protocolId === prepared.protocolId);
  const reminder = store.reminders.find((item) => item.id === prepared.reminderId);
  return root?.currentVersionId === prepared.successorVersionId
    && versions.filter((item) => item.status === "active" && !item.endedAt).length === 1
    && reminder?.schedule?.interval === prepared.recurrence.interval
    && reminder?.nextDueAt === prepared.nextOccurrence.scheduledLocalDate;
}
function validateCommandBaseline(baseline, command) {
  const root = baseline.store.protocols?.find((item) => item.id === command.protocolId);
  if (root?.currentVersionId !== command.expectedCurrentVersionId) {
    return rejected(
      "current_version_conflict",
      "The Progress Photos schedule changed. Reload it before saving.",
    );
  }
  if (
    baseline.revision !== Number(command.expectedRevision) ||
    baseline.semanticDigest !== command.expectedSemanticDigest ||
    (command.expectedLastCommitId &&
      baseline.lastCommitId !== command.expectedLastCommitId) ||
    (command.expectedFileHash && baseline.fileHash !== command.expectedFileHash)
  ) {
    return rejected(
      "baseline_conflict",
      "The plan changed while you were editing. Reload it before saving.",
    );
  }
  return null;
}
function persistedBaselineMatches(current, fresh, expected) {
  return (
    getFounderStoreRevision(current) === expected.revision &&
    createFounderRuntimeSemanticDigest(current) === expected.semanticDigest &&
    fresh.revision === expected.revision &&
    fresh.semanticDigest === expected.semanticDigest &&
    fresh.lastCommitId === expected.lastCommitId &&
    fresh.fileHash === expected.fileHash
  );
}
function mapTransactionFailure(error) {
  const scheduleFailure = findScheduleFailure(error);
  if (scheduleFailure) {
    return scheduleFailure.outcome === "version_conflict"
      ? "current_version_conflict"
      : scheduleFailure.outcome;
  }
  if (error?.committed === true) return "committed_publication_failure";
  if (error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT) {
    return "baseline_conflict";
  }
  if (error?.code === FounderStoreUnitOfWorkErrorCode.VALIDATION_FAILED) {
    return /persisted baseline/i.test(error.message)
      ? "baseline_conflict"
      : "validation_failure";
  }
  return "persistence_failure";
}
function outcomeMessage(outcome) {
  if (outcome === "baseline_conflict") {
    return "The plan changed while you were editing. Reload it before saving.";
  }
  if (outcome === "committed_publication_failure") {
    return "The schedule was saved, but the page could not refresh automatically.";
  }
  return "We could not update the Progress Photos schedule. Nothing was changed.";
}
function rejected(outcome, reason) {
  return Object.freeze({ ok: false, outcome, committed: false, reason });
}
function findScheduleFailure(error) {
  let current = error;
  while (current) {
    if (current instanceof ProgressPhotosScheduleFailure) return current;
    current = current.cause;
  }
  return null;
}
class ProgressPhotosScheduleFailure extends Error {
  constructor(outcome, message) {
    super(message);
    this.name = "ProgressPhotosScheduleFailure";
    this.outcome = outcome;
  }
}
