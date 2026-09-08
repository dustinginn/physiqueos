import { createPhase4CanonicalRecordStore } from "./Phase4CanonicalRecordStore.js";

export function createPostgresEvidenceTimelineReadStore({ pool, ownerUserId, onComplete = null } = {}) {
  if (!pool?.query || !ownerUserId) throw new Error("Evidence Timeline storage requires a PostgreSQL pool and owner.");
  return Object.freeze({
    async load() {
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
      const records = createPhase4CanonicalRecordStore({ query });
      const list = (collection) => records.list({ ownerUserId, collection });
      try {
        const [weights, photos, dexaScans, protocols, checkIns, canonicalEvidenceObjects, analysisRows, briefingRows, packageRows] = await Promise.all([
          list("weightEntries"),
          list("progressPhotos"),
          list("dexaScans"),
          list("protocols"),
          list("dailyCheckIns"),
          list("canonicalEvidenceObjects"),
          query(
            `SELECT jsonb_build_object(
               'id',payload->'id','createdAt',payload->'createdAt','title',payload->'title',
               'summary',jsonb_build_object(
                 'resistance_sessions_last_7_days',payload#>'{summary,resistance_sessions_last_7_days}',
                 'exercises_tracked',payload#>'{summary,exercises_tracked}',
                 'exercises_improving',payload#>'{summary,exercises_improving}',
                 'exercises_regressing',payload#>'{summary,exercises_regressing}',
                 'recent_pr_count',payload#>'{summary,recent_pr_count}',
                 'most_improved_exercise',payload#>'{summary,most_improved_exercise}'
               )) AS payload
             FROM physiqueos.canonical_confidence_records
             WHERE owner_user_id=$1 AND collection_name='analyses'`,
            [ownerUserId],
          ),
          query(
            `SELECT jsonb_build_object(
               'id',payload->'id','generatedAt',payload->'generatedAt',
               'briefing',jsonb_build_object('hero',jsonb_build_object('title',payload#>'{briefing,hero,title}')),
               'trigger',jsonb_build_object('evidenceType',payload#>'{trigger,evidenceType}')
             ) AS payload
             FROM physiqueos.canonical_briefing_records
             WHERE owner_user_id=$1 AND collection_name='dailyBriefings'`,
            [ownerUserId],
          ),
          query(
            `SELECT jsonb_build_object(
               'package_id',payload->'package_id','captured_at',payload->'captured_at',
               'quality',jsonb_build_object('status',payload#>'{quality,status}'),
               'recovery',jsonb_build_object('recoverable',payload#>'{recovery,recoverable}')
             ) AS payload
             FROM physiqueos.canonical_evidence_records
             WHERE owner_user_id=$1 AND collection_name='evidencePackages'`,
            [ownerUserId],
          ),
        ]);
        return Object.freeze({
          weights,
          photos,
          dexaScans,
          protocols,
          checkIns,
          canonicalEvidenceObjects,
          analyses: analysisRows.rows.map((row) => row.payload),
          dailyBriefings: briefingRows.rows.map((row) => row.payload),
          evidencePackages: packageRows.rows.map((row) => row.payload),
        });
      } finally {
        onComplete?.({
          readModel: "timeline.history",
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
