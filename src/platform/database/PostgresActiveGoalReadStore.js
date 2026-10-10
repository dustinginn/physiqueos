import { canonicalWeightEntries } from "../../domain/weight/canonicalWeight.js";
import { selectCanonicalActiveGoal } from "../../domain/services/CanonicalGoalRelationshipService.js";
import { resolveCanonicalGoalPhaseChronology } from "../../domain/services/CanonicalGoalPhaseChronologyService.js";
import { selectLatestPublishedV3Briefing } from "../../domain/services/ActiveGoalCurrentStateService.js";

// Latest published V3-bound briefing, in Briefing History order (publication
// instant desc). Step 1 reads only the metadata of a handful of the newest V3
// candidates, re-ranked by evidence coverage by the shared selector (so a failed/in-progress head never hides the
// published one); step 2 loads the bounded Coach's Take inputs for only that
// selected artifact. The published/V3 decision is the shared domain selector.
const LATEST_V3_BRIEFING_CANDIDATES_SQL = `SELECT record_id,
    payload->>'id' AS id, payload->>'cadence' AS cadence, payload->>'artifactType' AS "artifactType",
    payload->'preview' AS preview, payload->>'deliveryDate' AS "deliveryDate", payload->>'generatedAt' AS "generatedAt",
    payload->>'createdAt' AS "createdAt", payload->'lifecycle' AS lifecycle, payload->'confidencePublication' AS "confidencePublication",
    payload->>'status' AS status, payload->'evidenceWindow' AS "evidenceWindow"
  FROM physiqueos.canonical_briefing_records
  WHERE owner_user_id=$1 AND collection_name='dailyBriefings'
    AND payload#>>'{confidencePublication,schemaVersion}'='briefing_confidence_binding_v3'
    AND payload->>'cadence' IN ('weekly','midweek','monthly','event')
    AND jsonb_typeof(payload#>'{briefing,narrativeV3}')='object'
  ORDER BY COALESCE(
    NULLIF(payload->>'deliveryDate','')::timestamptz,
    NULLIF(payload->>'generatedAt','')::timestamptz,
    NULLIF(payload->>'createdAt','')::timestamptz,
    observed_at,'epoch'::timestamptz
  ) DESC,record_id DESC
  LIMIT 8`;
// Home and Goals already discard these V3-only construction envelopes before
// presentation. Active Goal used to pull every envelope across the database
// boundary first, even though neither its confidence nor Coach's Take reads
// them. Apply the same established projection in PostgreSQL so large-account
// history does not dominate request transfer time. Non-V3 records remain
// byte-for-byte intact for compatibility validation.
const ACTIVE_GOAL_COLLECTIONS_SQL = `SELECT collection_name,payload,version FROM (
    SELECT collection_name,payload,version,source_ordinal,record_id
      FROM physiqueos.canonical_goal_records
      WHERE owner_user_id=$1 AND collection_name=ANY($2::text[])
    UNION ALL
    SELECT collection_name,payload,version,source_ordinal,record_id
      FROM physiqueos.canonical_user_records
      WHERE owner_user_id=$1 AND collection_name=ANY($3::text[])
    UNION ALL
    SELECT collection_name,payload,version,source_ordinal,record_id
      FROM physiqueos.canonical_evidence_records
      WHERE owner_user_id=$1 AND collection_name=ANY($4::text[])
    UNION ALL
    SELECT collection_name,payload,version,source_ordinal,record_id
      FROM physiqueos.canonical_protocol_records
      WHERE owner_user_id=$1 AND collection_name=ANY($5::text[])
    UNION ALL
    SELECT collection_name,payload,version,source_ordinal,record_id
      FROM physiqueos.canonical_checkin_records
      WHERE owner_user_id=$1 AND collection_name=ANY($6::text[])
    UNION ALL
    SELECT collection_name,
      CASE
        WHEN collection_name='goalConfidenceHistory' AND
          payload#>>'{assessment,schemaVersion}'='canonical_confidence_assessment_v3'
        THEN jsonb_set(payload,ARRAY['assessment']::text[],
          (payload->'assessment') - ARRAY[
            'strategicInterpretation',
            'coachingState',
            'confidenceProjection',
            'narrativePlan',
            'evidenceEligibility'
          ]::text[],false)
        ELSE payload
      END AS payload,
      version,source_ordinal,record_id
      FROM physiqueos.canonical_confidence_records
      WHERE owner_user_id=$1 AND collection_name=ANY($7::text[])
  ) AS canonical_records
  ORDER BY collection_name,record_id`;
