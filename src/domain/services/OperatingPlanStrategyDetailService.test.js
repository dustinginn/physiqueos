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
      protocol: { ...base, name: "Calibration", effectiveStrategy: { mode: "Maintenance Calibration", calorieStrategy: "increase_gradually", activityStrategy: "reduce_slightly", evaluationCadence: "Weekly", adjustmentSize: "small" } },
    });
    expect(result).toMatchObject({
      title: "Maintenance Calibration",
      goal: "Your Build Lean Mass goal",
      startedDate: "July 23, 2026",
      status: "Active",
    });
    expect(result.sections).toEqual([
      { label: "Current Energy Phase", value: "Maintain" },
      { label: "Caloric Intake", value: "Increase Gradually" },
      { label: "Activity Target", value: "Reduce Slightly" },
      { label: "Calibration Approach", value: "Weekly \u00B7 Small adjustments" },
    ]);
    expect(result.purpose).toContain("your Build Lean Mass goal");
  });

  it("presents authoritative macro fields without calorie ownership or dose labels", () => {
    const result = composeOperatingPlanStrategyDetail({
      goals: [goal], strategyType: "nutrition",
      protocol: { ...base, effectiveStrategy: { proteinBasis: "body_weight", proteinRatio: 1, proteinTarget: 167, calorieStrategy: "increase_gradually", carbohydrateStrategy: "performance", fatStrategy: "sustainable_minimum", trainingDayFlexibility: true, restDayFlexibility: true } },
    });
    expect(result.title).toBe("Macro Strategy");
    expect(result.sections).toEqual([
      { label: "Protein Target", value: "1 g per lb of body weight" },
      { label: "Carbohydrate Approach", value: "Performance" },
      { label: "Fat Approach", value: "Sustainable Minimum" },
      { label: "Macro Philosophy", value: "Flexible across training and rest days" },
    ]);
    expect(result.purpose).toContain("how daily intake is composed");
    expect(JSON.stringify(result)).not.toContain("167 g protein");
    expect(result.sections.map((item) => item.label).join(" ")).not.toMatch(/calorie|caloric|intake/i);
    expect(JSON.stringify(result)).not.toMatch(/dose|provenance|canonical|runtime/i);
  });

  it("presents authoritative Coaching Updates without changing cadence", () => {
    const result = composeOperatingPlanStrategyDetail({
      goals: [goal],
      strategyType: "briefings",
      protocol: { ...base, category: "briefings", effectiveStrategy: { cadence: "Twice weekly", days: ["Wednesday", "Sunday"] } },
    });
    expect(result).toMatchObject({ eyebrow: "Coaching Updates", startedDate: "July 23, 2026" });
    expect(result.sections).toEqual(expect.arrayContaining([
      { label: "Midweek Calibration", value: "Wednesday" },
      { label: "Weekly Synthesis", value: "Sunday" },
      { label: "Routine Daily Briefings", value: "Off" },
      { label: "Event Briefings", value: "Photo and DEXA remain active when eligible" },
    ]));
  });

  it("presents authoritative Training structure and priorities", () => {
    const result = composeOperatingPlanStrategyDetail({
      goals: [{ ...goal, currentPhaseId: "p2", phases: [
        { id: "p1", name: "Establish Maintenance", status: "completed" },
        { id: "p2", name: "Lean Mass Build", status: "active" },
      ] }],
      strategyType: "training", protocol: { ...base, name: "Maintenance Training Strategy" },
      version: { effectiveAt: "2026-07-11", goalLinks: [{ goalId: "goal" }], intent: { summary: "Preserve lean mass through the end of the cut." }, trainingStrategy: { weeklyFrequencies: { arms: 2, back: 1 }, physiquePriorities: ["arms", "core"], progression: { pace: "moderate" }, nutritionPhase: "maintenance" } },
    });
    expect(result.title).toBe("Build Lean Mass Training");
    expect(result.sections).toEqual([
      { label: "Weekly Structure", value: "3 area sessions" },
      { label: "Training Focus", value: "Arms, Core" },
      { label: "Progression", value: "Moderate" },
      { label: "Current Goal Phase", value: "Lean Mass Build" },
      { label: "Training Context", value: "Goal-level strategy" },
    ]);
    expect(result.purpose).toContain("your Build Lean Mass goal");
    expect(result.purpose).not.toMatch(/cut|preserve lean mass/i);
  });


  it("uses the protocol version date and never classifies Phase Execution as Cut", () => {
    const result = composeOperatingPlanStrategyDetail({
      goals: [{ ...goal, currentPhaseId: "p2", phases: [
        { id: "p1", name: "Establish Maintenance", status: "completed" },
        { id: "p2", name: "Lean Mass Build", status: "active" },
      ] }],
      strategyType: "energy",
      protocol: { ...base, currentVersionId: "v2", effectiveStrategy: {
        mode: "Phase Execution",
        caloricIntakeTarget: { value: 2500, unit: "kcal/day" },
        activityExpenditureTarget: { value: 800, unit: "kcal/day" },
        monitoringCadence: "weekly",
        strategicReviewCadence: "monthly",
        strategicReviewAnchor: "dexa_body_composition",
      } },
      version: { id: "v2", effectiveAt: "2026-08-15" },
    });
    expect(result.startedDate).toBe("August 15, 2026");
    expect(result.sections).toEqual(expect.arrayContaining([
      { label: "Current Energy Phase", value: "Phase execution" },
      { label: "Evidence Monitoring", value: "Weekly evidence review" },
      { label: "Strategic Review", value: "Monthly · DEXA and body composition aligned" },
      { label: "Strategy Changes", value: "Adjusted as the evidence supports it" },
    ]));
    expect(JSON.stringify(result)).not.toMatch(/\bCut\b/);
  });
  it("uses stable IDs and returns no fabricated detail when unavailable", () => {
    expect(getOperatingPlanStrategyHref("energy", "protocol_energy")).toBe("/profile/operating-plan/strategy/energy/protocol_energy");
    expect(getOperatingPlanStrategyHref("nutrition", null)).toBeNull();
    expect(composeOperatingPlanStrategyDetail({ strategyType: "training" })).toBeNull();
  });
});
