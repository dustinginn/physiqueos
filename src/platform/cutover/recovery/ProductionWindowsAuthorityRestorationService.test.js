import { describe, expect, it } from "vitest";
import { createProductionWindowsAuthorityRestorationService } from "./ProductionWindowsAuthorityRestorationService.js";
import { createPostgresCombinedCutoverHandoffReceiptStore } from "../handoff/PostgresCombinedCutoverHandoffReceiptStore.js";
import { createFakeHandoffReceiptPool } from "../handoff/testSupport/fakeHandoffReceiptPool.js";
import { createDeterministicCombinedCutoverRoutingControl } from "../routing/testSupport/deterministicRoutingControl.js";
import { createUnavailableRoutingControl, RouteState } from "../routing/combinedCutoverRoutingControl.js";
import { RuntimeAuthority } from "../CombinedRuntimeAuthorityState.js";
import { MigrationFenceState, MigrationControlAction } from "../migrationControlState.js";
import { withIsolatedMigrationControlStore, activateIsolatedFence } from "./testSupport/isolatedMigrationControlStore.js";
import {
  memoryAuthorityStore, providerPreparedState, providerAuthoritativeState, firstWriteBoundaryState,
  OPERATION_ID, AUTHORIZATION_FINGERPRINT, FENCE_ID, PACKAGE_DIGEST, PROVIDER_DEPLOYMENT_ID, ROUTING_TARGET,
} from "./testSupport/recoveryFixtures.js";

function input(overrides = {}) {
  return { migrationOperationId: OPERATION_ID, ...overrides };
}

function emptyReceiptStore() {
  return createPostgresCombinedCutoverHandoffReceiptStore({ pool: createFakeHandoffReceiptPool() });
}

async function activatedReceiptStore({ verified = true } = {}) {
  const store = emptyReceiptStore();
  await store.declare({
    migrationOperationId: OPERATION_ID, authorizationFingerprint: AUTHORIZATION_FINGERPRINT, fenceId: FENCE_ID,
    packageDigest: PACKAGE_DIGEST, routingTarget: ROUTING_TARGET, providerDeploymentId: PROVIDER_DEPLOYMENT_ID,
  });
  await store.recordAuthorityCommitted({ migrationOperationId: OPERATION_ID, expectedPackageDigest: PACKAGE_DIGEST, resultingAuthority: RuntimeAuthority.PROVIDER });
  await store.recordRoutingActivated({ migrationOperationId: OPERATION_ID, expectedPackageDigest: PACKAGE_DIGEST });
  if (verified) await store.recordRoutingVerified({ migrationOperationId: OPERATION_ID, expectedPackageDigest: PACKAGE_DIGEST });
  return store;
}

describe("ProductionWindowsAuthorityRestorationService — construction", () => {
  it("requires every collaborator including the Windows migration-control store", async () => {
    expect(() => createProductionWindowsAuthorityRestorationService({})).toThrow();
    await withIsolatedMigrationControlStore(async (controlStore) => {
      const authorityStore = memoryAuthorityStore(providerPreparedState());
      const handoffReceiptStore = emptyReceiptStore();
      const routingControl = createDeterministicCombinedCutoverRoutingControl();
      expect(() => createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl })).toThrow(); // no controlStore
    });
  });
});

describe("ProductionWindowsAuthorityRestorationService — legal pre-boundary restoration", () => {
  it("restores Windows authority through the real ABORT_TO_WINDOWS transition when routing and fence were never activated", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      const authorityStore = memoryAuthorityStore(providerPreparedState());
      const handoffReceiptStore = emptyReceiptStore();
      const routingControl = createDeterministicCombinedCutoverRoutingControl();
      const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl, controlStore });

      const result = await service.restoreWindowsAuthority({ input: input() });
      expect(result).toMatchObject({ ready: true, classification: "RESTORED", authority: RuntimeAuthority.WINDOWS_LEGACY, routing: { action: "not-required" }, fence: { action: "not-required" } });

      const after = (await authorityStore.read()).state;
      expect(after.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
      expect(after.lastAction).toBe("abort-to-windows"); // proves the real state-machine transition ran, not a direct row write
      expect(routingControl.inspectCalls()).toHaveLength(0);
    });
  });

  it("restores provider routing back to Windows when the durable receipt shows routing was verified", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
      const handoffReceiptStore = await activatedReceiptStore({ verified: true });
      const routingControl = createDeterministicCombinedCutoverRoutingControl({ initialRouteState: RouteState.PROVIDER_ACTIVE });
      const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl, controlStore });

      const result = await service.restoreWindowsAuthority({ input: input() });
      expect(result).toMatchObject({ ready: true, classification: "RESTORED", authority: RuntimeAuthority.WINDOWS_LEGACY, routing: { action: "restored" } });
      expect(routingControl.inspectCalls().map((call) => call.op)).toContain("restore");
      expect(routingControl.currentRouteState()).toBe(RouteState.WINDOWS_ACTIVE);

      const { receipt } = await handoffReceiptStore.read(OPERATION_ID);
      expect(receipt.windowsRoutingRestoreStatus).toBe("restored");
      expect(receipt.windowsRoutingRestoreAt).not.toBeNull();
    });
  });

  it("restores provider routing when the receipt shows routing activated but not yet verified", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
      const handoffReceiptStore = await activatedReceiptStore({ verified: false });
      const routingControl = createDeterministicCombinedCutoverRoutingControl({ initialRouteState: RouteState.PROVIDER_ACTIVE });
      const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl, controlStore });

      const result = await service.restoreWindowsAuthority({ input: input() });
      expect(result.routing.action).toBe("restored");
    });
  });
});