const ACTIVE_GOAL_COLLECTIONS = Object.freeze([
  "goals", "user", "dexaScans", "protocols", "phaseStrategies", "weightEntries",
  "goalConfidenceSnapshots", "goalConfidenceHistory",
]);

function groupActiveGoalCollections(rows) {
  const grouped = Object.fromEntries(ACTIVE_GOAL_COLLECTIONS.map((name) => [name, []]));
  for (const row of rows) grouped[row.collection_name].push(Object.freeze({
    ...row.payload,
    version: Number(row.version),
  }));
  return Object.freeze(Object.fromEntries(Object.entries(grouped).map(([name, records]) =>
    [name, Object.freeze(records)])));
}
// Active Goal never serves the selected briefing artifact itself. It projects
// only the canonical Coach's Take plus its publication/Confidence lineage.
// Keep every field read by that shared projection (including Midweek's
// presentation contract), while leaving multi-megabyte evidence envelopes and
// unrelated briefing modules in storage.
const BRIEFING_ARTIFACT_SQL = `SELECT
    payload->>'id' AS id,
    payload->>'cadence' AS cadence,
    payload->>'artifactType' AS "artifactType",
    payload->'preview' AS preview,
    payload->>'deliveryDate' AS "deliveryDate",
    payload->>'generatedAt' AS "generatedAt",
    payload->>'createdAt' AS "createdAt",
    payload->'lifecycle' AS lifecycle,
    payload->'confidencePublication' AS "confidencePublication",
    payload->>'status' AS status,
    payload->'evidenceWindow' AS "evidenceWindow",
    payload->'goalContext' AS "goalContext",
    payload->'trigger' AS trigger,
    payload#>'{briefing,narrativeV3}' AS "briefingNarrativeV3",
    payload#>'{briefing,goalConfidence}' AS "briefingGoalConfidence",
    payload#>'{briefing,activeGoal}' AS "briefingActiveGoal",
    payload#>'{briefing,activePhase}' AS "briefingActivePhase",
    payload#>'{briefing,energyBalance}' AS "briefingEnergyBalance",
    payload#>'{briefing,weightContext}' AS "briefingWeightContext",
    payload#>'{briefing,bodyComposition}' AS "briefingBodyComposition",
    payload#>'{briefing,training}' AS "briefingTraining",
    payload#>'{briefing,dexaEventNarrative}' IS NOT NULL AND
      payload#>'{briefing,dexaEventNarrative}'<>'null'::jsonb AS "hasDexaEventNarrative",
    payload#>'{briefing,photoEventNarrative}' IS NOT NULL AND
      payload#>'{briefing,photoEventNarrative}'<>'null'::jsonb AS "hasPhotoEventNarrative",
    version
  FROM physiqueos.canonical_briefing_records
  WHERE owner_user_id=$1 AND collection_name='dailyBriefings' AND record_id=$2`;

export function projectActiveGoalBriefingArtifact(artifact) {
  if (!artifact || typeof artifact !== "object") return null;
  const briefing = artifact.briefing && typeof artifact.briefing === "object"
    ? {
        narrativeV3: artifact.briefing.narrativeV3,
        goalConfidence: artifact.briefing.goalConfidence,
        activeGoal: artifact.briefing.activeGoal,
        activePhase: artifact.briefing.activePhase,
        energyBalance: artifact.briefing.energyBalance,
        weightContext: artifact.briefing.weightContext,
        bodyComposition: artifact.briefing.bodyComposition,
        training: artifact.briefing.training,
        ...(artifact.briefing.dexaEventNarrative ? { dexaEventNarrative: {} } : {}),
        ...(artifact.briefing.photoEventNarrative ? { photoEventNarrative: {} } : {}),
      }
    : artifact.briefing;
  return Object.freeze({
    id: artifact.id,
    cadence: artifact.cadence,
    artifactType: artifact.artifactType,
    preview: artifact.preview,
    deliveryDate: artifact.deliveryDate,
    generatedAt: artifact.generatedAt,
    createdAt: artifact.createdAt,
    lifecycle: artifact.lifecycle,
    confidencePublication: artifact.confidencePublication,
    status: artifact.status,
    evidenceWindow: artifact.evidenceWindow,
    goalContext: artifact.goalContext,
    trigger: artifact.trigger,
    briefing,
    version: artifact.version,
  });
}

