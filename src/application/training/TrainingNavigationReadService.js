import { selectLiveTrainingPerformanceEvents } from "../../domain/services/TrainingPerformanceEventLiveness.js";
import { createTrainingDayReadModel } from "./TrainingReadService.js";
import {
  createTrainingLandingReports,
  createTrainingLibraryReports,
  createTrainingNavigationReport,
  createTrainingReportingReports,
} from "../../domain/services/ProgressReportingService.js";
import {
  createTrainingEvidenceContext,
  mergeTrainingBreakdowns,
} from "../../domain/services/TrainingEvidenceContextService.js";
import { createTrainingLibraryExerciseRecordsReadModel } from "../../domain/services/TrainingLibraryExerciseRecordsService.js";
import { resolveTrainingExerciseIdentity } from "../../domain/models/trainingExerciseIdentity.js";
import { getPrimaryTrainingNavigationGroup } from "../../navigation/trainingNavigationMapping.js";
import {
  readCurrentCanonicalTrainingExerciseRegistry,
} from "./CanonicalExerciseRegistryReadService.js";
import { createTrainingReportingPresentation } from "../../domain/services/TrainingReportingPresentationService.js";
import { projectHealthKitStrengthWorkoutPresentationBySession } from "../../domain/services/HealthKitWorkoutPresentationService.js";
import { applyHealthKitStrengthPresentationToTrainingRecord } from "../../domain/services/ProgressReportingService.js";
import {
  isHealthKitCanonicalWorkoutIdentity,
  projectHealthKitCardioTrainingRecords,
  projectHealthKitCardioWorkoutAsTrainingRecord,
  projectPresentedHealthKitCardioTrainingRecords,
} from "../../domain/services/HealthKitCardioTrainingPresentation.js";

