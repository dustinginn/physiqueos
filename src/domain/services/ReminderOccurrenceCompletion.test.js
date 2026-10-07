import { describe, expect, it } from "vitest";
import {
  isPrioritySkipSupportedReminder,
  isReminderOccurrenceCompleted,
  resolveNotificationAction,
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
        completionCommand: null, skipCommand: null, scheduledTime: "12:21" });
  });
  it("adds an explicit dose-free skipCommand beside the dose-aware peptide completion", () => {
    const action = protocolSupportNotificationAction({
      category: "peptide", priorityId: "reminder", occurrenceDate: "2026-09-15", timeOfDay: "21:45",
      executionContract: { priorityId: "reminder", occurrenceDate: "2026-09-15", expectedVersion: 33 },
      completable: true,
      completionContext: { dose: "0.5 mg", protocolId: "retatrutide" },
      skippable: true,
    });
    expect(action.classification).toBe("specialized_workflow_required");
    expect(action.completionCommand.payload).toEqual({
      priorityId: "reminder", occurrenceDate: "2026-09-15", dose: "0.5 mg", protocolId: "retatrutide",
    });
    expect(action.skipCommand).toEqual({
      commandType: "priority.skip.v1", expectedVersion: 33,
      payload: { priorityId: "reminder", occurrenceDate: "2026-09-15" },
    });
  });
  it("offers no skipCommand unless the occurrence is open, versioned and skippable", () => {
    const base = {
      category: "recovery", priorityId: "reminder", occurrenceDate: "2026-09-15", timeOfDay: "20:00",
      executionContract: { priorityId: "reminder", occurrenceDate: "2026-09-15", expectedVersion: 4 },
      completionContext: { dose: null, protocolId: "foam" },
    };
    expect(protocolSupportNotificationAction({ ...base, completable: true, skippable: true }).skipCommand)
      .toMatchObject({ commandType: "priority.skip.v1", expectedVersion: 4 });
    expect(protocolSupportNotificationAction({ ...base, completable: true, skippable: false }).skipCommand).toBeNull();
    expect(protocolSupportNotificationAction({ ...base, completable: false, skippable: true }).skipCommand).toBeNull();
    expect(protocolSupportNotificationAction({
      ...base, completable: true, skippable: true,
      executionContract: { ...base.executionContract, expectedVersion: null },
    }).skipCommand).toBeNull();
    const direct = { executionContract: { priorityId: "p", occurrenceDate: "2026-09-15", expectedVersion: 2, workflow: "priority_detail" }, completable: true, timeOfDay: "07:00" };
    expect(resolveNotificationAction({ ...direct, skippable: true }).skipCommand)
      .toEqual({ commandType: "priority.skip.v1", expectedVersion: 2, payload: { priorityId: "p", occurrenceDate: "2026-09-15" } });
    expect(resolveNotificationAction(direct).skipCommand).toBeNull();
    expect(resolveNotificationAction({ executionContract: { ...direct.executionContract, workflow: "morning_check_in" }, completable: false, skippable: true }).skipCommand)
      .toMatchObject({ commandType: "priority.skip.v1", expectedVersion: 2 });
  });
  it("does not maintain a domain allowlist for active Reminder-backed occurrences", () => {
    const support = (type, linkedEntityId = "protocol") => ({ id: "r", type, linkedEntityId, active: true });
    const protocol = (category, id = "protocol") => ({ id, category });
    expect(isPrioritySkipSupportedReminder({ id: "r", type: "other", active: true })).toBe(true);
    expect(isPrioritySkipSupportedReminder(support("protocol_reminder"), { protocol: protocol("peptide") })).toBe(true);
    expect(isPrioritySkipSupportedReminder(support("recovery_reminder"), { protocol: protocol("recovery") })).toBe(true);
    expect(isPrioritySkipSupportedReminder(support("supplement_reminder"), { protocol: protocol("supplement") })).toBe(true);
    expect(isPrioritySkipSupportedReminder(support("protocol_reminder"), { protocol: protocol("supplement") })).toBe(true);
    expect(isPrioritySkipSupportedReminder(support("protocol_reminder"), { protocol: protocol("peptide", "other") })).toBe(true);
    expect(isPrioritySkipSupportedReminder(support("protocol_reminder"), { protocol: null })).toBe(true);
    expect(isPrioritySkipSupportedReminder(support("protocol_reminder"))).toBe(true);
    expect(isPrioritySkipSupportedReminder(support("recovery_reminder"))).toBe(true);
    expect(isPrioritySkipSupportedReminder({ ...support("protocol_reminder"), active: false }, { protocol: protocol("peptide") })).toBe(false);
    expect(isPrioritySkipSupportedReminder({ id: "reminder_morning_weight", type: "morning_weigh_in", linkedEvidenceType: "weight", active: true })).toBe(true);
    expect(isPrioritySkipSupportedReminder({ id: "photos", type: "other", linkedEvidenceType: "progress_photo", active: true })).toBe(true);
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
