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

  it("renews durable ownership while a long-running handler is still active", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(0));
    try {
      const store = durableStore([message()]);
      const handler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1_100));
      });
      const worker = createDurableOutboxWorker({
        store,
        handlers: { "synthetic.test": handler },
        workerId: "worker",
        buildId: "build",
        clock: () => new Date(Date.now()),
        leaseMs: 3_000,
      });
      const result = worker.runOnce();
      await vi.advanceTimersByTimeAsync(1_100);
      await expect(result).resolves.toMatchObject({ outcome: "succeeded" });
      expect(store.renewals).toHaveLength(1);
      expect(store.state[0]).toMatchObject({ status: "succeeded", attempt_count: 1 });
    } finally {
      vi.useRealTimers();
    }
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

describe("durable outbox worker lease ownership under long-running work", () => {
  it("keeps ownership of legitimate work that runs far longer than one 60 second lease", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(0));
    try {
      const store = durableStore([message()]);
      let ownershipDuringWork = null;
      const handler = vi.fn(async ({ assertLease }) => {
        // Four minutes of real work: analysis of five photos, one at a time.
        await new Promise((resolve) => setTimeout(resolve, 240_000));
        assertLease();
        ownershipDuringWork = store.state[0].claimed_by;
      });
      const worker = createDurableOutboxWorker({
        store, handlers: { "synthetic.test": handler }, workerId: "worker", buildId: "build",
        clock: () => new Date(Date.now()),
      });
      const result = worker.runOnce();
      await vi.advanceTimersByTimeAsync(240_000);
      await expect(result).resolves.toMatchObject({ outcome: "succeeded" });
      expect(ownershipDuringWork).toBe("worker");
      // Renewed every 20 seconds for four minutes, each time extending a full lease.
      expect(store.renewals.length).toBeGreaterThanOrEqual(11);
      expect(store.state[0]).toMatchObject({ status: "succeeded", attempt_count: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops renewing as soon as the message completes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(0));
    try {
      const store = durableStore([message()]);
      const worker = createDurableOutboxWorker({
        store, handlers: { "synthetic.test": async () => { await new Promise((resolve) => setTimeout(resolve, 45_000)); } },
        workerId: "worker", buildId: "build", clock: () => new Date(Date.now()),
      });
      const result = worker.runOnce();
      await vi.advanceTimersByTimeAsync(45_000);
      await result;
      const renewalsAtCompletion = store.renewals.length;
      await vi.advanceTimersByTimeAsync(300_000);
      expect(store.renewals.length).toBe(renewalsAtCompletion);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not treat one transient renewal failure as loss of ownership", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(0));
    try {
      const store = durableStore([message()]);
      const original = store.renewLease;
      let calls = 0;
      store.renewLease = async (input) => {
        calls += 1;
        if (calls === 1) throw new Error("connection reset");
        return original(input);
      };
      const worker = createDurableOutboxWorker({
        store, handlers: { "synthetic.test": async ({ assertLease }) => {
          await new Promise((resolve) => setTimeout(resolve, 50_000));
          assertLease();
        } },
        workerId: "worker", buildId: "build", clock: () => new Date(Date.now()),
      });
      const result = worker.runOnce();
      await vi.advanceTimersByTimeAsync(50_000);
      await expect(result).resolves.toMatchObject({ outcome: "succeeded" });
      expect(calls).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("detects authoritative loss: no renewal row means another claim or an expired lease", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(0));
    try {
      const store = durableStore([message()]);
      store.renewLease = async () => null;
      const worker = createDurableOutboxWorker({
        store, handlers: { "synthetic.test": async ({ assertLease }) => {
          await new Promise((resolve) => setTimeout(resolve, 25_000));
          assertLease();
        } },
        workerId: "worker", buildId: "build", clock: () => new Date(Date.now()),
      });
      const result = worker.runOnce();
      await vi.advanceTimersByTimeAsync(25_000);
      await expect(result).resolves.toMatchObject({ outcome: "retry_scheduled" });
      expect(store.state[0].last_error_code).toBe("OUTBOX_LEASE_LOST");
      expect(store.state[0].status).not.toBe("succeeded");
    } finally {
      vi.useRealTimers();
    }
  });

  it("detects loss when the event loop could not renew and the local lease has lapsed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(0));
    try {
      const store = durableStore([message()]);
      store.renewLease = async () => { throw new Error("pool exhausted"); };
      const worker = createDurableOutboxWorker({
        store, handlers: { "synthetic.test": async ({ assertLease }) => {
          await new Promise((resolve) => setTimeout(resolve, 65_000));
          assertLease();
        } },
        workerId: "worker", buildId: "build", clock: () => new Date(Date.now()),
      });
      const result = worker.runOnce();
      await vi.advanceTimersByTimeAsync(65_000);
      const outcome = await result;
      expect(outcome.outcome).not.toBe("succeeded");
      expect(store.state[0].status).not.toBe("succeeded");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never lets a second worker claim a message while the first still renews it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(0));
    try {
      const store = durableStore([message()]);
      let second = "unset";
      const worker = createDurableOutboxWorker({
        store, handlers: { "synthetic.test": async () => {
          await new Promise((resolve) => setTimeout(resolve, 100_000));
        } },
        workerId: "first", buildId: "build", clock: () => new Date(Date.now()),
      });
      const result = worker.runOnce();
      for (let elapsed = 0; elapsed < 100_000; elapsed += 10_000) {
        await vi.advanceTimersByTimeAsync(10_000);
        second = await store.claimNext({ workerId: "second", now: new Date(Date.now()), leaseExpiresAt: new Date(Date.now() + 60_000) });
        expect(second).toBeNull();
      }
      await result;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("durable outbox worker bounded retry and dead-letter ownership", () => {
  it("dead-letters a message claimed more than the maximum without running it and tells its owner", async () => {
    // Three claims by a process that died each time: a crashed process never calls fail().
    const store = durableStore([{ ...message({ status: "processing", claimed_by: "old", claim_expires_at: at(1) }), attempt_count: 3 }]);
    const handler = vi.fn();
    const onDead = vi.fn(async () => undefined);
    handler.onDead = onDead;
    const worker = createDurableOutboxWorker({ store, handlers: { "synthetic.test": handler }, workerId: "new", buildId: "build", maximumAttempts: 3, clock: () => at(10) });
    await expect(worker.runOnce()).resolves.toMatchObject({ outcome: "dead", persisted: true });
    expect(handler).not.toHaveBeenCalled();
    expect(store.state[0]).toMatchObject({ status: "dead", last_error_code: "OUTBOX_ATTEMPTS_EXHAUSTED", attempt_count: 4 });
    expect(onDead).toHaveBeenCalledOnce();
    expect(onDead.mock.calls[0][0]).toMatchObject({ messageId: "message-1", errorCode: "OUTBOX_ATTEMPTS_EXHAUSTED" });
  });

  it("still runs the final permitted attempt", async () => {
    const store = durableStore([{ ...message({ status: "processing", claimed_by: "old", claim_expires_at: at(1) }), attempt_count: 2 }]);
    const handler = vi.fn(async () => undefined);
    const worker = createDurableOutboxWorker({ store, handlers: { "synthetic.test": handler }, workerId: "new", buildId: "build", maximumAttempts: 3, clock: () => at(10) });
    await expect(worker.runOnce()).resolves.toMatchObject({ outcome: "succeeded" });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("keeps transient failures automatic and calls the owner only when the message actually dies", async () => {
    const store = durableStore([message()]);
    const onDead = vi.fn(async () => undefined);
    const handler = Object.assign(async () => { throw Object.assign(new Error("boom"), { code: "SYNTHETIC_FAILURE" }); }, { onDead });
    let now = at(0);
    const worker = createDurableOutboxWorker({ store, handlers: { "synthetic.test": handler }, workerId: "w", buildId: "build", maximumAttempts: 3, clock: () => now });
    await expect(worker.runOnce()).resolves.toMatchObject({ outcome: "retry_scheduled" });
    expect(onDead).not.toHaveBeenCalled();
    now = at(3600);
    await expect(worker.runOnce()).resolves.toMatchObject({ outcome: "retry_scheduled" });
    expect(onDead).not.toHaveBeenCalled();
    now = at(7200);
    await expect(worker.runOnce()).resolves.toMatchObject({ outcome: "dead" });
    expect(onDead).toHaveBeenCalledOnce();
    expect(onDead.mock.calls[0][0]).toMatchObject({ errorCode: "SYNTHETIC_FAILURE" });
  });

  it("does not call the owner when this worker could not persist the dead state", async () => {
    const store = durableStore([{ ...message(), attempt_count: 2 }]);
    store.fail = async () => null;
    const onDead = vi.fn();
    const handler = Object.assign(async () => { throw new Error("boom"); }, { onDead });
    const worker = createDurableOutboxWorker({ store, handlers: { "synthetic.test": handler }, workerId: "w", buildId: "build", maximumAttempts: 3, clock: () => at(0) });
    await expect(worker.runOnce()).resolves.toMatchObject({ outcome: "dead", persisted: false });
    expect(onDead).not.toHaveBeenCalled();
  });

  it("survives an owner hook that throws", async () => {
    const store = durableStore([{ ...message({ status: "processing", claimed_by: "old", claim_expires_at: at(1) }), attempt_count: 3 }]);
    const errors = [];
    const handler = Object.assign(vi.fn(), { onDead: async () => { throw new Error("hook failed"); } });
    const worker = createDurableOutboxWorker({
      store, handlers: { "synthetic.test": handler }, workerId: "w", buildId: "build", maximumAttempts: 3,
      clock: () => at(10), logger: { error: (event, fields) => errors.push({ event, fields }), info() {} },
    });
    await expect(worker.runOnce()).resolves.toMatchObject({ outcome: "dead" });
    expect(errors.some((entry) => entry.event === "outbox.dead_hook_failed")).toBe(true);
  });
});

function durableStore(seed) {
  const state = structuredClone(seed);
  const heartbeats = [];
  const renewals = [];
  return {
    state,
    heartbeats,
    renewals,
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
    async renewLease({ id, workerId, at: observedAt, leaseExpiresAt }) {
      const item = state.find((entry) => entry.id === id && entry.claimed_by === workerId && entry.status === "processing" && entry.claim_expires_at > observedAt);
      if (!item) return null;
      renewals.push({ id, workerId, at: observedAt, leaseExpiresAt });
      Object.assign(item, { claim_expires_at: leaseExpiresAt });
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
