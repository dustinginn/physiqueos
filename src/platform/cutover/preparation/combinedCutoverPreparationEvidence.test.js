import { describe, expect, it, vi } from "vitest";
import { requireVerifiedTransfer } from "./combinedCutoverPreparationEvidence.js";

const digest = (character) => character.repeat(64);
const operationId = "combined-op-0001";
const authorizationFingerprint = digest("a");
const fenceId = "fence-1";
const packageDigest = digest("c");

function manifestReceiptStore(overrides = {}) {
  return {
    read: vi.fn(async () => ({
      receipt: {
        migrationOperationId: operationId, authorizationFingerprint, fenceId, packageDigest,
        status: "verified", manifest: { packageDigest, files: [{ path: "manifest.json", byteLength: 8, sha256: digest("1") }] },
        ...overrides,
      },
    })),
  };
}

function artifactReceiptStore(overrides = {}) {
  return {
    status: vi.fn(async () => ({ receipt: { status: "verified", overallDigest: digest("1"), expectedBytes: 8, ...overrides } })),
  };
}

describe("requireVerifiedTransfer", () => {
  it("returns the manifest receipt and verified artifacts when everything matches", async () => {
    const result = await requireVerifiedTransfer({
      manifestReceiptStore: manifestReceiptStore(), artifactReceiptStore: artifactReceiptStore(),
      operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest,
    });
    expect(result.manifestReceipt.status).toBe("verified");
    expect(result.verifiedArtifacts).toHaveLength(1);
  });

  it("rejects when no transfer has been declared", async () => {
    const store = { read: vi.fn(async () => { throw Object.assign(new Error("none"), { code: "TRANSFER_RECEIPT_UNAVAILABLE" }); }) };
    await expect(requireVerifiedTransfer({
      manifestReceiptStore: store, artifactReceiptStore: artifactReceiptStore(),
      operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest,
    })).rejects.toMatchObject({ code: "PREPARATION_TRANSFER_NOT_VERIFIED" });
  });

  it("rejects an unverified (declared/receiving) transfer", async () => {
    await expect(requireVerifiedTransfer({
      manifestReceiptStore: manifestReceiptStore({ status: "declared" }), artifactReceiptStore: artifactReceiptStore(),
      operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest,
    })).rejects.toMatchObject({ code: "PREPARATION_TRANSFER_NOT_VERIFIED" });
  });

  it("rejects an authorizationFingerprint/fenceId mismatch", async () => {
    await expect(requireVerifiedTransfer({
      manifestReceiptStore: manifestReceiptStore(), artifactReceiptStore: artifactReceiptStore(),
      operationId, authorizationFingerprint: digest("9"), fenceId, expectedPackageDigest: packageDigest,
    })).rejects.toMatchObject({ code: "TRANSFER_OPERATION_FORBIDDEN" });
  });

  it("rejects a package digest mismatch", async () => {
    await expect(requireVerifiedTransfer({
      manifestReceiptStore: manifestReceiptStore(), artifactReceiptStore: artifactReceiptStore(),
      operationId, authorizationFingerprint, fenceId, expectedPackageDigest: digest("9"),
    })).rejects.toMatchObject({ code: "TRANSFER_PACKAGE_DIGEST_CONFLICT" });
  });

  it("rejects when a declared artifact's receipt does not match the manifest entry", async () => {
    await expect(requireVerifiedTransfer({
      manifestReceiptStore: manifestReceiptStore(), artifactReceiptStore: artifactReceiptStore({ overallDigest: digest("9") }),
      operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest,
    })).rejects.toMatchObject({ code: "TRANSFER_PACKAGE_IDENTITY_MISMATCH" });
  });
});
