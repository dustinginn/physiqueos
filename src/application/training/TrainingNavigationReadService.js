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
import {
  readCurrentCanonicalTrainingExerciseRegistry,
} from "./CanonicalExerciseRegistryReadService.js";
import { createTrainingReportingPresentation } from "../../domain/services/TrainingReportingPresentationService.js";

export function createTrainingNavigationReadService({
  store,
  readCanonicalExerciseRegistry = null,
  hydrateCanonicalExerciseRegistry = null,
} = {}) {
  if (!store?.run) throw new Error("Training navigation requires a read store.");

  const readRegistry = readCanonicalExerciseRegistry ??
    hydrateCanonicalExerciseRegistry;

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
        const [user, goals, canonicalEvidenceObjects] = await Promise.all([
          store.getUser(),
          store.listGoals(),
          store.listCanonicalTrainingAndActivityEvidenceObjects(),
        ]);
        const timeline = createTrainingEvidenceContext({ context, currentDate, goals, user });
        const hasCanonicalTraining = canonicalEvidenceObjects.some((record) =>
          (record.payload ?? record).evidence_type === "training"
        );
        const evidencePackages = hasCanonicalTraining ? [] : await store.listEvidencePackages();
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
        const [user, goals, canonicalEvidenceObjects] = await Promise.all([
          store.getUser(),
          store.listGoals(),
          store.listCanonicalTrainingAndActivityEvidenceObjects(),
        ]);
        const timeline = createTrainingEvidenceContext({
          context,
          currentDate,
          goals,
          user,
        });
        const hasCanonicalTraining = canonicalEvidenceObjects.some((record) =>
          (record.payload ?? record).evidence_type === "training"
        );
        const evidencePackages = hasCanonicalTraining
          ? []
          : await store.listEvidencePackages();
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
        const canonicalEvidenceObjects = await store.listCanonicalTrainingEvidenceForDate(
          date,
          timeZone ?? user?.timezone ?? "America/Los_Angeles"
        );
        return createTrainingDayReadModel({
          canonicalEvidenceObjects,
          date,
          timeZone: timeZone ?? user?.timezone,
        });
      });
    },
    getLibrary({ context, currentDate = new Date(), path = [], registryHydrated = false } = {}) {
      return store.run("training.navigation.library", async () => {
        const canonicalExercises = registryHydrated
          ? readCurrentCanonicalTrainingExerciseRegistry()
          : await ensureCanonicalExerciseRegistry();
        const [user, goals, canonicalEvidenceObjects] = await Promise.all([
          store.getUser(),
          store.listGoals(),
          store.listCanonicalTrainingEvidenceObjects(),
        ]);
        const timeline = createTrainingEvidenceContext({
          context,
          currentDate,
          goals,
          user,
        });
        const hasCanonicalTraining = canonicalEvidenceObjects.some((record) =>
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
        const exact = await store.getCanonicalEvidenceObject(sessionId);
        if (exact) return findSession(createTrainingNavigationReport({ canonicalEvidenceObjects: [exact] }), sessionId);
        const canonicalEvidenceObjects = await store.listCanonicalTrainingEvidenceObjects();
        let session = findSession(createTrainingNavigationReport({ canonicalEvidenceObjects }), sessionId);
        if (session || canonicalEvidenceObjects.length > 0) return session;
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
          exerciseRecords: createTrainingLibraryExerciseRecordsReadModel({
            canonicalExerciseId: exerciseIdentity.canonicalExerciseId,
            events,
          }),
        });
      });
    },
  });
}

function projectCanonicalExerciseRegistry(exercises = []) {
  return Object.freeze(exercises.map((exercise) => Object.freeze({
    canonicalExerciseId: exercise.id,
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
