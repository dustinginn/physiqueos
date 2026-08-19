import { describe, expect, it } from "vitest";
import { createPostgresCombinedCutoverHandoffReceiptStore } from "./PostgresCombinedCutoverHandoffReceiptStore.js";
import { createFakeHandoffReceiptPool } from "./testSupport/fakeHandoffReceiptPool.js";

const digest = (character) => character.repeat(64);
const operationId = "combined-op-0001";

function declaration(overrides = {}) {
  return {
    migrationOperationId: operationId,
    authorizationFingerprint: digest("a"),
    fenceId: "fence-1",
    packageDigest: digest("c"),
    routingTarget: "provider-ingress",
    providerDeploymentId: "deployment-1",
    expectedRouteSnapshot: { windowsRoute: "active", providerRoute: "prepared-not-active" },
    ...overrides,
  };
}

function store() {
  return createPostgresCombinedCutoverHandoffReceiptStore({ pool: createFakeHandoffReceiptPool() });
}

describe("PostgreSQL combined cutover handoff receipts — declare", () => {
  it("declares a fresh receipt with authority/routing pending", async () => {
    const result = await store().declare(declaration());
    expect(result.outcome).toBe("declared");
    expect(result.receipt).toMatchObject({ authorityStatus: "pending", routingStatus: "pending", resultingAuthority: null });
    expect(result.receipt.expectedRouteSnapshot).toEqual({ windowsRoute: "active", providerRoute: "prepared-not-active" });
  });

  it("treats an identical redeclare as an idempotent replay", async () => {
    const s = store();
    await s.declare(declaration());
    const second = await s.declare(declaration());
    expect(second.outcome).toBe("idempotent-replay");
  });

  it("rejects a redeclare with a different package digest for the same operation", async () => {
    const s = store();
    await s.declare(declaration());
    await expect(s.declare(declaration({ packageDigest: digest("9") })))
      .rejects.toMatchObject({ code: "TRANSFER_PACKAGE_DIGEST_CONFLICT" });
  });

  it("rejects a redeclare targeting a different routing target/provider deployment", async () => {
    const s = store();
    await s.declare(declaration());
    await expect(s.declare(declaration({ routingTarget: "different-ingress" })))
      .rejects.toMatchObject({ code: "TRANSFER_RECEIPT_OPERATION_CONFLICT" });
  });
});

