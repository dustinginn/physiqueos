import {
  FounderStoreUnitOfWorkErrorCode,
  createFounderStoreUnitOfWork,
  getFounderStoreRevision,
} from "../../data/repositories/FounderStoreUnitOfWork.js";
import { createFounderRuntimeSemanticDigest } from "./FounderRuntimeSemanticDigest.js";
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
      if (getFounderStoreRevision(liveStore) !== Number(command.expectedRevision) ||
          createFounderRuntimeSemanticDigest(liveStore) !== command.expectedSemanticDigest) {
        return failure(CoachingUpdatesStrategyOutcome.CONCURRENCY_CONFLICT, "The plan changed while you were editing. Reload and try again.");
      }
      const unit = createUnitOfWork({ filePath: runtimeStorePath, liveStore, now, stageFrom: liveStore });
      const transaction = unit.begin();
      try {
        const staged = await transaction.mutate((store) => {
          const protectedBefore = protectedState(store);
          const coaching = prepareCoachingUpdatesTransaction(store, command.coaching, now());
          if (!coaching.ok && coaching.outcome !== CoachingUpdatesTransactionOutcome.UNCHANGED_CONFIGURATION) {
            throw typed(coaching.outcome, coaching.reason);
          }
          const photos = prepareProgressPhotosScheduleSuccessor(store, command.photos, now());
          if (!photos.ok) throw typed(photos.outcome, photos.reason);
          const photoReminder = prepareProgressPhotosReminderEnablement(store, {
            enabled: command.photos?.reminderEnabled,
          });
          if (!photoReminder.ok) throw typed(photoReminder.outcome, photoReminder.reason);
          const dexa = prepareDexaAppointmentUpdate(store, command.dexa, now(), {
            requireAppointment: true,
            preserveExistingFields: false,
          });
          if (!dexa.ok && dexa.outcome !== DexaAppointmentOutcome.UNCHANGED) {
            throw typed(dexa.outcome, dexa.reason);
          }
          const coachingChanged = coaching.ok;
          const photosChanged = photos.outcome !== "unchanged";
          const photoReminderChanged = photoReminder.changed;
          const dexaChanged = dexa.ok;
          if (!coachingChanged && !photosChanged && !photoReminderChanged && !dexaChanged) {
            throw typed(CoachingUpdatesStrategyOutcome.UNCHANGED, "No changes to save.");
          }
          if (coachingChanged) applyPreparedCoachingUpdatesTransaction(store, coaching);
          if (photosChanged) applyPreparedProgressPhotosScheduleSuccessor(store, photos);
          if (photoReminderChanged) {
            applyPreparedProgressPhotosReminderEnablement(store, photoReminder);
          }
          if (dexaChanged) applyPreparedDexaAppointmentUpdate(store, dexa);
          if (!same(protectedBefore, protectedState(store))) {
            throw typed(CoachingUpdatesStrategyOutcome.VERIFICATION_FAILURE, "Protected evidence or completion history changed.");
          }
          return {
            coaching, photos, photoReminder, dexa, coachingChanged, photosChanged,
            photoReminderChanged, dexaChanged,
            protectedBefore,
          };
        });
        const committed = await transaction.commit({
          validateFinalized(store) {
            if (!same(staged.protectedBefore, protectedState(store))) return false;
            if (staged.coachingChanged && !verifyPreparedCoachingUpdatesTransaction(
              store, command.coaching, staged.coaching.successor.successor.id)) return false;
            if (staged.photosChanged && !verifyPreparedProgressPhotosScheduleSuccessor(store, staged.photos)) return false;
            if (staged.photoReminderChanged &&
                !verifyPreparedProgressPhotosReminderEnablement(store, staged.photoReminder)) return false;
            if (staged.dexaChanged && !verifyPreparedDexaAppointmentUpdate(store, staged.dexa)) return false;
            return true;
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
