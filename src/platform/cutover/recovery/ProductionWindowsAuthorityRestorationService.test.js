import { describe, expect, it } from "vitest";
import { createProductionWindowsAuthorityRestorationService } from "./ProductionWindowsAuthorityRestorationService.js";
import { createPostgresCombinedCutoverHandoffReceiptStore } from "../handoff/PostgresCombinedCutoverHandoffReceiptStore.js";
import { createFakeHandoffReceiptPool } from "../handoff/testSupport/fakeHandoffReceiptPool.js";
import { createDeterministicCombinedCutoverRoutingControl } from "../routing/testSupport/deterministicRoutingControl.js";
import { createUnavailableRoutingControl, RouteState } from "../routing/combinedCutoverRoutingControl.js";
import { RuntimeAuthority } from "../CombinedRuntimeAuthorityState.js";
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
  it("requires every collaborator", () => {
    expect(() => createProductionWindowsAuthorityRestorationService({})).toThrow();
  });
});

describe("ProductionWindowsAuthorityRestorationService — legal pre-boundary restoration", () => {
  it("restores Windows authority through the real ABORT_TO_WINDOWS transition when routing was never activated", async () => {
    const authorityStore = memoryAuthorityStore(providerPreparedState());
    const handoffReceiptStore = emptyReceiptStore();
    const routingControl = createDeterministicCombinedCutoverRoutingControl();
    const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl });

    const result = await service.restoreWindowsAuthority({ input: input() });
    expect(result).toMatchObject({ ready: true, authority: RuntimeAuthority.WINDOWS_LEGACY, routing: { action: "not-required" } });

    const after = (await authorityStore.read()).state;
    expect(after.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
    expect(after.lastAction).toBe("abort-to-windows"); // proves the real state-machine transition ran, not a direct row write
    expect(routingControl.inspectCalls()).toHaveLength(0);
  });

  it("restores provider routing back to Windows when the durable receipt shows routing was verified", async () => {
    const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
    const handoffReceiptStore = await activatedReceiptStore({ verified: true });
    const routingControl = createDeterministicCombinedCutoverRoutingControl({ initialRouteState: RouteState.PROVIDER_ACTIVE });
    const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl });

    const result = await service.restoreWindowsAuthority({ input: input() });
    expect(result).toMatchObject({ ready: true, authority: RuntimeAuthority.WINDOWS_LEGACY, routing: { action: "restored" } });
    expect(routingControl.inspectCalls().map((call) => call.op)).toContain("restore");
    expect(routingControl.currentRouteState()).toBe(RouteState.WINDOWS_ACTIVE);

    const { receipt } = await handoffReceiptStore.read(OPERATION_ID);
    expect(receipt.windowsRoutingRestoreStatus).toBe("restored");
    expect(receipt.windowsRoutingRestoreAt).not.toBeNull();
  });

  it("restores provider routing when the receipt shows routing activated but not yet verified", async () => {
    const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
    const handoffReceiptStore = await activatedReceiptStore({ verified: false });
    const routingControl = createDeterministicCombinedCutoverRoutingControl({ initialRouteState: RouteState.PROVIDER_ACTIVE });
    const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl });

    const result = await service.restoreWindowsAuthority({ input: input() });
    expect(result.routing.action).toBe("restored");
  });
});

describe("ProductionWindowsAuthorityRestorationService — honest routing-failure evidence", () => {
  it("persists routing-restore-failed evidence and reports not-ready, even though Windows authority still reverts", async () => {
    const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
    const handoffReceiptStore = await activatedReceiptStore({ verified: true });
    const routingControl = createDeterministicCombinedCutoverRoutingControl({ initialRouteState: RouteState.PROVIDER_ACTIVE, failRestoreWith: new Error("restore boom") });
    const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl });

    const result = await service.restoreWindowsAuthority({ input: input() });
    expect(result).toMatchObject({ ready: false, routing: { action: "restore-failed" } });
    // Authority safely reverts regardless: no dual canonical-write risk, since PostgresCombinedRuntimeAuthorityStore
    // independently refuses provider writes once authority is no longer provider-authoritative.
    expect(result.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);

    const { receipt } = await handoffReceiptStore.read(OPERATION_ID);
    expect(receipt.windowsRoutingRestoreStatus).toBe("failed");
  });

  it("with the fail-closed unavailable routing default, routing restoration honestly fails while authority still reverts", async () => {
    const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
    const handoffReceiptStore = await activatedReceiptStore({ verified: true });
    const routingControl = createUnavailableRoutingControl();
    const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl });

    const result = await service.restoreWindowsAuthority({ input: input() });
    expect(result.ready).toBe(false);
    expect(result.routing.action).toBe("restore-failed");
    expect(result.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
  });
});

describe("ProductionWindowsAuthorityRestorationService — operation binding and boundary refusal", () => {
  it("rejects a restoration request for a different operation than the currently active cutover", async () => {
    const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
    const handoffReceiptStore = emptyReceiptStore();
    const routingControl = createDeterministicCombinedCutoverRoutingControl();
    const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl });

    await expect(service.restoreWindowsAuthority({ input: input({ migrationOperationId: "combined-op-other" }) }))
      .rejects.toMatchObject({ code: "RECOVERY_CONFLICTING_OPERATION" });
    expect((await authorityStore.read()).state.authority).toBe(RuntimeAuthority.PROVIDER);
  });

  it("refuses to restore Windows once firstProviderCanonicalWriteAt is non-null", async () => {
    const authorityStore = memoryAuthorityStore(firstWriteBoundaryState());
    const handoffReceiptStore = emptyReceiptStore();
    const routingControl = createDeterministicCombinedCutoverRoutingControl();
    const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl });

    await expect(service.restoreWindowsAuthority({ input: input() })).rejects.toMatchObject({ code: "RECOVERY_ROLLBACK_ILLEGAL" });
    const after = (await authorityStore.read()).state;
    expect(after.authority).toBe(RuntimeAuthority.PROVIDER);
    expect(after.firstProviderCanonicalWriteAt).not.toBeNull();
    expect(routingControl.inspectCalls()).toHaveLength(0); // refused before any routing call
  });
});

describe("ProductionWindowsAuthorityRestorationService — idempotency and no direct row mutation", () => {
  it("a repeated restoration call for an already-restored operation is a safe no-op", async () => {
    const authorityStore = memoryAuthorityStore(providerPreparedState());
    const handoffReceiptStore = emptyReceiptStore();
    const routingControl = createDeterministicCombinedCutoverRoutingControl();
    const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl });

    const first = await service.restoreWindowsAuthority({ input: input() });
    const versionAfterFirst = (await authorityStore.read()).state.version;
    const second = await service.restoreWindowsAuthority({ input: input() });

    expect(first.ready).toBe(true);
    expect(second.ready).toBe(true);
    expect(second.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
    expect((await authorityStore.read()).state.version).toBe(versionAfterFirst); // no second transition applied
  });

  it("only ever mutates authority through authorityStore.transition, never a direct row write", async () => {
    const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
    const handoffReceiptStore = emptyReceiptStore();
    const routingControl = createDeterministicCombinedCutoverRoutingControl();
    const service = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl });

    await service.restoreWindowsAuthority({ input: input() });
    const after = (await authorityStore.read()).state;
    // lastAction/version/reason are only ever set by applyCombinedRuntimeAuthorityTransition inside
    // authorityStore.transition(); a direct row write could not have produced this shape.
    expect(after.lastAction).toBe("abort-to-windows");
    expect(after.reason).toContain(OPERATION_ID);
  });
});
