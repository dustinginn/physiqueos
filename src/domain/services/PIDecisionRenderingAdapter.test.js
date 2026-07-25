import { describe, expect, it } from "vitest";
import { createPIDecisionAssessment } from "./PIDecisionAssessmentModel";
import {
  createPIDecisionRenderingConcept,
} from "./PIDecisionRenderingAdapter";

function assessment(decisionKind, overrides = {}) {
  const review = decisionKind.startsWith("review_");
  const domain = decisionKind === "review_energy_support" ? "energy"
    : decisionKind === "review_training_status" ? "training"
      : decisionKind === "review_recovery_status" ? "recovery"
        : decisionKind === "review_body_fat_guardrail" ? "body_fat_guardrail"
          : decisionKind === "maintain_current_plan" ? "plan"
            : decisionKind.includes("conflicting") ? "cross_domain" : "evidence";
  return createPIDecisionAssessment({
    decisionKind,
    status: decisionKind === "insufficient_evidence_for_change"
      ? "insufficient" : review || decisionKind === "maintain_current_plan"
        ? "supported" : "provisional",
    cadence: "weekly",
    goalContext: {
      activeGoalId: "goal",
      semanticGoalType: "lean_mass_gain",
    },
    phaseContext: { phaseAgeBand: "week_1_to_4" },
    decisionScope: "goal_phase",
    domain,
    confidence: { level: "moderate", method: "fixture" },
    materiality: { level: "moderate" },
    lifecycle: { state: "new", observationCount: 1 },
    evidenceWindow: { startDate: "2026-07-19", endDate: "2026-07-25" },
    evidenceCompleteness:
      review || decisionKind === "maintain_current_plan" ? "complete" : "partial",
    rationaleData: {},
    recommendationCompatibility: "compatible",
    eventAuthority: "no_event",
    createdFrom: "fixture",
    provenance: { producer: "fixture" },
    ...overrides,
  });
}

describe("PIDecisionRenderingAdapter", () => {
  it.each([
    "maintain_current_plan",
    "continue_observing",
    "insufficient_evidence_for_change",
    "review_energy_support",
    "review_training_status",
    "review_recovery_status",
    "review_body_fat_guardrail",
    "conflicting_evidence_continue_observing",
  ])("renders bounded non-executable concept for %s", (kind) => {
    const rendered = createPIDecisionRenderingConcept(assessment(kind));
    expect(rendered).toMatchObject({
      decisionKind: kind,
      executableAction: null,
      recommendationObject: null,
    });
    expect(rendered.text).not.toMatch(
      /increase calories|decrease calories|deload|diagnos|overtrain|under.?recover/i
    );
    expect(JSON.stringify(rendered)).not.toMatch(
      /pi_decision_assessment_v1|supportingClaimIds|rationaleData/
    );
  });

  it("suppresses event-owned decisions", () => {
    expect(createPIDecisionRenderingConcept(assessment(
      "continue_observing",
      { eventAuthority: "event_owns_decision" }
    ))).toBeNull();
  });
});
