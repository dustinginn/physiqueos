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

  it("cannot acknowledge or reschedule after another worker acquires an expired lease", async () => {
    const store = durableStore([message()]);
    let now = at(0);
    const worker = createDurableOutboxWorker({
      store,
      handlers: { "synthetic.test": async () => {
        now = at(61);
        await store.claimNext({ workerId: "replacement", now,
          leaseExpiresAt: at(121) });
      } },
      workerId: "slow-worker",
      buildId: "build",
      clock: () => now,
    });
    await expect(worker.runOnce()).resolves.toMatchObject({
      outcome: "retry_scheduled", persisted: false,
    });
    expect(store.state[0]).toMatchObject({
      status: "processing", claimed_by: "replacement", attempt_count: 2,
    });
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
    expect(store.state[0]).toMatchObject({ status: "dead", last_error_code: "OUTBOX_TOPIC_UNSUPPORTED" });
  });

  it("still fails closed for topics that formerly had speculative producers, since no handler is registered for them", async () => {
    for (const topic of ["canonical.read-model.invalidate", "canonical.media.verified"]) {
      const store = durableStore([message({ topic })]);
      const worker = createDurableOutboxWorker({ store, handlers: { "foundation.synthetic": vi.fn() }, workerId: "worker", buildId: "build", clock: () => at(0) });
      await expect(worker.runOnce()).resolves.toMatchObject({ outcome: "dead" });
      expect(store.state[0]).toMatchObject({ status: "dead", last_error_code: "OUTBOX_TOPIC_UNSUPPORTED" });
    }
  });

  it("claims only an exact allowed topic while retaining paused-authority heartbeat semantics", async () => {
    const canonical = message({ id: "canonical", topic: "canonical.read-model.invalidate" });
    const nearMatch = message({ id: "near-match", topic: "operations.simplified-provider-migration-extra" });
    const controlPlane = message({ id: "control-plane", topic: "operations.simplified-provider-migration" });
    const store = durableStore([canonical, nearMatch, controlPlane]);
    const handler = vi.fn();
    const worker = createDurableOutboxWorker({
      store,
      handlers: { "operations.simplified-provider-migration": handler },
      workerId: "worker",
      buildId: "build",
      clock: () => at(0),
    });
    await expect(worker.runOnce({
      allowedTopics: ["operations.simplified-provider-migration"],
      heartbeatStatus: "paused_authority",
      heartbeatDetails: { controlPlaneOnly: true },
    })).resolves.toMatchObject({ outcome: "succeeded", messageId: "control-plane" });
    expect(handler).toHaveBeenCalledOnce();
    expect(store.state.find((entry) => entry.id === "canonical")).toMatchObject({ status: "pending", attempt_count: 0 });
    expect(store.state.find((entry) => entry.id === "near-match")).toMatchObject({ status: "pending", attempt_count: 0 });
    expect(store.heartbeats).toEqual([expect.objectContaining({ status: "paused_authority", details: { controlPlaneOnly: true } })]);
  });
});

function durableStore(seed) {
  const state = structuredClone(seed);
  const heartbeats = [];
  return {
    state,
    heartbeats,
    async heartbeat(value) { heartbeats.push(structuredClone(value)); },
    async claimNext({ workerId, now, leaseExpiresAt, allowedTopics = null }) {
      const item = state.find((entry) => (allowedTopics == null || allowedTopics.includes(entry.topic)) && entry.due_at <= now && (entry.status === "pending" || (entry.status === "processing" && entry.claim_expires_at <= now)));
      if (!item) return null;
      Object.assign(item, { status: "processing", claimed_by: workerId, claim_expires_at: leaseExpiresAt, attempt_count: item.attempt_count + 1 });
      return structuredClone(item);
    },
    async acknowledge({ id, workerId, at: observedAt }) {
      const item = state.find((entry) => entry.id === id && entry.claimed_by === workerId && entry.status === "processing" && entry.claim_expires_at > observedAt);
      if (!item) return null;
      Object.assign(item, { status: "succeeded", claimed_by: null, claim_expires_at: null });
      return structuredClone(item);
    },
    async fail({ id, workerId, at: observedAt, dueAt, errorCode, errorDetail, terminal }) {
      const item = state.find((entry) => entry.id === id && entry.claimed_by === workerId && entry.status === "processing" && entry.claim_expires_at > observedAt);
      if (!item) return null;
      Object.assign(item, { status: terminal ? "dead" : "pending", due_at: dueAt, last_error_code: errorCode, last_error_detail: errorDetail, claimed_by: null, claim_expires_at: null });
      return structuredClone(item);
    },
  };
}
function message(overrides = {}) { return { id: "message-1", topic: "synthetic.test", payload_version: "1", payload: {}, operation_id: null, due_at: at(0), claim_expires_at: null, status: "pending", attempt_count: 0, ...overrides }; }
function at(seconds) { return new Date(Date.UTC(2026, 7, 11, 0, 0, seconds)); }
