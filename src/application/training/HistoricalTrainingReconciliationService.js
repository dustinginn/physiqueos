import { createPayloadHash } from "../../contracts/v1/canonicalJson.js";
import {
  auditHistoricalWorkoutLoggerApplePairs,
  reconcileExplicitWorkoutLoggerAppleSupportPair,
  reconcileHistoricalWorkoutLoggerApplePair,
} from "../../domain/services/CanonicalEvidenceService.js";
import { createActivitySemanticFingerprint } from "../../domain/services/CanonicalActivityDayService.js";

export const HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION = "EXECUTE_APPROVED_HISTORICAL_TRAINING_PREVIEW";
const PREVIEW_SCHEMA = "historical-training-preview-v2";
const EXPLICIT_SUPPORT_PREVIEW_SCHEMA = "explicit-training-support-preview-v1";

// Database identity is caller-supplied, never inferred from a canonical ID or
// regenerated ordinal. Legacy repository/import keys legitimately use @index:*.
function snapshotIdentities(ownerUserId, records) {
  if (!Array.isArray(records)) throw new Error("Invalid owner-scoped canonical snapshot.");
  const storageKeys = new Set(), canonicalIds = new Set();
  return records.map((row) => {
    const canonicalId = row.payload?.canonicalId;
    const recordType = row.payload?.payload?.evidence_type;
    if (row.ownerUserId !== ownerUserId || row.collectionName !== "canonicalEvidenceObjects" ||
        row.payload?.userId !== ownerUserId || typeof row.recordId !== "string" || !row.recordId.trim() ||
        typeof canonicalId !== "string" || !canonicalId.trim() || storageKeys.has(row.recordId) || canonicalIds.has(canonicalId) ||
        !["training", "activity_day"].includes(recordType) ||
        ![undefined, "active", "superseded"].includes(row.payload.quality?.status) ||
        !Number.isSafeInteger(row.version) || row.version < 1) throw new Error("Invalid owner-scoped canonical snapshot.");
    storageKeys.add(row.recordId); canonicalIds.add(canonicalId);
    return { recordId: row.recordId, canonicalId, ownerUserId, collectionName: row.collectionName,
      version: row.version, digest: createPayloadHash(row.payload), recordType,
      databaseStatus: row.databaseStatus ?? null, sourceIdentity: row.sourceIdentity ?? null,
      canonicalStatus: row.payload.quality?.status ?? "active", supersededBy: row.payload.quality?.supersededBy ?? null };
  }).sort((a, b) => a.recordId.localeCompare(b.recordId));
}

function activityProjection(record) {
  return { dailyActivity: record.payload.daily_activity ?? null,
    derivedMetrics: record.payload.derived_metrics ?? null, references: record.payload.references ?? null,
    semanticFingerprint: createActivitySemanticFingerprint(record.payload) };
}

