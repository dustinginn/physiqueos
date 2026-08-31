import { createPhase4CanonicalRecordStore } from "./Phase4CanonicalRecordStore.js";

export function createPostgresProgressPhotosReadStore({ pool, ownerUserId, onComplete = null } = {}) {
  if (!pool?.query || !ownerUserId) {
    throw new Error("Progress Photos storage requires a PostgreSQL pool and owner.");
  }
  let queryCount = 0;
  let rowCount = 0;
  let payloadBytes = 0;
  const query = async (text, values) => {
    queryCount += 1;
    const result = await pool.query(text, values);
    rowCount += result.rows.length;
    payloadBytes += Buffer.byteLength(JSON.stringify(result.rows));
    return result.rows;
  };
  const records = createPhase4CanonicalRecordStore({
    query: async (text, values) => ({ rows: await query(text, values) }),
  });
  const list = (collection) => records.list({ ownerUserId, collection });
  const payloads = async (text, values) => (await query(text, values)).map((row) => Object.freeze({
    ...row.payload,
    version: Number(row.version),
  }));

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
    async getPhotoInputs() {
      const rows = await query(
        `SELECT record_kind,payload,version FROM (
           SELECT 'canonical'::text AS record_kind,record_id,payload,version
             FROM physiqueos.canonical_evidence_records
            WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
              AND COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type')
                IN ('photo_session','progress_photo')
           UNION ALL
           SELECT 'legacy'::text AS record_kind,record_id,payload,version
             FROM physiqueos.canonical_evidence_records
            WHERE owner_user_id=$1 AND collection_name='progressPhotos'
         ) AS photo_inputs ORDER BY record_kind,record_id`,
        [ownerUserId],
      );
      return Object.freeze({
        canonicalEvidenceObjects: Object.freeze(rows
          .filter((row) => row.record_kind === "canonical")
          .map((row) => Object.freeze({ ...row.payload, version: Number(row.version) }))),
        progressPhotos: Object.freeze(rows
          .filter((row) => row.record_kind === "legacy")
          .map((row) => Object.freeze({ ...row.payload, version: Number(row.version) }))),
      });
    },
    listPhotoAnalyses: () => payloads(
      `SELECT payload,version FROM physiqueos.canonical_evidence_records
        WHERE owner_user_id=$1 AND collection_name='analyses'
          AND (
            payload::text LIKE '%progress_photo%'
            OR payload::text LIKE '%photo_session%'
            OR payload#>>'{metadata,canonicalPhotoId}' IS NOT NULL
            OR payload#>>'{metadata,photoSessionSynthesis}' IS NOT NULL
          )
        ORDER BY record_id`,
      [ownerUserId],
    ),
    listPhotoBriefings: () => payloads(
      `SELECT payload,version FROM physiqueos.canonical_briefing_records
        WHERE owner_user_id=$1 AND collection_name='dailyBriefings'
          AND payload#>>'{trigger,evidenceType}'='photo_session'
        ORDER BY record_id`,
      [ownerUserId],
    ),
    async listMediaObjects() {
      return (await query(
        `SELECT id,evidence_record_id,sha256,provenance,state
           FROM physiqueos.canonical_media_objects
          WHERE owner_user_id=$1 AND state='verified'
          ORDER BY id`,
        [ownerUserId],
      )).map((row) => Object.freeze(row));
    },
  });
}

export function createRepositoryProgressPhotosReadStore({ repositories } = {}) {
  let user;
  const getUser = async () => {
    user ??= await repositories.users.getCurrentUser();
    return user;
  };
  const userId = async () => (await getUser())?.id;
  return Object.freeze({
    run: (_readModel, callback) => callback(),
    getUser,
    listGoals: async () => repositories.goals.listGoals(await userId()),
    listWeightEntries: async () => repositories.weights.listWeightEntries(await userId()),
    async getPhotoInputs() {
      const owner = await userId();
      const [canonicalEvidenceObjects, progressPhotos] = await Promise.all([
        repositories.canonicalEvidence.listCanonicalEvidenceObjects(owner),
        repositories.progressPhotos.listPhotos(owner),
      ]);
      return Object.freeze({
        canonicalEvidenceObjects: canonicalEvidenceObjects.filter((record) =>
          ["photo_session", "progress_photo"].includes((record.payload ?? record).evidence_type)),
        progressPhotos,
      });
    },
    listPhotoAnalyses: async () => (await repositories.analyses.listAnalyses(await userId())).filter((item) =>
      JSON.stringify(item).includes("progress_photo") || JSON.stringify(item).includes("photo_session")),
    listPhotoBriefings: async () => (await repositories.dailyBriefings.listDailyBriefings(await userId())).filter((item) =>
      item.trigger?.evidenceType === "photo_session"),
    listMediaObjects: async () => null,
  });
}
