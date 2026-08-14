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

  it("polls only under complete provider authority", async () => {
    const runOnce = vi.fn(async () => ({ outcome: "idle" }));
    const gated = createAuthorityGatedWorker({
      worker: { runOnce, markStopping: vi.fn(), isStopping: () => false },
      authorityStore: { read: async () => ({ state: { authority: "provider-authoritative", workerAuthority: "provider", publicRuntimeAuthority: "provider", canonicalStoreEpoch: "postgres-canonical" } }) },
    });
    await gated.runOnce();
    expect(runOnce).toHaveBeenCalledOnce();
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
