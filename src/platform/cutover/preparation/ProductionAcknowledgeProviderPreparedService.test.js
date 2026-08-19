import { describe, expect, it, vi } from "vitest";
import { createProductionAcknowledgeProviderPreparedService } from "./ProductionAcknowledgeProviderPreparedService.js";
import { createPostgresCombinedCutoverPreparationStore } from "./PostgresCombinedCutoverPreparationStore.js";
import { createPostgresCombinedCutoverTransferReceiptStore } from "../transfer/PostgresCombinedCutoverTransferReceiptStore.js";
import { createInMemoryCombinedCutoverTransferStaging, sha256Of } from "../transfer/combinedCutoverTransferStaging.js";
import { deriveTransferPackageId } from "../transfer/combinedCutoverTransferContract.js";
import { createFakeCutoverTransferPool } from "../transfer/testSupport/fakeCutoverTransferPool.js";
import { createFakePreparationPool } from "./testSupport/fakePreparationPool.js";
import {
  createInitialCombinedRuntimeAuthorityState,
  applyCombinedRuntimeAuthorityTransition,
  RuntimeAuthorityAction,
} from "../CombinedRuntimeAuthorityState.js";

const digest = (character) => character.repeat(64);
const operationId = "combined-op-0001";
const authorizationFingerprint = digest("a");
const fenceId = "fence-1";
const packageDigest = digest("c");
const targetDatabase = "physiqueos_production";
const providerDeploymentId = "deployment-1";

function memoryAuthorityStore(initialState) {
  let state = initialState;
  return {
    async read() { return { state }; },
    async transition(command) { state = applyCombinedRuntimeAuthorityTransition(state, command); return { state, outcome: "committed" }; },
    __setState: (next) => { state = next; },
  };
}

function cutoverInProgressState() {
  const initial = createInitialCombinedRuntimeAuthorityState({ environment: "synthetic", windowsSource: { commit: "w".repeat(40), buildId: "windows-build" } });
  return applyCombinedRuntimeAuthorityTransition(initial, {
    action: RuntimeAuthorityAction.BEGIN_CUTOVER,
    expectedVersion: initial.version,
    migrationOperationId: operationId,
    authorizationFingerprint,
    fenceId,
    finalSnapshot: { runtimeSha256: digest("b"), runtimeRevision: 140, mediaInventorySha256: digest("e"), migrationControlSha256: digest("f"), packageDigest },
    providerSource: { commit: "p".repeat(40), buildId: "provider-build" },
    target: { databaseClusterId: "cluster", databaseName: targetDatabase, spacesBucket: "bucket" },
    routingTarget: "provider-ingress",
    reason: "test fixture",
  });
}

async function seedVerifiedTransferAndPreparation({ artifactReceiptStore, preparationStore, importStatus = "succeeded", mediaStatus = "succeeded", parityStatus = "passed" }) {
  const manifestBytes = Buffer.from("manifest");
  const decl = await artifactReceiptStore.declare({
    operationId, packageId: deriveTransferPackageId("manifest.json"), overallDigest: sha256Of(manifestBytes),
    expectedBytes: manifestBytes.length, expectedChunkCount: 1, chunkSizeBytes: manifestBytes.length,
  });
  await artifactReceiptStore.receiveChunk({ operationId, packageId: decl.receipt.packageId, chunkIndex: 0, chunkDigest: sha256Of(manifestBytes), bytes: manifestBytes });
  await artifactReceiptStore.completeAndVerify({ operationId, packageId: decl.receipt.packageId });

  await preparationStore.declare({ migrationOperationId: operationId, authorizationFingerprint, fenceId, packageDigest, targetDatabase });
  if (importStatus === "succeeded") await preparationStore.recordImportSucceeded({ migrationOperationId: operationId, expectedPackageDigest: packageDigest, collectionCounts: {}, importDigest: digest("d") });
  if (mediaStatus === "succeeded") await preparationStore.recordMediaSucceeded({ migrationOperationId: operationId, expectedPackageDigest: packageDigest, objectCount: 0, byteLength: 0 });
  if (parityStatus === "passed") await preparationStore.recordParityPassed({ migrationOperationId: operationId, expectedPackageDigest: packageDigest, readSurfaceCount: 11 });
}

function fakeManifestReceiptStore(files = [{ path: "manifest.json", byteLength: 8, sha256: sha256Of(Buffer.from("manifest")) }]) {
  return {
    read: vi.fn(async () => ({
      receipt: { migrationOperationId: operationId, authorizationFingerprint, fenceId, packageDigest, status: "verified", manifest: { packageDigest, files } },
    })),
  };
}

