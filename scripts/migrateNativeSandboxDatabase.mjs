import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readDatabaseConfig } from "../src/platform/database/config.js";
import { createPostgresPool } from "../src/platform/database/pool.js";
import {
  createSandboxDatabaseAuthorityGuard,
  readNativeSandboxAuthorityConfig,
} from "../src/platform/sandbox/NativeSandboxAuthority.js";

const MIGRATION_PATTERN = /^\d{6}_[a-z0-9_]+\.cjs$/;

export async function migrateNativeSandboxDatabase({
  env = process.env,
  migrationDirectory = fileURLToPath(new URL("../db/migrations/", import.meta.url)),
  pool: suppliedPool,
} = {}) {
  const config = readNativeSandboxAuthorityConfig({ ...env, PHYSIQUEOS_NATIVE_SANDBOX_ENABLED: "1" });
  const databaseConfig = readDatabaseConfig({
    ...env,
    PHYSIQUEOS_DATABASE_ENABLED: "1",
    PHYSIQUEOS_DATABASE_URL: config.databaseUrl,
    PHYSIQUEOS_DATABASE_APPLICATION_NAME: `physiqueos-native-sandbox-migration-${config.authorityId}`,
    PHYSIQUEOS_DATABASE_POOL_MAX: "1",
  });
  if (databaseConfig.databaseName !== config.databaseName) throw new Error("NATIVE_SANDBOX_MIGRATION_DATABASE_IDENTITY_FAIL");

  const pool = suppliedPool ?? createPostgresPool(databaseConfig);
  const ownsPool = !suppliedPool;
  const guard = createSandboxDatabaseAuthorityGuard({ pool, config });
  const require = createRequire(import.meta.url);
  const files = (await fs.readdir(migrationDirectory)).filter((name) => MIGRATION_PATTERN.test(name)).sort();
  if (files.length === 0) throw new Error("NATIVE_SANDBOX_MIGRATIONS_MISSING");

  const client = await pool.connect();
  const applied = [];
  try {
    await client.query("BEGIN");
    await guard.assertDatabase(client);
    await client.query("SELECT pg_advisory_xact_lock(hashtext('physiqueos:native-sandbox-migration'))");
    await client.query("CREATE SCHEMA IF NOT EXISTS physiqueos");
    await client.query(`CREATE TABLE IF NOT EXISTS physiqueos.physiqueos_schema_migrations (
      id serial PRIMARY KEY,
      name varchar(255) NOT NULL UNIQUE,
      run_on timestamp without time zone NOT NULL
    )`);
    const existing = new Set((await client.query(
      "SELECT name FROM physiqueos.physiqueos_schema_migrations ORDER BY id",
    )).rows.map((row) => row.name));

    for (const file of files) {
      const name = file.replace(/\.cjs$/, "");
      if (existing.has(name)) continue;
      const statements = [];
      const migration = require(path.join(migrationDirectory, file));
      await migration.up({ sql: (statement) => statements.push(String(statement)) });
      if (statements.length === 0) throw new Error(`NATIVE_SANDBOX_MIGRATION_EMPTY:${name}`);
      for (const statement of statements) await client.query(statement);
      await client.query(
        "INSERT INTO physiqueos.physiqueos_schema_migrations (name,run_on) VALUES ($1,now())",
        [name],
      );
      applied.push(name);
    }
    await client.query("COMMIT");
    return Object.freeze({
      status: "PASS",
      authorityId: config.authorityId,
      databaseName: config.databaseName,
      migrationCount: files.length,
      applied: Object.freeze(applied),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    if (ownsPool) await pool.end();
  }
}

async function main() {
  const result = await migrateNativeSandboxDatabase();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) await main();
