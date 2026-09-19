import fs from "node:fs";
import path from "node:path";

export const PHYSIQUEOS_MIGRATION_DIRECTORY = "db/migrations";
export const PHYSIQUEOS_MIGRATION_FILENAME_PATTERN = /^\d{6}_[a-z0-9]+(?:_[a-z0-9]+)*\.cjs$/;

// node-pg-migrate wraps ignorePattern with ^...$. This negative allowlist
// ignores every directory entry that is not a PhysiqueOS migration filename.
export const PHYSIQUEOS_MIGRATION_IGNORE_PATTERN =
  String.raw`(?!\d{6}_[a-z0-9]+(?:_[a-z0-9]+)*\.cjs$).*`;

export function createPhysiqueOSMigrationOptions({ databaseUrl, log } = {}) {
  return Object.freeze({
    databaseUrl,
    dir: PHYSIQUEOS_MIGRATION_DIRECTORY,
    ignorePattern: PHYSIQUEOS_MIGRATION_IGNORE_PATTERN,
    migrationsTable: "physiqueos_schema_migrations",
    migrationsSchema: "physiqueos",
    schema: "physiqueos",
    createSchema: true,
    createMigrationsSchema: true,
    ...(typeof log === "function" ? { log } : {}),
  });
}

export function discoverPhysiqueOSMigrationFiles({
  root = process.cwd(),
  directory = PHYSIQUEOS_MIGRATION_DIRECTORY,
} = {}) {
  return Object.freeze(fs.readdirSync(path.resolve(root, directory), { withFileTypes: true })
    .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) &&
      PHYSIQUEOS_MIGRATION_FILENAME_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort());
}
