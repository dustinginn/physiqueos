export function createPostgresPhotoEventBriefingReadStore({ pool, ownerUserId, onComplete = null } = {}) {
  if (!pool?.query || !ownerUserId) throw new Error("Photo Event briefing reads require a PostgreSQL pool and owner.");
  return Object.freeze({
    async load({ sessionId }) {
      let queryCount = 0;
      let rowCount = 0;
      let payloadBytes = 0;
      const startedAt = performance.now();
      const query = async (text, values) => {
        queryCount += 1;
        const result = await pool.query(text, values);
        rowCount += result.rows.length;
        payloadBytes += Buffer.byteLength(JSON.stringify(result.rows));
        return result.rows;
      };
      try {
        const eventId = `event_briefing_progress_photo_${sessionId}`;
        const [briefings, goals, mediaObjects] = await Promise.all([
          query(
            `SELECT record_id,payload,version
               FROM physiqueos.canonical_briefing_records
              WHERE owner_user_id=$1 AND collection_name='dailyBriefings'
                AND (record_id=$2 OR payload#>>'{trigger,sessionId}'=$3)
              ORDER BY CASE WHEN record_id=$2 THEN 0 ELSE 1 END,updated_at DESC
              LIMIT 1`,
            [ownerUserId, eventId, sessionId],
          ),
          query(
            `SELECT record_id,payload,version
               FROM physiqueos.canonical_goal_records
              WHERE owner_user_id=$1 AND collection_name='goals'
                AND (record_id='goal_visible_abs_at_rest' OR payload->>'id'='goal_visible_abs_at_rest')
              ORDER BY record_id LIMIT 1`,
            [ownerUserId],
          ),
          query(
            `SELECT id,evidence_record_id,original_filename,sha256,provenance,state
               FROM physiqueos.canonical_media_objects
              WHERE owner_user_id=$1 AND state='verified'
              ORDER BY id`,
            [ownerUserId],
          ),
        ]);
        const briefing = briefings[0];
        const goal = goals[0];
        return Object.freeze({
          artifact: briefing ? Object.freeze({ ...briefing.payload, version: Number(briefing.version) }) : null,
          goal: goal ? Object.freeze({ ...goal.payload, version: Number(goal.version) }) : null,
          mediaObjects: Object.freeze(mediaObjects.map((row) => Object.freeze(row))),
        });
      } finally {
        onComplete?.({
          readModel: "photo-event-briefing",
          sessionId,
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
