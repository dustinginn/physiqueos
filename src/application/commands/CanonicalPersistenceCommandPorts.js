import {
  bindTrainingSupportingEvidencePackage,
  reconcileConfirmedEvidencePackage,
} from "../../domain/services/CanonicalEvidenceService.js";
import { ApplicationProblem, staleVersionProblem } from "../../contracts/v1/problem.js";
import {
  MORNING_CHECK_IN_BOUNDED_COLLECTIONS,
  MORNING_CHECK_IN_BOUNDED_READ_COLLECTIONS,
  createMorningCheckInPersistenceService,
} from "../../domain/services/MorningCheckInPersistenceService.js";
import { createPILowerLevelCanonicalEvidenceCommitService } from "../../domain/services/PILowerLevelCanonicalEvidenceCommitService.js";
import {
  createCommittedTrainingPerformanceAnalysis,
  reconcileTrainingPerformanceEvents,
} from "../training/TrainingPerformanceEventReconciliation.js";
import { createTrainingPerformanceEventPersistenceService } from "../../domain/services/TrainingPerformanceEventPersistenceService.js";
import { isPITrainingConfidenceEnqueueEnabled } from "../../domain/services/PILowerLevelConfidenceWorkEnqueueService.js";
import {
  buildTrainingLoggerEvidencePackage,
  createProductionAppleHealthReconciliation,
} from "../../domain/services/TrainingLoggerAppleHealthService.js";
import { listCanonicalTrainingExerciseIdentities } from "../../domain/models/trainingExerciseIdentity.js";
import { normalizeTrainingExecutionVariant } from "../../domain/models/trainingExecutionVariant.js";
import { createTrainingExerciseRelationshipGroup } from "../../domain/models/trainingExerciseRelationship.js";
import {
  createCanonicalExerciseDefinition,
  findCanonicalExerciseConflict,
  findCanonicalExerciseConflicts,
} from "../../domain/services/CanonicalExerciseLibraryService.js";
import { applyDexaReviewMeasurements } from "../../domain/services/DexaPdfIntakeService.js";
import { assertValidDexaScan } from "../../domain/services/DEXAContract.js";
import { createReminderRepository } from "../../data/repositories/ReminderRepository.js";
import {
  createPriorityOccurrenceKey,
  isReminderOccurrenceCompleted,
  resolvePriorityExecutionContract,
} from "../../domain/services/ReminderOccurrenceCompletion.js";
import {
  HealthKitObservationError,
  HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
  HealthKitObservationType,
  HealthKitReconciliationState,
  assessHealthKitCanonicalization,
  createHealthKitObservationRecord,
  isCompatibleHealthKitReplay,
  normalizeHealthKitObservationBatch,
  reconcileHealthKitWorkoutObservation,
  resolveHealthKitCanonicalActivationPolicy,
  HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID,
  assessHealthKitWorkoutCanonicalization,
  resolveHealthKitWorkoutActivationPolicy,
} from "../../domain/services/HealthKitObservationService.js";
import {
  HEALTHKIT_CANONICAL_WORKOUT_COLLECTION,
  HealthKitWorkoutFamily,
  classifyHealthKitWorkoutType,
  deriveHealthKitWorkoutLocalDate,
  getHealthKitCanonicalWorkoutRecordId,
  reconcileHealthKitCanonicalWorkout,
} from "../../domain/services/HealthKitWorkoutService.js";
import {
  HEALTHKIT_WORKOUT_LINK_COLLECTION,
  HealthKitStrengthMatchOutcome,
  HealthKitWorkoutLinkStatus,
  assessHealthKitCardioCoexistence,
  assessHealthKitStrengthLinkCandidates,
  createHealthKitWorkoutLinkCandidate,
  findPossibleDuplicateCanonicalWorkouts,
  refreshHealthKitWorkoutLinkCandidate,
  unlinkHealthKitWorkoutLink,
} from "../../domain/services/HealthKitWorkoutLinkService.js";
import {
  HEALTHKIT_CANONICAL_DAY_COLLECTION,
  HealthKitCanonicalDomain,
  getHealthKitCanonicalDayRecordId,
  reconcileHealthKitCanonicalDay,
} from "../../domain/services/HealthKitCanonicalDayService.js";
import {
  HealthKitEvidenceQuarantineError,
  assertNotQuarantinedHealthKitEvidence,
} from "../../domain/services/HealthKitEvidenceEligibilityPolicy.js";
import {
  getCanonicalActivitySemanticFingerprint,
  selectActiveCanonicalActivityDays,
} from "../../domain/services/CanonicalActivityDayService.js";
import {
  createRecurringSupportManagementService,
  RecurringSupportOutcome,
} from "../../domain/services/RecurringSupportManagementService.js";
import {
  ActiveProtocolSuccessorOutcome,
  applyPreparedActiveProtocolSuccessor,
  prepareActiveProtocolSuccessorTransition,
  verifyActiveProtocolSuccessorState,
} from "../../domain/services/ActiveProtocolSuccessorService.js";
import {
  applyPreparedPeptideExecutionTransition,
  buildPeptideSupportDraft,
  classifyPeptideExecutionState,
  PeptideExecutionOutcome,
  preparePeptideExecutionTransition,
  verifyPreparedPeptideExecutionTransition,
} from "../../domain/services/PeptideExecutionManagementService.js";
import {
  applyPreparedSupplementSupportTransition,
  prepareSupplementSupportTransition,
  SupplementSupportOutcome,
  verifyPreparedSupplementSupportTransition,
} from "../../domain/services/SupplementSupportManagementService.js";
import {
  applySupplementStrategyOperation,
  SupplementManagementOutcome,
  verifySupplementStrategyOperation,
} from "../../domain/services/SupplementStrategyManagementService.js";
import { buildSupplementProvenance } from "../../domain/services/SupplementStrategyFormService.js";
import { buildStrategySuccessorPayload } from "../../domain/services/StrategyEditorService.js";
import { getLocalDateKey, resolveLocalTimeZone } from "../../domain/utils/localDate.js";
import {
  applyPreparedCoachingUpdatesStrategyTransition,
  CoachingUpdatesStrategyOutcome,
  prepareCoachingUpdatesStrategyTransition,
  verifyPreparedCoachingUpdatesStrategyTransition,
} from "../../domain/services/CoachingUpdatesStrategyManagementService.js";
import { buildCoachingUpdatesRequest } from "../../domain/services/CoachingUpdatesEditorService.js";
import { resolveCoachingUpdatesReadModel } from "../../domain/services/CoachingUpdatesReadService.js";
import { createProgressPhotosExecutionHydrationModel } from "../../domain/services/ProgressPhotosExecutionScheduleService.js";
import { selectCanonicalActiveGoal } from "../../domain/services/CanonicalGoalRelationshipService.js";

export const CANONICAL_PERSISTENCE_PORT_NAMES = Object.freeze([
  "submitWeight", "submitCheckIn", "createEvidenceIntake", "editEvidenceReview",
  "confirmEvidenceReview", "disposeEvidenceReview", "completePriority", "reconcilePreviousDay",
  "editProtocol", "editGoal", "transitionGoal", "createTrainingSession", "correctTrainingSession",
  "completeTrainingLogger", "confirmNutritionEvidence", "confirmPhotoEvidence", "confirmDexaEvidence",
  "upsertNutritionDay", "syncActivityDay", "commitTrainingSession", "upsertActivityDay",
  "ingestHealthKitObservations",
  "editDexaReview", "requestEvidenceReviewConfirmation", "saveRecurringSupport", "saveNutritionStrategy",
  "addToMyLibrary", "createCanonicalExercise", "saveTrainingStrategy", "savePeptideSupport",
  "saveSupplementSupport",
  "saveSupplementStrategy", "changeSupplementLifecycle",
  "saveCoachingUpdates",
]);

const RECURRING_SUPPORT_BOUNDED_COLLECTIONS = Object.freeze(["protocols", "executionItems", "reminders"]);
const RECURRING_SUPPORT_READ_COLLECTIONS = Object.freeze(["user", ...RECURRING_SUPPORT_BOUNDED_COLLECTIONS]);

const NUTRITION_STRATEGY_BOUNDED_COLLECTIONS = Object.freeze(["protocols", "protocolVersions"]);
const NUTRITION_STRATEGY_READ_COLLECTIONS = Object.freeze(["user", ...NUTRITION_STRATEGY_BOUNDED_COLLECTIONS]);
const TRAINING_STRATEGY_BOUNDED_COLLECTIONS = Object.freeze(["protocols", "protocolVersions"]);
const TRAINING_STRATEGY_READ_COLLECTIONS = Object.freeze(["user", ...TRAINING_STRATEGY_BOUNDED_COLLECTIONS]);
const PEPTIDE_SUPPORT_BOUNDED_COLLECTIONS = Object.freeze(["executionItems", "reminders"]);
const PEPTIDE_SUPPORT_READ_COLLECTIONS = Object.freeze(["user", "protocols", ...PEPTIDE_SUPPORT_BOUNDED_COLLECTIONS]);
const SUPPLEMENT_SUPPORT_BOUNDED_COLLECTIONS = Object.freeze(["executionItems", "reminders"]);
const SUPPLEMENT_SUPPORT_READ_COLLECTIONS = Object.freeze([
  "user", "goals", "protocols", "protocolVersions", ...SUPPLEMENT_SUPPORT_BOUNDED_COLLECTIONS,
]);
const SUPPLEMENT_STRATEGY_BOUNDED_COLLECTIONS = Object.freeze(["protocols", "protocolVersions"]);
const SUPPLEMENT_STRATEGY_READ_COLLECTIONS = Object.freeze(["user", "goals", ...SUPPLEMENT_STRATEGY_BOUNDED_COLLECTIONS]);
const COACHING_UPDATES_BOUNDED_COLLECTIONS = Object.freeze(["protocols", "protocolVersions", "executionItems", "reminders"]);
const COACHING_UPDATES_READ_COLLECTIONS = Object.freeze([
  "user", "goals", ...COACHING_UPDATES_BOUNDED_COLLECTIONS,
  "dexaScans", "progressPhotos", "evidenceReviews",
]);

function coachingUpdatesDraftForm(draft) {
  const values = {
    midweekDay: draft.midweek?.day,
    midweekTime: draft.midweek?.localTime,
    weeklyDay: draft.weekly?.day,
    weeklyTime: draft.weekly?.localTime,
    monthlyTime: draft.monthly?.localTime,
    notificationPreference: draft.notificationPreference,
    photoCadence: draft.photos?.cadence,
    photoDay: draft.photos?.day,
    photoTimeOfDay: draft.photos?.timeOfDay === "specific"
      ? draft.photos?.specificTime
      : draft.photos?.timeOfDay,
    dexaPlannedDate: draft.dexa?.plannedDate,
    dexaLocalTime: draft.dexa?.localTime,
    dexaPreparationNote: draft.dexa?.preparationNote,
  };
  const checked = {
    midweekEnabled: draft.midweek?.enabled === true,
    weeklyEnabled: draft.weekly?.enabled === true,
    monthlyEnabled: draft.monthly?.enabled === true,
    photoEventBriefingEnabled: draft.photoEventBriefingEnabled === true,
    dexaEventBriefingEnabled: draft.dexaEventBriefingEnabled === true,
    photoReminderEnabled: draft.photos?.reminderEnabled === true,
    dexaUploadReminder: draft.dexa?.uploadReminder === true,
  };
  return Object.freeze({
    get: (key) => values[key] ?? null,
    has: (key) => checked[key] === true,
    getAll: (key) => key === "dexaReminderPreferences" ? draft.dexa?.reminderPreferences ?? [] : [],
  });
}

