import { describe, expect, it } from "vitest";
import { createDailyFocusService } from "./DailyFocusService.js";
import {
  createPriorityOccurrenceKey,
  resolvePriorityExecutionContract,
} from "./ReminderOccurrenceCompletion.js";

describe("canonical Priority relationship", () => {
  it("uses reminder ID plus intended local date as the occurrence identity", () => {
    const contract = resolvePriorityExecutionContract({
      reminder: {
        id: "reminder_morning_weight",
        linkedEvidenceType: "weight",
      },
      occurrenceDate: "2026-09-01",
    });
    expect(contract).toEqual({
      priorityId: "reminder_morning_weight",
      occurrenceDate: "2026-09-01",
      occurrenceKey: createPriorityOccurrenceKey("reminder_morning_weight", "2026-09-01"),
      workflow: "morning_check_in",
      destination: "/check-in/morning",
    });
  });

  it("does not route by a display-title coincidence", () => {
    expect(resolvePriorityExecutionContract({
      reminder: { id: "generic", title: "Morning Weigh-In", type: "other" },
      occurrenceDate: "2026-09-01",
    }).workflow).toBe("priority_detail");
  });

  it("keeps a dated completion-history occurrence out of Home", () => {
    const items = createDailyFocusService().getDailyFocus({
      now: new Date("2026-09-01T12:00:00.000Z"),
      timeZone: "UTC",
      reminders: [{
        id: "reminder_foam_roll",
        title: "Foam Rolling",
        type: "other",
        active: true,
        persistenceMode: "always_visible",
        schedule: { type: "daily", timeOfDay: "morning" },
        completionHistory: [{ occurrenceDate: "2026-09-01", completedAt: "2026-09-01T08:00:00.000Z" }],
      }],
    });
    expect(items.some((item) => item.id === "reminder_foam_roll")).toBe(false);
  });
});
