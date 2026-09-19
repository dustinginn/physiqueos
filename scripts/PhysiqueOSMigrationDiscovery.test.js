import fs from "node:fs";
import path from "node:path";
import { runner as migrate } from "node-pg-migrate";
import { describe, expect, it } from "vitest";
import {
  PHYSIQUEOS_MIGRATION_FILENAME_PATTERN,
  PHYSIQUEOS_MIGRATION_IGNORE_PATTERN,
  createPhysiqueOSMigrationOptions,
  discoverPhysiqueOSMigrationFiles,
} from "./physiqueOSMigrationDiscovery.mjs";

const EXPECTED_MIGRATIONS = Object.freeze([
  "000001_shared_platform_foundation.cjs",
  "000002_phase2_platform_operations.cjs",
  "000003_phase4_canonical_domains.cjs",
  "000004_phase5_provider_readiness.cjs",
  "000005_combined_runtime_authority.cjs",
  "000006_combined_cutover_transfer_staging.cjs",
  "000007_combined_cutover_preparation_evidence.cjs",
  "000008_combined_cutover_handoff_receipts.cjs",
  "000009_combined_cutover_handoff_recovery_evidence.cjs",
  "000010_combined_cutover_handoff_worker_evidence.cjs",
  "000011_combined_cutover_coordinator.cjs",
  "000012_evidence_intake_receipts.cjs",
  "000013_native_sandbox_bootstrap_pairing.cjs",
  "000014_evidence_intake_text_provenance.cjs",
]);

describe("PhysiqueOS programmatic migration discovery", () => {
  it("discovers only the ordered legitimate migrations through 000014", () => {
    expect(discoverPhysiqueOSMigrationFiles()).toEqual(EXPECTED_MIGRATIONS);
    expect(EXPECTED_MIGRATIONS.every((name) =>
      PHYSIQUEOS_MIGRATION_FILENAME_PATTERN.test(name))).toBe(true);
  });

  it("excludes migration-adjacent tests and other non-migration files", () => {
    const entries = fs.readdirSync(path.resolve("db/migrations"));
    expect(entries).toContain("000005_combined_runtime_authority.test.js");
    expect(discoverPhysiqueOSMigrationFiles()).not.toContain(
      "000005_combined_runtime_authority.test.js"
    );

    const nodePgMigrateIgnore = new RegExp(`^${PHYSIQUEOS_MIGRATION_IGNORE_PATTERN}$`);
    for (const name of [
      "000005_combined_runtime_authority.test.js",
      "000015_fixture.js",
      "migration-helper.cjs",
      "README.md",
    ]) {
      expect(nodePgMigrateIgnore.test(name), name).toBe(true);
    }
    expect(nodePgMigrateIgnore.test("000014_evidence_intake_text_provenance.cjs"))
      .toBe(false);
  });

  it("makes node-pg-migrate load only the legitimate ordered migration modules", async () => {
    const queries = [];
    const dbClient = {
      async query(statement) {
        queries.push(typeof statement === "string" ? statement : statement.text);
        return { rows: [] };
      },
    };

    const loaded = await migrate({
      ...createPhysiqueOSMigrationOptions(),
      dbClient,
      direction: "up",
      fake: true,
      noLock: true,
      log: () => undefined,
    });

    expect(loaded.map(({ path: migrationPath }) => path.basename(migrationPath)))
      .toEqual(EXPECTED_MIGRATIONS);
    expect(queries.some((statement) => statement.includes("000005_combined_runtime_authority")))
      .toBe(true);
  });

  it("applies the same fail-closed discovery options to every runner", () => {
    expect(createPhysiqueOSMigrationOptions({ databaseUrl: "postgresql://synthetic.invalid/test" }))
      .toMatchObject({
        dir: "db/migrations",
        ignorePattern: PHYSIQUEOS_MIGRATION_IGNORE_PATTERN,
        migrationsTable: "physiqueos_schema_migrations",
        migrationsSchema: "physiqueos",
        schema: "physiqueos",
        createSchema: true,
        createMigrationsSchema: true,
      });

    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
    expect(packageJson.scripts).toMatchObject({
      "db:migrate:up": "node scripts/runPhysiqueOSMigration.mjs up",
      "db:migrate:down": "node scripts/runPhysiqueOSMigration.mjs down",
      "db:migrate:dry-run": "node scripts/runPhysiqueOSMigration.mjs dry-run",
    });
  });
});
