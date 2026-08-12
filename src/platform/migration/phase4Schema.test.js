import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { FOUNDATION_SOURCE_COLLECTIONS } from "./foundationSourceCollections.js";
import { PHASE4_DOMAIN_TABLES } from "./phase4DomainCollections.js";

const require = createRequire(import.meta.url);
const migration = require("../../../db/migrations/000003_phase4_canonical_domains.cjs");

describe("Phase 4 canonical domain schema", () => {
  it("maps every canonical source collection to a bounded domain table", () => {
    expect(Object.keys(PHASE4_DOMAIN_TABLES).sort()).toEqual([...FOUNDATION_SOURCE_COLLECTIONS].sort());
    expect(new Set(Object.values(PHASE4_DOMAIN_TABLES)).size).toBe(10);
  });

  it("defines owner, identity, version, occurrence, provenance, media and reversible import state", () => {
    for (const table of migration.DOMAIN_TABLES) {
      expect(migration.PHASE4_UP_SQL).toContain(`CREATE TABLE physiqueos.${table}`);
      expect(migration.PHASE4_DOWN_SQL).toContain(`DROP TABLE IF EXISTS physiqueos.${table}`);
    }
    for (const required of ["owner_user_id text NOT NULL", "record_id text NOT NULL", "version bigint NOT NULL", "occurrence_date date", "source_identity text", "payload jsonb NOT NULL", "CREATE TABLE physiqueos.canonical_media_objects", "CREATE TABLE physiqueos.phase4_import_runs"]) {
      expect(migration.PHASE4_UP_SQL).toContain(required);
    }
  });
});
