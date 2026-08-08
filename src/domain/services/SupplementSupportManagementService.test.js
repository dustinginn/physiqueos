import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDailyFocusService } from "./DailyFocusService";
import { createPriorityDetailService } from "./PriorityDetailService";
import {
  buildSupplementSupportDraftFromFormData,
  createSupplementSupportHydrationModel,
  createSupplementSupportManagementService,
  formatSupplementSupportSummary,
  normalizeSupplementSupportDraft,
  validateSupplementSupportDraft,
} from "./SupplementSupportManagementService";

describe("Supplement Support migration", () => {
  it.each([
    ["Tongkat Ali", "daily", "", "2026-07-25", "Daily · Morning"],
    ["Fadogia Agrestis", "every_other_day", "2026-07-25", "2026-07-25", "Every other day · Morning"],
    ["Multivitamin", "daily", "", "2026-07-25", "Daily · Morning"],
    ["Electrolytes", "daily", "", "2026-07-25", "Daily · Morning"],
  ])("hydrates the current %s production shape", (name, cadence, persistedStart, expectedStart, summary) => {
    const current = execution({
      title: name,
      cadence: { type: cadence },
      preferredSchedule: schedule({ startDate: persistedStart }),
    });
    const hydration = createSupplementSupportHydrationModel({
      executionItem: current,
      protocol: { ...protocol(), name },
    });
    expect(hydration).toMatchObject({
      compatibilityIssue: null,
      draft: {
        dose: { amount: "", unit: "" },
        reminderPreference: "none",
        supportSchedule: { startDate: expectedStart, timing: "morning" },
      },
    });
    expect(formatSupplementSupportSummary(current)).toBe(summary);
  });

  it("hydrates empty dose and maps legacy every-other-day losslessly with its anchor", () => {
    const hydration = createSupplementSupportHydrationModel({
      executionItem: execution({
        cadence: { type: "every_other_day" },
        preferredSchedule: schedule({ startDate: "2026-07-25" }),
      }),
      protocol: protocol(),
    });

    expect(hydration).toMatchObject({
      compatibilityIssue: null,
      draft: {
        dose: { amount: "", unit: "" },
        supportSchedule: {
          frequency: "every_x_days",
          intervalDays: 2,
          startDate: "2026-07-25",
          timing: "morning",
        },
      },
    });
    expect(formatSupplementSupportSummary(hydration.draft)).toBe("Every other day · Morning");
  });

  it("hydrates daily support from the existing record creation date without fabricating a dose", () => {
    const hydration = createSupplementSupportHydrationModel({
      executionItem: execution({ preferredSchedule: schedule({ startDate: "" }) }),
      protocol: protocol(),
    });

    expect(hydration.draft.dose).toEqual({ amount: "", unit: "" });
    expect(hydration.draft.supportSchedule).toMatchObject({
      frequency: "daily",
      startDate: "2026-07-25",
      timing: "morning",
    });
  });

  it.each([
    ["daily", [], 1],
    ["weekly", ["monday"], 1],
    ["specific_days", ["monday", "thursday"], 1],
    ["every_x_days", [], 3],
  ])("accepts the shared %s schedule", (frequency, daysOfWeek, intervalDays) => {
    const value = supportDraft({ frequency, daysOfWeek, intervalDays });
    expect(validateSupplementSupportDraft(value)).toEqual([]);
  });

  it.each([
    ["morning", "", "morning"],
    ["afternoon", "", "afternoon"],
    ["evening", "", "evening"],
    ["specific", "17:30", "17:30"],
  ])("persists %s timing through the shared form adapter", (timing, specificTime, expected) => {
    const form = formData({
      supportSchedule: {
        ...baseSupportSchedule(),
        timing,
        specificTime,
        endDate: "2026-09-01",
      },
    });
    const value = buildSupplementSupportDraftFromFormData(form);
    expect(value.preferredSchedule).toMatchObject({
      timeOfDay: expected,
      startDate: "2026-07-25",
      endDate: "2026-09-01",
    });
    expect(validateSupplementSupportDraft(value)).toEqual([]);
  });

  it("saves dose, notes, and an authoritative reminder while preserving hidden legacy state", async () => {
    const fixture = setup();
    const legacyTimeline = structuredClone(fixture.live.executionItems[0].timeline);
    const completionHistory = structuredClone(fixture.live.executionItems[0].completionHistory);
    const result = await fixture.service.save(command({
      draft: supportDraft({
        dose: { amount: "2", unit: "capsules" },
        reminderPreference: "remind",
        notes: "Take with food.",
      }),
    }));

    expect(result).toMatchObject({ outcome: "success", reminderId: "reminder_supplement" });
    expect(fixture.live.executionItems[0]).toMatchObject({
      dose: { amount: "2", unit: "capsules" },
      reminderPreference: "remind",
      notes: "Take with food.",
      priority: "high",
      timeline: legacyTimeline,
      completionHistory,
    });
    expect(fixture.live.reminders[0]).toMatchObject({
      id: "reminder_supplement",
      type: "supplement_reminder",
      linkedEntityId: "supplement",
      linkedExecutionId: "execution_supplement_supplement",
      active: true,
      schedule: { cadence: "daily", timeOfDay: "morning", startDate: "2026-07-25" },
    });
  });

  it("disables an existing reminder without deleting completion history", async () => {
    const fixture = setup({ reminder: reminder({ active: true }) });
    const history = structuredClone(fixture.live.reminders[0].completionHistory);
    const completedAt = fixture.live.reminders[0].completedAt;
    const result = await fixture.service.save(command({
      draft: supportDraft({ reminderPreference: "none" }),
    }));

    expect(result.outcome).toBe("success");
    expect(fixture.live.reminders[0]).toMatchObject({ active: false, completedAt });
    expect(fixture.live.reminders[0].completionHistory).toEqual(history);
  });

  it("canonicalizes every-other-day as every two days without shifting the anchor", async () => {
    const fixture = setup({
      executionItem: execution({
        cadence: { type: "every_other_day" },
        preferredSchedule: schedule({ startDate: "2026-07-25" }),
      }),
    });
    const result = await fixture.service.save(command({
      draft: supportDraft({ frequency: "every_x_days", intervalDays: 2 }),
    }));

    expect(result.outcome).toBe("success");
    expect(fixture.live.executionItems[0]).toMatchObject({
      cadence: { type: "every_x_days", interval: 2 },
      preferredSchedule: {
        startDate: "2026-07-25",
        anchorDate: "2026-07-25",
        intervalDays: 2,
      },
    });
    expect(fixture.live.reminders[0].schedule).toMatchObject({
      cadence: "every_x_days",
      interval: 2,
      anchorDate: "2026-07-25",
    });
  });

  it("fails safely for an unsupported legacy cadence", async () => {
    const legacy = execution({ cadence: { type: "custom" } });
    expect(createSupplementSupportHydrationModel({ executionItem: legacy, protocol: protocol() }).compatibilityIssue)
      .toContain("cannot be edited safely");
    const fixture = setup({ executionItem: legacy });
    const result = await fixture.service.save(command());
    expect(result).toMatchObject({ outcome: "invalid", committed: false });
    expect(fixture.live.executionItems[0].cadence).toEqual({ type: "custom" });
  });

  it("projects due Support through Home, suppresses not-due/disabled/completed occurrences, and carries dose", () => {
    const service = createDailyFocusService();
    const inputs = focusInputs();
    const due = service.getDailyFocus(inputs).find((item) => item.label === "Tongkat Ali");
    expect(due).toMatchObject({
      completionId: "reminder_supplement",
      metadata: "2 capsules this morning",
      icon: "utensils",
    });

    const everyOther = execution({
      cadence: { type: "every_x_days", interval: 2 },
      preferredSchedule: {
        ...schedule({ startDate: "2026-08-05" }),
        anchorDate: "2026-08-05",
        intervalDays: 2,
      },
    });
    expect(service.getDailyFocus({ ...inputs, executionItems: [everyOther] })
      .find((item) => item.label === "Tongkat Ali")).toBeUndefined();
    expect(service.getDailyFocus({ ...inputs, reminders: [reminder({ active: false })] })
      .find((item) => item.label === "Tongkat Ali")).toBeUndefined();
    expect(service.getDailyFocus({
      ...inputs,
      reminders: [reminder({ completedAt: "2026-08-06T16:00:00.000Z" })],
    }).find((item) => item.label === "Tongkat Ali")).toBeUndefined();
  });

  it("projects Execution Notes through the universal priority detail path", async () => {
    const supportExecution = execution({
      dose: { amount: "2", unit: "capsules" },
      reminderPreference: "remind",
      notes: "Take with food.",
    });
    const supportReminder = reminder({ active: true });
    const detail = await createPriorityDetailService({
      now: () => new Date("2026-08-06T18:00:00.000Z"),
      repositories: {
        users: { getUserById: async () => ({ id: "founder", timeZone: "America/Los_Angeles" }) },
        goals: { listGoals: async () => [goal()] },
        reminders: { getReminderById: async () => supportReminder },
        protocols: { listProtocols: async () => [protocol()] },
        executionItems: { listExecutionItems: async () => [supportExecution] },
      },
    }).getPriorityDetail(supportReminder.id, "founder");

    expect(detail.action.label).toBe("View Support");
    expect(detail.sections.find((section) => section.title === "Dose / Quantity").items[0].label)
      .toBe("2 capsules");
    expect(detail.sections.find((section) => section.title === "Execution Notes").items[0].detail)
      .toBe("Take with food.");
  });
});

