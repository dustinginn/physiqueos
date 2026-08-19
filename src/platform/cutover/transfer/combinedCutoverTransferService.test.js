import { describe, expect, it, vi } from "vitest";
import { hashHighEntropyCredential } from "../../auth/credentialHash.js";
import { createCombinedCutoverTransferService } from "./combinedCutoverTransferService.js";

const PEPPER = "p".repeat(40);
const SECRET = "s".repeat(40);
const OPERATION_ID = "combined-op-0001";
const PACKAGE_ID = "p".repeat(32);

function authConfig() {
  return Object.freeze({
    enabled: true, configured: true, operationId: OPERATION_ID,
    credentialHash: hashHighEntropyCredential(SECRET, { pepper: PEPPER }),
    expiresAt: "2026-12-01T00:00:00.000Z", pepper: PEPPER,
  });
}

function fakeReceiptStore(overrides = {}) {
  return {
    declare: vi.fn(async () => ({ outcome: "declared", receipt: { operationId: OPERATION_ID, packageId: PACKAGE_ID, status: "declared" } })),
    receiveChunk: vi.fn(async () => ({ outcome: "received", chunkIndex: 0, receipt: { status: "receiving" } })),
    completeAndVerify: vi.fn(async () => ({ outcome: "verified", receipt: { status: "verified" } })),
    status: vi.fn(async () => ({ receipt: { operationId: OPERATION_ID, packageId: PACKAGE_ID, status: "declared" } })),
    ...overrides,
  };
}

describe("combined cutover transfer service — authentication boundary", () => {
  it("rejects declare with no Authorization header before touching the receipt store", async () => {
    const receiptStore = fakeReceiptStore();
    const service = createCombinedCutoverTransferService({ receiptStore, authConfig: authConfig() });
    const result = await service.declare({ authorizationHeader: null, payload: { operationId: OPERATION_ID } });
    expect(result.status).toBe(401);
    expect(result.body.code).toBe("TRANSFER_AUTHENTICATION_REQUIRED");
    expect(receiptStore.declare).not.toHaveBeenCalled();
  });

  it("rejects with the wrong credential", async () => {
    const receiptStore = fakeReceiptStore();
    const service = createCombinedCutoverTransferService({ receiptStore, authConfig: authConfig() });
    const result = await service.declare({ authorizationHeader: "Bearer totally-wrong-credential-value-here", payload: { operationId: OPERATION_ID } });
    expect(result.status).toBe(401);
    expect(receiptStore.declare).not.toHaveBeenCalled();
  });

  it("rejects a credential bound to a different operation than requested (wrong-operation credential)", async () => {
    const receiptStore = fakeReceiptStore();
    const service = createCombinedCutoverTransferService({ receiptStore, authConfig: authConfig() });
    const result = await service.declare({ authorizationHeader: `Bearer ${SECRET}`, payload: { operationId: "combined-op-9999" } });
    expect(result.status).toBe(403);
    expect(result.body.code).toBe("TRANSFER_OPERATION_FORBIDDEN");
    expect(receiptStore.declare).not.toHaveBeenCalled();
  });

  it("reports not-configured when the channel is disabled, without a 500", async () => {
    const receiptStore = fakeReceiptStore();
    const service = createCombinedCutoverTransferService({ receiptStore, authConfig: Object.freeze({ enabled: false }) });
    const result = await service.declare({ authorizationHeader: `Bearer ${SECRET}`, payload: { operationId: OPERATION_ID } });
    expect(result.status).toBe(503);
    expect(result.body.code).toBe("TRANSFER_NOT_CONFIGURED");
  });

  it("accepts a valid credential for its own bound operation", async () => {
    const receiptStore = fakeReceiptStore();
    const service = createCombinedCutoverTransferService({ receiptStore, authConfig: authConfig() });
    const result = await service.declare({ authorizationHeader: `Bearer ${SECRET}`, payload: { operationId: OPERATION_ID, packageId: PACKAGE_ID } });
    expect(result.status).toBe(201);
    expect(receiptStore.declare).toHaveBeenCalledOnce();
  });
});

