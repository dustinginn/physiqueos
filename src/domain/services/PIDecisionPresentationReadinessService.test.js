import { describe, expect, it } from "vitest";
import {
  assessPIDecisionPresentationReadiness,
} from "./PIDecisionPresentationReadinessService";

function safe(overrides = {}) {
  return {
    goalCadenceEligible: true,
    acceptedFields: ["decisionVerdict"],
    recommendationCompatibility: "compatible",
    eventAuthority: "no_event",
    memoryCompatible: true,
    artifactShapePreserved: true,
    renderingCompatible: true,
    overlapState: "complementary",
    ...overrides,
  };
}

describe("PIDecisionPresentationReadinessService", () => {
  it("recognizes a proven safe existing seam deterministically", () => {
    const input = {
      daily: safe({ acceptedFields: ["decisionContext"] }),
      midweek: safe(),
      weekly: safe({ acceptedFields: ["operationalVerdict"] }),
    };
    const result = assessPIDecisionPresentationReadiness(input);
    expect(result.authorityReadyCadences).toEqual([
      "daily", "midweek", "weekly",
    ]);
    expect(assessPIDecisionPresentationReadiness(input)).toEqual(result);
  });

  it("keeps cadences shadow-only when no accepted Decision field exists", () => {
    const result = assessPIDecisionPresentationReadiness({
      daily: safe({ goalCadenceEligible: false, acceptedFields: [] }),
      midweek: safe({ acceptedFields: ["heroVerdict"] }),
      weekly: safe({ acceptedFields: ["summary"] }),
    });
    expect(result.authorityReadyCadences).toEqual([]);
    expect(result.byCadence.daily.reason).toBe("goal_cadence_not_eligible");
    expect(result.byCadence.midweek.existingSeam).toBe("shadow_only");
    expect(result.byCadence.weekly.existingSeam).toBe("shadow_only");
  });

  it.each([
    ["conflicts", "recommendation_compatibility_not_proven"],
    ["unknown", "recommendation_compatibility_not_proven"],
  ])("blocks %s recommendation relationship", (compatibility, reason) => {
    const result = assessPIDecisionPresentationReadiness({
      midweek: safe({ recommendationCompatibility: compatibility }),
    });
    expect(result.byCadence.midweek).toMatchObject({
      authorityReady: false,
      reason,
    });
  });

  it.each([
    "event_owns_decision",
    "goal_completion_owns_surface",
    "goal_transition_owns_surface",
  ])("suppresses routine authority for %s", (eventAuthority) => {
    const result = assessPIDecisionPresentationReadiness({
      weekly: safe({
        acceptedFields: ["operationalVerdict"],
        eventAuthority,
      }),
    });
    expect(result.byCadence.weekly).toMatchObject({
      authorityReady: false,
      reason: "event_owns_surface",
    });
  });

  it("recognizes event-only seams without granting routine authority", () => {
    const result = assessPIDecisionPresentationReadiness({
      daily: safe({
        acceptedFields: ["eventSupportingInterpretation"],
        eventAuthority: "event_owns_decision",
      }),
    });
    expect(result.byCadence.daily.existingSeam).toBe("event_only_seam");
    expect(result.byCadence.daily.authorityReady).toBe(false);
  });

  it("requires artifact-shape and memory compatibility", () => {
    expect(assessPIDecisionPresentationReadiness({
      midweek: safe({ artifactShapePreserved: false }),
    }).byCadence.midweek.reason).toBe("artifact_shape_parity_not_proven");
    expect(assessPIDecisionPresentationReadiness({
      midweek: safe({ memoryCompatible: false }),
    }).byCadence.midweek.reason).toBe(
      "decision_memory_compatibility_not_proven"
    );
  });
});
