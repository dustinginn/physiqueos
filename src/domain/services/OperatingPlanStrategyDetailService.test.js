import { describe, expect, it } from "vitest";
import {
  composeOperatingPlanStrategyDetail,
  getOperatingPlanStrategyHref,
} from "./OperatingPlanStrategyDetailService";

const goal = { id: "goal", title: "Build Lean Mass", timeline: { startDate: "2026-07-20" } };
const base = { id: "strategy", status: "active", currentGoalIds: ["goal"], activatedAt: "2026-07-23" };

describe("Operating Plan strategy detail", () => {
  it("presents authoritative Energy fields", () => {
    const result = composeOperatingPlanStrategyDetail({
      goals: [goal], strategyType: "energy",
      protocol: { ...base, name: "Calibration", effectiveStrategy: { mode: "Maintenance Calibration", calorieStrategy: "increase_gradually", activityStrategy: "reduce_slightly", evaluationCadence: "Weekly" } },
    });
    expect(result).toMatchObject({
      title: "Maintenance Calibration",
      goal: "Build Lean Mass",
      startedDate: "July 19, 2026",
      status: "Active",
    });
    expect(result.sections).toEqual(expect.arrayContaining([{ label: "Weekly Calibration", value: "Weekly" }]));
  });

  it("presents authoritative Nutrition fields without dose labels", () => {
    const result = composeOperatingPlanStrategyDetail({
      goals: [goal], strategyType: "nutrition",
      protocol: { ...base, effectiveStrategy: { proteinBasis: "body_weight", proteinRatio: 1, proteinTarget: 167, calorieStrategy: "increase_gradually" } },
    });
    expect(result.sections).toEqual(expect.arrayContaining([{ label: "Daily Target", value: "1 g per lb of body weight" }]));
    expect(JSON.stringify(result)).not.toContain("167 g protein");
    expect(JSON.stringify(result)).not.toMatch(/dose|provenance|canonical|runtime/i);
  });

  it("presents authoritative Coaching Updates without changing cadence", () => {
    const result = composeOperatingPlanStrategyDetail({
      goals: [goal],
      strategyType: "briefings",
      protocol: { ...base, category: "briefings", effectiveStrategy: { cadence: "Twice weekly", days: ["Wednesday", "Sunday"] } },
    });
    expect(result).toMatchObject({ eyebrow: "Coaching Updates", startedDate: "July 19, 2026" });
    expect(result.sections).toEqual(expect.arrayContaining([
      { label: "Midweek Calibration", value: "Wednesday" },
      { label: "Weekly Synthesis", value: "Sunday" },
      { label: "Routine Daily Briefings", value: "Off" },
      { label: "Event Briefings", value: "Photo and DEXA remain active when eligible" },
    ]));
  });

  it("presents authoritative Training structure and priorities", () => {
    const result = composeOperatingPlanStrategyDetail({
      goals: [goal], strategyType: "training", protocol: { ...base, name: "Maintenance Training Strategy" },
      version: { effectiveAt: "2026-07-11", goalLinks: [{ goalId: "goal" }], intent: { summary: "Preserve performance." }, trainingStrategy: { weeklyFrequencies: { arms: 2, back: 1 }, physiquePriorities: ["arms", "core"], progression: { pace: "moderate" }, nutritionPhase: "maintenance" } },
    });
    expect(result.sections).toEqual(expect.arrayContaining([
      { label: "Weekly Structure", value: "3 area sessions" },
      { label: "Training Focus", value: "Arms, Core" },
    ]));
  });

  it("uses stable IDs and returns no fabricated detail when unavailable", () => {
    expect(getOperatingPlanStrategyHref("energy", "protocol_energy")).toBe("/profile/operating-plan/strategy/energy/protocol_energy");
    expect(getOperatingPlanStrategyHref("nutrition", null)).toBeNull();
    expect(composeOperatingPlanStrategyDetail({ strategyType: "training" })).toBeNull();
  });
});
