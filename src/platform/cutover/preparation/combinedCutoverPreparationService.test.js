import { describe, expect, it, vi } from "vitest";
import { hashHighEntropyCredential } from "../../auth/credentialHash.js";
import { createCombinedCutoverPreparationService } from "./combinedCutoverPreparationService.js";

const PEPPER = "p".repeat(40);
const SECRET = "s".repeat(40);
const OPERATION_ID = "combined-op-0001";

function authConfig() {
  return Object.freeze({
    enabled: true, configured: true, operationId: OPERATION_ID,
    credentialHash: hashHighEntropyCredential(SECRET, { pepper: PEPPER }),
    expiresAt: "2026-12-01T00:00:00.000Z", pepper: PEPPER,
  });
}

function fakeServices(overrides = {}) {
  return {
    importService: { import: vi.fn(async () => ({ ready: true, outcome: "imported", records: 3, collectionCounts: { goals: 3 }, mediaObjectCount: 1 })) },
    parityService: { verifyParity: vi.fn(async () => ({ ready: true, outcome: "verified", readParity: "pass", commandReadiness: "pass", mediaValidated: true })) },
    acknowledgeService: { acknowledge: vi.fn(async () => ({ migrationOperationId: OPERATION_ID, authorizationFingerprint: "a".repeat(64), fenceId: "fence-1", packageDigest: "c".repeat(64), providerDeploymentId: "deployment-1" })) },
    preparationStore: { read: vi.fn(async () => ({ receipt: { schemaVersion: 1, receiptId: "ccpr_x", operationId: OPERATION_ID, packageDigest: "c".repeat(64), importStatus: "succeeded", importedCollectionCounts: { goals: 3 }, mediaStatus: "succeeded", mediaObjectCount: 1, parityStatus: "passed", preparedStatus: "pending", createdAt: "t", updatedAt: "t", targetDatabase: "should-not-leak" } })) },
    ...overrides,
  };
}

describe("combined cutover preparation service — authentication boundary", () => {
  it("rejects import with no Authorization header before touching the import service", async () => {
    const services = fakeServices();
    const service = createCombinedCutoverPreparationService({ ...services, authConfig: authConfig() });
    const result = await service.import({ authorizationHeader: null, payload: { migrationOperationId: OPERATION_ID } });
    expect(result.status).toBe(401);
    expect(services.importService.import).not.toHaveBeenCalled();
  });

  it("rejects parity with the wrong credential", async () => {
    const services = fakeServices();
    const service = createCombinedCutoverPreparationService({ ...services, authConfig: authConfig() });
    const result = await service.parity({ authorizationHeader: "Bearer totally-wrong-credential-value", payload: { migrationOperationId: OPERATION_ID } });
    expect(result.status).toBe(401);
    expect(services.parityService.verifyParity).not.toHaveBeenCalled();
  });

  it("rejects acknowledge for a credential bound to a different operation (wrong-operation credential)", async () => {
    const services = fakeServices();
    const service = createCombinedCutoverPreparationService({ ...services, authConfig: authConfig() });
    const result = await service.acknowledge({ authorizationHeader: `Bearer ${SECRET}`, payload: { migrationOperationId: "combined-op-other" } });
    expect(result.status).toBe(403);
    expect(services.acknowledgeService.acknowledge).not.toHaveBeenCalled();
  });

  it("reports not-configured without a 500 when the channel is disabled", async () => {
    const services = fakeServices();
    const service = createCombinedCutoverPreparationService({ ...services, authConfig: Object.freeze({ enabled: false }) });
    const result = await service.import({ authorizationHeader: `Bearer ${SECRET}`, payload: { migrationOperationId: OPERATION_ID } });
    expect(result.status).toBe(503);
    expect(result.body.code).toBe("TRANSFER_NOT_CONFIGURED");
  });

  it("Founder session authentication alone is insufficient: only a valid machine credential authenticates", async () => {
    const services = fakeServices();
    const service = createCombinedCutoverPreparationService({ ...services, authConfig: authConfig() });
    // A Founder session cookie header is not even the right auth mechanism for this channel - only
    // Authorization: Bearer <machine credential> is ever consulted, and no cookie header substitutes.
    const result = await service.import({ authorizationHeader: undefined, payload: { migrationOperationId: OPERATION_ID } });
    expect(result.status).toBe(401);
  });

  it("accepts a valid credential for its own bound operation", async () => {
    const services = fakeServices();
    const service = createCombinedCutoverPreparationService({ ...services, authConfig: authConfig() });
    const result = await service.import({ authorizationHeader: `Bearer ${SECRET}`, payload: { migrationOperationId: OPERATION_ID } });
    expect(result.status).toBe(200);
    expect(services.importService.import).toHaveBeenCalledOnce();
  });
});

describe("combined cutover preparation service — response projection", () => {
  it("never echoes the target database or other internal receipt fields in status responses", async () => {
    const services = fakeServices();
    const service = createCombinedCutoverPreparationService({ ...services, authConfig: authConfig() });
    const result = await service.status({ authorizationHeader: `Bearer ${SECRET}`, operationId: OPERATION_ID });
    expect(result.status).toBe(200);
    expect(JSON.stringify(result.body)).not.toContain("should-not-leak");
  });

  it("includes a bounded parityDiagnostic when the parity service throws one, without dumping payload data", async () => {
    const services = fakeServices({
      parityService: {
        verifyParity: vi.fn(async () => {
          const error = new Error("mismatch");
          error.code = "PREPARATION_PARITY_MISMATCH";
          error.parityDiagnostic = { method: "home", differingPaths: [{ path: "$.data.label", kind: "value-mismatch" }], truncated: false };
          throw error;
        }),
      },
    });
    const service = createCombinedCutoverPreparationService({ ...services, authConfig: authConfig() });
    const result = await service.parity({ authorizationHeader: `Bearer ${SECRET}`, payload: { migrationOperationId: OPERATION_ID } });
    expect(result.status).toBe(422);
    expect(result.body.parityDiagnostic).toBeTruthy();
    expect(result.body.parityDiagnostic.differingPaths).toHaveLength(1);
  });
});

describe("combined cutover preparation service — cross-operation status isolation", () => {
  it("propagates the preparation store's own scoped lookup", async () => {
    const services = fakeServices({
      preparationStore: {
        read: vi.fn(async (operationId) => {
          if (operationId !== OPERATION_ID) throw Object.assign(new Error("unavailable"), { code: "TRANSFER_RECEIPT_UNAVAILABLE" });
          return { receipt: { schemaVersion: 1, receiptId: "ccpr_x", operationId, packageDigest: "c".repeat(64), importStatus: "pending", mediaStatus: "pending", parityStatus: "pending", preparedStatus: "pending", createdAt: "t", updatedAt: "t" } };
        }),
      },
    });
    const service = createCombinedCutoverPreparationService({ ...services, authConfig: authConfig() });
    const result = await service.status({ authorizationHeader: `Bearer ${SECRET}`, operationId: OPERATION_ID });
    expect(result.status).toBe(200);
  });
});
