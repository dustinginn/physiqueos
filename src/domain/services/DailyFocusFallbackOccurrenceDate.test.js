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
});
