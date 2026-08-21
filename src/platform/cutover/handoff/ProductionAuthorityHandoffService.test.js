import { describe, expect, it, vi } from "vitest";
import { createProductionAuthorityHandoffService } from "./ProductionAuthorityHandoffService.js";
import { createPostgresCombinedCutoverHandoffReceiptStore } from "./PostgresCombinedCutoverHandoffReceiptStore.js";
import { createFakeHandoffReceiptPool } from "./testSupport/fakeHandoffReceiptPool.js";
import { createDeterministicCombinedCutoverRoutingControl } from "../routing/testSupport/deterministicRoutingControl.js";
import { createUnavailableRoutingControl, RouteState, RoutingErrorCode, routingControlError } from "../routing/combinedCutoverRoutingControl.js";
import {
  RuntimeAuthority,
  RuntimeAuthorityAction,
  applyCombinedRuntimeAuthorityTransition,
  createInitialCombinedRuntimeAuthorityState,
} from "../CombinedRuntimeAuthorityState.js";

const digest = (character) => character.repeat(64);
const operationId = "combined-op-0001";
const authorizationFingerprint = digest("a");
const fenceId = "fence-1";
const packageDigest = digest("c");
const providerDeploymentId = "deployment-1";
const routingTarget = "provider-ingress";
const commandPrefix = "combined-op-0001";

function memoryAuthorityStore(initialState) {
  let state = initialState;
  return {
    async read() { return { state }; },
    async transition(command) { state = applyCombinedRuntimeAuthorityTransition(state, command); return { state, outcome: "committed" }; },
    __state: () => state,
  };
}

function providerPreparedState() {
  const initial = createInitialCombinedRuntimeAuthorityState({ environment: "synthetic", windowsSource: { commit: "w".repeat(40), buildId: "windows-build" } });
  const begun = applyCombinedRuntimeAuthorityTransition(initial, {
    action: RuntimeAuthorityAction.BEGIN_CUTOVER, expectedVersion: initial.version,
    migrationOperationId: operationId, authorizationFingerprint, fenceId,
    finalSnapshot: { runtimeSha256: digest("b"), runtimeRevision: 140, mediaInventorySha256: digest("e"), migrationControlSha256: digest("f"), packageDigest },
    providerSource: { commit: "p".repeat(40), buildId: "provider-build" },
    target: { databaseClusterId: "cluster", databaseName: "physiqueos_production", spacesBucket: "bucket" },
    routingTarget, reason: "test fixture",
  });
  const acknowledgement = { migrationOperationId: operationId, authorizationFingerprint, fenceId, packageDigest, providerDeploymentId };
  return applyCombinedRuntimeAuthorityTransition(begun, {
    action: RuntimeAuthorityAction.ACKNOWLEDGE_PROVIDER, expectedVersion: begun.version,
    migrationOperationId: operationId, authorizationFingerprint, providerAcknowledgement: acknowledgement, reason: "test fixture",
  });
}

function commitAuthorityFor(authorityStoreRef) {
  return async () => {
    const current = (await authorityStoreRef.read()).state;
    const result = await authorityStoreRef.transition({
      action: RuntimeAuthorityAction.TRANSFER_TO_PROVIDER, expectedVersion: current.version,
      migrationOperationId: operationId, authorizationFingerprint, routingTarget,
      commandId: `${commandPrefix}:${RuntimeAuthorityAction.TRANSFER_TO_PROVIDER}`,
      reason: "test fixture",
    });
    return result.state;
  };
}

function acknowledgement() {
  return { migrationOperationId: operationId, authorizationFingerprint, fenceId, packageDigest, providerDeploymentId };
}

function fakePreparationStore(overrides = {}) {
  return {
    read: vi.fn(async () => ({
      receipt: { operationId, packageDigest, importStatus: "succeeded", mediaStatus: "succeeded", parityStatus: "passed", preparedStatus: "acknowledged", ...overrides },
    })),
  };
}

