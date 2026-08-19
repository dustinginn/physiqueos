// Shared authority-state fixtures and a minimal in-memory authority store for the Phase 6A recovery
// trio's unit tests. Every state is built by walking the REAL
// `applyCombinedRuntimeAuthorityTransition` through the exact same transition sequence production
// code uses - no test ever fabricates a state object by hand, so these fixtures cannot silently drift
// from what the real state machine actually allows.
import {
  RuntimeAuthorityAction,
  applyCombinedRuntimeAuthorityTransition,
  createInitialCombinedRuntimeAuthorityState,
} from "../../CombinedRuntimeAuthorityState.js";

export const digest = (character) => character.repeat(64);
export const OPERATION_ID = "combined-op-0001";
export const AUTHORIZATION_FINGERPRINT = digest("a");
export const FENCE_ID = "fence-1";
export const PACKAGE_DIGEST = digest("c");
export const PROVIDER_DEPLOYMENT_ID = "deployment-1";
export const ROUTING_TARGET = "provider-ingress";
export const COMMAND_PREFIX = OPERATION_ID;

export function memoryAuthorityStore(initialState) {
  let state = initialState;
  return {
    async read() { return { state }; },
    async transition(command) { state = applyCombinedRuntimeAuthorityTransition(state, command); return { state, outcome: "committed" }; },
  };
}

export function windowsLegacyState() {
  return createInitialCombinedRuntimeAuthorityState({ environment: "synthetic", windowsSource: { commit: "w".repeat(40), buildId: "windows-build" } });
}

export function providerPreparedState({ operationId = OPERATION_ID, authorizationFingerprint = AUTHORIZATION_FINGERPRINT } = {}) {
  const initial = windowsLegacyState();
  const begun = applyCombinedRuntimeAuthorityTransition(initial, {
    action: RuntimeAuthorityAction.BEGIN_CUTOVER, expectedVersion: initial.version,
    migrationOperationId: operationId, authorizationFingerprint, fenceId: FENCE_ID,
    finalSnapshot: { runtimeSha256: digest("b"), runtimeRevision: 140, mediaInventorySha256: digest("e"), migrationControlSha256: digest("f"), packageDigest: PACKAGE_DIGEST },
    providerSource: { commit: "p".repeat(40), buildId: "provider-build" },
    target: { databaseClusterId: "cluster", databaseName: "physiqueos_production", spacesBucket: "bucket" },
    routingTarget: ROUTING_TARGET, reason: "test fixture",
  });
  const acknowledgement = { migrationOperationId: operationId, authorizationFingerprint, fenceId: FENCE_ID, packageDigest: PACKAGE_DIGEST, providerDeploymentId: PROVIDER_DEPLOYMENT_ID };
  return applyCombinedRuntimeAuthorityTransition(begun, {
    action: RuntimeAuthorityAction.ACKNOWLEDGE_PROVIDER, expectedVersion: begun.version,
    migrationOperationId: operationId, authorizationFingerprint, providerAcknowledgement: acknowledgement, reason: "test fixture",
  });
}

export function providerAuthoritativeState(opts = {}) {
  const prepared = providerPreparedState(opts);
  return applyCombinedRuntimeAuthorityTransition(prepared, {
    action: RuntimeAuthorityAction.TRANSFER_TO_PROVIDER, expectedVersion: prepared.version,
    migrationOperationId: opts.operationId ?? OPERATION_ID, authorizationFingerprint: opts.authorizationFingerprint ?? AUTHORIZATION_FINGERPRINT,
    routingTarget: ROUTING_TARGET, commandId: `${COMMAND_PREFIX}:transfer`, reason: "test fixture",
  });
}

export function firstWriteBoundaryState(opts = {}) {
  const provider = providerAuthoritativeState(opts);
  return applyCombinedRuntimeAuthorityTransition(provider, {
    action: RuntimeAuthorityAction.RECORD_FIRST_PROVIDER_WRITE, expectedVersion: provider.version,
    migrationOperationId: opts.operationId ?? OPERATION_ID, commandId: "test:first-write", reason: "test fixture",
  });
}

export function recoveryRequiredState(opts = {}) {
  const written = firstWriteBoundaryState(opts);
  return applyCombinedRuntimeAuthorityTransition(written, {
    action: RuntimeAuthorityAction.REQUIRE_RECOVERY, expectedVersion: written.version,
    migrationOperationId: opts.operationId ?? OPERATION_ID, reason: "test fixture",
  });
}