// Engineering-only manifest. No endpoint, scheduler, default execution, or
// production credential discovery. Preview is the default and is SQL READ ONLY.
export function previewHistoricalTrainingReconciliation({ ownerUserId, records }) {
  if (!ownerUserId) throw new Error("An explicit historical Training owner is required.");
  const snapshot = snapshotIdentities(ownerUserId, records);
  const identityByCanonicalId = new Map(snapshot.map((identity) => [identity.canonicalId, identity]));
  const objects = records.map((row) => row.payload);
  const audit = auditHistoricalWorkoutLoggerApplePairs({ canonicalObjects: objects, userId: ownerUserId });
  const pairs = [];
  const excluded = [...audit.excludedAmbiguous];
  let next = objects;
  for (const candidate of audit.candidates) {
    const telemetryCanonicalId = candidate.telemetryCanonicalIds[0];
    let changes;
    try {
      changes = reconcileHistoricalWorkoutLoggerApplePair({ canonicalObjects: next, userId: ownerUserId,
        structuredCanonicalId: candidate.structuredCanonicalId, telemetryCanonicalId });
    } catch (error) {
      if (error.message !== "Historical Training attribution does not agree.") throw error;
      excluded.push({ ...candidate, reason: "attribution-mismatch" });
      continue;
    }
    const changed = new Map(changes.map((record) => [record.canonicalId, record]));
    const workoutCalories = (items) => items.filter((record) => record.quality?.status !== "superseded" &&
      record.payload.evidence_type === "training" && record.payload.observed_at?.slice(0, 10) === candidate.date)
      .reduce((sum, record) => {
        const calories = Number(record.payload.metadata?.active_calories);
        return sum + (Number.isFinite(calories) ? calories : 0);
      }, 0);
    const beforeWorkoutActiveCalories = workoutCalories(next);
    next = next.map((record) => changed.get(record.canonicalId) ?? record);
    if (beforeWorkoutActiveCalories !== workoutCalories(next)) throw new Error("Historical merge changed the canonical workout calorie sum.");
    const survivor = changes[0];
    pairs.push({ date: candidate.date, survivorId: survivor.canonicalId, retiredId: telemetryCanonicalId,
      survivorRecord: identityByCanonicalId.get(survivor.canonicalId), retiredRecord: identityByCanonicalId.get(telemetryCanonicalId),
      structuredCounterpartCount: 1, telemetryCounterpartCount: 1,
      exerciseIds: survivor.payload.exercises.map((exercise) => exercise.canonicalExerciseId),
      setCount: survivor.payload.exercises.reduce((sum, exercise) => sum + (exercise.sets ?? []).length, 0),
      telemetry: survivor.payload.metadata,
      beforeWorkoutActiveCalories, afterWorkoutActiveCalories: workoutCalories(next),
      frozenAttributionPreserved: true, structuredHistoryIdentityPreserved: true,
      performanceRecordsMutation: "none", evidenceReviewMutation: "none",
      activityCaloriePolicy: "recompute existing active Activity records only on pair dates using canonical semantics" });
  }
  const activityChanges = next.filter((record) => record.payload.evidence_type === "activity_day" &&
    createPayloadHash(record) !== createPayloadHash(objects.find((prior) => prior.canonicalId === record.canonicalId)))
    .map((record) => {
      const prior = objects.find((item) => item.canonicalId === record.canonicalId);
      const before = activityProjection(prior), after = activityProjection(record);
      if (createPayloadHash(before.dailyActivity) !== createPayloadHash(after.dailyActivity) || before.semanticFingerprint !== after.semanticFingerprint) {
        throw new Error("Historical Training repair cannot change Activity observations.");
      }
      return { identity: identityByCanonicalId.get(record.canonicalId), date: record.payload.observed_at?.slice(0, 10), before, after,
        consequence: "refresh persisted derived fields and canonical session references; daily observation and semantic revision unchanged" };
    });
  const activeCount = (items) => items.filter((record) => record.payload.evidence_type === "training" && record.quality?.status !== "superseded").length;
  const body = {
    schema: PREVIEW_SCHEMA, ownerUserId, pairs, excluded, activityChanges,
    totalTrainingRecordCount: objects.filter((record) => record.payload.evidence_type === "training").length,
    candidateCount: pairs.length, beforeActiveTrainingCount: activeCount(objects), afterActiveTrainingCount: activeCount(next),
    snapshot,
  };
  return { ...body, digest: createPayloadHash(body) };
}

