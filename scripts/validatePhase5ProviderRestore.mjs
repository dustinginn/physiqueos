import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { register } from "node:module";
import { createBackupManifest, verifyBackupManifest } from "../src/platform/backup/backupManifest.js";
import { readSpacesConfig } from "../src/platform/object-storage/spacesConfig.js";
import { createSpacesPrivateObjectProvider } from "../src/platform/object-storage/SpacesPrivateObjectProvider.js";
import { createValidationPostgresPool } from "./validationPostgresPool.mjs";

register("./sourceModuleResolutionHook.mjs", import.meta.url);
const { validateCanonicalImport } = await import("../src/platform/migration/phase4CanonicalImport.js");

if (process.env.PHYSIQUEOS_PHASE5_PROVIDER_ACCEPTANCE !== "1") throw new Error("Phase 5 provider restore acceptance is not explicitly enabled.");
const sourceUrl = requiredUrl("PHYSIQUEOS_SOURCE_DATABASE_URL", "physiqueos_phase5_test_provider_20260811");
const restoreUrl = requiredUrl("PHYSIQUEOS_RESTORE_DATABASE_URL", "physiqueos_phase5_restore_provider");
if (!String(process.env.PHYSIQUEOS_DATABASE_CA_CERT ?? "").includes("BEGIN CERTIFICATE")) throw new Error("Strict provider CA verification is required.");
const packageRoot = path.resolve(process.argv[2] ?? "");
const dumpPath = path.resolve(process.argv[3] ?? "");
if (!packageRoot || !dumpPath.endsWith(".dump")) throw new Error("A canonical package and bounded .dump artifact are required.");

const source = createValidationPostgresPool({ connectionString: sourceUrl, maximumPoolSize: 2, applicationName: "physiqueos-phase5-backup-source" });
const restore = createValidationPostgresPool({ connectionString: restoreUrl, maximumPoolSize: 2, applicationName: "physiqueos-phase5-backup-restore" });
const provider = createSpacesPrivateObjectProvider(readSpacesConfig(process.env));
try {
  const [sourceValidation, restoreValidation] = await Promise.all([
    validateCanonicalImport({ pool: source, packageRoot }),
    validateCanonicalImport({ pool: restore, packageRoot }),
  ]);
  assert(sourceValidation.valid && restoreValidation.valid, "Source or restore package validation failed.");
  assert(sourceValidation.importDigest === restoreValidation.importDigest, "Restored canonical digest differs from the provider source.");
  const [sourceSnapshot, restoreSnapshot] = await Promise.all([snapshot(source), snapshot(restore)]);
  assert(sourceSnapshot.digest === restoreSnapshot.digest, "Restored operational/schema snapshot differs from the provider source.");
  assert(sourceSnapshot.orphans === 0 && restoreSnapshot.orphans === 0, "Restored ownership or media relationships contain orphans.");
  assert(sourceSnapshot.migrations.join(",") === "000001_shared_platform_foundation,000002_phase2_platform_operations,000003_phase4_canonical_domains,000004_phase5_provider_readiness", "Restored schema migration metadata is incompatible.");

  const media = (await source.query(
    `SELECT id,storage_key,provider_version,byte_length::text,sha256
       FROM physiqueos.canonical_media_objects WHERE owner_user_id='phase5-synthetic-user' ORDER BY id`,
  )).rows;
  assert(media.length === 3 && media.every((item) => item.provider_version), "Provider media version inventory is incomplete.");
  const objectArtifacts = [];
  for (const item of media) {
    const actual = await provider.inspectObject({ objectKey: item.storage_key, providerVersion: item.provider_version });
    assert(actual.byteLength === Number(item.byte_length) && actual.sha256 === item.sha256, "Restored media metadata does not match provider bytes.");
    objectArtifacts.push({ objectId: item.id, byteLength: actual.byteLength, sha256: actual.sha256, providerVersion: actual.providerVersion });
  }
  const inventory = await provider.listInventory();
  const syntheticInventory = inventory.objects.filter((item) => item.key?.startsWith("private/phase5-synthetic-user/"));
  assert(!inventory.continuationToken && syntheticInventory.length === 3, "Phase 5 provider object inventory is incomplete or ambiguous.");

  const dump = await fs.readFile(dumpPath);
  const manifest = createBackupManifest({
    backupId: "phase5-provider-acceptance-20260811",
    buildId: process.env.PHYSIQUEOS_GIT_SHA ?? "phase5-working-tree",
    schemaVersion: sourceSnapshot.migrations.at(-1),
    createdAt: new Date().toISOString(),
    database: { filename: path.basename(dumpPath), byteLength: dump.length, sha256: createHash("sha256").update(dump).digest("hex") },
    objects: objectArtifacts,
  });
  verifyBackupManifest(manifest);
  process.stdout.write(`${JSON.stringify({ restored: "pass", databaseDigest: sourceValidation.importDigest, operationalDigest: sourceSnapshot.digest, objectCount: objectArtifacts.length, backupBytes: dump.length, backupSha256: manifest.database.sha256, manifestDigest: manifest.semanticDigest })}\n`);
} finally {
  provider.close();
  await Promise.all([source.end(), restore.end()]);
}

async function snapshot(pool) {
  const migrations = (await pool.query("SELECT name FROM physiqueos.physiqueos_schema_migrations ORDER BY name")).rows.map((row) => row.name);
  const counts = {};
  for (const table of ["users", "user_profiles", "devices", "sessions", "command_receipts", "outbox_messages", "canonical_media_objects", "canonical_relationships", "phase4_import_runs", "phase5_validation_runs"]) {
    counts[table] = Number((await pool.query(`SELECT count(*)::integer AS count FROM physiqueos.${table}`)).rows[0].count);
  }
  const media = (await pool.query("SELECT id,owner_user_id,evidence_collection,evidence_record_id,content_type,byte_length::text,sha256,storage_key,provider_version,provider_etag,state,version::text FROM physiqueos.canonical_media_objects ORDER BY id")).rows;
  const relationships = (await pool.query("SELECT owner_user_id,relationship_type,from_collection,from_record_id,to_collection,to_record_id FROM physiqueos.canonical_relationships ORDER BY 1,2,3,4,5,6")).rows;
  const orphanResult = await pool.query(`SELECT
    (SELECT count(*) FROM physiqueos.canonical_media_objects m LEFT JOIN physiqueos.users u ON u.id=m.owner_user_id WHERE u.id IS NULL) +
    (SELECT count(*) FROM physiqueos.canonical_relationships r LEFT JOIN physiqueos.users u ON u.id=r.owner_user_id WHERE u.id IS NULL) AS count`);
  const payload = { migrations, counts, media, relationships };
  return { digest: createHash("sha256").update(JSON.stringify(payload)).digest("hex"), migrations, orphans: Number(orphanResult.rows[0].count) };
}

function requiredUrl(key, expectedDatabase) {
  const value = String(process.env[key] ?? "").trim();
  const parsed = new URL(value);
  if (!parsed.hostname.endsWith(".ondigitalocean.com") || decodeURIComponent(parsed.pathname.slice(1)) !== expectedDatabase) throw new Error(`${key} does not identify the approved isolated provider database.`);
  return value;
}
function assert(condition, message) { if (!condition) throw new Error(message); }
