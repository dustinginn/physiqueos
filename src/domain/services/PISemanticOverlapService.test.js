import { describe, expect, it } from "vitest";
import {
  assessPISemanticOverlap,
  suppressPISemanticOverlap,
} from "./PISemanticOverlapService";

describe("PI semantic overlap", () => {
  it.each([
    [candidate("weight", "weight"), candidate("training", "training"), "none"],
    [candidate("direct", "training", "improving"), candidate("protein", "training", "improving"), "partial_overlap"],
    [candidate("energy-a", "training", "improving", ["paired_energy_coverage_partial"]), candidate("energy-b", "training", "improving", ["energy_evidence_incomplete"]), "redundant"],
    [candidate("protein", "training", "improving"), candidate("energy", "training", "stable"), "complementary"],
    [{ ...candidate("event", "photos"), candidateType: "photo_event" }, candidate("training", "training"), "higher_authority_owned"],
  ])("classifies overlap deterministically", (left, right, state) => {
    expect(assessPISemanticOverlap(left, right).state).toBe(state);
    expect(assessPISemanticOverlap(left, right)).toEqual(assessPISemanticOverlap(left, right));
  });

  it("preserves the first ranked meaning and suppresses only redundant entries", () => {
    const first = candidate("first", "training", "improving", ["paired_energy_coverage_partial"]);
    const duplicate = candidate("second", "training", "improving", ["energy_evidence_incomplete"]);
    const complementary = candidate("third", "training", "stable");
    const result = suppressPISemanticOverlap([first, duplicate, complementary]);
    expect(result.selected.map((item) => item.id)).toEqual(["first", "third"]);
    expect(result.suppressed[0].overlap.state).toBe("redundant");
  });
});

function candidate(id, domain, trainingStatus = "stable", limitations = []) {
  return {
    id,
    candidateType: "cross_domain_claim",
    semanticFamily: id,
    participatingDomains: [domain],
    direction: trainingStatus,
    explanationData: { trainingStatus },
    limitations,
  };
}
