import { describe, expect, it } from "vitest";
import {
  applyCombinedRuntimeAuthorityTransition,
  createInitialCombinedRuntimeAuthorityState,
  RuntimeAuthorityAction,
} from "./CombinedRuntimeAuthorityState.js";
import { createCombinedAppPlatformCutoverOrchestrator } from "./CombinedAppPlatformCutoverOrchestrator.js";

const digest = (character) => character.repeat(64);

describe("combined App Platform cutover orchestrator", () => {
  it("hands off all authority only after exact snapshot parity", async () => {
    const store = memoryStore();
    const orchestrator = createCombinedAppPlatformCutoverOrchestrator({ authorityStore: store, adapters: adapters(store) });
    const result = await orchestrator.execute(input());
    expect(result.classification).toBe("COMPLETED");
    expect(result.state).toMatchObject({
      authority: "provider-authoritative",
      publicRuntimeAuthority: "provider",
      migrationControlAuthority: "provider",
      workerAuthority: "provider",
      canonicalStoreEpoch: "postgres-canonical",
    });
  });

  it("restores Windows when provider import fails before the first provider write", async () => {
    const store = memoryStore();
    const fixture = adapters(store);
    fixture.importProviderCanonicalState = async () => { throw Object.assign(new Error("synthetic"), { code: "SYNTHETIC_IMPORT_FAILURE" }); };
    const orchestrator = createCombinedAppPlatformCutoverOrchestrator({ authorityStore: store, adapters: fixture });
    await expect(orchestrator.execute(input())).rejects.toMatchObject({
      combinedCutoverRecovery: expect.objectContaining({ classification: "ABORTED_TO_WINDOWS", automaticWindowsRollback: true }),
    });
    expect((await store.read()).state.authority).toBe("windows-legacy-authoritative");
  });

  it("forbids stale Windows rollback after a provider canonical write", async () => {
    const store = memoryStore();
    const fixture = adapters(store);
    fixture.verifyPostHandoff = async ({ input: request }) => {
      const state = (await store.read()).state;
      await store.transition({ action: RuntimeAuthorityAction.RECORD_FIRST_PROVIDER_WRITE,
        expectedVersion: state.version, migrationOperationId: request.migrationOperationId,
        commandId: "first-provider-command", reason: "synthetic accepted provider write" });
      throw Object.assign(new Error("synthetic"), { code: "SYNTHETIC_POST_WRITE_FAILURE" });
    };
    const orchestrator = createCombinedAppPlatformCutoverOrchestrator({ authorityStore: store, adapters: fixture });
    await expect(orchestrator.execute(input())).rejects.toMatchObject({
      combinedCutoverRecovery: expect.objectContaining({ classification: "FORWARD_REPAIR_REQUIRED", automaticWindowsRollback: false }),
    });
    expect((await store.read()).state).toMatchObject({ authority: "recovery-required", publicRuntimeAuthority: "provider", writesEnabled: false });
  });
});

function memoryStore() {
  let state = createInitialCombinedRuntimeAuthorityState({
    environment: "synthetic",
    windowsSource: { commit: "windows-commit", buildId: "windows-build" },
  });
  return {
    async read() { return { state }; },
    async transition(command) { state = applyCombinedRuntimeAuthorityTransition(state, command); return { state, outcome: "committed" }; },
  };
}

function input() {
  return {
    productionAuthorization: true,
    migrationOperationId: "combined-op-1",
    authorizationFingerprint: digest("a"),
    commandPrefix: "combined-op-1",
    expectedRuntimeSha256: digest("b"),
    expectedRuntimeRevision: 122,
    providerSource: { commit: "provider-commit", buildId: "provider-product-build" },
    target: { databaseClusterId: "cluster", databaseName: "canonical", spacesBucket: "bucket" },
    routingTarget: "provider-app",
  };
}

function adapters() {
  const ready = async () => ({ ready: true, mutated: false });
  const snapshot = { runtimeSha256: digest("b"), runtimeRevision: 122,
    mediaInventorySha256: digest("c"), migrationControlSha256: digest("d"), packageDigest: digest("e") };
  return {
    verifyAuthorization: ready, verifyWindowsSource: ready, verifyProviderBuild: ready,
    verifyTargetIsolation: ready, verifyBackups: ready, verifyCostCeiling: ready,
    activateWindowsWriteFence: async () => ({ fenceId: "fence-1" }),
    captureFinalSnapshot: async () => snapshot,
    exportFinalPackage: async () => ({ packageDigest: snapshot.packageDigest }),
    transferSnapshot: async () => ({ receiptId: "receipt-1", packageDigest: snapshot.packageDigest }),
    importProviderCanonicalState: async () => ({ importId: "import-1" }),
    verifyProviderParity: async () => ({ ready: true }),
    acknowledgeProviderPrepared: async ({ input: request }) => ({
      migrationOperationId: request.migrationOperationId,
      authorizationFingerprint: request.authorizationFingerprint,
      fenceId: "fence-1",
      packageDigest: snapshot.packageDigest,
      providerDeploymentId: "deployment-1",
    }),
    transferAuthorityAndRoute: async ({ commitAuthority }) => { await commitAuthority(); return { ready: true }; },
    verifyPostHandoff: async () => ({ ready: true }),
    restoreWindowsAuthority: async () => ({ ready: true }),
    enterProviderRecovery: async () => ({ ready: true }),
  };
}
