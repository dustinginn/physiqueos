import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, createPayloadHash } from "../src/contracts/v1/canonicalJson.js";
import { buildCanonicalMediaReferenceIndex, canonicalMimeTypeFor } from "../src/platform/migration/canonicalReferenceProjection.js";
import { createPhase7BWorkPackage2ReferenceIndex } from "../src/platform/migration/phase7bWorkPackage2ReferenceIndex.js";

const [inputPath, stagingRoot, outputPath] = process.argv.slice(2);
if (!inputPath || !stagingRoot || !outputPath) fail("PHASE7B_WP2_REFERENCE_ARGUMENT_REQUIRED");

let stage = "read-input";
try {
  const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const root = path.resolve(stagingRoot);
  const files = Array.isArray(input.files) ? input.files : [];
  const runtimeEntries = files.filter((entry) => entry.logicalPath.startsWith("windows/canonical/"));
  const controlEntries = files.filter((entry) => entry.logicalPath.startsWith("windows/control/"));
  const mediaEntries = files.filter((entry) => entry.logicalPath.startsWith("windows/media/"));
  if (runtimeEntries.length !== 1 || controlEntries.length !== 1) throw new Error("PHASE7B_WP2_REFERENCE_SOURCE_CARDINALITY_FAIL");
  stage = "validate-staged-files";
  const runtimeBuffer = await readBoundFile(root, runtimeEntries[0]);
  const controlBuffer = await readBoundFile(root, controlEntries[0]);
  const runtime = JSON.parse(runtimeBuffer.toString("utf8"));
  const references = buildCanonicalMediaReferenceIndex(runtime);
  const mediaFiles = [];
  for (const entry of mediaEntries) {
    const bytes = await readBoundFile(root, entry);
    const target = boundPath(root, entry.logicalPath);
    const stat = await fs.stat(target);
    const relativePath = entry.logicalPath.slice("windows/media/".length);
    const keys = [relativePath.toLowerCase(), path.posix.basename(relativePath).toLowerCase()];
    mediaFiles.push({
      relativePath,
      size: bytes.length,
      sha256: sha256(bytes),
      lastWriteTimeUtc: stat.mtime.toISOString(),
      mimeType: canonicalMimeTypeFor(relativePath),
      relationshipIds: [...new Set(keys.flatMap((key) => references.get(key) ?? []))].sort(),
    });
  }
  const capturedMediaNames = new Set(mediaFiles.map((entry) => path.posix.basename(entry.relativePath).toLowerCase()));
  const inferredMissingMedia = [...references.keys()]
    .filter((key) => !key.includes("/") && /\.(?:jpe?g|png|webp|pdf|m4a|mp4)$/i.test(key) && !capturedMediaNames.has(key.toLowerCase()));
  stage = "build-schema-identity";
  const schemaIdentity = await buildSchemaIdentity(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../db/migrations"));
  stage = "build-reference-index";
  const index = createPhase7BWorkPackage2ReferenceIndex({
    runtime,
    runtimeSha256: sha256(runtimeBuffer),
    observedAt: input.observedAt,
    applicationCommit: input.applicationCommit,
    schemaIdentity,
    controlStateSha256: sha256(controlBuffer),
    mediaFiles,
    missingReferencedMedia: [...new Set([...(input.missingReferencedMedia ?? []), ...inferredMissingMedia])],
  });
  const encoded = Buffer.from(`${canonicalJson(index)}\n`, "utf8");
  stage = "persist-reference-index";
  await fs.writeFile(outputPath, encoded, { flag: "wx" });
  process.stdout.write(`${canonicalJson({ classification: "PHASE7B_WP2_REFERENCE_INDEX_PASS", pass: true, referenceIndexSha256: index.referenceIndexSha256, collectionCount: index.collectionCount, recordCount: index.recordCount, mediaCount: index.mediaCount, relationshipCount: index.relationshipCount, outputBytes: encoded.length })}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : "";
  const safeLine = error instanceof Error ? Number(error.stack?.match(/phase7bWorkPackage2ReferenceIndex\.js:(\d+):/)?.[1] ?? 0) : 0;
  const code = message.startsWith("PHASE7B_") ? message :
    message.startsWith("REFERENCE_INDEX_") ? `PHASE7B_WP2_${message}` :
    /^[A-Z0-9_:,.-]+$/.test(message) ? `PHASE7B_WP2_${message}` :
    error instanceof RangeError ? "PHASE7B_WP2_REFERENCE_RANGE_CONTRACT_FAIL" :
    error instanceof TypeError ? "PHASE7B_WP2_REFERENCE_TYPE_CONTRACT_FAIL" :
    safeLine > 0 ? `PHASE7B_WP2_REFERENCE_INTERNAL_LINE_${safeLine}_FAIL` : "PHASE7B_WP2_REFERENCE_INDEX_BUILD_FAIL";
  fail(code, stage);
}

async function readBoundFile(root, entry) {
  const target = boundPath(root, entry.logicalPath);
  const buffer = await fs.readFile(target);
  if (buffer.length !== entry.bytes || sha256(buffer) !== entry.sha256) throw new Error("PHASE7B_WP2_REFERENCE_STAGED_FILE_MISMATCH");
  return buffer;
}
function boundPath(root, logicalPath) {
  const target = path.resolve(root, logicalPath.replaceAll("/", path.sep));
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("PHASE7B_WP2_REFERENCE_PATH_ESCAPE");
  return target;
}
async function buildSchemaIdentity(root) {
  const names = (await fs.readdir(root)).filter((name) => /^\d+_[^.]+\.cjs$/.test(name)).sort();
  if (!names.length) throw new Error("PHASE7B_WP2_REFERENCE_SCHEMA_EMPTY");
  const entries = [];
  for (const name of names) entries.push({ name, sha256: sha256(await fs.readFile(path.join(root, name))) });
  return { version: names.at(-1).replace(/_.+$/, ""), migrationCount: names.length, sha256: createPayloadHash(entries) };
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function fail(code, safeStage = "validate-arguments") {
  process.stdout.write(`${JSON.stringify({ classification: "PHASE7B_WP2_REFERENCE_INDEX_FAIL", pass: false, safeStage, safeErrorCode: code })}\n`);
  process.exit(1);
}