export function createTrainingNavigationReadService({
  store,
  logger = null,
  readCanonicalExerciseRegistry = null,
  hydrateCanonicalExerciseRegistry = null,
} = {}) {
  if (!store?.run) throw new Error("Training navigation requires a read store.");

  const readRegistry = readCanonicalExerciseRegistry ??
    hydrateCanonicalExerciseRegistry;

  // Durable events are immutable derived facts; only events whose source
  // session is still an active canonical session are current records. The
  // exercise-scoped query matches the STORED exercise id, so an event whose
  // session stores a legacy or name-only identity can miss it; any event that
  // is not live there is checked once against the full Training list before it
  // is treated as no longer authoritative.
  async function selectLiveEvents(events, scopedCanonicalObjects) {
    const live = selectLiveTrainingPerformanceEvents(events, scopedCanonicalObjects);
    if (live.length === events.length || typeof store.listCanonicalTrainingEvidenceObjects !== "function") return live;
    return selectLiveTrainingPerformanceEvents(events, await store.listCanonicalTrainingEvidenceObjects());
  }

  // Production injects one canonical registry access path. All Training reads enter it,
  // including Day and Session, so no caller or page-order side effect owns hydration.
  async function ensureCanonicalExerciseRegistry() {
    return readRegistry
      ? readRegistry()
      : readCurrentCanonicalTrainingExerciseRegistry();
  }

  return Object.freeze({
    getReporting({ context, currentDate = new Date() } = {}) {
      return store.run("training.reporting", async () => {
        await ensureCanonicalExerciseRegistry();
        const [user, goals, evidenceObjects, healthKitCardioWorkouts] = await Promise.all([
          store.getUser(),
          store.listGoals(),
          store.listCanonicalTrainingAndActivityEvidenceObjects(),
          listPresentableHealthKitCardioWorkouts(store, logger, "training.reporting.healthkit_cardio_unavailable"),
        ]);
        const timeline = createTrainingEvidenceContext({ context, currentDate, goals, user });
        const hasCanonicalTraining = evidenceObjects.some((record) =>
          (record.payload ?? record).evidence_type === "training"
        );
        const evidencePackages = hasCanonicalTraining ? [] : await store.listEvidencePackages();
        const canonicalEvidenceObjects = withPresentedHealthKitCardio(evidenceObjects, healthKitCardioWorkouts, user);
        const { globalReport, scopedReport } = createTrainingReportingReports({
          canonicalEvidenceObjects,
          dateWindow: timeline.goalScoped
            ? { startDate: timeline.startDate, endDate: timeline.endDate }
            : null,
          evidencePackages,
          goals,
        });
        const report = timeline.goalScoped
          ? Object.freeze({
              ...scopedReport,
              trainingBreakdowns: mergeTrainingBreakdowns({
                globalBreakdowns: globalReport.trainingBreakdowns,
                scopedBreakdowns: scopedReport.trainingBreakdowns,
              }),
              trainingLibrary: globalReport.trainingLibrary,
            })
          : globalReport;
        return Object.freeze({
          timeline,
          report,
          presentation: createTrainingReportingPresentation(report),
        });
      });
    },
    getLanding({ context, currentDate = new Date() } = {}) {
      return store.run("training.landing", async () => {
        await ensureCanonicalExerciseRegistry();
        // Recent Training History presents the same workout universe as Training
        // Day: Logger/screenshot sessions plus canonical HealthKit Cardio workouts,
        // with Training Day's duplicate suppression.
        const [user, goals, evidenceObjects, healthKitCardioWorkouts] = await Promise.all([
          store.getUser(),
          store.listGoals(),
          store.listCanonicalTrainingAndActivityEvidenceObjects(),
          listPresentableHealthKitCardioWorkouts(store, logger, "training.landing.healthkit_cardio_unavailable"),
        ]);
        const timeline = createTrainingEvidenceContext({
          context,
          currentDate,
          goals,
          user,
        });
        const hasCanonicalTraining = evidenceObjects.some((record) =>
          (record.payload ?? record).evidence_type === "training"
        );
        const evidencePackages = hasCanonicalTraining
          ? []
          : await store.listEvidencePackages();
        const canonicalEvidenceObjects = withPresentedHealthKitCardio(evidenceObjects, healthKitCardioWorkouts, user);
        const { globalReport, scopedReport } = createTrainingLandingReports({
          canonicalEvidenceObjects,
          dateWindow: timeline.goalScoped
            ? { startDate: timeline.startDate, endDate: timeline.endDate }
            : null,
          evidencePackages,
          goals,
        });
        return Object.freeze({
          timeline,
          report: timeline.goalScoped
            ? Object.freeze({
                ...scopedReport,
                trainingBreakdowns: mergeTrainingBreakdowns({
                  globalBreakdowns: globalReport.trainingBreakdowns,
                  scopedBreakdowns: scopedReport.trainingBreakdowns,
                }),
                trainingLibrary: globalReport.trainingLibrary,
              })
            : globalReport,
        });
      });
    },
    getDay({ date, timeZone = null } = {}) {
      return store.run("training.navigation.day", async () => {
        await ensureCanonicalExerciseRegistry();
        const user = await store.getUser();
        const evidenceObjects = await store.listCanonicalTrainingEvidenceForDate(
          date,
          timeZone ?? user?.timezone ?? "America/Los_Angeles"
        );
        // Training Day is a unified workout surface: canonical HealthKit Cardio
        // workouts (which live outside the training evidence collection) are
        // presented as Cardio rows alongside Logger/screenshot sessions. A failure
        // reading them must never take the whole day down.
        const healthKitCardioRecords = await loadHealthKitCardioTrainingRecords(store, date, evidenceObjects, logger);
        return createTrainingDayReadModel({
          canonicalEvidenceObjects: [...evidenceObjects, ...healthKitCardioRecords],
          date,
          timeZone: timeZone ?? user?.timezone,
        });
      });
    },
    // `includePresentedCardio` adds canonical HealthKit Cardio to the Cardio
    // breakdown / Cardio activity history (workout-history semantics). Exercise
    // lists, exercise records and PRs are unaffected either way: a Cardio workout
    // has no exercises. A caller that only consumes the exercise registry (the
    // Native Library projection) passes false and skips the read entirely.
    getLibrary({ context, currentDate = new Date(), path = [], registryHydrated = false, includePresentedCardio = true } = {}) {
      return store.run("training.navigation.library", async () => {
        const canonicalExercises = registryHydrated
          ? readCurrentCanonicalTrainingExerciseRegistry()
          : await ensureCanonicalExerciseRegistry();
        const [user, goals, evidenceObjects, healthKitCardioWorkouts] = await Promise.all([
          store.getUser(),
          store.listGoals(),
          store.listCanonicalTrainingEvidenceObjects(),
          includePresentedCardio
            ? listPresentableHealthKitCardioWorkouts(store, logger, "training.library.healthkit_cardio_unavailable")
            : [],
        ]);
        const canonicalEvidenceObjects = withPresentedHealthKitCardio(evidenceObjects, healthKitCardioWorkouts, user);
        const timeline = createTrainingEvidenceContext({
          context,
          currentDate,
          goals,
          user,
        });
        const hasCanonicalTraining = evidenceObjects.some((record) =>
          (record.payload ?? record).evidence_type === "training"
        );
        const evidencePackages = hasCanonicalTraining
          ? []
          : await store.listEvidencePackages();
        const activitySlug = path[0] === "cardio" && path.length >= 2
          ? path[1]
          : null;
        const {
          activityEntries,
          activityTrainingDays,
          globalBreakdowns,
          scopedBreakdowns,
        } = createTrainingLibraryReports({
          canonicalEvidenceObjects,
          dateWindow: timeline.goalScoped
            ? { startDate: timeline.startDate, endDate: timeline.endDate }
            : null,
          evidencePackages,
          activitySlug,
        });

        return Object.freeze({
          timeline,
          report: Object.freeze({
            canonicalExercises: projectCanonicalExerciseRegistry(
              canonicalExercises
            ),
            entries: activityEntries,
            trainingDays: activityTrainingDays,
            trainingBreakdowns: timeline.goalScoped
              ? mergeTrainingBreakdowns({
                  globalBreakdowns,
                  scopedBreakdowns,
                })
              : globalBreakdowns,
          }),
        });
      });
    },
    getSession({ sessionId } = {}) {
      return store.run("training.navigation.session", async () => {
        await ensureCanonicalExerciseRegistry();
        // A canonical HealthKit Cardio workout row from Training Day opens the same
        // existing Cardio session detail (no Logger session, exercises or link).
        if (isHealthKitCanonicalWorkoutIdentity(sessionId)) {
          const cardio = await loadHealthKitCardioSession(store, sessionId, logger);
          if (cardio) return cardio;
        }
        const exact = await store.getCanonicalEvidenceObject(sessionId);
        if (exact) return withHealthKitPresentation(
          withSupportingMedia(
            findSession(createTrainingNavigationReport({ canonicalEvidenceObjects: [exact] }), sessionId),
            exact,
          ),
          exact,
          await loadHealthKitRelationshipState(store),
        );
        const canonicalEvidenceObjects = await store.listCanonicalTrainingEvidenceObjects();
        let session = findSession(createTrainingNavigationReport({ canonicalEvidenceObjects }), sessionId);
        if (session || canonicalEvidenceObjects.length > 0) {
          const record = canonicalEvidenceObjects.find((item) => [
            item.canonicalId, item.id, item.payload?.id,
            ...(item.provenance?.contributing_evidence_object_ids ?? []),
          ].some((candidate) => String(candidate) === String(sessionId)));
          return withHealthKitPresentation(
            withSupportingMedia(session, record),
            record,
            await loadHealthKitRelationshipState(store),
          );
        }
        session = findSession(createTrainingNavigationReport({
          evidencePackages: await store.listEvidencePackages(),
        }), sessionId);
        return session;
      });
    },
    getExercise({ context, currentDate = new Date(), exerciseSlug, registryHydrated = false } = {}) {
      return store.run("training.navigation.exercise", async () => {
        if (!registryHydrated) await ensureCanonicalExerciseRegistry();
        const exerciseIdentity = resolveTrainingExerciseIdentity(exerciseSlug);
        const [user, goals, canonicalEvidenceObjects, events] = await Promise.all([
          store.getUser(),
          store.listGoals(),
          store.listCanonicalTrainingEvidenceByExercise(exerciseIdentity.canonicalExerciseId),
          store.listTrainingPerformanceEventsByExercise(exerciseIdentity.canonicalExerciseId),
        ]);
        const timeline = createTrainingEvidenceContext({ context, currentDate, goals, user });
        const report = createTrainingNavigationReport({
          canonicalEvidenceObjects,
          dateWindow: timeline.goalScoped
            ? { startDate: timeline.startDate, endDate: timeline.endDate }
            : null,
        });
        return Object.freeze({
          report,
          timeline,
          // Durable events are immutable derived facts; only those whose source
          // session is still an active canonical session are current records.
          exerciseRecords: createTrainingLibraryExerciseRecordsReadModel({
            canonicalExerciseId: exerciseIdentity.canonicalExerciseId,
            events: await selectLiveEvents(events, canonicalEvidenceObjects),
          }),
        });
      });
    },
  });
}

