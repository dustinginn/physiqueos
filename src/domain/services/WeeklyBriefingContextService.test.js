import { describe, expect, it } from "vitest";
import { resolveWeeklyBriefingContext } from "./WeeklyBriefingContextService";

const window = {
  id: "weekly:2026-07-19:2026-07-25:America/Los_Angeles",
  startDate: "2026-07-19",
  endDate: "2026-07-25",
  timeZone: "America/Los_Angeles",
};
const prior = { id: "visible", title: "Visible Abs", status: "completed", completedAt: "2026-07-18" };
const goal = {
  id: "build", title: "Build Lean Mass", type: "build_lean_mass",
  status: "active", primary: true, sourceGoalId: "visible",
  openingApproach: { value: "calibration", label: "Maintenance calibration" },
  phases: [{ id: "phase-1", name: "Establish Maintenance", status: "active", startDate: "2026-07-21" }],
  measurementModel: { primaryOutcomeMeasures: ["lean_mass"], guardrailMeasures: ["body_fat_percentage"] },
  guardrails: [{ metric: "body_fat_percentage", min: 8, max: 9, unit: "%" }],
};
function repositories(activeGoal = goal) {
  return {
    goals: { getActiveGoal: async () => activeGoal, listGoals: async () => [prior, ...(activeGoal ? [activeGoal] : [])] },
    protocols: { listActiveProtocols: async () => [{ id: "nutrition", status: "active", goalIds: ["build"], category: "nutrition" }] },
    executionItems: { listExecutionItems: async () => [{ id: "dexa-aug", type: "dexa_appointment", active: true, status: "scheduled", linkedGoalIds: ["build"], preferredSchedule: { date: "2026-08-15", timeOfDay: "07:30" } }] },
  };
}

describe("Weekly Briefing context envelope", () => {
  it("resolves the active goal, phase, calibration, prior goal, protocols, guardrail, and future milestone", async () => {
    const context = await resolveWeeklyBriefingContext({
      repositories: repositories(), userId: "user", window, activeGoal: goal,
      dexaScans: [{ id: "jul18", measuredAt: "2026-07-18", bodyFatPercentage: 7.7 }],
      photoEvent: { id: "photo-jul25" }, piResult: { observations: [{ id: "obs" }], selection: { primary: [] }, coverage: { energy: { state: "partial" }, training: 1, weight: 1 } },
    });
    expect(context).toMatchObject({
      status: "ready", semanticGoalType: "lean_mass_gain",
      activeGoalSummary: { id: "build", title: "Build Lean Mass" },
      activePhase: { name: "Establish Maintenance", ageBand: "week_1_to_4" },
      operatingState: { value: "calibration" },
      completedPriorGoal: { id: "visible" },
      bodyFatGuardrail: { lowerBound: 8, upperBound: 9 },
      latestCompletedDexa: { id: "jul18" },
      futureMilestone: { id: "dexa-aug", date: "2026-08-15" },
      pi: { status: "ready" },
    });
    expect(context.activeProtocols).toEqual([{ id: "nutrition", name: undefined, category: "nutrition" }]);
  });

  it("returns explicit neutral context without fabricating calibration or an active goal", async () => {
    const context = await resolveWeeklyBriefingContext({
      repositories: repositories(null), userId: "user", window, activeGoal: null,
    });
    expect(context).toMatchObject({
      status: "neutral", semanticGoalType: "unknown", activeGoal: null,
      activePhase: null, operatingState: null, bodyFatGuardrail: null,
      futureMilestone: null, pi: { status: "unavailable" },
    });
  });
});
