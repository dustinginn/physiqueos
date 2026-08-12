import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createBackupManifest, verifyBackupManifest } from "../src/platform/backup/backupManifest.js";
import { createPostgresPool } from "../src/platform/database/pool.js";
import { readSpacesConfig } from "../src/platform/object-storage/spacesConfig.js";
import { createSpacesPrivateObjectProvider } from "../src/platform/object-storage/SpacesPrivateObjectProvider.js";

if (process.env.PHYSIQUEOS_PHASE2_PROVIDER_ACCEPTANCE !== "1") throw new Error("Provider restore acceptance requires PHYSIQUEOS_PHASE2_PROVIDER_ACCEPTANCE=1.");
const sourceUrl = requiredUrl("PHYSIQUEOS_SOURCE_DATABASE_URL", "physiqueos_phase2_test_provider_20260811");
const restoreUrl = requiredUrl("PHYSIQUEOS_RESTORE_DATABASE_URL", "physiqueos_restore_provider_20260811");
const caCertificate = String(process.env.PHYSIQUEOS_DATABASE_CA_CERT ?? "");
if (!caCertificate.includes("BEGIN CERTIFICATE")) throw new Error("Provider restore acceptance requires the managed database CA.");
const dumpPath = path.resolve(process.argv[2] ?? "");
if (!dumpPath.endsWith(".dump")) throw new Error("A bounded .dump artifact path is required.");

const source = poolFor(sourceUrl);
const restore = poolFor(restoreUrl);
const spacesConfig = readSpacesConfig();
const provider = createSpacesPrivateObjectProvider(spacesConfig);
try {
  const sourceSnapshot = await snapshot(source);
  const restoreSnapshot = await snapshot(restore);
  if (sourceSnapshot.digest !== restoreSnapshot.digest) throw new Error("Restored database semantic digest does not match the source.");
  if (sourceSnapshot.migrations.join(",") !== "000001_shared_platform_foundation,000002_phase2_platform_operations") throw new Error("Restored migration metadata is incompatible.");
  if (sourceSnapshot.orphans !== 0 || restoreSnapshot.orphans !== 0) throw new Error("Restored ownership/session/object relationships contain orphans.");

  const objectRows = (await source.query("SELECT id, object_key, provider_version, byte_length, sha256 FROM physiqueos.stored_objects WHERE state IN ('verified', 'tombstoned') ORDER BY id")).rows;
  const inventory = await provider.listInventory();
  if (inventory.continuationToken || inventory.objects.length !== objectRows.length) throw new Error("Provider object inventory does not match the intentional fixture set.");
  const objectArtifacts = [];
  for (const row of objectRows) {
    const actual = await provider.inspectObject({ objectKey: row.object_key, providerVersion: row.provider_version });
    if (actual.byteLength !== Number(row.byte_length) || actual.sha256 !== row.sha256) throw new Error("Provider object hash or length differs from canonical metadata.");
    objectArtifacts.push({ objectId: row.id, byteLength: actual.byteLength, sha256: actual.sha256, providerVersion: actual.providerVersion });
  }
  const dump = await fs.readFile(dumpPath);
  const manifest = createBackupManifest({
    backupId: "phase2-provider-acceptance-20260811",
    buildId: "phase2-provider-staging-5517689",
    schemaVersion: sourceSnapshot.migrations.at(-1),
    createdAt: new Date().toISOString(),
    database: { filename: path.basename(dumpPath), byteLength: dump.length, sha256: createHash("sha256").update(dump).digest("hex") },
    objects: objectArtifacts,
  });
  verifyBackupManifest(manifest);
  process.stdout.write(`[phase2-provider-restore] PASS databaseDigest=${sourceSnapshot.digest} objectCount=${objectArtifacts.length} manifestDigest=${manifest.semanticDigest}\n`);
} finally {
  provider.close();
  await Promise.all([source.end(), restore.end()]);
}

async function snapshot(pool) {
  const tables = ["users", "user_profiles", "devices", "sessions", "access_credentials", "refresh_credentials", "recovery_credentials", "command_receipts", "outbox_messages", "stored_objects", "upload_intents", "worker_heartbeats", "feature_flags", "auth_challenges", "passkey_credentials"];
  const counts = {};
  for (const table of tables) counts[table] = (await pool.query(`SELECT count(*)::integer AS count FROM physiqueos.${table}`)).rows[0].count;
  const migrations = (await pool.query("SELECT name FROM physiqueos.physiqueos_schema_migrations ORDER BY name")).rows.map((row) => row.name);
  const identities = (await pool.query("SELECT id, user_id, status, device_id, refresh_family_id FROM physiqueos.sessions ORDER BY id")).rows;
  const receipts = (await pool.query("SELECT id, user_id, command_id, idempotency_key, payload_hash, status FROM physiqueos.command_receipts ORDER BY id")).rows;
  const outbox = (await pool.query("SELECT id, topic, dedupe_key, status, attempt_count, last_error_code FROM physiqueos.outbox_messages ORDER BY id")).rows;
  const objects = (await pool.query("SELECT id, user_id, state, object_key, provider_version, content_type, byte_length::text, sha256 FROM physiqueos.stored_objects ORDER BY id")).rows;
  const flags = (await pool.query("SELECT key, enabled, version::text, configuration FROM physiqueos.feature_flags ORDER BY key")).rows;
  const orphanResult = await pool.query(`SELECT
    (SELECT count(*) FROM physiqueos.sessions s LEFT JOIN physiqueos.devices d ON d.id=s.device_id AND d.user_id=s.user_id WHERE d.id IS NULL) +
    (SELECT count(*) FROM physiqueos.upload_intents i LEFT JOIN physiqueos.stored_objects o ON o.id=i.object_id AND o.user_id=i.user_id WHERE o.id IS NULL) +
    (SELECT count(*) FROM physiqueos.command_receipts r LEFT JOIN physiqueos.sessions s ON s.id=r.session_id AND s.user_id=r.user_id WHERE s.id IS NULL) AS count`);
  const payload = { counts, migrations, identities, receipts, outbox, objects, flags };
  return { ...payload, orphans: Number(orphanResult.rows[0].count), digest: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
}

function requiredUrl(key, expectedDatabase) {
  const value = String(process.env[key] ?? "").trim();
  const parsed = new URL(value);
  if (!parsed.hostname.endsWith(".ondigitalocean.com") || decodeURIComponent(parsed.pathname.slice(1)) !== expectedDatabase) throw new Error(`${key} does not identify the approved isolated provider database.`);
  return value;
}
function poolFor(connectionString) {
  return createPostgresPool({ enabled: true, connectionString, caCertificate, applicationName: "physiqueos-provider-restore-acceptance", maximumPoolSize: 2, statementTimeoutMs: 30_000 });
}
