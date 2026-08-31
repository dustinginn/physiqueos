import path from "node:path";
import { parsePrivateMediaReference } from "../../contracts/v1/mediaIdentifiers.js";
import { normalizeLegacyMediaPath } from "../../application/media/ProviderMediaReferenceResolver.js";

const GOAL_ID = "goal_visible_abs_at_rest";
const COMPLETION_DATE = "2026-07-18";

export function createPostgresCompletedGoalReadStore({
  pool,
  ownerUserId,
  onComplete = null,
} = {}) {
  if (!pool?.query || !ownerUserId) {
    throw new Error("Completed goal storage requires a PostgreSQL pool and owner.");
  }

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
        return result.rows;
      };

      try {
        const rows = await query(
          `SELECT record_kind,record_id,payload,version FROM (
             SELECT 'goal'::text AS record_kind,record_id,payload,version
               FROM physiqueos.canonical_goal_records
              WHERE owner_user_id=$1 AND collection_name='goals'
                AND (payload->>'id'=$2 OR (payload->>'status'='active' AND COALESCE((payload->>'primary')::boolean,false)))
             UNION ALL
             SELECT 'dexa'::text AS record_kind,record_id,payload,version
               FROM physiqueos.canonical_evidence_records
              WHERE owner_user_id=$1 AND collection_name='dexaScans'
                AND COALESCE(payload->>'measuredAt',payload->>'date') BETWEEN $3 AND $4
             UNION ALL
             SELECT 'photo'::text AS record_kind,record_id,payload,version
               FROM physiqueos.canonical_evidence_records
              WHERE owner_user_id=$1 AND collection_name='progressPhotos'
                AND payload->'relatedGoalIds' ? $2
                AND payload->>'view'='front' AND payload->>'pose'='relaxed'
                AND payload->>'date'<=$4
             UNION ALL
             SELECT 'briefing'::text AS record_kind,record_id,payload,version
               FROM physiqueos.canonical_briefing_records
              WHERE owner_user_id=$1 AND collection_name='dailyBriefings'
                AND payload#>>'{briefing,photoEventNarrative,eventDate}'=$4
                AND payload#>>'{briefing,photoEventNarrative,goalCompletionHandoff,goalId}'=$2
           ) AS completed_goal_inputs ORDER BY record_kind,record_id`,
          [ownerUserId, GOAL_ID, "2026-05-24", COMPLETION_DATE],
        );
        const payloads = (kind) => rows
          .filter((row) => row.record_kind === kind)
          .map((row) => Object.freeze({ ...row.payload, version: Number(row.version) }));
        const goals = payloads("goal");
        const progressPhotos = payloads("photo");
        const briefings = payloads("briefing");
        const mediaLookup = collectMediaLookup({ briefings, progressPhotos });
        const mediaObjects = await query(
          `SELECT id,evidence_record_id,original_filename,sha256,provenance,state
             FROM physiqueos.canonical_media_objects
            WHERE owner_user_id=$1 AND state='verified'
              AND (id=ANY($2::text[])
                OR lower(replace(coalesce(provenance->>'sourceRelativePath',''),'\\','/'))=ANY($3::text[])
                OR lower(coalesce(original_filename,''))=ANY($4::text[]))
            ORDER BY id`,
          [ownerUserId, mediaLookup.objectIds, mediaLookup.sourcePaths, mediaLookup.basenames],
        );

        return Object.freeze({
          goals: Object.freeze(goals),
          currentGoal: goals.find((goal) => goal.status === "active" && goal.primary) ?? null,
          dexaScans: Object.freeze(payloads("dexa")),
          progressPhotos: Object.freeze(progressPhotos),
          briefings: Object.freeze(briefings),
          mediaObjects: Object.freeze(mediaObjects.map((row) => Object.freeze(row))),
        });
      } finally {
        onComplete?.({
          readModel: "goals.completed.visible-abs",
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
  });
}

export function createRepositoryCompletedGoalReadStore({ repositories } = {}) {
  return Object.freeze({
    async load() {
      const user = await repositories.users.getCurrentUser();
      const userId = user?.id;
      const [goals, dexaScans, progressPhotos, briefings, currentGoal] = await Promise.all([
        repositories.goals.listGoals(userId),
        repositories.dexaScans.listDEXAScans(userId),
        repositories.progressPhotos.listPhotos(userId),
        repositories.dailyBriefings.listDailyBriefings(userId),
        repositories.goals.getActiveGoal(userId),
      ]);
      return Object.freeze({ goals, dexaScans, progressPhotos, briefings, currentGoal, mediaObjects: null });
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
    const objectId = parsePrivateMediaReference(reference)
      ?? String(reference).match(/^\/api\/private-evidence\/media\/([^/?#]+)$/i)?.[1];
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
  if (typeof value === "string" && (
    value.startsWith("media://")
    || value.startsWith("/api/private-evidence/")
    || value.startsWith("private/")
  )) output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => visit(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => visit(item, output));
}
