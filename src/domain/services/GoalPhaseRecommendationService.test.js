import { describe, expect, it } from "vitest";
import {
  GoalPhaseRecommendation,
  GoalPhaseRecommendationConfidence,
  GoalPhaseRecommendationService,
  adaptSuggestedPhaseToGoalPhaseInput,
  recommendGoalPhases,
} from "./GoalPhaseRecommendationService";

const leanMassPlan = () => ({
  title: "Build lean mass",
  objective: "Add 10 lb of lean mass",
  archetype: "lean_mass",
  targetDate: "2026-10-31",
  calibration: {
    required: true,
    name: "Establish Maintenance",
    purpose: "Learn the intake and activity level that maintains current weight.",
    duration: { value: 4, unit: "weeks" },
    successCriteria: [{ label: "Maintenance intake established" }],
  },
  successCriteria: [{ label: "Add 10 lb of lean mass" }],
  guardrails: [{ label: "Remain within the supplied body-fat range" }],
});

describe("GoalPhaseRecommendationService", () => {
  it("returns deterministic, deeply immutable output without mutating input", () => {
    const input = leanMassPlan();
    const before = structuredClone(input);
    const first = recommendGoalPhases(input);
    expect(recommendGoalPhases(structuredClone(input))).toEqual(first);
    expect(input).toEqual(before);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.suggestedPhases[0].successCriteria[0])).toBe(true);
  });

  it("uses only supported recommendation and confidence values", () => {
    const output = recommendGoalPhases(leanMassPlan());
    expect(Object.values(GoalPhaseRecommendation)).toContain(output.recommendation);
    expect(Object.values(GoalPhaseRecommendationConfidence)).toContain(output.confidence);
  });

  it("recommends supplied maintenance calibration before lean-mass work", () => {
    const output = recommendGoalPhases(leanMassPlan());
    expect(output).toMatchObject({ recommendation: "recommended", confidence: "high", userChoiceRequired: true });
    expect(output.sourceSignals).toEqual(expect.arrayContaining(["calibration_required", "event_or_deadline"]));
    expect(output.suggestedPhases).toEqual([
      expect.objectContaining({ name: "Establish Maintenance", timingMode: "fixed_duration", duration: { value: 4, unit: "weeks" }, order: 0 }),
      expect.objectContaining({ name: "Build Lean Mass", timingMode: "target_date", targetDate: "2026-10-31", order: 1 }),
    ]);
    expect(output.suggestedPhases.every((phase) => phase.guardrails.length === 0)).toBe(true);
    expect(output.suggestedPhases[1].successCriteria).toEqual([{ label: "Add 10 lb of lean mass" }]);
  });

  it("does not hard-code Build Lean Mass values when planning input omits them", () => {
    const output = recommendGoalPhases({
      title: "Build lean mass", archetype: "lean_mass",
      calibration: { required: true },
    });
    expect(output.suggestedPhases[0].duration).toBeNull();
    expect(output.suggestedPhases[1].targetDate).toBeNull();
    expect(JSON.stringify(output)).not.toMatch(/10 lb|October|8.?9%|4 weeks/i);
  });

  it("recommends a foundation and event preparation for a first 10K without a running habit", () => {
    const output = recommendGoalPhases({
      title: "Run my first 10K", archetype: "running_event",
      establishedHabit: false, targetDate: "2027-04-10",
      capacity: { required: true, name: "Build Running Capacity" },
      successCriteria: [{ label: "Complete the 10K" }],
    });
    expect(output.recommendation).toBe("recommended");
    expect(output.sourceSignals).toContain("capacity_building_required");
    expect(output.suggestedPhases.map((phase) => phase.order)).toEqual([0, 1]);
    expect(output.suggestedPhases[1].targetDate).toBe("2027-04-10");
  });

  it("recommends marathon base, build, peak, and taper stages without fabricating timing", () => {
    const output = recommendGoalPhases({ title: "Run a marathon", archetype: "marathon", operationalStrategyChanges: true });
    expect(output.suggestedPhases.map((phase) => phase.name)).toEqual(["Base", "Build", "Peak", "Taper"]);
    expect(output.suggestedPhases.every((phase) => phase.duration === null && phase.targetDate === null)).toBe(true);
  });

  it("supports a supplied calorie-calibration stage for fat loss", () => {
    const output = recommendGoalPhases({ title: "Lose fat", archetype: "fat_loss", calibration: { required: true, name: "Calibrate Calories" } });
    expect(output.recommendation).toBe("recommended");
    expect(output.suggestedPhases).toHaveLength(2);
  });

  it.each([
    ["Drink more water", "hydration"],
    ["Meditate every day", "meditation"],
    ["Walk 10,000 steps", "daily_steps"],
  ])("does not recommend phases for the continuous habit %s", (title, archetype) => {
    expect(recommendGoalPhases({ title, archetype, recurringBehavior: true })).toMatchObject({ recommendation: "not_recommended", suggestedPhases: [], userChoiceRequired: false, sourceSignals: ["single_continuous_behavior"] });
  });

  it("does not recommend phases for a short simple one-time goal", () => {
    expect(recommendGoalPhases({ title: "Submit one form", objective: "Submit it this week", horizonDays: 7 })).toMatchObject({ recommendation: "not_recommended", suggestedPhases: [], userChoiceRequired: false });
  });

  it("returns a low-confidence optional result for insufficient detail without fabricating phases", () => {
    expect(recommendGoalPhases({})).toMatchObject({ recommendation: "optional", confidence: "low", suggestedPhases: [], userChoiceRequired: true, sourceSignals: ["insufficient_goal_detail"] });
  });

  it("preserves supplied stage duration and ordering", () => {
    const output = recommendGoalPhases({ title: "Prepare", proposedStages: [
      { name: "Prepare", purpose: "Prepare", duration: { value: 10, unit: "days" } },
      { name: "Perform", purpose: "Perform", targetDate: "2027-05-01" },
      { name: "Recover", purpose: "Recover" },
    ] });
    expect(output.suggestedPhases.map((phase) => phase.order)).toEqual([0, 1, 2]);
    expect(output.suggestedPhases[0].duration).toEqual({ value: 10, unit: "days" });
    expect(output.suggestedPhases[1].targetDate).toBe("2027-05-01");
  });

  it("adapts a suggestion into a valid strict GoalPhase only with authored identity", () => {
    const suggestion = recommendGoalPhases(leanMassPlan()).suggestedPhases[0];
    const phase = adaptSuggestedPhaseToGoalPhaseInput(suggestion, { id: "phase-maintenance", goalId: "goal-new" });
    expect(phase).toMatchObject({ id: "phase-maintenance", goalId: "goal-new", status: "upcoming", recommendationMetadata: { kind: "goal_phase_suggestion" } });
    expect(Object.isFrozen(phase)).toBe(true);
    expect(() => adaptSuggestedPhaseToGoalPhaseInput(suggestion, {})).toThrow(/id and goalId/);
  });

  it("exposes the same opt-in API through the service object", () => {
    expect(GoalPhaseRecommendationService.recommendGoalPhases(leanMassPlan())).toEqual(recommendGoalPhases(leanMassPlan()));
  });
});