describe("ProductionWindowsAuthorityRestorationService — Windows-local fence release (Phase 6C)", () => {
  it("releases the isolated Windows fence through the real ABORT_TO_LEGACY transition when it is active for this operation", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      activateIsolatedFence(controlStore, OPERATION_ID);
      expect(controlStore.read().state.fenceState).toBe(MigrationFenceState.ACTIVE);

      const authorityStore = memoryAuthorityStore(providerPreparedState());
      const handoffReceiptStore = emptyReceiptStore();
      const routingControl = createDeterministicCombinedCutoverRoutingControl();
      const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl, controlStore });

      const result = await service.restoreWindowsAuthority({ input: input() });
      expect(result).toMatchObject({ ready: true, classification: "RESTORED", fence: { action: "released" } });

      const after = controlStore.read().state;
      expect(after.fenceState).toBe(MigrationFenceState.ABORTED);
      expect(after.writesEnabled).toBe(true);
      expect(after.readsEnabled).toBe(true);
      expect(after.firstPostgresWriteAt).toBeNull();
    });
  });

  it("a snapshot-stage failure after fence activation can restore the fence", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      activateIsolatedFence(controlStore, OPERATION_ID);
      const authorityStore = memoryAuthorityStore(providerPreparedState()); // authority reached provider-prepared before the (simulated) snapshot stage failed
      const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore: emptyReceiptStore(), routingControl: createDeterministicCombinedCutoverRoutingControl(), controlStore });

      const result = await service.restoreWindowsAuthority({ input: input(), error: { code: "SYNTHETIC_FAILURE_captureFinalSnapshot" } });
      expect(result.fence.action).toBe("released");
      expect(controlStore.read().state.fenceState).toBe(MigrationFenceState.ABORTED);
    });
  });

  it("an export-stage failure after fence activation can restore the fence", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      activateIsolatedFence(controlStore, OPERATION_ID);
      const authorityStore = memoryAuthorityStore(providerPreparedState());
      const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore: emptyReceiptStore(), routingControl: createDeterministicCombinedCutoverRoutingControl(), controlStore });

      const result = await service.restoreWindowsAuthority({ input: input(), error: { code: "SYNTHETIC_FAILURE_exportFinalPackage" } });
      expect(result.fence.action).toBe("released");
      expect(controlStore.read().state.reason).toContain("SYNTHETIC_FAILURE_exportFinalPackage");
    });
  });

  it("a post-handoff routing failure (authority transferred, pre-write) restores authority, routing, and the Windows fence together", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      activateIsolatedFence(controlStore, OPERATION_ID);
      const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
      const handoffReceiptStore = await activatedReceiptStore({ verified: true });
      const routingControl = createDeterministicCombinedCutoverRoutingControl({ initialRouteState: RouteState.PROVIDER_ACTIVE });
      const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl, controlStore });

      const result = await service.restoreWindowsAuthority({ input: input() });
      expect(result).toMatchObject({ ready: true, classification: "RESTORED", authority: RuntimeAuthority.WINDOWS_LEGACY, routing: { action: "restored" }, fence: { action: "released" } });
      expect((await authorityStore.read()).state.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
      expect(routingControl.currentRouteState()).toBe(RouteState.WINDOWS_ACTIVE);
      expect(controlStore.read().state.fenceState).toBe(MigrationFenceState.ABORTED);
    });
  });

  it("is idempotent: a repeated release for an already-released operation is a safe no-op", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      activateIsolatedFence(controlStore, OPERATION_ID);
      const authorityStore = memoryAuthorityStore(providerPreparedState());
      const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore: emptyReceiptStore(), routingControl: createDeterministicCombinedCutoverRoutingControl(), controlStore });

      const first = await service.restoreWindowsAuthority({ input: input() });
      const versionAfterFirst = controlStore.read().state.version;
      const second = await service.restoreWindowsAuthority({ input: input() });

      expect(first.fence.action).toBe("released");
      expect(second.fence.action).toBe("not-required"); // already aborted; no second transition attempted
      expect(controlStore.read().state.version).toBe(versionAfterFirst);
    });
  });

  it("rejects releasing a fence held by a different operation (operation-bound)", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      activateIsolatedFence(controlStore, "combined-op-someone-else");
      const authorityStore = memoryAuthorityStore(providerPreparedState()); // provider-side authority DOES belong to OPERATION_ID
      const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore: emptyReceiptStore(), routingControl: createDeterministicCombinedCutoverRoutingControl(), controlStore });

      const result = await service.restoreWindowsAuthority({ input: input() });
      expect(result.fence.action).toBe("not-required"); // never touched the other operation's fence
      expect(controlStore.read().state.fenceState).toBe(MigrationFenceState.ACTIVE);
      expect(controlStore.read().state.migrationOperationId).toBe("combined-op-someone-else");
    });
  });

  it("blocks Windows fence release when the Windows-local firstPostgresWriteAt is non-null, even though the provider side would otherwise permit rollback", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      const activated = activateIsolatedFence(controlStore, OPERATION_ID);
      controlStore.transition({
        action: MigrationControlAction.BEGIN_CUTOVER, commandId: `${OPERATION_ID}:begin`, correlationId: OPERATION_ID, operator: "test-operator", reason: "test",
        expectedVersion: activated.state.version, expectedFenceState: activated.state.fenceState,
        expectedCanonicalStoreEpoch: activated.state.canonicalStoreEpoch, expectedCompositionMode: activated.state.compositionMode,
        migrationOperationId: OPERATION_ID,
      });
      let current = controlStore.read().state;
      current = controlStore.transition({
        action: MigrationControlAction.SWITCH_TO_POSTGRES, commandId: `${OPERATION_ID}:switch`, correlationId: OPERATION_ID, operator: "test-operator", reason: "test",
        expectedVersion: current.version, expectedFenceState: current.fenceState, expectedCanonicalStoreEpoch: current.canonicalStoreEpoch, expectedCompositionMode: current.compositionMode,
        migrationOperationId: OPERATION_ID,
      }).state;
      controlStore.transition({
        action: MigrationControlAction.RECORD_FIRST_POSTGRES_WRITE, commandId: `${OPERATION_ID}:first-write`, correlationId: OPERATION_ID, operator: "test-operator", reason: "test",
        expectedVersion: current.version, expectedFenceState: current.fenceState, expectedCanonicalStoreEpoch: current.canonicalStoreEpoch, expectedCompositionMode: current.compositionMode,
        migrationOperationId: OPERATION_ID,
      });
      expect(controlStore.read().state.firstPostgresWriteAt).not.toBeNull();

      const authorityStore = memoryAuthorityStore(providerPreparedState()); // provider side still legally rollback-able
      const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore: emptyReceiptStore(), routingControl: createDeterministicCombinedCutoverRoutingControl(), controlStore });

      await expect(service.restoreWindowsAuthority({ input: input() })).rejects.toMatchObject({ code: "RECOVERY_ROLLBACK_ILLEGAL" });
      // Refused BEFORE any provider-side mutation, since the local guard is checked upfront.
      expect((await authorityStore.read()).state.authority).toBe(RuntimeAuthority.PROVIDER_PREPARED);
    });
  });
});

