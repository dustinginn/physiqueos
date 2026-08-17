import { createHash } from "node:crypto";
import { createPayloadHash } from "../../contracts/v1/canonicalJson.js";
import { createPrivateMediaReference } from "../../contracts/v1/mediaIdentifiers.js";
import { createUploadIntent } from "../../platform/object-storage/privateObjectContracts.js";
import { createPostgresObjectStore } from "../../platform/database/PostgresObjectStore.js";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const GUARDED_COMPATIBILITY_DATABASE = /^physiqueos_phase5_(?:test|restore)_provider(?:_|$)/;

export function createProviderCanonicalUploadService({
  pool,
  objectProvider,
  authorityStore = null,
  migrationOperationId = null,
  compatibilityMode = false,
  requireCompatibilityAuthority = false,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  if (!pool?.connect || !pool?.query || !objectProvider?.beginMultipartUpload || typeof fetchImpl !== "function") {
    throw new Error("Provider uploads require PostgreSQL, private object storage, and fetch.");
  }
  if (!compatibilityMode && !authorityStore?.claimCanonicalWriteBoundary) {
    throw new Error("Canonical provider uploads require durable runtime authority.");
  }
  if (compatibilityMode && requireCompatibilityAuthority && !authorityStore?.assertCompatibilityAccess) {
    throw new Error("Compatibility provider uploads require durable compatibility authority.");
  }

  return Object.freeze({
    async store({ ownerUserId, bytes, contentType, originalFilename, category, relationshipId, artifactId = null }) {
      if (compatibilityMode && (requireCompatibilityAuthority || authorityStore?.assertCompatibilityAccess)) {
        await assertCompatibilitySession(pool, authorityStore);
      }
      const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
      validateUpload({ ownerUserId, buffer, contentType, originalFilename, category, relationshipId });
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      const intent = createUploadIntent({
        ownerUserId,
        contentType,
        expectedSize: buffer.length,
        expectedSha256: sha256,
        provenance: { source: "provider-product-upload", category, relationshipId },
      });
      const begun = await objectProvider.beginMultipartUpload({
        ownerUserId,
        objectId: intent.objectId,
        contentType,
        expectedSha256: sha256,
      });
      let completed = null;
      await createUploadRows({ pool, intent, begun, originalFilename, now });
      try {
        const signed = await objectProvider.authorizeUploadPart({
          objectKey: begun.objectKey,
          providerUploadId: begun.providerUploadId,
          partNumber: 1,
        });
        const response = await fetchImpl(signed.url, { method: "PUT", body: buffer, headers: { "content-type": contentType } });
        if (!response.ok || !response.headers.get("etag")) {
          const error = new Error(`Private object upload failed with HTTP ${response.status}.`);
          error.code = "CANONICAL_MEDIA_UPLOAD_FAILED";
          throw error;
        }
        completed = await objectProvider.completeMultipartUpload({
          objectKey: begun.objectKey,
          providerUploadId: begun.providerUploadId,
          parts: [{ partNumber: 1, etag: response.headers.get("etag") }],
        });
        const inspected = await objectProvider.inspectObject({
          objectKey: begun.objectKey,
          providerVersion: completed.providerVersion,
        });
        if (inspected.byteLength !== buffer.length || inspected.sha256 !== sha256 || inspected.contentType !== contentType) {
          const error = new Error("Private object readback did not match upload bytes, hash, or MIME type.");
          error.code = "CANONICAL_MEDIA_READBACK_MISMATCH";
          throw error;
        }
        const commandId = `media:${intent.uploadId}`;
        await commitVerifiedUpload({
          pool, authorityStore, migrationOperationId, compatibilityMode, intent, begun, completed,
          requireCompatibilityAuthority, commandId, sha256, contentType, originalFilename, category,
          relationshipId, artifactId, now,
        });
        return Object.freeze({
          objectId: intent.objectId,
          reference: createPrivateMediaReference(intent.objectId),
          contentType,
          byteLength: buffer.length,
          sha256,
          providerVersion: completed.providerVersion ?? null,
        });
      } catch (error) {
        if (completed) {
          await objectProvider.deleteObject({ objectKey: begun.objectKey, providerVersion: completed.providerVersion }).catch(() => undefined);
        } else {
          await objectProvider.abortMultipartUpload(begun).catch(() => undefined);
        }
        await markUploadFailed(pool, intent, now).catch(() => undefined);
        throw error;
      }
    },
  });
}

async function createUploadRows({ pool, intent, begun, originalFilename, now }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const objects = createPostgresObjectStore({ query: (text, values) => client.query(text, values) });
    await objects.createObjectAndIntent({
      object: {
        id: intent.objectId, userId: intent.ownerUserId, bucket: begun.bucket, objectKey: begun.objectKey,
        contentType: intent.contentType, byteLength: intent.expectedSize, sha256: intent.expectedSha256,
        provenance: { ...intent.provenance, originalFilename: safeFilename(originalFilename) },
      },
      intent: {
        id: intent.uploadId, expiresAt: new Date(now().getTime() + 15 * 60_000).toISOString(),
        providerUploadId: begun.providerUploadId,
      },
    });
    await objects.markUploading({ intentId: intent.uploadId, userId: intent.ownerUserId, providerUploadId: begun.providerUploadId });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function commitVerifiedUpload({
  pool, authorityStore, migrationOperationId, compatibilityMode, intent, begun, completed,
  requireCompatibilityAuthority, commandId, sha256, contentType, originalFilename, category,
  relationshipId, artifactId, now,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${intent.ownerUserId}`]);
    if (compatibilityMode) {
      const databaseName = await assertCompatibilityTarget(client);
      if (requireCompatibilityAuthority || authorityStore?.assertCompatibilityAccess) {
        await authorityStore.assertCompatibilityAccess({ client, databaseName });
      }
    }
    else await authorityStore.claimCanonicalWriteBoundary({ client, migrationOperationId, commandId });
    const objects = createPostgresObjectStore({ query: (text, values) => client.query(text, values) });
    const at = now().toISOString();
    await objects.claimCompletion({ intentId: intent.uploadId, userId: intent.ownerUserId, reclaimBefore: at, at });
    const receiptHash = createPayloadHash({
      uploadId: intent.uploadId, objectId: intent.objectId, sha256, byteLength: intent.expectedSize,
      providerVersion: completed.providerVersion ?? null, providerEtag: completed.etag ?? null,
    });
    await objects.completeVerified({
      intentId: intent.uploadId, userId: intent.ownerUserId, receiptHash,
      providerEtag: completed.etag, providerVersion: completed.providerVersion, verifiedAt: at,
    });
    await client.query(
      `INSERT INTO physiqueos.canonical_media_objects
        (id,owner_user_id,evidence_collection,evidence_record_id,original_filename,content_type,
         byte_length,sha256,storage_key,provider_version,provider_etag,provenance,state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,'verified')
       ON CONFLICT (id) DO UPDATE SET
         evidence_collection=EXCLUDED.evidence_collection,evidence_record_id=EXCLUDED.evidence_record_id,
         original_filename=EXCLUDED.original_filename,content_type=EXCLUDED.content_type,
         byte_length=EXCLUDED.byte_length,sha256=EXCLUDED.sha256,storage_key=EXCLUDED.storage_key,
         provider_version=EXCLUDED.provider_version,provider_etag=EXCLUDED.provider_etag,
         provenance=EXCLUDED.provenance,state='verified',version=physiqueos.canonical_media_objects.version+1,updated_at=now()`,
      [intent.objectId, intent.ownerUserId, category, String(relationshipId), safeFilename(originalFilename), contentType,
        intent.expectedSize, sha256, begun.objectKey, completed.providerVersion ?? null, completed.etag ?? null,
        JSON.stringify({ source: "provider-product-upload", uploadIntentId: intent.uploadId, artifactId })],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function markUploadFailed(pool, intent, now) {
  await pool.query(
    `UPDATE physiqueos.upload_intents SET state='failed',updated_at=$3
      WHERE id=$1 AND user_id=$2 AND state <> 'completed'`,
    [intent.uploadId, intent.ownerUserId, now().toISOString()],
  );
}

async function assertCompatibilityTarget(client) {
  const result = await client.query("SELECT current_database() AS database");
  const databaseName = String(result.rows[0]?.database ?? "");
  if (!GUARDED_COMPATIBILITY_DATABASE.test(databaseName)) {
    const error = new Error("Compatibility uploads are restricted to the isolated Phase 5 provider database.");
    error.code = "PROVIDER_COMPATIBILITY_TARGET_REJECTED";
    throw error;
  }
  return databaseName;
}

async function assertCompatibilitySession(pool, authorityStore) {
  const result = await pool.query("SELECT current_database() AS database");
  const databaseName = String(result.rows[0]?.database ?? "");
  if (!GUARDED_COMPATIBILITY_DATABASE.test(databaseName)) {
    const error = new Error("Compatibility uploads are restricted to the isolated Phase 5 provider database.");
    error.code = "PROVIDER_COMPATIBILITY_TARGET_REJECTED";
    throw error;
  }
  await authorityStore.assertCompatibilityAccess({ databaseName });
}

function validateUpload({ ownerUserId, buffer, contentType, originalFilename, category, relationshipId }) {
  if (!String(ownerUserId ?? "").trim() || !String(category ?? "").trim() || !String(relationshipId ?? "").trim()) {
    throw new Error("Provider upload owner, category, and relationship are required.");
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error("Provider upload size is outside the accepted range.");
  }
  if (!/^[-\w.+]+\/[-\w.+]+$/.test(String(contentType ?? ""))) throw new Error("Provider upload MIME type is invalid.");
  if (!String(originalFilename ?? "").trim()) throw new Error("Provider upload filename is required.");
}

function safeFilename(value) {
  return String(value ?? "upload").replaceAll("\\", "/").split("/").at(-1).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 160) || "upload";
}