// Read-only, one-pair preview for already-created residue whose explicit
// Logger-support intent has been established outside automatic matching.
// The preview seals persisted storage identity, canonical identity, version,
// and payload digest. It is deliberately not reachable from an endpoint or
// scheduler and cannot discover candidates from date/category similarity.
export function previewExplicitTrainingSupportReconciliation({
  ownerUserId, records, structuredCanonicalId, telemetryCanonicalId,
}) {
  if (!ownerUserId) throw new Error("An explicit historical Training owner is required.");
  const snapshot = snapshotIdentities(ownerUserId, records);
  const identityByCanonicalId = new Map(snapshot.map((identity) => [identity.canonicalId, identity]));
  const survivorRecord = identityByCanonicalId.get(structuredCanonicalId);
  const retiredRecord = identityByCanonicalId.get(telemetryCanonicalId);
  if (!survivorRecord || !retiredRecord) throw new Error("Explicit Training support identities are unavailable.");
  const objects = records.map((row) => row.payload);
  const changes = reconcileExplicitWorkoutLoggerAppleSupportPair({
    canonicalObjects: objects, userId: ownerUserId, structuredCanonicalId, telemetryCanonicalId,
  });
  const byId = new Map(changes.map((record) => [record.canonicalId, record]));
  const next = objects.map((record) => byId.get(record.canonicalId) ?? record);
  const survivor = byId.get(structuredCanonicalId);
  const date = survivor.payload.observed_at.slice(0, 10);
  const pair = {
    date, survivorId: structuredCanonicalId, retiredId: telemetryCanonicalId,
    survivorRecord, retiredRecord,
    exerciseIds: survivor.payload.exercises.map((exercise) => exercise.canonicalExerciseId),
    setCount: survivor.payload.exercises.reduce((sum, exercise) => sum + (exercise.sets ?? []).length, 0),
    telemetry: survivor.payload.metadata,
    selectionBasis: "founder_reviewed_explicit_logger_support_intent",
    frozenAttributionPreserved: true, structuredHistoryIdentityPreserved: true,
    performanceRecordsMutation: "none", evidenceReviewMutation: "none",
    activityCaloriePolicy: "recompute existing active Activity record on the exact pair date using canonical semantics",
  };
  const activityChanges = next.filter((record) => record.payload.evidence_type === "activity_day" &&
    createPayloadHash(record) !== createPayloadHash(objects.find((prior) => prior.canonicalId === record.canonicalId)))
    .map((record) => {
      const prior = objects.find((item) => item.canonicalId === record.canonicalId);
      const before = activityProjection(prior), after = activityProjection(record);
      if (createPayloadHash(before.dailyActivity) !== createPayloadHash(after.dailyActivity) ||
          before.semanticFingerprint !== after.semanticFingerprint) {
        throw new Error("Explicit Training support repair cannot change Activity observations.");
      }
      return { identity: identityByCanonicalId.get(record.canonicalId), date, before, after,
        consequence: "refresh persisted derived fields and canonical session references; daily observation and semantic revision unchanged" };
    });
  const activeCount = (items) => items.filter((record) => record.payload.evidence_type === "training" && record.quality?.status !== "superseded").length;
  const body = {
    schema: EXPLICIT_SUPPORT_PREVIEW_SCHEMA, ownerUserId,
    explicitSelection: { structuredCanonicalId, telemetryCanonicalId },
    pairs: [pair], excluded: [], activityChanges,
    totalTrainingRecordCount: objects.filter((record) => record.payload.evidence_type === "training").length,
    candidateCount: 1, beforeActiveTrainingCount: activeCount(objects), afterActiveTrainingCount: activeCount(next),
    snapshot,
  };
  return { ...body, digest: createPayloadHash(body) };
}

