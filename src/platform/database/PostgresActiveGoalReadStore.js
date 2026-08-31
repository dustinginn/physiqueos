import { createPhase4CanonicalRecordStore } from "./Phase4CanonicalRecordStore.js";

export function createPostgresActiveGoalReadStore({ pool, ownerUserId, onComplete = null } = {}) {
  if (!pool?.query || !ownerUserId) throw new Error("Active Goal storage requires a PostgreSQL pool and owner.");
  let queryCount = 0;
  let rowCount = 0;
  let payloadBytes = 0;
  const records = createPhase4CanonicalRecordStore({
    query: async (text, values) => {
      queryCount += 1;
      const result = await pool.query(text, values);
      rowCount += result.rows.length;
      payloadBytes += Buffer.byteLength(JSON.stringify(result.rows));
      return result;
    },
  });
  const list = (collection) => records.list({ ownerUserId, collection });

  return Object.freeze({
    async load() {
      queryCount = 0;
      rowCount = 0;
      payloadBytes = 0;
      const startedAt = performance.now();
      try {
        const goals = await list("goals");
        const goal = goals.find((item) => item.status === "active" && item.type === "build_lean_mass") ?? null;
        const activePhaseStart = goal?.phases?.find((phase) => phase.status === "active")?.startDate ?? "0001-01-01";
        const [users, dexaScans, protocols, phaseStrategies, weightEntries, goalConfidenceSnapshots, goalConfidenceHistory, evidenceRows] = await Promise.all([
          list("user"),
          list("dexaScans"),
          list("protocols"),
          list("phaseStrategies"),
          list("weightEntries"),
          list("goalConfidenceSnapshots"),
          list("goalConfidenceHistory"),
          pool.query(
            `SELECT payload,version FROM physiqueos.canonical_evidence_records
              WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
                AND COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type')='training'
                AND left(COALESCE(payload#>>'{payload,observed_at}',payload->>'observed_at',''),10) >= $2
              ORDER BY COALESCE(payload#>>'{payload,observed_at}',payload->>'observed_at'),record_id`,
            [ownerUserId, activePhaseStart],
          ),
        ]);
        queryCount += 1;
        rowCount += evidenceRows.rows.length;
        payloadBytes += Buffer.byteLength(JSON.stringify(evidenceRows.rows));
        return Object.freeze({
          user: users.find((item) => item.id === ownerUserId) ?? users[0] ?? null,
          goal,
          dexaScans,
          protocols,
          canonicalEvidence: evidenceRows.rows.map((row) => Object.freeze({ ...row.payload, version: Number(row.version) })),
          store: Object.freeze({ phaseStrategies, weightEntries, goalConfidenceSnapshots, goalConfidenceHistory }),
        });
      } finally {
        onComplete?.({
          readModel: "goals.active.build-lean-mass",
          queryCount,
          rowCount,
          payloadBytes,
          compatibilityRuntimeLoadCount: 0,
          elapsedMs: Math.round(performance.now() - startedAt),
          pool: { totalCount: pool.totalCount, idleCount: pool.idleCount, waitingCount: pool.waitingCount },
        });
      }
    },
  });
}

export function createRepositoryActiveGoalReadStore({ repositories, loadRuntime } = {}) {
  return Object.freeze({
    async load() {
      const user = await repositories.users.getCurrentUser();
      const [goal, dexaScans, protocols, canonicalEvidence, runtime] = await Promise.all([
        repositories.goals.getActiveGoal(user?.id),
        repositories.dexaScans.listDEXAScans(user?.id),
        repositories.protocols.listActiveProtocols(user?.id),
        repositories.canonicalEvidence.listCanonicalEvidenceObjects(user?.id),
        loadRuntime(),
      ]);
      return Object.freeze({ user, goal, dexaScans, protocols, canonicalEvidence, store: runtime });
    },
  });
}
