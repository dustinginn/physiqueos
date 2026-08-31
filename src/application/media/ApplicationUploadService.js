import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { getProductionApplicationComposition } from "../composition/productionApplicationComposition.js";
import { assertProductionLegacyCanonicalWriteAllowed } from "../../platform/cutover/canonicalWriteFence.js";
import { parsePrivateMediaReference } from "../../contracts/v1/mediaIdentifiers.js";
import { createAuthenticationPrincipal } from "../auth/principal.js";

export function assertApplicationUploadEntryAllowed({ operation, env = process.env } = {}) {
  if (env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1") return;
  assertProductionLegacyCanonicalWriteAllowed({ operation, env });
}

export async function storeApplicationUpload({
  ownerUserId,
  file = null,
  bytes = null,
  contentType = null,
  originalFilename = null,
  legacyDirectory,
  legacyPrefix,
  category,
  relationshipId,
  artifactId = null,
  env = process.env,
} = {}) {
  const buffer = bytes == null ? Buffer.from(await file.arrayBuffer()) : Buffer.from(bytes);
  const filename = originalFilename ?? file?.name ?? "upload.bin";
  const mimeType = contentType ?? file?.type ?? inferMimeType(filename);
  if (env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1") {
    const composition = await getProductionApplicationComposition(env);
    if (!composition?.uploads?.store) throw new Error("Provider canonical upload composition is unavailable.");
    return composition.uploads.store({
      ownerUserId,
      bytes: buffer,
      contentType: mimeType,
      originalFilename: filename,
      category,
      relationshipId,
      artifactId,
    });
  }

  const extension = path.extname(filename).toLowerCase() || extensionFor(mimeType);
  const safeName = `${sanitize(legacyPrefix)}-${Date.now()}${extension}`;
  const relativePath = path.join(legacyDirectory, safeName);
  const absolutePath = path.join(process.cwd(), relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return Object.freeze({
    reference: relativePath.replaceAll("\\", "/"),
    contentType: mimeType,
    byteLength: buffer.length,
  });
}

export function createApplicationStoredArtifactLoader({
  userId,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!String(userId ?? "").trim()) {
    throw storedArtifactError(
      "STORED_ARTIFACT_OWNER_REQUIRED",
      "Stored evidence requires an owner identity."
    );
  }
  return async function loadApplicationStoredArtifact({ artifact } = {}) {
    const reference = String(artifact?.storage_path ?? "");
    if (!reference) {
      throw storedArtifactError(
        "STORED_ARTIFACT_REFERENCE_MISSING",
        "Stored evidence has no retained media reference."
      );
    }
    if (env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1") {
      return loadProviderArtifact({ artifact, fetchImpl, reference, userId, env });
    }
    if (reference.startsWith("media://")) {
      throw storedArtifactError(
        "PROVIDER_MEDIA_BINDING_UNAVAILABLE",
        "Provider media cannot be read outside the provider composition."
      );
    }
    const privateRoot = path.resolve(process.cwd(), "private");
    const relativeReference = reference.replace(/^private[\\/]/i, "");
    const absolutePath = path.resolve(privateRoot, relativeReference);
    const relative = path.relative(privateRoot, absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw storedArtifactError(
        "STORED_ARTIFACT_PATH_INVALID",
        "Stored evidence is outside the application workspace."
      );
    }
    return Object.freeze({
      buffer: await fs.readFile(absolutePath),
      contentType: artifact?.mime_type ?? inferMimeType(reference),
    });
  };
}

async function loadProviderArtifact({ artifact, fetchImpl, reference, userId, env }) {
  if (typeof fetchImpl !== "function") {
    throw storedArtifactError(
      "PROVIDER_MEDIA_BINDING_UNAVAILABLE",
      "Provider media fetching is unavailable."
    );
  }
  const composition = await getProductionApplicationComposition(env);
  if (!composition?.media?.authorizeRead || !composition?.mediaGateway?.redeemRead) {
    throw storedArtifactError(
      "PROVIDER_MEDIA_BINDING_UNAVAILABLE",
      "Provider media composition is unavailable."
    );
  }
  const directObjectId = parsePrivateMediaReference(reference);
  if (!directObjectId && !composition?.mediaCatalog?.resolveLegacyReference) {
    throw storedArtifactError(
      "PROVIDER_MEDIA_BINDING_UNAVAILABLE",
      "Provider media catalog resolution is unavailable."
    );
  }
  const objectId = directObjectId ??
    await composition.mediaCatalog.resolveLegacyReference({ reference, ownerUserId: userId });
  if (!objectId) {
    throw storedArtifactError(
      "PROVIDER_MEDIA_REFERENCE_INVALID",
      "Stored evidence has an invalid provider media reference."
    );
  }
  const principal = createAuthenticationPrincipal({
    userId,
    deviceId: "evidence-reread",
    sessionId: "evidence-reread",
    scopes: ["media:read"],
    authenticationMethod: "source-owned-review",
    transport: "server-only",
  });
  const descriptor = await composition.media.authorizeRead({ principal, objectId });
  const access = await composition.mediaGateway.redeemRead({
    accessHandle: descriptor.accessHandle,
    principal,
  });
  const response = await fetchImpl(access.url, {
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) {
    throw storedArtifactError(
      "PROVIDER_MEDIA_READ_FAILED",
      "Stored provider evidence is unavailable."
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  if (buffer.length !== descriptor.size || sha256 !== descriptor.sha256) {
    throw storedArtifactError(
      "PROVIDER_MEDIA_INTEGRITY_FAILED",
      "Stored provider evidence failed integrity verification."
    );
  }
  if (artifact?.mime_type && descriptor.contentType !== artifact.mime_type) {
    throw storedArtifactError(
      "PROVIDER_MEDIA_CONTENT_TYPE_MISMATCH",
      "Stored provider evidence content type does not match."
    );
  }
  return Object.freeze({ buffer, contentType: descriptor.contentType });
}

function storedArtifactError(code, message) {
  return Object.assign(new Error(message), { code });
}

function sanitize(value) { return String(value ?? "upload").replace(/[^a-zA-Z0-9-_]/g, "-"); }
function extensionFor(mime) { return ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" })[mime] ?? ".bin"; }
function inferMimeType(filename) { return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf" })[path.extname(filename).toLowerCase()] ?? "application/octet-stream"; }
