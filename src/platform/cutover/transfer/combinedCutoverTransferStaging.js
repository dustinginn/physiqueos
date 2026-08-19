// Non-authoritative staging substrate for received combined-cutover transfer bytes.
//
// WHY NOT THE CONTAINER FILESYSTEM. docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md states
// that App Platform's ephemeral filesystem cannot provide durable shared semantics and that no
// runtime falls back to ephemeral container disk. A resumable transfer whose staged bytes vanish on
// restart would defeat the resume contract, so staged chunks live in the private, versioned Space.
//
// WHY A DEDICATED NAMESPACE. Canonical Founder media lives under `private/<ownerUserId>/<objectId>/`
// (`createPrivateObjectKey`). Staged transfer bytes live under `cutover-transfer/<operationId>/
// <packageId>/chunks/<ordinal>` and never under `private/`. The Windows client therefore never gains
// any capability to write canonical media: it never receives a bucket key, never receives a signed
// URL, and never names a destination. Keys are constructed server-side from validated opaque
// identifiers and re-checked against a whole-string pattern before any object operation.
//
// STAGED BYTES ARE NOT AN IMPORT. Objects here are noncanonical evidence of receipt only. Import
// into PostgreSQL and canonical Spaces media remains a separate, later cutover phase.

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import {
  TransferErrorCode,
  assertTransferStagingKey,
  transferError,
} from "./combinedCutoverTransferContract.js";

export function createSpacesCombinedCutoverTransferStaging({ client, bucket } = {}) {
  if (!client?.send) throw new Error("Cutover transfer staging requires a private object client.");
  if (!String(bucket ?? "").trim()) throw new Error("Cutover transfer staging requires a bucket.");
  return Object.freeze({
    kind: "spaces-cutover-transfer-staging",
    async put({ key, bytes }) {
      const objectKey = assertTransferStagingKey(key);
      const body = Buffer.from(bytes);
      await send(() => client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: body,
        ContentType: "application/octet-stream",
        ContentLength: body.length,
      })));
      return Object.freeze({ key: objectKey, byteLength: body.length });
    },
    async read({ key }) {
      const objectKey = assertTransferStagingKey(key);
      const result = await send(() => client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey })));
      return collectBody(result?.Body);
    },
    async remove({ key }) {
      const objectKey = assertTransferStagingKey(key);
      await send(() => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey })));
    },
  });
}

/** Test-only substrate with the same port. Never used by any provider runtime composition. */
export function createInMemoryCombinedCutoverTransferStaging({ failNextPut = 0 } = {}) {
  const objects = new Map();
  let remainingPutFailures = failNextPut;
  return Object.freeze({
    kind: "in-memory-cutover-transfer-staging",
    async put({ key, bytes }) {
      const objectKey = assertTransferStagingKey(key);
      if (remainingPutFailures > 0) {
        remainingPutFailures -= 1;
        throw transferError(TransferErrorCode.STAGING_UNAVAILABLE, "Staging substrate is temporarily unavailable.");
      }
      const body = Buffer.from(bytes);
      objects.set(objectKey, body);
      return Object.freeze({ key: objectKey, byteLength: body.length });
    },
    async read({ key }) {
      const objectKey = assertTransferStagingKey(key);
      const body = objects.get(objectKey);
      if (!body) throw transferError(TransferErrorCode.STAGING_UNAVAILABLE, "Staged chunk is unavailable.");
      return Buffer.from(body);
    },
    async remove({ key }) {
      objects.delete(assertTransferStagingKey(key));
    },
    inspectKeys: () => [...objects.keys()].sort(),
    inspectBytes: (key) => (objects.has(key) ? Buffer.from(objects.get(key)) : null),
    failNextPuts: (count) => { remainingPutFailures = count; },
  });
}

export function sha256Of(bytes) {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

async function send(operation) {
  try {
    return await operation();
  } catch (error) {
    // Substrate faults are idempotent transport faults: the same chunk may safely be re-sent. Never
    // surface the provider's message, which can carry keys or credentials.
    throw transferError(TransferErrorCode.STAGING_UNAVAILABLE, "The transfer staging substrate is unavailable.", { retryable: true, cause: error });
  }
}

async function collectBody(body) {
  if (!body) throw transferError(TransferErrorCode.STAGING_UNAVAILABLE, "Staged chunk body is unavailable.");
  if (typeof body.transformToByteArray === "function") return Buffer.from(await body.transformToByteArray());
  if (typeof body[Symbol.asyncIterator] === "function") {
    const chunks = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  throw transferError(TransferErrorCode.STAGING_UNAVAILABLE, "Staged chunk body could not be read.");
}
