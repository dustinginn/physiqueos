import { describe, expect, it } from "vitest";
import { attachCanonicalProvenanceToProtocolVersion } from "./FutureProtocolProvenanceService";

describe("future protocol provenance", () => {
  it("persists resolved fixed target provenance", () => {
    expect(enrich({ proteinBasis: "fixed", fixedProtein: 180 }).canonicalProvenance.target)
      .toMatchObject({ mode: "fixed_grams", configuredValue: 180, status: "resolved" });
  });

  it("persists exact body-weight target inputs when supplied", () => {
    expect(enrich({
      proteinBasis: "body_weight", proteinRatio: 0.8, proteinTarget: 132,
      bodyWeightValue: 165, bodyWeightUnit: "lb", bodyWeightDate: "2026-07-23",
      bodyWeightEvidenceId: "weight", proteinRoundingRule: "nearest_integer",
    }).canonicalProvenance.target).toMatchObject({
      mode: "grams_per_pound",
      configuredRatio: 0.8,
      translatedValue: 132,
      status: "resolved",
      inputProvenance: { weightEvidenceId: "weight" },
    });
  });

  it("preserves unresolved and conflicting source facts without guessing", () => {
    const target = enrich({
      proteinBasis: "body_weight", proteinRatio: 1,
      proteinTarget: 167, fixedProtein: 180,
    }).canonicalProvenance.target;
    expect(target).toMatchObject({
      status: "conflicted",
      sourceFacts: { proteinTarget: 167, fixedProtein: 180 },
    });
    expect(target.inputProvenance).toBeNull();
  });

  it("does not create numeric target provenance for other categories", () => {
    expect(enrich({}, "training").canonicalProvenance.target).toBeNull();
  });
});
function enrich(reviewedChanges, protocolCategory = "nutrition") {
  return attachCanonicalProvenanceToProtocolVersion({
    id: "protocol-v1",
    protocolId: "protocol",
    protocolCategory,
    status: "planned",
    effectiveAt: "2026-07-23T16:54:00.550Z",
    change: { previousVersionId: "prior", reviewedChanges },
    goalLinks: [{ goalId: "goal", relationship: "supports" }],
    confirmation: { authority: "accepted_goal_transition" },
  });
}
