import fs from "node:fs/promises";
import path from "node:path";
import { getProductionApplicationComposition } from "../composition/productionApplicationComposition.js";
import { assertProductionLegacyCanonicalWriteAllowed } from "../../platform/cutover/canonicalWriteFence.js";

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

function sanitize(value) { return String(value ?? "upload").replace(/[^a-zA-Z0-9-_]/g, "-"); }
function extensionFor(mime) { return ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" })[mime] ?? ".bin"; }
function inferMimeType(filename) { return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf" })[path.extname(filename).toLowerCase()] ?? "application/octet-stream"; }
