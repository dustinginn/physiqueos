import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const migration = require("./000015_sender_constrained_refresh_recovery.cjs");

describe("sender-constrained refresh recovery migration", () => {
  it("persists key binding, proof replay state, exchanges, and access use", () => {
    for (const fragment of [
      "CREATE TABLE physiqueos.installation_signing_keys",
      "ADD COLUMN refresh_proof_version",
      "ADD COLUMN first_used_at",
      "CREATE TABLE physiqueos.refresh_proof_challenges",
      "proof_id_digest char(64) UNIQUE",
      "CREATE TABLE physiqueos.refresh_exchanges",
      "predecessor_refresh_id text NOT NULL UNIQUE",
      "successor_refresh_id text NOT NULL UNIQUE",
      "maximum_recoveries integer NOT NULL",
      "CREATE TABLE physiqueos.refresh_exchange_access_credentials",
    ]) expect(migration.UP_SQL).toContain(fragment);
  });

  it("has a complete reverse migration", () => {
    expect(migration.DOWN_SQL).toContain("DROP TABLE IF EXISTS physiqueos.refresh_exchange_access_credentials");
    expect(migration.DOWN_SQL).toContain("DROP TABLE IF EXISTS physiqueos.installation_signing_keys");
    expect(migration.DOWN_SQL).toContain("DROP COLUMN IF EXISTS refresh_proof_capability");
  });
});
