import { createPayloadHash } from "../../contracts/v1/canonicalJson.js";
import { mergeExplicitTrainingSupportPayload } from "../../domain/services/CanonicalEvidenceService.js";

export const LOGGER_SUPPORT_REPAIR_AUTHORIZATION =
  "EXECUTE_APPROVED_LOGGER_SUPPORT_REPAIR_PREVIEW";
const PREVIEW_SCHEMA = "logger-support-repair-preview-v1";

const list = (value) => Array.isArray(value) ? value : [];
const unique = (values) => [...new Set(values.filter(Boolean).map(String))];

function evidenceObjectCount(object = {}) {
  const exercises = list(object.exercises);
  return {
    exerciseCount: exercises.length,
    setCount: exercises.reduce((sum, exercise) => sum + list(exercise.sets).length, 0),
  };
}

function sealRecord(row, { collectionName, ownerUserId } = {}) {
  if (!row || row.ownerUserId !== ownerUserId || row.collectionName !== collectionName ||
      !row.recordId || !Number.isSafeInteger(row.version) || row.version < 1 || !row.payload) {
    throw new Error(`Invalid owner-scoped ${collectionName} repair source.`);
  }
  return {
    recordId: row.recordId,
    collectionName,
    ownerUserId,
    version: row.version,
    digest: createPayloadHash(row.payload),
  };
}

function exactOne(items, message) {
  if (items.length !== 1) throw new Error(message);
  return items[0];
}

function buildRepair({
  canonicalRecord,
  loggerPackageRecord,
  supportReviewRecord,
  ownerUserId,
  targetCanonicalId,
}) {
  const canonicalSeal = sealRecord(canonicalRecord, {
    collectionName: "canonicalEvidenceObjects", ownerUserId,
  });
  const loggerSeal = sealRecord(loggerPackageRecord, {
    collectionName: "evidencePackages", ownerUserId,
  });
  const reviewSeal = sealRecord(supportReviewRecord, {
    collectionName: "evidenceReviews", ownerUserId,
  });
  const canonical = canonicalRecord.payload;
  if (canonical.canonicalId !== targetCanonicalId ||
      canonical.quality?.status === "superseded" ||
      canonical.payload?.evidence_type !== "training") {
    throw new Error("The exact active Logger canonical target is unavailable.");
  }

  const loggerPackage = loggerPackageRecord.payload;
  const structured = exactOne(
    list(loggerPackage.evidence_objects).filter((object) =>
      object.evidence_type === "training" && list(object.exercises).length > 0),
    "The persisted Logger package must contain exactly one structured Training session."
  );
  const expectedTarget = `training|authoritative|training_logger_draft_${String(
    loggerPackage.review_metadata?.draftId ?? structured.id?.replace(/^training_logger_session_/, "") ?? ""
  )}`;
  if (expectedTarget !== targetCanonicalId ||
      !list(structured.provenance?.source_artifact_refs).includes(
        `training_logger_draft_${targetCanonicalId.split("training_logger_draft_").at(-1)}`
      )) {
    throw new Error("The Logger package identity does not match the exact canonical target.");
  }

  const review = supportReviewRecord.payload;
  const interpreted = review.interpretedEvidence;
  if (review.status !== "confirmed" ||
      interpreted?.review_metadata?.targetTrainingSessionCanonicalId !== targetCanonicalId) {
    throw new Error("The confirmed supporting review does not name the exact Logger target.");
  }
  const telemetry = exactOne(
    list(interpreted.evidence_objects).filter((object) =>
      object.evidence_type === "training" &&
      object.reconciliation?.target_canonical_id === targetCanonicalId &&
      object.reconciliation?.match_basis === "explicit_native_training_support_binding"),
    "The supporting review must contain exactly one explicitly bound strength observation."
  );
  const independentTraining = list(interpreted.evidence_objects).filter((object) =>
    object.evidence_type === "training" && object !== telemetry);
  const repairedPayload = mergeExplicitTrainingSupportPayload({
    structuredPayload: structured,
    telemetryPayload: telemetry,
  });
  const sourcePackageIds = unique([
    loggerPackage.package_id ?? loggerPackage.id,
    interpreted.package_id ?? interpreted.id,
  ]);
  const repairedCanonical = {
    ...canonical,
    evidence_type: "training",
    firstObservedAt: structured.observed_at,
    lastObservedAt: structured.observed_at,
    payload: repairedPayload,
    provenance: {
      evidence_package_ids: sourcePackageIds,
      evidence_review_ids: unique([review.id]),
      source_artifact_refs: unique([
        ...list(structured.provenance?.source_artifact_refs),
        ...list(telemetry.provenance?.source_artifact_refs),
      ]),
      contributing_evidence_object_ids: unique([structured.id, telemetry.id]),
    },
    quality: { status: "active" },
    updatedAt: review.updatedAt ?? canonical.updatedAt,
  };

  return {
    canonicalSeal,
    loggerSeal,
    reviewSeal,
    repairedCanonical,
    summary: {
      targetCanonicalId,
      currentObjectId: canonical.payload.id,
      restoredObjectId: structured.id,
      currentObservedAt: canonical.payload.observed_at,
      restoredObservedAt: structured.observed_at,
      currentStructure: evidenceObjectCount(canonical.payload),
      restoredStructure: evidenceObjectCount(structured),
      telemetry: {
        startTime: telemetry.metadata?.start_time ?? null,
        endTime: telemetry.metadata?.end_time ?? null,
        durationSeconds: telemetry.metadata?.duration_seconds ?? null,
        activeCalories: telemetry.metadata?.active_calories ?? null,
        totalCalories: telemetry.metadata?.total_calories ?? null,
        averageHeartRate: telemetry.metadata?.average_heart_rate ?? null,
      },
      independentTrainingObjectIds: independentTraining.map((object) => object.id),
      independentTrainingObjectsMutated: false,
      canonicalRelationshipMutation: "none",
    },
  };
}

