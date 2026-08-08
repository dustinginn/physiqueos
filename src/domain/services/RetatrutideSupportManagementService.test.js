import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generatePeptideDosingTimeline } from "../models/PeptideDosingStrategyModel";
import { supportScheduleToExecution } from "../models/SupportScheduleModel";
import { createDailyFocusService } from "./DailyFocusService";
import { createPeptideExecutionManagementService, createPeptideSupportHydrationModel, resolvePeptideDose } from "./PeptideExecutionManagementService";

describe("Retatrutide Support management", () => {
  it("atomically saves generated phases and synchronizes the canonical reminder without changing history or hidden priority", async () => {
    const fixture = setup();
    const completionHistory = structuredClone(fixture.live.reminders[0].completionHistory);
    const completedAt = fixture.live.reminders[0].completedAt;
    const originalTimeline = structuredClone(fixture.live.executionItems[0].timeline);
    const result = await fixture.service.save(command(fixture, { draft: draft({ daysOfWeek: ["friday"], specificTime: "20:30" }) }));
    expect(result.outcome).toBe("success");
    const execution = fixture.live.executionItems[0];
    const reminder = fixture.live.reminders[0];
    expect(execution.priority).toBe("high");
    expect(execution.timeline).toHaveLength(7);
    expect(execution.notes).toBe("Saved execution note");
    expect(execution.timelineHistory.at(-1).timeline).toEqual(originalTimeline);
    expect(execution.timeline.at(-1)).toMatchObject({ startDate: "2026-08-06", endDate: null, dose: { amount: "0.5", unit: "mg" } });
    expect(resolvePeptideDose(execution, "2030-01-01").current.dose.amount).toBe("0.5");
    expect(resolvePeptideDose(execution, "2026-05-21")).toMatchObject({ current: { dose: { amount: "0.5" } }, next: { startDate: "2026-05-28", dose: { amount: "1" } } });
    expect(reminder).toMatchObject({ id: "reminder_reta", active: true, schedule: { daysOfWeek: ["friday"], timeOfDay: "20:30" } });
    expect(reminder.completedAt).toBe(completedAt);
    expect(reminder.completionHistory).toEqual(completionHistory);
    expect(createPeptideSupportHydrationModel({ executionItem: execution, protocol: fixture.live.protocols[0], reminder }).dosingMode).toBe("structured");
  });

  it("disables reminder-driven projection while preserving reminder history", async () => {
    const fixture = setup();
    const support = draft({ reminderPreference: "none" });
    const saved = await fixture.service.save(command(fixture, { draft: support }));
    expect(saved.outcome).toBe("success");
    expect(fixture.live.reminders[0]).toMatchObject({ active: false, completedAt: "2026-07-30T20:00:00Z", completionHistory: [{ date: "2026-07-23", status: "completed" }] });
    const priorities = createDailyFocusService().getDailyFocus({
      checkIns: [],
      executionItems: fixture.live.executionItems,
      now: new Date("2026-08-07T22:00:00Z"),
      protocols: fixture.live.protocols,
      reminders: fixture.live.reminders,
      timeZone: "America/Los_Angeles",
    });
    expect(priorities.some((item) => item.label === "Retatrutide")).toBe(false);
  });

  it("keeps an unrepresentable manual timeline byte-for-byte through the custom compatibility path", async () => {
    const fixture = setup();
    const before = structuredClone(fixture.live.executionItems[0].timeline);
    const compatibilityDraft = draft({ timelineOperation: "preserve", timeline: [], dosingStrategy: null });
    const saved = await fixture.service.save(command(fixture, { draft: compatibilityDraft }));
    expect(saved.outcome).toBe("success");
    expect(fixture.live.executionItems[0].timeline).toEqual(before);
    expect(createPeptideSupportHydrationModel({ executionItem: fixture.live.executionItems[0], protocol: fixture.live.protocols[0] }).dosingMode).toBe("legacy_custom");
  });

  it("uses the same atomic reminder and history path for migrated Tesamorelin Support", async () => {
    const fixture = setup();
    const peptide = fixture.live.protocols[0];
    const execution = fixture.live.executionItems[0];
    const reminder = fixture.live.reminders[0];
    peptide.id = "tesa";
    peptide.name = "Tesamorelin";
    execution.id = "execution_tesa";
    execution.title = "Tesamorelin";
    execution.protocolRootId = peptide.id;
    execution.cadence = { type: "weekly" };
    execution.preferredSchedule = {
      daysOfWeek: ["sunday", "monday", "tuesday", "wednesday", "thursday"],
      timeOfDay: "21:45",
      startDate: "2026-05-24",
      endDate: null,
    };
    execution.notes = "Should be fasted 2-3 hours before injection";
    execution.timeline = [{ startDate: "2026-05-24", endDate: null, dose: { amount: ".5", unit: "mg" }, notes: "" }];
    reminder.id = "reminder_tesa";
    reminder.title = "Tesamorelin";
    reminder.linkedEntityId = peptide.id;
    fs.writeFileSync(fixture.file, JSON.stringify(fixture.live));
    const completionHistory = structuredClone(reminder.completionHistory);
    const schedule = { frequency: "specific_days", daysOfWeek: execution.preferredSchedule.daysOfWeek, timing: "specific", specificTime: "21:45", startDate: "2026-05-24", endDate: null };
    const strategy = { pattern: "stay", startingDose: { amount: "0.5", unit: "mg" }, startDate: "2026-05-24", endDate: null };
    const supportDraft = {
      ...supportScheduleToExecution(schedule),
      supportSchedule: schedule,
      dosingStrategy: strategy,
      timingContext: "fasted_before_bed",
      reminderPreference: "remind",
      priority: "normal",
      notes: execution.notes,
      timelineOperation: "replace",
      timeline: generatePeptideDosingTimeline(strategy),
    };
    const saved = await fixture.service.save({
      protocolId: peptide.id,
      userId: "user",
      expectedRevision: 1,
      author: { type: "user", id: "user" },
      synchronizeReminder: true,
      preservePriority: true,
      preserveTimelineHistory: true,
      draft: supportDraft,
    });

    expect(saved.outcome).toBe("success");
    expect(fixture.live.executionItems[0]).toMatchObject({
      priority: "high",
      notes: "Should be fasted 2-3 hours before injection",
      timeline: [{ startDate: "2026-05-24", endDate: null, dose: { amount: "0.5", unit: "mg" } }],
    });
    expect(fixture.live.executionItems[0].timelineHistory.at(-1).timeline).toEqual([
      { startDate: "2026-05-24", endDate: null, dose: { amount: ".5", unit: "mg" }, notes: "" },
    ]);
    expect(fixture.live.reminders[0]).toMatchObject({
      id: "reminder_tesa",
      active: true,
      schedule: { daysOfWeek: schedule.daysOfWeek, timeOfDay: "21:45" },
    });
    expect(fixture.live.reminders[0].completionHistory).toEqual(completionHistory);

    const disabled = await fixture.service.save({
      protocolId: peptide.id,
      userId: "user",
      expectedRevision: 2,
      author: { type: "user", id: "user" },
      synchronizeReminder: true,
      preservePriority: true,
      preserveTimelineHistory: true,
      draft: { ...supportDraft, reminderPreference: "none" },
    });
    expect(disabled.outcome).toBe("success");
    expect(fixture.live.reminders[0].active).toBe(false);
    expect(fixture.live.reminders[0].completionHistory).toEqual(completionHistory);
  });
});

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "retatrutide-support-"));
  const file = path.join(directory, "runtime.json");
  const live = {
    version: "test", revision: 0,
    protocols: [{ id: "reta", userId: "user", name: "Retatrutide", category: "peptide", status: "active", currentGoalIds: ["goal"], relatedGoalIds: [] }],
    executionItems: [{ id: "execution_reta", userId: "user", type: "peptide", title: "Retatrutide", active: true, protocolRootId: "reta", linkedStrategyIds: ["reta"], linkedGoalIds: ["goal"], cadence: { type: "weekly" }, preferredSchedule: { daysOfWeek: ["thursday"], timeOfDay: "21:45", startDate: "2026-05-21", endDate: null }, timingContext: "", reminderPreference: "remind", priority: "high", notes: "Existing note", timeline: [{ startDate: "2026-05-21", endDate: "2026-05-27", dose: { amount: "0.5", unit: "mg" }, notes: "Historical" }, { startDate: "2026-06-01", endDate: null, dose: { amount: "0.8", unit: "mg" }, notes: "Manual" }], executionRevision: 1 }],
    reminders: [{ id: "reminder_reta", userId: "user", title: "Retatrutide", type: "protocol_reminder", linkedEntityType: "protocol", linkedEntityId: "reta", active: true, schedule: { type: "weekly", daysOfWeek: ["thursday"], timeOfDay: "21:45" }, completedAt: "2026-07-30T20:00:00Z", completionHistory: [{ date: "2026-07-23", status: "completed" }] }],
  };
  fs.writeFileSync(file, JSON.stringify(live));
  return { file, live, service: createPeptideExecutionManagementService({ runtimeStorePath: file, liveStore: live, now: () => new Date("2026-08-06T12:00:00Z") }) };
}
function command(fixture, overrides = {}) { return { protocolId: "reta", userId: "user", expectedRevision: 1, author: { type: "user", id: "user" }, synchronizeReminder: true, preservePriority: true, preserveTimelineHistory: true, draft: draft(), ...overrides }; }
function draft(overrides = {}) {
  const schedule = { frequency: "weekly", daysOfWeek: overrides.daysOfWeek ?? ["thursday"], timing: "specific", specificTime: overrides.specificTime ?? "21:45", startDate: "2026-05-21", endDate: null };
  const strategy = { pattern: "up_hold_down", startingDose: { amount: "0.5", unit: "mg" }, startDate: "2026-05-21", stepAmount: "0.5", stepInterval: 1, stepUnit: "weeks", targetDose: "2", holdDuration: 6, holdUnit: "weeks", decreaseAmount: "0.5", decreaseInterval: 1, decreaseUnit: "weeks", landingDose: "0.5", endDate: null };
  return { ...supportScheduleToExecution(schedule), supportSchedule: schedule, dosingStrategy: strategy, timingContext: "", reminderPreference: overrides.reminderPreference ?? "remind", priority: "normal", notes: "Saved execution note", timelineOperation: overrides.timelineOperation ?? "replace", timeline: overrides.timeline ?? generatePeptideDosingTimeline(strategy) };
}
