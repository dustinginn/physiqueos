import { describe, expect, it } from "vitest";
import { createDailyFocusService } from "./DailyFocusService";

describe("Home fallback priority occurrence dates", () => {
  it("projects the server-local date on every semantic fallback priority", () => {
    const focus = createDailyFocusService().getDailyFocus({
      now: new Date("2026-09-13T01:30:00.000Z"),
      timeZone: "America/Los_Angeles",
    });

    const fallback = focus.filter((item) =>
      ["protein-goal", "activity-ring", "sleep-hours"].includes(item.id)
    );
    expect(fallback).toEqual([
      expect.objectContaining({ id: "protein-goal", occurrenceDate: "2026-09-12" }),
      expect.objectContaining({ id: "activity-ring", occurrenceDate: "2026-09-12" }),
      expect.objectContaining({ id: "sleep-hours", occurrenceDate: "2026-09-12" }),
    ]);
  });
});