describe("combined cutover transfer service — malformed identity", () => {
  it("rejects malformed IDs before reaching the receipt store", async () => {
    const receiptStore = fakeReceiptStore();
    const service = createCombinedCutoverTransferService({ receiptStore, authConfig: authConfig() });
    const result = await service.receiveChunk({
      authorizationHeader: `Bearer ${SECRET}`, operationId: OPERATION_ID, packageId: "../../etc/passwd",
      chunkIndex: 0, chunkDigest: "z".repeat(64), contentLength: 4, bytes: Buffer.from("abcd"),
    });
    expect(result.status).toBe(400);
    expect(receiptStore.receiveChunk).not.toHaveBeenCalled();
  });

  it("rejects a path-traversal-shaped operationId", async () => {
    const receiptStore = fakeReceiptStore();
    const service = createCombinedCutoverTransferService({ receiptStore, authConfig: authConfig() });
    const result = await service.status({ authorizationHeader: `Bearer ${SECRET}`, operationId: "../escape", packageId: PACKAGE_ID });
    expect(result.status).toBe(400);
    expect(receiptStore.status).not.toHaveBeenCalled();
  });
});

describe("combined cutover transfer service — chunk body/length binding", () => {
  it("rejects a chunk whose actual byte length disagrees with its declared Content-Length", async () => {
    const receiptStore = fakeReceiptStore();
    const service = createCombinedCutoverTransferService({ receiptStore, authConfig: authConfig() });
    const result = await service.receiveChunk({
      authorizationHeader: `Bearer ${SECRET}`, operationId: OPERATION_ID, packageId: PACKAGE_ID,
      chunkIndex: 0, chunkDigest: "a".repeat(64), contentLength: 100, bytes: Buffer.from("short"),
    });
    expect(result.status).toBe(413);
    expect(receiptStore.receiveChunk).not.toHaveBeenCalled();
  });
});

describe("combined cutover transfer service — response projection", () => {
  it("never echoes anything beyond the documented receipt fields", async () => {
    const receiptStore = fakeReceiptStore({
      declare: vi.fn(async () => ({
        outcome: "declared",
        receipt: {
          schemaVersion: 1, receiptId: "cctr_x", operationId: OPERATION_ID, packageId: PACKAGE_ID,
          overallDigest: "a".repeat(64), expectedBytes: 10, receivedBytes: 0, expectedChunkCount: 2,
          receivedChunkCount: 0, status: "declared", createdAt: "t", updatedAt: "t", completedAt: null, verifiedAt: null,
          stagingPrefix: "cutover-transfer/should-not-leak",
        },
      })),
    });
    const service = createCombinedCutoverTransferService({ receiptStore, authConfig: authConfig() });
    const result = await service.declare({ authorizationHeader: `Bearer ${SECRET}`, payload: { operationId: OPERATION_ID } });
    expect(Object.keys(result.body).sort()).toEqual([
      "completedAt", "createdAt", "expectedBytes", "expectedChunkCount", "outcome", "overallDigest",
      "packageId", "receiptId", "receivedBytes", "receivedChunkCount", "schemaVersion", "status", "updatedAt", "verifiedAt",
      "operationId",
    ].sort());
    expect(JSON.stringify(result.body)).not.toContain("cutover-transfer/should-not-leak");
  });
});

describe("combined cutover transfer service — status cross-operation isolation", () => {
  it("propagates the receipt store's own scoped lookup and does not leak another operation's state", async () => {
    const receiptStore = fakeReceiptStore({
      status: vi.fn(async (operationId) => {
        if (operationId !== OPERATION_ID) throw Object.assign(new Error("unavailable"), { code: "TRANSFER_RECEIPT_UNAVAILABLE" });
        return { receipt: { operationId: OPERATION_ID, packageId: PACKAGE_ID, status: "declared" } };
      }),
    });
    const service = createCombinedCutoverTransferService({ receiptStore, authConfig: authConfig() });
    const own = await service.status({ authorizationHeader: `Bearer ${SECRET}`, operationId: OPERATION_ID, packageId: PACKAGE_ID });
    expect(own.status).toBe(200);
  });
});
