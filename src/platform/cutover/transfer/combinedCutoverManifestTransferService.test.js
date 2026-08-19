import { describe, expect, it, vi } from "vitest";
import { hashHighEntropyCredential } from "../../auth/credentialHash.js";
import { createCombinedCutoverManifestTransferService } from "./combinedCutoverManifestTransferService.js";
import { deriveTransferPackageId } from "./combinedCutoverTransferContract.js";

const PEPPER = "p".repeat(40);
const SECRET = "s".repeat(40);
const OPERATION_ID = "combined-op-0001";
const digest = (character) => character.repeat(64);

function authConfig() {
  return Object.freeze({
    enabled: true, configured: true, operationId: OPERATION_ID,
    credentialHash: hashHighEntropyCredential(SECRET, { pepper: PEPPER }),
    expiresAt: "2026-12-01T00:00:00.000Z", pepper: PEPPER,
  });
}

const files = [
  { path: "manifest.json", byteLength: 10, sha256: digest("a") },
  { path: "canonical-runtime.json", byteLength: 20, sha256: digest("b") },
];

function baseManifestRow(overrides = {}) {
  return {
    migrationOperationId: OPERATION_ID,
    authorizationFingerprint: digest("f"),
    fenceId: "fence-1",
    packageDigest: digest("c"),
    runtimeSha256: digest("d"),
    mediaInventorySha256: digest("e"),
    migrationControlSha256: digest("9"),
    providerDeploymentId: "deployment-1",
    status: "declared",
    manifest: { packageDigest: digest("c"), files },
    ...overrides,
  };
}

function fakeManifestStore({ row = baseManifestRow() } = {}) {
  let current = row;
  return {
    declare: vi.fn(async (payload) => { current = { ...current, ...payload }; return { outcome: "declared", receipt: current }; }),
    read: vi.fn(async () => ({ receipt: current })),
    verify: vi.fn(async () => { current = { ...current, status: "verified" }; return { outcome: "verified", receipt: current }; }),
  };
}

function fakeArtifactStore(overridesByPackageId = {}) {
  return {
    status: vi.fn(async (operationId, packageId) => {
      if (overridesByPackageId[packageId]) return overridesByPackageId[packageId];
      throw Object.assign(new Error("unavailable"), { code: "TRANSFER_RECEIPT_UNAVAILABLE" });
    }),
  };
}

function verifiedArtifact(file) {
  return { receipt: { status: "verified", overallDigest: file.sha256, expectedBytes: file.byteLength } };
}

describe("combined cutover manifest transfer service — declaration", () => {
  it("rejects declare with no credential", async () => {
    const manifestReceiptStore = fakeManifestStore();
    const service = createCombinedCutoverManifestTransferService({ manifestReceiptStore, artifactReceiptStore: fakeArtifactStore(), authConfig: authConfig() });
    const result = await service.declareManifest({ authorizationHeader: null, payload: { migrationOperationId: OPERATION_ID } });
    expect(result.status).toBe(401);
    expect(manifestReceiptStore.declare).not.toHaveBeenCalled();
  });

  it("declares with a valid credential", async () => {
    const manifestReceiptStore = fakeManifestStore();
    const service = createCombinedCutoverManifestTransferService({ manifestReceiptStore, artifactReceiptStore: fakeArtifactStore(), authConfig: authConfig() });
    const result = await service.declareManifest({ authorizationHeader: `Bearer ${SECRET}`, payload: { migrationOperationId: OPERATION_ID } });
    expect(result.status).toBe(201);
    expect(manifestReceiptStore.declare).toHaveBeenCalledOnce();
  });
});