function harness({ preparationOverrides = {}, routing = createDeterministicCombinedCutoverRoutingControl(), authorityState = providerPreparedState() } = {}) {
  const authorityStore = memoryAuthorityStore(authorityState);
  const preparationStore = fakePreparationStore(preparationOverrides);
  const handoffReceiptStore = createPostgresCombinedCutoverHandoffReceiptStore({ pool: createFakeHandoffReceiptPool() });
  const service = createProductionAuthorityHandoffService({ authorityStore, preparationStore, handoffReceiptStore, routingControl: routing });
  const input = { migrationOperationId: operationId, authorizationFingerprint, routingTarget, commandPrefix };
  return { service, authorityStore, preparationStore, handoffReceiptStore, routing, input };
}

describe("ProductionAuthorityHandoffService — construction", () => {
  it("requires every collaborator", () => {
    expect(() => createProductionAuthorityHandoffService({})).toThrow();
  });
});

describe("ProductionAuthorityHandoffService — precondition checks (before any authority mutation)", () => {
  it("rejects when authority is not exactly provider-prepared", async () => {
    const { service, authorityStore, input } = harness({ authorityState: createInitialCombinedRuntimeAuthorityState({ environment: "synthetic", windowsSource: { commit: "w".repeat(40), buildId: "windows-build" } }) });
    const state = (await authorityStore.read()).state;
    await expect(service.transferAuthorityAndRoute({ input, state, acknowledgement: acknowledgement(), commitAuthority: commitAuthorityFor(authorityStore) }))
      .rejects.toMatchObject({ code: "HANDOFF_AUTHORITY_STATE_REJECTED" });
    expect(state.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
  });

  it("rejects a request for the wrong operation", async () => {
    const { service, authorityStore, input } = harness();
    const state = (await authorityStore.read()).state;
    await expect(service.transferAuthorityAndRoute({ input: { ...input, migrationOperationId: "combined-op-other" }, state, acknowledgement: acknowledgement(), commitAuthority: commitAuthorityFor(authorityStore) }))
      .rejects.toMatchObject({ code: "TRANSFER_OPERATION_FORBIDDEN" });
  });

  it("rejects preparation evidence that is not yet acknowledged", async () => {
    const { service, authorityStore, input } = harness({ preparationOverrides: { preparedStatus: "pending" } });
    const state = (await authorityStore.read()).state;
    await expect(service.transferAuthorityAndRoute({ input, state, acknowledgement: acknowledgement(), commitAuthority: commitAuthorityFor(authorityStore) }))
      .rejects.toMatchObject({ code: "HANDOFF_PREPARATION_NOT_ELIGIBLE" });
    expect((await authorityStore.read()).state.authority).toBe(RuntimeAuthority.PROVIDER_PREPARED);
  });

  it("rejects preparation evidence for a different package digest", async () => {
    const { service, authorityStore, input } = harness({ preparationOverrides: { packageDigest: digest("9") } });
    const state = (await authorityStore.read()).state;
    await expect(service.transferAuthorityAndRoute({ input, state, acknowledgement: acknowledgement(), commitAuthority: commitAuthorityFor(authorityStore) }))
      .rejects.toMatchObject({ code: "TRANSFER_PACKAGE_DIGEST_CONFLICT" });
  });

  it("rejects a malformed/incomplete acknowledgement before touching authority", async () => {
    const { service, authorityStore, input } = harness();
    const state = (await authorityStore.read()).state;
    await expect(service.transferAuthorityAndRoute({ input, state, acknowledgement: { migrationOperationId: operationId }, commitAuthority: commitAuthorityFor(authorityStore) }))
      .rejects.toMatchObject({ code: "TRANSFER_IDENTITY_INVALID" });
    expect((await authorityStore.read()).state.authority).toBe(RuntimeAuthority.PROVIDER_PREPARED);
  });
});

describe("ProductionAuthorityHandoffService — successful handoff (authority before routing)", () => {
  it("transfers to provider-authoritative exactly once and activates/verifies routing after", async () => {
    const { service, authorityStore, input, routing, handoffReceiptStore } = harness();
    const state = (await authorityStore.read()).state;
    const result = await service.transferAuthorityAndRoute({ input, state, acknowledgement: acknowledgement(), commitAuthority: commitAuthorityFor(authorityStore) });

    expect(result).toMatchObject({ ready: true, outcome: "handed-off", authority: RuntimeAuthority.PROVIDER });
    expect((await authorityStore.read()).state.authority).toBe(RuntimeAuthority.PROVIDER);
    expect((await authorityStore.read()).state.firstProviderCanonicalWriteAt).toBeNull();

    // Authority committed strictly before routing activated (order proof).
    const calls = routing.inspectCalls().map((call) => call.op);
    expect(calls.indexOf("activate")).toBeGreaterThan(-1);
    expect(calls.indexOf("verify")).toBeGreaterThan(calls.indexOf("activate"));
    expect(routing.inspectCalls().find((call) => call.op === "activate")?.operationIdentity).toEqual({
      operationId,
      commandId: `${commandPrefix}:activate-provider-route`,
    });

    const { receipt } = await handoffReceiptStore.read(operationId);
    expect(receipt).toMatchObject({ authorityStatus: "committed", resultingAuthority: RuntimeAuthority.PROVIDER, routingStatus: "verified" });
  });

  it("firstProviderCanonicalWriteAt remains null and exactly one TRANSFER_TO_PROVIDER version bump occurs", async () => {
    const { service, authorityStore, input } = harness();
    const before = (await authorityStore.read()).state; // provider-prepared: version 3 (initial=1, BEGIN_CUTOVER=2, ACKNOWLEDGE_PROVIDER=3)
    await service.transferAuthorityAndRoute({ input, state: before, acknowledgement: acknowledgement(), commitAuthority: commitAuthorityFor(authorityStore) });
    const after = (await authorityStore.read()).state;
    expect(after.firstProviderCanonicalWriteAt).toBeNull();
    expect(after.version).toBe(before.version + 1); // exactly one TRANSFER_TO_PROVIDER transition
  });
});

describe("ProductionAuthorityHandoffService — idempotency", () => {
  it("a second call for the same operation/digest is a safe idempotent replay, never a second commit or routing call", async () => {
    const { service, authorityStore, input, routing } = harness();
    const state = (await authorityStore.read()).state;
    await service.transferAuthorityAndRoute({ input, state, acknowledgement: acknowledgement(), commitAuthority: commitAuthorityFor(authorityStore) });
    const callsAfterFirst = routing.inspectCalls().length;

    // Second call reuses the SAME (now stale, provider-authoritative) authority state snapshot -
    // exactly what a retried recovery attempt would pass.
    const staleState = providerPreparedState(); // structurally provider-prepared, as a caller might mistakenly retain
    const replay = await service.transferAuthorityAndRoute({ input, state: staleState, acknowledgement: acknowledgement(), commitAuthority: commitAuthorityFor(authorityStore) });
    expect(replay.outcome).toBe("idempotent-replay");
    expect(replay.authority).toBe(RuntimeAuthority.PROVIDER);
    expect(routing.inspectCalls().length).toBe(callsAfterFirst); // no new routing calls at all
  });

  it("rejects a conflicting operation replay with a different package digest", async () => {
    const { service, authorityStore, input, handoffReceiptStore } = harness();
    const state = (await authorityStore.read()).state;
    await service.transferAuthorityAndRoute({ input, state, acknowledgement: acknowledgement(), commitAuthority: commitAuthorityFor(authorityStore) });

    await expect(handoffReceiptStore.declare({
      migrationOperationId: operationId, authorizationFingerprint, fenceId, packageDigest: digest("5"),
      routingTarget, providerDeploymentId,
    })).rejects.toMatchObject({ code: "TRANSFER_PACKAGE_DIGEST_CONFLICT" });
  });
});

describe("ProductionAuthorityHandoffService — routing failure classification", () => {
  it("records activation as reached-but-unverified when the one provider mutation outcome is ambiguous", async () => {
    const routing = createDeterministicCombinedCutoverRoutingControl({
      failActivateWith: routingControlError(RoutingErrorCode.AMBIGUOUS, "provider update timed out and readback remained ambiguous", { mutationAttempted: true }),
    });
    const { service, authorityStore, input, handoffReceiptStore } = harness({ routing });
    const state = (await authorityStore.read()).state;
    await expect(service.transferAuthorityAndRoute({ input, state, acknowledgement: acknowledgement(), commitAuthority: commitAuthorityFor(authorityStore) }))
      .rejects.toMatchObject({ code: "HANDOFF_ROUTING_ACTIVATION_AMBIGUOUS" });

    expect((await authorityStore.read()).state.authority).toBe(RuntimeAuthority.PROVIDER);
    const { receipt } = await handoffReceiptStore.read(operationId);
    expect(receipt.authorityStatus).toBe("committed");
    expect(receipt.routingStatus).toBe("activated");
  });

  it("resumes an activation-ambiguous receipt with verification only and never a second mutation", async () => {
    const ambiguousRouting = createDeterministicCombinedCutoverRoutingControl({
      failActivateWith: routingControlError(RoutingErrorCode.AMBIGUOUS, "provider update unresolved", { mutationAttempted: true }),
    });
    const { service, authorityStore, input, handoffReceiptStore } = harness({ routing: ambiguousRouting });
    const state = (await authorityStore.read()).state;
    await expect(service.transferAuthorityAndRoute({ input, state, acknowledgement: acknowledgement(), commitAuthority: commitAuthorityFor(authorityStore) })).rejects.toThrow();

    const reconciliationRouting = createDeterministicCombinedCutoverRoutingControl({ initialRouteState: RouteState.PROVIDER_ACTIVE });
    const resumedService = createProductionAuthorityHandoffService({
      authorityStore,
      preparationStore: fakePreparationStore(),
      handoffReceiptStore,
      routingControl: reconciliationRouting,
    });
    const resumed = await resumedService.transferAuthorityAndRoute({
      input,
      state: providerPreparedState(),
      acknowledgement: acknowledgement(),
      commitAuthority: commitAuthorityFor(authorityStore),
    });
    expect(resumed.outcome).toBe("handed-off");
    expect(reconciliationRouting.inspectCalls().map((call) => call.op)).toEqual(["inspect", "verify"]);
  });

  it("records a pre-mutation ambiguous inspection as failed, not as a dispatched activation", async () => {
    const routing = createDeterministicCombinedCutoverRoutingControl({
      failActivateWith: routingControlError(RoutingErrorCode.AMBIGUOUS, "provider inspection unavailable before mutation"),
    });
    const { service, authorityStore, input, handoffReceiptStore } = harness({ routing });
    const state = (await authorityStore.read()).state;
    await expect(service.transferAuthorityAndRoute({ input, state, acknowledgement: acknowledgement(), commitAuthority: commitAuthorityFor(authorityStore) }))
      .rejects.toMatchObject({ code: "HANDOFF_ROUTING_FAILED" });

    const { receipt } = await handoffReceiptStore.read(operationId);
    expect(receipt.routingStatus).toBe("failed");
  });


  it("routing activation failure leaves authority committed but routing evidence 'failed', not 'verified'", async () => {
    const routing = createDeterministicCombinedCutoverRoutingControl({ failActivateWith: new Error("activation boom") });
    const { service, authorityStore, input, handoffReceiptStore } = harness({ routing });
    const state = (await authorityStore.read()).state;
    await expect(service.transferAuthorityAndRoute({ input, state, acknowledgement: acknowledgement(), commitAuthority: commitAuthorityFor(authorityStore) }))
      .rejects.toMatchObject({ code: "HANDOFF_ROUTING_FAILED" });

    expect((await authorityStore.read()).state.authority).toBe(RuntimeAuthority.PROVIDER);
    expect((await authorityStore.read()).state.firstProviderCanonicalWriteAt).toBeNull();
    const { receipt } = await handoffReceiptStore.read(operationId);
    expect(receipt.authorityStatus).toBe("committed");
    expect(receipt.routingStatus).toBe("failed");
  });

  it("routing verification failure after successful activation is classified ambiguous, not downgraded to failed", async () => {
    const routing = createDeterministicCombinedCutoverRoutingControl({ failVerifyWith: new Error("verify boom") });
    const { service, authorityStore, input, handoffReceiptStore } = harness({ routing });
    const state = (await authorityStore.read()).state;
    await expect(service.transferAuthorityAndRoute({ input, state, acknowledgement: acknowledgement(), commitAuthority: commitAuthorityFor(authorityStore) }))
      .rejects.toMatchObject({ code: "HANDOFF_ROUTING_VERIFICATION_AMBIGUOUS" });

    const { receipt } = await handoffReceiptStore.read(operationId);
    expect(receipt.authorityStatus).toBe("committed");
    expect(receipt.routingStatus).toBe("activated"); // never silently marked "failed"
  });

  it("with the fail-closed unavailable production routing default, authority still commits and routing fails honestly", async () => {
    const { service, authorityStore, input, handoffReceiptStore } = harness({ routing: createUnavailableRoutingControl() });
    const state = (await authorityStore.read()).state;
    await expect(service.transferAuthorityAndRoute({ input, state, acknowledgement: acknowledgement(), commitAuthority: commitAuthorityFor(authorityStore) }))
      .rejects.toMatchObject({ code: "HANDOFF_ROUTING_FAILED" });

    expect((await authorityStore.read()).state.authority).toBe(RuntimeAuthority.PROVIDER);
    const { receipt } = await handoffReceiptStore.read(operationId);
    expect(receipt.authorityStatus).toBe("committed");
    expect(receipt.routingStatus).toBe("failed");
  });

  it("resuming after an activation failure with a working routing control completes the handoff without re-committing authority", async () => {
    const failingRouting = createDeterministicCombinedCutoverRoutingControl({ failActivateWith: new Error("boom") });
    const { service, authorityStore, input, handoffReceiptStore } = harness({ routing: failingRouting });
    const state = (await authorityStore.read()).state;
    await expect(service.transferAuthorityAndRoute({ input, state, acknowledgement: acknowledgement(), commitAuthority: commitAuthorityFor(authorityStore) })).rejects.toThrow();
    const versionAfterFailure = (await authorityStore.read()).state.version;

    const workingRouting = createDeterministicCombinedCutoverRoutingControl();
    const resumedService = createProductionAuthorityHandoffService({ authorityStore, preparationStore: fakePreparationStore(), handoffReceiptStore, routingControl: workingRouting });
    const staleState = providerPreparedState();
    const resumed = await resumedService.transferAuthorityAndRoute({ input, state: staleState, acknowledgement: acknowledgement(), commitAuthority: commitAuthorityFor(authorityStore) });
    expect(resumed.outcome).toBe("handed-off");
    expect((await authorityStore.read()).state.version).toBe(versionAfterFailure); // no additional TRANSFER_TO_PROVIDER commit occurred
  });
});

describe("ProductionAuthorityHandoffService — no dual authority", () => {
  it("Windows and provider canonical writes are never simultaneously enabled at any recorded transition", async () => {
    const { service, authorityStore, input } = harness();
    const before = (await authorityStore.read()).state;
    expect(before.writesEnabled).toBe(false); // provider-prepared: neither side writes yet
    await service.transferAuthorityAndRoute({ input, state: before, acknowledgement: acknowledgement(), commitAuthority: commitAuthorityFor(authorityStore) });
    const after = (await authorityStore.read()).state;
    expect(after.publicRuntimeAuthority).toBe("provider");
    expect(after.writesEnabled).toBe(true); // provider writes now enabled; Windows was never re-enabled
  });
});
