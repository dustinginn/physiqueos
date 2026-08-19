import { describe, expect, it } from "vitest";
import { hashHighEntropyCredential } from "../../auth/credentialHash.js";
import {
  authenticateCombinedCutoverPreparation,
  readCombinedCutoverPreparationAuthConfig,
} from "./combinedCutoverPreparationAuth.js";

const PEPPER = "p".repeat(40);
const SECRET = "s".repeat(40);
const OPERATION_ID = "combined-op-0001";

function config({ credential = SECRET, operationId = OPERATION_ID, pepper = PEPPER, expiresAt = "2026-12-01T00:00:00.000Z" } = {}) {
  return Object.freeze({
    enabled: true, configured: true, operationId,
    credentialHash: hashHighEntropyCredential(credential, { pepper }),
    expiresAt, pepper,
  });
}

describe("readCombinedCutoverPreparationAuthConfig", () => {
  it("is disabled by default", () => {
    expect(readCombinedCutoverPreparationAuthConfig({}).enabled).toBe(false);
  });

  it("fails closed (configured=false) when any required value is missing or malformed", () => {
    const base = {
      PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_ENABLED: "1",
      PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_OPERATION_ID: OPERATION_ID,
      PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_CREDENTIAL_HASH: hashHighEntropyCredential(SECRET, { pepper: PEPPER }),
      PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_CREDENTIAL_EXPIRES_AT: "2026-12-01T00:00:00.000Z",
      PHYSIQUEOS_CREDENTIAL_PEPPER: PEPPER,
    };
    expect(readCombinedCutoverPreparationAuthConfig(base).configured).toBe(true);
    expect(readCombinedCutoverPreparationAuthConfig({ ...base, PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_OPERATION_ID: "" }).configured).toBe(false);
    expect(readCombinedCutoverPreparationAuthConfig({ ...base, PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_CREDENTIAL_HASH: "not-a-hash" }).configured).toBe(false);
    expect(readCombinedCutoverPreparationAuthConfig({ ...base, PHYSIQUEOS_CREDENTIAL_PEPPER: "short" }).configured).toBe(false);
  });

  it("is a separate credential namespace from the Phase 3 transfer channel", () => {
    const base = {
      PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_ENABLED: "1",
      PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_OPERATION_ID: OPERATION_ID,
      PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_CREDENTIAL_HASH: hashHighEntropyCredential(SECRET, { pepper: PEPPER }),
      PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_CREDENTIAL_EXPIRES_AT: "2026-12-01T00:00:00.000Z",
      PHYSIQUEOS_CREDENTIAL_PEPPER: PEPPER,
      // Transfer credential intentionally absent/different - preparation config must not depend on it.
      PHYSIQUEOS_COMBINED_CUTOVER_TRANSFER_ENABLED: "0",
    };
    expect(readCombinedCutoverPreparationAuthConfig(base).configured).toBe(true);
  });
});

describe("authenticateCombinedCutoverPreparation", () => {
  const now = () => new Date("2026-08-18T00:00:00.000Z");

  it("rejects when the channel is not configured", () => {
    expectCode(() => authenticateCombinedCutoverPreparation({
      authorizationHeader: "Bearer anything", requestedOperationId: OPERATION_ID, config: Object.freeze({ enabled: false }), now,
    }), "TRANSFER_NOT_CONFIGURED");
  });

  it("rejects a missing Authorization header", () => {
    expectCode(() => authenticateCombinedCutoverPreparation({
      authorizationHeader: null, requestedOperationId: OPERATION_ID, config: config(), now,
    }), "TRANSFER_AUTHENTICATION_REQUIRED");
  });

  it("rejects the wrong credential", () => {
    expectCode(() => authenticateCombinedCutoverPreparation({
      authorizationHeader: "Bearer wrong-credential-wrong-credential-1234", requestedOperationId: OPERATION_ID, config: config(), now,
    }), "TRANSFER_AUTHENTICATION_FAILED");
  });

  it("accepts the correct credential for the bound operation", () => {
    expect(authenticateCombinedCutoverPreparation({ authorizationHeader: `Bearer ${SECRET}`, requestedOperationId: OPERATION_ID, config: config(), now }))
      .toEqual({ operationId: OPERATION_ID });
  });

  it("rejects a valid credential used against a different operation", () => {
    expectCode(() => authenticateCombinedCutoverPreparation({
      authorizationHeader: `Bearer ${SECRET}`, requestedOperationId: "combined-op-9999", config: config(), now,
    }), "TRANSFER_OPERATION_FORBIDDEN");
  });

  it("rejects an expired credential", () => {
    expectCode(() => authenticateCombinedCutoverPreparation({
      authorizationHeader: `Bearer ${SECRET}`, requestedOperationId: OPERATION_ID,
      config: config({ expiresAt: "2026-01-01T00:00:00.000Z" }), now,
    }), "TRANSFER_CREDENTIAL_EXPIRED");
  });

  it("a valid Phase 3 transfer credential does not authenticate a preparation request (separate credentials)", () => {
    // Simulates a caller reusing the transfer credential value against the preparation channel:
    // the preparation config's own hash was derived from a different secret, so verification fails.
    const transferSecret = "t".repeat(40);
    expectCode(() => authenticateCombinedCutoverPreparation({
      authorizationHeader: `Bearer ${transferSecret}`, requestedOperationId: OPERATION_ID, config: config(), now,
    }), "TRANSFER_AUTHENTICATION_FAILED");
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
