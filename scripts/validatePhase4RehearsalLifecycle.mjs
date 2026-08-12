import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { register } from "node:module";
import pg from "pg";

register("./sourceModuleResolutionHook.mjs", import.meta.url);
const { importCanonicalPackage, validateCanonicalImport, resetCanonicalTarget } = await import("../src/platform/migration/phase4CanonicalImport.js");
const { readAndValidateCanonicalPackage } = await import("../src/platform/migration/phase4CanonicalExport.js");
const { createPostgresBackupTool } = await import("../src/platform/backup/PostgresBackupTool.js");

const databaseUrl = String(process.env.PHYSIQUEOS_PHASE4_DATABASE_URL ?? "").trim();
const packageRoot = path.resolve(process.argv[2] ?? "");
const snapshotRuntime = path.resolve(process.argv[3] ?? "");
const snapshotMedia = path.resolve(process.argv[4] ?? "");
const objectRoot = path.resolve(process.argv[5] ?? "");
if (!databaseUrl || !packageRoot || !snapshotRuntime) throw new Error("Database, package, snapshot runtime, snapshot media, and object roots are required.");
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
if (!/^physiqueos_phase4_rehearsal(?:_|$)/.test(databaseName)) throw new Error("Lifecycle rehearsal requires a guarded Phase 4 rehearsal database.");
const packageData = await readAndValidateCanonicalPackage(packageRoot);
const sourceBefore = await inspectFile(snapshotRuntime);
let pool = createPool();
const timings = {};
let first;
try {
  let started = performance.now();
  first = await importCanonicalPackage({ pool, packageRoot, resetTarget: true });
  timings.firstImportMs = Math.round(performance.now() - started);
  started = performance.now();
  await validateCanonicalImport({ pool, packageRoot });
  timings.firstValidationMs = Math.round(performance.now() - started);

  const backupPath = path.join(path.dirname(packageRoot), "phase4-rehearsal.dump");
  const backup = await createPostgresBackupTool().createBackup({ connectionString: databaseUrl, outputPath: backupPath });
  await pool.query("DELETE FROM physiqueos.canonical_goal_records");
  await pool.end();
  await createPostgresBackupTool().restoreBackup({ connectionString: databaseUrl, inputPath: backupPath });
  pool = createPool();
  const restored = await validateCanonicalImport({ pool, packageRoot });
  if (restored.importDigest !== first.importDigest) throw new Error("Restored database digest differs from migrated state.");

  await resetCanonicalTarget(pool);
  const resetState = await pool.query(`SELECT
    (SELECT count(*) FROM physiqueos.canonical_goal_records)::integer AS domain_records,
    (SELECT count(*) FROM physiqueos.command_receipts)::integer AS command_receipts,
    (SELECT count(*) FROM physiqueos.outbox_messages)::integer AS outbox,
    (SELECT count(*) FROM physiqueos.canonical_media_objects)::integer AS media`);
  if (Object.values(resetState.rows[0]).some((value) => value !== 0)) throw new Error("Rollback reset leaked rehearsal state.");
  const sourceAfterRollback = await inspectFile(snapshotRuntime);
  if (sourceAfterRollback.sha256 !== sourceBefore.sha256) throw new Error("Rollback altered the read-only source snapshot.");

  started = performance.now();
  const second = await importCanonicalPackage({ pool, packageRoot, resetTarget: false });
  timings.secondImportMs = Math.round(performance.now() - started);
  started = performance.now();
  await validateCanonicalImport({ pool, packageRoot });
  timings.secondValidationMs = Math.round(performance.now() - started);
  if (second.importDigest !== first.importDigest || second.packageDigest !== first.packageDigest) {
    throw new Error("Repeated migration produced deterministic drift.");
  }
  const media = await validateMediaInventory(packageData.manifest.files, snapshotMedia, objectRoot);
  const sourceAfter = await inspectFile(snapshotRuntime);
  if (sourceAfter.sha256 !== sourceBefore.sha256) throw new Error("Lifecycle rehearsal altered the snapshot source.");
  await fs.rm(backupPath, { force: true });
  process.stdout.write(`${JSON.stringify({ firstDigest: first.importDigest, secondDigest: second.importDigest, packageDigest: first.packageDigest, repeatability: "pass", rollback: "pass", backupRestore: "pass", backup: { byteLength: backup.byteLength, sha256: backup.sha256 }, resetState: resetState.rows[0], media, timings, sourceBefore, sourceAfter })}\n`);
} finally { await pool.end().catch(() => undefined); }

function createPool() { return new pg.Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true }); }
async function inspectFile(file) { const bytes = await fs.readFile(file); return { byteLength: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }; }
async function validateMediaInventory(files, sourceRoot, targetRoot) {
  let bytes = 0;
  for (const entry of files) {
    const source = await inspectFile(path.join(sourceRoot, ...entry.relativePath.split("/")));
    const pathHash = createHash("sha256").update(entry.relativePath).digest("hex");
    const objectId = `media-${entry.sha256.slice(0, 32)}-${pathHash.slice(0, 12)}`;
    const target = await inspectFile(path.join(targetRoot, "private", entry.ownerUserId, objectId));
    if (source.sha256 !== entry.sha256 || target.sha256 !== entry.sha256 || source.byteLength !== entry.size || target.byteLength !== entry.size) throw new Error(`Media restore inventory mismatch: ${entry.relativePath}`);
    bytes += entry.size;
  }
  return { objectCount: files.length, byteLength: bytes, sourceAndTargetHashes: "pass" };
}
