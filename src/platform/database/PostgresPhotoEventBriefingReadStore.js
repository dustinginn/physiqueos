import path from "node:path";
import { parsePrivateMediaReference } from "../../contracts/v1/mediaIdentifiers.js";
import { normalizeLegacyMediaPath } from "../../application/media/ProviderMediaReferenceResolver.js";

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
        const [briefings, goals] = await Promise.all([
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
        ]);
        const briefing = briefings[0];
        const goal = goals[0];
        const lookup = collectMediaLookup(briefing?.payload?.briefing?.photoEventNarrative);
        const mediaObjects = await query(
          `SELECT id,evidence_record_id,original_filename,sha256,provenance,state
             FROM physiqueos.canonical_media_objects
            WHERE owner_user_id=$1 AND state='verified'
              AND (id=ANY($2::text[])
                OR lower(replace(coalesce(provenance->>'sourceRelativePath',''),'\\','/'))=ANY($3::text[])
                OR lower(coalesce(original_filename,''))=ANY($4::text[]))
            ORDER BY id`,
          [ownerUserId, lookup.objectIds, lookup.sourcePaths, lookup.basenames],
        );
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

function collectMediaLookup(value) {
  const references = [];
  visit(value, references);
  const objectIds = new Set();
  const sourcePaths = new Set();
  const basenames = new Set();
  for (const reference of references) {
    const objectId = parsePrivateMediaReference(reference) ?? String(reference).match(/^\/api\/private-evidence\/media\/([^/?#]+)$/i)?.[1];
    if (objectId) {
      objectIds.add(objectId);
      continue;
    }
    const normalized = normalizeLegacyMediaPath(reference);
    if (!normalized) continue;
    for (const candidate of [normalized, `private/${normalized}`, `founder/${normalized}`, `private/founder/${normalized}`]) {
      sourcePaths.add(candidate.toLowerCase());
    }
    basenames.add(path.posix.basename(normalized));
  }
  return Object.freeze({
    objectIds: Object.freeze([...objectIds]),
    sourcePaths: Object.freeze([...sourcePaths]),
    basenames: Object.freeze([...basenames]),
  });
}

function visit(value, output) {
  if (typeof value === "string" && (value.startsWith("media://") || value.startsWith("/api/private-evidence/"))) output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => visit(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => visit(item, output));
}
