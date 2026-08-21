import { describe, expect, it, vi } from "vitest";
import { createAuthorityGatedWorker } from "./AuthorityGatedWorker.js";
import { createCompatibilityRuntimeAuthorityState } from "../cutover/CombinedRuntimeAuthorityState.js";

describe("authority-gated worker", () => {
  it("does not poll while provider worker authority is paused", async () => {
    const runOnce = vi.fn();
    const heartbeat = vi.fn();
    const gated = createAuthorityGatedWorker({
      worker: { runOnce, markStopping: vi.fn(), isStopping: () => false },
      authorityStore: { read: async () => ({ state: { authority: "provider-prepared", workerAuthority: "paused", publicRuntimeAuthority: "windows", canonicalStoreEpoch: "legacy-json", version: 4 } }) },
      heartbeat,
      workerId: "worker-1",
      buildId: "build-1",
    });
    expect(await gated.runOnce()).toMatchObject({ outcome: "idle", authority: "provider-prepared" });
    expect(runOnce).not.toHaveBeenCalled();
    expect(heartbeat).toHaveBeenCalledWith(expect.objectContaining({ status: "paused_authority" }));
  });

  it("remains paused after phase L while the first provider write boundary is null", async () => {
    const runOnce = vi.fn();
    const heartbeat = vi.fn();
    const gated = createAuthorityGatedWorker({
      worker: { runOnce, markStopping: vi.fn(), isStopping: () => false },
      authorityStore: { read: async () => ({ state: providerState({ firstProviderCanonicalWriteAt: null, firstProviderCommandId: null }) }) },
      heartbeat,
    });
    expect(await gated.runOnce()).toMatchObject({ outcome: "idle", authority: "provider-authoritative" });
    expect(runOnce).not.toHaveBeenCalled();
    expect(heartbeat).toHaveBeenCalledWith(expect.objectContaining({
      status: "paused_authority",
      details: expect.objectContaining({ firstProviderWriteBoundaryRecorded: false }),
    }));
  });

  it("polls only under complete provider authority after the first provider write boundary", async () => {
    const runOnce = vi.fn(async () => ({ outcome: "idle" }));
    const gated = createAuthorityGatedWorker({
      worker: { runOnce, markStopping: vi.fn(), isStopping: () => false },
      authorityStore: { read: async () => ({ state: providerState() }) },
    });
    await gated.runOnce();
    expect(runOnce).toHaveBeenCalledOnce();
  });

  it("remains paused in recovery-required even after the boundary was crossed", async () => {
    const runOnce = vi.fn();
    const gated = createAuthorityGatedWorker({
      worker: { runOnce, markStopping: vi.fn(), isStopping: () => false },
      authorityStore: { read: async () => ({ state: providerState({ authority: "recovery-required", workerAuthority: "paused" }) }) },
    });
    expect(await gated.runOnce()).toMatchObject({ outcome: "idle", authority: "recovery-required" });
    expect(runOnce).not.toHaveBeenCalled();
  });

  it.each([
    ["missing timestamp", { firstProviderCanonicalWriteAt: undefined }],
    ["empty timestamp", { firstProviderCanonicalWriteAt: "" }],
    ["whitespace timestamp", { firstProviderCanonicalWriteAt: "  " }],
    ["malformed timestamp", { firstProviderCanonicalWriteAt: "not-a-timestamp" }],
    ["missing command identity", { firstProviderCommandId: null }],
  ])("fails closed for %s first-provider-write boundary evidence", async (_label, boundaryOverride) => {
    const runOnce = vi.fn();
    const gated = createAuthorityGatedWorker({
      worker: { runOnce, markStopping: vi.fn(), isStopping: () => false },
      authorityStore: { read: async () => ({ state: providerState(boundaryOverride) }) },
    });
    expect(await gated.runOnce()).toMatchObject({ outcome: "idle" });
    expect(runOnce).not.toHaveBeenCalled();
  });

  it("fails closed for an unknown authority even when the other provider fields and boundary look valid", async () => {
    const runOnce = vi.fn();
    const gated = createAuthorityGatedWorker({
      worker: { runOnce, markStopping: vi.fn(), isStopping: () => false },
      authorityStore: { read: async () => ({ state: providerState({ authority: "unknown-authority" }) }) },
    });
    expect(await gated.runOnce()).toMatchObject({ outcome: "idle", authority: "unknown-authority" });
    expect(runOnce).not.toHaveBeenCalled();
  });

  it("polls isolated work only under the exact compatibility tuple", async () => {
    const databaseName = "physiqueos_phase5_test_provider_20260811";
    const state = createCompatibilityRuntimeAuthorityState({
      environment: "compatibility-nonproduction",
      providerSource: { commit: "a".repeat(40), buildId: "build-1" },
      target: { databaseClusterId: "cluster", databaseName, spacesBucket: "synthetic-space" },
    });
    const runOnce = vi.fn(async () => ({ outcome: "idle" }));
    const gated = createAuthorityGatedWorker({
      worker: { runOnce, markStopping: vi.fn(), isStopping: () => false },
      authorityStore: { read: async () => ({ state }) },
      compatibilityMode: true,
      compatibilityEnvironment: "compatibility-nonproduction",
      compatibilityDatabaseName: databaseName,
    });
    await gated.runOnce();
    expect(runOnce).toHaveBeenCalledOnce();
  });

  it("rejects production authority and target drift in compatibility mode", async () => {
    const runOnce = vi.fn();
    const productionState = { authority: "provider-authoritative" };
    const gated = createAuthorityGatedWorker({
      worker: { runOnce, markStopping: vi.fn(), isStopping: () => false },
      authorityStore: { read: async () => ({ state: productionState }) },
      compatibilityMode: true,
      compatibilityEnvironment: "compatibility-nonproduction",
      compatibilityDatabaseName: "physiqueos_phase5_test_provider_20260811",
    });
    await expect(gated.runOnce()).rejects.toMatchObject({ code: "RUNTIME_AUTHORITY_COMPATIBILITY_REJECTED" });
    expect(runOnce).not.toHaveBeenCalled();
  });
});

function providerState(overrides = {}) {
  return {
    authority: "provider-authoritative",
    workerAuthority: "provider",
    publicRuntimeAuthority: "provider",
    canonicalStoreEpoch: "postgres-canonical",
    firstProviderCanonicalWriteAt: "2026-08-21T00:00:00.000Z",
    firstProviderCommandId: "command:first-provider-write",
    version: 5,
    ...overrides,
  };
}