async function loadHealthKitCardioTrainingRecords(store, date, evidenceObjects, logger = null) {
  try {
    const canonicalWorkouts = typeof store.listHealthKitCanonicalWorkoutsForDate === "function"
      ? await store.listHealthKitCanonicalWorkoutsForDate(date)
      : typeof store.listHealthKitCanonicalWorkouts === "function"
        ? await store.listHealthKitCanonicalWorkouts()
        : [];
    return projectHealthKitCardioTrainingRecords({ canonicalWorkouts, date, existingEvidenceObjects: evidenceObjects });
  } catch (error) {
    warnHealthKitCardioFailure(logger, "training.day.healthkit_cardio_unavailable", error);
    return [];
  }
}

// Canonical HealthKit Cardio workouts for the aggregate Training surfaces. Same
// failure isolation as Training Day: a HealthKit read failure degrades to the
// evidence-only history (observable), never to a broken Training read.
async function listPresentableHealthKitCardioWorkouts(store, logger, event) {
  try {
    if (typeof store.listHealthKitCanonicalCardioWorkouts === "function") return await store.listHealthKitCanonicalCardioWorkouts();
    if (typeof store.listHealthKitCanonicalWorkouts === "function") return await store.listHealthKitCanonicalWorkouts();
    return [];
  } catch (error) {
    warnHealthKitCardioFailure(logger, event, error);
    return [];
  }
}