function setup({ executionItem = execution(), reminder: reminderItem = null } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "supplement-support-"));
  const file = path.join(directory, "runtime.json");
  const live = {
    version: "test",
    revision: 0,
    protocols: [protocol()],
    protocolVersions: [{ id: "supplement_v1", protocolId: "supplement", status: "active", endedAt: null }],
    goals: [goal()],
    executionItems: [executionItem],
    reminders: reminderItem ? [reminderItem] : [],
  };
  fs.writeFileSync(file, JSON.stringify(live));
  return {
    file,
    live,
    service: createSupplementSupportManagementService({
      runtimeStorePath: file,
      liveStore: live,
      now: () => new Date("2026-08-06T18:00:00.000Z"),
    }),
  };
}

function command(overrides = {}) {
  return {
    protocolId: "supplement",
    expectedRevision: 1,
    supplementVersionId: "supplement_v1",
    goalId: "goal",
    userId: "founder",
    draft: supportDraft(),
    author: { type: "user", id: "founder", displayName: "Founder" },
    ...overrides,
  };
}

function supportDraft(overrides = {}) {
  const {
    dose = { amount: "", unit: "" },
    reminderPreference = "none",
    notes = "",
    frequency = "daily",
    daysOfWeek = [],
    intervalDays = 1,
  } = overrides;
  return normalizeSupplementSupportDraft({
    dose,
    reminderPreference,
    notes,
    supportSchedule: {
      ...baseSupportSchedule(),
      frequency,
      daysOfWeek,
      intervalDays,
    },
  });
}

