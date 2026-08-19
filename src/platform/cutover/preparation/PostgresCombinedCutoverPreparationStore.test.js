import { describe, expect, it } from "vitest";
import { createPostgresCombinedCutoverPreparationStore } from "./PostgresCombinedCutoverPreparationStore.js";
import { createFakePreparationPool } from "./testSupport/fakePreparationPool.js";

const digest = (character) => character.repeat(64);
const operationId = "combined-op-0001";

function declaration(overrides = {}) {
  return {
    migrationOperationId: operationId,
    authorizationFingerprint: digest("a"),
    fenceId: "fence-1",
    packageDigest: digest("c"),
    targetDatabase: "physiqueos_production",
    ...overrides,
  };
}

describe("PostgreSQL combined cutover preparation evidence — declare", () => {
  it("declares a fresh receipt with every phase pending", async () => {
    const store = createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() });
    const result = await store.declare(declaration());
    expect(result.outcome).toBe("declared");
    expect(result.receipt).toMatchObject({ importStatus: "pending", mediaStatus: "pending", parityStatus: "pending", preparedStatus: "pending" });
  });

  it("treats an identical redeclare as an idempotent replay", async () => {
    const store = createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() });
    await store.declare(declaration());
    const second = await store.declare(declaration());
    expect(second.outcome).toBe("idempotent-replay");
  });

  it("rejects a redeclare with a different package digest for the same operation", async () => {
    const store = createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() });
    await store.declare(declaration());
    await expect(store.declare(declaration({ packageDigest: digest("9") })))
      .rejects.toMatchObject({ code: "TRANSFER_PACKAGE_DIGEST_CONFLICT" });
  });

  it("rejects a redeclare with a different authorization/fence identity", async () => {
    const store = createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() });
    await store.declare(declaration());
    await expect(store.declare(declaration({ fenceId: "fence-other" })))
      .rejects.toMatchObject({ code: "TRANSFER_RECEIPT_OPERATION_CONFLICT" });
  });
});

describe("PostgreSQL combined cutover preparation evidence — phase transitions", () => {
  it("records import start then success, requiring a matching package digest", async () => {
    const store = createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() });
    await store.declare(declaration());
    await store.recordImportStarted({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    const succeeded = await store.recordImportSucceeded({
      migrationOperationId: operationId, expectedPackageDigest: digest("c"),
      collectionCounts: { goals: 3 }, importDigest: digest("d"),
    });
    expect(succeeded.receipt.importStatus).toBe("succeeded");
    expect(succeeded.receipt.importedCollectionCounts).toEqual({ goals: 3 });
  });

  it("fails closed when the expected package digest does not match the durable row", async () => {
    const store = createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() });
    await store.declare(declaration());
    await expect(store.recordImportStarted({ migrationOperationId: operationId, expectedPackageDigest: digest("9") }))
      .rejects.toMatchObject({ code: "TRANSFER_PACKAGE_DIGEST_CONFLICT" });
  });

  it("refuses prepared acknowledgement before import/media/parity all succeed", async () => {
    const store = createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() });
    await store.declare(declaration());
    await expect(store.recordPreparedAcknowledged({ migrationOperationId: operationId, expectedPackageDigest: digest("c"), providerDeploymentId: "deployment-1" }))
      .rejects.toMatchObject({ code: "TRANSFER_INCOMPLETE" });
  });

  it("acknowledges prepared once import, media, and parity all succeed, and is idempotent on replay", async () => {
    const store = createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() });
    await store.declare(declaration());
    await store.recordImportSucceeded({ migrationOperationId: operationId, expectedPackageDigest: digest("c"), collectionCounts: {}, importDigest: digest("d") });
    await store.recordMediaSucceeded({ migrationOperationId: operationId, expectedPackageDigest: digest("c"), objectCount: 2, byteLength: 24 });
    await store.recordParityPassed({ migrationOperationId: operationId, expectedPackageDigest: digest("c"), readSurfaceCount: 11 });
    const first = await store.recordPreparedAcknowledged({ migrationOperationId: operationId, expectedPackageDigest: digest("c"), providerDeploymentId: "deployment-1" });
    expect(first.receipt.preparedStatus).toBe("acknowledged");
    const replay = await store.recordPreparedAcknowledged({ migrationOperationId: operationId, expectedPackageDigest: digest("c"), providerDeploymentId: "deployment-1" });
    expect(replay.outcome).toBe("idempotent-replay");
  });

  it("reconstructs full durable evidence via read() after every phase", async () => {
    const store = createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() });
    await store.declare(declaration());
    await store.recordImportSucceeded({ migrationOperationId: operationId, expectedPackageDigest: digest("c"), collectionCounts: { goals: 1 }, importDigest: digest("d") });
    await store.recordMediaSucceeded({ migrationOperationId: operationId, expectedPackageDigest: digest("c"), objectCount: 1, byteLength: 10 });
    await store.recordParityPassed({ migrationOperationId: operationId, expectedPackageDigest: digest("c"), readSurfaceCount: 11 });
    await store.recordPreparedAcknowledged({ migrationOperationId: operationId, expectedPackageDigest: digest("c"), providerDeploymentId: "deployment-1" });
    const { receipt } = await store.read(operationId);
    expect(receipt).toMatchObject({
      importStatus: "succeeded", mediaStatus: "succeeded", parityStatus: "passed", preparedStatus: "acknowledged",
      providerDeploymentId: "deployment-1",
    });
  });

  it("isolates evidence by exact operationId: an unrelated operation cannot be read", async () => {
    const store = createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() });
    await store.declare(declaration());
    await expect(store.read("combined-op-other")).rejects.toMatchObject({ code: "TRANSFER_RECEIPT_UNAVAILABLE" });
  });
});
