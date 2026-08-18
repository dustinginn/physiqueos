import { describe, it, expect } from "vitest";
import { isAccessGateExpected, readAccessGateSecret, getAccessGateStatus, MINIMUM_SECRET_LENGTH } from "./accessGateConfig.js";

const VALID_SECRET = "x".repeat(MINIMUM_SECRET_LENGTH);

describe("accessGateConfig", () => {
  it("is not expected when PHYSIQUEOS_PROVIDER_FULL_RUNTIME is unset (Windows/local default)", () => {
    expect(isAccessGateExpected({})).toBe(false);
    expect(isAccessGateExpected({ PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "0" })).toBe(false);
  });

  it("is expected only when PHYSIQUEOS_PROVIDER_FULL_RUNTIME is exactly \"1\"", () => {
    expect(isAccessGateExpected({ PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1" })).toBe(true);
    expect(isAccessGateExpected({ PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "true" })).toBe(false);
  });

  it("does not reuse any existing unrelated secret name", () => {
    const env = {
      PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1",
      PHYSIQUEOS_OPERATIONS_TOKEN: VALID_SECRET,
      PHYSIQUEOS_CREDENTIAL_PEPPER: VALID_SECRET,
      PHYSIQUEOS_DATABASE_URL: `postgresql://x:${VALID_SECRET}@host/db`,
    };
    expect(readAccessGateSecret(env)).toBeNull();
  });

  it("rejects a secret shorter than the minimum length", () => {
    const env = { PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1", PHYSIQUEOS_ACCESS_GATE_SECRET: "short" };
    expect(readAccessGateSecret(env)).toBeNull();
  });

  it("accepts a sufficiently long secret", () => {
    const env = { PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1", PHYSIQUEOS_ACCESS_GATE_SECRET: VALID_SECRET };
    expect(readAccessGateSecret(env)).toBe(VALID_SECRET);
  });

  it("trims whitespace from the configured secret", () => {
    const env = { PHYSIQUEOS_ACCESS_GATE_SECRET: `  ${VALID_SECRET}  ` };
    expect(readAccessGateSecret(env)).toBe(VALID_SECRET);
  });

  describe("getAccessGateStatus", () => {
    it("reports ready=true when the gate is not expected at all (Windows/local)", () => {
      expect(getAccessGateStatus({})).toEqual({ expected: false, configured: true, ready: true });
    });

    it("reports ready=false (fail closed) when expected but the secret is missing", () => {
      expect(getAccessGateStatus({ PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1" })).toEqual({ expected: true, configured: false, ready: false });
    });

    it("reports ready=false (fail closed) when expected but the secret is too short", () => {
      const env = { PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1", PHYSIQUEOS_ACCESS_GATE_SECRET: "short" };
      expect(getAccessGateStatus(env)).toEqual({ expected: true, configured: false, ready: false });
    });

    it("reports ready=true when expected and correctly configured", () => {
      const env = { PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1", PHYSIQUEOS_ACCESS_GATE_SECRET: VALID_SECRET };
      expect(getAccessGateStatus(env)).toEqual({ expected: true, configured: true, ready: true });
    });
  });
});
