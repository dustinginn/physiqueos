import { describe, expect, it } from "vitest";
import {
  createPIPhotoConfidenceReasoning,
} from "./PIPhotoConfidenceReasoningService";

describe("PI Photo confidence reasoning", () => {
  it.each([
    ["holding steady", "supporting"],
    ["waist looks softer", "conflicting"],
    ["comparison is inconclusive", "inconclusive"],
  ])("classifies %s as %s", (summary, role) => {
    expect(reason({ summary }).role).toBe(role);
  });

  it("rejects unpaired or fallback-only images as limiting", () => {
    const result = reason({ paired: false });
    expect(result).toMatchObject({
      role: "limiting",
      publicationEligible: false,
      comparison: { eligible: false },
    });
  });

  it("deduplicates repeated pose-pair lineage deterministically", () => {
    const first = reason({ summary: "holding steady" });
    const second = reason({ summary: "holding steady" });
    expect(first.consumptionKey).toBe(second.consumptionKey);
    expect(first.comparison.poseFingerprints).toHaveLength(1);
  });

  it("does not use photo count as publication eligibility", () => {
    const result = reason({ paired: false, extraViews: 5 });
    expect(result.publicationEligible).toBe(false);
  });
});

function reason({
  summary = "holding steady",
  paired = true,
  extraViews = 0,
} = {}) {
  const primary = {
    canonicalViewId: "view_current",
    poseId: "front-relaxed",
    analysisMode: "vision",
    comparison: paired ? {
      previousSessionId: "session_prior",
      previousCanonicalViewId: "view_prior",
      analysisId: "comparison_front_relaxed",
    } : null,
    conditionDifferences: [],
  };
  return createPIPhotoConfidenceReasoning({
    session: {
      id: "session_future",
      captureDate: "2026-08-08",
      synthesis: { id: "synthesis_future" },
      views: [primary, ...Array.from({ length: extraViews }, (_, index) => ({
        canonicalViewId: `unpaired_${index}`,
        poseId: "unknown",
        analysisMode: "vision",
      }))],
    },
    narrative: {
      overallSummary: summary,
      keyVisibleChanges: [summary],
      stableSignals: [summary],
      conditionLimitations: [],
    },
    context: {
      activeGoal: { id: "goal_build_lean_mass" },
      activePhase: { id: "phase_establish_maintenance" },
    },
  });
}
