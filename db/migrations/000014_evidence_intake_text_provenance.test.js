import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const migration = require("./000014_evidence_intake_text_provenance.cjs");

describe("evidence intake text provenance migration", () => {
  it("durably distinguishes Founder-authored notes from device OCR", () => {
    expect(migration.UP_SQL).toContain("ADD COLUMN evidence_text_kind text");
    expect(migration.UP_SQL).toContain("'founder_typed','client_extracted'");
    expect(migration.DOWN_SQL).toContain("DROP COLUMN IF EXISTS evidence_text_kind");
  });
});
