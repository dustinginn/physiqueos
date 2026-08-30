import { describe, expect, it, vi } from "vitest";
import { runBriefingCadenceLoop } from "./BriefingCadenceWorker";

describe("provider briefing cadence loop", () => {
  it("runs immediately, remains independent of outbox work, and stops on abort", async () => {
    const controller = new AbortController();
    const execute = vi.fn(async () => ({
      runId: "run",
      lockAcquired: true,
      outcomes: [{ cadenceKey: "weekly", resultStatus: "already_completed" }],
    }));
    const wait = vi.fn(async () => controller.abort());
    await runBriefingCadenceLoop({
      execute,
      signal: controller.signal,
      wait,
      pollIntervalMs: 50,
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(wait).toHaveBeenCalledWith(50, controller.signal);
  });

  it("isolates a failed cadence tick and remains retryable", async () => {
    const controller = new AbortController();
    const execute = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("transient"), { code: "TRANSIENT" }))
      .mockResolvedValueOnce({ outcomes: [] });
    const logger = { error: vi.fn(), info: vi.fn() };
    let waits = 0;
    await runBriefingCadenceLoop({
      execute,
      signal: controller.signal,
      logger,
      wait: async () => {
        waits += 1;
        if (waits === 2) controller.abort();
      },
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      "briefing.cadence.tick_failed",
      { code: "TRANSIENT" }
    );
  });
});
