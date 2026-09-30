import { describe, expect, it, vi } from "vitest";
import { DEFAULT_IDLE_BACKOFF_MS, runWorkerLoop } from "./workerLoop.js";

describe("worker loop idle cadence", () => {
  it("backs off progressively, caps, and resets immediately after work", async () => {
    const outcomes = ["idle", "idle", "idle", "succeeded", "idle", "idle"];
    const waits = [];
    const telemetry = [];
    const worker = {
      runOnce: vi.fn(async () => ({ outcome: outcomes.shift() ?? "stopping" })),
      isStopping: () => outcomes.length === 0,
      markStopping: vi.fn(),
    };
    await runWorkerLoop({
      worker,
      wait: async (milliseconds) => waits.push(milliseconds),
      onTelemetry: (event) => telemetry.push(event),
    });
    expect(waits).toEqual([1_000, 2_000, 4_000, 1_000, 2_000]);
    expect(telemetry.find((event) => event.event === "worker.idle_reset")).toMatchObject({
      previousDelayMs: 4_000,
      idlePollCount: 3,
    });
    expect(worker.runOnce).toHaveBeenCalledTimes(6);
    expect(worker.markStopping).toHaveBeenCalledOnce();
  });

  it("caps sustained idle polling at thirty seconds without spinning", async () => {
    const waits = [];
    let calls = 0;
    const worker = {
      async runOnce() { calls += 1; return { outcome: "idle" }; },
      isStopping: () => calls >= 8,
      markStopping: vi.fn(),
    };
    await runWorkerLoop({ worker, wait: async (milliseconds) => waits.push(milliseconds) });
    expect(waits).toEqual([1_000, 2_000, 4_000, 8_000, 15_000, 30_000, 30_000, 30_000]);
    expect(DEFAULT_IDLE_BACKOFF_MS.at(-1)).toBe(30_000);
  });

  it("stops an aborting wait and validates the schedule", async () => {
    await expect(runWorkerLoop({ worker: { runOnce: vi.fn(), isStopping: () => true, markStopping: vi.fn() }, idleBackoffMs: [] })).rejects.toThrow(/positive/);
  });
});