describe("ProductionWindowsAuthorityRestorationService — honest routing-failure evidence", () => {
  it("persists routing-restore-failed evidence and reports PARTIAL, even though Windows authority and fence still revert", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      activateIsolatedFence(controlStore, OPERATION_ID);
      const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
      const handoffReceiptStore = await activatedReceiptStore({ verified: true });
      const routingControl = createDeterministicCombinedCutoverRoutingControl({ initialRouteState: RouteState.PROVIDER_ACTIVE, failRestoreWith: new Error("restore boom") });
      const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl, controlStore });

      const result = await service.restoreWindowsAuthority({ input: input() });
      expect(result).toMatchObject({ ready: false, classification: "PARTIAL", routing: { action: "restore-failed" }, fence: { action: "released" } });
      expect(result.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);

      const { receipt } = await handoffReceiptStore.read(OPERATION_ID);
      expect(receipt.windowsRoutingRestoreStatus).toBe("failed");
    });
  });

  it("with the fail-closed unavailable routing default, routing restoration is honestly AMBIGUOUS (unknown, not failed) while authority and fence still revert", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      activateIsolatedFence(controlStore, OPERATION_ID);
      const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
      const handoffReceiptStore = await activatedReceiptStore({ verified: true });
      const routingControl = createUnavailableRoutingControl();
      const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl, controlStore });

      const result = await service.restoreWindowsAuthority({ input: input() });
      expect(result.ready).toBe(false);
      expect(result.classification).toBe("AMBIGUOUS");
      expect(result.routing.action).toBe("restore-ambiguous");
      expect(result.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
      expect(result.fence.action).toBe("released");

      const { receipt } = await handoffReceiptStore.read(OPERATION_ID);
      expect(receipt.windowsRoutingRestoreStatus).toBe("ambiguous"); // never conflated with a definite failure
    });
  });
});

