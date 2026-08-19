import { describe, expect, it } from "vitest";
import { assertCanonicalImportOwnerAllowed, isCompatibilityRehearsalTargetDatabase } from "./canonicalImportOwnerGuard.js";

describe("isCompatibilityRehearsalTargetDatabase", () => {
  it("recognizes the guarded Phase 4/5 database naming patterns", () => {
    expect(isCompatibilityRehearsalTargetDatabase("physiqueos_phase4_test_20260101")).toBe(true);
    expect(isCompatibilityRehearsalTargetDatabase("physiqueos_phase4_rehearsal")).toBe(true);
    expect(isCompatibilityRehearsalTargetDatabase("physiqueos_phase4_restore")).toBe(true);
    expect(isCompatibilityRehearsalTargetDatabase("physiqueos_phase5_test_provider_20260811")).toBe(true);
    expect(isCompatibilityRehearsalTargetDatabase("physiqueos_phase5_restore_provider")).toBe(true);
  });

  it("does not recognize a production-shaped database name", () => {
    expect(isCompatibilityRehearsalTargetDatabase("physiqueos_production")).toBe(false);
    expect(isCompatibilityRehearsalTargetDatabase("physiqueos")).toBe(false);
  });
});

describe("assertCanonicalImportOwnerAllowed — compatibility/rehearsal target", () => {
  const targetDatabaseName = "physiqueos_phase5_test_provider_20260811";

  it("rejects a Founder-owned package before any mutation", () => {
    expect(() => assertCanonicalImportOwnerAllowed({ packageOwnerUserId: "user_founder_001", targetDatabaseName }))
      .toThrow(expect.objectContaining({ code: "PROVIDER_COMPATIBILITY_OWNER_FORBIDDEN" }));
  });

  it("rejects any user_founder_* owner, not only the exact literal", () => {
    expect(() => assertCanonicalImportOwnerAllowed({ packageOwnerUserId: "user_founder_002", targetDatabaseName }))
      .toThrow(expect.objectContaining({ code: "PROVIDER_COMPATIBILITY_OWNER_FORBIDDEN" }));
  });

  it("accepts the expected synthetic owner", () => {
    const result = assertCanonicalImportOwnerAllowed({ packageOwnerUserId: "phase5-synthetic-user", targetDatabaseName, expectedOwnerUserId: "phase5-synthetic-user" });
    expect(result).toMatchObject({ isCompatibilityRehearsalTarget: true, packageOwnerUserId: "phase5-synthetic-user" });
  });

  it("accepts a non-Founder owner with no expected-owner constraint supplied", () => {
    const result = assertCanonicalImportOwnerAllowed({ packageOwnerUserId: "phase5-synthetic-user", targetDatabaseName });
    expect(result.isCompatibilityRehearsalTarget).toBe(true);
  });

  it("rejects an expected-owner mismatch", () => {
    expect(() => assertCanonicalImportOwnerAllowed({ packageOwnerUserId: "some-other-synthetic-owner", targetDatabaseName, expectedOwnerUserId: "phase5-synthetic-user" }))
      .toThrow(expect.objectContaining({ code: "PROVIDER_COMPATIBILITY_OWNER_MISMATCH" }));
  });

  it("rejects a missing package owner", () => {
    expect(() => assertCanonicalImportOwnerAllowed({ packageOwnerUserId: "", targetDatabaseName }))
      .toThrow(expect.objectContaining({ code: "PROVIDER_COMPATIBILITY_OWNER_REQUIRED" }));
  });
});

describe("assertCanonicalImportOwnerAllowed — non-compatibility target (production-authorized elsewhere)", () => {
  it("does not reject the real Founder owner outside a compatibility/rehearsal target", () => {
    const result = assertCanonicalImportOwnerAllowed({ packageOwnerUserId: "user_founder_001", targetDatabaseName: "physiqueos_production" });
    expect(result).toMatchObject({ isCompatibilityRehearsalTarget: false, packageOwnerUserId: "user_founder_001" });
  });
});

describe("assertCanonicalImportOwnerAllowed — cannot be bypassed by filename/path alone", () => {
  it("the guard is a pure function of the declared package owner and target database name - it never inspects a filename or caller label", () => {
    // Structural proof: the function reads only packageOwnerUserId/targetDatabaseName/expectedOwnerUserId
    // from its options object - extra fields like a filename or label cannot change its verdict.
    expect(() => assertCanonicalImportOwnerAllowed({
      packageOwnerUserId: "user_founder_001",
      targetDatabaseName: "physiqueos_phase5_test_provider_20260811",
      // A caller cannot smuggle a different "declared" owner past the guard via any other field.
      filename: "definitely-not-founder-data.json",
      label: "synthetic",
    })).toThrow(expect.objectContaining({ code: "PROVIDER_COMPATIBILITY_OWNER_FORBIDDEN" }));
  });
});
