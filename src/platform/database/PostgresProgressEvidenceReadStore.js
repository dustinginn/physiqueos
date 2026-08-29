import { createPhase4CanonicalRecordStore } from "./Phase4CanonicalRecordStore.js";

export function createPostgresProgressEvidenceReadStore({
  pool,
  ownerUserId,
  onComplete = null,
} = {}) {
  if (!pool?.query || !ownerUserId) {
    throw new Error("Progress evidence storage requires a PostgreSQL pool and owner.");
  }
  let queryCount = 0;
  let rowCount = 0;
  let payloadBytes = 0;
  const records = createPhase4CanonicalRecordStore({
    query: async (text, values) => {
      queryCount += 1;
      return pool.query(text, values);
    },
  });
  const tracked = (values) => {
    const result = Array.isArray(values) ? values : [];
    rowCount += result.length;
    payloadBytes += Buffer.byteLength(JSON.stringify(result));
    return result;
  };
  const list = async (collection) => tracked(await records.list({ ownerUserId, collection }));
  const queryRecords = async (text, values) => {
    queryCount += 1;
    const result = await pool.query(text, values);
    return tracked(result.rows.map((row) => Object.freeze({
      ...row.payload,
      version: Number(row.version),
    })));
  };

  return Object.freeze({
    async run(readModel, callback) {
      queryCount = 0;
      rowCount = 0;
      payloadBytes = 0;
      const startedAt = performance.now();
      try {
        return await callback();
      } finally {
        onComplete?.({
          readModel,
          queryCount,
          rowCount,
          payloadBytes,
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
    listWeightEntries: () => list("weightEntries"),
    listDEXAScans: () => list("dexaScans"),
    async getNutritionContext() {
      const contexts = await list("nutritionContext");
      return contexts.at(-1) ?? null;
    },
    listEvidencePackages: () => list("evidencePackages"),
    listCanonicalNutritionEvidenceObjects: () => queryRecords(
      `SELECT payload,version FROM physiqueos.canonical_evidence_records
       WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
         AND COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type')='nutrition'
       ORDER BY COALESCE(payload#>>'{payload,observed_at}',payload->>'observed_at'),record_id`,
      [ownerUserId]
    ),
    listCanonicalActivityAndTrainingEvidenceObjects: () => queryRecords(
      `SELECT payload,version FROM physiqueos.canonical_evidence_records
       WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
         AND COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type') IN ('activity_day','training')
       ORDER BY COALESCE(payload#>>'{payload,observed_at}',payload->>'observed_at'),record_id`,
      [ownerUserId]
    ),
  });
}

export function createRepositoryProgressEvidenceReadStore({ repositories } = {}) {
  let user;
  const getUser = async () => {
    user ??= await repositories.users.getCurrentUser();
    return user;
  };
  const userId = async () => (await getUser())?.id;
  const canonical = async () =>
    repositories.canonicalEvidence?.listCanonicalEvidenceObjects(await userId()) ?? [];
  return Object.freeze({
    run: (_readModel, callback) => callback(),
    getUser,
    listGoals: async () => repositories.goals.listGoals(await userId()),
    listWeightEntries: async () => repositories.weights.listWeightEntries(await userId()),
    listDEXAScans: async () => repositories.dexaScans.listDEXAScans(await userId()),
    getNutritionContext: async () => repositories.nutritionContext.getNutritionContext(await userId()),
    listEvidencePackages: async () => repositories.evidencePackages?.listEvidencePackages(await userId()) ?? [],
    listCanonicalNutritionEvidenceObjects: async () =>
      (await canonical()).filter((record) => (record.payload ?? record).evidence_type === "nutrition"),
    listCanonicalActivityAndTrainingEvidenceObjects: async () =>
      (await canonical()).filter((record) => ["activity_day", "training"].includes(
        (record.payload ?? record).evidence_type
      )),
  });
}
