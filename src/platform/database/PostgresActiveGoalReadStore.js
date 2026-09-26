import { createPhase4CanonicalRecordStore } from "./Phase4CanonicalRecordStore.js";
import { canonicalWeightEntries } from "../../domain/weight/canonicalWeight.js";
import { selectCanonicalActiveGoal } from "../../domain/services/CanonicalGoalRelationshipService.js";
import { resolveCanonicalGoalPhaseChronology } from "../../domain/services/CanonicalGoalPhaseChronologyService.js";
import { selectLatestPublishedV3Briefing } from "../../domain/services/ActiveGoalCurrentStateService.js";

// Latest published V3-bound briefing, in Briefing History order (publication
// instant desc, record id desc). Step 1 reads only the metadata of a handful of
// the newest V3 candidates (so a failed/in-progress head never hides the
// published one); step 2 loads the single selected artifact in full. The
// published/V3 decision is the shared domain selector.
const LATEST_V3_BRIEFING_CANDIDATES_SQL = `SELECT record_id,
    payload->>'id' AS id, payload->>'cadence' AS cadence, payload->>'artifactType' AS "artifactType",
    payload->'preview' AS preview, payload->>'deliveryDate' AS "deliveryDate", payload->>'generatedAt' AS "generatedAt",
    payload->>'createdAt' AS "createdAt", payload->'lifecycle' AS lifecycle, payload->'confidencePublication' AS "confidencePublication"
  FROM physiqueos.canonical_briefing_records
  WHERE owner_user_id=$1 AND collection_name='dailyBriefings'
    AND payload#>>'{confidencePublication,schemaVersion}'='briefing_confidence_binding_v3'
    AND payload->>'cadence' IN ('weekly','midweek','monthly','event')
    AND (payload#>'{briefing,narrativeV3}') IS NOT NULL
  ORDER BY COALESCE(
    NULLIF(payload->>'deliveryDate','')::timestamptz,
    NULLIF(payload->>'generatedAt','')::timestamptz,
    NULLIF(payload->>'createdAt','')::timestamptz,
    observed_at,'epoch'::timestamptz
  ) DESC,record_id DESC
  LIMIT 5`;
const BRIEFING_ARTIFACT_SQL = `SELECT payload,version FROM physiqueos.canonical_briefing_records
  WHERE owner_user_id=$1 AND collection_name='dailyBriefings' AND record_id=$2`;

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
        // The record store query is already owner-bound; legacy payloads need not
        // duplicate ownerUserId inside the JSON document.
        const goal = selectCanonicalActiveGoal(goals);
        const activePhaseStart = goal
          ? resolveCanonicalGoalPhaseChronology(goal).currentPhase?.startDate ?? "0001-01-01"
          : "0001-01-01";
        const [users, dexaScans, protocols, phaseStrategies, weightEntries, goalConfidenceSnapshots, goalConfidenceHistory, evidenceRows, briefingRows] = await Promise.all([
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
          pool.query(LATEST_V3_BRIEFING_CANDIDATES_SQL, [ownerUserId]),
        ]);
        const selectedBriefing = selectLatestPublishedV3Briefing(briefingRows.rows.map((row) => ({
          ...row, id: row.id ?? row.record_id, briefing: {},
          preview: row.preview === true, lifecycle: row.lifecycle ?? null,
        })));
        const artifactRows = selectedBriefing
          ? await pool.query(BRIEFING_ARTIFACT_SQL, [ownerUserId, selectedBriefing.record_id]) : { rows: [] };
        queryCount += selectedBriefing ? 3 : 2;
        rowCount += evidenceRows.rows.length + briefingRows.rows.length + artifactRows.rows.length;
        payloadBytes += Buffer.byteLength(JSON.stringify(evidenceRows.rows)) + Buffer.byteLength(JSON.stringify(briefingRows.rows)) +
          Buffer.byteLength(JSON.stringify(artifactRows.rows));
        const latestArtifact = artifactRows.rows[0]
          ? { ...artifactRows.rows[0].payload, version: Number(artifactRows.rows[0].version) } : null;
        return Object.freeze({
          user: users.find((item) => item.id === ownerUserId) ?? users[0] ?? null,
          goal,
          dexaScans,
          protocols,
          canonicalEvidence: evidenceRows.rows.map((row) => Object.freeze({ ...row.payload, version: Number(row.version) })),
          // Re-validated on the full artifact (it must still be published and V3).
          latestBriefing: latestArtifact ? selectLatestPublishedV3Briefing([latestArtifact]) : null,
          store: Object.freeze({
            phaseStrategies,
            weightEntries: canonicalWeightEntries(weightEntries),
            goalConfidenceSnapshots,
            goalConfidenceHistory,
          }),
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
      return Object.freeze({ user, goal, dexaScans, protocols, canonicalEvidence, store: runtime,
        latestBriefing: selectLatestPublishedV3Briefing(runtime?.dailyBriefings ?? []) });
    },
  });
}
