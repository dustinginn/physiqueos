import {
  FounderStoreUnitOfWorkErrorCode,
  createFounderStoreUnitOfWork,
  getFounderStoreRevision,
} from "../../data/repositories/FounderStoreUnitOfWork.js";
import { createCoachingUpdatesSemanticDigest } from "./FounderRuntimeSemanticDigest.js";
import {
  CoachingUpdatesTransactionOutcome,
  applyPreparedCoachingUpdatesTransaction,
  prepareCoachingUpdatesTransaction,
  verifyPreparedCoachingUpdatesTransaction,
} from "./CoachingUpdatesTransactionService.js";
import {
  applyPreparedProgressPhotosReminderEnablement,
  applyPreparedProgressPhotosScheduleSuccessor,
  prepareProgressPhotosReminderEnablement,
  prepareProgressPhotosScheduleSuccessor,
  verifyPreparedProgressPhotosReminderEnablement,
  verifyPreparedProgressPhotosScheduleSuccessor,
} from "./ProgressPhotosExecutionScheduleService.js";
import {
  DexaAppointmentOutcome,
  applyPreparedDexaAppointmentUpdate,
  prepareDexaAppointmentUpdate,
  verifyPreparedDexaAppointmentUpdate,
} from "./DexaAppointmentManagementService.js";

export const CoachingUpdatesStrategyOutcome = Object.freeze({
  SUCCESS: "success",
  UNCHANGED: "unchanged_configuration",
  INVALID: "invalid",
  CONCURRENCY_CONFLICT: "concurrency_conflict",
  VERIFICATION_FAILURE: "verification_failure",
  PERSISTENCE_FAILURE: "persistence_failure",
  PUBLICATION_FAILURE: "publication_failure",
});

export function createCoachingUpdatesStrategyManagementService({
  runtimeStorePath,
  liveStore,
  now = () => new Date(),
  createUnitOfWork = (options) => createFounderStoreUnitOfWork(options),
} = {}) {
  if (!runtimeStorePath || !liveStore) throw new Error("Coaching Updates strategy requires a bound Founder store.");
  return {
    async save(command = {}) {
      if (createCoachingUpdatesSemanticDigest(liveStore) !== command.expectedSemanticDigest) {
        return failure(CoachingUpdatesStrategyOutcome.CONCURRENCY_CONFLICT, "The plan changed while you were editing. Reload and try again.");
      }
      const currentCommand = {
        ...command,
        expectedRevision: getFounderStoreRevision(liveStore),
        photos: command.photos
          ? { ...command.photos, expectedRevision: getFounderStoreRevision(liveStore) }
          : command.photos,
      };
      const unit = createUnitOfWork({ filePath: runtimeStorePath, liveStore, now, stageFrom: liveStore });
      const transaction = unit.begin();
      try {
        const staged = await transaction.mutate((store) => {
          const prepared = prepareCoachingUpdatesStrategyTransition(store, currentCommand, now());
          if (!prepared.ok) throw typed(prepared.outcome, prepared.reason);
          applyPreparedCoachingUpdatesStrategyTransition(store, prepared);
          return prepared;
        });
        const committed = await transaction.commit({
          validateFinalized(store) {
            return verifyPreparedCoachingUpdatesStrategyTransition(store, currentCommand, staged);
          },
        });
        return Object.freeze({
          outcome: CoachingUpdatesStrategyOutcome.SUCCESS,
          committed: true,
          revision: committed.revision,
          commitId: committed.commitId,
          coachingChanged: staged.coachingChanged,
          photosChanged: staged.photosChanged,
          photoReminderChanged: staged.photoReminderChanged,
          dexaChanged: staged.dexaChanged,
        });
      } catch (error) {
        const own = findTyped(error);
        if (own) return failure(own.outcome, own.message);
        if (error?.committed) return failure(CoachingUpdatesStrategyOutcome.PUBLICATION_FAILURE, "The strategy saved but could not refresh.", true);
        return failure(error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT
          ? CoachingUpdatesStrategyOutcome.CONCURRENCY_CONFLICT
          : CoachingUpdatesStrategyOutcome.PERSISTENCE_FAILURE,
        "We could not save Coaching Updates. Nothing was changed.");
      }
    },
  };
}

