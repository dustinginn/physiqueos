import { describe, expect, it } from "vitest";
import { createDailyFocusService } from "./DailyFocusService";
import { createPriorityDetailService } from "./PriorityDetailService";
import {
  isMorningWeighInDue,
  isMorningWeighInSatisfied,
  resolveMorningWeighInSupport,
} from "./TrackingSupportService";

describe("Morning Weigh-In Tracking Support", () => {
  it("hydrates the canonical daily semantic-morning schedule and summary", () => {
    const support = resolveMorningWeighInSupport(fixture());
    expect(support.supportSchedule).toEqual({
      frequency: "daily", daysOfWeek: [], intervalDays: 1, timing: "morning",
      specificTime: "", startDate: "2026-07-23", endDate: null,
    });
    expect(support.supportSummary).toBe("Daily · Morning");
  });

  it("preserves exact timing and an existing every-X-days anchor", () => {
    const data = fixture();
    data.executionItems[0].cadence = { type: "every_x_days", interval: 3 };
    data.executionItems[0].preferredSchedule = {
      daysOfWeek: [], timeOfDay: "07:30", anchorDate: "2026-07-24", intervalDays: 3, endDate: null,
    };
    const support = resolveMorningWeighInSupport(data);
    expect(support.supportSchedule).toMatchObject({
      frequency: "every_x_days", intervalDays: 3, timing: "specific",
      specificTime: "07:30", startDate: "2026-07-24", endDate: null,
    });
    expect(support.supportSummary).toBe("Every 3 days · 7:30 AM");
    expect(isMorningWeighInDue(support.supportSchedule, "2026-07-27")).toBe(true);
    expect(isMorningWeighInDue(support.supportSchedule, "2026-07-28")).toBe(false);
  });

  it("uses exact local-date Weight evidence without leaking history into future occurrences", () => {
    const base = { localDate: "2026-08-07", timeZone: "America/Los_Angeles" };
    expect(isMorningWeighInSatisfied({ ...base, weightEntries: [{ measuredAt: "2026-08-07T14:00:00.000Z" }] })).toBe(true);
    expect(isMorningWeighInSatisfied({ ...base, weightEntries: [{ measuredAt: "2026-08-06T14:00:00.000Z" }] })).toBe(false);
    expect(isMorningWeighInSatisfied({
      ...base,
      reminder: { completionHistory: [{ evidenceDate: "2026-08-07", satisfactionType: "canonical_evidence" }] },
    })).toBe(true);
  });

  it("projects Home only when canonical Support is due, enabled, and unsatisfied", () => {
    const data = fixture();
    const due = home(data);
    expect(due.flatMap((item) => item.sessionItems ?? []).find((item) => item.id === "reminder_morning_weight"))
      .toMatchObject({ label: "Morning Weigh-In", completed: false });

    data.reminders[0].active = false;
    expect(findMorning(home(data))).toBeUndefined();

    data.reminders[0].active = true;
    data.executionItems[0].cadence = { type: "weekly" };
    data.executionItems[0].preferredSchedule.daysOfWeek = ["saturday"];
    data.reminders[0].schedule = { type: "daily", timeOfDay: "morning" };
    expect(findMorning(home(data))).toBeUndefined();
  });

  it("marks today's matching Weight as satisfied but not a prior-day Weight", () => {
    const data = fixture();
    const completed = home(data, [{ measuredAt: "2026-08-07T14:00:00.000Z" }]);
    expect(findMorning(completed)).toMatchObject({ completed: true, satisfiedByEvidence: true });
    const prior = home(data, [{ measuredAt: "2026-08-06T14:00:00.000Z" }]);
    expect(findMorning(prior)).toMatchObject({ completed: false });
  });

  it("projects universal Execution Notes in priority detail and fabricates none", async () => {
    const data = fixture();
    data.executionItems[0].notes = "Use the same scale after waking.";
    const detail = await detailService(data).getPriorityDetail("reminder_morning_weight");
    expect(detail).toMatchObject({ title: "Morning Weigh-In", completable: false, action: { label: "Log Weight" } });
    expect(section(detail, "Execution Notes").items[0].detail).toBe("Use the same scale after waking.");
    data.executionItems[0].notes = "";
    const withoutNotes = await detailService(data).getPriorityDetail("reminder_morning_weight");
    expect(section(withoutNotes, "Execution Notes")).toBeUndefined();
  });
});

function fixture() {
  const protocol = { id: "weight_protocol", userId: "user", category: "weight", protocolType: "weight", status: "active", activatedAt: "2026-07-23T16:54:00.550Z", name: "Morning Weigh-In" };
  return {
    userId: "user",
    protocols: [protocol],
    executionItems: [{
      id: "execution_morning_weigh_in", userId: "user", type: "evidence", title: "Morning Weigh-In",
      active: true, linkedProtocolId: protocol.id, cadence: { type: "daily" },
      preferredSchedule: { daysOfWeek: [], timeOfDay: "morning" }, notes: "",
    }],
    reminders: [{
      id: "reminder_morning_weight", userId: "user", type: "evidence_reminder", title: "Morning Weigh-In",
      linkedEntityId: protocol.id, linkedEvidenceType: "weight", active: true,
      schedule: { type: "daily", timeOfDay: "morning" }, completionHistory: [],
    }],
  };
}

function home(data, weightEntries = []) {
  return createDailyFocusService().getDailyFocus({
    checkIns: [], executionItems: data.executionItems, latestWeight: weightEntries.at(-1) ?? null,
    weightEntries, protocols: data.protocols, reminders: data.reminders,
    now: new Date("2026-08-07T15:00:00.000Z"), timeZone: "America/Los_Angeles",
  });
}

function findMorning(items) {
  return items.flatMap((item) => item.sessionItems ?? []).find((item) => item.id === "reminder_morning_weight")
    ?? items.find((item) => item.id === "reminder_morning_weight");
}

function detailService(data) {
  return createPriorityDetailService({
    repositories: {
      users: { getCurrentUser: async () => ({ id: "user", timeZone: "America/Los_Angeles" }) },
      goals: { listGoals: async () => [] },
      reminders: { getReminderById: async () => data.reminders[0] },
      protocols: { listProtocols: async () => data.protocols },
      operatingPlan: { getOperatingPlan: async () => null },
      executionItems: { listExecutionItems: async () => data.executionItems },
    },
  });
}

function section(detail, title) {
  return detail.sections.find((item) => item.title === title);
}
