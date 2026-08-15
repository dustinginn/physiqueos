import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { requirePrivateMediaObjectId } from "../../contracts/v1/mediaIdentifiers.js";
import { readAndValidateCanonicalPackage } from "./phase4CanonicalExport.js";

export async function migratePackageMediaLocally({ packageRoot, snapshotMediaRoot, objectRoot }) {
  const packageData = await readAndValidateCanonicalPackage(packageRoot);
  const sourceRoot = path.resolve(snapshotMediaRoot);
  const destinationRoot = path.resolve(objectRoot);
  if (destinationRoot === sourceRoot || destinationRoot.startsWith(`${sourceRoot}${path.sep}`)) {
    throw new Error("Object rehearsal target must be physically separate from source media.");
  }
  await fs.mkdir(destinationRoot, { recursive: true });
  const results = [];
  for (const entry of packageData.manifest.files) {
    const source = confinedPath(sourceRoot, entry.relativePath);
    const objectId = createPhase4MediaObjectId(entry);
    const storageKey = path.posix.join("private", entry.ownerUserId, objectId);
    const destination = confinedPath(destinationRoot, storageKey);
    const sourceBefore = await hashFile(source);
    assertExpected(entry, sourceBefore, "source");
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
    const [sourceAfter, target] = await Promise.all([hashFile(source), hashFile(destination)]);
    assertExpected(entry, sourceAfter, "source after copy");
    assertExpected(entry, target, "target");
    results.push(Object.freeze({
      objectId,
      ownerUserId: entry.ownerUserId,
      storageKey,
      contentType: entry.mimeType,
      size: entry.size,
      sha256: entry.sha256,
      originalFilename: path.posix.basename(entry.relativePath),
      relationshipIds: entry.relationshipIds,
      immutableOriginal: true,
    }));
  }
  return Object.freeze({
    objectRoot: destinationRoot,
    objectCount: results.length,
    byteLength: results.reduce((sum, item) => sum + item.size, 0),
    objects: Object.freeze(results.sort((left, right) => left.objectId.localeCompare(right.objectId))),
  });
}

export function createPhase4MediaCatalog({ query }) {
  return Object.freeze({
    async getObject({ objectId, ownerUserId }) {
      const result = await query(
        `SELECT id,owner_user_id,content_type,byte_length,sha256,storage_key,state
         FROM physiqueos.canonical_media_objects
         WHERE id=$1 AND owner_user_id=$2 AND state='verified'`,
        [objectId, ownerUserId]
      );
      const row = result.rows[0];
      return row ? Object.freeze({
        id: row.id,
        ownerUserId: row.owner_user_id,
        contentType: row.content_type,
        size: Number(row.byte_length),
        sha256: row.sha256,
        internalRelativePath: row.storage_key,
      }) : null;
    },
  });
}

export function createPhase4MediaObjectId(entry) {
  const pathHash = createHash("sha256").update(entry.relativePath).digest("hex");
  return requirePrivateMediaObjectId(`media-${entry.sha256.slice(0, 32)}-${pathHash.slice(0, 12)}`);
}

function confinedPath(root, relative) {
  const target = path.resolve(root, ...String(relative).split("/"));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Media path escapes its configured private root.");
  }
  return target;
}

async function hashFile(file) {
  const bytes = await fs.readFile(file);
  return { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function assertExpected(entry, actual, label) {
  if (actual.size !== entry.size || actual.sha256 !== entry.sha256) {
    throw new Error(`Media ${label} integrity mismatch for ${entry.relativePath}.`);
  }
}