/// The transport-independent composite transition used by both the Web
/// file/runtime unit of work above and canonical Native persistence. This
/// deliberately keeps Coaching Updates, Progress Photos, the photo
/// reminder, and DEXA in one preparation/apply/verification boundary.
export function prepareCoachingUpdatesStrategyTransition(store, command = {}, timestamp = new Date()) {
  // The semantic digest and the individual protocol/execution versions below
  // are Coaching's real concurrency fences. The Founder store revision is a
  // runtime-wide serialization counter: an unrelated Evidence worker can
  // advance it while this editor is open without changing any Coaching,
  // Progress Photos, reminder, or DEXA input. Requiring the stale client
  // revision here caused false all-or-nothing conflicts. The persistence
  // transaction still locks and advances the CURRENT runtime revision.
  if (createCoachingUpdatesSemanticDigest(store) !== command.expectedSemanticDigest) {
    return rejected(CoachingUpdatesStrategyOutcome.CONCURRENCY_CONFLICT,
      "The plan changed while you were editing. Reload and try again.");
  }
  const protectedBefore = protectedState(store);
  const coaching = prepareCoachingUpdatesTransaction(store, command.coaching, timestamp);
  if (!coaching.ok && coaching.outcome !== CoachingUpdatesTransactionOutcome.UNCHANGED_CONFIGURATION) {
    return rejected(coaching.outcome, coaching.reason);
  }
  const photos = prepareProgressPhotosScheduleSuccessor(store, command.photos, timestamp);
  if (!photos.ok) return rejected(photos.outcome, photos.reason);
  const photoReminder = prepareProgressPhotosReminderEnablement(store, {
    enabled: command.photos?.reminderEnabled,
  });
  if (!photoReminder.ok) return rejected(photoReminder.outcome, photoReminder.reason);
  const dexa = prepareDexaAppointmentUpdate(store, command.dexa, timestamp, {
    // A completed appointment is DEXA history, not a mandatory future
    // appointment. Unrelated Coaching/Briefing changes remain atomic without
    // forcing the Founder to schedule the next scan in the same save.
    requireAppointment: false,
    preserveExistingFields: false,
  });
  if (!dexa.ok && dexa.outcome !== DexaAppointmentOutcome.UNCHANGED) {
    return rejected(dexa.outcome, dexa.reason);
  }
  const coachingChanged = coaching.ok;
  const photosChanged = photos.outcome !== "unchanged";
  const photoReminderChanged = photoReminder.changed;
  const dexaChanged = dexa.ok;
  if (!coachingChanged && !photosChanged && !photoReminderChanged && !dexaChanged) {
    return rejected(CoachingUpdatesStrategyOutcome.UNCHANGED, "No changes to save.");
  }
  return Object.freeze({
    ok: true,
    coaching, photos, photoReminder, dexa, coachingChanged, photosChanged,
    photoReminderChanged, dexaChanged, protectedBefore,
  });
}

export function applyPreparedCoachingUpdatesStrategyTransition(store, prepared) {
  if (!prepared?.ok) throw new Error("A prepared Coaching Updates transition is required.");
  if (prepared.coachingChanged) applyPreparedCoachingUpdatesTransaction(store, prepared.coaching);
  if (prepared.photosChanged) applyPreparedProgressPhotosScheduleSuccessor(store, prepared.photos);
  if (prepared.photoReminderChanged) {
    applyPreparedProgressPhotosReminderEnablement(store, prepared.photoReminder);
  }
  if (prepared.dexaChanged) applyPreparedDexaAppointmentUpdate(store, prepared.dexa);
  if (!same(prepared.protectedBefore, protectedState(store))) {
    throw typed(CoachingUpdatesStrategyOutcome.VERIFICATION_FAILURE,
      "Protected evidence or completion history changed.");
  }
  return Object.freeze({
    coachingChanged: prepared.coachingChanged,
    photosChanged: prepared.photosChanged,
    photoReminderChanged: prepared.photoReminderChanged,
    dexaChanged: prepared.dexaChanged,
  });
}

export function verifyPreparedCoachingUpdatesStrategyTransition(store, command, prepared) {
  if (!prepared?.ok || !same(prepared.protectedBefore, protectedState(store))) return false;
  if (prepared.coachingChanged && !verifyPreparedCoachingUpdatesTransaction(
    store, command.coaching, prepared.coaching.resultVersionId)) return false;
  if (prepared.photosChanged && !verifyPreparedProgressPhotosScheduleSuccessor(store, prepared.photos)) return false;
  if (prepared.photoReminderChanged &&
      !verifyPreparedProgressPhotosReminderEnablement(store, prepared.photoReminder)) return false;
  if (prepared.dexaChanged && !verifyPreparedDexaAppointmentUpdate(store, prepared.dexa)) return false;
  return true;
}

function protectedState(store) {
  return {
    dexaScans: structuredClone(store.dexaScans ?? []),
    progressPhotos: structuredClone(store.progressPhotos ?? []),
    canonicalEvidenceObjects: structuredClone(store.canonicalEvidenceObjects ?? []),
    evidenceReviews: structuredClone(store.evidenceReviews ?? []),
    dailyBriefings: structuredClone(store.dailyBriefings ?? []),
    photoExecutionHistory: structuredClone(store.executionItems?.find((item) => item.id === "execution_progress_photos")?.completionHistory ?? []),
    photoReminderHistory: structuredClone(store.reminders?.find((item) => item.id === "reminder_weekly_progress_photo_set")?.completionHistory ?? []),
    dexaAppointmentHistory: structuredClone(store.executionItems?.find((item) => item.id === "execution_next_dexa")?.completionHistory ?? []),
    dexaHistory: structuredClone(store.executionItems?.find((item) => item.id === "execution_dexa") ?? null),
  };
}
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function typed(outcome, message) { const error = new Error(message); error.coachingStrategyOutcome = outcome; return error; }
function findTyped(error) { let current = error; while (current) { if (current.coachingStrategyOutcome) return { outcome: current.coachingStrategyOutcome, message: current.message }; current = current.cause; } return null; }
function failure(outcome, reason, committed = false) { return Object.freeze({ outcome, reason, committed }); }
function rejected(outcome, reason) { return Object.freeze({ ok: false, outcome, reason }); }
