import { describe, expect, it, vi } from "vitest";
import { createDurableOutboxWorker } from "./DurableOutboxWorker";

describe("durable outbox worker", () => {
  it("prevents simultaneous duplicate claims", async () => {
    const store = durableStore([message()]);
    const first = await store.claimNext({ workerId: "worker-a", now: at(0), leaseExpiresAt: at(60) });
    const second = await store.claimNext({ workerId: "worker-b", now: at(1), leaseExpiresAt: at(61) });
    expect(first.id).toBe("message-1");
    expect(second).toBeNull();
  });

  it("recovers claimed work after lease expiry and does not repeat completion", async () => {
    const store = durableStore([message()]);
    await store.claimNext({ workerId: "crashed", now: at(0), leaseExpiresAt: at(5) });
    let now = at(6);
    const handler = vi.fn().mockResolvedValue(undefined);
    const worker = createDurableOutboxWorker({ store, handlers: { "synthetic.test": handler }, workerId: "replacement", buildId: "build", clock: () => now });
    await expect(worker.runOnce()).resolves.toMatchObject({ outcome: "succeeded" });
    now = at(7);
    await expect(worker.runOnce()).resolves.toMatchObject({ outcome: "idle" });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("persists bounded retries and terminal failure", async () => {
    const store = durableStore([{ ...message(), attempt_count: 7 }]);
    const worker = createDurableOutboxWorker({ store, handlers: { "synthetic.test": async () => { throw Object.assign(new Error("secret detail"), { code: "SYNTHETIC_FAILURE" }); } }, workerId: "worker", buildId: "build", clock: () => at(0), maximumAttempts: 8 });
    await expect(worker.runOnce()).resolves.toMatchObject({ outcome: "dead" });
    expect(store.state[0]).toMatchObject({ status: "dead", last_error_code: "SYNTHETIC_FAILURE" });
    expect(store.state[0].last_error_detail).not.toContain("secret detail");
  });

  it("fails closed for an unregistered topic", async () => {
    const store = durableStore([message({ topic: "unknown" })]);
    const worker = createDurableOutboxWorker({ store, handlers: {}, workerId: "worker", buildId: "build", clock: () => at(0) });
    await expect(worker.runOnce()).resolves.toMatchObject({ outcome: "dead" });
  });
});

function durableStore(seed) {
  const state = structuredClone(seed);
  return {
    state,
    async heartbeat() {},
    async claimNext({ workerId, now, leaseExpiresAt }) {
      const item = state.find((entry) => entry.due_at <= now && (entry.status === "pending" || (entry.status === "processing" && entry.claim_expires_at <= now)));
      if (!item) return null;
      Object.assign(item, { status: "processing", claimed_by: workerId, claim_expires_at: leaseExpiresAt, attempt_count: item.attempt_count + 1 });
      return structuredClone(item);
    },
    async acknowledge({ id, workerId }) {
      const item = state.find((entry) => entry.id === id && entry.claimed_by === workerId && entry.status === "processing");
      if (!item) return null;
      Object.assign(item, { status: "succeeded", claimed_by: null, claim_expires_at: null });
      return structuredClone(item);
    },
    async fail({ id, workerId, dueAt, errorCode, errorDetail, terminal }) {
      const item = state.find((entry) => entry.id === id && entry.claimed_by === workerId && entry.status === "processing");
      if (!item) return null;
      Object.assign(item, { status: terminal ? "dead" : "pending", due_at: dueAt, last_error_code: errorCode, last_error_detail: errorDetail, claimed_by: null, claim_expires_at: null });
      return structuredClone(item);
    },
  };
}
function message(overrides = {}) { return { id: "message-1", topic: "synthetic.test", payload_version: "1", payload: {}, operation_id: null, due_at: at(0), claim_expires_at: null, status: "pending", attempt_count: 0, ...overrides }; }
function at(seconds) { return new Date(Date.UTC(2026, 7, 11, 0, 0, seconds)); }
