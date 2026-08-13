import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createPayloadHash } from "../src/contracts/v1/canonicalJson.js";
import { MIGRATION_MANIFEST_VERSION } from "../src/platform/migration/migrationManifest.js";

export function validateManifestFile(filePath) {
  const resolved = path.resolve(filePath);
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (parsed.manifestVersion !== MIGRATION_MANIFEST_VERSION || !parsed.migrationId || !parsed.semanticDigest) throw new Error("Migration manifest header is invalid.");
  const { semanticDigest, ...unsigned } = parsed;
  if (createPayloadHash(unsigned) !== semanticDigest) throw new Error("Migration manifest semantic digest does not match.");
  return Object.freeze({ valid: true, migrationId: parsed.migrationId, collectionCount: parsed.collections?.length ?? 0, fileCount: parsed.files?.length ?? 0 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("Usage: node scripts/validateMigrationManifest.mjs <synthetic-or-rehearsal-manifest.json>");
  process.stdout.write(`${JSON.stringify(validateManifestFile(filePath))}\n`);
}