export function previewLoggerSupportingEvidenceRepair(args = {}) {
  if (!args.ownerUserId || !args.targetCanonicalId) {
    throw new Error("Logger support repair requires an explicit owner and target canonical identity.");
  }
  const repair = buildRepair(args);
  const body = {
    schema: PREVIEW_SCHEMA,
    ownerUserId: args.ownerUserId,
    targetCanonicalId: args.targetCanonicalId,
    canonicalRecord: repair.canonicalSeal,
    loggerPackageRecord: repair.loggerSeal,
    supportReviewRecord: repair.reviewSeal,
    summary: repair.summary,
    proposedCanonicalDigest: createPayloadHash(repair.repairedCanonical),
    mutationScope: {
      canonicalRecordIds: [repair.canonicalSeal.recordId],
      evidencePackageRecordIds: [],
      evidenceReviewRecordIds: [],
      canonicalRelationshipIds: [],
    },
  };
  return { ...body, digest: createPayloadHash(body), proposedCanonical: repair.repairedCanonical };
}

export function createPostgresLoggerSupportingEvidenceRepairService({
  pool,
  ownerUserId,
  targetCanonicalId,
  loggerPackageRecordId,
  supportReviewRecordId,
} = {}) {
  if (!pool?.connect || !ownerUserId || !targetCanonicalId ||
      !loggerPackageRecordId || !supportReviewRecordId) {
    throw new Error("Logger support repair requires an existing pool and exact owner/source identities.");
  }

  async function load(client, { lock = false } = {}) {
    const rows = (await client.query(
      `SELECT record_id,collection_name,owner_user_id,version,payload,status,source_identity
         FROM physiqueos.canonical_evidence_records
        WHERE owner_user_id=$1 AND (
          (collection_name='canonicalEvidenceObjects' AND payload->>'canonicalId'=$2) OR
          (collection_name='evidencePackages' AND record_id=$3) OR
          (collection_name='evidenceReviews' AND record_id=$4)
        ) ORDER BY collection_name,record_id${lock ? " FOR UPDATE" : ""}`,
      [ownerUserId, targetCanonicalId, loggerPackageRecordId, supportReviewRecordId]
    )).rows.map((row) => ({
      recordId: row.record_id,
      collectionName: row.collection_name,
      ownerUserId: row.owner_user_id,
      version: Number(row.version),
      payload: row.payload,
      databaseStatus: row.status,
      sourceIdentity: row.source_identity,
    }));
    const byCollection = (collectionName) => exactOne(
      rows.filter((row) => row.collectionName === collectionName),
      `Expected exactly one ${collectionName} repair source.`
    );
    return {
      canonicalRecord: byCollection("canonicalEvidenceObjects"),
      loggerPackageRecord: byCollection("evidencePackages"),
      supportReviewRecord: byCollection("evidenceReviews"),
    };
  }

  const makePreview = (sources) => previewLoggerSupportingEvidenceRepair({
    ...sources, ownerUserId, targetCanonicalId,
  });

  return Object.freeze({
    async preview() {
      const client = await pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        const mode = await client.query("SHOW transaction_read_only");
        if (mode.rows[0]?.transaction_read_only !== "on") {
          throw new Error("Logger support repair preview must be PostgreSQL READ ONLY.");
        }
        const preview = makePreview(await load(client));
        await client.query("ROLLBACK");
        return preview;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async execute({ approvedPreview, authorization } = {}) {
      const { digest, proposedCanonical: _proposed, ...body } = approvedPreview ?? {};
      if (authorization !== LOGGER_SUPPORT_REPAIR_AUTHORIZATION ||
          body.schema !== PREVIEW_SCHEMA || body.ownerUserId !== ownerUserId ||
          body.targetCanonicalId !== targetCanonicalId || digest !== createPayloadHash(body)) {
        throw new Error("Explicit authorization of an intact Logger support repair preview is required.");
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${ownerUserId}`]);
        const sources = await load(client, { lock: true });
        const completed = sources.canonicalRecord.payload.quality?.loggerSupportingEvidenceRepair;
        if (completed?.previewDigest === digest) {
          await client.query("ROLLBACK");
          return { outcome: "replayed", previewDigest: digest, targetCanonicalId };
        }
        const current = makePreview(sources);
        if (current.digest !== digest) {
          throw new Error("Logger support repair preview is stale; obtain a new read-only preview.");
        }
        const nextVersion = sources.canonicalRecord.version + 1;
        const repaired = {
          ...current.proposedCanonical,
          version: nextVersion,
          quality: {
            ...current.proposedCanonical.quality,
            loggerSupportingEvidenceRepair: {
              previewDigest: digest,
              loggerPackageRecordId,
              supportReviewRecordId,
            },
          },
        };
        const updated = await client.query(
          `UPDATE physiqueos.canonical_evidence_records
              SET payload=$4::jsonb,version=version+1,status='active',provenance=$5::jsonb,updated_at=now()
            WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
              AND record_id=$2 AND version=$3 AND payload->>'canonicalId'=$6
            RETURNING record_id`,
          [ownerUserId, sources.canonicalRecord.recordId, sources.canonicalRecord.version,
            JSON.stringify(repaired), JSON.stringify(repaired.provenance ?? {}), targetCanonicalId]
        );
        if (updated.rows.length !== 1) throw new Error("Logger support canonical target version changed.");
        const metadata = await client.query(
          `UPDATE physiqueos.canonical_runtime_metadata
              SET revision=revision+1,version=version+1,last_command_id=$2,updated_at=now()
            WHERE owner_user_id=$1 RETURNING revision`,
          [ownerUserId, `logger-support-repair:${digest}`]
        );
        if (metadata.rows.length !== 1) throw new Error("Canonical owner revision is unavailable.");
        await client.query("COMMIT");
        return {
          outcome: "committed",
          previewDigest: digest,
          targetCanonicalId,
          changedRecordIds: [sources.canonicalRecord.recordId],
          independentTrainingObjectsMutated: false,
        };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  });
}
