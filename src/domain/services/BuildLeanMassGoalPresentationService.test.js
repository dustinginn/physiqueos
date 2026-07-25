import { describe, expect, it } from "vitest";
import { composeBuildLeanMassGoalPresentation } from "./BuildLeanMassGoalPresentationService";

describe("BuildLeanMassGoalPresentationService", () => {
  it("adapts the committed goal into the existing read-only narrative screen contract", () => {
    const goal = Object.freeze({
      id: "goal-new",
      title: "Build Lean Mass",
      type: "build_lean_mass",
      status: "active",
      activatedAt: "2026-07-21T04:53:31.759Z",
      openingApproach: {
        known: ["Current body composition"],
        unknown: ["True maintenance intake"],
        recommendationReason: "Calibration is required.",
      },
      guardrails: [{ text: "Maintain approximately 8–9% body fat.", accepted: true }],
      progressMeasurement: {
        outcomeMeasures: [{ label: "DEXA lean mass", accepted: true }],
      },
    });

    const narrative = composeBuildLeanMassGoalPresentation(goal);
    expect(narrative).toMatchObject({
      goalId: "goal-new",
      hero: { title: "Build Lean Mass", state: "Calibration Active" },
      provenance: { presentationOnly: true, persisted: false },
    });
    expect(narrative.completionCriteria).toEqual([{ label: "DEXA lean mass", status: "In Progress" }]);
    expect(goal.status).toBe("active");
  });
});
