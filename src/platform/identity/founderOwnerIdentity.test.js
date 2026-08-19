import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { founderOwnerIdentifierContentPattern, isFounderOwnerIdentifier } from "./founderOwnerIdentity.js";

describe("isFounderOwnerIdentifier", () => {
  it("accepts the canonical Founder seed-user identifier", () => {
    expect(isFounderOwnerIdentifier("user_founder_001")).toBe(true);
  });

  it("accepts any user_founder_* identifier, not only the exact literal", () => {
    expect(isFounderOwnerIdentifier("user_founder_002")).toBe(true);
    expect(isFounderOwnerIdentifier("user_founder_synthetic")).toBe(true);
    expect(isFounderOwnerIdentifier("USER_FOUNDER_001")).toBe(true); // case-insensitive
  });

  it("rejects the Phase 5 synthetic owner and other non-Founder identifiers", () => {
    expect(isFounderOwnerIdentifier("phase5-synthetic-user")).toBe(false);
    expect(isFounderOwnerIdentifier("some-other-owner")).toBe(false);
  });

  it("rejects empty/missing values", () => {
    expect(isFounderOwnerIdentifier("")).toBe(false);
    expect(isFounderOwnerIdentifier(null)).toBe(false);
    expect(isFounderOwnerIdentifier(undefined)).toBe(false);
  });

  it("does not match a value that merely CONTAINS the pattern as a substring of a larger identifier", () => {
    // Exact-identifier check, not a content scan - "notuser_founder_001" is a different identifier.
    expect(isFounderOwnerIdentifier("notuser_founder_001")).toBe(false);
  });
});

describe("founderOwnerIdentifierContentPattern", () => {
  it("matches the Founder identifier embedded anywhere in a larger text", () => {
    const pattern = founderOwnerIdentifierContentPattern();
    expect(pattern.test('const owner = "user_founder_001";')).toBe(true);
  });

  it("does not match unrelated text", () => {
    const pattern = founderOwnerIdentifierContentPattern();
    expect(pattern.test('const owner = "phase5-synthetic-user";')).toBe(false);
  });

  it("returns a fresh RegExp instance each call (no shared lastIndex state)", () => {
    const a = founderOwnerIdentifierContentPattern();
    const b = founderOwnerIdentifierContentPattern();
    expect(a).not.toBe(b);
  });
});

describe("self-scan regression", () => {
  it("this module's own source contains no literal string matching the Founder-owner content pattern", async () => {
    // The provider artifact privacy scanner (scripts/scanProviderArtifact.mjs) imports this exact
    // pattern and scans this module's own source as part of the collected worker artifact - a
    // literal documentation example here (e.g. a bare "user_founder_001") would make the classifier
    // flag itself and block artifact collection. See scripts/collectProviderWorkerArtifact.mjs and
    // PROVIDER_ARTIFACT_PRIVACY_REJECTED.
    const source = await fs.readFile(new URL("./founderOwnerIdentity.js", import.meta.url), "utf8");
    const pattern = founderOwnerIdentifierContentPattern();
    expect(pattern.test(source)).toBe(false);
  });
});
