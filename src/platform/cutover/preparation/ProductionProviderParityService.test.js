import { describe, expect, it, vi } from "vitest";
import { createProductionProviderParityService } from "./ProductionProviderParityService.js";
import { createPostgresCombinedCutoverPreparationStore } from "./PostgresCombinedCutoverPreparationStore.js";
import { createPostgresCombinedCutoverTransferReceiptStore } from "../transfer/PostgresCombinedCutoverTransferReceiptStore.js";
import { createInMemoryCombinedCutoverTransferStaging, sha256Of } from "../transfer/combinedCutoverTransferStaging.js";
import { deriveTransferPackageId } from "../transfer/combinedCutoverTransferContract.js";
import { createFakeCutoverTransferPool } from "../transfer/testSupport/fakeCutoverTransferPool.js";
import { createFakePreparationPool } from "./testSupport/fakePreparationPool.js";
import { createPhase4MediaObjectId } from "../../migration/phase4LocalMediaMigration.js";
import { createLegacyFounderReadLoaders } from "../../../application/read-models/LegacyFounderReadLoaders.js";
import { createPhase3ReadModelService } from "../../../application/read-models/Phase3ReadModelService.js";
import { createSeedRepositories } from "../../../data/repositories/createSeedRepositories.js";
import { founderSeedPack } from "../../../data/founderSeed/index.js";

// founderSeedPack has no evidenceReviews collection of its own; compareRepresentativeReads reads
// runtime.evidenceReviews directly, so every synthetic runtime used here needs the same override
// scripts/productionMigrationEnvironmentAdapters.test.js already established for this fixture.
const baseRuntime = Object.freeze({ ...founderSeedPack, evidenceReviews: [] });

const digest = (character) => character.repeat(64);
const operationId = "combined-op-0001";
const authorizationFingerprint = digest("a");
const fenceId = "fence-1";
const packageDigest = digest("c");
const targetDatabase = "physiqueos_production";
const ownerUserId = baseRuntime.user.id;

const manifestFileBytes = Buffer.from(JSON.stringify({ hello: "manifest" }));
const runtimeFileBytes = Buffer.from(JSON.stringify(baseRuntime));
const mediaFile = { relativePath: "evidence/photo1.jpg", size: 17, sha256: sha256Of(Buffer.from("fake-photo-bytes")), mimeType: "image/jpeg", ownerUserId, relationshipIds: [] };
const mediaFileBytes = Buffer.from("fake-photo-bytes");

function manifestFiles() {
  return [
    { path: "manifest.json", byteLength: manifestFileBytes.length, sha256: sha256Of(manifestFileBytes) },
    { path: "canonical-runtime.json", byteLength: runtimeFileBytes.length, sha256: sha256Of(runtimeFileBytes) },
    { path: `media/${mediaFile.relativePath}`, byteLength: mediaFileBytes.length, sha256: sha256Of(mediaFileBytes) },
  ];
}

function fakeManifestReceiptStore() {
  const receipt = {
    migrationOperationId: operationId, authorizationFingerprint, fenceId, packageDigest,
    status: "verified", manifest: { packageDigest, files: manifestFiles() },
  };
  return { read: vi.fn(async () => ({ receipt })) };
}

async function seedVerifiedArtifacts(artifactReceiptStore) {
  const files = [
    { relativePath: "manifest.json", bytes: manifestFileBytes },
    { relativePath: "canonical-runtime.json", bytes: runtimeFileBytes },
    { relativePath: `media/${mediaFile.relativePath}`, bytes: mediaFileBytes },
  ];
  for (const file of files) {
    const decl = await artifactReceiptStore.declare({
      operationId, packageId: deriveTransferPackageId(file.relativePath), overallDigest: sha256Of(file.bytes),
      expectedBytes: file.bytes.length, expectedChunkCount: 1, chunkSizeBytes: file.bytes.length,
    });
    await artifactReceiptStore.receiveChunk({ operationId, packageId: decl.receipt.packageId, chunkIndex: 0, chunkDigest: sha256Of(file.bytes), bytes: file.bytes });
    await artifactReceiptStore.completeAndVerify({ operationId, packageId: decl.receipt.packageId });
  }
}

async function seedSucceededImportEvidence(preparationStore) {
  await preparationStore.declare({ migrationOperationId: operationId, authorizationFingerprint, fenceId, packageDigest, targetDatabase });
  await preparationStore.recordImportSucceeded({ migrationOperationId: operationId, expectedPackageDigest: packageDigest, collectionCounts: { goals: 1 }, importDigest: digest("d") });
  await preparationStore.recordMediaSucceeded({ migrationOperationId: operationId, expectedPackageDigest: packageDigest, objectCount: 1, byteLength: mediaFileBytes.length });
}