export function createCanonicalPersistenceCommandPorts({ records, now = () => new Date() } = {}) {
  if (!records?.get || !records?.put) throw new Error("Canonical command ports require a record store.");
  const edit = (collection, idField) => async (context) => mutateExisting(
    context,
    collection,
    context.payload[idField],
    context.payload.changes ?? context.payload.patch ?? { corrections: context.payload.corrections }
  );
  const review = (status) => async (context) => mutateExisting(context, "evidenceReviews", context.payload.reviewId, { ...(context.payload.changes ?? {}), status });

  return Object.freeze({
    submitWeight: (context) => commitMorningCheckIn(context, { reconcilePreviousDayPriorities: false }),
    submitCheckIn: (context) => commitMorningCheckIn(context, { reconcilePreviousDayPriorities: true }),
    createEvidenceIntake: (context) => create(context, "evidencePackages", context.payload.submissionId, {
      id: context.payload.submissionId, userId: context.ownerUserId, status: "pending_review",
      ...context.payload, provenance: commandProvenance(context),
    }, context.payload.sourceIdentity ?? context.payload.submissionId),
    editEvidenceReview: edit("evidenceReviews", "reviewId"),
    confirmEvidenceReview: review("confirmed"),
    disposeEvidenceReview,
    completePriority: completeCanonicalPriority,
    reconcilePreviousDay: async (context) => create(context, "dailyCheckIns", `reconciliation:${context.payload.localDate}`, {
      id: `reconciliation:${context.payload.localDate}`, userId: context.ownerUserId,
      localDate: context.payload.localDate, items: context.payload.items, status: "reconciled", provenance: commandProvenance(context),
    }),
    editProtocol: edit("protocols", "protocolId"),
    editGoal: edit("goals", "goalId"),
    transitionGoal: async (context) => mutateExisting(context, "goals", context.payload.goalId, {
      status: context.payload.status ?? "completed", transitionId: context.payload.transitionId,
      transitionedAt: now().toISOString(),
    }),
    createTrainingSession: (context) => create(context, "trainingPerformanceEvents", context.payload.sessionId, {
      id: context.payload.sessionId, userId: context.ownerUserId, observedAt: context.payload.observedAt,
      status: "recorded", ...context.payload, provenance: commandProvenance(context),
    }, context.payload.sourceIdentity ?? context.payload.sessionId),
    correctTrainingSession: edit("trainingPerformanceEvents", "sessionId"),
    completeTrainingLogger: completeOccurrence("trainingPerformanceEvents", "draftId", "reconciliations", "localDate"),
    confirmNutritionEvidence: review("confirmed_nutrition"),
    confirmPhotoEvidence: review("confirmed_photo"),
    confirmDexaEvidence: review("confirmed_dexa"),
    upsertNutritionDay: (context) => commitDailyEvidence(context, {
      evidenceType: "nutrition",
      payload: {
        id: `native-nutrition-${context.payload.localDate}`,
        evidence_type: "nutrition",
        observed_at: context.payload.localDate,
        daily_totals: context.payload.dailyTotals,
        meals: context.payload.meals ?? [],
        metadata: {
          date: context.payload.localDate,
          time_zone: context.metadata.clientTimeZone ?? context.payload.timeZone ?? "America/Los_Angeles",
          daily_totals_scope: "full_day_summary",
        },
        reconciliation: {
          nutrition: {
            disposition: "replace",
            replacementScope: "full_day",
            expectedPriorSemanticFingerprint: context.payload.expectedSemanticFingerprint ?? null,
          },
        },
        source: context.payload.source ?? { application: "PhysiqueOS", modality: "manual" },
      },
    }),
    syncActivityDay: (context) => upsertCanonicalDay(context, {
      evidenceType: "activity_day",
      payload: {
        id: String(context.payload.sourceIdentity),
        evidence_type: "activity_day",
        observed_at: context.payload.localDate,
        daily_activity: context.payload.dailyActivity,
        metadata: {
          date: context.payload.localDate,
          time_zone: context.metadata.clientTimeZone ?? context.payload.timeZone ?? "America/Los_Angeles",
          sync_checkpoint: context.payload.checkpoint ?? null,
        },
        reconciliation: {
          activity: {
            expectedPriorSemanticFingerprint: context.payload.expectedSemanticFingerprint ?? null,
          },
        },
        source: context.payload.source ?? { application: "Apple Health", integration: "HealthKit", modality: "direct" },
      },
    }),
    upsertActivityDay: async (context) => {
      assertManualActivitySource(context.payload.source);
      return commitDailyEvidence(context, {
        evidenceType: "activity_day",
        payload: {
          id: String(context.payload.sourceIdentity),
          evidence_type: "activity_day",
          observed_at: context.payload.localDate,
          daily_activity: context.payload.dailyActivity,
          metadata: {
            date: context.payload.localDate,
            time_zone: context.metadata.clientTimeZone ?? context.payload.timeZone ?? "America/Los_Angeles",
          },
          reconciliation: {
            activity: {
              expectedPriorSemanticFingerprint: context.payload.expectedSemanticFingerprint ?? null,
            },
          },
          source: structuredClone(context.payload.source),
        },
      });
    },
    ingestHealthKitObservations,
    commitTrainingSession,
    editDexaReview,
    requestEvidenceReviewConfirmation,
    saveRecurringSupport,
    saveNutritionStrategy,
    addToMyLibrary,
    createCanonicalExercise,
    saveTrainingStrategy,
    savePeptideSupport,
    saveSupplementSupport,
    saveSupplementStrategy,
    changeSupplementLifecycle,
    saveCoachingUpdates,
  });

  async function ingestHealthKitObservations(context) {
    if (typeof records.putIfAbsent !== "function") {
      throw new Error("HealthKit ingestion requires atomic create-if-absent record storage.");
    }
    let batch;
    try {
      batch = normalizeHealthKitObservationBatch({
        batchId: context.payload.batchId,
        observations: context.payload.observations,
        principalDeviceId: context.principal.deviceId,
      });
    } catch (error) {
      if (!(error instanceof HealthKitObservationError)) throw error;
      throw problem(
        ["HEALTHKIT_OBSERVATION_IDENTITY_COLLISION", "HEALTHKIT_INGESTION_PURPOSE_IMMUTABLE"].includes(error.code) ? 409 : 400,
        error.code,
        error.message,
        error.field ? [{ field: error.field, code: "invalid", detail: error.message }] : []
      );
    }
    const [existingObservations, canonicalObjects, activationPolicyRecord, existingCanonicalDays] = await Promise.all([
      records.list({ ownerUserId: context.ownerUserId, collection: "healthKitObservations" }),
      records.list({ ownerUserId: context.ownerUserId, collection: "canonicalEvidenceObjects" }),
      records.get({
        ownerUserId: context.ownerUserId,
        collection: "healthKitConfiguration",
        recordId: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
      }),
      records.list({ ownerUserId: context.ownerUserId, collection: HEALTHKIT_CANONICAL_DAY_COLLECTION }),
    ]);
    const [workoutPolicyRecord, existingCanonicalWorkouts, existingWorkoutLinks] = await Promise.all([
      records.get({
        ownerUserId: context.ownerUserId,
        collection: "healthKitConfiguration",
        recordId: HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID,
      }),
      records.list({ ownerUserId: context.ownerUserId, collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION }),
      records.list({ ownerUserId: context.ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_COLLECTION }),
    ]);
    const workoutPolicy = resolveHealthKitWorkoutActivationPolicy(workoutPolicyRecord);
    const workoutActivationSnapshot = workoutPolicy.enabled
      ? {
        policyRecordId: HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID,
        policyVersion: workoutPolicyRecord.version ?? null,
        effectiveLocalDate: workoutPolicy.effectiveLocalDate,
        endLocalDate: workoutPolicy.endLocalDate,
        openEnded: workoutPolicy.openEnded === true,
        families: [...workoutPolicy.families],
      }
      : null;
    const canonicalWorkoutById = new Map(existingCanonicalWorkouts.map((record) => [record.id, record]));
    const workoutLinks = [...existingWorkoutLinks];
    let batchHadWorkout = false;
    const activationPolicy = resolveHealthKitCanonicalActivationPolicy(activationPolicyRecord);
    const activationSnapshot = activationPolicy.enabled
      ? {
        policyRecordId: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
        policyVersion: activationPolicyRecord.version ?? null,
        domains: [...activationPolicy.domains],
        effectiveLocalDate: activationPolicy.effectiveLocalDate,
        endLocalDate: activationPolicy.endLocalDate,
      }
      : null;
    const existingById = new Map(existingObservations.map((record) => [record.id, record]));
    const canonicalDayById = new Map(existingCanonicalDays.map((record) => [record.id, record]));
    const receivedAt = () => context.metadata.clientOccurredAt ?? now().toISOString();
    const results = [];
    for (const observation of batch.observations) {
      const existing = existingById.get(observation.id);
      if (existing && (existing.ingestionPurpose ?? "operational") !== observation.ingestionPurpose) {
        throw problem(
          409,
          "HEALTHKIT_INGESTION_PURPOSE_IMMUTABLE",
          "The HealthKit source identity is permanently bound to its original ingestion purpose."
        );
      }
      if (existing && !isCompatibleHealthKitReplay(existing, observation)) {
        throw problem(
          409,
          "HEALTHKIT_OBSERVATION_IDENTITY_COLLISION",
          "The HealthKit source identity already exists with different observation content."
        );
      }
      const dailySnapshotDomain = healthKitDailySnapshotDomain(observation.observationType);
      let reconciliation;
      if (dailySnapshotDomain) {
        const states = DAILY_SNAPSHOT_STATES[dailySnapshotDomain];
        const canonicalization = assessHealthKitCanonicalization({ observation, activationPolicy: activationPolicyRecord });
        if (existing) {
          // An accepted raw daily snapshot is never reconsidered on replay.
          // This prevents later activation configuration from becoming a backfill.
          reconciliation = structuredClone(existing.reconciliation);
        } else if (observation.ingestionPurpose === "validation_only") {
          reconciliation = {
            state: states.validationOnly,
            reason: canonicalization.reason,
            canonicalizationPermitted: false,
            canonicalizationPermanentBar: true,
          };
        } else if (!canonicalization.eligible) {
          reconciliation = {
            state: states.deferred,
            reason: canonicalization.reason,
            canonicalizationPermitted: false,
            canonicalizationPermanentBar: canonicalization.permanent === true,
            ...(canonicalization.effectiveLocalDate
              ? { effectiveLocalDate: canonicalization.effectiveLocalDate, endLocalDate: canonicalization.endLocalDate }
              : {}),
          };
        } else {
          const preview = reconcileHealthKitCanonicalDay({
            observation,
            existing: canonicalDayById.get(getHealthKitCanonicalDayRecordId(dailySnapshotDomain, observation.occurrence.localDate)) ?? null,
            ownerUserId: context.ownerUserId,
            now: now(),
            activation: activationSnapshot,
            canonicalEvidenceObjects: canonicalObjects,
          });
          reconciliation = preview.action === "superseded"
            ? {
              state: states.superseded,
              reason: preview.reason,
              supersededBySourceObservationId: preview.record.current.sourceObservationId,
            }
            : {
              state: states.pending,
              reason: canonicalization.reason,
              canonicalizationPermitted: true,
            };
        }
      } else if (observation.observationType === HealthKitObservationType.WORKOUT) {
        batchHadWorkout = true;
        const classification = classifyHealthKitWorkoutType(observation.measurement.activityType);
        // The effective day is the workout's own start in its own time zone.
        const effectiveLocalDate = deriveHealthKitWorkoutLocalDate({
          startedAt: observation.occurrence.startedAt,
          timeZone: observation.occurrence.timeZone,
        }) ?? observation.occurrence.localDate;
        const workoutAssessment = assessHealthKitWorkoutCanonicalization({
          observation, effectiveLocalDate, family: classification.family, activationPolicy: workoutPolicyRecord,
        });
        if (existing && WORKOUT_TERMINAL_STATES.has(existing.reconciliation?.state)) {
          // A canonicalized (or superseded) workout is never reconsidered on replay.
          reconciliation = structuredClone(existing.reconciliation);
        } else if (!existing && workoutAssessment.eligible && classification.family === HealthKitWorkoutFamily.UNSUPPORTED) {
          reconciliation = { state: HealthKitReconciliationState.SOURCE_ONLY, reason: "unsupported_workout_type" };
        } else if (!existing && workoutAssessment.reason === "family_not_in_activation_scope") {
          // Stored with its real reason so an audit can count what a family
          // scope kept raw. Like every raw workout stored under a policy, it is
          // not reconsidered later: a later policy for this family covers
          // workouts first uploaded after it.
          reconciliation = { state: HealthKitReconciliationState.WORKOUT_CANONICALIZATION_DEFERRED, reason: "family_not_in_activation_scope" };
        } else if (!existing && workoutAssessment.eligible) {
          const preview = reconcileHealthKitCanonicalWorkout({
            observation,
            existing: canonicalWorkoutById.get(getHealthKitCanonicalWorkoutRecordId(observation)) ?? null,
            ownerUserId: context.ownerUserId,
            now: now(),
            activation: workoutActivationSnapshot,
          });
          reconciliation = preview.action === "superseded"
            ? {
              state: HealthKitReconciliationState.WORKOUT_SUMMARY_SUPERSEDED,
              reason: preview.reason,
              supersededBySourceObservationId: preview.record.current.sourceObservationId,
            }
            : {
              state: HealthKitReconciliationState.WORKOUT_CANONICALIZATION_PENDING,
              reason: workoutAssessment.reason,
              canonicalizationPermitted: true,
            };
        } else {
          reconciliation = reconcileHealthKitWorkoutObservation({ observation, canonicalObjects });
        }
      } else {
        reconciliation = { state: HealthKitReconciliationState.SOURCE_ONLY };
      }
      const sourceRecord = existing ?? createHealthKitObservationRecord({
        observation,
        reconciliation,
        ownerUserId: context.ownerUserId,
        receivedAt: receivedAt(),
      });
      const insertion = existing ? null : await records.putIfAbsent({
        ownerUserId: context.ownerUserId,
        collection: "healthKitObservations",
        recordId: sourceRecord.id,
        sourceIdentity: sourceRecord.id,
        payload: sourceRecord,
      });
      let stored = existing ?? insertion.record;
      if (!stored || !isCompatibleHealthKitReplay(stored, observation)) {
        const purposeChanged = stored &&
          (stored.ingestionPurpose ?? "operational") !== observation.ingestionPurpose;
        throw problem(
          409,
          purposeChanged ? "HEALTHKIT_INGESTION_PURPOSE_IMMUTABLE" : "HEALTHKIT_OBSERVATION_IDENTITY_COLLISION",
          purposeChanged
            ? "The HealthKit source identity is permanently bound to its original ingestion purpose."
            : "The HealthKit source identity already exists with different observation content."
        );
      }
      const ownsCreation = !existing && insertion.created;
      let canonicalDayOutcome = null;
      if (ownsCreation && dailySnapshotDomain &&
        reconciliation.state === DAILY_SNAPSHOT_STATES[dailySnapshotDomain].pending) {
        const dayRecordId = getHealthKitCanonicalDayRecordId(dailySnapshotDomain, observation.occurrence.localDate);
        // Re-read at the write boundary so the day's precedence is decided
        // against committed state, not the batch-start snapshot.
        const currentDay = await records.get({
          ownerUserId: context.ownerUserId,
          collection: HEALTHKIT_CANONICAL_DAY_COLLECTION,
          recordId: dayRecordId,
        });
        const decision = reconcileHealthKitCanonicalDay({
          observation,
          existing: currentDay,
          ownerUserId: context.ownerUserId,
          now: now(),
          activation: activationSnapshot,
          canonicalEvidenceObjects: canonicalObjects,
        });
        let persistedDay = decision.record;
        if (decision.action === "create") {
          const created = await records.putIfAbsent({
            ownerUserId: context.ownerUserId,
            collection: HEALTHKIT_CANONICAL_DAY_COLLECTION,
            recordId: dayRecordId,
            sourceIdentity: dayRecordId,
            payload: decision.record,
          });
          if (!created.created) {
            throw problem(409, "HEALTHKIT_CANONICAL_DAY_CONFLICT", "The HealthKit canonical day changed concurrently; retry the batch.");
          }
          persistedDay = created.record;
        } else if (decision.action === "update") {
          persistedDay = await records.put({
            ownerUserId: context.ownerUserId,
            collection: HEALTHKIT_CANONICAL_DAY_COLLECTION,
            recordId: dayRecordId,
            expectedVersion: currentDay.version,
            sourceIdentity: dayRecordId,
            payload: decision.record,
          });
        }
        canonicalDayById.set(dayRecordId, persistedDay);
        const states = DAILY_SNAPSHOT_STATES[dailySnapshotDomain];
        reconciliation = decision.action === "create" || decision.action === "update"
          ? {
            state: states.canonicalized,
            canonicalStore: HEALTHKIT_CANONICAL_DAY_COLLECTION,
            canonicalId: dayRecordId,
            canonicalRevision: persistedDay.revision,
            canonicalAction: decision.action,
            aggregationPolicy: dailySnapshotDomain === HealthKitCanonicalDomain.ACTIVITY
              ? "authoritative_daily_total_no_workout_addition"
              : "authoritative_daily_total_no_meal_objects",
            evidenceEligibility: persistedDay.evidenceEligibility.state,
            coexistenceState: persistedDay.coexistence?.state ?? null,
          }
          : {
            state: states.superseded,
            reason: decision.reason,
            supersededBySourceObservationId: persistedDay.current.sourceObservationId,
          };
        stored = await records.put({
          ownerUserId: context.ownerUserId,
          collection: "healthKitObservations",
          recordId: stored.id,
          expectedVersion: stored.version,
          sourceIdentity: stored.id,
          payload: { ...stored, reconciliation },
        });
        canonicalDayOutcome = {
          domain: dailySnapshotDomain,
          localDate: observation.occurrence.localDate,
          action: decision.action,
          revision: persistedDay.revision,
          coverage: persistedDay.current.coverage,
          coexistenceState: persistedDay.coexistence?.state ?? null,
        };
      }
      let canonicalWorkoutOutcome = null;
      if (ownsCreation && observation.observationType === HealthKitObservationType.WORKOUT &&
        reconciliation.state === HealthKitReconciliationState.WORKOUT_CANONICALIZATION_PENDING) {
        const workoutRecordId = getHealthKitCanonicalWorkoutRecordId(observation);
        const currentWorkout = await records.get({
          ownerUserId: context.ownerUserId,
          collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION,
          recordId: workoutRecordId,
        });
        const decision = reconcileHealthKitCanonicalWorkout({
          observation,
          existing: currentWorkout,
          ownerUserId: context.ownerUserId,
          now: now(),
          activation: workoutActivationSnapshot,
        });
        let persistedWorkout = decision.record;
        if (decision.action === "create") {
          const created = await records.putIfAbsent({
            ownerUserId: context.ownerUserId,
            collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION,
            recordId: workoutRecordId,
            sourceIdentity: workoutRecordId,
            payload: decision.record,
          });
          if (!created.created) {
            throw problem(409, "HEALTHKIT_CANONICAL_WORKOUT_CONFLICT", "The HealthKit canonical workout changed concurrently; retry the batch.");
          }
          persistedWorkout = created.record;
        } else if (decision.action === "update") {
          persistedWorkout = await records.put({
            ownerUserId: context.ownerUserId,
            collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION,
            recordId: workoutRecordId,
            expectedVersion: currentWorkout.version,
            sourceIdentity: workoutRecordId,
            payload: decision.record,
          });
        }
        canonicalWorkoutById.set(workoutRecordId, persistedWorkout);
        reconciliation = decision.action === "create" || decision.action === "update"
          ? {
            state: HealthKitReconciliationState.WORKOUT_CANONICALIZED,
            canonicalStore: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION,
            canonicalId: workoutRecordId,
            canonicalRevision: persistedWorkout.revision,
            canonicalAction: decision.action,
            workoutFamily: persistedWorkout.current.family,
            evidenceEligibility: persistedWorkout.evidenceEligibility.state,
            activityInteraction: "descriptive_never_additive",
          }
          : {
            state: HealthKitReconciliationState.WORKOUT_SUMMARY_SUPERSEDED,
            reason: decision.reason,
            supersededBySourceObservationId: persistedWorkout.current.sourceObservationId,
          };
        stored = await records.put({
          ownerUserId: context.ownerUserId,
          collection: "healthKitObservations",
          recordId: stored.id,
          expectedVersion: stored.version,
          sourceIdentity: stored.id,
          payload: { ...stored, reconciliation },
        });
        canonicalWorkoutOutcome = {
          action: decision.action,
          revision: persistedWorkout.revision,
          family: persistedWorkout.current.family,
          localDate: persistedWorkout.localDate,
        };
      }
      const reconciliationChanged = existing &&
        observation.observationType === HealthKitObservationType.WORKOUT &&
        comparableRecord(existing.reconciliation) !== comparableRecord(reconciliation);
      if (reconciliationChanged) {
        stored = await records.put({
            ownerUserId: context.ownerUserId,
            collection: "healthKitObservations",
            recordId: existing.id,
            expectedVersion: existing.version,
            sourceIdentity: existing.id,
            payload: { ...existing, reconciliation },
          });
      }
      if (ownsCreation) existingById.set(stored.id, stored);
      results.push({
        sourceObservationId: stored.id,
        ingestionPurpose: stored.ingestionPurpose,
        outcome: reconciliationChanged
          ? "reconciled"
          : existing || !insertion.created ? "matched" : "created",
        observationType: stored.observationType,
        occurredAt: stored.occurredAt,
        reconciliation: stored.reconciliation,
        ...(canonicalDayOutcome ? { canonicalDay: canonicalDayOutcome } : {}),
        ...(canonicalWorkoutOutcome ? { canonicalWorkout: canonicalWorkoutOutcome } : {}),
      });
    }
    // Relationship reassessment. Read-mostly and idempotent: it only runs while
    // the separate Workout policy is enabled, only for canonical workouts inside
    // its exact window, and it never touches the Logger session or Evidence.
    let workoutRelationships = { assessed: 0, updated: 0, candidateLinksCreated: 0, candidateLinksReleased: 0 };
    if (batchHadWorkout && workoutPolicy.enabled) {
      workoutRelationships = await reassessWorkoutRelationships({
        context,
        workoutPolicy,
        canonicalWorkoutById,
        workoutLinks,
        canonicalObjects,
      });
    }
    const canonicalizedBy = (domain) => results.filter((item) =>
      item.reconciliation?.state === DAILY_SNAPSHOT_STATES[domain].canonicalized
    ).length;
    return {
      status: "committed",
      result: {
        status: results.every((item) => item.outcome === "matched") ? "matched" : "accepted",
        batchId: batch.batchId,
        acceptedCount: results.length,
        createdCount: results.filter((item) => item.outcome === "created").length,
        reconciledCount: results.filter((item) => item.outcome === "reconciled").length,
        matchedCount: results.filter((item) => item.outcome === "matched").length,
        activityDayCanonicalizedCount: canonicalizedBy(HealthKitCanonicalDomain.ACTIVITY),
        nutritionDayCanonicalizedCount: canonicalizedBy(HealthKitCanonicalDomain.NUTRITION),
        workoutCanonicalizedCount: results.filter((item) =>
          item.reconciliation?.state === HealthKitReconciliationState.WORKOUT_CANONICALIZED
        ).length,
        workoutRelationships,
        validationOnlyAcceptedCount: results.filter((item) =>
          item.ingestionPurpose === "validation_only"
        ).length,
        strategicEvidenceEligibility: "quarantined",
        cursorResponsibility: "device",
        observations: results,
      },
      outbox: [],
    };
  }

  async function reassessWorkoutRelationships({ context, workoutPolicy, canonicalWorkoutById, workoutLinks, canonicalObjects }) {
    const summary = { assessed: 0, updated: 0, candidateLinksCreated: 0, candidateLinksReleased: 0, candidateLinksRefreshed: 0 };
    const at = now().toISOString();
    // An open-ended policy (null endLocalDate) has no upper bound.
    const inWindow = [...canonicalWorkoutById.values()].filter((workout) =>
      workout.localDate >= workoutPolicy.effectiveLocalDate &&
      (workoutPolicy.endLocalDate === null || workout.localDate <= workoutPolicy.endLocalDate));
    const saveLink = async (link, next) => {
      const saved = await records.put({
        ownerUserId: context.ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_COLLECTION, recordId: link.id,
        expectedVersion: link.version, sourceIdentity: link.id, payload: next,
      });
      workoutLinks.splice(workoutLinks.findIndex((item) => item.id === link.id), 1, saved);
      return saved;
    };
    for (const workout of inWindow) {
      summary.assessed += 1;
      // One physical workout can appear as two canonical records (a re-created
      // HealthKit workout, or two sources). Only the earliest may hold a link.
      const duplicates = findPossibleDuplicateCanonicalWorkouts(workout, inWindow);
      const group = [workout, ...duplicates.map((id) => canonicalWorkoutById.get(id))].filter(Boolean);
      const primary = group.sort((left, right) =>
        String(left.createdAt).localeCompare(String(right.createdAt)) || String(left.id).localeCompare(String(right.id)))[0];
      const isPrimary = primary.id === workout.id;
      let patch;
      if (workout.current.family === HealthKitWorkoutFamily.STRENGTH) {
        const assessment = assessHealthKitStrengthLinkCandidates({ canonicalWorkout: workout, canonicalObjects, existingLinks: workoutLinks });
        const single = [HealthKitStrengthMatchOutcome.CONFIDENT, HealthKitStrengthMatchOutcome.POSSIBLE].includes(assessment.outcome);
        const session = single ? assessment.candidates[0].loggerSessionCanonicalId : null;
        const heldByAnother = single && workoutLinks.some((link) =>
          link.loggerSessionCanonicalId === session && link.canonicalWorkoutId !== workout.id &&
          [HealthKitWorkoutLinkStatus.CANDIDATE, HealthKitWorkoutLinkStatus.CONFIRMED].includes(link.status));
        // An established (confirmed) relationship is never crowded by a new candidate:
        // this workout, or any duplicate of it, already has a confirmed session.
        const groupIds = new Set(duplicates);
        const workoutAlreadyLinked = workoutLinks.some((link) =>
          link.status === HealthKitWorkoutLinkStatus.CONFIRMED && (link.canonicalWorkoutId === workout.id || groupIds.has(link.canonicalWorkoutId)));
        const suppressed = !isPrimary ? "possible_duplicate_of_another_canonical_workout"
          : workoutAlreadyLinked ? "workout_or_duplicate_already_linked"
            : heldByAnother ? "session_already_linked_to_another_workout" : null;
        patch = {
          linkAssessment: {
            outcome: assessment.outcome,
            reason: assessment.reason,
            matcherVersion: assessment.matcherVersion,
            unverifiableSessionCount: assessment.unverifiableSessionCount,
            candidates: assessment.candidates.map((candidate) => ({
              loggerSessionCanonicalId: candidate.loggerSessionCanonicalId,
              confidence: candidate.confidence,
              basis: candidate.basis,
            })),
            ...(duplicates.length > 0 ? { possibleDuplicateOf: [...duplicates] } : {}),
            ...(suppressed ? { linkSuppressed: suppressed } : {}),
          },
        };
        const wanted = single && !suppressed ? session : null;
        // Release system candidates the matcher (or the duplicate rule) no longer supports.
        for (const link of workoutLinks.filter((item) =>
          item.canonicalWorkoutId === workout.id && item.status === HealthKitWorkoutLinkStatus.CANDIDATE)) {
          if (wanted === link.loggerSessionCanonicalId) continue;
          await saveLink(link, unlinkHealthKitWorkoutLink(link, {
            by: { kind: "system_matcher", ref: assessment.matcherVersion }, now: at, reason: "assessment_changed",
          }));
          summary.candidateLinksReleased += 1;
        }
        if (wanted) {
          const candidate = createHealthKitWorkoutLinkCandidate({
            canonicalWorkout: workout, assessment, ownerUserId: context.ownerUserId, now: at,
          });
          const existing = workoutLinks.find((item) => item.id === candidate.id);
          if (!existing) {
            const created = await records.putIfAbsent({
              ownerUserId: context.ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_COLLECTION,
              recordId: candidate.id, sourceIdentity: candidate.id, payload: candidate,
            });
            workoutLinks.push(created.record);
            if (created.created) summary.candidateLinksCreated += 1;
          } else {
            const refreshed = refreshHealthKitWorkoutLinkCandidate(existing, { assessment, now: at, existingLinks: workoutLinks });
            if (refreshed !== existing) {
              await saveLink(existing, refreshed);
              summary.candidateLinksRefreshed += 1;
            }
          }
        }
      } else if (workout.current.family === HealthKitWorkoutFamily.CARDIO) {
        const coexistence = assessHealthKitCardioCoexistence({ canonicalWorkout: workout, canonicalObjects });
        patch = {
          coexistence: {
            state: coexistence.state,
            unverifiableCount: coexistence.unverifiableCount,
            candidates: coexistence.candidates.map((item) => ({ canonicalId: item.canonicalId, outcome: item.outcome, confidence: item.confidence })),
            ...(duplicates.length > 0 ? { possibleDuplicateOf: [...duplicates] } : {}),
          },
        };
      }
      if (!patch) continue;
      const previous = workout.linkAssessment ?? workout.coexistence ?? null;
      const next = patch.linkAssessment ?? patch.coexistence;
      // Key-sorted comparison: a jsonb column returns object keys in its own
      // order, so an insertion-order comparison would rewrite every time.
      if (stableJson(previous) === stableJson(next)) continue;
      const saved = await records.put({
        ownerUserId: context.ownerUserId,
        collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION,
        recordId: workout.id,
        expectedVersion: workout.version,
        sourceIdentity: workout.id,
        payload: { ...workout, ...patch, updatedAt: at },
      });
      canonicalWorkoutById.set(workout.id, saved);
      summary.updated += 1;
    }
    return summary;
  }

  async function saveCoachingUpdates(context) {
    if (!records.getRuntimeMetadata || !records.advanceRuntimeMetadata) {
      throw problem(503, "COACHING_UPDATES_AUTHORITY_UNAVAILABLE", "Canonical Coaching Updates revision authority is unavailable.");
    }
    const metadata = await records.getRuntimeMetadata({ ownerUserId: context.ownerUserId, lock: true });
    if (!metadata) throw problem(503, "COACHING_UPDATES_AUTHORITY_UNAVAILABLE", "Canonical runtime metadata is unavailable.");
    const { candidate, before } = await loadCandidate(
      COACHING_UPDATES_READ_COLLECTIONS, context.ownerUserId, { sourceOrder: true }
    );
    candidate.revision = metadata.revision;
    candidate.lastCommitId = metadata.lastCommandId;
    const protocol = candidate.protocols?.find((item) =>
      item.id === context.payload.protocolId && item.userId === context.ownerUserId &&
      item.status === "active" && (item.protocolType ?? item.category) === "briefings"
    );
    const version = candidate.protocolVersions?.find((item) => item.id === protocol?.currentVersionId);
    const goal = selectCanonicalActiveGoal(candidate.goals ?? [], { ownerUserId: context.ownerUserId });
    const readModel = resolveCoachingUpdatesReadModel({
      protocol, version, goal, timeZone: candidate.user?.timeZone ?? "America/Los_Angeles",
    });
    const photos = createProgressPhotosExecutionHydrationModel(candidate);
    if (!protocol || !version || !goal || !readModel || !photos) {
      throw problem(404, "COACHING_UPDATES_UNAVAILABLE", "These coaching settings are no longer available.");
    }
    const requested = buildCoachingUpdatesRequest(coachingUpdatesDraftForm(context.payload.draft ?? {}), readModel);
    const effectiveDate = getLocalDateKey(
      now(), resolveLocalTimeZone(candidate.user?.timeZone ?? candidate.user?.timezone)
    );
    const author = {
      type: "user", id: context.ownerUserId,
      displayName: candidate.user?.displayName ?? candidate.user?.name ?? "Founder",
    };
    const command = {
      // The global runtime revision serializes this transaction but is not a
      // user-visible Coaching fence. Use the lock-protected current value for
      // mutation; scoped semantic/version fences below still come from the
      // editor read and reject real changes to this composite resource.
      expectedRevision: metadata.revision,
      expectedSemanticDigest: context.payload.expectedSemanticDigest,
      coaching: {
        protocolId: protocol.id,
        expectedCurrentVersionId: context.payload.expectedCurrentVersionId,
        effectiveDate,
        ...requested,
        goalAssociation: { goalId: goal.id, relationship: "supports" },
        provenance: {
          author,
          reason: "Update active Coaching Updates strategy.",
          confirmation: { confirmedByUser: true, authority: "founder_direct_strategy_edit" },
          details: { source: "native_direct_coaching_updates_edit" },
        },
      },
      photos: {
        protocolId: photos.context.protocolId,
        expectedCurrentVersionId: context.payload.photoExpectedCurrentVersionId,
        expectedRevision: metadata.revision,
        expectedSemanticDigest: context.payload.photoExpectedSemanticDigest,
        effectiveDate,
        reminderEnabled: requested.photos.reminderEnabled,
        recurrence: {
          ...photos.item.recurrence,
          interval: requested.photos.cadence === "weekly_interval_2" ? 2 : 1,
          weekdays: [requested.photos.day],
          timeOfDay: requested.photos.timeOfDay,
        },
        author,
      },
      dexa: {
        userId: context.ownerUserId,
        goalId: goal.id,
        timezone: readModel.timeZone,
        expectedRevision: context.payload.dexaExpectedRevision,
        draft: requested.dexa,
        author,
      },
    };
    const prepared = prepareCoachingUpdatesStrategyTransition(candidate, command, now());
    if (!prepared.ok) {
      if (prepared.outcome === CoachingUpdatesStrategyOutcome.UNCHANGED) {
        return { status: "committed", result: { status: "unchanged", protocolId: protocol.id, revision: metadata.revision }, outbox: [] };
      }
      if (["concurrency_conflict", "version_conflict", "expected_version_conflict"].includes(prepared.outcome)) {
        throw staleVersionProblem({
          expectedVersion: context.metadata.expectedVersion,
          actualVersion: metadata.revision,
          resource: `coaching-updates:${protocol.id}`,
        });
      }
      const notFound = ["not_found", "protocol_not_found", "protocol_not_active", "current_version_missing"].includes(prepared.outcome);
      throw problem(notFound ? 404 : 400, notFound ? "COACHING_UPDATES_UNAVAILABLE" : "COACHING_UPDATES_INVALID", prepared.reason);
    }
    const changes = applyPreparedCoachingUpdatesStrategyTransition(candidate, prepared);
    if (!verifyPreparedCoachingUpdatesStrategyTransition(candidate, command, prepared)) {
      throw problem(500, "COACHING_UPDATES_VERIFICATION_FAILED", "Coaching Updates could not be verified. Nothing was changed.");
    }
    await persistCandidateCollections({
      before, candidate, collections: COACHING_UPDATES_BOUNDED_COLLECTIONS, ownerUserId: context.ownerUserId,
    });
    const committed = await records.advanceRuntimeMetadata({
      ownerUserId: context.ownerUserId,
      expectedRevision: metadata.revision,
      commandId: context.metadata.commandId,
      at: now(),
    });
    return {
      status: "committed",
      result: { status: "updated", protocolId: protocol.id, revision: committed.revision, ...changes },
      outbox: [],
    };
  }

  /// The one canonical write for every "recurring support" execution item
  /// (Foam Rolling under Recovery, Morning Weigh-In under Tracking, and any
  /// future domain that reuses this exact shape) — a thin wrapper over the
  /// SAME `RecurringSupportManagementService` Web's own
  /// `saveFoamRollingSupport`/`saveMorningWeighInSupport` actions already
  /// call, using the established `loadCandidate`/`mutateCanonicalRuntime`
  /// bounded-mutation pattern `commitMorningCheckIn` above demonstrates —
  /// no second implementation of the schedule/reminder write semantics.
  async function saveRecurringSupport(context) {
    const { candidate, before } = await loadCandidate(RECURRING_SUPPORT_READ_COLLECTIONS, context.ownerUserId);
    const result = await createRecurringSupportManagementService({
      runtimeStorePath: "/tmp/physiqueos-native-recurring-support.json",
      liveStore: candidate,
      now,
      mutateCanonicalRuntime: (input) => mutateCandidateRuntime(candidate, context.metadata.commandId, input),
    }).save({
      protocolId: context.payload.protocolId,
      protocolCategory: context.payload.protocolCategory,
      executionId: context.payload.executionId,
      reminderId: context.payload.reminderId,
      userId: context.ownerUserId,
      expectedRevision: context.metadata.expectedVersion,
      draft: context.payload.draft,
    });
    if (result.outcome === RecurringSupportOutcome.NOT_FOUND) {
      throw problem(404, "RECURRING_SUPPORT_UNAVAILABLE", result.reason ?? "This Support item is no longer available.");
    }
    if (result.outcome === RecurringSupportOutcome.VERSION_CONFLICT) {
      const execution = (candidate.executionItems ?? []).find((item) => item.id === context.payload.executionId);
      throw staleVersionProblem({
        expectedVersion: context.metadata.expectedVersion,
        actualVersion: execution?.executionRevision ?? null,
        resource: `execution-item:${context.payload.executionId}`,
      });
    }
    if (result.outcome === RecurringSupportOutcome.INVALID) {
      throw problem(400, "RECURRING_SUPPORT_INVALID", result.reason ?? "The Support schedule is invalid.");
    }
    if (result.outcome !== RecurringSupportOutcome.SUCCESS) {
      throw problem(500, "RECURRING_SUPPORT_PERSISTENCE_FAILED", result.reason ?? "We could not update this Support schedule. Nothing was changed.");
    }
    await persistCandidateCollections({
      before, candidate, collections: RECURRING_SUPPORT_BOUNDED_COLLECTIONS, ownerUserId: context.ownerUserId,
    });
    const execution = candidate.executionItems?.find((item) => item.id === context.payload.executionId) ?? null;
    return {
      status: "committed",
      result: {
        status: "updated",
        executionId: context.payload.executionId,
        executionRevision: execution?.executionRevision ?? result.revision ?? null,
      },
      outbox: [],
    };
  }

  /// Nutrition strategy save — the smallest safe Native production write
  /// for the Nutrition Operating Plan domain. Reuses `buildNutrition`'s
  /// EXACT validation logic (via `buildStrategySuccessorPayload`, given a
  /// plain-object FormData adapter — that function only calls `.get(key)`)
  /// and `ActiveProtocolSuccessorService`'s separately-exported PURE
  /// transition functions, orchestrated by hand through
  /// `loadCandidate`/`persistCandidateCollections` rather than through the
  /// shared service itself (which requires a file-based
  /// `runtimeStorePath`/`liveStore` binding Web owns and this port must not
  /// touch or duplicate). Concurrency is Nutrition's OWN actual model —
  /// `expectedCurrentVersionId` against the protocol's `currentVersionId`
  /// — not the Recovery/Tracking `expectedRevision` counter.
  async function saveNutritionStrategy(context) {
    const { candidate, before } = await loadCandidate(NUTRITION_STRATEGY_READ_COLLECTIONS, context.ownerUserId);
    const protocol = (candidate.protocols ?? []).find((item) =>
      item.id === context.payload.protocolId &&
      item.userId === context.ownerUserId &&
      item.status === "active" &&
      (item.protocolType ?? item.category) === "nutrition"
    );
    if (!protocol) {
      throw problem(404, "NUTRITION_STRATEGY_UNAVAILABLE", "This strategy is no longer available.");
    }
    const version = protocol.currentVersionId
      ? (candidate.protocolVersions ?? []).find((item) => item.id === protocol.currentVersionId)
      : null;
    if (!version) {
      throw problem(404, "NUTRITION_STRATEGY_UNAVAILABLE", "This strategy is not ready to edit.");
    }
    const draft = context.payload.draft ?? {};
    const form = {
      get: (key) => ({
        proteinBasis: draft.proteinBasis,
        proteinRatio: draft.proteinRatio,
        fixedProtein: draft.fixedProteinGrams,
        carbohydrateStrategy: draft.carbohydrateStrategy,
        fatStrategy: draft.fatStrategy,
      }[key] ?? null),
    };
    const built = buildStrategySuccessorPayload({ form, protocol, strategyType: "nutrition", version });
    if (!built.valid) {
      if (built.outcome === "unchanged_successor") {
        return unchangedNutritionOutcome(protocol);
      }
      throw problem(400, "NUTRITION_STRATEGY_INVALID", built.error ?? "This strategy could not be saved.");
    }
    const goalId = protocol.currentGoalIds?.[0] ?? protocol.relatedGoalIds?.[0] ?? null;
    const command = {
      protocolId: protocol.id,
      expectedCurrentVersionId: context.payload.expectedCurrentVersionId,
      successorVersion: built.successorVersion,
      effectiveDate: getLocalDateKey(),
      goalAssociation: { goalId, relationship: "supports" },
      provenance: {
        author: {
          type: "user",
          id: context.ownerUserId,
          displayName: candidate.user?.displayName ?? candidate.user?.name ?? "Founder",
        },
        reason: "Update active nutrition strategy.",
        confirmation: { confirmedByUser: true, authority: "founder_direct_strategy_edit" },
        details: { source: "native_direct_strategy_edit" },
      },
    };
    const prepared = prepareActiveProtocolSuccessorTransition(candidate, command, now());
    if (!prepared.ok) {
      if (prepared.outcome === ActiveProtocolSuccessorOutcome.EXPECTED_VERSION_CONFLICT) {
        throw staleVersionProblem({
          expectedVersion: context.payload.expectedCurrentVersionId,
          actualVersion: protocol.currentVersionId,
          resource: `protocol:${protocol.id}`,
        });
      }
      if (prepared.outcome === ActiveProtocolSuccessorOutcome.UNCHANGED_SUCCESSOR) {
        return unchangedNutritionOutcome(protocol);
      }
      const status = prepared.outcome === ActiveProtocolSuccessorOutcome.DUPLICATE_SUCCESSOR ? 409 : 400;
      throw problem(status, "NUTRITION_STRATEGY_INVALID", prepared.reason ?? "This strategy could not be saved.");
    }
    applyPreparedActiveProtocolSuccessor(candidate, prepared);
    if (!verifyActiveProtocolSuccessorState(candidate, protocol.id, prepared.successor.id)) {
      throw problem(500, "NUTRITION_STRATEGY_PERSISTENCE_FAILED", "We could not confirm this strategy update. Nothing was changed.");
    }
    await persistCandidateCollections({
      before, candidate, collections: NUTRITION_STRATEGY_BOUNDED_COLLECTIONS, ownerUserId: context.ownerUserId,
    });
    return {
      status: "committed",
      result: {
        status: "updated",
        protocolId: protocol.id,
        currentVersionId: prepared.successor.id,
      },
      outbox: [],
    };
  }

  function unchangedNutritionOutcome(protocol) {
    return {
      status: "committed",
      result: { status: "unchanged", protocolId: protocol.id, currentVersionId: protocol.currentVersionId },
      outbox: [],
    };
  }

  /// Native peptide Support save — a bounded canonical transaction around
  /// the exact pure transition Web's PeptideExecutionManagementService also
  /// invokes. executionRevision remains the concurrency authority; dosing
  /// timeline replacement/history and reminder synchronization are applied
  /// and persisted together inside the enclosing command transaction.
  async function savePeptideSupport(context) {
    const { candidate, before } = await loadCandidate(PEPTIDE_SUPPORT_READ_COLLECTIONS, context.ownerUserId);
    const requested = context.payload.draft ?? {};
    const draft = buildPeptideSupportDraft({
      supportSchedule: requested.supportSchedule,
      dosingStrategy: requested.dosingStrategy,
      timingContext: requested.timingContext,
      reminderPreference: requested.reminderPreference,
      notes: requested.notes,
    });
    const prepared = preparePeptideExecutionTransition(candidate, {
      protocolId: context.payload.protocolId,
      userId: context.ownerUserId,
      expectedRevision: context.metadata.expectedVersion,
      draft,
      author: {
        type: "user",
        id: context.ownerUserId,
        displayName: candidate.user?.displayName ?? candidate.user?.name ?? "Founder",
      },
      synchronizeReminder: true,
      preservePriority: true,
      preserveTimelineHistory: true,
    }, now());
    if (!prepared.ok) {
      if (prepared.outcome === PeptideExecutionOutcome.NOT_FOUND) {
        throw problem(404, "PEPTIDE_SUPPORT_UNAVAILABLE", prepared.reason);
      }
      if (prepared.outcome === PeptideExecutionOutcome.VERSION_CONFLICT) {
        const protocol = (candidate.protocols ?? []).find((item) => item.id === context.payload.protocolId);
        const current = protocol
          ? classifyPeptideExecutionState({ protocol, executionItems: candidate.executionItems ?? [] }).record
          : null;
        throw staleVersionProblem({
          expectedVersion: context.metadata.expectedVersion,
          actualVersion: current?.executionRevision ?? (current ? 1 : null),
          resource: `peptide-execution:${context.payload.protocolId}`,
        });
      }
      if (prepared.outcome === PeptideExecutionOutcome.UNCHANGED) {
        const protocol = (candidate.protocols ?? []).find((item) => item.id === context.payload.protocolId);
        const current = protocol
          ? classifyPeptideExecutionState({ protocol, executionItems: candidate.executionItems ?? [] }).record
          : null;
        return {
          status: "committed",
          result: {
            status: "unchanged",
            protocolId: context.payload.protocolId,
            executionId: current?.id ?? null,
            executionRevision: current?.executionRevision ?? (current ? 1 : null),
          },
          outbox: [],
        };
      }
      throw problem(400, "PEPTIDE_SUPPORT_INVALID", prepared.reason ?? "This peptide Support plan is invalid.");
    }
    const result = applyPreparedPeptideExecutionTransition(candidate, prepared);
    if (!verifyPreparedPeptideExecutionTransition(candidate, prepared)) {
      throw problem(500, "PEPTIDE_SUPPORT_PERSISTENCE_FAILED", "We could not confirm this peptide Support update. Nothing was changed.");
    }
    await persistCandidateCollections({
      before,
      candidate,
      collections: PEPTIDE_SUPPORT_BOUNDED_COLLECTIONS,
      ownerUserId: context.ownerUserId,
    });
    return {
      status: "committed",
      result: {
        status: "updated",
        protocolId: context.payload.protocolId,
        executionId: result.executionId,
        executionRevision: result.executionRevision,
      },
      outbox: [],
    };
  }

  async function saveSupplementSupport(context) {
    const { candidate, before } = await loadCandidate(SUPPLEMENT_SUPPORT_READ_COLLECTIONS, context.ownerUserId);
    const protocol = (candidate.protocols ?? []).find((item) =>
      item.id === context.payload.protocolId && item.userId === context.ownerUserId && item.category === "supplement"
    );
    const version = (candidate.protocolVersions ?? []).find((item) => item.id === protocol?.currentVersionId);
    const goalId = version?.goalLinks?.[0]?.goalId ?? protocol?.currentGoalIds?.[0] ?? protocol?.relatedGoalIds?.[0] ?? null;
    const prepared = prepareSupplementSupportTransition(candidate, {
      protocolId: context.payload.protocolId,
      userId: context.ownerUserId,
      expectedRevision: context.metadata.expectedVersion,
      supplementVersionId: context.payload.supplementVersionId,
      goalId,
      draft: context.payload.draft,
      author: {
        type: "user",
        id: context.ownerUserId,
        displayName: candidate.user?.displayName ?? candidate.user?.name ?? "Founder",
      },
    }, now());
    if (!prepared.ok) {
      if (prepared.outcome === SupplementSupportOutcome.NOT_FOUND) {
        throw problem(404, "SUPPLEMENT_SUPPORT_UNAVAILABLE", prepared.reason);
      }
      if (prepared.outcome === SupplementSupportOutcome.VERSION_CONFLICT) {
        const execution = (candidate.executionItems ?? []).find((item) =>
          item.type === "supplement" && item.protocolRootId === context.payload.protocolId
        );
        throw staleVersionProblem({
          expectedVersion: context.metadata.expectedVersion ?? context.payload.supplementVersionId,
          actualVersion: execution?.executionRevision ?? protocol?.currentVersionId ?? null,
          resource: `supplement-support:${context.payload.protocolId}`,
        });
      }
      if (prepared.outcome === SupplementSupportOutcome.UNCHANGED) {
        const execution = (candidate.executionItems ?? []).find((item) =>
          item.type === "supplement" && item.protocolRootId === context.payload.protocolId
        );
        return {
          status: "committed",
          result: {
            status: "unchanged",
            protocolId: context.payload.protocolId,
            executionId: execution?.id ?? null,
            executionRevision: execution?.executionRevision ?? null,
            reminderId: (candidate.reminders ?? []).find((item) =>
              item.type === "supplement_reminder" && item.linkedEntityId === context.payload.protocolId
            )?.id ?? null,
          },
          outbox: [],
        };
      }
      throw problem(400, "SUPPLEMENT_SUPPORT_INVALID", prepared.reason ?? "This Supplement Support plan is invalid.");
    }
    const result = applyPreparedSupplementSupportTransition(candidate, prepared);
    if (!verifyPreparedSupplementSupportTransition(candidate, prepared)) {
      throw problem(500, "SUPPLEMENT_SUPPORT_PERSISTENCE_FAILED", "We could not confirm this Supplement Support update. Nothing was changed.");
    }
    await persistCandidateCollections({
      before,
      candidate,
      collections: SUPPLEMENT_SUPPORT_BOUNDED_COLLECTIONS,
      ownerUserId: context.ownerUserId,
    });
    return {
      status: "committed",
      result: { status: "updated", protocolId: context.payload.protocolId, ...result },
      outbox: [],
    };
  }

  async function saveSupplementStrategy(context) {
    const operation = context.payload.operation;
    if (!["create", "edit"].includes(operation)) {
      throw problem(400, "SUPPLEMENT_STRATEGY_INVALID", "Choose a supported Supplement strategy operation.");
    }
    const { candidate, before } = await loadCandidate(SUPPLEMENT_STRATEGY_READ_COLLECTIONS, context.ownerUserId);
    const draft = context.payload.draft ?? {};
    const protocolId = operation === "create"
      ? createSupplementProtocolId(draft.name, context.metadata.commandId)
      : draft.protocolId;
    const prepared = applySupplementStrategyOperation(candidate, operation, {
      ...draft,
      protocolId,
      userId: context.ownerUserId,
      effectiveDate: getLocalDateKey(
        now(), resolveLocalTimeZone(candidate.user?.timeZone ?? candidate.user?.timezone)
      ),
      initialStatus: draft.initialStatus ?? "active",
      provenance: buildSupplementProvenance(
        candidate.user,
        operation === "create" ? "Add supplement strategy." : "Update supplement strategy.",
        operation === "create" ? "native_supplement_creation" : "native_supplement_strategy_edit",
      ),
    }, now());
    return persistSupplementStrategyResult({ candidate, before, context, prepared });
  }

  async function changeSupplementLifecycle(context) {
    const operation = context.payload.operation;
    if (!["pause", "restore"].includes(operation)) {
      throw problem(400, "SUPPLEMENT_LIFECYCLE_INVALID", "Choose Pause or Restore.");
    }
    const { candidate, before } = await loadCandidate(SUPPLEMENT_STRATEGY_READ_COLLECTIONS, context.ownerUserId);
    const prepared = applySupplementStrategyOperation(candidate, operation, {
      protocolId: context.payload.protocolId,
      expectedCurrentVersionId: context.payload.expectedCurrentVersionId,
      userId: context.ownerUserId,
      effectiveDate: getLocalDateKey(
        now(), resolveLocalTimeZone(candidate.user?.timeZone ?? candidate.user?.timezone)
      ),
      provenance: buildSupplementProvenance(
        candidate.user,
        operation === "pause" ? "Pause supplement strategy." : "Restore supplement strategy.",
        operation === "pause" ? "native_supplement_pause" : "native_supplement_restore",
      ),
    }, now());
    return persistSupplementStrategyResult({ candidate, before, context, prepared });
  }

  async function persistSupplementStrategyResult({ candidate, before, context, prepared }) {
    if (!prepared.ok) {
      if (prepared.outcome === SupplementManagementOutcome.NOT_FOUND) {
        throw problem(404, "SUPPLEMENT_STRATEGY_UNAVAILABLE", prepared.reason);
      }
      if (prepared.outcome === SupplementManagementOutcome.VERSION_CONFLICT) {
        const protocolId = context.payload.protocolId ?? context.payload.draft?.protocolId;
        const current = (candidate.protocols ?? []).find((item) => item.id === protocolId);
        throw staleVersionProblem({
          expectedVersion: context.payload.expectedCurrentVersionId ?? context.payload.draft?.expectedCurrentVersionId,
          actualVersion: current?.currentVersionId ?? null,
          resource: `supplement-strategy:${protocolId ?? "new"}`,
        });
      }
      if (prepared.outcome === SupplementManagementOutcome.NO_CHANGES) {
        return { status: "committed", result: { status: "unchanged" }, outbox: [] };
      }
      const status = prepared.outcome === SupplementManagementOutcome.DUPLICATE ? 409 : 400;
      throw problem(status, prepared.outcome === SupplementManagementOutcome.DUPLICATE
        ? "SUPPLEMENT_STRATEGY_DUPLICATE" : "SUPPLEMENT_STRATEGY_INVALID", prepared.reason);
    }
    if (!verifySupplementStrategyOperation(candidate, prepared)) {
      throw problem(500, "SUPPLEMENT_STRATEGY_PERSISTENCE_FAILED", "We could not confirm this Supplement strategy update. Nothing was changed.");
    }
    await persistCandidateCollections({
      before,
      candidate,
      collections: SUPPLEMENT_STRATEGY_BOUNDED_COLLECTIONS,
      ownerUserId: context.ownerUserId,
    });
    return {
      status: "committed",
      result: {
        status: "updated",
        operation: prepared.operation,
        protocolId: prepared.value.protocolId,
        currentVersionId: (candidate.protocols ?? []).find((item) => item.id === prepared.value.protocolId)?.currentVersionId ?? prepared.value.versionId,
        lifecycleState: (candidate.protocols ?? []).find((item) => item.id === prepared.value.protocolId)?.status ?? "active",
      },
      outbox: [],
    };
  }

  /// Training strategy save — same ActiveProtocolSuccessorService
  /// orchestration as Nutrition (expectedCurrentVersionId concurrency, not
  /// Recovery's expectedRevision), but reuses `buildTraining`'s validation
  /// via a form adapter that also implements `getAll` — unlike
  /// `buildNutrition`, `buildTraining` reads `priorities` with
  /// `form.getAll("priorities")`, not `form.get`.
  async function saveTrainingStrategy(context) {
    const { candidate, before } = await loadCandidate(TRAINING_STRATEGY_READ_COLLECTIONS, context.ownerUserId);
    const protocol = (candidate.protocols ?? []).find((item) =>
      item.id === context.payload.protocolId &&
      item.userId === context.ownerUserId &&
      item.status === "active" &&
      (item.protocolType ?? item.category) === "training"
    );
    if (!protocol) {
      throw problem(404, "TRAINING_STRATEGY_UNAVAILABLE", "This strategy is no longer available.");
    }
    const version = protocol.currentVersionId
      ? (candidate.protocolVersions ?? []).find((item) => item.id === protocol.currentVersionId)
      : null;
    if (!version) {
      throw problem(404, "TRAINING_STRATEGY_UNAVAILABLE", "This strategy is not ready to edit.");
    }
    const draft = context.payload.draft ?? {};
    const frequencyByArea = Object.fromEntries(
      (draft.frequencies ?? []).map((entry) => [entry.area, entry.count])
    );
    const form = {
      get: (key) => {
        if (key === "progression") return draft.progression ?? null;
        if (key.startsWith("frequency_")) {
          const area = key.slice("frequency_".length);
          return frequencyByArea[area] ?? null;
        }
        return null;
      },
      getAll: (key) => (key === "priorities" ? (draft.priorities ?? []) : []),
    };
    const built = buildStrategySuccessorPayload({ form, protocol, strategyType: "training", version });
    if (!built.valid) {
      if (built.outcome === "unchanged_successor") {
        return unchangedTrainingOutcome(protocol);
      }
      throw problem(400, "TRAINING_STRATEGY_INVALID", built.error ?? "This strategy could not be saved.");
    }
    const goalId = protocol.currentGoalIds?.[0] ?? protocol.relatedGoalIds?.[0] ?? null;
    const command = {
      protocolId: protocol.id,
      expectedCurrentVersionId: context.payload.expectedCurrentVersionId,
      successorVersion: built.successorVersion,
      effectiveDate: getLocalDateKey(),
      goalAssociation: { goalId, relationship: "supports" },
      provenance: {
        author: {
          type: "user",
          id: context.ownerUserId,
          displayName: candidate.user?.displayName ?? candidate.user?.name ?? "Founder",
        },
        reason: "Update active training strategy.",
        confirmation: { confirmedByUser: true, authority: "founder_direct_strategy_edit" },
        details: { source: "native_direct_strategy_edit" },
      },
    };
    const prepared = prepareActiveProtocolSuccessorTransition(candidate, command, now());
    if (!prepared.ok) {
      if (prepared.outcome === ActiveProtocolSuccessorOutcome.EXPECTED_VERSION_CONFLICT) {
        throw staleVersionProblem({
          expectedVersion: context.payload.expectedCurrentVersionId,
          actualVersion: protocol.currentVersionId,
          resource: `protocol:${protocol.id}`,
        });
      }
      if (prepared.outcome === ActiveProtocolSuccessorOutcome.UNCHANGED_SUCCESSOR) {
        return unchangedTrainingOutcome(protocol);
      }
      const status = prepared.outcome === ActiveProtocolSuccessorOutcome.DUPLICATE_SUCCESSOR ? 409 : 400;
      throw problem(status, "TRAINING_STRATEGY_INVALID", prepared.reason ?? "This strategy could not be saved.");
    }
    applyPreparedActiveProtocolSuccessor(candidate, prepared);
    if (!verifyActiveProtocolSuccessorState(candidate, protocol.id, prepared.successor.id)) {
      throw problem(500, "TRAINING_STRATEGY_PERSISTENCE_FAILED", "We could not confirm this strategy update. Nothing was changed.");
    }
    await persistCandidateCollections({
      before, candidate, collections: TRAINING_STRATEGY_BOUNDED_COLLECTIONS, ownerUserId: context.ownerUserId,
    });
    return {
      status: "committed",
      result: {
        status: "updated",
        protocolId: protocol.id,
        currentVersionId: prepared.successor.id,
      },
      outbox: [],
    };
  }

  function unchangedTrainingOutcome(protocol) {
    return {
      status: "committed",
      result: { status: "unchanged", protocolId: protocol.id, currentVersionId: protocol.currentVersionId },
      outbox: [],
    };
  }

  /// My Library membership — the only state that can't be inferred from
  /// canonical TrainingSession history (a performed exercise needs no
  /// membership record of its own; `CoreNavigationReadService.getTrainingLogger`
  /// unions this with the performed-exercise set). Idempotent: adding an
  /// already-member exercise is a no-op success, not an error, since Native
  /// calls this on every All Exercises selection without first checking
  /// membership itself.
  async function addToMyLibrary(context) {
    const canonicalExerciseId = String(context.payload.canonicalExerciseId ?? "").trim();
    if (!canonicalExerciseId) {
      throw problem(400, "MY_LIBRARY_EXERCISE_ID_REQUIRED", "A canonical exercise id is required.");
    }
    const existing = await records.get({
      ownerUserId: context.ownerUserId, collection: "myLibraryMemberships", recordId: canonicalExerciseId,
    });
    if (existing) {
      return { status: "committed", result: { status: "already_member", canonicalExerciseId }, outbox: [] };
    }
    await records.put({
      ownerUserId: context.ownerUserId, collection: "myLibraryMemberships", recordId: canonicalExerciseId,
      payload: { id: canonicalExerciseId, canonicalExerciseId, addedAt: now().toISOString() },
      sourceIdentity: canonicalExerciseId,
    });
    return { status: "committed", result: { status: "added", canonicalExerciseId }, outbox: [] };
  }

  /// Create New Exercise — the standalone creation path reachable from the
  /// Workout Logger's Add Exercise flow, independent of completing a
  /// workout (the inline provisional-exercise path inside
  /// `commitTrainingSession`/`createNativeTrainingPackage` below stays
  /// exactly as it was; this is a second, deliberate entry point, not a
  /// replacement). Reuses `createCanonicalExerciseDefinition` and
  /// `findCanonicalExerciseConflict` — the SAME full-catalog (static +
  /// runtime-created) duplicate-checking Web's own creation flow already
  /// relies on — so canonical duplicate/matching policy stays server-owned
  /// and lives in exactly one place. A genuinely new exercise immediately
  /// enters My Library, since there is no history yet to imply membership.
  async function createCanonicalExercise(context) {
    const existingLibrary = await records.list({
      ownerUserId: context.ownerUserId, collection: "canonicalExerciseLibrary",
    });
    let definition;
    try {
      definition = createCanonicalExerciseDefinition({
        canonicalName: context.payload.canonicalName,
        primaryMuscleGroupId: context.payload.primaryMuscleGroupId,
        equipment: context.payload.equipment,
        movementPattern: context.payload.movementPattern,
        bodyRegion: context.payload.bodyRegion,
        laterality: context.payload.laterality,
        aliases: context.payload.aliases,
        createdAt: now().toISOString(),
      });
    } catch (error) {
      throw canonicalValidationProblem(error);
    }
    const conflicts = findCanonicalExerciseConflicts(definition, existingLibrary);
    const conflict = conflicts[0];
    if (conflict) {
      throw new ApplicationProblem({
        status: 409,
        code: "CANONICAL_EXERCISE_DUPLICATE",
        title: "An existing canonical exercise already matches this name.",
        detail: `"${context.payload.canonicalName}" matches the existing canonical exercise "${conflict.name}".`,
        recovery: {
          ...(conflicts.length === 1 ? { existingCanonicalExerciseId: conflict.id, existingCanonicalExerciseName: conflict.name } : {}),
          candidates: conflicts.map((item) => ({ id: item.id, name: item.name })),
        },
      });
    }
    await records.put({
      ownerUserId: context.ownerUserId, collection: "canonicalExerciseLibrary", recordId: definition.id,
      payload: definition, sourceIdentity: definition.id,
    });
    await records.put({
      ownerUserId: context.ownerUserId, collection: "myLibraryMemberships", recordId: definition.id,
      payload: { id: definition.id, canonicalExerciseId: definition.id, addedAt: now().toISOString() },
      sourceIdentity: definition.id,
    });
    return { status: "committed", result: { status: "created", exercise: definition }, outbox: [] };
  }

  async function commitMorningCheckIn(context, { reconcilePreviousDayPriorities }) {
    const date = context.payload.localDate;
    const weightId = `weight_${date.replaceAll("-", "_")}`;
    const existingWeight = await records.get({
      ownerUserId: context.ownerUserId,
      collection: "weightEntries",
      recordId: weightId,
    });
    if (existingWeight && Number(existingWeight.weight?.value) !== Number(context.payload.value)) {
      requireExpectedVersion(context, existingWeight, `weight:${date}`);
    }
    const collections = [...new Set([
      ...MORNING_CHECK_IN_BOUNDED_READ_COLLECTIONS,
      ...MORNING_CHECK_IN_BOUNDED_COLLECTIONS,
    ])];
    const { candidate, before } = await loadCandidate(collections, context.ownerUserId);
    const recordedAt = context.payload.recordedAt ?? context.metadata.clientOccurredAt ?? now().toISOString();
    const result = await createMorningCheckInPersistenceService({
      runtimeStorePath: "/tmp/physiqueos-native-morning-check-in.json",
      liveStore: candidate,
      now: () => new Date(recordedAt),
      mutateCanonicalRuntime: (input) => mutateCandidateRuntime(candidate, context.metadata.commandId, input),
    }).save({
      user: candidate.user,
      weightValue: Number(context.payload.value),
      measurementDate: date,
      createdAt: recordedAt,
      at: recordedAt,
      notes: context.payload.notes ?? null,
      protocolChangeNote: context.payload.protocolChangeNote ?? null,
      estimatedCalories: finiteOrNull(context.payload.estimatedCalories),
      estimatedCaloriesBurned: finiteOrNull(context.payload.estimatedCaloriesBurned),
      proteinTarget: finiteOrNull(context.payload.proteinTarget),
      proteinAchieved: finiteOrNull(context.payload.proteinAchieved),
      weighInContext: context.payload.weighInContext ?? null,
      reconcilePreviousDayPriorities,
      reconciliationSubmissions: context.payload.reconciliationSubmissions ?? [],
    });
    const persisted = await persistCandidateCollections({
      before,
      candidate,
      collections: MORNING_CHECK_IN_BOUNDED_COLLECTIONS,
      ownerUserId: context.ownerUserId,
    });
    const weight = candidate.weightEntries?.find((item) => item.id === weightId) ?? null;
    const checkInId = `daily_check_in_${date.replaceAll("-", "_")}`;
    const checkIn = candidate.dailyCheckIns?.find((item) => item.id === checkInId) ?? null;
    return {
      status: "committed",
      result: {
        status: result.status,
        weightId: weight?.id ?? null,
        weightRevision: persisted.get(`weightEntries:${weightId}`)?.version ?? existingWeight?.version ?? null,
        checkInId: checkIn?.id ?? null,
        checkInRevision: persisted.get(`dailyCheckIns:${checkInId}`)?.version ?? checkIn?.version ?? null,
        analysisId: result.analysisId ?? null,
        intendedDate: date,
        goalIds: weight?.relatedGoalIds ?? [],
        continuationWorkItemIds: result.briefingReconciliation?.workItemIds ?? [],
      },
      outbox: [],
    };
  }

  async function completeCanonicalPriority(context) {
    const id = String(context.payload.priorityId);
    const current = await ownedRecord(context, "reminders", id);
    const occurrenceDate = String(context.payload.occurrenceDate);
    if (isReminderOccurrenceCompleted(current, { occurrenceDate, timeZone: context.metadata.clientTimeZone })) {
      return {
        status: "committed",
        result: {
          status: "already_completed",
          priorityId: id,
          occurrenceDate,
          occurrenceKey: createPriorityOccurrenceKey(id, occurrenceDate),
          execution: resolvePriorityExecutionContract({ reminder: current, occurrenceDate }),
          revision: current.version,
        },
        outbox: [],
      };
    }
    requireExpectedVersion(context, current, `priority:${id}`);
    const reminders = [structuredClone(current)];
    const repository = createReminderRepository(reminders);
    const completedAt = context.payload.completedAt ?? now().toISOString();
    if (context.payload.dose && context.payload.protocolId) {
      await repository.completeReminderFromEvidence(id, {
        id: `${id}:${occurrenceDate}`,
        completedAt,
        evidenceDate: occurrenceDate,
        effectiveDose: context.payload.dose,
        protocolId: context.payload.protocolId,
        satisfactionType: "scheduled_protocol_execution",
        canonicalEvidenceId: null,
      });
    } else {
      await repository.completeReminder(id, completedAt, { occurrenceDate });
    }
    const updated = await records.put({
      ownerUserId: context.ownerUserId,
      collection: "reminders",
      recordId: id,
      expectedVersion: current.version,
      payload: { ...reminders[0], provenance: commandProvenance(context) },
    });
    return {
      status: "committed",
      result: {
        status: "completed",
        priorityId: id,
        occurrenceDate,
        occurrenceKey: createPriorityOccurrenceKey(id, occurrenceDate),
        execution: resolvePriorityExecutionContract({ reminder: updated, occurrenceDate }),
        completedAt,
        revision: updated.version,
      },
      outbox: [],
    };
  }

  async function commitTrainingSession(context) {
    const startedAt = performance.now();
    const packageStartedAt = performance.now();
    const prepared = await createNativeTrainingPackage(context);
    const packageDurationMs = roundedDuration(packageStartedAt);
    const packageAndObject = prepared.evidencePackage;
    const supportingReview = prepared.supportingReview;
    // A Logger command is already a reviewed, structured write. Sending it
    // through the generic nine-step Evidence Review orchestrator made the
    // HTTP request wait behind compatibility, analysis, Goal, Event,
    // Briefing, and Home work before it could truthfully acknowledge the
    // TrainingSession. Commit the minimum canonical package directly inside
    // the idempotent command transaction instead. The bounded canonical
    // commit retains duplicate/reconciliation fences and required Activity
    // consistency while downstream work remains represented by its durable
    // work items.
    const canonicalCommitStartedAt = performance.now();
    const commit = await commitCanonicalEvidencePackage(context, packageAndObject);
    const canonicalCommitDurationMs = roundedDuration(canonicalCommitStartedAt);
    const canonicalId = `training|authoritative|training_logger_draft_${context.payload.sessionId}`;
    const durableReadbackStartedAt = performance.now();
    const record = commit.canonicalEvidenceObjects.find((item) => item.canonicalId === canonicalId) ??
      (await records.list({
        ownerUserId: context.ownerUserId,
        collection: "canonicalEvidenceObjects",
      })).find((item) => item.canonicalId === canonicalId) ?? null;
    const durableReadbackDurationMs = roundedDuration(durableReadbackStartedAt);
    if (!record || record.quality?.status === "superseded") {
      throw problem(500, "TRAINING_SESSION_NOT_DURABLE", "The canonical Training session was not durable after commit.");
    }

    // The Logger command bypasses the Evidence Review orchestrator, so its
    // durable performance events are derived here, through the same idempotent
    // reconciliation the review path uses, inside this command's transaction.
    // A derivation that cannot complete (a producer error or an event identity
    // collision) is deferred and never blocks the session. A store failure while
    // writing the events fails the whole command atomically, so the client's
    // idempotent retry re-derives them; a partial event batch is never left.
    await reconcileCommittedSessionPerformanceEvents(context, {
      canonicalId,
      evidencePackage: packageAndObject,
      supportingReviewId: supportingReview?.id ?? null,
    });

    // A legacy caller may still supply an already-interpreted supporting
    // review in the same command. Preserve it as an auditable confirmed
    // source after the exact canonical package commits; modern Native uses
    // the independent target-bound intake path and does not enter here.
    let reviewRevision = supportingReview?.version ?? null;
    if (supportingReview) {
      const updated = await records.put({
        ownerUserId: context.ownerUserId,
        collection: "evidenceReviews",
        recordId: supportingReview.id,
        expectedVersion: supportingReview.version,
        sourceIdentity: context.metadata.idempotencyKey,
        payload: {
          ...supportingReview,
          status: "confirmed",
          updatedAt: now().toISOString(),
          interpretedEvidence: packageAndObject,
          confirmation: {
            confirmedAt: now().toISOString(),
            confirmedBy: context.ownerUserId,
            targetTrainingSessionCanonicalId: canonicalId,
          },
          commitProgress: {
            ...(supportingReview.commitProgress ?? {}),
            canonical_commit: {
              status: "completed",
              completedAt: now().toISOString(),
              result: { canonicalEvidenceIds: [canonicalId], status: "completed" },
            },
          },
          provenance: commandProvenance(context),
        },
      });
      reviewRevision = updated.version;
    }
    return {
      status: "committed",
      result: {
        status: "durable",
        reviewId: supportingReview?.id ?? null,
        reviewRevision,
        sessionId: context.payload.sessionId,
        intendedDate: context.payload.localDate,
        canonicalId,
        trainingSessionDurable: true,
        durationMs: roundedDuration(startedAt),
        stageDurations: {
          validationAndPackageMs: packageDurationMs,
          boundedCanonicalCommitMs: canonicalCommitDurationMs,
          durableReadbackMs: durableReadbackDurationMs,
        },
        exerciseIds: record.payload?.exercises?.map((item) => item.canonicalExerciseId).filter(Boolean) ?? [],
        continuationWorkItemIds: commit.briefingReconciliation?.workItemIds ?? [],
        lowerLevelWorkItemIds: (commit.lowerLevelWork ?? []).map((item) => item.workId).filter(Boolean),
      },
      outbox: [],
    };
  }

  function roundedDuration(startedAt) {
    return Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100);
  }

  async function commitDailyEvidence(context, { evidenceType, payload }) {
    const packageId = `${evidenceType}|native|${context.metadata.idempotencyKey}`;
    const evidencePackage = {
      id: packageId,
      package_id: packageId,
      userId: context.ownerUserId,
      source: { type: "native", deviceId: context.principal.deviceId },
      evidence_objects: [payload],
      review_metadata: {
        confirmedAt: context.metadata.clientOccurredAt ?? now().toISOString(),
        origin: "native_structured_write",
      },
    };
    const commit = await commitCanonicalEvidencePackage(context, evidencePackage);
    const record = commit.canonicalEvidenceObjects.find((item) => item.evidence_type === evidenceType) ?? null;
    return {
      status: "committed",
      result: {
        status: commit.outcome,
        canonicalId: record?.canonicalId ?? null,
        revision: record?.nutritionRevision?.revision ?? record?.activityRevision?.revision ?? null,
        recordVersion: record?.version ?? null,
        semanticFingerprint: record?.nutritionRevision?.semanticFingerprint ?? record?.activityRevision?.semanticFingerprint ?? null,
        intendedDate: context.payload.localDate,
        goalId: record?.goalId ?? null,
        phaseId: record?.phaseId ?? null,
        continuationWorkItemIds: commit.briefingReconciliation?.workItemIds ?? [],
        lowerLevelWorkItemIds: (commit.lowerLevelWork ?? []).map((item) => item.workId).filter(Boolean),
      },
      outbox: [],
    };
  }

  async function editDexaReview(context) {
    const review = await ownedRecord(context, "evidenceReviews", context.payload.reviewId);
    requireExpectedVersion(context, review, `evidence-review:${review.id}`);
    if (!["pending", "commit_failed"].includes(review.status)) {
      throw problem(409, "DEXA_REVIEW_NOT_EDITABLE", "This DEXA review cannot be edited.");
    }
    let matched = 0;
    const interpretedEvidence = {
      ...review.interpretedEvidence,
      evidence_objects: (review.interpretedEvidence?.evidence_objects ?? []).map((object) => {
        if (object.id !== context.payload.evidenceObjectId || !["dexa_scan", "dexa", "body_composition"].includes(object.evidence_type)) return object;
        matched += 1;
        const updated = applyDexaReviewMeasurements(object, context.payload.measurements);
        assertValidDexaScan(updated, { production: true });
        return updated;
      }),
    };
    if (matched !== 1) throw problem(404, "DEXA_EVIDENCE_UNAVAILABLE", "The DEXA scan is unavailable in this review.");
    const updated = await records.put({
      ownerUserId: context.ownerUserId,
      collection: "evidenceReviews",
      recordId: review.id,
      expectedVersion: review.version,
      payload: {
        ...review,
        interpretedEvidence,
        updatedAt: now().toISOString(),
        dexaMeasurementEditing: { updatedAt: now().toISOString(), updatedBy: context.ownerUserId },
      },
    });
    return {
      status: "committed",
      result: { status: "updated", reviewId: review.id, revision: updated.version, updatedAt: updated.updatedAt },
      outbox: [],
    };
  }

  async function requestEvidenceReviewConfirmation(context) {
    const review = await ownedRecord(context, "evidenceReviews", context.payload.reviewId);
    if (review.status === "confirmed") {
      return { status: "committed", result: { status: "confirmed", reviewId: review.id, revision: review.version }, outbox: [] };
    }
    requireExpectedVersion(context, review, `evidence-review:${review.id}`);
    if (!["pending", "commit_failed", "partially_committed", "committing"].includes(review.status)) {
      throw problem(409, "EVIDENCE_REVIEW_NOT_COMMITTABLE", "This evidence review cannot be committed.");
    }
    const persistedTargetCanonicalId =
      review.interpretedEvidence?.review_metadata?.targetTrainingSessionCanonicalId ?? null;
    const targetCanonicalId = context.payload.targetTrainingSessionCanonicalId ?? persistedTargetCanonicalId;
    if (context.payload.targetTrainingSessionCanonicalId && persistedTargetCanonicalId &&
        context.payload.targetTrainingSessionCanonicalId !== persistedTargetCanonicalId) {
      throw problem(409, "TRAINING_SUPPORTING_EVIDENCE_TARGET_MISMATCH", "The submitted Training target does not match the persisted intake target.");
    }
    if (targetCanonicalId) {
      // Canonical domain identity is intentionally independent of the
      // persistence record key (legacy production rows may still use
      // @index:*). Resolve and fence the exact domain identity without
      // assuming or migrating its storage identity.
      const targetMatches = (await records.list({
        ownerUserId: context.ownerUserId,
        collection: "canonicalEvidenceObjects",
      })).filter((record) => record.canonicalId === targetCanonicalId);
      if (targetMatches.length !== 1) {
        throw problem(409, "TRAINING_SUPPORTING_EVIDENCE_TARGET_UNAVAILABLE", "The exact target Training session is unavailable.");
      }
      const [target] = targetMatches;
      if (target.quality?.status === "superseded" || target.quality?.supersededBy) {
        throw problem(409, "TRAINING_SUPPORTING_EVIDENCE_TARGET_UNAVAILABLE", "The target Training session is no longer active.");
      }
      let interpretedEvidence;
      try {
        interpretedEvidence = bindTrainingSupportingEvidencePackage({
          evidencePackage: review.interpretedEvidence,
          targetCanonicalId,
          targetSession: target.payload,
        });
      } catch (error) {
        throw problem(409, "TRAINING_SUPPORTING_EVIDENCE_MATCH_REQUIRED", error.message);
      }
      const updated = await records.put({
        ownerUserId: context.ownerUserId,
        collection: "evidenceReviews",
        recordId: review.id,
        expectedVersion: review.version,
        payload: { ...review, interpretedEvidence, updatedAt: now().toISOString() },
      });
      return {
        status: "committed",
        result: { status: "confirmation_requested", reviewId: review.id, revision: updated.version },
        outbox: [],
      };
    }
    return {
      status: "committed",
      result: { status: "confirmation_requested", reviewId: review.id, revision: review.version },
      outbox: [],
    };
  }

  async function disposeEvidenceReview(context) {
    const review = await ownedRecord(context, "evidenceReviews", context.payload.reviewId);
    requireExpectedVersion(context, review, `evidence-review:${review.id}`);
    if (!["pending", "commit_failed"].includes(review.status)) {
      throw problem(409, "EVIDENCE_REVIEW_NOT_DISMISSIBLE", "This evidence review cannot be dismissed.");
    }
    const updatedAt = now().toISOString();
    const updated = await records.put({
      ownerUserId: context.ownerUserId,
      collection: "evidenceReviews",
      recordId: review.id,
      expectedVersion: review.version,
      payload: {
        ...review,
        status: "discarded",
        updatedAt,
        disposition: { discardedAt: updatedAt, discardedBy: context.ownerUserId },
        provenance: commandProvenance(context),
      },
    });
    return {
      status: "committed",
      result: { status: "discarded", reviewId: review.id, revision: updated.version, updatedAt },
      outbox: [],
    };
  }

  async function createNativeTrainingPackage(context) {
    const supportingReviewId = context.payload.supportingEvidenceReviewId ?? null;
    const supportingReviewVersion = context.payload.supportingEvidenceReviewVersion ?? null;
    if (Boolean(supportingReviewId) !== (supportingReviewVersion != null)) {
      throw problem(400, "TRAINING_SUPPORTING_EVIDENCE_INCOMPLETE", "Supporting workout evidence requires both review identity and version.");
    }
    let supportingReview = null;
    if (supportingReviewId) {
      supportingReview = await ownedRecord(context, "evidenceReviews", supportingReviewId);
      if (Number(supportingReviewVersion) !== Number(supportingReview.version)) {
        throw staleVersionProblem({
          expectedVersion: supportingReviewVersion,
          actualVersion: supportingReview.version,
          resource: `evidence-review:${supportingReview.id}`,
        });
      }
      if (!["pending", "commit_failed"].includes(supportingReview.status)) {
        throw problem(409, "TRAINING_SUPPORTING_EVIDENCE_UNAVAILABLE", "The supporting workout evidence is no longer available.");
      }
      const boundSessionId = supportingReview.interpretedEvidence?.review_metadata?.nativeTrainingSessionId;
      if (boundSessionId && String(boundSessionId) !== String(context.payload.sessionId)) {
        throw problem(409, "TRAINING_SUPPORTING_EVIDENCE_ALREADY_BOUND", "The supporting evidence is already bound to another Training session.");
      }
      const evidenceTypes = new Set([
        ...(supportingReview.evidenceTypes ?? []),
        ...(supportingReview.interpretedEvidence?.evidence_objects ?? []).map((item) => item?.evidence_type),
      ].filter(Boolean));
      if (evidenceTypes.size === 0 || [...evidenceTypes].some((type) => type !== "training")) {
        throw problem(400, "TRAINING_SUPPORTING_EVIDENCE_TYPE_MISMATCH", "Only Training screenshot evidence can be bound to a Training session.");
      }
      const evidenceDate = String(
        supportingReview.interpretedEvidence?.observed_date ??
        supportingReview.interpretedEvidence?.provenance?.evidence_date ?? "",
      ).slice(0, 10);
      if (evidenceDate !== context.payload.localDate) {
        throw problem(409, "TRAINING_SUPPORTING_EVIDENCE_DATE_MISMATCH", "Supporting evidence must match the Training session date.");
      }
    }
    const runtimeDefinitions = await records.list({
      ownerUserId: context.ownerUserId,
      collection: "canonicalExerciseLibrary",
    });
    const definitions = new Map([
      ...listCanonicalTrainingExerciseIdentities(),
      ...runtimeDefinitions,
    ].map((item) => [item.id, item]));
    const occurrences = context.payload.exercises.map((exercise, index) => {
      let definition = definitions.get(String(exercise.canonicalExerciseId));
      let createsCanonicalDefinition = false;
      if (!definition && exercise.provisionalExercise) {
        let candidate;
        try {
          candidate = createCanonicalExerciseDefinition({
            canonicalName: exercise.provisionalExercise.name,
            primaryMuscleGroupId: exercise.provisionalExercise.primaryMuscleGroupId,
          });
        } catch (error) {
          throw canonicalValidationProblem(error);
        }
        definition = findCanonicalExerciseConflict(candidate, runtimeDefinitions) ?? candidate;
        createsCanonicalDefinition = definition === candidate;
        definitions.set(definition.id, definition);
      }
      if (!definition) {
        throw problem(400, "CANONICAL_EXERCISE_UNAVAILABLE", `Exercise ${index + 1} does not identify a canonical exercise.`);
      }
      const occurrenceId = String(exercise.occurrenceId ?? `native_${context.payload.sessionId}_exercise_${index + 1}`);
      const sets = (exercise.sets ?? []).map((set, setIndex) => {
        const reps = set.reps == null ? null : Number(set.reps);
        const durationSeconds = set.durationSeconds == null ? null : Number(set.durationSeconds);
        const loadType = String(set.loadType ?? (set.unit === "bodyweight" ? "bodyweight" : "external_load"));
        const load = loadType === "bodyweight" ? 0 : Number(set.load ?? 0);
        if ((!Number.isFinite(reps) || reps <= 0) &&
            (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) {
          throw problem(400, "TRAINING_SET_INVALID", `Exercise ${index + 1}, set ${setIndex + 1} needs valid reps or duration.`);
        }
        if (!Number.isFinite(load) || load < 0 || !["bodyweight", "external_load"].includes(loadType)) {
          throw problem(400, "TRAINING_SET_INVALID", `Exercise ${index + 1}, set ${setIndex + 1} has invalid loading semantics.`);
        }
        const unit = String(loadType === "bodyweight" ? "bodyweight" : set.unit ?? "lb");
        if (!["lb", "kg", "bodyweight"].includes(unit)) {
          throw problem(400, "TRAINING_SET_UNIT_INVALID", "Training set unit must be lb, kg, or bodyweight.");
        }
        return {
          id: String(set.setId ?? `${occurrenceId}_set_${setIndex + 1}`),
          reps,
          durationSeconds,
          load,
          loadType,
          unit,
          confirmed: true,
        };
      });
      if (sets.length === 0) throw problem(400, "TRAINING_SETS_REQUIRED", `Exercise ${index + 1} requires at least one performed set.`);
      const occurrence = {
        id: occurrenceId,
        canonicalExerciseId: definition.id,
        name: definition.name,
        bodyRegion: definition.body_region,
        equipment: definition.equipment,
        executionVariant: exercise.executionVariant
          ? normalizeTrainingExecutionVariant(exercise.executionVariant)
          : null,
        sets,
      };
      if (exercise.provisionalExercise) {
        occurrence.resolutionStatus = createsCanonicalDefinition
          ? "resolved_new_canonical"
          : "resolved_existing_canonical";
        if (createsCanonicalDefinition) {
          occurrence.provisionalExercise = {
            provisionalExerciseId: `native_${context.payload.sessionId}_${occurrenceId}`,
            rawSubmittedName: exercise.provisionalExercise.name,
            normalizedDisplayName: definition.name,
            resolutionStatus: "resolved_new_canonical",
            resolutionMode: "new",
            resolvedCanonicalExerciseId: definition.id,
            confirmedDefinition: definition,
          };
        }
      }
      return occurrence;
    });
    const occurrenceIds = new Set(occurrences.map((item) => item.id));
    const exerciseRelationshipGroups = (context.payload.supersets ?? []).map((group, index) => {
      const members = (group.memberExerciseIds ?? []).map(String);
      if (members.length < 2 || members.some((id) => !occurrenceIds.has(id))) {
        throw problem(400, "TRAINING_SUPERSET_INVALID", `Superset ${index + 1} must reference at least two exercise occurrences in this session.`);
      }
      return createTrainingExerciseRelationshipGroup({
        id: group.id ?? `${context.payload.sessionId}_superset_${index + 1}`,
        memberExerciseIds: members,
        provenance_ref: `training_logger_draft_${context.payload.sessionId}`,
        relationshipType: "superset",
      });
    });
    const capturedAt = context.payload.capturedAt ?? context.metadata.clientOccurredAt ?? `${context.payload.localDate}T12:00:00.000Z`;
    const canonicalObjects = await records.list({ ownerUserId: context.ownerUserId, collection: "canonicalEvidenceObjects" });
    const supportingReconciliation = supportingReview ? createProductionAppleHealthReconciliation({
      batchId: supportingReview.interpretedEvidence?.package_id,
      canonicalObjects,
      evidenceObjects: supportingReview.interpretedEvidence?.evidence_objects ?? [],
      workoutDate: context.payload.localDate,
    }) : null;
    if (supportingReconciliation && supportingReconciliation.matchState !== "strong_match") {
      throw problem(409, "TRAINING_SUPPORTING_EVIDENCE_MATCH_REQUIRED", "Supporting screenshots must identify exactly one unlinked strength workout for this date.");
    }
    const evidencePackage = buildTrainingLoggerEvidencePackage({
      canonicalObjects,
      draft: {
        draftVersion: "training_logger_web_v1",
        draftId: context.payload.sessionId,
        mode: context.payload.mode ?? "retrospective",
        workoutDate: context.payload.localDate,
        startedAt: context.payload.startedAt ?? null,
        finishedAt: context.payload.finishedAt ?? null,
        exercises: occurrences,
        exerciseRelationshipGroups,
        reconciliation: supportingReconciliation ? {
          ...supportingReconciliation,
          finalized: true,
        } : {
          normalizedEvidence: [],
          selectedStrengthSourceId: null,
          continueWithoutStrength: true,
          additionalEvidenceActions: [],
          finalized: true,
        },
      },
      sourcePackage: supportingReview?.interpretedEvidence ?? null,
      userId: context.ownerUserId,
    });
    return {
      supportingReview,
      evidencePackage: {
        ...evidencePackage,
        captured_at: capturedAt,
        review_metadata: {
          ...(evidencePackage.review_metadata ?? {}),
          confirmedAt: capturedAt,
          origin: "native_training_logger",
          nativeTrainingSessionId: context.payload.sessionId,
          supportingEvidenceReviewId: supportingReview?.id ?? null,
        },
        evidence_objects: evidencePackage.evidence_objects.map((item) => ({
          ...item,
          captured_at: capturedAt,
          ...(item.evidence_type === "training" && (item.exercises ?? []).length > 0 ? {
            reconciliation: {
              ...(item.reconciliation ?? {}),
              canonical_id:
                `training|authoritative|training_logger_draft_${context.payload.sessionId}`,
            },
          } : {}),
        })),
      },
    };
  }

  async function reconcileCommittedSessionPerformanceEvents(context, {
    canonicalId,
    evidencePackage,
    supportingReviewId,
  }) {
    // Bounded load: only Training canonical objects (read, never mutated) and the
    // three event collections this step may write. The report needs the active
    // Training history, not the rest of the canonical runtime.
    const lowerLevelEnabled = isPITrainingConfidenceEnqueueEnabled();
    const writeCollections = [
      "trainingPerformanceEvents", "trainingPerformanceEventBatches", "piTrainingConfidenceWorkItems",
    ];
    const canonicalObjects = (await records.list({
      ownerUserId: context.ownerUserId, collection: "canonicalEvidenceObjects",
    })).filter((item) => (item.payload ?? item).evidence_type === "training");
    const canonicalSession = canonicalObjects.find((item) => item.canonicalId === canonicalId);
    if (!canonicalSession || canonicalSession.quality?.status === "superseded") {
      return { status: "skipped", reason: "session_not_active" };
    }
    const candidate = { canonicalEvidenceObjects: canonicalObjects };
    const before = new Map();
    for (const collection of writeCollections) {
      const values = await records.list({ ownerUserId: context.ownerUserId, collection });
      before.set(collection, structuredClone(values));
      candidate[collection] = structuredClone(values);
    }
    if (lowerLevelEnabled) {
      candidate.goals = structuredClone(await records.list({ ownerUserId: context.ownerUserId, collection: "goals" }));
    }
    let reconciliation;
    try {
      reconciliation = await reconcileTrainingPerformanceEvents({
        canonicalSessions: [canonicalSession],
        trainingAnalysis: createCommittedTrainingPerformanceAnalysis({
          canonicalObjects: candidate.canonicalEvidenceObjects,
          packageId: evidencePackage.package_id,
          capturedAt: evidencePackage.captured_at,
        }),
        sourceReviewId: supportingReviewId ?? `training_logger_session|${context.payload.sessionId}`,
        sourceEvidencePackageId: evidencePackage.package_id,
        lowerLevelEnabled,
        persistence: createTrainingPerformanceEventPersistenceService({
          mutateCanonicalRuntime: (input) =>
            mutateCandidateRuntime(candidate, context.metadata.commandId, input),
          now,
        }),
        now,
      });
    } catch (error) {
      // Derivation is pure until the in-memory candidate is mutated and nothing
      // is written before `persistCandidateCollections`, so a producer or
      // candidate failure leaves the durable TrainingSession untouched.
      return { status: "deferred", outcome: "derivation_failed", errorCode: error?.code ?? null };
    }
    if (reconciliation.failed) {
      return { status: "deferred", outcome: reconciliation.persistence.outcome };
    }
    await persistCandidateCollections({
      before,
      candidate,
      collections: writeCollections,
      ownerUserId: context.ownerUserId,
    });
    return {
      status: "completed",
      outcome: reconciliation.persistence.outcome,
      eventIds: reconciliation.events.map((event) => event.id),
    };
  }

  // Strategic Evidence write boundary: HealthKit-derived records are canonical
  // days in their own quarantined store and can never be committed as Evidence.
  function refuseQuarantinedHealthKitEvidence(objects) {
    for (const object of objects ?? []) {
      try {
        assertNotQuarantinedHealthKitEvidence(object, { context: "canonical Evidence commit" });
      } catch (error) {
        if (error instanceof HealthKitEvidenceQuarantineError) throw problem(409, error.code, error.message);
        throw error;
      }
    }
  }

  async function commitCanonicalEvidencePackage(context, evidencePackage) {
    refuseQuarantinedHealthKitEvidence(evidencePackage?.evidence_objects);
    const collections = [
      "user", "goals", "protocols", "protocolVersions", "dailyBriefings",
      "evidencePackages", "canonicalExerciseLibrary", "canonicalEvidenceObjects",
      "piEnergyConfidenceWorkItems", "piTrainingConfidenceWorkItems",
      "briefingReconciliationWorkItems",
    ];
    const { candidate, before } = await loadCandidate(collections, context.ownerUserId);
    let commit;
    try {
      commit = await createPILowerLevelCanonicalEvidenceCommitService({
        mutateCanonicalRuntime: (input) => mutateCandidateRuntime(candidate, context.metadata.commandId, input),
        now,
      }).commitConfirmedEvidencePackage(evidencePackage, context.ownerUserId);
    } catch (error) {
      throw canonicalValidationProblem(error);
    }
    if (["baseline_conflict", "persistence_failure", "committed_publication_failure"].includes(commit.outcome)) {
      throw new ApplicationProblem({
        status: commit.outcome === "baseline_conflict" ? 412 : 500,
        code: commit.errorCode ?? "CANONICAL_EVIDENCE_COMMIT_FAILED",
        title: commit.outcome === "baseline_conflict"
          ? "The canonical evidence changed before this command committed."
          : "The canonical evidence could not be committed.",
        detail: `Canonical evidence outcome: ${commit.outcome}.`,
      });
    }
    await persistCandidateCollections({
      before,
      candidate,
      collections: [
        "evidencePackages", "canonicalExerciseLibrary", "canonicalEvidenceObjects",
        "piEnergyConfidenceWorkItems", "piTrainingConfidenceWorkItems",
        "briefingReconciliationWorkItems",
      ],
      ownerUserId: context.ownerUserId,
    });
    const objectIds = new Set((evidencePackage.evidence_objects ?? []).map((item) => item.id));
    const packageId = evidencePackage.package_id;
    const canonicalEvidenceObjects = (candidate.canonicalEvidenceObjects ?? []).filter((item) =>
      item.provenance?.evidence_package_ids?.includes(packageId) ||
      item.provenance?.contributing_evidence_object_ids?.some((id) => objectIds.has(id))
    );
    return { ...commit, canonicalEvidenceObjects };
  }

  async function loadCandidate(collections, ownerUserId, { sourceOrder = false } = {}) {
    const candidate = {};
    const before = new Map();
    await Promise.all(collections.map(async (collection) => {
      const values = await records.list({ ownerUserId, collection, sourceOrder });
      before.set(collection, structuredClone(values));
      if (collection === "user") candidate.user = structuredClone(values[0] ?? null);
      else candidate[collection] = structuredClone(values);
    }));
    if (!candidate.user?.id || String(candidate.user.id) !== String(ownerUserId)) {
      throw problem(404, "RESOURCE_NOT_FOUND", "The canonical owner is unavailable.");
    }
    return { candidate, before };
  }

  async function persistCandidateCollections({ before, candidate, collections, ownerUserId }) {
    const persisted = new Map();
    for (const collection of collections) {
      const priorById = new Map((before.get(collection) ?? []).map((item, index) => [recordIdentity(item, index), item]));
      for (const [index, item] of (candidate[collection] ?? []).entries()) {
        const id = recordIdentity(item, index);
        const prior = priorById.get(id);
        if (prior && comparableRecord(prior) === comparableRecord(item)) continue;
        const stored = await records.put({
          ownerUserId,
          collection,
          recordId: id,
          payload: item,
          expectedVersion: prior?.version ?? null,
          sourceIdentity: item.provenance?.sourceIdentity ?? null,
        });
        candidate[collection][index] = structuredClone(stored);
        persisted.set(`${collection}:${id}`, stored);
      }
    }
    return persisted;
  }

  async function mutateCandidateRuntime(candidate, commandId, { mutate }) {
    const result = await mutate(candidate, { commandId });
    candidate.revision = Number(candidate.revision ?? 0) + 1;
    candidate.updatedAt = now().toISOString();
    candidate.lastCommitId = commandId;
    return {
      result,
      revision: candidate.revision,
      commitId: commandId,
      changedCollections: [],
      memoryProfile: null,
    };
  }

  function requireExpectedVersion(context, record, resource) {
    if (context.metadata.expectedVersion == null) {
      throw problem(428, "PRECONDITION_REQUIRED", "If-Match is required to correct an existing canonical resource.");
    }
    if (Number(context.metadata.expectedVersion) !== Number(record.version)) {
      throw staleVersionProblem({
        expectedVersion: context.metadata.expectedVersion,
        actualVersion: record.version,
        resource,
      });
    }
  }

  async function upsertCanonicalDay(context, {
    evidenceType,
    payload,
    serverOwnedDayRevision = false,
  }) {
    refuseQuarantinedHealthKitEvidence([payload]);
    const [existingCanonicalObjects, goals] = await Promise.all([
      records.list({ ownerUserId: context.ownerUserId, collection: "canonicalEvidenceObjects" }),
      records.list({ ownerUserId: context.ownerUserId, collection: "goals" }),
    ]);
    let reconciledPayload = payload;
    if (serverOwnedDayRevision && evidenceType === "activity_day") {
      const selection = selectActiveCanonicalActivityDays(existingCanonicalObjects, {
        date: context.payload.localDate,
        userId: context.ownerUserId,
      });
      if (selection.diagnostics.length > 0) {
        throw new Error(
          `Activity canonical invariant failed for ${context.payload.localDate}: multiple active days require explicit historical repair.`
        );
      }
      const existing = selection.records[0] ?? null;
      reconciledPayload = {
        ...payload,
        reconciliation: {
          ...(payload.reconciliation ?? {}),
          activity: {
            ...(payload.reconciliation?.activity ?? {}),
            expectedPriorSemanticFingerprint: existing
              ? getCanonicalActivitySemanticFingerprint(existing)
              : null,
          },
        },
      };
    }
    const packageId = `${evidenceType}|native|${context.metadata.idempotencyKey}`;
    const evidencePackage = {
      id: packageId,
      package_id: packageId,
      userId: context.ownerUserId,
      source: { type: "native", deviceId: context.principal.deviceId },
      evidence_objects: [reconciledPayload],
    };
    const reconciliation = reconcileConfirmedEvidencePackage({
      evidencePackage,
      existingCanonicalObjects,
      goals,
      userId: context.ownerUserId,
      mutationReason: `native_${evidenceType}_write`,
    });
    const existingById = new Map(existingCanonicalObjects.map((record) => [record.canonicalId, record]));
    const stored = [];
    for (const record of reconciliation.changedObjects) {
      const previous = existingById.get(record.canonicalId);
      stored.push(await records.put({
        ownerUserId: context.ownerUserId,
        collection: "canonicalEvidenceObjects",
        recordId: record.canonicalId,
        payload: record,
        expectedVersion: previous?.version ?? null,
        sourceIdentity: String(context.payload.sourceIdentity ?? packageId),
      }));
    }
    const current = stored.find((record) => record.evidence_type === evidenceType) ??
      reconciliation.changedObjects.find((record) => record.evidence_type === evidenceType) ??
      existingCanonicalObjects.find((record) => record.evidence_type === evidenceType && String(record.lastObservedAt).slice(0, 10) === context.payload.localDate) ?? null;
    return {
      status: "committed",
      result: {
        status: reconciliation.semanticChangedObjects.length > 0 ? "changed" : "unchanged",
        canonicalId: current?.canonicalId ?? null,
        revision: current?.nutritionRevision?.revision ?? current?.activityRevision?.revision ?? current?.version ?? null,
        semanticFingerprint: current?.nutritionRevision?.semanticFingerprint ?? current?.activityRevision?.semanticFingerprint ?? null,
      },
      outbox: [],
    };
  }

  function completeOccurrence(collection, idField, historyField, dateField = "occurrenceDate") {
    return async (context) => {
      const id = context.payload[idField];
      const current = await ownedRecord(context, collection, id);
      const occurrence = String(context.payload[dateField]);
      const history = Array.isArray(current[historyField]) ? current[historyField] : [];
      if (history.some((entry) => String(entry.occurrenceDate ?? entry.localDate) === occurrence)) {
        return outcome(context, current, "already_completed", collection, id);
      }
      return putExisting(context, collection, id, current, {
        [historyField]: [...history, { occurrenceDate: occurrence, localDate: occurrence, completedAt: now().toISOString(), commandId: context.metadata.commandId }],
        status: "completed",
      });
    };
  }

  async function mutateExisting(context, collection, id, changes) {
    const current = await ownedRecord(context, collection, id);
    return putExisting(context, collection, id, current, changes);
  }

  async function putExisting(context, collection, id, current, changes) {
    const updated = await records.put({
      ownerUserId: context.ownerUserId, collection, recordId: String(id),
      expectedVersion: context.metadata.expectedVersion,
      payload: { ...current, ...structuredClone(changes), id: current.id ?? id, userId: context.ownerUserId, provenance: commandProvenance(context) },
    });
    return outcome(context, updated, "committed", collection, id);
  }

  async function create(context, collection, id, payload, sourceIdentity = null) {
    const existing = await records.get({ ownerUserId: context.ownerUserId, collection, recordId: String(id) });
    if (existing) return outcome(context, existing, "already_exists", collection, id);
    const created = await records.put({ ownerUserId: context.ownerUserId, collection, recordId: String(id), payload, sourceIdentity });
    return outcome(context, created, "committed", collection, id);
  }

  async function ownedRecord(context, collection, id) {
    const record = await records.get({ ownerUserId: context.ownerUserId, collection, recordId: String(id) });
    if (!record || (record.userId != null && String(record.userId) !== String(context.ownerUserId))) {
      throw problem(404, "RESOURCE_NOT_FOUND", `Canonical ${collection} record is unavailable.`);
    }
    return record;
  }

  function outcome(context, record, status = "committed", collection = "unknown", recordId = record?.id ?? "unknown") {
    return {
      status: "committed",
      result: { status, record },
      outbox: [],
    };
  }
  function commandProvenance(context) { return { source: "phase4-application-command", commandId: context.metadata.commandId, deviceId: context.principal.deviceId, ...(context.canonicalStoreEpoch ? { canonicalStoreEpoch: context.canonicalStoreEpoch } : {}) }; }
}

