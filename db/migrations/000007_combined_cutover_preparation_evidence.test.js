import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const migration = require("./000007_combined_cutover_preparation_evidence.cjs");

describe("combined cutover preparation evidence migration", () => {
  it("creates one operation-bound receipt table covering import, media, parity, and prepared status", () => {
    expect(migration.UP_SQL).toContain("combined_cutover_preparation_receipts");
    expect(migration.UP_SQL).toContain("import_status");
    expect(migration.UP_SQL).toContain("media_status");
    expect(migration.UP_SQL).toContain("parity_status");
    expect(migration.UP_SQL).toContain("prepared_status");
  });

  it("binds one row per migration_operation_id via a UNIQUE constraint, unlike phase4_import_runs", () => {
    expect(migration.UP_SQL).toContain("migration_operation_id text NOT NULL UNIQUE");
  });

  it("never stores payload contents - only counts, digests, status, and timestamps", () => {
    expect(migration.UP_SQL).not.toContain("payload");
    expect(migration.UP_SQL).not.toContain("jsonb NOT NULL CHECK (jsonb_typeof(payload)");
  });

  it("enforces that an acknowledged prepared row can only exist once import/media/parity all succeeded", () => {
    expect(migration.UP_SQL).toContain("prepared_status <> 'acknowledged' OR (");
    expect(migration.UP_SQL).toContain("import_status = 'succeeded' AND media_status = 'succeeded' AND parity_status = 'passed'");
  });

  it("never references combined_runtime_authority or a first-provider-write boundary", () => {
    expect(migration.UP_SQL).not.toContain("combined_runtime_authority");
    expect(migration.UP_SQL.toLowerCase()).not.toContain("first_provider_canonical_write_at");
  });

  it("down migration drops exactly the one new table", () => {
    expect(migration.DOWN_SQL).toContain("DROP TABLE IF EXISTS physiqueos.combined_cutover_preparation_receipts");
  });
});
