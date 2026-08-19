import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const migration = require("./000008_combined_cutover_handoff_receipts.cjs");

describe("combined cutover handoff receipts migration", () => {
  it("creates one operation-bound receipt table covering authority and routing status", () => {
    expect(migration.UP_SQL).toContain("combined_cutover_handoff_receipts");
    expect(migration.UP_SQL).toContain("authority_status");
    expect(migration.UP_SQL).toContain("routing_status");
  });

  it("binds one row per migration_operation_id via a UNIQUE constraint", () => {
    expect(migration.UP_SQL).toContain("migration_operation_id text NOT NULL UNIQUE");
  });

  it("never stores payload contents or secrets - only identifiers, status, and timestamps", () => {
    expect(migration.UP_SQL).not.toContain("secret");
    expect(migration.UP_SQL).not.toContain("credential");
    expect(migration.UP_SQL).not.toContain("payload");
  });

  it("enforces that a committed authority row always carries its timestamp and resulting authority", () => {
    expect(migration.UP_SQL).toContain("authority_status <> 'committed' OR (authority_committed_at IS NOT NULL AND resulting_authority IS NOT NULL)");
  });

  it("enforces that activated/verified routing status always carries its activation timestamp", () => {
    expect(migration.UP_SQL).toContain("routing_status NOT IN ('activated', 'verified') OR routing_activated_at IS NOT NULL");
  });

  it("never references a second authority state machine or a first-provider-write boundary", () => {
    expect(migration.UP_SQL.toLowerCase()).not.toContain("first_provider_canonical_write_at");
  });

  it("down migration drops exactly the one new table", () => {
    expect(migration.DOWN_SQL).toContain("DROP TABLE IF EXISTS physiqueos.combined_cutover_handoff_receipts");
  });
});
