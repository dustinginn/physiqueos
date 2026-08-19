import { describe, expect, it, vi } from "vitest";
import { createProductionCanonicalImportService } from "./ProductionCanonicalImportService.js";
import { createPostgresCombinedCutoverPreparationStore } from "./PostgresCombinedCutoverPreparationStore.js";
import { createPostgresCombinedCutoverTransferReceiptStore } from "../transfer/PostgresCombinedCutoverTransferReceiptStore.js";
import { createInMemoryCombinedCutoverTransferStaging, sha256Of } from "../transfer/combinedCutoverTransferStaging.js";
import { deriveTransferPackageId } from "../transfer/combinedCutoverTransferContract.js";
import { createFakeCutoverTransferPool } from "../transfer/testSupport/fakeCutoverTransferPool.js";
import { createFakePreparationPool } from "./testSupport/fakePreparationPool.js";

const digest = (character) => character.repeat(64);
const operationId = "combined-op-0001";
const authorizationFingerprint = digest("a");
const fenceId = "fence-1";
const packageDigest = digest("c");
const targetDatabase = "physiqueos_production";

const manifestFileBytes = Buffer.from(JSON.stringify({ hello: "manifest" }));
const runtimeFileBytes = Buffer.from(JSON.stringify({ hello: "runtime" }));
const mediaFileBytes = Buffer.from("fake-photo-bytes");

function manifestFiles() {
  return [
    { path: "manifest.json", byteLength: manifestFileBytes.length, sha256: sha256Of(manifestFileBytes) },
    { path: "canonical-runtime.json", byteLength: runtimeFileBytes.length, sha256: sha256Of(runtimeFileBytes) },
    { path: "media/evidence/photo1.jpg", byteLength: mediaFileBytes.length, sha256: sha256Of(mediaFileBytes) },
  ];
}

function fakeManifestReceiptStore({ status = "verified", files = manifestFiles(), overrides = {} } = {}) {
  const receipt = {
    migrationOperationId: operationId, authorizationFingerprint, fenceId, packageDigest,
    status, manifest: { packageDigest, files }, ...overrides,
  };
  return { read: vi.fn(async () => ({ receipt })) };
}

async function seedVerifiedArtifacts(artifactReceiptStore) {
  const files = [
    { relativePath: "manifest.json", bytes: manifestFileBytes },
    { relativePath: "canonical-runtime.json", bytes: runtimeFileBytes },
    { relativePath: "media/evidence/photo1.jpg", bytes: mediaFileBytes },
  ];
  for (const file of files) {
    const decl = await artifactReceiptStore.declare({
      operationId, packageId: deriveTransferPackageId(file.relativePath), overallDigest: sha256Of(file.bytes),
      expectedBytes: file.bytes.length, expectedChunkCount: 1, chunkSizeBytes: file.bytes.length,
    });
    await artifactReceiptStore.receiveChunk({
      operationId, packageId: decl.receipt.packageId, chunkIndex: 0, chunkDigest: sha256Of(file.bytes), bytes: file.bytes,
    });
    await artifactReceiptStore.completeAndVerify({ operationId, packageId: decl.receipt.packageId });
  }
}

function harness({ manifestStatus = "verified", seedArtifacts = true, importCanonicalPackageFn, migrateCanonicalPackageMediaToSpacesFn } = {}) {
  const staging = createInMemoryCombinedCutoverTransferStaging();
  const artifactReceiptStore = createPostgresCombinedCutoverTransferReceiptStore({ pool: createFakeCutoverTransferPool(), staging });
  const preparationStore = createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() });
  const manifestReceiptStore = fakeManifestReceiptStore({ status: manifestStatus });
  const service = createProductionCanonicalImportService({
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => undefined }), query: async () => ({ rows: [] }) },
    objectProvider: { beginMultipartUpload: async () => ({}) },
    manifestReceiptStore, artifactReceiptStore, preparationStore, targetDatabase,
    importCanonicalPackageFn: importCanonicalPackageFn ?? defaultFakeImport(),
    migrateCanonicalPackageMediaToSpacesFn: migrateCanonicalPackageMediaToSpacesFn ?? defaultFakeMedia(),
  });
  return { service, artifactReceiptStore, preparationStore, manifestReceiptStore, staging };
}

