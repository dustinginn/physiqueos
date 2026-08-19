import { describe, expect, it } from "vitest";
import { createProductionWorkerHandoffService } from "./ProductionWorkerHandoffService.js";
import { createPostgresCombinedCutoverHandoffReceiptStore } from "../handoff/PostgresCombinedCutoverHandoffReceiptStore.js";
import { createFakeHandoffReceiptPool } from "../handoff/testSupport/fakeHandoffReceiptPool.js";
import { createDeterministicCombinedCutoverWorkerControl } from "./testSupport/deterministicWorkerControl.js";
import { createUnavailableWorkerControl, WorkerState } from "./combinedCutoverWorkerControl.js";
import { RuntimeAuthority } from "../CombinedRuntimeAuthorityState.js";
import {
  memoryAuthorityStore, windowsLegacyState, providerPreparedState, providerAuthoritativeState, firstWriteBoundaryState,
  OPERATION_ID, AUTHORIZATION_FINGERPRINT, FENCE_ID, PACKAGE_DIGEST, PROVIDER_DEPLOYMENT_ID, ROUTING_TARGET,
} from "../recovery/testSupport/recoveryFixtures.js";

function input(overrides = {}) {
  return { migrationOperationId: OPERATION_ID, ...overrides };
}

async function declaredReceiptStore({ workerActivationStatus = null, windowsWorkerRetirementStatus = null } = {}) {
  const store = createPostgresCombinedCutoverHandoffReceiptStore({ pool: createFakeHandoffReceiptPool() });
  await store.declare({
    migrationOperationId: OPERATION_ID, authorizationFingerprint: AUTHORIZATION_FINGERPRINT, fenceId: FENCE_ID,
    packageDigest: PACKAGE_DIGEST, routingTarget: ROUTING_TARGET, providerDeploymentId: PROVIDER_DEPLOYMENT_ID,
  });
  await store.recordAuthorityCommitted({ migrationOperationId: OPERATION_ID, expectedPackageDigest: PACKAGE_DIGEST, resultingAuthority: RuntimeAuthority.PROVIDER });
  await store.recordRoutingActivated({ migrationOperationId: OPERATION_ID, expectedPackageDigest: PACKAGE_DIGEST });
  await store.recordRoutingVerified({ migrationOperationId: OPERATION_ID, expectedPackageDigest: PACKAGE_DIGEST });
  if (workerActivationStatus === "activated" || workerActivationStatus === "verified") {
    await store.recordWorkerActivated({ migrationOperationId: OPERATION_ID, expectedPackageDigest: PACKAGE_DIGEST });
  }
  if (workerActivationStatus === "verified") {
    await store.recordWorkerVerified({ migrationOperationId: OPERATION_ID, expectedPackageDigest: PACKAGE_DIGEST });
  }
  if (windowsWorkerRetirementStatus === "retired") {
    await store.recordWindowsWorkerRetired({ migrationOperationId: OPERATION_ID, expectedPackageDigest: PACKAGE_DIGEST });
  }
  return store;
}

function harness({ authorityState = firstWriteBoundaryState(), workerControl = createDeterministicCombinedCutoverWorkerControl(), receiptStoreOptions = {} } = {}) {
  const authorityStore = memoryAuthorityStore(authorityState);
  return { authorityStore, workerControl, receiptStorePromise: declaredReceiptStore(receiptStoreOptions) };
}

describe("ProductionWorkerHandoffService — construction", () => {
  it("requires every collaborator", () => {
    expect(() => createProductionWorkerHandoffService({})).toThrow();
  });
});

