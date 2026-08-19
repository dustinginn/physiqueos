import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const migration = require("./000006_combined_cutover_transfer_staging.cjs");

describe("combined cutover transfer staging migration", () => {
  it("creates the byte-level receipt and chunk tables, additive and separate from 000005", () => {
    expect(migration.UP_SQL).toContain("combined_cutover_transfer_receipts");
    expect(migration.UP_SQL).toContain("combined_cutover_transfer_chunks");
    expect(migration.UP_SQL).not.toContain("combined_transfer_receipts (");
  });

  it("scopes the staging namespace to cutover-transfer/ only, never to the canonical private media prefix", () => {
    expect(migration.UP_SQL).toContain("staging_prefix text NOT NULL CHECK (staging_prefix ~ '^cutover-transfer/')");
    expect(migration.UP_SQL).toContain("staging_key text NOT NULL CHECK (staging_key ~ '^cutover-transfer/')");
    expect(migration.UP_SQL).not.toMatch(/CHECK[^)]*'\^private\//);
  });

  it("enforces status vocabulary and byte/chunk-count monotonicity invariants at the schema level", () => {
    expect(migration.UP_SQL).toContain("status text NOT NULL CHECK (status IN ('declared', 'receiving', 'verified', 'failed'))");
    expect(migration.UP_SQL).toContain("CHECK (received_bytes <= expected_bytes)");
    expect(migration.UP_SQL).toContain("CHECK (received_chunk_count <= expected_chunk_count)");
  });

  it("requires a durable receipt per (migration_operation_id, package_id) and unique staging keys", () => {
    expect(migration.UP_SQL).toContain("UNIQUE (migration_operation_id, package_id)");
    expect(migration.UP_SQL).toContain("UNIQUE (staging_key)");
  });

  it("never references combined_runtime_authority or a first-provider-write boundary", () => {
    expect(migration.UP_SQL).not.toContain("combined_runtime_authority");
    expect(migration.UP_SQL.toLowerCase()).not.toContain("first_provider_canonical_write_at");
  });

  it("down migration drops exactly the two new tables, chunks before receipts (FK order)", () => {
    const chunksIndex = migration.DOWN_SQL.indexOf("combined_cutover_transfer_chunks");
    const receiptsIndex = migration.DOWN_SQL.indexOf("combined_cutover_transfer_receipts");
    expect(chunksIndex).toBeGreaterThanOrEqual(0);
    expect(receiptsIndex).toBeGreaterThan(chunksIndex);
  });
});
