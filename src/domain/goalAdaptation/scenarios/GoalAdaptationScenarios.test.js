import { describe, expect, it } from "vitest";

import { runGoalAdaptationScenarios } from "./runGoalAdaptationScenarios.js";

describe("Founder scenario acceptance gate (actual Phase A engine)", () => {
  const run = runGoalAdaptationScenarios();

  it("covers at least 15 scenarios across leaning, mass building, strength and maintenance", () => {
    expect(run.total).toBeGreaterThanOrEqual(15);
    expect(new Set(run.results.map((item) => item.category))).toEqual(new Set(["leaning", "mass_building", "strength", "maintenance"]));
    expect(run.noAdaptationOutcomes).toBeGreaterThan(0);
  });

  it.each(runGoalAdaptationScenarios().results.map((item) => [item.id, item]))("%s matches its expected engine outcome", (id, result) => {
    const failed = result.checks.filter((check) => !check.pass);
    expect(failed).toEqual([]);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(runGoalAdaptationScenarios())).toBe(JSON.stringify(run));
  });
});
