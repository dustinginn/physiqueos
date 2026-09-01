import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const migration = require("./000012_evidence_intake_receipts.cjs");

describe("durable evidence intake receipt migration", () => {
  it("owns submission idempotency and durable media/interpretation progress", () => {
    expect(migration.UP_SQL).toContain("CREATE TABLE physiqueos.evidence_intake_receipts");
    expect(migration.UP_SQL).toContain("UNIQUE (owner_user_id, submission_identity)");
    expect(migration.UP_SQL).toContain("artifact_manifest jsonb NOT NULL");
    expect(migration.UP_SQL).toContain("stored_artifacts jsonb NOT NULL");
    expect(migration.UP_SQL).toContain("interpretation_state text NOT NULL");
    expect(migration.UP_SQL).toContain("package_id text");
    expect(migration.UP_SQL).toContain("review_id text");
  });
});
