import { createHash, randomUUID } from "node:crypto";
import { canonicalJson } from "../../contracts/v1/canonicalJson.js";
import { createEvidenceIntakeInterpretationMessage } from "../../domain/services/EvidenceIntakeBackgroundWork.js";

const UPLOAD_LEASE_MS = 15 * 60_000;
const INTERPRETATION_LEASE_MS = 20 * 60_000;

export function createPostgresEvidenceIntakeStore({
  pool,
  ownerUserId,
  authorityStore,
  migrationOperationId = null,
  now = () => new Date(),
  createId = randomUUID,
} = {}) {
  if (!pool?.connect || !pool?.query || !ownerUserId || !authorityStore?.claimCanonicalWriteBoundary) {
    throw new Error("Provider Evidence intake storage requires PostgreSQL, an owner, and canonical authority.");
  }

  return Object.freeze({
    ownerUserId,
    async beginUpload(input) {
      return transaction(pool, async (client) => {
        const at = now();
        const id = `evidence_intake_${input.submissionIdentity}`;
        const claimToken = createId();
        await claimAuthority(client, authorityStore, migrationOperationId, `evidence-intake:begin:${id}`);
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:intake:${ownerUserId}:${input.submissionIdentity}`]);
        const manifestSha256 = digest(input.artifactManifest);
        const typedSha256 = input.typedEvidence ? digest(input.typedEvidence) : null;
        const inserted = await client.query(
          `INSERT INTO physiqueos.evidence_intake_receipts
            (id,submission_identity,owner_user_id,effective_date,expected_evidence_type,source,
             artifact_manifest,manifest_sha256,typed_evidence,typed_evidence_sha256,recovery_context,
             media_state,upload_claimed_by,upload_claim_expires_at,interpretation_state)
           VALUES ($1,$2,$3,$4::date,$5,$6,$7::jsonb,$8,$9,$10,$11::jsonb,
             'receiving',$12,$13,'waiting_for_media')
           ON CONFLICT (owner_user_id,submission_identity) DO NOTHING RETURNING *`,
          [id, input.submissionIdentity, ownerUserId, input.effectiveDate,
            input.expectedEvidenceType ?? "auto", input.source ?? "universal_intake",
            JSON.stringify(input.artifactManifest), manifestSha256, input.typedEvidence ?? null,
            typedSha256, JSON.stringify(input.recoveryContext ?? null), claimToken,
            new Date(at.getTime() + UPLOAD_LEASE_MS)],
        );
        let row = inserted.rows[0];
        let claimed = Boolean(row);
        if (!row) {
          row = (await client.query(
            `SELECT * FROM physiqueos.evidence_intake_receipts
              WHERE owner_user_id=$1 AND submission_identity=$2 FOR UPDATE`,
            [ownerUserId, input.submissionIdentity],
          )).rows[0];
          assertSameSubmission(row, { input, manifestSha256, typedSha256 });
          const leaseExpired = !row.upload_claim_expires_at || Date.parse(row.upload_claim_expires_at) <= at.getTime();
          if (row.media_state !== "stored" && (row.media_state === "failed" || leaseExpired)) {
            row = (await client.query(
              `UPDATE physiqueos.evidence_intake_receipts SET
                 media_state='receiving',upload_claimed_by=$3,upload_claim_expires_at=$4,
                 last_error_code=NULL,version=version+1,updated_at=$5
               WHERE id=$1 AND owner_user_id=$2 RETURNING *`,
              [row.id, ownerUserId, claimToken, new Date(at.getTime() + UPLOAD_LEASE_MS), at],
            )).rows[0];
            claimed = true;
          }
        }
        const reconciled = await reconcileCatalogArtifacts(client, row);
        if (reconciled.changed) {
          row = (await client.query(
            `UPDATE physiqueos.evidence_intake_receipts SET stored_artifacts=$3::jsonb,
               version=version+1,updated_at=$4 WHERE id=$1 AND owner_user_id=$2 RETURNING *`,
            [row.id, ownerUserId, JSON.stringify(reconciled.artifacts), at],
          )).rows[0];
        }
        return Object.freeze({ receipt: mapReceipt(row), claimed, claimToken: claimed ? claimToken : null });
      });
    },

    async recordStoredArtifact({ receiptId, claimToken, artifact }) {
      return transaction(pool, async (client) => {
        await claimAuthority(client, authorityStore, migrationOperationId, `evidence-intake:artifact:${receiptId}:${artifact.ordinal}`);
        const row = (await client.query(
          `SELECT * FROM physiqueos.evidence_intake_receipts
            WHERE id=$1 AND owner_user_id=$2 FOR UPDATE`, [receiptId, ownerUserId],
        )).rows[0];
        assertUploadClaim(row, claimToken, now());
        const artifacts = upsertArtifact(row.stored_artifacts, artifact);
        const updated = (await client.query(
          `UPDATE physiqueos.evidence_intake_receipts SET stored_artifacts=$3::jsonb,
             upload_claim_expires_at=$4,version=version+1,updated_at=$5
           WHERE id=$1 AND owner_user_id=$2 RETURNING *`,
          [receiptId, ownerUserId, JSON.stringify(artifacts),
            new Date(now().getTime() + UPLOAD_LEASE_MS), now()],
        )).rows[0];
        return mapReceipt(updated);
      });
    },

    async completeUpload({ receiptId, claimToken }) {
      return transaction(pool, async (client) => {
        const at = now();
        await claimAuthority(client, authorityStore, migrationOperationId, `evidence-intake:stored:${receiptId}`);
        const row = (await client.query(
          `SELECT * FROM physiqueos.evidence_intake_receipts
            WHERE id=$1 AND owner_user_id=$2 FOR UPDATE`, [receiptId, ownerUserId],
        )).rows[0];
        assertUploadClaim(row, claimToken, at);
        assertArtifactCompleteness(row);
        const updated = (await client.query(
          `UPDATE physiqueos.evidence_intake_receipts SET media_state='stored',
             interpretation_state=CASE WHEN interpretation_state='waiting_for_media' THEN 'pending' ELSE interpretation_state END,
             upload_claimed_by=NULL,upload_claim_expires_at=NULL,version=version+1,updated_at=$3
           WHERE id=$1 AND owner_user_id=$2 RETURNING *`, [receiptId, ownerUserId, at],
        )).rows[0];
        const message = createEvidenceIntakeInterpretationMessage(mapReceipt(updated), { createId });
        await client.query(
          `INSERT INTO physiqueos.outbox_messages
            (id,user_id,operation_id,topic,dedupe_key,payload_version,payload,due_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
           ON CONFLICT (topic,dedupe_key) DO NOTHING`,
          [message.id, message.userId, message.operationId, message.topic, message.dedupeKey,
            message.payloadVersion, JSON.stringify(message.payload), at],
        );
        return mapReceipt(updated);
      });
    },

    async failUpload({ receiptId, claimToken, errorCode }) {
      return pool.query(
        `UPDATE physiqueos.evidence_intake_receipts SET media_state='failed',last_error_code=$4,
           upload_claimed_by=NULL,upload_claim_expires_at=NULL,version=version+1,updated_at=$5
         WHERE id=$1 AND owner_user_id=$2 AND upload_claimed_by=$3`,
        [receiptId, ownerUserId, claimToken, safeErrorCode(errorCode), now()],
      );
    },

    async getReceipt(receiptId) {
      return mapReceipt((await pool.query(
        "SELECT * FROM physiqueos.evidence_intake_receipts WHERE id=$1 AND owner_user_id=$2",
        [receiptId, ownerUserId],
      )).rows[0]);
    },

    async claimInterpretation({ receiptId, workerId }) {
      return transaction(pool, async (client) => {
        const at = now();
        const row = (await client.query(
          `SELECT * FROM physiqueos.evidence_intake_receipts
            WHERE id=$1 AND owner_user_id=$2 FOR UPDATE`, [receiptId, ownerUserId],
        )).rows[0];
        if (!row) return null;
        if (row.interpretation_state === "completed") return Object.freeze({ outcome: "completed", receipt: mapReceipt(row) });
        if (row.media_state !== "stored") throw intakeError("EVIDENCE_INTAKE_MEDIA_INCOMPLETE");
        const active = row.interpretation_state === "processing" &&
          Date.parse(row.interpretation_claim_expires_at ?? "") > at.getTime() &&
          row.interpretation_claimed_by !== workerId;
        if (active) return Object.freeze({ outcome: "claimed_elsewhere", receipt: mapReceipt(row) });
        const updated = (await client.query(
          `UPDATE physiqueos.evidence_intake_receipts SET interpretation_state='processing',
             interpretation_claimed_by=$3,interpretation_claim_expires_at=$4,
             interpretation_started_at=COALESCE(interpretation_started_at,$5),last_error_code=NULL,
             version=version+1,updated_at=$5 WHERE id=$1 AND owner_user_id=$2 RETURNING *`,
          [receiptId, ownerUserId, workerId, new Date(at.getTime() + INTERPRETATION_LEASE_MS), at],
        )).rows[0];
        return Object.freeze({ outcome: "claimed", receipt: mapReceipt(updated) });
      });
    },

    async completeInterpretation({ receiptId, workerId, evidencePackage, review, assertLease = null }) {
      assertLease?.();
      return transaction(pool, async (client) => {
        const at = now();
        await claimAuthority(client, authorityStore, migrationOperationId, `evidence-intake:complete:${receiptId}`);
        const row = (await client.query(
          `SELECT * FROM physiqueos.evidence_intake_receipts
            WHERE id=$1 AND owner_user_id=$2 FOR UPDATE`, [receiptId, ownerUserId],
        )).rows[0];
        assertInterpretationClaim(row, workerId, at);
        await putCanonicalEvidenceRecord(client, { ownerUserId, collection: "evidencePackages", recordId: evidencePackage.package_id, payload: evidencePackage });
        await putCanonicalEvidenceRecord(client, { ownerUserId, collection: "evidenceReviews", recordId: review.id, payload: review });
        const updated = (await client.query(
          `UPDATE physiqueos.evidence_intake_receipts SET interpretation_state='completed',
             package_id=$3,review_id=$4,interpretation_claimed_by=NULL,
             interpretation_claim_expires_at=NULL,interpretation_completed_at=$5,
             version=version+1,updated_at=$5 WHERE id=$1 AND owner_user_id=$2 RETURNING *`,
          [receiptId, ownerUserId, evidencePackage.package_id, review.id, at],
        )).rows[0];
        await bumpRuntimeMetadata(client, ownerUserId, `evidence-intake:complete:${receiptId}`, at);
        return mapReceipt(updated);
      });
    },

    async failInterpretation({ receiptId, workerId, errorCode }) {
      return pool.query(
        `UPDATE physiqueos.evidence_intake_receipts SET interpretation_state='failed',
           last_error_code=$4,interpretation_claimed_by=NULL,interpretation_claim_expires_at=NULL,
           version=version+1,updated_at=$5
         WHERE id=$1 AND owner_user_id=$2 AND interpretation_claimed_by=$3`,
        [receiptId, ownerUserId, workerId, safeErrorCode(errorCode), now()],
      );
    },

    async loadPhotoSessionContext(effectiveDate) {
      const [goals, executionItems] = await Promise.all([
        pool.query("SELECT payload FROM physiqueos.canonical_goal_records WHERE owner_user_id=$1 AND collection_name='goals' ORDER BY source_ordinal", [ownerUserId]),
        pool.query("SELECT payload FROM physiqueos.canonical_execution_records WHERE owner_user_id=$1 AND collection_name='executionItems' ORDER BY source_ordinal", [ownerUserId]),
      ]);
      return Object.freeze({ effectiveDate, goals: goals.rows.map((row) => row.payload), executionItems: executionItems.rows.map((row) => row.payload) });
    },
  });
}

export function mapReceipt(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id, submissionIdentity: row.submission_identity, ownerUserId: row.owner_user_id,
    effectiveDate: dateOnly(row.effective_date), expectedEvidenceType: row.expected_evidence_type,
    source: row.source, artifactManifest: row.artifact_manifest, typedEvidence: row.typed_evidence,
    recoveryContext: row.recovery_context, mediaState: row.media_state,
    storedArtifacts: Object.freeze([...(row.stored_artifacts ?? [])].sort((a, b) => a.ordinal - b.ordinal)),
    interpretationState: row.interpretation_state, packageId: row.package_id, reviewId: row.review_id,
    lastErrorCode: row.last_error_code, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  });
}

async function reconcileCatalogArtifacts(client, row) {
  const result = await client.query(
    `SELECT id,original_filename,content_type,byte_length,sha256,provenance,created_at
       FROM physiqueos.canonical_media_objects
      WHERE owner_user_id=$1 AND evidence_collection='evidenceIntakes' AND evidence_record_id=$2 AND state='verified'
      ORDER BY created_at,id`, [row.owner_user_id, row.id],
  );
  let artifacts = [...(row.stored_artifacts ?? [])];
  for (const media of result.rows) {
    const artifactId = String(media.provenance?.artifactId ?? "");
    const ordinal = Number(media.provenance?.ordinal ?? artifactId.split("_").at(-1));
    if (!artifactId || !Number.isInteger(ordinal) || ordinal < 1) continue;
    artifacts = upsertArtifact(artifacts, {
      ordinal, id: artifactId, objectId: media.id, storagePath: `media://${media.id}`,
      fileName: media.original_filename, mimeType: media.content_type,
      byteLength: Number(media.byte_length), sha256: media.sha256, uploadedAt: iso(media.created_at),
    });
  }
  return { artifacts, changed: canonicalJson(artifacts) !== canonicalJson(row.stored_artifacts ?? []) };
}

function assertSameSubmission(row, { input, manifestSha256, typedSha256 }) {
  if (!row || dateOnly(row.effective_date) !== input.effectiveDate ||
      row.manifest_sha256 !== manifestSha256 || row.typed_evidence_sha256 !== typedSha256 ||
      row.expected_evidence_type !== (input.expectedEvidenceType ?? "auto")) {
    throw intakeError("EVIDENCE_INTAKE_IDENTITY_CONFLICT");
  }
}

function assertArtifactCompleteness(row) {
  const expected = row.artifact_manifest?.files ?? [];
  const actual = [...(row.stored_artifacts ?? [])].sort((a, b) => a.ordinal - b.ordinal);
  const matches = expected.length === actual.length && expected.every((file, index) => {
    const artifact = actual[index];
    return file.ordinal === artifact?.ordinal && file.name === artifact?.fileName &&
      Number(file.size) === Number(artifact?.byteLength) && file.type === artifact?.mimeType;
  });
  if (!matches) throw intakeError("EVIDENCE_UPLOAD_STORAGE_MISMATCH");
}

function assertUploadClaim(row, token, at) {
  if (!row || row.media_state !== "receiving" || row.upload_claimed_by !== token || Date.parse(row.upload_claim_expires_at ?? "") <= at.getTime()) {
    throw intakeError("EVIDENCE_INTAKE_UPLOAD_CLAIM_LOST");
  }
}

function assertInterpretationClaim(row, workerId, at) {
  if (!row || row.interpretation_state !== "processing" || row.interpretation_claimed_by !== workerId || Date.parse(row.interpretation_claim_expires_at ?? "") <= at.getTime()) {
    throw intakeError("EVIDENCE_INTAKE_INTERPRETATION_CLAIM_LOST");
  }
}

function upsertArtifact(values, artifact) {
  const next = [...(values ?? [])].filter((item) => item.ordinal !== artifact.ordinal);
  next.push(structuredClone(artifact));
  return next.sort((a, b) => a.ordinal - b.ordinal);
}

async function putCanonicalEvidenceRecord(client, { ownerUserId, collection, recordId, payload }) {
  const enriched = { ...structuredClone(payload), version: Number(payload.version ?? 1) };
  const existing = (await client.query(
    `SELECT payload FROM physiqueos.canonical_evidence_records
      WHERE owner_user_id=$1 AND collection_name=$2 AND record_id=$3 FOR UPDATE`,
    [ownerUserId, collection, recordId],
  )).rows[0]?.payload;
  if (existing) {
    if (existing.intakeReceiptId !== enriched.intakeReceiptId && existing.provenance?.intake_receipt_id !== enriched.provenance?.intake_receipt_id) {
      throw intakeError("EVIDENCE_INTAKE_CANONICAL_IDENTITY_CONFLICT");
    }
    return existing;
  }
  await client.query(
    `INSERT INTO physiqueos.canonical_evidence_records
      (owner_user_id,collection_name,record_id,source_ordinal,legacy_id,version,status,occurrence_date,observed_at,source_identity,provenance,payload)
     VALUES ($1,$2,$3,(SELECT COALESCE(MAX(source_ordinal)+1,0) FROM physiqueos.canonical_evidence_records WHERE owner_user_id=$1 AND collection_name=$2),
       $3,$4,$5,$6::date,$7::timestamptz,$8,$9::jsonb,$10::jsonb)`,
    [ownerUserId, collection, recordId, enriched.version, enriched.status ?? null,
      enriched.observed_date ?? null, enriched.captured_at ?? enriched.createdAt ?? null,
      enriched.provenance?.intake_receipt_id ?? enriched.intakeReceiptId ?? null,
      JSON.stringify(enriched.provenance ?? { source: "evidence-intake" }), JSON.stringify(enriched)],
  );
  return enriched;
}

async function claimAuthority(client, authorityStore, migrationOperationId, commandId) {
  await authorityStore.claimCanonicalWriteBoundary({ client, migrationOperationId, commandId });
}

async function bumpRuntimeMetadata(client, ownerUserId, commandId, at) {
  await client.query(
    `UPDATE physiqueos.canonical_runtime_metadata SET revision=revision+1,last_command_id=$2,
       version=version+1,updated_at=$3 WHERE owner_user_id=$1`, [ownerUserId, commandId, at],
  );
}

async function transaction(pool, callback) {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const result = await callback(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { client.release(); }
}

function digest(value) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
function safeErrorCode(value) { const code = String(value ?? "EVIDENCE_INTAKE_FAILED").toUpperCase(); return /^[A-Z0-9_]{3,80}$/.test(code) ? code : "EVIDENCE_INTAKE_FAILED"; }
function intakeError(code) { return Object.assign(new Error(code), { code }); }
function dateOnly(value) { if (!value) return null; return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10); }
function iso(value) { return value instanceof Date ? value.toISOString() : value == null ? null : String(value); }