function withPresentedHealthKitCardio(evidenceObjects, healthKitCardioWorkouts, user) {
  if (!healthKitCardioWorkouts?.length) return evidenceObjects;
  return [
    ...evidenceObjects,
    ...projectPresentedHealthKitCardioTrainingRecords({
      canonicalWorkouts: healthKitCardioWorkouts,
      existingEvidenceObjects: evidenceObjects,
      // Training Day's own zone resolution for evidence local dates.
      timeZone: user?.timezone ?? user?.timeZone ?? null,
    }),
  ];
}

async function loadHealthKitCardioSession(store, sessionId, logger = null) {
  if (typeof store.getHealthKitCanonicalWorkout !== "function") return null;
  let workout = null;
  try { workout = await store.getHealthKitCanonicalWorkout(sessionId); } catch (error) {
    warnHealthKitCardioFailure(logger, "training.session.healthkit_cardio_unavailable", error);
    return null;
  }
  const record = projectHealthKitCardioWorkoutAsTrainingRecord(workout);
  if (!record) return null;
  return findSession(createTrainingNavigationReport({ canonicalEvidenceObjects: [record] }), sessionId);
}

// Failure isolation must never be silent: an outage would otherwise recreate the
// missing-Cardio defect with no signal. Class name and code only (no message/PII).
function warnHealthKitCardioFailure(logger, event, error) {
  const fields = { errorName: String(error?.name ?? "Error").slice(0, 80), errorCode: String(error?.code ?? "UNCLASSIFIED").slice(0, 80) };
  if (logger?.warn) logger.warn(event, fields);
  else console.warn(event, JSON.stringify(fields));
}

