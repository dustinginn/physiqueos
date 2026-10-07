import { describe, expect, it, vi } from "vitest";
import { createPrioritySkipService } from "./PrioritySkipService.js";

describe("Web Priority Skip service", () => {
  it("executes the exact projected priority.skip.v1 command through the canonical port", async () => {
    const candidate = {
      user: [{ id: "founder", timeZone: "America/Los_Angeles", version: 1 }],
      reminders: [{
        id: "reminder_stretch", userId: "founder", title: "Stretch", type: "other", active: true,
        schedule: { type: "daily", timeOfDay: "morning" }, completionHistory: [], version: 4,
      }],
      protocols: [], executionItems: [], dailyCheckIns: [], weightEntries: [], progressPhotos: [],
      dexaScans: [], canonicalEvidenceObjects: [],
    };
    const mutateCanonicalRuntime = vi.fn(async (options) => ({
      result: await options.mutate(candidate), changedCollections: ["reminders", "dailyCheckIns"],
    }));
    const result = await createPrioritySkipService({
      mutateCanonicalRuntime,
      now: () => new Date("2026-08-11T12:00:00.000Z"),
    }).skip({
      commandType: "priority.skip.v1",
      expectedVersion: 4,
      payload: { priorityId: "reminder_stretch", occurrenceDate: "2026-08-11" },
    });

    expect(result).toMatchObject({ status: "skipped", priorityId: "reminder_stretch" });
    expect(candidate.reminders[0]).toMatchObject({ version: 5, completionHistory: [] });
    expect(candidate.dailyCheckIns[0].reconciliation[0]).toMatchObject({
      priorityId: "reminder_stretch", reminderId: "reminder_stretch", status: "skipped",
    });
    expect(mutateCanonicalRuntime).toHaveBeenCalledWith(expect.objectContaining({
      operation: "priority-skip",
      allowedCollections: ["dailyCheckIns", "executionItems", "reminders"],
    }));
  });

  it("refuses anything other than the Server-projected universal command", async () => {
    const service = createPrioritySkipService({ mutateCanonicalRuntime: vi.fn() });
    await expect(service.skip({ commandType: "supplement.skip" }))
      .rejects.toThrow("projected priority.skip.v1");
  });
});
