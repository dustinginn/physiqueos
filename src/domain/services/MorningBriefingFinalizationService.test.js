import { describe, expect, it, vi } from "vitest";
import { createMorningBriefingFinalizationService } from "./MorningBriefingFinalizationService";

const command = {
  userId: "user",
  timeZone: "America/Los_Angeles",
  at: new Date("2026-08-09T16:00:00.000Z"),
};

describe("MorningBriefingFinalizationService", () => {
  it("executes the persisted late-evidence work for the previous local date", async () => {
    const finalizePending = vi.fn(async () => ({
      attempted: 1,
      completed: 1,
      failed: 0,
      results: [{ status: "completed" }],
    }));
    const service = createMorningBriefingFinalizationService({
      priorityService: selectionService(),
      briefingService: { finalizePending },
    });

    await expect(service.finalize(command)).resolves.toMatchObject({
      status: "completed",
      evidenceDate: "2026-08-08",
      attempted: 1,
      completed: 1,
    });
    expect(finalizePending).toHaveBeenCalledWith({
      userId: "user",
      evidenceDate: "2026-08-08",
    });
  });

  it("keeps revision execution separate and retryable when it fails", async () => {
    const service = createMorningBriefingFinalizationService({
      priorityService: selectionService(),
      briefingService: {
        finalizePending: vi.fn(async () => ({
          attempted: 1,
          completed: 0,
          failed: 1,
          results: [{ status: "failed" }],
        })),
      },
    });

    await expect(service.finalize(command)).resolves.toMatchObject({
      status: "failed",
      attempted: 1,
      failed: 1,
    });
  });

  it("does not publish while evidence still awaits confirmation", async () => {
    const finalizePending = vi.fn();
    const service = createMorningBriefingFinalizationService({
      priorityService: selectionService("pending_confirmation"),
      briefingService: { finalizePending },
    });

    await expect(service.finalize(command)).resolves.toMatchObject({
      status: "waiting",
      attempted: 0,
    });
    expect(finalizePending).not.toHaveBeenCalled();
  });
});

function selectionService(status = null) {
  return {
    getSelection: vi.fn(async () => ({
      window: { previousLocalDate: "2026-08-08" },
      evidenceRecoveryItems: status ? [{ status }] : [],
    })),
  };
}
