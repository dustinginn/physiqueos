import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";
import { requirePrivateMediaObjectId } from "../../contracts/v1/mediaIdentifiers.js";

const MAX_READ_SECONDS = 300;
const MAX_UPLOAD_PART_SECONDS = 900;
const DEFAULT_HEALTH_TIMEOUT_MS = 3_000;

export function createSpacesPrivateObjectProvider(config, { client, healthClient, sign = getSignedUrl } = {}) {
  if (!config?.enabled) throw new Error("Private object storage is inactive.");
  const clientConfig = {
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: false,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  };
  const s3 = client ?? new S3Client(clientConfig);
  const healthS3 = healthClient ?? (client ? client : new S3Client({ ...clientConfig, maxAttempts: 1 }));

  return Object.freeze({
    async beginMultipartUpload({ ownerUserId, objectId, contentType, expectedSha256 }) {
      const objectKey = createPrivateObjectKey(ownerUserId, objectId);
      const result = await s3.send(new CreateMultipartUploadCommand({
        Bucket: config.bucket,
        Key: objectKey,
        ContentType: contentType,
        Metadata: expectedSha256 ? { "physiqueos-sha256": expectedSha256 } : undefined,
      }));
      if (!result.UploadId) throw new Error("The object provider did not create a multipart upload.");
      return Object.freeze({ bucket: config.bucket, objectKey, providerUploadId: result.UploadId });
    },
    async authorizeUploadPart({ objectKey, providerUploadId, partNumber, expiresInSeconds = MAX_UPLOAD_PART_SECONDS }) {
      if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) throw new Error("Multipart part number is invalid.");
      const expiresIn = clampSeconds(expiresInSeconds, MAX_UPLOAD_PART_SECONDS);
      const url = await sign(s3, new UploadPartCommand({ Bucket: config.bucket, Key: objectKey, UploadId: providerUploadId, PartNumber: partNumber }), { expiresIn });
      return Object.freeze({ url, partNumber, expiresInSeconds: expiresIn });
    },
    async completeMultipartUpload({ objectKey, providerUploadId, parts }) {
      const normalizedParts = normalizeParts(parts);
      const result = await s3.send(new CompleteMultipartUploadCommand({
        Bucket: config.bucket, Key: objectKey, UploadId: providerUploadId,
        MultipartUpload: { Parts: normalizedParts.map((part) => ({ ETag: part.etag, PartNumber: part.partNumber })) },
      }));
      return Object.freeze({ etag: stripQuotes(result.ETag), providerVersion: result.VersionId ?? null });
    },
    async abortMultipartUpload({ objectKey, providerUploadId }) {
      await s3.send(new AbortMultipartUploadCommand({ Bucket: config.bucket, Key: objectKey, UploadId: providerUploadId }));
    },
    async deleteObject({ objectKey, providerVersion = null }) {
      await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey, VersionId: providerVersion ?? undefined }));
    },
    async inspectObject({ objectKey, providerVersion = null }) {
      const result = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey, VersionId: providerVersion ?? undefined, ChecksumMode: "ENABLED" }));
      const content = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: objectKey, VersionId: result.VersionId ?? providerVersion ?? undefined }));
      return Object.freeze({
        byteLength: Number(result.ContentLength), contentType: result.ContentType ?? null,
        sha256: await hashBody(content.Body),
        etag: stripQuotes(result.ETag), providerVersion: result.VersionId ?? providerVersion,
      });
    },
    async authorizeRead({ objectKey, providerVersion = null, expiresInSeconds = MAX_READ_SECONDS }) {
      const expiresIn = clampSeconds(expiresInSeconds, MAX_READ_SECONDS);
      const url = await sign(s3, new GetObjectCommand({ Bucket: config.bucket, Key: objectKey, VersionId: providerVersion ?? undefined }), { expiresIn });
      return Object.freeze({ url, expiresInSeconds: expiresIn });
    },
    async healthCheck({ signal = null, timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS } = {}) {
      const timeout = boundedHealthTimeout(timeoutMs);
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), timeout);
      const abortSignal = signal ? AbortSignal.any([signal, timeoutController.signal]) : timeoutController.signal;
      try {
        await healthS3.send(new HeadBucketCommand({ Bucket: config.bucket }), { abortSignal });
        return Object.freeze({ reachable: true });
      } catch (error) {
        if (timeoutController.signal.aborted) {
          throw providerHealthError("OBJECT_STORAGE_HEALTH_TIMEOUT", "Private object storage health did not complete within its deadline.", error);
        }
        if (signal?.aborted) {
          throw providerHealthError("OBJECT_STORAGE_HEALTH_ABORTED", "Private object storage health was cancelled.", error);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    async listInventory({ continuationToken = null, maximum = 1000 } = {}) {
      const result = await s3.send(new ListObjectsV2Command({ Bucket: config.bucket, ContinuationToken: continuationToken ?? undefined, MaxKeys: Math.min(1000, maximum) }));
      return Object.freeze({
        objects: Object.freeze((result.Contents ?? []).map((item) => Object.freeze({ key: item.Key, byteLength: Number(item.Size ?? 0), etag: stripQuotes(item.ETag), lastModified: item.LastModified?.toISOString() ?? null }))),
        continuationToken: result.IsTruncated ? result.NextContinuationToken ?? null : null,
      });
    },
    close() {
      s3.destroy?.();
      if (healthS3 !== s3) healthS3.destroy?.();
    },
  });
}

async function hashBody(body) {
  if (!body) throw new Error("The object provider returned no object body for verification.");
  const hash = createHash("sha256");
  if (typeof body[Symbol.asyncIterator] === "function") {
    for await (const chunk of body) hash.update(chunk);
  } else if (typeof body.transformToByteArray === "function") {
    hash.update(await body.transformToByteArray());
  } else {
    throw new Error("The object provider returned an unsupported object body.");
  }
  return hash.digest("hex");
}

export function createPrivateObjectKey(ownerUserId, objectId) {
  if (!/^[A-Za-z0-9._:-]+$/.test(ownerUserId)) throw new Error("Private object identity is invalid.");
  let acceptedObjectId;
  try {
    acceptedObjectId = requirePrivateMediaObjectId(objectId);
  } catch {
    throw new Error("Private object identity is invalid.");
  }
  return `private/${ownerUserId}/${acceptedObjectId}/original`;
}

function normalizeParts(parts) {
  if (!Array.isArray(parts) || parts.length === 0) throw new Error("At least one uploaded part is required.");
  const normalized = parts.map((part) => ({ partNumber: Number(part.partNumber), etag: String(part.etag ?? "") })).sort((a, b) => a.partNumber - b.partNumber);
  if (normalized.some((part, index) => !Number.isInteger(part.partNumber) || part.partNumber !== index + 1 || !part.etag)) throw new Error("Multipart receipt is malformed or incomplete.");
  return normalized;
}
function stripQuotes(value) { return value == null ? null : String(value).replace(/^"|"$/g, ""); }
function clampSeconds(value, maximum) {
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < 1) throw new Error("Signed access lifetime is invalid.");
  return Math.min(seconds, maximum);
}
function boundedHealthTimeout(value) {
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 10_000) throw new Error("Object storage health timeout is invalid.");
  return timeout;
}
function providerHealthError(code, message, cause) {
  return Object.assign(new Error(message, { cause }), { code });
}
