import { describe, expect, it, vi } from "vitest";
import {
  createPIGoalConfidenceAssessmentService,
  PI_GOAL_CONFIDENCE_ASSESSMENT_SERVICE_VERSION,
} from "./PIGoalConfidenceAssessmentService";
import {
  attachPIGoalConfidenceCompanion,
  PI_DECISION_COMPANION_OUTPUTS,
} from "./PIDecisionSemanticContract";
import {
  createPIGoalConfidenceContractFixture,
} from "../../fixtures/piGoalConfidenceAssessmentFixtures";

describe("PIGoalConfidenceAssessmentService", () => {
  it("builds a canonical PI-owned assessment from prepared reasoning", () => {
    const result = createPIGoalConfidenceAssessmentService()
      .assess(createPIGoalConfidenceContractFixture());
    expect(result).toMatchObject({
      schemaVersion: "pi_goal_confidence_assessment_v1",
      assessmentType: "goal_progress_confidence",
      goalId: "goal_build_lean_mass",
      phaseId: "phase_establish_maintenance",
    });
    expect(PI_GOAL_CONFIDENCE_ASSESSMENT_SERVICE_VERSION)
      .toBe("pi_goal_confidence_assessment_service_v1");
  });

  it("does not read repositories, clocks, or invoke persistence callbacks", () => {
    const repositories = new Proxy({}, {
      get() {
        throw new Error("Repository access is forbidden.");
      },
    });
    const persist = vi.fn();
    const clock = vi.fn(() => {
      throw new Error("Runtime clock access is forbidden.");
    });
    const result = createPIGoalConfidenceAssessmentService().assess({
      ...createPIGoalConfidenceContractFixture(),
      repositories,
      persist,
      now: clock,
    });
    expect(result.id).toBeTruthy();
    expect(persist).not.toHaveBeenCalled();
    expect(clock).not.toHaveBeenCalled();
  });

  it("keeps the PI decision result valid when the companion is absent", () => {
    const decision = Object.freeze({
      schemaVersion: "pi_decision_result_v1",
      status: "advisory",
    });
    expect(attachPIGoalConfidenceCompanion(decision, null)).toEqual(decision);
    expect(decision).not.toHaveProperty("goalConfidenceAssessment");
  });

  it("attaches goal confidence only as an explicit semantic companion", () => {
    const assessment = createPIGoalConfidenceAssessmentService()
      .assess(createPIGoalConfidenceContractFixture());
    const result = attachPIGoalConfidenceCompanion({
      schemaVersion: "pi_decision_result_v1",
      confidence: { level: "moderate" },
      presentationReadiness: "ready",
    }, assessment);
    expect(result.goalConfidenceAssessment).toEqual(assessment);
    expect(result.confidence).toEqual({ level: "moderate" });
    expect(result.presentationReadiness).toBe("ready");
    expect(PI_DECISION_COMPANION_OUTPUTS.goalConfidenceAssessment.distinctFrom)
      .toContain("decision_confidence");
  });
});