describe("ProductionWorkerHandoffService — authority preconditions", () => {
  it("rejects activation before provider authority transfer (windows-legacy)", async () => {
    const authorityStore = memoryAuthorityStore(windowsLegacyState());
    const service = createProductionWorkerHandoffService({ authorityStore, handoffReceiptStore: await declaredReceiptStore(), workerControl: createDeterministicCombinedCutoverWorkerControl() });
    await expect(service.activateProviderWorkersAndRetireWindows({ input: input() })).rejects.toMatchObject({ code: "WORKER_HANDOFF_AUTHORITY_STATE_REJECTED" });
  });

  it("rejects activation while only provider-prepared (authority transfer not yet complete)", async () => {
    const authorityStore = memoryAuthorityStore(providerPreparedState());
    const service = createProductionWorkerHandoffService({ authorityStore, handoffReceiptStore: await declaredReceiptStore(), workerControl: createDeterministicCombinedCutoverWorkerControl() });
    await expect(service.activateProviderWorkersAndRetireWindows({ input: input() })).rejects.toMatchObject({ code: "WORKER_HANDOFF_AUTHORITY_STATE_REJECTED" });
  });

  it("rejects activation before the first-write boundary (phase M) even though authority already transferred (phase L)", async () => {
    const authorityStore = memoryAuthorityStore(providerAuthoritativeState()); // authority===PROVIDER but firstProviderCanonicalWriteAt still null
    const service = createProductionWorkerHandoffService({ authorityStore, handoffReceiptStore: await declaredReceiptStore(), workerControl: createDeterministicCombinedCutoverWorkerControl() });
    await expect(service.activateProviderWorkersAndRetireWindows({ input: input() })).rejects.toMatchObject({ code: "WORKER_HANDOFF_BOUNDARY_NOT_YET_CROSSED" });
  });

  it("permits activation once authority is provider-authoritative and the first-write boundary is crossed", async () => {
    const { authorityStore, workerControl, receiptStorePromise } = harness();
    const service = createProductionWorkerHandoffService({ authorityStore, handoffReceiptStore: await receiptStorePromise, workerControl });
    const result = await service.activateProviderWorkersAndRetireWindows({ input: input() });
    expect(result).toMatchObject({ ready: true, outcome: "activated", worker: { status: "verified" }, windowsRetirement: { status: "retired" } });
  });
});

describe("ProductionWorkerHandoffService — operation and deployment identity binding", () => {
  it("rejects a request for the wrong operation", async () => {
    const { authorityStore, workerControl, receiptStorePromise } = harness();
    const service = createProductionWorkerHandoffService({ authorityStore, handoffReceiptStore: await receiptStorePromise, workerControl });
    await expect(service.activateProviderWorkersAndRetireWindows({ input: input({ migrationOperationId: "combined-op-other" }) })).rejects.toMatchObject({ code: "TRANSFER_OPERATION_FORBIDDEN" });
  });

  it("rejects a mismatched provider deployment identity", async () => {
    const { authorityStore, workerControl, receiptStorePromise } = harness();
    const service = createProductionWorkerHandoffService({ authorityStore, handoffReceiptStore: await receiptStorePromise, workerControl });
    await expect(service.activateProviderWorkersAndRetireWindows({ input: input({ providerDeploymentId: "a-different-deployment" }) }))
      .rejects.toMatchObject({ code: "WORKER_HANDOFF_DEPLOYMENT_IDENTITY_MISMATCH" });
  });

  it("rejects when no durable Phase 5 handoff evidence exists for the operation", async () => {
    const authorityStore = memoryAuthorityStore(firstWriteBoundaryState());
    const emptyStore = createPostgresCombinedCutoverHandoffReceiptStore({ pool: createFakeHandoffReceiptPool() });
    const service = createProductionWorkerHandoffService({ authorityStore, handoffReceiptStore: emptyStore, workerControl: createDeterministicCombinedCutoverWorkerControl() });
    await expect(service.activateProviderWorkersAndRetireWindows({ input: input() })).rejects.toMatchObject({ code: "TRANSFER_RECEIPT_UNAVAILABLE" });
  });
});

describe("ProductionWorkerHandoffService — fail-closed unavailable worker control", () => {
  it("reports a blocked/failed activation when no real worker-control implementation is configured", async () => {
    const authorityStore = memoryAuthorityStore(firstWriteBoundaryState());
    const handoffReceiptStore = await declaredReceiptStore();
    const service = createProductionWorkerHandoffService({ authorityStore, handoffReceiptStore, workerControl: createUnavailableWorkerControl() });
    await expect(service.activateProviderWorkersAndRetireWindows({ input: input() })).rejects.toMatchObject({ code: "WORKER_HANDOFF_ACTIVATION_FAILED" });
  });
});