function withSupportingMedia(session, record) {
  if (!session) return null;
  const supportingMedia = record?.payload?.metadata?.supporting_media ?? record?.metadata?.supporting_media ?? [];
  return Object.freeze({ ...session, supportingMedia: structuredClone(supportingMedia) });
}

async function loadHealthKitRelationshipState(store) {
  if (![store.listHealthKitCanonicalWorkouts, store.listHealthKitWorkoutLinks,
    store.listHealthKitWorkoutLinkClaims].every((value) => typeof value === "function")) return null;
  const [canonicalWorkouts, workoutLinks, workoutLinkClaims] = await Promise.all([
    store.listHealthKitCanonicalWorkouts(),
    store.listHealthKitWorkoutLinks(),
    store.listHealthKitWorkoutLinkClaims(),
  ]);
  return { canonicalWorkouts, workoutLinks, workoutLinkClaims };
}

// Workout-Detail's Apple-Health-provenance block: a CONFIRMED relationship
// always wins, but absent one this still resolves an unconfirmed, single,
// deterministically-picked candidate (see
// `projectHealthKitStrengthWorkoutPresentationBySession`) so the screen never
// falls back to the Logger session's own frozen/synthetic timing just
// because nobody has confirmed the link yet. `healthKitAttachment.relationship
// .status` tells the caller honestly which one it got ("confirmed" or
// "candidate", with the candidate's confidence) -- it never invents a
// confirmed relationship.
function withHealthKitPresentation(session, record, relationshipState) {
  if (!session || !record || !relationshipState) return session;
  const index = projectHealthKitStrengthWorkoutPresentationBySession({
    canonicalEvidenceObjects: [record],
    ...relationshipState,
  });
  const id = String(record.canonicalId ?? (record.payload ?? record).id ?? session.id);
  const healthKitAttachment = index.get(id);
  if (!healthKitAttachment) return session;
  return Object.freeze({
    ...applyHealthKitStrengthPresentationToTrainingRecord(session, healthKitAttachment),
    healthKitAttachment,
  });
}

function projectCanonicalExerciseRegistry(exercises = []) {
  return Object.freeze(exercises.map((exercise) => Object.freeze({
    canonicalExerciseId: exercise.id,
    primaryNavigationCategory: getPrimaryTrainingNavigationGroup({
      canonicalExerciseId: exercise.id,
      label: exercise.name,
      primaryMuscleGroups: exercise.primary_muscle_groups,
      regionLabel: exercise.body_region,
    }),
    familyLabel: exercise.movement_pattern ?? null,
    label: exercise.name,
    primaryMuscleGroupId: exercise.primary_muscle_group_id ?? null,
    primaryMuscleGroups: Object.freeze([
      ...(exercise.primary_muscle_groups ?? []),
    ]),
    regionLabel: exercise.body_region ?? null,
  })));
}

export function findSession(report = {}, sessionId) {
  const sessions = [
    ...(report.entries ?? []),
    ...(report.trainingDays ?? []).flatMap((day) => day.sessions ?? []),
  ];
  return sessions.find((session) => [
    session.id,
    session.canonicalId,
    ...(session.aliases ?? []),
  ].some((candidate) => String(candidate) === String(sessionId))) ?? null;
}
