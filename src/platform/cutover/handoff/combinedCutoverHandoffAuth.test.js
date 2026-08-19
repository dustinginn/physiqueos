import { describe, expect, it } from "vitest";
import { hashHighEntropyCredential } from "../../auth/credentialHash.js";
import {
  authenticateCombinedCutoverHandoff,
  readCombinedCutoverHandoffAuthConfig,
} from "./combinedCutoverHandoffAuth.js";

const PEPPER = "p".repeat(40);
const SECRET = "s".repeat(40);
const OPERATION_ID = "combined-op-0001";
const ENVIRONMENT = "combined-cutover-production";

function config({ credential = SECRET, operationId = OPERATION_ID, environment = ENVIRONMENT, pepper = PEPPER, expiresAt = "2026-12-01T00:00:00.000Z" } = {}) {
  return Object.freeze({
    enabled: true, configured: true, operationId, environment,
    credentialHash: hashHighEntropyCredential(credential, { pepper }),
    expiresAt, pepper,
  });
}

describe("readCombinedCutoverHandoffAuthConfig", () => {
  it("is disabled by default", () => {
    expect(readCombinedCutoverHandoffAuthConfig({}).enabled).toBe(false);
  });

  it("fails closed (configured=false) when any required value is missing or malformed", () => {
    const base = {
      PHYSIQUEOS_COMBINED_CUTOVER_HANDOFF_ENABLED: "1",
      PHYSIQUEOS_COMBINED_CUTOVER_HANDOFF_OPERATION_ID: OPERATION_ID,
      PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT: ENVIRONMENT,
      PHYSIQUEOS_COMBINED_CUTOVER_HANDOFF_CREDENTIAL_HASH: hashHighEntropyCredential(SECRET, { pepper: PEPPER }),
      PHYSIQUEOS_COMBINED_CUTOVER_HANDOFF_CREDENTIAL_EXPIRES_AT: "2026-12-01T00:00:00.000Z",
      PHYSIQUEOS_CREDENTIAL_PEPPER: PEPPER,
    };
    expect(readCombinedCutoverHandoffAuthConfig(base).configured).toBe(true);
    expect(readCombinedCutoverHandoffAuthConfig({ ...base, PHYSIQUEOS_COMBINED_CUTOVER_HANDOFF_OPERATION_ID: "" }).configured).toBe(false);
    expect(readCombinedCutoverHandoffAuthConfig({ ...base, PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT: "" }).configured).toBe(false);
    expect(readCombinedCutoverHandoffAuthConfig({ ...base, PHYSIQUEOS_COMBINED_CUTOVER_HANDOFF_CREDENTIAL_HASH: "not-a-hash" }).configured).toBe(false);
    expect(readCombinedCutoverHandoffAuthConfig({ ...base, PHYSIQUEOS_CREDENTIAL_PEPPER: "short" }).configured).toBe(false);
  });

  it("is a separate credential namespace from both the Phase 3 transfer and Phase 4 preparation channels", () => {
    const base = {
      PHYSIQUEOS_COMBINED_CUTOVER_HANDOFF_ENABLED: "1",
      PHYSIQUEOS_COMBINED_CUTOVER_HANDOFF_OPERATION_ID: OPERATION_ID,
      PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT: ENVIRONMENT,
      PHYSIQUEOS_COMBINED_CUTOVER_HANDOFF_CREDENTIAL_HASH: hashHighEntropyCredential(SECRET, { pepper: PEPPER }),
      PHYSIQUEOS_COMBINED_CUTOVER_HANDOFF_CREDENTIAL_EXPIRES_AT: "2026-12-01T00:00:00.000Z",
      PHYSIQUEOS_CREDENTIAL_PEPPER: PEPPER,
      PHYSIQUEOS_COMBINED_CUTOVER_TRANSFER_ENABLED: "0",
      PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_ENABLED: "0",
    };
    expect(readCombinedCutoverHandoffAuthConfig(base).configured).toBe(true);
  });
});

describe("authenticateCombinedCutoverHandoff", () => {
  const now = () => new Date("2026-08-18T00:00:00.000Z");

  it("rejects when the channel is not configured", () => {
    expectCode(() => authenticateCombinedCutoverHandoff({
      authorizationHeader: "Bearer anything", requestedOperationId: OPERATION_ID, config: Object.freeze({ enabled: false }), now,
    }), "TRANSFER_NOT_CONFIGURED");
  });

  it("rejects a missing Authorization header", () => {
    expectCode(() => authenticateCombinedCutoverHandoff({
      authorizationHeader: null, requestedOperationId: OPERATION_ID, config: config(), now,
    }), "TRANSFER_AUTHENTICATION_REQUIRED");
  });

  it("rejects the wrong credential", () => {
    expectCode(() => authenticateCombinedCutoverHandoff({
      authorizationHeader: "Bearer wrong-credential-wrong-credential-1234", requestedOperationId: OPERATION_ID, config: config(), now,
    }), "TRANSFER_AUTHENTICATION_FAILED");
  });

  it("the Phase 4 preparation credential value does not authenticate a handoff request (separate credentials)", () => {
    const preparationCredential = "prep".repeat(10);
    expectCode(() => authenticateCombinedCutoverHandoff({
      authorizationHeader: `Bearer ${preparationCredential}`, requestedOperationId: OPERATION_ID, config: config(), now,
    }), "TRANSFER_AUTHENTICATION_FAILED");
  });

  it("accepts the correct credential for the bound operation and environment", () => {
    expect(authenticateCombinedCutoverHandoff({ authorizationHeader: `Bearer ${SECRET}`, requestedOperationId: OPERATION_ID, requestedEnvironment: ENVIRONMENT, config: config(), now }))
      .toEqual({ operationId: OPERATION_ID, environment: ENVIRONMENT });
  });

  it("rejects a valid credential used against a different operation", () => {
    expectCode(() => authenticateCombinedCutoverHandoff({
      authorizationHeader: `Bearer ${SECRET}`, requestedOperationId: "combined-op-9999", config: config(), now,
    }), "TRANSFER_OPERATION_FORBIDDEN");
  });

  it("rejects a valid credential used against a different environment", () => {
    expectCode(() => authenticateCombinedCutoverHandoff({
      authorizationHeader: `Bearer ${SECRET}`, requestedOperationId: OPERATION_ID, requestedEnvironment: "some-other-environment", config: config(), now,
    }), "TRANSFER_OPERATION_FORBIDDEN");
  });

  it("rejects an expired credential", () => {
    expectCode(() => authenticateCombinedCutoverHandoff({
      authorizationHeader: `Bearer ${SECRET}`, requestedOperationId: OPERATION_ID,
      config: config({ expiresAt: "2026-01-01T00:00:00.000Z" }), now,
    }), "TRANSFER_CREDENTIAL_EXPIRED");
  });

  it("never leaks the plaintext credential or pepper in a thrown error", () => {
    try {
      authenticateCombinedCutoverHandoff({ authorizationHeader: "Bearer wrong-credential-wrong-credential-1234", requestedOperationId: OPERATION_ID, config: config(), now });
    } catch (error) {
      expect(error.message).not.toContain(SECRET);
      expect(error.message).not.toContain(PEPPER);
    }
  });
});

function expectCode(fn, code) {
  try {
    fn();
  } catch (error) {
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected function to throw ${code}.`);
}