function mapProjectedBriefingArtifact(row) {
  if (!row) return null;
  return projectActiveGoalBriefingArtifact({
    id: row.id,
    cadence: row.cadence,
    artifactType: row.artifactType,
    preview: row.preview,
    deliveryDate: row.deliveryDate,
    generatedAt: row.generatedAt,
    createdAt: row.createdAt,
    lifecycle: row.lifecycle,
    confidencePublication: row.confidencePublication,
    status: row.status,
    evidenceWindow: row.evidenceWindow,
    goalContext: row.goalContext,
    trigger: row.trigger,
    briefing: {
      narrativeV3: row.briefingNarrativeV3,
      goalConfidence: row.briefingGoalConfidence,
      activeGoal: row.briefingActiveGoal,
      activePhase: row.briefingActivePhase,
      energyBalance: row.briefingEnergyBalance,
      weightContext: row.briefingWeightContext,
      bodyComposition: row.briefingBodyComposition,
      training: row.briefingTraining,
      ...(row.hasDexaEventNarrative ? { dexaEventNarrative: {} } : {}),
      ...(row.hasPhotoEventNarrative ? { photoEventNarrative: {} } : {}),
    },
    version: Number(row.version),
  });
}

export function createPostgresActiveGoalReadStore({ pool, ownerUserId, onComplete = null } = {}) {
  if (!pool?.query || !ownerUserId) throw new Error("Active Goal storage requires a PostgreSQL pool and owner.");
  let queryCount = 0;
  let rowCount = 0;
  let payloadBytes = 0;
  return Object.freeze({
    async load() {
      queryCount = 0;
      rowCount = 0;
      payloadBytes = 0;
      const startedAt = performance.now();
      try {
        const collectionResult = await pool.query(ACTIVE_GOAL_COLLECTIONS_SQL, [
          ownerUserId,
          ["goals", "phaseStrategies"],
          ["user"],
          ["dexaScans"],
          ["protocols"],
          ["weightEntries"],
          ["goalConfidenceSnapshots", "goalConfidenceHistory"],
        ]);
        const collectionRows = groupActiveGoalCollections(collectionResult.rows);
        const goals = collectionRows.goals;
        // The record store query is already owner-bound; legacy payloads need not
        // duplicate ownerUserId inside the JSON document.
        const goal = selectCanonicalActiveGoal(goals);
        const activePhaseStart = goal
          ? resolveCanonicalGoalPhaseChronology(goal).currentPhase?.startDate ?? "0001-01-01"
          : "0001-01-01";
        const [evidenceRows, briefingRows] = await Promise.all([
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
        const users = collectionRows.user;
        const dexaScans = collectionRows.dexaScans;
        const protocols = collectionRows.protocols;
        const phaseStrategies = collectionRows.phaseStrategies;
        const weightEntries = collectionRows.weightEntries;
        const goalConfidenceSnapshots = collectionRows.goalConfidenceSnapshots;
        const goalConfidenceHistory = collectionRows.goalConfidenceHistory;
        const selectedBriefing = selectLatestPublishedV3Briefing(briefingRows.rows.map((row) => ({
          ...row, id: row.id ?? row.record_id, briefing: {},
          preview: row.preview === true, lifecycle: row.lifecycle ?? null,
        })));
        const artifactRows = selectedBriefing
          ? await pool.query(BRIEFING_ARTIFACT_SQL, [ownerUserId, selectedBriefing.record_id]) : { rows: [] };
        queryCount += selectedBriefing ? 4 : 3;
        rowCount += collectionResult.rows.length + evidenceRows.rows.length + briefingRows.rows.length + artifactRows.rows.length;
        payloadBytes += Buffer.byteLength(JSON.stringify(collectionResult.rows)) +
          Buffer.byteLength(JSON.stringify(evidenceRows.rows)) + Buffer.byteLength(JSON.stringify(briefingRows.rows)) +
          Buffer.byteLength(JSON.stringify(artifactRows.rows));
        const latestArtifact = mapProjectedBriefingArtifact(artifactRows.rows[0]);
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
      const latestBriefing = selectLatestPublishedV3Briefing(runtime?.dailyBriefings ?? []);
      return Object.freeze({ user, goal, dexaScans, protocols, canonicalEvidence, store: runtime,
        latestBriefing: projectActiveGoalBriefingArtifact(latestBriefing) });
    },
  });
}
