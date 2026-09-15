import { createPayloadHash } from "../../contracts/v1/canonicalJson.js";
import { auditHistoricalWorkoutLoggerApplePairs, reconcileHistoricalWorkoutLoggerApplePair } from "../../domain/services/CanonicalEvidenceService.js";

export const HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION = "EXECUTE_APPROVED_HISTORICAL_TRAINING_PREVIEW";

// Engineering-only manifest. No endpoint, scheduler, default execution, or
// production credential discovery. Preview is the default and is SQL READ ONLY.
export function previewHistoricalTrainingReconciliation({ ownerUserId, records }) {
  if (!ownerUserId) throw new Error("An explicit historical Training owner is required.");
  const objects = records.map((row) => {
    if (row.payload.userId !== ownerUserId || row.recordId !== row.payload.canonicalId ||
        !Number.isInteger(row.version) || row.version < 1) throw new Error("Invalid owner-scoped canonical snapshot.");
    return row.payload;
  });
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
    const survivor = changes[0];
    pairs.push({ date: candidate.date, survivorId: survivor.canonicalId, retiredId: telemetryCanonicalId,
      structuredCounterpartCount: 1, telemetryCounterpartCount: 1,
      exerciseIds: survivor.payload.exercises.map((exercise) => exercise.canonicalExerciseId),
      setCount: survivor.payload.exercises.reduce((sum, exercise) => sum + (exercise.sets ?? []).length, 0),
      telemetry: survivor.payload.metadata,
      beforeWorkoutActiveCalories, afterWorkoutActiveCalories: workoutCalories(next),
      frozenAttributionPreserved: true, structuredHistoryIdentityPreserved: true,
      performanceRecordsMutation: "none", evidenceReviewMutation: "none",
      activityCaloriePolicy: "same canonical workout sum; replace retired session reference, never add calories" });
  }
  const activeCount = (items) => items.filter((record) => record.payload.evidence_type === "training" && record.quality?.status !== "superseded").length;
  const body = {
    schema: "historical-training-preview-v1", ownerUserId, pairs, excluded,
    totalTrainingRecordCount: objects.filter((record) => record.payload.evidence_type === "training").length,
    candidateCount: pairs.length, beforeActiveTrainingCount: activeCount(objects), afterActiveTrainingCount: activeCount(next),
    snapshot: records.map((row) => ({ recordId: row.recordId, version: row.version, digest: createPayloadHash(row.payload) }))
      .sort((a, b) => a.recordId.localeCompare(b.recordId)),
  };
  return { ...body, digest: createPayloadHash(body) };
}

export function createPostgresHistoricalTrainingReconciler({ pool, ownerUserId }) {
  if (!pool?.connect || !ownerUserId) throw new Error("An existing PostgreSQL pool and explicit owner are required.");
  const load = async (client, lock = false) => (await client.query(
    `SELECT record_id,version,payload FROM physiqueos.canonical_evidence_records
       WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
       AND COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type') IN ('training','activity_day')
       ORDER BY record_id${lock ? " FOR UPDATE" : ""}`, [ownerUserId])).rows
    .map((row) => ({ recordId: row.record_id, version: Number(row.version), payload: row.payload }));

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
      if (authorization !== HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION || body.ownerUserId !== ownerUserId ||
          !body.pairs?.length || digest !== createPayloadHash(body)) throw new Error("Explicit authorization of an intact preview is required.");
      const client = await pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${ownerUserId}`]);
        const records = await load(client, true);
        const completed = body.pairs.every((pair) => {
          const retired = records.find((row) => row.recordId === pair.retiredId)?.payload;
          return retired?.quality?.status === "superseded" && retired.quality.supersededBy === pair.survivorId &&
            retired.quality.historicalTrainingReconciliation?.previewDigest === digest;
        });
        if (completed) { await client.query("ROLLBACK"); return { outcome: "replayed", previewDigest: digest, pairs: body.pairs }; }
        const current = previewHistoricalTrainingReconciliation({ ownerUserId, records });
        if (current.digest !== digest) throw new Error("Historical Training preview is stale; obtain a new read-only preview.");
        let objects = records.map((row) => row.payload);
        for (const pair of body.pairs) {
          const changes = reconcileHistoricalWorkoutLoggerApplePair({ canonicalObjects: objects, userId: ownerUserId,
            structuredCanonicalId: pair.survivorId, telemetryCanonicalId: pair.retiredId });
          changes[1] = { ...changes[1], quality: { ...changes[1].quality,
            historicalTrainingReconciliation: { previewDigest: digest, survivorId: pair.survivorId } } };
          const byId = new Map(changes.map((record) => [record.canonicalId, record]));
          objects = objects.map((record) => byId.get(record.canonicalId) ?? record);
        }
        const changedIds = [];
        for (const row of records) {
          const next = objects.find((record) => record.canonicalId === row.recordId);
          if (createPayloadHash(next) === createPayloadHash(row.payload)) continue;
          const updated = await client.query(
            `UPDATE physiqueos.canonical_evidence_records SET payload=$4::jsonb,version=version+1,status=$5,updated_at=now()
               WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects' AND record_id=$2 AND version=$3 RETURNING record_id`,
            [ownerUserId, row.recordId, row.version, JSON.stringify(next), next.quality?.status ?? "active"]);
          if (updated.rows.length !== 1) throw new Error("Historical canonical record version changed.");
          changedIds.push(row.recordId);
        }
        const metadata = await client.query(
          `UPDATE physiqueos.canonical_runtime_metadata SET revision=revision+1,version=version+1,last_command_id=$2,updated_at=now()
             WHERE owner_user_id=$1 RETURNING revision`, [ownerUserId, `historical-training:${digest}`]);
        if (metadata.rows.length !== 1) throw new Error("Canonical owner revision is unavailable.");
        await client.query("COMMIT");
        return { outcome: "committed", previewDigest: digest, changedIds, pairs: body.pairs,
          beforeActiveTrainingCount: body.beforeActiveTrainingCount, afterActiveTrainingCount: body.afterActiveTrainingCount };
      } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
      finally { client.release(); }
    },
  });
}