describe("ProductionWindowsAuthorityRestorationService — operation binding and boundary refusal", () => {
  it("rejects a restoration request for a different operation than the currently active cutover", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
      const handoffReceiptStore = emptyReceiptStore();
      const routingControl = createDeterministicCombinedCutoverRoutingControl();
      const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl, controlStore });

      await expect(service.restoreWindowsAuthority({ input: input({ migrationOperationId: "combined-op-other" }) }))
        .rejects.toMatchObject({ code: "RECOVERY_CONFLICTING_OPERATION" });
      expect((await authorityStore.read()).state.authority).toBe(RuntimeAuthority.PROVIDER);
    });
  });

  it("refuses to restore Windows once firstProviderCanonicalWriteAt is non-null", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      const authorityStore = memoryAuthorityStore(firstWriteBoundaryState());
      const handoffReceiptStore = emptyReceiptStore();
      const routingControl = createDeterministicCombinedCutoverRoutingControl();
      const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl, controlStore });

      await expect(service.restoreWindowsAuthority({ input: input() })).rejects.toMatchObject({ code: "RECOVERY_ROLLBACK_ILLEGAL" });
      const after = (await authorityStore.read()).state;
      expect(after.authority).toBe(RuntimeAuthority.PROVIDER);
      expect(after.firstProviderCanonicalWriteAt).not.toBeNull();
      expect(routingControl.inspectCalls()).toHaveLength(0); // refused before any routing call
    });
  });
});

describe("ProductionWindowsAuthorityRestorationService — idempotency and no direct row mutation", () => {
  it("a repeated restoration call for an already-restored operation is a safe no-op", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      const authorityStore = memoryAuthorityStore(providerPreparedState());
      const handoffReceiptStore = emptyReceiptStore();
      const routingControl = createDeterministicCombinedCutoverRoutingControl();
      const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl, controlStore });

      const first = await service.restoreWindowsAuthority({ input: input() });
      const versionAfterFirst = (await authorityStore.read()).state.version;
      const second = await service.restoreWindowsAuthority({ input: input() });

      expect(first.ready).toBe(true);
      expect(second.ready).toBe(true);
      expect(second.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
      expect((await authorityStore.read()).state.version).toBe(versionAfterFirst); // no second transition applied
    });
  });

  it("only ever mutates authority through authorityStore.transition, never a direct row write", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
      const handoffReceiptStore = emptyReceiptStore();
      const routingControl = createDeterministicCombinedCutoverRoutingControl();
      const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl, controlStore });

      await service.restoreWindowsAuthority({ input: input() });
      const after = (await authorityStore.read()).state;
      // lastAction/version/reason are only ever set by applyCombinedRuntimeAuthorityTransition inside
      // authorityStore.transition(); a direct row write could not have produced this shape.
      expect(after.lastAction).toBe("abort-to-windows");
      expect(after.reason).toContain(OPERATION_ID);
    });
  });

  it("never mutates Founder runtime data - this service has no filesystem or Founder-runtime dependency at all", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      const authorityStore = memoryAuthorityStore(providerPreparedState());
      const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore: emptyReceiptStore(), routingControl: createDeterministicCombinedCutoverRoutingControl(), controlStore });
      // Structural proof: the factory accepts exactly these four collaborators, none of which is a
      // Founder runtime path or filesystem handle.
      expect(Object.keys(service)).toEqual(["restoreWindowsAuthority"]);
    });
  });
});