describe("combined cutover manifest transfer service — completion cross-check", () => {
  it("completes when every declared artifact is independently verified and matches", async () => {
    const manifestReceiptStore = fakeManifestStore();
    const artifactReceiptStore = fakeArtifactStore({
      [deriveTransferPackageId("manifest.json")]: verifiedArtifact(files[0]),
      [deriveTransferPackageId("canonical-runtime.json")]: verifiedArtifact(files[1]),
    });
    const service = createCombinedCutoverManifestTransferService({ manifestReceiptStore, artifactReceiptStore, authConfig: authConfig() });
    const result = await service.completeManifest({ authorizationHeader: `Bearer ${SECRET}`, operationId: OPERATION_ID });
    expect(result.status).toBe(200);
    expect(result.body.status).toBe("verified");
    expect(manifestReceiptStore.verify).toHaveBeenCalledOnce();
    expect(manifestReceiptStore.verify.mock.calls[0][0].receipt).toMatchObject({ allObjectsVerified: true, fileCount: 2 });
  });

  it("does not trust a client-asserted verification result — never accepts a receipt payload from the request", async () => {
    const manifestReceiptStore = fakeManifestStore();
    const artifactReceiptStore = fakeArtifactStore({
      [deriveTransferPackageId("manifest.json")]: verifiedArtifact(files[0]),
      [deriveTransferPackageId("canonical-runtime.json")]: verifiedArtifact(files[1]),
    });
    const service = createCombinedCutoverManifestTransferService({ manifestReceiptStore, artifactReceiptStore, authConfig: authConfig() });
    // completeManifest's public method accepts no `receipt`/`allObjectsVerified` input at all - the
    // verify() call it makes is always self-computed from the artifact store, never client input.
    await service.completeManifest({ authorizationHeader: `Bearer ${SECRET}`, operationId: OPERATION_ID });
    const submitted = manifestReceiptStore.verify.mock.calls[0][0].receipt;
    expect(submitted.allObjectsVerified).toBe(true);
  });

  it("fails closed when an artifact has not yet been transferred (incomplete)", async () => {
    const manifestReceiptStore = fakeManifestStore();
    const artifactReceiptStore = fakeArtifactStore({
      [deriveTransferPackageId("manifest.json")]: verifiedArtifact(files[0]),
      // canonical-runtime.json artifact status intentionally missing.
    });
    const service = createCombinedCutoverManifestTransferService({ manifestReceiptStore, artifactReceiptStore, authConfig: authConfig() });
    const result = await service.completeManifest({ authorizationHeader: `Bearer ${SECRET}`, operationId: OPERATION_ID });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("TRANSFER_INCOMPLETE");
    expect(manifestReceiptStore.verify).not.toHaveBeenCalled();
  });

  it("fails closed when an artifact is transferred but does not match the declared manifest entry", async () => {
    const manifestReceiptStore = fakeManifestStore();
    const artifactReceiptStore = fakeArtifactStore({
      [deriveTransferPackageId("manifest.json")]: verifiedArtifact(files[0]),
      [deriveTransferPackageId("canonical-runtime.json")]: { receipt: { status: "verified", overallDigest: digest("z"), expectedBytes: files[1].byteLength } },
    });
    const service = createCombinedCutoverManifestTransferService({ manifestReceiptStore, artifactReceiptStore, authConfig: authConfig() });
    const result = await service.completeManifest({ authorizationHeader: `Bearer ${SECRET}`, operationId: OPERATION_ID });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("TRANSFER_PACKAGE_IDENTITY_MISMATCH");
    expect(manifestReceiptStore.verify).not.toHaveBeenCalled();
  });

  it("is idempotent when the manifest is already verified", async () => {
    const manifestReceiptStore = fakeManifestStore({ row: baseManifestRow({ status: "verified" }) });
    const artifactReceiptStore = fakeArtifactStore();
    const service = createCombinedCutoverManifestTransferService({ manifestReceiptStore, artifactReceiptStore, authConfig: authConfig() });
    const result = await service.completeManifest({ authorizationHeader: `Bearer ${SECRET}`, operationId: OPERATION_ID });
    expect(result.status).toBe(200);
    expect(result.body.outcome).toBe("idempotent-replay");
    expect(manifestReceiptStore.verify).not.toHaveBeenCalled();
  });
});

describe("combined cutover manifest transfer service — status isolation", () => {
  it("rejects status with no credential", async () => {
    const manifestReceiptStore = fakeManifestStore();
    const service = createCombinedCutoverManifestTransferService({ manifestReceiptStore, artifactReceiptStore: fakeArtifactStore(), authConfig: authConfig() });
    const result = await service.manifestStatus({ authorizationHeader: null, operationId: OPERATION_ID });
    expect(result.status).toBe(401);
  });

  it("rejects a credential bound to a different operation", async () => {
    const manifestReceiptStore = fakeManifestStore();
    const service = createCombinedCutoverManifestTransferService({ manifestReceiptStore, artifactReceiptStore: fakeArtifactStore(), authConfig: authConfig() });
    const result = await service.manifestStatus({ authorizationHeader: `Bearer ${SECRET}`, operationId: "combined-op-other" });
    expect(result.status).toBe(403);
    expect(manifestReceiptStore.read).not.toHaveBeenCalled();
  });
});
