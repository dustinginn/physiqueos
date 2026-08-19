import { describe, expect, it } from "vitest";
import { hashHighEntropyCredential } from "../../auth/credentialHash.js";
import { authenticateCombinedCutoverTransfer, readCombinedCutoverTransferAuthConfig } from "./combinedCutoverTransferAuth.js";

const PEPPER = "p".repeat(40);
const SECRET = "s".repeat(40);
const OPERATION_ID = "combined-op-0001";

function config({ credential = SECRET, operationId = OPERATION_ID, pepper = PEPPER, expiresAt = "2026-12-01T00:00:00.000Z" } = {}) {
  return Object.freeze({
    enabled: true,
    configured: true,
    operationId,
    credentialHash: hashHighEntropyCredential(credential, { pepper }),
    expiresAt,
    pepper,
  });
}

describe("readCombinedCutoverTransferAuthConfig", () => {
  it("is disabled by default", () => {
    expect(readCombinedCutoverTransferAuthConfig({}).enabled).toBe(false);
  });

  it("fails closed (configured=false) when any required value is missing or malformed", () => {
    const base = {
      PHYSIQUEOS_COMBINED_CUTOVER_TRANSFER_ENABLED: "1",
      PHYSIQUEOS_COMBINED_CUTOVER_TRANSFER_OPERATION_ID: OPERATION_ID,
      PHYSIQUEOS_COMBINED_CUTOVER_TRANSFER_CREDENTIAL_HASH: hashHighEntropyCredential(SECRET, { pepper: PEPPER }),
      PHYSIQUEOS_COMBINED_CUTOVER_TRANSFER_CREDENTIAL_EXPIRES_AT: "2026-12-01T00:00:00.000Z",
      PHYSIQUEOS_CREDENTIAL_PEPPER: PEPPER,
    };
    expect(readCombinedCutoverTransferAuthConfig(base).configured).toBe(true);
    expect(readCombinedCutoverTransferAuthConfig({ ...base, PHYSIQUEOS_COMBINED_CUTOVER_TRANSFER_OPERATION_ID: "" }).configured).toBe(false);
    expect(readCombinedCutoverTransferAuthConfig({ ...base, PHYSIQUEOS_COMBINED_CUTOVER_TRANSFER_CREDENTIAL_HASH: "not-a-hash" }).configured).toBe(false);
    expect(readCombinedCutoverTransferAuthConfig({ ...base, PHYSIQUEOS_CREDENTIAL_PEPPER: "short" }).configured).toBe(false);
    expect(readCombinedCutoverTransferAuthConfig({ ...base, PHYSIQUEOS_COMBINED_CUTOVER_TRANSFER_CREDENTIAL_EXPIRES_AT: "not-a-date" }).configured).toBe(false);
  });
});

describe("authenticateCombinedCutoverTransfer", () => {
  const now = () => new Date("2026-08-18T00:00:00.000Z");

  it("rejects when the channel is not configured (fail closed, no channel active)", () => {
    expectCode(() => authenticateCombinedCutoverTransfer({
      authorizationHeader: "Bearer anything", requestedOperationId: OPERATION_ID,
      config: Object.freeze({ enabled: false }), now,
    }), "TRANSFER_NOT_CONFIGURED");
  });

  it("rejects a missing Authorization header", () => {
    expectCode(() => authenticateCombinedCutoverTransfer({
      authorizationHeader: null, requestedOperationId: OPERATION_ID, config: config(), now,
    }), "TRANSFER_AUTHENTICATION_REQUIRED");
  });

  it("rejects a malformed Authorization header", () => {
    expectCode(() => authenticateCombinedCutoverTransfer({
      authorizationHeader: "Token abc", requestedOperationId: OPERATION_ID, config: config(), now,
    }), "TRANSFER_AUTHENTICATION_REQUIRED");
  });

  it("rejects the wrong credential", () => {
    expectCode(() => authenticateCombinedCutoverTransfer({
      authorizationHeader: "Bearer wrong-credential-wrong-credential-1234", requestedOperationId: OPERATION_ID, config: config(), now,
    }), "TRANSFER_AUTHENTICATION_FAILED");
  });

  it("accepts the correct credential for the bound operation", () => {
    const result = authenticateCombinedCutoverTransfer({
      authorizationHeader: `Bearer ${SECRET}`, requestedOperationId: OPERATION_ID, config: config(), now,
    });
    expect(result).toEqual({ operationId: OPERATION_ID });
  });

  it("rejects a valid credential used against a different operation (wrong-operation credential)", () => {
    expectCode(() => authenticateCombinedCutoverTransfer({
      authorizationHeader: `Bearer ${SECRET}`, requestedOperationId: "combined-op-9999", config: config(), now,
    }), "TRANSFER_OPERATION_FORBIDDEN");
  });

  it("rejects an expired credential", () => {
    expectCode(() => authenticateCombinedCutoverTransfer({
      authorizationHeader: `Bearer ${SECRET}`, requestedOperationId: OPERATION_ID,
      config: config({ expiresAt: "2026-01-01T00:00:00.000Z" }), now,
    }), "TRANSFER_CREDENTIAL_EXPIRED");
  });

  it("never leaks the plaintext credential or pepper in a thrown error", () => {
    try {
      authenticateCombinedCutoverTransfer({
        authorizationHeader: "Bearer wrong-credential-wrong-credential-1234", requestedOperationId: OPERATION_ID, config: config(), now,
      });
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
