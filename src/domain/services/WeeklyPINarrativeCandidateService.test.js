import { describe, expect, it } from "vitest";
import { adaptWeeklyPISelection, createWeeklyPINarrativeCandidate } from "./WeeklyPINarrativeCandidateService";

describe("Weekly PI narrative candidate adapter", () => {
  it("adapts shared ranking fields without rescoring", () => {
    const adapted = createWeeklyPINarrativeCandidate(entry("energy_trend"));
    expect(adapted).toMatchObject({
      candidateId: "candidate-1",
      editorialTemplateKey: "weekly_energy_calibration",
      measuredDirections: { balance: "higher" },
      provenance: { sharedRank: 2, sharedScore: 61 },
    });
  });

  it("returns at most one primary and two supporting candidates", () => {
    const selection = adaptWeeklyPISelection({
      primary: [entry("cross_domain_claim")],
      supporting: [entry("direct_training", "two"), entry("energy_trend", "three"), entry("energy_trend", "four")],
    });
    expect(selection.primary.editorialTemplateKey).toBe("weekly_cross_domain_relationship");
    expect(selection.supporting).toHaveLength(2);
  });
});

function entry(candidateType, id = "1") {
  return {
    rank: 2,
    score: 61,
    candidate: {
      id: `candidate-${id}`,
      sourceId: `source-${id}`,
      candidateType,
      relationshipKind: candidateType === "cross_domain_claim" ? "training_weight" : null,
      thesisDomain: candidateType === "direct_training" ? "training" : "energy",
      direction: "higher",
      confidence: { level: "moderate", score: 0.7 },
      coverage: { state: "partial" },
      limitations: ["partial_coverage"],
      supportingEvidenceIds: [`evidence-${id}`],
      goalContext: { role: "context" },
      explanationData: { comparison: { netBalance: { direction: "higher" } } },
    },
  };
}
