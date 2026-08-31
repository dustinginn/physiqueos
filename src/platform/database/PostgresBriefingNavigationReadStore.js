import { createPhase4CanonicalRecordStore } from "./Phase4CanonicalRecordStore.js";

export function createPostgresBriefingNavigationReadStore({ pool, ownerUserId, onComplete = null } = {}) {
  if (!pool?.query || !ownerUserId) throw new Error("Briefing navigation storage requires a PostgreSQL pool and owner.");
  const tracked = (readModel, callback) => async (input = {}) => {
    let queryCount = 0;
    let rowCount = 0;
    let payloadBytes = 0;
    const startedAt = performance.now();
    const query = async (text, values) => {
      queryCount += 1;
      const result = await pool.query(text, values);
      rowCount += result.rows.length;
      payloadBytes += Buffer.byteLength(JSON.stringify(result.rows));
      return result;
    };
    try {
      return await callback({ input, query });
    } finally {
      onComplete?.({
        readModel,
        queryCount,
        rowCount,
        payloadBytes,
        compatibilityRuntimeLoadCount: 0,
        elapsedMs: Math.round(performance.now() - startedAt),
        pool: { totalCount: pool.totalCount, idleCount: pool.idleCount, waitingCount: pool.waitingCount },
      });
    }
  };
  const context = async ({ artifact, query }) => {
    const records = createPhase4CanonicalRecordStore({ query });
    const list = (collection) => records.list({ ownerUserId, collection });
    const [users, goals, phaseReviewDecisions, dexaScans, workItems, metadata] = await Promise.all([
      list("user"),
      list("goals"),
      list("phaseReviewDecisions"),
      list("dexaScans"),
      list("briefingReconciliationWorkItems"),
      query(`SELECT revision FROM physiqueos.canonical_runtime_metadata WHERE owner_user_id=$1`, [ownerUserId]),
    ]);
    return Object.freeze({
      artifact,
      user: users.find((item) => item.id === ownerUserId) ?? users[0] ?? null,
      goals,
      phaseReviewDecisions,
      dexaScans,
      workItems,
      revision: Number(metadata.rows[0]?.revision ?? 0),
    });
  };

  return Object.freeze({
    listHistory: tracked("briefing.history", async ({ query }) => {
      const records = createPhase4CanonicalRecordStore({ query });
      const [artifacts, workItems] = await Promise.all([
        records.list({ ownerUserId, collection: "dailyBriefings" }),
        records.list({ ownerUserId, collection: "briefingReconciliationWorkItems" }),
      ]);
      return Object.freeze({ artifacts, workItems });
    }),
    getArtifact: tracked("briefing.artifact", async ({ input, query }) => {
      const records = createPhase4CanonicalRecordStore({ query });
      const artifact = await records.get({ ownerUserId, collection: "dailyBriefings", recordId: input.artifactId });
      return context({ artifact, query });
    }),
    getDexaArtifact: tracked("briefing.dexa-artifact", async ({ input, query }) => {
      const result = await query(
        `SELECT payload,version FROM physiqueos.canonical_briefing_records
          WHERE owner_user_id=$1 AND collection_name='dailyBriefings'
            AND (payload#>>'{trigger,scanId}'=$2 OR payload#>>'{trigger,evidenceId}'=$2
              OR payload#>>'{briefing,dexaEventNarrative,scanId}'=$2)
          ORDER BY observed_at DESC NULLS LAST,record_id DESC LIMIT 1`,
        [ownerUserId, input.scanId],
      );
      const row = result.rows[0];
      const artifact = row ? Object.freeze({ ...row.payload, version: Number(row.version) }) : null;
      return context({ artifact, query });
    }),
  });
}

export function createRepositoryBriefingNavigationReadStore({ repositories, loadRuntime } = {}) {
  const buildContext = async (artifact) => {
    const user = await repositories.users.getCurrentUser();
    const runtime = await loadRuntime();
    return Object.freeze({
      artifact,
      user,
      goals: runtime.goals ?? [],
      phaseReviewDecisions: runtime.phaseReviewDecisions ?? [],
      dexaScans: runtime.dexaScans ?? [],
      workItems: runtime.briefingReconciliationWorkItems ?? [],
      revision: Number(runtime.revision ?? 0),
    });
  };
  return Object.freeze({
    async listHistory() {
      const user = await repositories.users.getCurrentUser();
      const [artifacts, workItems] = await Promise.all([
        repositories.dailyBriefings.listDailyBriefings(user?.id),
        repositories.briefingReconciliationWorkItems.listWorkItems(user?.id),
      ]);
      return Object.freeze({ artifacts, workItems });
    },
    async getArtifact({ artifactId }) {
      const user = await repositories.users.getCurrentUser();
      const artifacts = await repositories.dailyBriefings.listDailyBriefings(user?.id);
      return buildContext(artifacts.find((item) => item.id === artifactId) ?? null);
    },
    async getDexaArtifact({ scanId }) {
      const user = await repositories.users.getCurrentUser();
      const artifacts = await repositories.dailyBriefings.listDailyBriefings(user?.id);
      const artifact = artifacts.find((item) => [
        item.trigger?.scanId,
        item.trigger?.evidenceId,
        item.briefing?.dexaEventNarrative?.scanId,
      ].some((value) => String(value) === String(scanId))) ?? null;
      return buildContext(artifact);
    },
  });
}