function formData({ supportSchedule = baseSupportSchedule() } = {}) {
  const form = new FormData();
  form.set("doseAmount", "1");
  form.set("doseUnit", "scoop");
  form.set("supportScheduleJson", JSON.stringify(supportSchedule));
  form.set("reminderPreference", "remind");
  form.set("notes", "Mix with water.");
  return form;
}

function baseSupportSchedule() {
  return {
    frequency: "daily",
    daysOfWeek: [],
    intervalDays: 1,
    timing: "morning",
    specificTime: "",
    startDate: "2026-07-25",
    endDate: null,
  };
}

function protocol() {
  return {
    id: "supplement",
    userId: "founder",
    name: "Tongkat Ali",
    category: "supplement",
    status: "active",
    currentVersionId: "supplement_v1",
    currentGoalIds: ["goal"],
    relatedGoalIds: ["goal"],
    dose: { value: null, unit: "" },
    schedule: { type: "daily", timeOfDay: "morning" },
  };
}

function goal() {
  return { id: "goal", userId: "founder", title: "Build Lean Mass", status: "active" };
}

function execution(overrides = {}) {
  return {
    id: "execution_supplement_supplement",
    userId: "founder",
    type: "supplement",
    title: "Tongkat Ali",
    active: true,
    protocolRootId: "supplement",
    supplementVersionId: "supplement_v1",
    linkedStrategyIds: ["supplement"],
    linkedGoalIds: ["goal"],
    dose: { amount: "", unit: "" },
    cadence: { type: "daily" },
    preferredSchedule: schedule(),
    reminderPreference: "none",
    priority: "high",
    notes: "",
    timeline: [{ startDate: "2026-01-01", endDate: "2026-02-01", dose: { amount: "1", unit: "capsule" }, notes: "Historical" }],
    completionHistory: [{ occurrenceDate: "2026-07-01", status: "completed" }],
    executionRevision: 1,
    author: { type: "user", id: "founder", displayName: "Founder" },
    createdAt: "2026-07-25T19:09:22.991Z",
    updatedAt: "2026-07-25T19:09:22.991Z",
    ...overrides,
  };
}

function schedule(overrides = {}) {
  return {
    daysOfWeek: [],
    timeOfDay: "morning",
    startDate: "2026-07-25",
    endDate: null,
    ...overrides,
  };
}

function reminder(overrides = {}) {
  return {
    id: "reminder_supplement",
    userId: "founder",
    title: "Tongkat Ali",
    type: "supplement_reminder",
    linkedEntityType: "protocol",
    linkedEntityId: "supplement",
    linkedExecutionId: "execution_supplement_supplement",
    active: true,
    schedule: { type: "daily", cadence: "daily", timeOfDay: "morning", startDate: "2026-07-25" },
    completedAt: "2026-07-30T20:00:00.000Z",
    completionHistory: [{ occurrenceDate: "2026-07-30", status: "completed" }],
    createdAt: "2026-07-25T19:09:22.991Z",
    updatedAt: "2026-07-25T19:09:22.991Z",
    ...overrides,
  };
}

function focusInputs() {
  return {
    checkIns: [],
    executionItems: [execution({
      dose: { amount: "2", unit: "capsules" },
      reminderPreference: "remind",
    })],
    now: new Date("2026-08-06T18:00:00.000Z"),
    protocols: [protocol()],
    reminders: [reminder({ active: true, completedAt: null, completionHistory: [] })],
    timeZone: "America/Los_Angeles",
  };
}
