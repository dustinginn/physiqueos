import { describe, expect, it } from "vitest";
import {
  isReminderOccurrenceCompleted,
  resolveReminderOccurrenceDate,
  protocolSupportNotificationAction,
} from "./ReminderOccurrenceCompletion.js";

describe("Reminder occurrence completion", () => {
  it.each([
    ["recovery", "priority_detail"],
    ["supplement", "priority_detail"],
    ["peptide", "peptide_protocol"],
  ])("keeps %s Support notification routing domain-aware and specialized", (category, workflow) => {
    expect(protocolSupportNotificationAction({ category, priorityId: "reminder", occurrenceDate: "2026-09-15", timeOfDay: "12:21" }))
      .toEqual({ classification: "specialized_workflow_required", workflow,
        destination: { priorityId: "reminder", occurrenceDate: "2026-09-15" },
        completionCommand: null, scheduledTime: "12:21" });
  });
  it("carries the canonical dose-aware completion command for an actionable peptide", () => {
    expect(protocolSupportNotificationAction({
      category: "peptide", priorityId: "reminder", occurrenceDate: "2026-09-15", timeOfDay: "21:45",
      executionContract: { priorityId: "reminder", occurrenceDate: "2026-09-15", expectedVersion: 33 },
      completable: true,
      completionContext: { dose: "0.5 mg", protocolId: "retatrutide" },
    })).toMatchObject({
      classification: "specialized_workflow_required",
      workflow: "peptide_protocol",
      completionCommand: {
        commandType: "priority.complete.v1", expectedVersion: 33,
        payload: { priorityId: "reminder", occurrenceDate: "2026-09-15", dose: "0.5 mg", protocolId: "retatrutide" },
      },
    });
  });
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
