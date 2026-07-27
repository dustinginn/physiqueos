import { describe, expect, it } from "vitest";
import {
  createPIDEXAConfidenceReasoning,
} from "./PIDEXAConfidenceReasoningService";

describe("PI DEXA confidence reasoning", () => {
  it("treats the first scan as a baseline without proving progress", () => {
    const result = reason({ priorScan: null, lean: 0, bodyFat: 0 });
    expect(result.role).toBe("baseline");
    expect(result.domainStates.dexa).toMatchObject({
      status: "recent_baseline",
      authoritative: true,
    });
  });

  it("classifies supported lean direction with a stable guardrail as confirming", () => {
    expect(reason({ lean: 1.2, bodyFat: 0.1, guardrail: "within" }).role)
      .toBe("confirming");
  });

  it.each([
    [{ lean: -1.4, bodyFat: -0.4 }, "continued loss"],
    [{ lean: 0.1, bodyFat: 1.4, guardrail: "above" }, "unwanted fat gain"],
  ])("classifies %s as contradicting", (input) => {
    expect(reason(input).role).toBe("contradicting");
  });

  it("uses deterministic authoritative-consumption identity", () => {
    expect(reason({ lean: 1, bodyFat: 0 }).consumptionKey)
      .toBe(reason({ lean: 1, bodyFat: 0 }).consumptionKey);
  });
});

function reason({
  priorScan = { id: "dexa_july_18" },
  lean,
  bodyFat,
  guardrail = "within",
} = {}) {
  return createPIDEXAConfidenceReasoning({
    scan: { id: "dexa_august_15", measuredAt: "2026-08-15" },
    priorScan,
    narrative: {
      progress: { headline: [
        { label: "Lean Tissue", delta: lean },
        { label: "Body Fat", delta: bodyFat },
      ] },
      interpretation: {
        guardrailStatus: guardrail,
        uncertainty: "Comparable scan.",
      },
    },
    context: {
      activeGoal: { id: "goal_build_lean_mass" },
      activePhase: { id: "phase_establish_maintenance" },
      uncertainty: { state: "comparison_available", limitations: [] },
      pi: { observations: [{ id: "dexa_observation_august_15" }] },
    },
  });
}