function createSupplementProtocolId(name, commandId) {
  const slug = String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "supplement";
  const suffix = String(commandId ?? "command").replace(/[^a-z0-9]/gi, "").slice(-8).toLowerCase();
  return `protocol_supplement_${slug}_${suffix}`;
}

function assertManualActivitySource(source) {
  const descriptor = `${source?.application ?? ""} ${source?.integration ?? ""} ${source?.modality ?? ""}`.toLowerCase();
  if (!descriptor.trim()) {
    throw problem(400, "ACTIVITY_SOURCE_REQUIRED", "Activity writes must explicitly declare screenshot or manual provenance.");
  }
  if (/healthkit|apple health|\bdirect\b/.test(descriptor)) {
    throw problem(400, "ACTIVITY_HEALTHKIT_FORBIDDEN", "The Native production contract accepts screenshot or manual Activity evidence only.");
  }
  if (!/manual|screenshot|typed/.test(descriptor)) {
    throw problem(400, "ACTIVITY_SOURCE_INVALID", "Activity source modality must be manual, typed, or screenshot.");
  }
}

function recordIdentity(record, index = 0) {
  return String(record?.id ?? record?.canonicalId ?? record?.package_id ?? record?.review_id ?? `@index:${index}`);
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

const WORKOUT_TERMINAL_STATES = new Set([
  HealthKitReconciliationState.WORKOUT_CANONICALIZED,
  HealthKitReconciliationState.WORKOUT_SUMMARY_SUPERSEDED,
]);

const DAILY_SNAPSHOT_STATES = Object.freeze({
  [HealthKitCanonicalDomain.ACTIVITY]: Object.freeze({
    pending: HealthKitReconciliationState.ACTIVITY_CANONICALIZATION_PENDING,
    canonicalized: HealthKitReconciliationState.ACTIVITY_DAY_CANONICALIZED,
    deferred: HealthKitReconciliationState.ACTIVITY_CANONICALIZATION_DEFERRED,
    validationOnly: HealthKitReconciliationState.ACTIVITY_VALIDATION_ONLY,
    superseded: HealthKitReconciliationState.ACTIVITY_SUMMARY_SUPERSEDED,
  }),
  [HealthKitCanonicalDomain.NUTRITION]: Object.freeze({
    pending: HealthKitReconciliationState.NUTRITION_CANONICALIZATION_PENDING,
    canonicalized: HealthKitReconciliationState.NUTRITION_DAY_CANONICALIZED,
    deferred: HealthKitReconciliationState.NUTRITION_CANONICALIZATION_DEFERRED,
    validationOnly: HealthKitReconciliationState.NUTRITION_VALIDATION_ONLY,
    superseded: HealthKitReconciliationState.NUTRITION_SUMMARY_SUPERSEDED,
  }),
});

function healthKitDailySnapshotDomain(observationType) {
  if (observationType === HealthKitObservationType.ACTIVITY_SUMMARY) return HealthKitCanonicalDomain.ACTIVITY;
  if (observationType === HealthKitObservationType.NUTRITION_DAILY_TOTAL) return HealthKitCanonicalDomain.NUTRITION;
  return null;
}

function comparableRecord(record) {
  const { version: _version, ...value } = structuredClone(record ?? {});
  return JSON.stringify(value);
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function problem(status, code, title, fieldErrors = []) {
  return new ApplicationProblem({ status, code, title, fieldErrors });
}

function canonicalValidationProblem(error) {
  if (error instanceof ApplicationProblem) return error;
  return new ApplicationProblem({
    status: 400,
    code: error?.code ?? "CANONICAL_EVIDENCE_INVALID",
    title: "The canonical evidence payload is invalid.",
    detail: error?.message ?? null,
    cause: error,
  });
}
