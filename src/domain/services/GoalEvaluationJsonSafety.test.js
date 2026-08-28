import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../contracts/v1/canonicalJson";
import { GoalEvaluationService } from "./GoalEvaluationService";

const baseGoal = Object.freeze({
  id: "goal_optional_metric",
  title: "Optional metric goal",
  type: "habit",
  primary: false,
  status: "active",
});

describe("GoalEvaluationService JSON output", () => {
  it("preserves a present metric key and represents an absent metric key as null", () => {
    const [withMetric] = evaluate([{ ...baseGoal, metricKey: "customMetric" }]);
    const [withoutMetric] = evaluate([baseGoal]);

    expect(withMetric.metricKey).toBe("customMetric");
    expect(withoutMetric.metricKey).toBeNull();
    expect(withoutMetric).toEqual({ ...withMetric, metricKey: null });
  });

  it("round-trips through strict canonical JSON without field loss or reordering evaluations", () => {
    const evaluations = evaluate([
      baseGoal,
      { ...baseGoal, id: "goal_with_metric", metricKey: "customMetric" },
    ]);

    const serialized = canonicalJson(evaluations);
    const roundTripped = JSON.parse(serialized);

    expect(roundTripped).toEqual(evaluations);
    expect(roundTripped.map((evaluation) => evaluation.goalId)).toEqual([
      "goal_optional_metric",
      "goal_with_metric",
    ]);
    expect(serialized).not.toContain("undefined");
  });

  it("keeps the complete mixed evaluation batch JSON-safe", () => {
    const evaluations = evaluate([
      { ...baseGoal, id: "goal_visible_abs_at_rest", metricKey: "visualDefinition" },
      { ...baseGoal, id: "goal_maintain_8_9_body_fat", metricKey: "bodyFatPercentage" },
      { ...baseGoal, id: "goal_preserve_lean_mass", metricKey: "leanMass" },
      baseGoal,
    ]);

    expect(() => canonicalJson(evaluations)).not.toThrow();
    expect(evaluations.at(-1)?.metricKey).toBeNull();
  });
});

function evaluate(goals) {
  return GoalEvaluationService.getGoalEvaluations({ goals });
}
