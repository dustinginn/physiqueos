import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const migration = require("./000009_combined_cutover_handoff_recovery_evidence.cjs");

describe("combined cutover handoff recovery-evidence migration", () => {
  it("additively alters the existing handoff receipts table rather than creating a new table", () => {
    expect(migration.UP_SQL).toContain("ALTER TABLE physiqueos.combined_cutover_handoff_receipts");
    expect(migration.UP_SQL).not.toContain("CREATE TABLE");
  });

  it("adds nullable windows-routing-restore evidence columns only", () => {
    expect(migration.UP_SQL).toContain("ADD COLUMN windows_routing_restore_status text");
    expect(migration.UP_SQL).toContain("ADD COLUMN windows_routing_restore_at timestamptz");
    expect(migration.UP_SQL).not.toMatch(/windows_routing_restore_status[^,]*NOT NULL/);
  });

  it("constrains the recovery status to the three honest outcomes", () => {
    expect(migration.UP_SQL).toContain("windows_routing_restore_status IN ('restored', 'failed', 'ambiguous')");
  });

  it("never references a second authority state machine or a first-provider-write boundary", () => {
    expect(migration.UP_SQL.toLowerCase()).not.toContain("first_provider_canonical_write_at");
  });

  it("never stores payload contents or secrets", () => {
    expect(migration.UP_SQL).not.toContain("secret");
    expect(migration.UP_SQL).not.toContain("credential");
    expect(migration.UP_SQL).not.toContain("payload");
  });

  it("down migration drops exactly the two new columns and nothing else", () => {
    expect(migration.DOWN_SQL).toContain("DROP COLUMN IF EXISTS windows_routing_restore_status");
    expect(migration.DOWN_SQL).toContain("DROP COLUMN IF EXISTS windows_routing_restore_at");
    expect(migration.DOWN_SQL).not.toContain("DROP TABLE");
  });
});