describe("ProductionWorkerHandoffService — Windows retirement sequencing", () => {
  it("retires Windows workers only after the provider worker is verified, never before", async () => {
    const { authorityStore, workerControl, receiptStorePromise } = harness();
    const service = createProductionWorkerHandoffService({ authorityStore, handoffReceiptStore: await receiptStorePromise, workerControl });
    await service.activateProviderWorkersAndRetireWindows({ input: input() });
    const ops = workerControl.inspectCalls().map((call) => call.op);
    expect(ops.indexOf("activate")).toBeGreaterThan(-1);
    expect(ops.indexOf("verify")).toBeGreaterThan(ops.indexOf("activate"));
    expect(ops.indexOf("retire")).toBeGreaterThan(ops.indexOf("verify"));
  });

  it("does not retire Windows workers if provider verification fails", async () => {
    const workerControl = createDeterministicCombinedCutoverWorkerControl({ failVerifyWith: new Error("verify boom") });
    const { authorityStore, receiptStorePromise } = harness({ workerControl });
    const service = createProductionWorkerHandoffService({ authorityStore, handoffReceiptStore: await receiptStorePromise, workerControl });
    await expect(service.activateProviderWorkersAndRetireWindows({ input: input() })).rejects.toMatchObject({ code: "WORKER_HANDOFF_VERIFICATION_AMBIGUOUS" });
    expect(workerControl.inspectCalls().map((call) => call.op)).not.toContain("retire");
  });
});

describe("ProductionWorkerHandoffService — idempotency", () => {
  it("a replay after full completion is a safe idempotent no-op with zero further worker-control calls", async () => {
    const { authorityStore, workerControl, receiptStorePromise } = harness();
    const handoffReceiptStore = await receiptStorePromise;
    const service = createProductionWorkerHandoffService({ authorityStore, handoffReceiptStore, workerControl });
    await service.activateProviderWorkersAndRetireWindows({ input: input() });
    const callsAfterFirst = workerControl.inspectCalls().length;
    const replay = await service.activateProviderWorkersAndRetireWindows({ input: input() });
    expect(replay.outcome).toBe("idempotent-replay");
    expect(workerControl.inspectCalls().length).toBe(callsAfterFirst);
  });

  it("resumes after an activation failure without re-activating an already-activated worker", async () => {
    const authorityStore = memoryAuthorityStore(firstWriteBoundaryState());
    const handoffReceiptStore = await declaredReceiptStore({ workerActivationStatus: "activated" });
    const workerControl = createDeterministicCombinedCutoverWorkerControl({ initialWorkerState: WorkerState.PROVIDER_ACTIVE });
    const service = createProductionWorkerHandoffService({ authorityStore, handoffReceiptStore, workerControl });
    await service.activateProviderWorkersAndRetireWindows({ input: input() });
    expect(workerControl.inspectCalls().map((call) => call.op)).not.toContain("activate");
  });
});

describe("ProductionWorkerHandoffService — honest verification-failure evidence", () => {
  it("preserves 'activated' status (not silently downgraded) when verification is ambiguous", async () => {
    const workerControl = createDeterministicCombinedCutoverWorkerControl({ failVerifyWith: new Error("verify boom") });
    const { authorityStore, receiptStorePromise } = harness({ workerControl });
    const handoffReceiptStore = await receiptStorePromise;
    const service = createProductionWorkerHandoffService({ authorityStore, handoffReceiptStore, workerControl });
    await expect(service.activateProviderWorkersAndRetireWindows({ input: input() })).rejects.toThrow();
    const { receipt } = await handoffReceiptStore.read(OPERATION_ID);
    expect(receipt.workerActivationStatus).toBe("activated");
    expect(receipt.windowsWorkerRetirementStatus).toBe("pending");
  });
});

describe("ProductionWorkerHandoffService — no dual worker authority, and no first-write fabrication", () => {
  it("never mutates combined_runtime_authority - authority and firstProviderCanonicalWriteAt are unchanged by worker activation", async () => {
    const { authorityStore, workerControl, receiptStorePromise } = harness();
    const before = (await authorityStore.read()).state;
    const service = createProductionWorkerHandoffService({ authorityStore, handoffReceiptStore: await receiptStorePromise, workerControl });
    await service.activateProviderWorkersAndRetireWindows({ input: input() });
    const after = (await authorityStore.read()).state;
    expect(after.version).toBe(before.version);
    expect(after.authority).toBe(RuntimeAuthority.PROVIDER);
    expect(after.workerAuthority).toBe("provider"); // single source of worker authority, never dual
    expect(after.firstProviderCanonicalWriteAt).toBe(before.firstProviderCanonicalWriteAt);
  });

  it("this service has no authorityStore.transition capability at all - structurally cannot mutate authority", () => {
    const source = createProductionWorkerHandoffService.toString();
    expect(source).not.toContain("authorityStore.transition");
  });
});
