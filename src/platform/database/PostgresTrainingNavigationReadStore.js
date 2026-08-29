import { createPhase4CanonicalRecordStore } from "./Phase4CanonicalRecordStore.js";

export function createPostgresTrainingNavigationReadStore({
  pool,
  ownerUserId,
  onComplete = null,
} = {}) {
  if (!pool?.query || !ownerUserId) {
    throw new Error("Training navigation storage requires a PostgreSQL pool and owner.");
  }
  let queryCount = 0;
  const records = createPhase4CanonicalRecordStore({
    query: async (text, values) => {
      queryCount += 1;
      return pool.query(text, values);
    },
  });
  const list = (collection) => records.list({ ownerUserId, collection });
  const queryRecords = async (text, values) => {
    queryCount += 1;
    const result = await pool.query(text, values);
    return result.rows.map((row) => Object.freeze({ ...row.payload, version: Number(row.version) }));
  };

  return Object.freeze({
    async run(readModel, callback) {
      queryCount = 0;
      const startedAt = performance.now();
      try {
        return await callback();
      } finally {
        onComplete?.({
          readModel,
          queryCount,
          compatibilityRuntimeLoadCount: 0,
          elapsedMs: Math.round(performance.now() - startedAt),
          pool: {
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount,
          },
        });
      }
    },
    async getUser() {
      const users = await list("user");
      return users.find((user) => user?.id === ownerUserId) ?? users[0] ?? null;
    },
    listGoals: () => list("goals"),
    listCanonicalTrainingAndActivityEvidenceObjects: () => queryRecords(
      `SELECT payload,version FROM physiqueos.canonical_evidence_records
       WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
         AND COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type') IN ('training','activity_day')
       ORDER BY record_id`,
      [ownerUserId]
    ),
    getCanonicalEvidenceObject: (recordId) => records.get({ ownerUserId, collection: "canonicalEvidenceObjects", recordId }),
    listCanonicalTrainingEvidenceObjects: () => queryRecords(
      `SELECT payload,version FROM physiqueos.canonical_evidence_records
       WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
         AND COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type')='training'
       ORDER BY record_id`,
      [ownerUserId]
    ),
    listCanonicalTrainingEvidenceByExercise: (canonicalExerciseId) => queryRecords(
      `SELECT payload,version FROM physiqueos.canonical_evidence_records
       WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
         AND COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type')='training'
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(COALESCE(payload#>'{payload,exercises}',payload->'exercises','[]'::jsonb)) AS exercise
           WHERE COALESCE(exercise->>'canonicalExerciseId',exercise->>'exerciseId',exercise->>'id')=$2
         )
       ORDER BY record_id`,
      [ownerUserId, canonicalExerciseId]
    ),
    listCanonicalTrainingEvidenceForDate: (date, timeZone) => queryRecords(
      `SELECT payload,version FROM physiqueos.canonical_evidence_records
       WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
         AND COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type')='training'
         AND CASE
           WHEN length(COALESCE(payload#>>'{payload,observed_at}',payload->>'observed_at'))=10
             THEN COALESCE(payload#>>'{payload,observed_at}',payload->>'observed_at')::date
           ELSE (COALESCE(payload#>>'{payload,observed_at}',payload->>'observed_at')::timestamptz AT TIME ZONE $3)::date
         END=$2::date
       ORDER BY record_id`,
      [ownerUserId, date, timeZone]
    ),
    listEvidencePackages: () => list("evidencePackages"),
    listTrainingPerformanceEventsByExercise: (canonicalExerciseId) => queryRecords(
      `SELECT payload,version FROM physiqueos.canonical_training_records
       WHERE owner_user_id=$1 AND collection_name='trainingPerformanceEvents'
         AND payload->>'canonicalExerciseId'=$2
       ORDER BY record_id`,
      [ownerUserId, canonicalExerciseId]
    ),
  });
}

export function createRepositoryTrainingNavigationReadStore({ repositories } = {}) {
  return Object.freeze({
    run: (_readModel, callback) => callback(),
    getUser: () => repositories.users.getCurrentUser(),
    listGoals: async () => repositories.goals.listGoals((await repositories.users.getCurrentUser())?.id),
    listCanonicalTrainingAndActivityEvidenceObjects: async () => (await repositories.canonicalEvidence.listCanonicalEvidenceObjects((await repositories.users.getCurrentUser())?.id))
      .filter((record) => ["training", "activity_day"].includes((record.payload ?? record).evidence_type)),
    getCanonicalEvidenceObject: async (recordId) => repositories.canonicalEvidence.getCanonicalEvidenceObjectById?.(recordId) ?? null,
    listCanonicalTrainingEvidenceObjects: async () => (await repositories.canonicalEvidence.listCanonicalEvidenceObjects((await repositories.users.getCurrentUser())?.id))
      .filter((record) => (record.payload ?? record).evidence_type === "training"),
    listCanonicalTrainingEvidenceByExercise: async (canonicalExerciseId) => (await repositories.canonicalEvidence.listCanonicalEvidenceObjects((await repositories.users.getCurrentUser())?.id))
      .filter((record) => ((record.payload ?? record).exercises ?? []).some((exercise) =>
        [exercise.canonicalExerciseId, exercise.exerciseId, exercise.id].includes(canonicalExerciseId))),
    listCanonicalTrainingEvidenceForDate: async () => repositories.canonicalEvidence.listCanonicalEvidenceObjects((await repositories.users.getCurrentUser())?.id),
    listEvidencePackages: async () => repositories.evidencePackages.listEvidencePackages((await repositories.users.getCurrentUser())?.id),
    listTrainingPerformanceEventsByExercise: async (canonicalExerciseId) => (await repositories.trainingPerformanceEvents.listTrainingPerformanceEvents())
      .filter((event) => event.canonicalExerciseId === canonicalExerciseId),
  });
}
