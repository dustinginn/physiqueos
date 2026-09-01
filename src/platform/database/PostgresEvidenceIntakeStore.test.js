import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./PostgresEvidenceIntakeStore.js", import.meta.url), "utf8");

describe("targeted provider Evidence intake storage", () => {
  it("uses an owner-scoped receipt lock and never reconstructs the Founder runtime", () => {
    expect(source).toContain("physiqueos:intake:${ownerUserId}:${input.submissionIdentity}");
    expect(source).toContain("FOR UPDATE");
    expect(source).not.toMatch(/loadCanonicalRuntime|createSeedRepositories|structuredClone\(runtime\)/);
  });

  it("atomically links one deterministic package/review to one receipt", () => {
    expect(source).toContain('collection: "evidencePackages"');
    expect(source).toContain('collection: "evidenceReviews"');
    expect(source).toContain("interpretation_state='completed'");
    expect(source).toContain("package_id=$3,review_id=$4");
  });

  it("dedupes interpretation work by the durable receipt identity", () => {
    expect(source).toContain("createEvidenceIntakeInterpretationMessage");
    expect(source).toContain("ON CONFLICT (topic,dedupe_key) DO NOTHING");
    expect(source).toContain("EVIDENCE_INTAKE_CANONICAL_IDENTITY_CONFLICT");
  });
});