export function createPostgresHistoricalTrainingReconciler({ pool, ownerUserId }) {
  if (!pool?.connect || !ownerUserId) throw new Error("An existing PostgreSQL pool and explicit owner are required.");
  const load = async (client, lock = false) => (await client.query(
    `SELECT record_id,version,payload,owner_user_id,collection_name,status,source_identity FROM physiqueos.canonical_evidence_records
       WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
       AND COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type') IN ('training','activity_day')
       ORDER BY record_id${lock ? " FOR UPDATE" : ""}`, [ownerUserId])).rows
    .map((row) => ({ recordId: row.record_id, version: Number(row.version), payload: row.payload,
      ownerUserId: row.owner_user_id, collectionName: row.collection_name, databaseStatus: row.status, sourceIdentity: row.source_identity }));

  return Object.freeze({
    async preview() {
      const client = await pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        const mode = await client.query("SHOW transaction_read_only");
        if (mode.rows[0]?.transaction_read_only !== "on") throw new Error("Historical preview must be PostgreSQL READ ONLY.");
        const result = previewHistoricalTrainingReconciliation({ ownerUserId, records: await load(client) });
        await client.query("ROLLBACK");
        return result;
      } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
      finally { client.release(); }
    },
    async execute({ approvedPreview, authorization } = {}) {
      const { digest, ...body } = approvedPreview ?? {};
      if (authorization !== HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION ||
          ![PREVIEW_SCHEMA, EXPLICIT_SUPPORT_PREVIEW_SCHEMA].includes(body.schema) || body.ownerUserId !== ownerUserId ||
          !body.pairs?.length || digest !== createPayloadHash(body)) throw new Error("Explicit authorization of an intact preview is required.");
      const client = await pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${ownerUserId}`]);
        const records = await load(client, true);
        snapshotIdentities(ownerUserId, records);
        const completed = body.pairs.every((pair) => {
          const retired = records.find((row) => row.recordId === pair.retiredRecord?.recordId)?.payload;
          const survivor = records.find((row) => row.recordId === pair.survivorRecord?.recordId)?.payload;
          return survivor?.canonicalId === pair.survivorId && retired?.canonicalId === pair.retiredId &&
            retired?.quality?.status === "superseded" && retired.quality.supersededBy === pair.survivorId &&
            retired.quality.historicalTrainingReconciliation?.previewDigest === digest &&
            retired.quality.historicalTrainingReconciliation?.survivorStorageId === pair.survivorRecord.recordId &&
            retired.quality.historicalTrainingReconciliation?.retiredStorageId === pair.retiredRecord.recordId;
        });
        if (completed) { await client.query("ROLLBACK"); return { outcome: "replayed", previewDigest: digest, pairs: body.pairs }; }
        const current = body.schema === EXPLICIT_SUPPORT_PREVIEW_SCHEMA
          ? previewExplicitTrainingSupportReconciliation({
              ownerUserId, records,
              structuredCanonicalId: body.explicitSelection?.structuredCanonicalId,
              telemetryCanonicalId: body.explicitSelection?.telemetryCanonicalId,
            })
          : previewHistoricalTrainingReconciliation({ ownerUserId, records });
        if (current.digest !== digest) throw new Error("Historical Training preview is stale; obtain a new read-only preview.");
        let objects = records.map((row) => row.payload);
        for (const pair of body.pairs) {
          const changes = body.schema === EXPLICIT_SUPPORT_PREVIEW_SCHEMA
            ? reconcileExplicitWorkoutLoggerAppleSupportPair({ canonicalObjects: objects, userId: ownerUserId,
                structuredCanonicalId: pair.survivorId, telemetryCanonicalId: pair.retiredId })
            : reconcileHistoricalWorkoutLoggerApplePair({ canonicalObjects: objects, userId: ownerUserId,
                structuredCanonicalId: pair.survivorId, telemetryCanonicalId: pair.retiredId });
          changes[1] = { ...changes[1], quality: { ...changes[1].quality,
            historicalTrainingReconciliation: { previewDigest: digest, survivorId: pair.survivorId,
              survivorStorageId: pair.survivorRecord.recordId, retiredStorageId: pair.retiredRecord.recordId } } };
          const byId = new Map(changes.map((record) => [record.canonicalId, record]));
          objects = objects.map((record) => byId.get(record.canonicalId) ?? record);
        }
        const changedIds = [], changedCanonicalIds = [];
        for (const row of records) {
          const next = objects.find((record) => record.canonicalId === row.payload.canonicalId);
          if (createPayloadHash(next) === createPayloadHash(row.payload)) continue;
          // Match the canonical record-store convention: DB/payload versions
          // advance together. Never rewrite record_id/source_ordinal/source_identity.
          const persisted = { ...next, version: row.version + 1 };
          const updated = await client.query(
            `UPDATE physiqueos.canonical_evidence_records SET payload=$4::jsonb,version=version+1,status=$5,provenance=$7::jsonb,updated_at=now()
               WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects' AND record_id=$2 AND version=$3
               AND payload->>'canonicalId'=$6 RETURNING record_id`,
            [ownerUserId, row.recordId, row.version, JSON.stringify(persisted), next.quality?.status ?? "active",
              row.payload.canonicalId, JSON.stringify(next.provenance ?? {})]);
          if (updated.rows.length !== 1) throw new Error("Historical canonical record version changed.");
          changedIds.push(row.recordId);
          changedCanonicalIds.push(row.payload.canonicalId);
        }
        const metadata = await client.query(
          `UPDATE physiqueos.canonical_runtime_metadata SET revision=revision+1,version=version+1,last_command_id=$2,updated_at=now()
             WHERE owner_user_id=$1 RETURNING revision`, [ownerUserId, `historical-training:${digest}`]);
        if (metadata.rows.length !== 1) throw new Error("Canonical owner revision is unavailable.");
        await client.query("COMMIT");
        return { outcome: "committed", previewDigest: digest, changedIds, changedCanonicalIds, pairs: body.pairs, activityChanges: body.activityChanges,
          beforeActiveTrainingCount: body.beforeActiveTrainingCount, afterActiveTrainingCount: body.afterActiveTrainingCount };
      } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
      finally { client.release(); }
    },
  });
}
