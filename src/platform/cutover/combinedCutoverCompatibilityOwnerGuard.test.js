import { describe, expect, it } from "vitest";
import { assertCompatibilityOwnerIdentity } from "./combinedCutoverCompatibilityOwnerGuard.js";

describe("assertCompatibilityOwnerIdentity", () => {
  it("rejects the Founder-owner identifier", () => {
    expect(() => assertCompatibilityOwnerIdentity("user_founder_001"))
      .toThrow(expect.objectContaining({ code: "PROVIDER_COMPATIBILITY_OWNER_FORBIDDEN" }));
  });

  it("rejects any user_founder_* identifier, not only the exact literal", () => {
    expect(() => assertCompatibilityOwnerIdentity("user_founder_002"))
      .toThrow(expect.objectContaining({ code: "PROVIDER_COMPATIBILITY_OWNER_FORBIDDEN" }));
  });

  it("rejects a missing/empty owner", () => {
    expect(() => assertCompatibilityOwnerIdentity("")).toThrow(expect.objectContaining({ code: "PROVIDER_COMPATIBILITY_OWNER_REQUIRED" }));
    expect(() => assertCompatibilityOwnerIdentity(null)).toThrow(expect.objectContaining({ code: "PROVIDER_COMPATIBILITY_OWNER_REQUIRED" }));
  });

  it("accepts the Phase 5 synthetic owner (or any other non-Founder identifier) with no expected-owner constraint", () => {
    expect(assertCompatibilityOwnerIdentity("phase5-synthetic-user")).toBe("phase5-synthetic-user");
    expect(assertCompatibilityOwnerIdentity("combined-cutover-compatibility-rehearsal-owner")).toBe("combined-cutover-compatibility-rehearsal-owner");
  });

  it("accepts a non-Founder owner that exactly matches an explicit expected rehearsal owner", () => {
    expect(assertCompatibilityOwnerIdentity("phase5-synthetic-user", { expectedOwnerUserId: "phase5-synthetic-user" })).toBe("phase5-synthetic-user");
  });

  it("rejects a non-Founder owner that does not match the explicit expected rehearsal owner", () => {
    expect(() => assertCompatibilityOwnerIdentity("some-other-owner", { expectedOwnerUserId: "phase5-synthetic-user" }))
      .toThrow(expect.objectContaining({ code: "PROVIDER_COMPATIBILITY_OWNER_MISMATCH" }));
  });

  it("still rejects the Founder owner even when it happens to equal the expected value (defense in depth)", () => {
    expect(() => assertCompatibilityOwnerIdentity("user_founder_001", { expectedOwnerUserId: "user_founder_001" }))
      .toThrow(expect.objectContaining({ code: "PROVIDER_COMPATIBILITY_OWNER_FORBIDDEN" }));
  });
});
