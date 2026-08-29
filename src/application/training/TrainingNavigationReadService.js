import { createTrainingDayReadModel } from "./TrainingReadService.js";
import { createTrainingNavigationReport } from "../../domain/services/ProgressReportingService.js";
import { createTrainingEvidenceContext } from "../../domain/services/TrainingEvidenceContextService.js";
import { createTrainingLibraryExerciseRecordsReadModel } from "../../domain/services/TrainingLibraryExerciseRecordsService.js";
import { resolveTrainingExerciseIdentity } from "../../domain/models/trainingExerciseIdentity.js";

export function createTrainingNavigationReadService({ store } = {}) {
  if (!store?.run) throw new Error("Training navigation requires a read store.");

  return Object.freeze({
    getDay({ date, timeZone = null } = {}) {
      return store.run("training.navigation.day", async () => {
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
    getSession({ sessionId } = {}) {
      return store.run("training.navigation.session", async () => {
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
    getExercise({ context, currentDate = new Date(), exerciseSlug } = {}) {
      return store.run("training.navigation.exercise", async () => {
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
