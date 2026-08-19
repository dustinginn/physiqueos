import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const migration = require("./000010_combined_cutover_handoff_worker_evidence.cjs");

describe("combined cutover handoff worker-evidence migration", () => {
  it("additively alters the existing handoff receipts table rather than creating a new table", () => {
    expect(migration.UP_SQL).toContain("ALTER TABLE physiqueos.combined_cutover_handoff_receipts");
    expect(migration.UP_SQL).not.toContain("CREATE TABLE");
  });

  it("adds worker activation and Windows-worker-retirement evidence columns with sensible defaults", () => {
    expect(migration.UP_SQL).toContain("ADD COLUMN worker_activation_status text NOT NULL DEFAULT 'pending'");
    expect(migration.UP_SQL).toContain("ADD COLUMN worker_activated_at timestamptz");
    expect(migration.UP_SQL).toContain("ADD COLUMN worker_verified_at timestamptz");
    expect(migration.UP_SQL).toContain("ADD COLUMN windows_worker_retirement_status text NOT NULL DEFAULT 'pending'");
    expect(migration.UP_SQL).toContain("ADD COLUMN windows_worker_retired_at timestamptz");
  });

  it("constrains worker activation status to the four honest outcomes", () => {
    expect(migration.UP_SQL).toContain("worker_activation_status IN ('pending', 'activated', 'verified', 'failed')");
  });

  it("constrains Windows worker retirement status to the three honest outcomes", () => {
    expect(migration.UP_SQL).toContain("windows_worker_retirement_status IN ('pending', 'retired', 'failed')");
  });

  it("enforces that activated/verified worker status always carries its timestamp", () => {
    expect(migration.UP_SQL).toContain("worker_activation_status NOT IN ('activated', 'verified') OR worker_activated_at IS NOT NULL");
    expect(migration.UP_SQL).toContain("worker_activation_status <> 'verified' OR worker_verified_at IS NOT NULL");
  });

  it("enforces that retired Windows worker status always carries its timestamp", () => {
    expect(migration.UP_SQL).toContain("windows_worker_retirement_status <> 'retired' OR windows_worker_retired_at IS NOT NULL");
  });

  it("never references a second authority state machine or a first-provider-write boundary", () => {
    expect(migration.UP_SQL.toLowerCase()).not.toContain("first_provider_canonical_write_at");
    expect(migration.UP_SQL.toLowerCase()).not.toContain("worker_authority");
  });

  it("never stores payload contents or secrets", () => {
    expect(migration.UP_SQL).not.toContain("secret");
    expect(migration.UP_SQL).not.toContain("credential");
    expect(migration.UP_SQL).not.toContain("payload");
  });

  it("down migration drops exactly the added columns and constraints, never the table", () => {
    expect(migration.DOWN_SQL).toContain("DROP COLUMN IF EXISTS worker_activation_status");
    expect(migration.DOWN_SQL).toContain("DROP COLUMN IF EXISTS windows_worker_retirement_status");
    expect(migration.DOWN_SQL).not.toContain("DROP TABLE");
  });
});