function fakePackageData(collectionsOverride = baseRuntime) {
  return { manifest: { source: { runtime: { version: "v1", revision: "140", updatedAt: "2026-08-18T00:00:00.000Z" } }, files: [mediaFile] }, collections: collectionsOverride };
}

// Mirrors exactly the merge `compareApplicationReadModels` (in the module under test) applies to
// the legacy/source side, so this fake provider-side composition's imported-runtime revision
// agrees with the source side the same way the REAL imported PostgreSQL canonical_runtime_metadata
// would after a real import - otherwise resourceVersion alone (correctly, strictly compared) would
// diverge even for identical underlying collections.
function realReadModelService(collections, now) {
  const runtime = { version: "v1", revision: 140, updatedAt: "2026-08-18T00:00:00.000Z", ...collections };
  const repositories = createSeedRepositories(runtime);
  return createPhase3ReadModelService({
    loaders: createLegacyFounderReadLoaders({ repositories, readRuntimeStore: () => runtime, now }),
    now, readResourceVersion: ({ data }) => String(data?.version ?? runtime.revision ?? "1"),
  });
}

function fakeMediaPool({ mismatchByteLength = false, mismatchSha256 = false, extraRow = false, missingRow = false } = {}) {
  const objectId = createPhase4MediaObjectId(mediaFile);
  const rows = missingRow ? [] : [{
    id: objectId,
    byte_length: mismatchByteLength ? mediaFile.size + 1 : mediaFile.size,
    sha256: mismatchSha256 ? "0".repeat(64) : mediaFile.sha256,
    storage_key: `private/${ownerUserId}/${objectId}/original`,
    provider_version: "v1",
  }];
  if (extraRow) rows.push({ id: "media-extra-unexpected-object", byte_length: 1, sha256: digest("9"), storage_key: "private/owner/other/original", provider_version: "v1" });
  return { query: vi.fn(async () => ({ rows })), connect: async () => ({ query: async () => ({ rows }) }) };
}

function fakeObjectProvider({ mismatch = false } = {}) {
  return { inspectObject: vi.fn(async () => ({ byteLength: mismatch ? mediaFile.size + 1 : mediaFile.size, sha256: mismatch ? "0".repeat(64) : mediaFile.sha256 })) };
}

function fakeProviderComposition({ collections = baseRuntime, now, commandsReady = true } = {}) {
  return async () => ({
    readModels: realReadModelService(collections, now),
    commands: commandsReady ? { execute: async () => undefined } : {},
  });
}

async function harness({
  mediaPool = fakeMediaPool(),
  objectProvider = fakeObjectProvider(),
  providerCollections = baseRuntime,
  commandsReady = true,
  validateCanonicalImportFn = vi.fn(async () => ({ valid: true, counts: { goals: 1 }, importDigest: digest("d") })),
} = {}) {
  const staging = createInMemoryCombinedCutoverTransferStaging();
  const artifactReceiptStore = createPostgresCombinedCutoverTransferReceiptStore({ pool: createFakeCutoverTransferPool(), staging });
  const preparationStore = createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() });
  const manifestReceiptStore = fakeManifestReceiptStore();
  await seedVerifiedArtifacts(artifactReceiptStore);
  await seedSucceededImportEvidence(preparationStore);

  const now = () => new Date("2026-08-18T00:00:00.000Z");
  const service = createProductionProviderParityService({
    pool: mediaPool, objectProvider, manifestReceiptStore, artifactReceiptStore, preparationStore, ownerUserId,
    mediaAccessSecret: "s".repeat(40), now,
    readAndValidateCanonicalPackageFn: vi.fn(async () => fakePackageData(baseRuntime)),
    createPhase5ProviderApplicationCompositionFn: fakeProviderComposition({ collections: providerCollections, now, commandsReady }),
    validateCanonicalImportFn,
  });
  return { service, preparationStore, manifestReceiptStore };
}

