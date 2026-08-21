import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const migration = require("./000011_combined_cutover_coordinator.cjs");

describe("000011 combined cutover coordinator", () => {
  it("creates one CAS-versioned run row with bounded coordinator and B-snapshot evidence", () => {
    expect(migration.UP_SQL).toContain("combined_cutover_coordinator_runs");
    expect(migration.UP_SQL).toContain("migration_operation_id text NOT NULL UNIQUE");
    expect(migration.UP_SQL).toContain("version bigint NOT NULL DEFAULT 0");
    expect(migration.UP_SQL).toContain("b_snapshot_digest");
    expect(migration.UP_SQL).toContain("m_boundary_crossed");
  });
  it("does not store payloads, credentials, commands, raw provider responses, or task XML", () => {
    expect(migration.UP_SQL).not.toMatch(/payload|credential|access_token|command_line|task_xml|provider_body/i);
  });
  it("drops only its own table", () => {
    expect(migration.DOWN_SQL.trim()).toBe("DROP TABLE IF EXISTS physiqueos.combined_cutover_coordinator_runs;");
  });
});