async function harness({ authorityState = cutoverInProgressState(), evidence = {} } = {}) {
  const staging = createInMemoryCombinedCutoverTransferStaging();
  const artifactReceiptStore = createPostgresCombinedCutoverTransferReceiptStore({ pool: createFakeCutoverTransferPool(), staging });
  const preparationStore = createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() });
  await seedVerifiedTransferAndPreparation({ artifactReceiptStore, preparationStore, ...evidence });
  const authorityStore = memoryAuthorityStore(authorityState);
  const manifestReceiptStore = fakeManifestReceiptStore();
  const service = createProductionAcknowledgeProviderPreparedService({ authorityStore, manifestReceiptStore, artifactReceiptStore, preparationStore, providerDeploymentId });
  return { service, authorityStore, preparationStore, manifestReceiptStore };
}

describe("ProductionAcknowledgeProviderPreparedService — construction", () => {
  it("requires every collaborator", () => {
    expect(() => createProductionAcknowledgeProviderPreparedService({})).toThrow();
  });
});

describe("ProductionAcknowledgeProviderPreparedService — eligibility gates", () => {
  it("rejects before import has succeeded", async () => {
    const { service } = await harness({ evidence: { importStatus: "pending" } });
    await expect(service.acknowledge({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toMatchObject({ code: "PREPARATION_ACKNOWLEDGE_NOT_ELIGIBLE" });
  });

  it("rejects before parity has passed", async () => {
    const { service } = await harness({ evidence: { parityStatus: "pending" } });
    await expect(service.acknowledge({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toMatchObject({ code: "PREPARATION_ACKNOWLEDGE_NOT_ELIGIBLE" });
  });

  it("rejects a request for the wrong operation ID", async () => {
    const { service } = await harness();
    await expect(service.acknowledge({ migrationOperationId: "combined-op-other", authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toThrow();
  });

  it("rejects when the current authority state is not combined-cutover-in-progress", async () => {
    const { service } = await harness({ authorityState: createInitialCombinedRuntimeAuthorityState({ environment: "synthetic", windowsSource: { commit: "w".repeat(40), buildId: "windows-build" } }) });
    await expect(service.acknowledge({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toMatchObject({ code: "PREPARATION_AUTHORITY_STATE_REJECTED" });
  });

  it("rejects if firstProviderCanonicalWriteAt is already set on the authority row", async () => {
    const providerState = { ...cutoverInProgressState(), authority: "provider-authoritative", publicRuntimeAuthority: "provider", migrationControlAuthority: "provider", workerAuthority: "provider", canonicalStoreEpoch: "postgres-canonical", compositionMode: "postgres", writesEnabled: true, firstProviderCanonicalWriteAt: "2026-08-18T00:00:00.000Z", firstProviderCommandId: "cmd-1" };
    const { service } = await harness({ authorityState: providerState });
    await expect(service.acknowledge({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest }))
      .rejects.toMatchObject({ code: "PREPARATION_AUTHORITY_STATE_REJECTED" });
  });
});

describe("ProductionAcknowledgeProviderPreparedService — success and idempotency", () => {
  it("succeeds once all evidence is present, returning the exact acknowledgement shape the orchestrator's authority transition expects", async () => {
    const { service } = await harness();
    const result = await service.acknowledge({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest });
    expect(result).toEqual({ migrationOperationId: operationId, authorizationFingerprint, fenceId, packageDigest, providerDeploymentId });
  });

  it("is idempotent on repeated acknowledgement of the same operation/digest", async () => {
    const { service, preparationStore } = await harness();
    await service.acknowledge({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest });
    const second = await service.acknowledge({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest });
    expect(second).toEqual({ migrationOperationId: operationId, authorizationFingerprint, fenceId, packageDigest, providerDeploymentId });
    const { receipt } = await preparationStore.read(operationId);
    expect(receipt.preparedStatus).toBe("acknowledged");
  });

  it("changes only the intended provider-prepared authority evidence: authority row itself is untouched by this module", async () => {
    const { service, authorityStore } = await harness();
    const before = (await authorityStore.read()).state;
    await service.acknowledge({ migrationOperationId: operationId, authorizationFingerprint, fenceId, expectedPackageDigest: packageDigest });
    const after = (await authorityStore.read()).state;
    expect(after).toBe(before);
    expect(after.authority).toBe("combined-cutover-in-progress");
    expect(after.firstProviderCanonicalWriteAt).toBeNull();
    expect(after.publicRuntimeAuthority).toBe("windows");
  });
});
