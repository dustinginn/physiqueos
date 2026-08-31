import { describe, expect, it } from "vitest";
import {
  isReminderOccurrenceCompleted,
  resolveReminderOccurrenceDate,
} from "./ReminderOccurrenceCompletion.js";

describe("Reminder occurrence completion", () => {
  it("uses Founder-local date semantics for top-level completion", () => {
    const reminder = { completedAt: "2026-08-31T06:30:00Z" };
    expect(isReminderOccurrenceCompleted(reminder, {
      occurrenceDate: "2026-08-30",
      timeZone: "America/Los_Angeles",
    })).toBe(true);
    expect(isReminderOccurrenceCompleted(reminder, {
      occurrenceDate: "2026-08-31",
      timeZone: "America/Los_Angeles",
    })).toBe(false);
  });

  it("recognizes explicit deterministic completion-history dates", () => {
    expect(isReminderOccurrenceCompleted({
      completionHistory: [{ id: "reminder:2026-08-31", evidenceDate: "2026-08-31" }],
    }, {
      occurrenceDate: "2026-08-31",
      timeZone: "America/Los_Angeles",
    })).toBe(true);
  });

  it("prefers the explicit occurrence and otherwise derives the local date", () => {
    expect(resolveReminderOccurrenceDate({
      completedAt: "2026-08-31T06:30:00Z",
      occurrenceDate: "2026-08-29",
      timeZone: "America/Los_Angeles",
    })).toBe("2026-08-29");
    expect(resolveReminderOccurrenceDate({
      completedAt: "2026-08-31T06:30:00Z",
      timeZone: "America/Los_Angeles",
    })).toBe("2026-08-30");
  });
});
