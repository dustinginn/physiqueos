import { describe, expect, it, vi } from "vitest";
import { createMorningBriefingFinalizationService } from "./MorningBriefingFinalizationService";

const command = {
  userId: "user",
  timeZone: "America/Los_Angeles",
  at: new Date("2026-08-09T16:00:00.000Z"),
};
const publication = {
  id: "weekly-current",
  userId: "user",
  cadence: "weekly",
  generatedAt: "2026-08-09T15:00:00.000Z",
  evidenceWindow: {
    id: "weekly:2026-08-02:2026-08-08:America/Los_Angeles",
    cadence: "weekly",
    startDate: "2026-08-02",
    endDate: "2026-08-08",
    closed: true,
    timeZone: "America/Los_Angeles",
  },
  briefing: { weeklyNarrative: {} },
};
const workItem = {
  id: "work-current",
  publicationRootId: publication.id,
  status: "revision_pending",
  enqueuedAt: "2026-08-09T15:30:00.000Z",
  affectedDependencies: [{ observedDate: "2026-08-08" }],
};

describe("MorningBriefingFinalizationService", () => {
  it("executes only the current publication work for the previous local date", async () => {
    const finalizePending = vi.fn(async () => ({
      attempted: 1, completed: 1, failed: 0,
      results: [{ status: "completed" }],
    }));
    const createBriefingService = vi.fn(() => ({ finalizePending }));
    const service = createService({ createBriefingService });

    await expect(service.finalize(command)).resolves.toMatchObject({
      status: "completed", evidenceDate: "2026-08-08",
      attempted: 1, completed: 1,
    });
    expect(finalizePending).toHaveBeenCalledWith({
      userId: "user", workItemIds: [workItem.id],
    });
  });

  it("does not construct execution for unrelated historical work", async () => {
    const createBriefingService = vi.fn();
    const historical = {
      ...workItem,
      id: "work-historical",
      publicationRootId: "weekly-historical",
    };
    const service = createService({ createBriefingService,
      workItems: [historical] });

    await expect(service.finalize(command)).resolves.toMatchObject({
      status: "current", attempted: 0,
    });
    expect(createBriefingService).not.toHaveBeenCalled();
  });

  it("keeps revision execution separate and retryable when it fails", async () => {
    const service = createService({
      createBriefingService: () => ({
        finalizePending: vi.fn(async () => ({
          attempted: 1, completed: 0, failed: 1,
          results: [{ status: "failed" }],
        })),
      }),
    });
    await expect(service.finalize(command)).resolves.toMatchObject({
      status: "failed", attempted: 1, failed: 1,
    });
  });

  it("does not publish while evidence still awaits confirmation", async () => {
    const createBriefingService = vi.fn();
    const service = createService({ createBriefingService,
      status: "pending_confirmation" });
    await expect(service.finalize(command)).resolves.toMatchObject({
      status: "waiting", attempted: 0,
    });
    expect(createBriefingService).not.toHaveBeenCalled();
  });
});

function createService({
  createBriefingService,
  status = null,
  workItems = [workItem],
}) {
  return createMorningBriefingFinalizationService({
    priorityService: selectionService(status),
    createBriefingService,
    listPublications: async () => [publication],
    listWorkItems: async () => workItems,
  });
}

function selectionService(status = null) {
  return {
    getSelection: vi.fn(async () => ({
      window: { previousLocalDate: "2026-08-08" },
      evidenceRecoveryItems: status ? [{ status }] : [],
    })),
  };
}