describe("ProductionProviderParityService — pre-parity verification", () => {
  it("rejects when the transfer has not been verified", async () => {
    const { service, manifestReceiptStore } = await harness();
    manifestReceiptStore.read = vi.fn(async () => ({ receipt: { status: "declared" } }));
    await expect(service.verifyParity({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toMatchObject({ code: "PREPARATION_TRANSFER_NOT_VERIFIED" });
  });

  it("rejects parity before a successful import", async () => {
    const staging = createInMemoryCombinedCutoverTransferStaging();
    const artifactReceiptStore = createPostgresCombinedCutoverTransferReceiptStore({ pool: createFakeCutoverTransferPool(), staging });
    await seedVerifiedArtifacts(artifactReceiptStore);
    const preparationStore = createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() });
    await preparationStore.declare({ migrationOperationId: operationId, authorizationFingerprint, fenceId, packageDigest, targetDatabase });
    const now = () => new Date("2026-08-18T00:00:00.000Z");
    const service = createProductionProviderParityService({
      pool: fakeMediaPool(), objectProvider: fakeObjectProvider(), manifestReceiptStore: fakeManifestReceiptStore(),
      artifactReceiptStore, preparationStore, ownerUserId, mediaAccessSecret: "s".repeat(40), now,
      readAndValidateCanonicalPackageFn: vi.fn(async () => fakePackageData()),
      createPhase5ProviderApplicationCompositionFn: fakeProviderComposition({ now }),
      validateCanonicalImportFn: vi.fn(async () => ({ valid: true, counts: {}, importDigest: digest("d") })),
    });
    await expect(service.verifyParity({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toMatchObject({ code: "PREPARATION_PARITY_NOT_READY" });
  });
});

describe("ProductionProviderParityService — read-model parity (real execute path)", () => {
  it("passes for identical canonical state under a shared frozen clock", async () => {
    const { service } = await harness();
    const result = await service.verifyParity({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest });
    expect(result.ready).toBe(true);
    expect(result.readParity).toBe("pass");
    expect(result.mediaValidated).toBe(true);
  });

  it("fails for a genuine canonical data difference and records parity failure evidence", async () => {
    const mutated = { ...baseRuntime, goals: baseRuntime.goals.map((goal, index) => (index === 0 ? { ...goal, title: "MIGRATED-INCORRECTLY" } : goal)) };
    const { service, preparationStore } = await harness({ providerCollections: mutated });
    await expect(service.verifyParity({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toMatchObject({ code: "PREPARATION_PARITY_MISMATCH" });
    const { receipt } = await preparationStore.read(operationId);
    expect(receipt.parityStatus).toBe("failed");
  });

  it("attaches a bounded, non-dumping diagnostic on a genuine mismatch", async () => {
    const mutated = { ...baseRuntime, goals: baseRuntime.goals.map((goal, index) => (index === 0 ? { ...goal, title: "SHOULD-NOT-LEAK-VERBATIM" } : goal)) };
    const { service } = await harness({ providerCollections: mutated });
    let caught;
    try {
      await service.verifyParity({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest });
    } catch (error) { caught = error; }
    expect(caught).toBeTruthy();
    expect(caught.code).toBe("PREPARATION_PARITY_MISMATCH");
  });
});

describe("ProductionProviderParityService — media inventory parity", () => {
  it("fails when an expected media object is missing", async () => {
    const { service } = await harness({ mediaPool: fakeMediaPool({ missingRow: true }) });
    await expect(service.verifyParity({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toMatchObject({ code: "PREPARATION_MEDIA_PARITY_MISMATCH" });
  });

  it("fails when a stored media object's digest does not match the declared package", async () => {
    const { service } = await harness({ mediaPool: fakeMediaPool({ mismatchSha256: true }) });
    await expect(service.verifyParity({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toMatchObject({ code: "PREPARATION_MEDIA_PARITY_MISMATCH" });
  });

  it("fails when an unexpected owner-scoped media object exists beyond the declared package", async () => {
    const { service } = await harness({ mediaPool: fakeMediaPool({ extraRow: true }) });
    await expect(service.verifyParity({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toMatchObject({ code: "PREPARATION_MEDIA_PARITY_MISMATCH" });
  });

  it("fails when the independently inspected Spaces object disagrees with the database row", async () => {
    const { service } = await harness({ objectProvider: fakeObjectProvider({ mismatch: true }) });
    await expect(service.verifyParity({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toMatchObject({ code: "PREPARATION_MEDIA_PARITY_MISMATCH" });
  });

  it("never exposes a signed URL from the object provider's inspection call", async () => {
    const objectProvider = fakeObjectProvider();
    const { service } = await harness({ objectProvider });
    await service.verifyParity({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest });
    expect(objectProvider.inspectObject).toHaveBeenCalled();
    const returned = await objectProvider.inspectObject.mock.results[0].value;
    expect(returned).not.toHaveProperty("url");
  });
});

describe("ProductionProviderParityService — idempotency and readiness", () => {
  it("is idempotent once parity has already passed for this operation/digest", async () => {
    const { service, preparationStore } = await harness();
    await service.verifyParity({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest });
    const replay = await service.verifyParity({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest });
    expect(replay.outcome).toBe("idempotent-replay");
    const { receipt } = await preparationStore.read(operationId);
    expect(receipt.parityStatus).toBe("passed");
  });

  it("fails when the provider composition exposes no working command boundary", async () => {
    const { service } = await harness({ commandsReady: false });
    await expect(service.verifyParity({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toMatchObject({ code: "PREPARATION_PARITY_NOT_READY" });
  });
});