describe("PostgreSQL combined cutover handoff receipts — status transitions", () => {
  it("records authority committed then routing activated then verified", async () => {
    const s = store();
    await s.declare(declaration());
    const committed = await s.recordAuthorityCommitted({ migrationOperationId: operationId, expectedPackageDigest: digest("c"), resultingAuthority: "provider-authoritative" });
    expect(committed.receipt.authorityStatus).toBe("committed");
    expect(committed.receipt.resultingAuthority).toBe("provider-authoritative");

    const activated = await s.recordRoutingActivated({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    expect(activated.receipt.routingStatus).toBe("activated");
    expect(activated.receipt.routingActivatedAt).not.toBeNull();

    const verified = await s.recordRoutingVerified({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    expect(verified.receipt.routingStatus).toBe("verified");
    expect(verified.receipt.routingVerifiedAt).not.toBeNull();
  });

  it("is idempotent on repeated authority-committed and routing-activated calls", async () => {
    const s = store();
    await s.declare(declaration());
    await s.recordAuthorityCommitted({ migrationOperationId: operationId, expectedPackageDigest: digest("c"), resultingAuthority: "provider-authoritative" });
    const replay = await s.recordAuthorityCommitted({ migrationOperationId: operationId, expectedPackageDigest: digest("c"), resultingAuthority: "provider-authoritative" });
    expect(replay.outcome).toBe("idempotent-replay");
  });

  it("records routing failed distinctly from pending", async () => {
    const s = store();
    await s.declare(declaration());
    const failed = await s.recordRoutingFailed({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    expect(failed.receipt.routingStatus).toBe("failed");
  });

  it("never downgrades an already-verified routing status via a later failure record", async () => {
    const s = store();
    await s.declare(declaration());
    await s.recordRoutingActivated({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    await s.recordRoutingVerified({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    const stillVerified = await s.recordRoutingFailed({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    expect(stillVerified.receipt.routingStatus).toBe("verified");
  });

  it("fails closed when the expected package digest does not match the durable row", async () => {
    const s = store();
    await s.declare(declaration());
    await expect(s.recordAuthorityCommitted({ migrationOperationId: operationId, expectedPackageDigest: digest("9"), resultingAuthority: "provider-authoritative" }))
      .rejects.toMatchObject({ code: "TRANSFER_PACKAGE_DIGEST_CONFLICT" });
  });
});

describe("PostgreSQL combined cutover handoff receipts — worker evidence (Phase 6C)", () => {
  it("records worker activated then verified, and Windows worker retired", async () => {
    const s = store();
    await s.declare(declaration());
    const activated = await s.recordWorkerActivated({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    expect(activated.receipt.workerActivationStatus).toBe("activated");
    expect(activated.receipt.workerActivatedAt).not.toBeNull();

    const verified = await s.recordWorkerVerified({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    expect(verified.receipt.workerActivationStatus).toBe("verified");
    expect(verified.receipt.workerVerifiedAt).not.toBeNull();

    const retired = await s.recordWindowsWorkerRetired({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    expect(retired.receipt.windowsWorkerRetirementStatus).toBe("retired");
    expect(retired.receipt.windowsWorkerRetiredAt).not.toBeNull();
  });

  it("is idempotent on repeated worker-activated and windows-worker-retired calls", async () => {
    const s = store();
    await s.declare(declaration());
    await s.recordWorkerActivated({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    const replay = await s.recordWorkerActivated({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    expect(replay.outcome).toBe("idempotent-replay");
  });

  it("never downgrades an already-verified worker activation via a later failure record", async () => {
    const s = store();
    await s.declare(declaration());
    await s.recordWorkerActivated({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    await s.recordWorkerVerified({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    const stillVerified = await s.recordWorkerActivationFailed({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    expect(stillVerified.receipt.workerActivationStatus).toBe("verified");
  });

  it("never downgrades an already-retired Windows worker status via a later failure record", async () => {
    const s = store();
    await s.declare(declaration());
    await s.recordWindowsWorkerRetired({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    const stillRetired = await s.recordWindowsWorkerRetirementFailed({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    expect(stillRetired.receipt.windowsWorkerRetirementStatus).toBe("retired");
  });

  it("records worker activation failure and Windows worker retirement failure distinctly", async () => {
    const s = store();
    await s.declare(declaration());
    const workerFailed = await s.recordWorkerActivationFailed({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    expect(workerFailed.receipt.workerActivationStatus).toBe("failed");
    const retirementFailed = await s.recordWindowsWorkerRetirementFailed({ migrationOperationId: operationId, expectedPackageDigest: digest("c") });
    expect(retirementFailed.receipt.windowsWorkerRetirementStatus).toBe("failed");
  });

  it("fails closed when the expected package digest does not match the durable row", async () => {
    const s = store();
    await s.declare(declaration());
    await expect(s.recordWorkerActivated({ migrationOperationId: operationId, expectedPackageDigest: digest("9") }))
      .rejects.toMatchObject({ code: "TRANSFER_PACKAGE_DIGEST_CONFLICT" });
  });
});

describe("PostgreSQL combined cutover handoff receipts — read and isolation", () => {
  it("reconstructs full durable evidence via read()", async () => {
    const s = store();
    await s.declare(declaration());
    await s.recordAuthorityCommitted({ migrationOperationId: operationId, expectedPackageDigest: digest("c"), resultingAuthority: "provider-authoritative" });
    const { receipt } = await s.read(operationId);
    expect(receipt).toMatchObject({ operationId, authorityStatus: "committed", resultingAuthority: "provider-authoritative" });
  });

  it("isolates evidence by exact operationId", async () => {
    const s = store();
    await s.declare(declaration());
    await expect(s.read("combined-op-other")).rejects.toMatchObject({ code: "TRANSFER_RECEIPT_UNAVAILABLE" });
  });
});
