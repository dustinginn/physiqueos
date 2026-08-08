import { describe, expect, it } from "vitest";
import { createHomeBriefingService } from "./HomeBriefingService";

describe("Home DEXA lifecycle orchestration", () => {
  it.each([
    ["before eligibility", "2026-08-13T15:00:00.000Z", null],
    ["one day before", "2026-08-14T15:00:00.000Z", "DEXA tomorrow"],
    ["appointment morning", "2026-08-15T14:00:00.000Z", "DEXA this morning"],
    ["after appointment", "2026-08-15T14:31:00.000Z", "Upload DEXA results"],
  ])("passes the canonical appointment through Home and projects %s", async (_label, instant, expected) => {
    const home = await createHomeBriefingService({
      repositories: repositories([appointment()]),
      now: () => new Date(instant),
    }).getHomeBriefing("user");
    const dexa = home.todaysFocus.find((item) => item.executionId === "execution_next_dexa");
    expect(dexa?.label ?? null).toBe(expected);
    if (dexa) expect(dexa.href).toBe(`/priorities/${dexa.id}`);
  });

  it("suppresses DEXA after matching evidence has completed the canonical appointment", async () => {
    const home = await createHomeBriefingService({
      repositories: repositories([appointment({ active: false, status: "completed" })]),
      now: () => new Date("2026-08-15T14:31:00.000Z"),
    }).getHomeBriefing("user");
    expect(home.todaysFocus.some((item) => item.executionId === "execution_next_dexa")).toBe(false);
  });
});

function repositories(executionItems) {
  const goal = {
    id: "goal",
    userId: "user",
    type: "general",
    title: "Build Lean Mass",
    status: "active",
    primary: true,
  };
  return {
    users: { getUserById: async () => ({ id: "user", displayName: "Founder", timeZone: "America/Los_Angeles" }) },
    goals: { listGoals: async () => [goal], getActiveGoal: async () => goal },
    dailyCheckIns: { listCheckIns: async () => [] },
    dexaScans: { listDEXAScans: async () => [] },
    weights: { listWeightEntries: async () => [], getLatestWeightEntry: async () => null },
    protocols: { listActiveProtocols: async () => [] },
    reminders: { listReminders: async () => [] },
    operatingPlan: { getOperatingPlan: async () => null },
    executionItems: { listExecutionItems: async () => structuredClone(executionItems) },
    nutritionContext: { getNutritionContext: async () => null },
    progressPhotos: { listPhotos: async () => [] },
    analyses: { getLatestAnalysis: async () => null, listAnalyses: async () => [] },
    dailyBriefings: {
      getLatestScheduledDailyBriefing: async () => null,
      getLatestMidweekBriefing: async () => null,
      getLatestWeeklyBriefing: async () => null,
      getLatestMonthlyBriefing: async () => null,
      getLatestActiveEventBriefing: async () => null,
      getBriefingByEvidenceWindow: async () => null,
    },
    canonicalEvidence: { listCanonicalEvidenceObjects: async () => [] },
    protocolVersions: { getCurrentVersion: async () => null },
  };
}

function appointment(overrides = {}) {
  return {
    id: "execution_next_dexa",
    userId: "user",
    type: "dexa_appointment",
    active: true,
    status: "scheduled",
    preferredSchedule: { date: "2026-08-15", timeOfDay: "07:30", daysOfWeek: [] },
    timezone: "America/Los_Angeles",
    reminderPreferences: ["day_before", "morning_of"],
    uploadReminder: true,
    preparationNote: "",
    linkedGoalIds: ["goal"],
    executionRevision: 1,
    ...overrides,
  };
}
