import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDailyFocusService } from "./DailyFocusService";
import { createPriorityDetailService } from "./PriorityDetailService";
import {
  buildRecurringSupportDraftFromFormData,
  createRecurringSupportHydrationModel,
  createRecurringSupportManagementService,
} from "./RecurringSupportManagementService";

describe("recurring Support management", () => {
  it("hydrates the existing Foam Rolling schedule without fabricating notes", () => {
    const fixture = setup();
    const hydration = createRecurringSupportHydrationModel({
      executionItem: fixture.live.executionItems[0],
      protocol: fixture.live.protocols[0],
      reminder: fixture.live.reminders[0],
    });

    expect(hydration).toEqual({
      executionRevision: 1,
      supportSchedule: {
        frequency: "daily",
        daysOfWeek: [],
        intervalDays: 1,
        timing: "specific",
        specificTime: "17:00",
        startDate: "2026-07-23",
        endDate: null,
      },
      reminderPreference: "remind",
      notes: "",
    });
  });

  it("synchronizes schedule and reminder while preserving every history anchor", async () => {
    const fixture = setup();
    const originalExecutionHistory = structuredClone(
      fixture.live.executionItems[0].completionHistory
    );
    const originalReminderHistory = structuredClone(
      fixture.live.reminders[0].completionHistory
    );
    const completedAt = fixture.live.reminders[0].completedAt;
    const reminderNotes = fixture.live.reminders[0].notes;
    const result = await fixture.service.save(command({
      draft: draft({
        frequency: "every_x_days",
        intervalDays: 3,
        specificTime: "18:30",
        notes: "Focus on hips and upper back.",
      }),
    }));

    expect(result).toMatchObject({
      outcome: "success",
      executionId: "execution_foam_roll",
      reminderId: "reminder_foam_roll_daily",
    });
    expect(fixture.live.executionItems[0]).toMatchObject({
      cadence: { type: "every_x_days", interval: 3 },
      preferredSchedule: {
        anchorDate: "2026-07-23",
        intervalDays: 3,
        startDate: "2026-07-23",
        endDate: null,
        timeOfDay: "18:30",
      },
      priority: "high",
      notes: "Focus on hips and upper back.",
      executionRevision: 1,
    });
    expect(fixture.live.executionItems[0].completionHistory)
      .toEqual(originalExecutionHistory);
    expect(fixture.live.reminders[0]).toMatchObject({
      id: "reminder_foam_roll_daily",
      active: true,
      schedule: {
        cadence: "every_x_days",
        anchorDate: "2026-07-23",
        interval: 3,
        startDate: "2026-07-23",
        endDate: null,
        timeOfDay: "18:30",
      },
    });
    expect(fixture.live.reminders[0].completedAt).toBe(completedAt);
    expect(fixture.live.reminders[0].completionHistory)
      .toEqual(originalReminderHistory);
    expect(fixture.live.reminders[0].notes).toBe(reminderNotes);
  });

  it("disables stale reminder projection without deleting completion history", async () => {
    const fixture = setup();
    const history = structuredClone(fixture.live.reminders[0].completionHistory);
    const result = await fixture.service.save(command({
      draft: draft({ reminderPreference: "none" }),
    }));

    expect(result.outcome).toBe("success");
    expect(fixture.live.reminders[0]).toMatchObject({
      active: false,
      completedAt: "2026-08-07T05:39:49.388Z",
    });
    expect(fixture.live.reminders[0].completionHistory).toEqual(history);
    expect(foamPriority(fixture.live, "2026-08-08T19:00:00.000Z"))
      .toBeUndefined();
    fixture.live.reminders[0].active = true;
    expect(foamPriority(fixture.live, "2026-08-08T19:00:00.000Z"))
      .toBeUndefined();
  });

  it("disables and re-enables the canonical Weight reminder without resetting history", async () => {
    const fixture = setup();
    fixture.live.protocols[0] = { ...fixture.live.protocols[0], id: "weight", category: "weight" };
    fixture.live.executionItems[0] = {
      ...fixture.live.executionItems[0],
      id: "execution_morning_weigh_in",
      linkedProtocolId: "weight",
      preferredSchedule: { daysOfWeek: [], timeOfDay: "morning" },
    };
    fixture.live.reminders[0] = {
      ...fixture.live.reminders[0],
      id: "reminder_morning_weight",
      type: "evidence_reminder",
      linkedEntityId: "weight",
    };
    const history = structuredClone(fixture.live.reminders[0].completionHistory);
    const base = {
      protocolId: "weight", protocolCategory: "weight",
      executionId: "execution_morning_weigh_in", reminderId: "reminder_morning_weight", userId: "user",
    };
    const disabled = await fixture.service.save({
      ...base, expectedRevision: 1, draft: draft({ reminderPreference: "none", timing: "morning" }),
    });
    expect(disabled.outcome).toBe("success");
    expect(fixture.live.reminders[0].active).toBe(false);
    const reenabled = await fixture.service.save({
      ...base, expectedRevision: fixture.live.executionItems[0].executionRevision,
      draft: draft({ reminderPreference: "remind", timing: "morning" }),
    });
    expect(reenabled.outcome).toBe("success");
    expect(fixture.live.reminders[0].active).toBe(true);
    expect(fixture.live.reminders[0].completionHistory).toEqual(history);
  });

  it("uses canonical Support eligibility and preserves completion suppression", () => {
    const fixture = setup();
    const due = foamPriority(fixture.live, "2026-08-08T19:00:00.000Z");
    expect(due).toMatchObject({
      id: "reminder_foam_roll_daily",
      label: "Foam Rolling",
      metadata: "Daily · 5:00 PM",
      completionId: "reminder_foam_roll_daily",
      executionId: "execution_foam_roll",
      completable: true,
    });

    fixture.live.reminders[0].completedAt = "2026-08-08T18:00:00.000Z";
    expect(foamPriority(fixture.live, "2026-08-08T19:00:00.000Z"))
      .toBeUndefined();

    fixture.live.reminders[0].completedAt = null;
    fixture.live.executionItems[0].cadence = { type: "specific_days" };
    fixture.live.executionItems[0].preferredSchedule.daysOfWeek = ["monday"];
    expect(foamPriority(fixture.live, "2026-08-08T19:00:00.000Z"))
      .toBeUndefined();
  });

  it("projects saved Execution Notes through the universal priority detail", async () => {
    const fixture = setup();
    fixture.live.executionItems[0].notes = "Focus on hips and upper back.";
    const repositories = {
      users: { getCurrentUser: async () => ({ id: "user", timeZone: "America/Los_Angeles" }) },
      goals: { listGoals: async () => [] },
      reminders: { getReminderById: async () => fixture.live.reminders[0] },
      protocols: { listProtocols: async () => fixture.live.protocols },
      operatingPlan: { getOperatingPlan: async () => null },
      operatingRhythm: { getOperatingRhythm: async () => null },
      executionItems: { listExecutionItems: async () => fixture.live.executionItems },
    };
    const detail = await createPriorityDetailService({
      repositories,
      now: () => new Date("2026-08-08T19:00:00.000Z"),
    }).getPriorityDetail("reminder_foam_roll_daily");

    expect(detail).toMatchObject({
      title: "Foam Rolling",
      completable: true,
      action: {
        label: "View Support",
        href: "/profile/operating-plan/execution/execution_foam_roll",
      },
    });
    expect(detail.sections.find((section) => section.title === "Execution Notes"))
      .toMatchObject({
        items: [{
          label: "Saved Support note",
          detail: "Focus on hips and upper back.",
        }],
      });
    expect(JSON.stringify(detail)).not.toContain("Dosing Strategy");
  });

  it("parses semantic timing and rejects malformed Support JSON", () => {
    const form = new FormData();
    form.set("supportScheduleJson", JSON.stringify({
      frequency: "daily",
      timing: "evening",
      startDate: "2026-07-23",
      endDate: null,
    }));
    form.set("reminderPreference", "remind");
    form.set("notes", "");
    expect(buildRecurringSupportDraftFromFormData(form)).toMatchObject({
      preferredSchedule: { timeOfDay: "evening", startDate: "2026-07-23" },
    });
    form.set("supportScheduleJson", "{bad");
    expect(buildRecurringSupportDraftFromFormData(form)).toEqual({
      malformed: true,
    });
  });
});

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "recurring-support-"));
  const file = path.join(directory, "runtime.json");
  const live = {
    version: "test",
    revision: 0,
    protocols: [{
      id: "recovery",
      userId: "user",
      category: "recovery",
      name: "Foam Rolling",
      status: "active",
      activatedAt: "2026-07-23T16:54:00.550Z",
      currentGoalIds: ["goal"],
      schedule: { type: "daily", timeOfDay: "17:00" },
    }],
    executionItems: [{
      id: "execution_foam_roll",
      userId: "user",
      type: "recovery",
      title: "Foam Rolling",
      active: true,
      linkedProtocolId: "recovery",
      cadence: { type: "daily" },
      preferredSchedule: { daysOfWeek: [], timeOfDay: "17:00" },
      reminderPreference: "in_app",
      priority: "high",
      notes: "",
      completionHistory: [{ occurrenceDate: "2026-08-01", status: "completed" }],
    }],
    reminders: [{
      id: "reminder_foam_roll_daily",
      userId: "user",
      title: "Foam Roll",
      type: "recovery_reminder",
      linkedEntityType: "protocol",
      linkedEntityId: "recovery",
      active: true,
      persistenceMode: "always_visible",
      schedule: { type: "daily", timeOfDay: "17:00", timezone: null },
      completedAt: "2026-08-07T05:39:49.388Z",
      completionHistory: [{ occurrenceDate: "2026-08-01", status: "completed" }],
      notes: "Legacy reminder description",
    }],
  };
  fs.writeFileSync(file, JSON.stringify(live));
  return {
    file,
    live,
    service: createRecurringSupportManagementService({
      runtimeStorePath: file,
      liveStore: live,
      now: () => new Date("2026-08-08T12:00:00.000Z"),
    }),
  };
}

function command(overrides = {}) {
  return {
    protocolId: "recovery",
    protocolCategory: "recovery",
    executionId: "execution_foam_roll",
    reminderId: "reminder_foam_roll_daily",
    userId: "user",
    expectedRevision: 1,
    draft: draft(),
    ...overrides,
  };
}

function draft(overrides = {}) {
  const supportSchedule = {
    frequency: overrides.frequency ?? "daily",
    daysOfWeek: overrides.daysOfWeek ?? [],
    intervalDays: overrides.intervalDays ?? 1,
    timing: overrides.timing ?? "specific",
    specificTime: overrides.specificTime ?? "17:00",
    startDate: "2026-07-23",
    endDate: null,
  };
  return {
    supportSchedule,
    reminderPreference: overrides.reminderPreference ?? "remind",
    notes: overrides.notes ?? "",
  };
}

function foamPriority(live, instant) {
  return createDailyFocusService().getDailyFocus({
    checkIns: [],
    executionItems: live.executionItems,
    now: new Date(instant),
    protocols: live.protocols,
    reminders: live.reminders,
    timeZone: "America/Los_Angeles",
  }).find((item) => item.label === "Foam Rolling");
}
