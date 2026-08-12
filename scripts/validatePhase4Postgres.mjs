import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { runner as migrate } from "node-pg-migrate";
import { register } from "node:module";

register("./sourceModuleResolutionHook.mjs", import.meta.url);
const { importCanonicalPackage, validateCanonicalImport } = await import("../src/platform/migration/phase4CanonicalImport.js");

const root = process.cwd();
const databaseUrl = String(process.env.PHYSIQUEOS_PHASE4_DATABASE_URL ?? process.env.PHYSIQUEOS_TEST_DATABASE_URL ?? "").trim();
const packageRoot = path.resolve(process.env.PHYSIQUEOS_PHASE4_PACKAGE_ROOT ?? path.join(root, ".tmp", "phase4-current-copy-run1", "package"));
const snapshotRoot = path.resolve(process.env.PHYSIQUEOS_PHASE4_SNAPSHOT_ROOT ?? path.join(root, ".tmp", "phase4-current-copy-run1", "snapshot"));
const objectRoot = path.resolve(process.env.PHYSIQUEOS_PHASE4_OBJECT_ROOT ?? path.join(root, ".tmp", "phase4-current-copy-run1", "objects"));
assertGuarded(databaseUrl);
if (![packageRoot, snapshotRoot, objectRoot].every((value) => value.startsWith(path.join(root, ".tmp") + path.sep))) throw new Error("Phase 4 PostgreSQL acceptance artifacts must remain under .tmp.");
if (!fs.existsSync(path.join(packageRoot, "manifest.json"))) throw new Error("A deterministic Phase 4 package is required before PostgreSQL validation.");
const migrationOptions = { databaseUrl, dir: "db/migrations", migrationsTable: "physiqueos_schema_migrations", migrationsSchema: "physiqueos", schema: "physiqueos", createSchema: true, createMigrationsSchema: true, log: () => undefined };
await migrate({ ...migrationOptions, direction: "down", count: Number.POSITIVE_INFINITY }).catch((error) => { if (!/schema.*does not exist|relation.*does not exist/i.test(String(error.message))) throw error; });
await migrate({ ...migrationOptions, direction: "up" });
let pool = new pg.Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true });
await importCanonicalPackage({ pool, packageRoot, resetTarget: true });
await validateCanonicalImport({ pool, packageRoot });
await pool.end();

const postgresBin = "C:\\Program Files\\PostgreSQL\\17\\bin";
const childEnv = { ...process.env, PHYSIQUEOS_PHASE4_DATABASE_URL: databaseUrl, PATH: fs.existsSync(postgresBin) ? `${postgresBin};${process.env.PATH}` : process.env.PATH };
for (const [label, script, args] of [
  ["media copy", "scripts/migratePhase4LocalMedia.mjs", [packageRoot, path.join(snapshotRoot, "media"), objectRoot]],
  ["read parity", "scripts/validatePhase4ReadParity.mjs", [packageRoot]],
  ["command/concurrency parity", "scripts/validatePhase4CommandParity.mjs", [packageRoot]],
  ["rollback/repeat/backup restore", "scripts/validatePhase4RehearsalLifecycle.mjs", [packageRoot, path.join(snapshotRoot, "runtime-store.json"), path.join(snapshotRoot, "media"), objectRoot]],
  ["security/ownership", "scripts/validatePhase4Security.mjs", [packageRoot, objectRoot]],
]) {
  process.stdout.write(`\n[phase4-postgres] ${label}\n`);
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, env: childEnv, stdio: "inherit", windowsHide: true, timeout: 180_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}.`);
}

await migrate({ ...migrationOptions, direction: "down", count: Number.POSITIVE_INFINITY });
await migrate({ ...migrationOptions, direction: "up" });
pool = new pg.Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true });
const finalImport = await importCanonicalPackage({ pool, packageRoot, resetTarget: true });
await validateCanonicalImport({ pool, packageRoot });
const migrations = await pool.query("SELECT name FROM physiqueos.physiqueos_schema_migrations ORDER BY name");
await pool.end();
if (migrations.rows.length !== 3) throw new Error("Phase 4 migration down/up/reapply did not retain all three migrations.");
process.stdout.write(`\n[phase4-postgres] PASS migrations=up/down/reapply digest=${finalImport.importDigest}\n`);

function assertGuarded(value) {
  let parsed; try { parsed = new URL(value); } catch { throw new Error("PHYSIQUEOS_PHASE4_DATABASE_URL is required."); }
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (!/^physiqueos_phase4_(?:test|rehearsal|restore)(?:_|$)/.test(database)) throw new Error("Refusing destructive Phase 4 validation outside a guarded database.");
}
