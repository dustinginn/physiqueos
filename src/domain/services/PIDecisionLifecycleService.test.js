import { describe, expect, it } from "vitest";
import { createPIDecisionAssessment } from "./PIDecisionAssessmentModel";
import {
  evaluatePIDecisionLifecycle,
  evaluatePIDecisionSetLifecycle,
} from "./PIDecisionLifecycleService";

function assessment(overrides = {}) {
  return createPIDecisionAssessment({
    decisionKind: "continue_observing",
    status: "provisional",
    cadence: "weekly",
    goalContext: {
      activeGoalId: "goal",
      semanticGoalType: "lean_mass_gain",
    },
    phaseContext: { phaseAgeBand: "week_1_to_4" },
    decisionScope: "domain_review",
    domain: "cross_domain",
    confidence: { level: "low", method: "fixture" },
    materiality: { level: "low" },
    lifecycle: { state: "unevaluated", observationCount: 0 },
    evidenceWindow: { startDate: "2026-07-19", endDate: "2026-07-25" },
    evidenceCompleteness: "partial",
    limitations: ["partial"],
    rationaleData: {},
    recommendationCompatibility: "unknown",
    eventAuthority: "no_event",
    createdFrom: "fixture",
    provenance: { producer: "fixture" },
    ...overrides,
  });
}

describe("PIDecisionLifecycleService", () => {
  it("supports new, unchanged, strengthened, weakened, and contradicted", () => {
    const first = evaluatePIDecisionLifecycle(
      assessment(), null, { evaluationDate: "2026-07-25" }
    );
    expect(first.lifecycle.state).toBe("new");
    const unchanged = evaluatePIDecisionLifecycle(
      assessment(), first, { evaluationDate: "2026-08-01" }
    );
    expect(unchanged.lifecycle.state).toBe("unchanged");
    const strengthened = evaluatePIDecisionLifecycle(
      assessment({
        status: "supported",
        confidence: { level: "moderate", method: "fixture" },
      }),
      first,
      { evaluationDate: "2026-08-01" }
    );
    expect(strengthened.lifecycle.state).toBe("strengthened");
    const weakened = evaluatePIDecisionLifecycle(
      assessment({ status: "insufficient", evidenceCompleteness: "missing" }),
      first,
      { evaluationDate: "2026-08-01" }
    );
    expect(weakened.lifecycle.state).toBe("weakened");
    const contradicted = evaluatePIDecisionLifecycle(
      assessment({ status: "conflicted" }),
      first,
      { evaluationDate: "2026-08-01" }
    );
    expect(contradicted.lifecycle.state).toBe("contradicted");
  });

  it("resolves displaced supported decisions without a persistent ledger", () => {
    const prior = assessment({
      decisionKind: "maintain_current_plan",
      domain: "plan",
      status: "supported",
      evidenceCompleteness: "complete",
    });
    const current = assessment({
      decisionKind: "review_energy_support",
      domain: "energy",
      status: "supported",
      evidenceCompleteness: "complete",
    });
    const result = evaluatePIDecisionSetLifecycle(
      [current], [prior], { evaluationDate: "2026-08-01" }
    );
    expect(result.currentAssessments[0].lifecycle.state).toBe("new");
    expect(result.transitionedPriorAssessments[0].lifecycle.state).toBe("resolved");
    expect(result.provenance).toMatchObject({
      repositoryReads: 0,
      persistenceWrites: 0,
    });
  });
});
