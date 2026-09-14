import { describe, expect, it } from "vitest";
import { createDailyFocusService } from "./DailyFocusService";

describe("Home fallback priority occurrence dates", () => {
  it("projects the server-local date on composite and semantic fallback priorities", () => {
    const focus = createDailyFocusService().getDailyFocus({
      now: new Date("2026-09-13T01:30:00.000Z"),
      timeZone: "America/Los_Angeles",
    });

    expect(focus).toEqual([
      expect.objectContaining({ id: "morning-check-in", occurrenceDate: "2026-09-12" }),
      expect.objectContaining({ id: "protein-goal", occurrenceDate: "2026-09-12" }),
      expect.objectContaining({ id: "activity-ring", occurrenceDate: "2026-09-12" }),
      expect.objectContaining({ id: "sleep-hours", occurrenceDate: "2026-09-12" }),
    ]);
  });

  it("classifies a grouped session as specialized and evidence-derived fallback habits as open_only", () => {
    const focus = createDailyFocusService().getDailyFocus({
      now: new Date("2026-09-13T01:30:00.000Z"),
      timeZone: "America/Los_Angeles",
    });

    const groupedSession = focus.find((item) => item.id === "morning-check-in");
    expect(groupedSession.notificationAction).toMatchObject({
      classification: "specialized_workflow_required",
      workflow: "grouped_session",
      completionCommand: null,
    });

    for (const id of ["protein-goal", "activity-ring", "sleep-hours"]) {
      const item = focus.find((entry) => entry.id === id);
      expect(item.notificationAction).toMatchObject({
        classification: "open_only",
        completionCommand: null,
      });
    }
  });
});
