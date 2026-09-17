import { describe, expect, it } from "vitest";
import { createDailyFocusService } from "./DailyFocusService";

describe("Home Today's Priorities actionability", () => {
  it("filters completed Morning Weigh-In before the four-item cap so Tesamorelin remains visible", () => {
    const input = productionShape();
    const originalWeight = structuredClone(input.weightEntries);
    const priorities = createDailyFocusService().getDailyFocus(input);

    expect(priorities).toHaveLength(4);
    expect(priorities.map((item) => item.label)).toEqual(expect.arrayContaining([
      "Fadogia Agrestis", "Foam Rolling", "Tesamorelin", "Retatrutide",
    ]));
    expect(priorities.some((item) => item.label === "Morning Weigh-In")).toBe(false);
    expect(input.weightEntries).toEqual(originalWeight);
    expect(input.weightEntries[0]).toMatchObject({ measuredAt: "2026-09-17T12:20:00.000Z" });
  });

  it.each([
    ["Fadogia Agrestis", "supplement"],
    ["Tesamorelin", "peptide"],
    ["Foam Rolling", "recovery"],
  ])("removes completed %s while keeping overdue incomplete work actionable", (label) => {
    const input = productionShape({ weightComplete: false });
    const reminder = input.reminders.find((item) => item.title === label);
    reminder.completedAt = "2026-09-17T13:00:00.000Z";
    reminder.completionHistory = [{ occurrenceDate: "2026-09-17", status: "completed" }];
    const priorities = createDailyFocusService().getDailyFocus(input);

    expect(priorities.some((item) => item.label === label)).toBe(false);
    expect(priorities.find((item) => item.label === "Morning Weigh-In")).toMatchObject({
      completed: false,
      state: "overdue",
    });
  });

  it("derives supplement, peptide, recovery, and weight icons from canonical domain type", () => {
    const priorities = createDailyFocusService().getNotificationOccurrences(
      productionShape({ weightComplete: false })
    );

    expect(find(priorities, "Fadogia Agrestis").icon).toBe("pills");
    expect(find(priorities, "Tesamorelin").icon).toBe("syringe");
    expect(find(priorities, "Foam Rolling").icon).toBe("activity");
    expect(find(priorities, "Morning Weigh-In").icon).toBe("scale");
  });
});

function productionShape({ weightComplete = true } = {}) {
  const date = "2026-09-17";
  const protocols = [
    protocol("weight", "Morning Weigh-In", "weight"),
    protocol("fadogia", "Fadogia Agrestis", "supplement"),
    protocol("foam", "Foam Rolling", "recovery"),
    protocol("tesamorelin", "Tesamorelin", "peptide"),
    protocol("retatrutide", "Retatrutide", "peptide"),
  ];
  const executionItems = [
    {
      id: "execution_morning_weigh_in", type: "evidence", title: "Morning Weigh-In",
      active: true, linkedProtocolId: "protocol_weight", cadence: { type: "daily" },
      preferredSchedule: schedule("05:30", date),
    },
    execution("fadogia", "Fadogia Agrestis", "supplement", "05:45", date),
    execution("foam", "Foam Rolling", "recovery", "17:00", date),
    execution("tesamorelin", "Tesamorelin", "peptide", "21:30", date, "0.5"),
    execution("retatrutide", "Retatrutide", "peptide", "21:45", date, "1"),
  ];
  const reminders = [
    {
      id: "reminder_morning_weight", title: "Morning Weigh-In", type: "evidence_reminder",
      linkedEntityId: "protocol_weight", linkedEvidenceType: "weight", active: true,
      schedule: { type: "daily", ...schedule("05:30", date) }, version: 1,
    },
    reminder("fadogia", "Fadogia Agrestis", "supplement_reminder", "05:45", date),
    reminder("foam", "Foam Rolling", "recovery_reminder", "17:00", date),
    reminder("tesamorelin", "Tesamorelin", "protocol_reminder", "21:30", date),
    reminder("retatrutide", "Retatrutide", "protocol_reminder", "21:45", date),
  ];
  return {
    checkIns: [], executionItems,
    latestWeight: weightComplete ? { measuredAt: "2026-09-17T12:20:00.000Z", value: 180 } : null,
    now: new Date("2026-09-17T20:00:00.000Z"),
    progressPhotos: [], protocols, reminders,
    timeZone: "America/Los_Angeles",
    weightEntries: weightComplete
      ? [{ id: "weight_sep17", measuredAt: "2026-09-17T12:20:00.000Z", value: 180 }]
      : [],
  };
}

function protocol(id, name, category) {
  return { id: `protocol_${id}`, name, category, protocolType: category, status: "active" };
}

function execution(id, title, type, timeOfDay, startDate, dose = null) {
  return {
    id: `execution_${id}`, type, title, active: true,
    protocolRootId: `protocol_${id}`, cadence: { type: "daily" },
    preferredSchedule: schedule(timeOfDay, startDate),
    reminderPreference: "remind",
    dose: dose ? { amount: dose, unit: "mg" } : null,
    timeline: dose ? [{ startDate, endDate: null, dose: { amount: dose, unit: "mg" } }] : [],
  };
}

function reminder(id, title, type, timeOfDay, startDate) {
  return {
    id: `reminder_${id}`, title, type, linkedEntityId: `protocol_${id}`,
    active: true, version: 1,
    schedule: { type: "daily", ...schedule(timeOfDay, startDate) },
    completionHistory: [],
  };
}

function schedule(timeOfDay, startDate) {
  return { daysOfWeek: [], timeOfDay, startDate, endDate: null };
}

function find(items, label) {
  return items.find((item) => item.label === label);
}
