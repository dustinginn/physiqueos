import { describe, expect, it } from "vitest";
import {
  RuntimeAuthority,
  RuntimeAuthorityAction,
  applyCombinedRuntimeAuthorityTransition,
  createInitialCombinedRuntimeAuthorityState,
} from "./CombinedRuntimeAuthorityState.js";

const windowsSource = { commit: "a".repeat(40), buildId: "windows-build" };
const providerSource = { commit: "b".repeat(40), buildId: "provider-build" };
const snapshot = {
  runtimeSha256: "c".repeat(64), runtimeRevision: "122", mediaInventorySha256: "d".repeat(64),
  migrationControlSha256: "e".repeat(64), packageDigest: "f".repeat(64),
};
const target = { databaseClusterId: "cluster", databaseName: "canonical", spacesBucket: "bucket" };
const authorizationFingerprint = "1".repeat(64);

describe("combined runtime authority", () => {
  it("binds the fenced snapshot, provider acknowledgement, authority transfer, and first-write boundary", () => {
    let state = createInitialCombinedRuntimeAuthorityState({ environment: "isolated", windowsSource, now: "2026-08-14T00:00:00.000Z" });
    state = transition(state, RuntimeAuthorityAction.BEGIN_CUTOVER, {
      migrationOperationId: "operation", authorizationFingerprint, fenceId: "fence",
      finalSnapshot: snapshot, providerSource, target, routingTarget: "provider.example",
    });
    expect(state).toMatchObject({ authority: RuntimeAuthority.CUTOVER_IN_PROGRESS, writesEnabled: false, publicRuntimeAuthority: "windows" });

    state = transition(state, RuntimeAuthorityAction.ACKNOWLEDGE_PROVIDER, {
      migrationOperationId: "operation",
      providerAcknowledgement: {
        migrationOperationId: "operation", authorizationFingerprint, fenceId: "fence",
        packageDigest: snapshot.packageDigest, providerDeploymentId: "deployment",
      },
    });
    expect(state).toMatchObject({ authority: RuntimeAuthority.PROVIDER_PREPARED, migrationControlAuthority: "provider", workerAuthority: "paused" });

    state = transition(state, RuntimeAuthorityAction.TRANSFER_TO_PROVIDER, { migrationOperationId: "operation" });
    expect(state).toMatchObject({ authority: RuntimeAuthority.PROVIDER, publicRuntimeAuthority: "provider", canonicalStoreEpoch: "postgres-canonical", writesEnabled: true });

    state = transition(state, RuntimeAuthorityAction.RECORD_FIRST_PROVIDER_WRITE, { migrationOperationId: "operation", commandId: "command-1" });
    expect(state.firstProviderCanonicalWriteAt).toBeTruthy();
    expect(state.firstProviderCommandId).toBe("command-1");
    expect(() => transition(state, RuntimeAuthorityAction.ABORT_TO_WINDOWS, { migrationOperationId: "operation" }))
      .toThrow(/forbidden after the first provider canonical write/i);
  });

  it("allows an exact pre-write abort and rejects acknowledgement drift", () => {
    let state = createInitialCombinedRuntimeAuthorityState({ environment: "isolated", windowsSource });
    state = transition(state, RuntimeAuthorityAction.BEGIN_CUTOVER, {
      migrationOperationId: "operation", authorizationFingerprint, fenceId: "fence",
      finalSnapshot: snapshot, providerSource, target, routingTarget: "provider.example",
    });
    expect(() => transition(state, RuntimeAuthorityAction.ACKNOWLEDGE_PROVIDER, {
      migrationOperationId: "operation",
      providerAcknowledgement: {
        migrationOperationId: "operation", authorizationFingerprint: "2".repeat(64), fenceId: "fence",
        packageDigest: snapshot.packageDigest, providerDeploymentId: "deployment",
      },
    })).toThrow(/authorizationFingerprint/);
    state = transition(state, RuntimeAuthorityAction.ABORT_TO_WINDOWS, { migrationOperationId: "operation" });
    expect(state).toMatchObject({ authority: RuntimeAuthority.WINDOWS_LEGACY, writesEnabled: true, canonicalStoreEpoch: "legacy-json" });
  });

  it("fails closed after a post-boundary incident", () => {
    let state = readyProviderState();
    state = transition(state, RuntimeAuthorityAction.RECORD_FIRST_PROVIDER_WRITE, { migrationOperationId: "operation", commandId: "command-1" });
    state = transition(state, RuntimeAuthorityAction.REQUIRE_RECOVERY, { migrationOperationId: "operation" });
    expect(state).toMatchObject({ authority: RuntimeAuthority.RECOVERY_REQUIRED, writesEnabled: false, workerAuthority: "paused", publicRuntimeAuthority: "provider" });
  });
});

function readyProviderState() {
  let state = createInitialCombinedRuntimeAuthorityState({ environment: "isolated", windowsSource });
  state = transition(state, RuntimeAuthorityAction.BEGIN_CUTOVER, {
    migrationOperationId: "operation", authorizationFingerprint, fenceId: "fence",
    finalSnapshot: snapshot, providerSource, target, routingTarget: "provider.example",
  });
  state = transition(state, RuntimeAuthorityAction.ACKNOWLEDGE_PROVIDER, {
    migrationOperationId: "operation",
    providerAcknowledgement: {
      migrationOperationId: "operation", authorizationFingerprint, fenceId: "fence",
      packageDigest: snapshot.packageDigest, providerDeploymentId: "deployment",
    },
  });
  return transition(state, RuntimeAuthorityAction.TRANSFER_TO_PROVIDER, { migrationOperationId: "operation" });
}

function transition(state, action, overrides = {}) {
  return applyCombinedRuntimeAuthorityTransition(state, {
    action, expectedVersion: state.version, reason: action, ...overrides,
  }, { now: `2026-08-14T00:00:${String(state.version).padStart(2, "0")}.000Z` });
}