function defaultFakeImport(overrides = {}) {
  return vi.fn(async () => ({
    ownerUserId: "founder", collectionCounts: { goals: 2, weightEntries: 1 }, importDigest: digest("7"), ...overrides,
  }));
}
function defaultFakeMedia(overrides = {}) {
  return vi.fn(async () => ({ objectCount: 1, byteLength: mediaFileBytes.length, uploaded: [], ...overrides }));
}

describe("ProductionCanonicalImportService — construction", () => {
  it("requires every collaborator", () => {
    expect(() => createProductionCanonicalImportService({})).toThrow();
  });
});

describe("ProductionCanonicalImportService — pre-import verification", () => {
  it("rejects when no transfer has been declared for the operation", async () => {
    const staging = createInMemoryCombinedCutoverTransferStaging();
    const artifactReceiptStore = createPostgresCombinedCutoverTransferReceiptStore({ pool: createFakeCutoverTransferPool(), staging });
    const preparationStore = createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() });
    const manifestReceiptStore = { read: vi.fn(async () => { throw Object.assign(new Error("no receipt"), { code: "TRANSFER_RECEIPT_UNAVAILABLE" }); }) };
    const missingTransferService = createProductionCanonicalImportService({
      pool: { connect: async () => ({ query: async () => ({ rows: [] }) }), query: async () => ({ rows: [] }) },
      objectProvider: { beginMultipartUpload: async () => ({}) },
      manifestReceiptStore, artifactReceiptStore, preparationStore, targetDatabase,
      importCanonicalPackageFn: defaultFakeImport(), migrateCanonicalPackageMediaToSpacesFn: defaultFakeMedia(),
    });
    await expect(missingTransferService.import({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toMatchObject({ code: "PREPARATION_TRANSFER_NOT_VERIFIED" });
  });

  it("rejects an incomplete (not yet verified) transfer", async () => {
    const { service } = harness({ manifestStatus: "declared" });
    await expect(service.import({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toMatchObject({ code: "PREPARATION_TRANSFER_NOT_VERIFIED" });
  });

  it("rejects an operation-identity mismatch (wrong authorizationFingerprint)", async () => {
    const { service } = harness();
    await expect(service.import({ migrationOperationId: operationId, authorizationFingerprint: digest("9"), fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toMatchObject({ code: "TRANSFER_OPERATION_FORBIDDEN" });
  });

  it("rejects a package-digest mismatch against the verified transfer", async () => {
    const { service } = harness();
    await expect(service.import({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: digest("9") }))
      .rejects.toMatchObject({ code: "TRANSFER_PACKAGE_DIGEST_CONFLICT" });
  });

  it("rejects when a declared artifact has never been transferred (missing artifact)", async () => {
    // No artifacts are seeded via seedVerifiedArtifacts here, so every declared manifest file is
    // missing its byte-level transfer receipt.
    const { service } = harness();
    await expect(service.import({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toMatchObject({ code: "TRANSFER_INCOMPLETE" });
  });

  it("rejects when a transferred artifact's digest does not match the declared manifest entry", async () => {
    const { service, artifactReceiptStore } = harness();
    await seedVerifiedArtifacts(artifactReceiptStore);
    const wrongFiles = manifestFiles();
    wrongFiles[0] = { ...wrongFiles[0], sha256: digest("0") };
    const manifestReceiptStore = fakeManifestReceiptStore({ files: wrongFiles });
    const mismatchService = createProductionCanonicalImportService({
      pool: { connect: async () => ({ query: async () => ({ rows: [] }) }), query: async () => ({ rows: [] }) },
      objectProvider: { beginMultipartUpload: async () => ({}) },
      manifestReceiptStore, artifactReceiptStore,
      preparationStore: createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() }),
      targetDatabase, importCanonicalPackageFn: defaultFakeImport(), migrateCanonicalPackageMediaToSpacesFn: defaultFakeMedia(),
    });
    await expect(mismatchService.import({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toMatchObject({ code: "TRANSFER_PACKAGE_IDENTITY_MISMATCH" });
  });
});

describe("ProductionCanonicalImportService — successful import and idempotency", () => {
  it("imports successfully, recording matching collection counts and media inventory", async () => {
    const { service, artifactReceiptStore, preparationStore } = harness();
    await seedVerifiedArtifacts(artifactReceiptStore);
    const result = await service.import({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest });
    expect(result.ready).toBe(true);
    expect(result.outcome).toBe("imported");
    expect(result.collectionCounts).toEqual({ goals: 2, weightEntries: 1 });
    expect(result.records).toBe(3);
    expect(result.mediaObjectCount).toBe(1);
    const { receipt } = await preparationStore.read(operationId);
    expect(receipt.importStatus).toBe("succeeded");
    expect(receipt.mediaStatus).toBe("succeeded");
  });

  it("is idempotent on an identical replay: does not re-invoke the underlying import/media functions", async () => {
    const importFn = defaultFakeImport();
    const mediaFn = defaultFakeMedia();
    const { service, artifactReceiptStore } = harness({ importCanonicalPackageFn: importFn, migrateCanonicalPackageMediaToSpacesFn: mediaFn });
    await seedVerifiedArtifacts(artifactReceiptStore);
    await service.import({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest });
    const replay = await service.import({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest });
    expect(replay.outcome).toBe("idempotent-replay");
    expect(importFn).toHaveBeenCalledTimes(1);
    expect(mediaFn).toHaveBeenCalledTimes(1);
  });

  it("fails closed on a conflicting replay (same operation, different package digest)", async () => {
    const { artifactReceiptStore, preparationStore, manifestReceiptStore } = harness();
    await seedVerifiedArtifacts(artifactReceiptStore);
    const service = createProductionCanonicalImportService({
      pool: { connect: async () => ({ query: async () => ({ rows: [] }) }), query: async () => ({ rows: [] }) },
      objectProvider: { beginMultipartUpload: async () => ({}) },
      manifestReceiptStore, artifactReceiptStore, preparationStore, targetDatabase,
      importCanonicalPackageFn: defaultFakeImport(), migrateCanonicalPackageMediaToSpacesFn: defaultFakeMedia(),
    });
    await service.import({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest });
    // A different manifest receipt claiming the same operation but a different package digest.
    const conflictingManifestStore = fakeManifestReceiptStore({ overrides: { packageDigest: digest("5") } });
    conflictingManifestStore.read = vi.fn(async () => ({
      receipt: { migrationOperationId: operationId, authorizationFingerprint, fenceId, packageDigest: digest("5"), status: "verified", manifest: { packageDigest: digest("5"), files: manifestFiles() } },
    }));
    const conflictingService = createProductionCanonicalImportService({
      pool: { connect: async () => ({ query: async () => ({ rows: [] }) }), query: async () => ({ rows: [] }) },
      objectProvider: { beginMultipartUpload: async () => ({}) },
      manifestReceiptStore: conflictingManifestStore, artifactReceiptStore, preparationStore, targetDatabase,
      importCanonicalPackageFn: defaultFakeImport(), migrateCanonicalPackageMediaToSpacesFn: defaultFakeMedia(),
    });
    await expect(conflictingService.import({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: digest("5") }))
      .rejects.toMatchObject({ code: "TRANSFER_PACKAGE_DIGEST_CONFLICT" });
  });

  it("records import failure evidence and rethrows when the reused import machinery fails", async () => {
    const failingImport = vi.fn(async () => { throw new Error("simulated import failure"); });
    const { service, artifactReceiptStore, preparationStore } = harness({ importCanonicalPackageFn: failingImport });
    await seedVerifiedArtifacts(artifactReceiptStore);
    await expect(service.import({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toMatchObject({ code: "PREPARATION_IMPORT_FAILED" });
    const { receipt } = await preparationStore.read(operationId);
    expect(receipt.importStatus).toBe("failed");
  });
});
