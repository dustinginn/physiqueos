import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const migration = require("../../../db/migrations/000004_phase5_provider_readiness.cjs");

describe("Phase 5 provider-readiness migration", () => {
  it("adds provider version metadata and durable synthetic validation evidence", () => {
    expect(migration.PHASE5_UP_SQL).toContain("ADD COLUMN provider_version text");
    expect(migration.PHASE5_UP_SQL).toContain("ADD COLUMN provider_etag text");
    expect(migration.PHASE5_UP_SQL).toContain("CREATE TABLE physiqueos.phase5_validation_runs");
    expect(migration.PHASE5_UP_SQL).toContain("owner_user_id text NOT NULL REFERENCES physiqueos.users(id)");
  });

  it("has an explicit reversible down path", () => {
    expect(migration.PHASE5_DOWN_SQL).toContain("DROP TABLE IF EXISTS physiqueos.phase5_validation_runs");
    expect(migration.PHASE5_DOWN_SQL).toContain("DROP COLUMN IF EXISTS provider_version");
  });
});
