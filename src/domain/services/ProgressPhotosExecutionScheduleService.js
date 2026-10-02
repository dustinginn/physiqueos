import fs from "node:fs";
import {
  FounderStoreUnitOfWorkErrorCode,
  createFounderStoreUnitOfWork,
  getFounderStoreRevision,
} from "../../data/repositories/FounderStoreUnitOfWork.js";
import {
  createFounderRuntimeFileHash,
  createProgressPhotosScheduleSemanticDigest,
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
  getProtocolOccurrenceOnOrAfter,
  getProtocolOccurrenceOnOrBefore,
  protocolLocalDateKey,
  resolveCadenceChangeAnchor,
} from "./ProtocolOccurrenceResolver.js";
import { progressPhotoCadenceFields } from "./ProgressPhotosCadence.js";

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
      return createProgressPhotosExecutionHydrationModel(baseline.store, baseline, { now: now() });
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

export function createProgressPhotosExecutionHydrationModel(store, baseline = null, {
  now = new Date(),
} = {}) {
  const execution = store.executionItems?.find((item) => item.id === PROGRESS_PHOTOS_EXECUTION_ID);
  const root = store.protocols?.find((item) =>
    item.status === "active" && item.protocolType === "photos");
  const version = store.protocolVersions?.find((item) => item.id === root?.currentVersionId);
  const reminder = store.reminders?.find((item) => item.id === PROGRESS_PHOTOS_REMINDER_ID);
  if (!execution || !root || !version) return null;
  const recurrence = recurrenceFromVersion(version, root, execution, reminder);
  // The next occurrence is counted from today (on or after), not from the
  // anchor: an old anchor would otherwise report a long-past "next" date.
  const today = protocolLocalDateKey(now, recurrence.timezone);
  const nextOccurrence = getProtocolOccurrenceOnOrAfter(recurrence, today);
  // The legacy Web execution editor's Once a week / Every 2 weeks previews,
  // resolved exactly as a save would re-anchor them. Only meaningful for a
  // weekly recurrence; that editor refuses to save any other cadence.
  const weeklyPreview = (interval) => {
    if (recurrence.frequency !== "weekly") return null;
    let candidate = normalizeProtocolRecurrence({ ...recurrence, interval }, {
      fallbackTimezone: recurrence.timezone,
      fallbackAnchorDate: recurrence.anchorDate,
      effectiveAt: recurrence.effectiveAt,
    });
    if (cadencePatternChanged(recurrence, candidate)) {
      const anchorDate = resolveCadenceChangeAnchor(recurrence, candidate, today);
      if (!anchorDate) return null;
      candidate = Object.freeze({ ...candidate, anchorDate });
    }
    return { recurrence: candidate, next: getProtocolOccurrenceOnOrAfter(candidate, today) };
  };
  const intervalOnePreview = weeklyPreview(1);
  const intervalTwoPreview = weeklyPreview(2);
  const intervalTwoRecurrence = intervalTwoPreview?.recurrence ?? null;
  const intervalTwoNextOccurrence = intervalTwoPreview?.next ?? null;
  return Object.freeze({
    item: {
      ...structuredClone(execution),
      supportStrategyLabel: "Supports your Progress Photos Strategy",
      cadence: {
        type: hydrateCadenceFromRecurrence(recurrence),
        interval: recurrence.interval,
      },
      cadenceFields: progressPhotoCadenceFields(recurrence),
      preferredSchedule: {
        ...structuredClone(execution.preferredSchedule ?? {}),
        daysOfWeek: recurrence.weekdays,
        timeOfDay: recurrence.timeOfDay,
        timezone: recurrence.timezone,
        anchorDate: recurrence.anchorDate,
        nextDueAt: nextOccurrence?.scheduledLocalDate ?? null,
        // The most recent scheduled occurrence on or before today (null
        // before the first one); Native's change preview continues from it.
        lastDueAt: getProtocolOccurrenceOnOrBefore(recurrence, today)?.scheduledLocalDate ?? null,
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
        weekly: intervalOnePreview ? {
          summary: formatProtocolRecurrenceSummary(intervalOnePreview.recurrence),
          next: formatNextProtocolOccurrence(intervalOnePreview.next),
        } : {
          summary: formatProtocolRecurrenceSummary(recurrence),
          next: formatNextProtocolOccurrence(nextOccurrence),
        },
        ...(intervalTwoRecurrence ? {
          weekly_interval_2: {
            summary: formatProtocolRecurrenceSummary(intervalTwoRecurrence),
            next: formatNextProtocolOccurrence(intervalTwoNextOccurrence),
          },
        } : {}),
      },
    },
    context: {
      protocolId: root.id,
      expectedCurrentVersionId: version.id,
      expectedRevision: baseline?.revision ?? getFounderStoreRevision(store),
      expectedSemanticDigest:
        baseline?.semanticDigest ?? createProgressPhotosScheduleSemanticDigest(store),
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
    semanticDigest: createProgressPhotosScheduleSemanticDigest(store),
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
      || createProgressPhotosScheduleSemanticDigest(store) !== command.expectedSemanticDigest) {
    return rejected("version_conflict", "The Progress Photos schedule changed while editing.");
  }
  let recurrence;
  let existing;
  try {
    recurrence = normalizeProtocolRecurrence(command.recurrence, {
      fallbackTimezone: "America/Los_Angeles",
      fallbackAnchorDate: "2026-07-25",
      effectiveAt: command.effectiveDate,
    });
    existing = recurrenceFromVersion(current, root, execution, reminder);
  } catch (error) {
    return rejected("invalid", error.message);
  }
  const today = protocolLocalDateKey(timestamp, recurrence.timezone);
  if (cadencePatternChanged(existing, recurrence)) {
    // A cadence change is future-only and starts predictably (see
    // resolveCadenceChangeAnchor); an unchanged pattern keeps its anchor.
    const anchorDate = resolveCadenceChangeAnchor(existing, recurrence, today);
    if (!anchorDate) return rejected("invalid", "The next occurrence could not be resolved.");
    recurrence = Object.freeze({ ...recurrence, anchorDate });
  }
  if (createProtocolRecurrenceIdentity(existing) === createProtocolRecurrenceIdentity(recurrence)) {
    return Object.freeze({ ok: true, outcome: "unchanged", committed: false, recurrence });
  }
  const nextOccurrence = getProtocolOccurrenceOnOrAfter(recurrence, today);
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
  // A second schedule save on the current version's own (today/future)
  // effective date amends that version with audited provenance, mirroring
  // Coaching Updates; an equal-date successor is impossible. Older versions
  // stay immutable: their dates still go through the successor validator.
  const currentEffectiveDate = String(current.effectiveAt ?? "").slice(0, 10);
  if (currentEffectiveDate === command.effectiveDate && command.effectiveDate >= today) {
    const amendment = prepareSameDateScheduleAmendment(store, {
      root, current, successorPayload, command, timestamp,
    });
    if (!amendment.ok) return amendment;
    return Object.freeze({
      ok: true,
      outcome: "ready",
      protocolId: root.id,
      currentVersionId: current.id,
      successorVersionId: current.id,
      recurrence,
      recurrenceIdentity: successorPayload.recurrenceIdentity,
      nextOccurrence,
      amendment,
      executionId: execution.id,
      reminderId: reminder.id,
    });
  }
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
function prepareSameDateScheduleAmendment(store, { root, current, successorPayload, command, timestamp }) {
  const active = store.protocolVersions.filter((item) =>
    item.protocolId === root.id && item.status === "active" && !item.endedAt);
  if (root.status !== "active" || root.currentVersionId !== current.id
      || current.status !== "active" || current.endedAt
      || active.length !== 1 || active[0].id !== current.id) {
    return rejected("current_version_conflict", "The Progress Photos schedule changed. Reload it before saving.");
  }
  if (!command.author?.id) return rejected("invalid", "An explicit author is required.");
  const amendedAt = timestamp.toISOString();
  return Object.freeze({
    ok: true,
    timestamp: amendedAt,
    amended: {
      ...structuredClone(current),
      recurrence: successorPayload.recurrence,
      recurrenceIdentity: successorPayload.recurrenceIdentity,
      change: {
        ...(structuredClone(current.change ?? {})),
        reviewedChanges: {
          ...(structuredClone(current.change?.reviewedChanges ?? {})),
          recurrence: successorPayload.recurrence,
        },
        sameDayAmendments: [
          ...(structuredClone(current.change?.sameDayAmendments ?? [])),
          {
            amendedAt,
            reason: "Update Progress Photos execution schedule.",
            author: structuredClone(command.author),
            provenance: { source: command.source ?? "progress_photos_schedule" },
            previousRecurrence: structuredClone(current.recurrence ?? null),
            previousRecurrenceIdentity: current.recurrenceIdentity ?? null,
          },
        ],
      },
      updatedAt: amendedAt,
    },
  });
}
/// Interval, unit, weekday, or week-of-month changes re-anchor; time-only,
/// reminder-only, and identical saves do not.
function cadencePatternChanged(existing, requested) {
  return existing.frequency !== requested.frequency
    || existing.interval !== requested.interval
    || existing.weekdays.join(",") !== requested.weekdays.join(",")
    || (existing.weekOfMonth ?? null) !== (requested.weekOfMonth ?? null);
}
function reconcileProjection(store, prepared) {
  const item = store.executionItems.find((entry) => entry.id === prepared.executionId);
  const monthly = prepared.recurrence.frequency === "monthly";
  item.cadence = {
    type: monthly ? "monthly" : "weekly",
    interval: prepared.recurrence.interval,
    ...(monthly ? { unit: "month", weekOfMonth: prepared.recurrence.weekOfMonth } : {}),
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
  if (prepared.amendment) {
    const current = store.protocolVersions.find((item) => item.id === prepared.currentVersionId);
    const root = store.protocols.find((item) => item.id === prepared.protocolId);
    Object.assign(current, structuredClone(prepared.amendment.amended));
    Object.assign(root, { updatedAt: prepared.amendment.timestamp });
  } else {
    applyPreparedActiveProtocolSuccessor(store, prepared.successorTransition);
  }
  reconcileProjection(store, prepared);
  reconcileReminder(store, prepared);
}

export function verifyPreparedProgressPhotosScheduleSuccessor(store, prepared) {
  return verifyCandidate(store, prepared);
}
function reconcileReminder(store, prepared) {
  const reminder = store.reminders.find((entry) => entry.id === prepared.reminderId);
  const frequency = prepared.recurrence.frequency === "monthly" ? "monthly" : "weekly";
  const { weekOfMonth: _staleWeekOfMonth, ...previousSchedule } = reminder.schedule ?? {};
  reminder.schedule = {
    ...previousSchedule,
    type: frequency,
    cadence: frequency,
    frequency,
    interval: prepared.recurrence.interval,
    unit: frequency === "monthly" ? "month" : "week",
    ...(frequency === "monthly" ? { weekOfMonth: prepared.recurrence.weekOfMonth } : {}),
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
    && reminder?.schedule?.frequency === prepared.recurrence.frequency
    && (reminder?.schedule?.weekOfMonth ?? null) === (prepared.recurrence.weekOfMonth ?? null)
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
    createProgressPhotosScheduleSemanticDigest(current) === expected.semanticDigest &&
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
