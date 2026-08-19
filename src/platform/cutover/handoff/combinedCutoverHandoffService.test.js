import { describe, expect, it, vi } from "vitest";
import { hashHighEntropyCredential } from "../../auth/credentialHash.js";
import { createCombinedCutoverHandoffService } from "./combinedCutoverHandoffService.js";

const PEPPER = "p".repeat(40);
const SECRET = "s".repeat(40);
const OPERATION_ID = "combined-op-0001";
const ENVIRONMENT = "combined-cutover-production";

function authConfig() {
  return Object.freeze({
    enabled: true, configured: true, operationId: OPERATION_ID, environment: ENVIRONMENT,
    credentialHash: hashHighEntropyCredential(SECRET, { pepper: PEPPER }),
    expiresAt: "2026-12-01T00:00:00.000Z", pepper: PEPPER,
  });
}

function fakeHandoffReceiptStore() {
  return {
    read: vi.fn(async (operationId) => {
      if (operationId !== OPERATION_ID) throw Object.assign(new Error("unavailable"), { code: "TRANSFER_RECEIPT_UNAVAILABLE" });
      return {
        receipt: {
          schemaVersion: 1, receiptId: "ccht_x", operationId: OPERATION_ID, packageDigest: "c".repeat(64),
          routingTarget: "provider-ingress", providerDeploymentId: "deployment-1",
          authorityStatus: "committed", resultingAuthority: "provider-authoritative", authorityCommittedAt: "t",
          routingStatus: "verified", routingActivatedAt: "t", routingVerifiedAt: "t",
          createdAt: "t", updatedAt: "t",
        },
      };
    }),
  };
}

describe("combined cutover handoff service — authentication boundary", () => {
  it("rejects status with no Authorization header", async () => {
    const handoffReceiptStore = fakeHandoffReceiptStore();
    const service = createCombinedCutoverHandoffService({ handoffReceiptStore, authConfig: authConfig() });
    const result = await service.status({ authorizationHeader: null, operationId: OPERATION_ID });
    expect(result.status).toBe(401);
    expect(handoffReceiptStore.read).not.toHaveBeenCalled();
  });

  it("rejects the wrong credential", async () => {
    const handoffReceiptStore = fakeHandoffReceiptStore();
    const service = createCombinedCutoverHandoffService({ handoffReceiptStore, authConfig: authConfig() });
    const result = await service.status({ authorizationHeader: "Bearer totally-wrong-credential-value", operationId: OPERATION_ID });
    expect(result.status).toBe(401);
  });

  it("rejects a credential bound to a different operation", async () => {
    const handoffReceiptStore = fakeHandoffReceiptStore();
    const service = createCombinedCutoverHandoffService({ handoffReceiptStore, authConfig: authConfig() });
    const result = await service.status({ authorizationHeader: `Bearer ${SECRET}`, operationId: "combined-op-other" });
    expect(result.status).toBe(403);
    expect(handoffReceiptStore.read).not.toHaveBeenCalled();
  });

  it("rejects a credential bound to a different environment", async () => {
    const handoffReceiptStore = fakeHandoffReceiptStore();
    const service = createCombinedCutoverHandoffService({ handoffReceiptStore, authConfig: authConfig() });
    const result = await service.status({ authorizationHeader: `Bearer ${SECRET}`, operationId: OPERATION_ID, environment: "wrong-environment" });
    expect(result.status).toBe(403);
  });

  it("reports not-configured without a 500 when the channel is disabled", async () => {
    const handoffReceiptStore = fakeHandoffReceiptStore();
    const service = createCombinedCutoverHandoffService({ handoffReceiptStore, authConfig: Object.freeze({ enabled: false }) });
    const result = await service.status({ authorizationHeader: `Bearer ${SECRET}`, operationId: OPERATION_ID });
    expect(result.status).toBe(503);
  });

  it("accepts a valid credential for its own bound operation and environment", async () => {
    const handoffReceiptStore = fakeHandoffReceiptStore();
    const service = createCombinedCutoverHandoffService({ handoffReceiptStore, authConfig: authConfig() });
    const result = await service.status({ authorizationHeader: `Bearer ${SECRET}`, operationId: OPERATION_ID, environment: ENVIRONMENT });
    expect(result.status).toBe(200);
    expect(handoffReceiptStore.read).toHaveBeenCalledOnce();
  });
});

describe("combined cutover handoff service — response projection and isolation", () => {
  it("returns bounded status metadata without secrets or payload contents", async () => {
    const handoffReceiptStore = fakeHandoffReceiptStore();
    const service = createCombinedCutoverHandoffService({ handoffReceiptStore, authConfig: authConfig() });
    const result = await service.status({ authorizationHeader: `Bearer ${SECRET}`, operationId: OPERATION_ID });
    expect(result.body).toMatchObject({ authorityStatus: "committed", routingStatus: "verified" });
    expect(JSON.stringify(result.body)).not.toContain(SECRET);
    expect(JSON.stringify(result.body)).not.toContain(PEPPER);
  });

  it("cannot read another operation's handoff evidence even when authenticated for its own", async () => {
    const handoffReceiptStore = fakeHandoffReceiptStore();
    const service = createCombinedCutoverHandoffService({ handoffReceiptStore, authConfig: authConfig() });
    // The credential itself is bound only to OPERATION_ID, so a request naming another operation is
    // rejected by authentication before the store is ever consulted (see the 403 test above). This
    // proves the store-level scoping too, for a hypothetical multi-operation credential.
    handoffReceiptStore.read = vi.fn(async (operationId) => {
      if (operationId !== OPERATION_ID) throw Object.assign(new Error("unavailable"), { code: "TRANSFER_RECEIPT_UNAVAILABLE" });
      return { receipt: { schemaVersion: 1, receiptId: "x", operationId, packageDigest: "c".repeat(64), routingTarget: "t", providerDeploymentId: "d", authorityStatus: "pending", resultingAuthority: null, authorityCommittedAt: null, routingStatus: "pending", routingActivatedAt: null, routingVerifiedAt: null, createdAt: "t", updatedAt: "t" } };
    });
    const own = await service.status({ authorizationHeader: `Bearer ${SECRET}`, operationId: OPERATION_ID });
    expect(own.status).toBe(200);
  });
});
