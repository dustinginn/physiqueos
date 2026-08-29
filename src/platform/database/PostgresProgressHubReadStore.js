import { createPhase4CanonicalRecordStore } from "./Phase4CanonicalRecordStore.js";

const HUB_EVIDENCE_TYPES = Object.freeze([
  "activity_day",
  "nutrition",
  "training",
]);

export function createPostgresProgressHubReadStore({
  pool,
  ownerUserId,
  onComplete = null,
} = {}) {
  if (!pool?.query || !ownerUserId) {
    throw new Error("Progress hub storage requires a PostgreSQL pool and owner.");
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
    return result.rows.map((row) => Object.freeze({
      ...row.payload,
      version: Number(row.version),
    }));
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
    getOwnerUserId: async () => ownerUserId,
    listWeightEntries: () => list("weightEntries"),
    listDEXAScans: () => list("dexaScans"),
    async getProgressHubPhotoInputs() {
      queryCount += 1;
      const result = await pool.query(
        `SELECT record_kind,payload,version FROM (
           SELECT 'canonical'::text AS record_kind,record_id,payload,version
             FROM physiqueos.canonical_evidence_records
            WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
              AND COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type')='photo_session'
           UNION ALL
           SELECT 'legacy'::text AS record_kind,record_id,payload,version
             FROM physiqueos.canonical_evidence_records
            WHERE owner_user_id=$1 AND collection_name='progressPhotos'
         ) AS progress_photo_inputs
         ORDER BY record_kind,record_id`,
        [ownerUserId]
      );
      return Object.freeze({
        canonicalPhotoSessionObjects: Object.freeze(result.rows
          .filter((row) => row.record_kind === "canonical")
          .map((row) => Object.freeze({ ...row.payload, version: Number(row.version) }))),
        progressPhotos: Object.freeze(result.rows
          .filter((row) => row.record_kind === "legacy")
          .map((row) => Object.freeze({ ...row.payload, version: Number(row.version) }))),
      });
    },
    listProtocols: () => list("protocols"),
    async getNutritionContext() {
      const contexts = await list("nutritionContext");
      return contexts.at(-1) ?? null;
    },
    listEvidencePackages: () => list("evidencePackages"),
    listProgressHubCanonicalEvidenceObjects: () => queryRecords(
      `SELECT payload,version FROM physiqueos.canonical_evidence_records
       WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
         AND COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type')=ANY($2::text[])
       ORDER BY record_id`,
      [ownerUserId, HUB_EVIDENCE_TYPES]
    ),
  });
}

export function createRepositoryProgressHubReadStore({ repositories } = {}) {
  let user;
  const getUser = async () => {
    user ??= await repositories.users.getCurrentUser();
    return user;
  };
  const userId = async () => (await getUser())?.id;
  return Object.freeze({
    run: (_readModel, callback) => callback(),
    getOwnerUserId: userId,
    listWeightEntries: async () => repositories.weights.listWeightEntries(await userId()),
    listDEXAScans: async () => repositories.dexaScans.listDEXAScans(await userId()),
    async getProgressHubPhotoInputs() {
      const ownerUserId = await userId();
      const [canonicalEvidenceObjects, progressPhotos] = await Promise.all([
        repositories.canonicalEvidence?.listCanonicalEvidenceObjects(ownerUserId) ?? [],
        repositories.progressPhotos?.listPhotos(ownerUserId) ?? [],
      ]);
      return Object.freeze({
        canonicalPhotoSessionObjects: Object.freeze(canonicalEvidenceObjects
          .filter((record) => (record.payload ?? record).evidence_type === "photo_session")),
        progressPhotos: Object.freeze(progressPhotos),
      });
    },
    listProtocols: async () => repositories.protocols.listProtocols(await userId()),
    getNutritionContext: async () => repositories.nutritionContext.getNutritionContext(await userId()),
    listEvidencePackages: async () => repositories.evidencePackages?.listEvidencePackages(await userId()) ?? [],
    listProgressHubCanonicalEvidenceObjects: async () =>
      (await repositories.canonicalEvidence?.listCanonicalEvidenceObjects(await userId()) ?? [])
        .filter((record) => HUB_EVIDENCE_TYPES.includes(
          (record.payload ?? record).evidence_type
        )),
  });
}
