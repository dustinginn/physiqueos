import { describe, expect, it } from "vitest";
import { createDailyFocusService } from "./DailyFocusService.js";
import {
  createPriorityOccurrenceKey,
  resolvePriorityExecutionContract,
  resolveScheduledTime,
} from "./ReminderOccurrenceCompletion.js";

describe("canonical Priority relationship", () => {
  it("uses reminder ID plus intended local date as the occurrence identity", () => {
    const contract = resolvePriorityExecutionContract({
      reminder: {
        id: "reminder_morning_weight",
        version: 7,
        linkedEvidenceType: "weight",
      },
      occurrenceDate: "2026-09-01",
    });
    expect(contract).toEqual({
      priorityId: "reminder_morning_weight",
      occurrenceDate: "2026-09-01",
      occurrenceKey: createPriorityOccurrenceKey("reminder_morning_weight", "2026-09-01"),
      expectedVersion: 7,
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

  it("does not invent a reminder version when the read source omits it", () => {
    const contract = resolvePriorityExecutionContract({
      reminder: { id: "reminder_foam_rolling" },
      occurrenceDate: "2026-09-01",
    });
    expect(contract.expectedVersion).toBeNull();
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

  it("resolves an already-exact schedule time as-is and a named bucket to its canonical hour", () => {
    expect(resolveScheduledTime("16:30")).toBe("16:30");
    expect(resolveScheduledTime("morning")).toBe("07:00");
    expect(resolveScheduledTime("night")).toBe("21:00");
    expect(resolveScheduledTime(null)).toBeNull();
    expect(resolveScheduledTime("not-a-real-bucket")).toBeNull();
  });

  it("Foam Rolling is direct-completion-allowed, and its notification schedule follows the canonical reminder schedule with no separate Native configuration", () => {
    const dailyFocus = (timeOfDay) => createDailyFocusService().getDailyFocus({
      now: new Date("2026-09-01T12:00:00.000Z"),
      timeZone: "UTC",
      reminders: [{
        id: "reminder_foam_roll",
        title: "Foam Rolling",
        type: "other",
        version: 3,
        active: true,
        persistenceMode: "always_visible",
        schedule: { type: "daily", timeOfDay },
      }],
    });

    const morning = dailyFocus("morning").find((item) => item.id === "reminder_foam_roll");
    expect(morning.notificationAction).toMatchObject({
      classification: "direct_completion_allowed",
      scheduledTime: "07:00",
      completionCommand: {
        commandType: "priority.complete.v1",
        expectedVersion: 3,
        payload: { priorityId: "reminder_foam_roll" },
      },
    });

    // The ONLY thing that changed is the canonical reminder's own schedule —
    // no Native-side scheduling configuration exists to update. This is the
    // whole point: Native must derive notification timing from this field,
    // never maintain a second, independently-adjustable schedule.
    const evening = dailyFocus("18:45").find((item) => item.id === "reminder_foam_roll");
    expect(evening.notificationAction.scheduledTime).toBe("18:45");
    expect(evening.notificationAction.classification).toBe("direct_completion_allowed");
  });
});
