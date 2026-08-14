import { describe, expect, it, vi } from "vitest";
import { createAuthorityGatedWorker } from "./AuthorityGatedWorker.js";

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
});
