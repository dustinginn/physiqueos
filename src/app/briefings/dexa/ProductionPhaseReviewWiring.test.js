import fs from "node:fs";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync(new URL("./[scanId]/page.js", import.meta.url), "utf8");
const action = fs.readFileSync(new URL("./[scanId]/actions.js", import.meta.url), "utf8");
const card = fs.readFileSync(new URL("../../../components/goals/PhaseReviewCard.jsx", import.meta.url), "utf8");
const historical = fs.readFileSync(new URL("../review/[artifactId]/page.js", import.meta.url), "utf8");

describe("production DEXA Phase Review wiring", () => {
  it("renders the canonical card after Coach's Insight without changing historical DEXA", () => {
    expect(route).toContain("resolvePhaseReviewArtifactRead");
    expect(route).toContain("phaseReviewRead.readOnly");
    expect(card.indexOf("Coach")).toBe(-1);
    expect(historical).toContain("<PhaseReviewCard readOnly");
  });

  it("keeps both decisions, the recommendation badge, and conditional extension controls", () => {
    expect(card.match(/<DecisionOption/g)).toHaveLength(2);
    expect(card).toContain("recommended={review.recommendation");
    expect(card).toContain("extending && <fieldset");
    expect(card).toContain("!extending && projection");
  });

  it("invokes only the production server boundary and returns safe failures", () => {
    expect(action).toContain("executeAuthorizedPhaseReview(request)");
    expect(action).not.toContain("ProductionPhaseReviewCoordinatorFactory");
    expect(action).not.toMatch(/MutationService|FounderRepositories|persistFounder|createUnitOfWork/);
    expect(action).toContain("Nothing was changed");
    expect(card).toContain("submitDecision(createDecisionRequest");
    expect(card).toContain('"extend_current_phase"');
  });

  it("keeps synthetic preview disconnected", () => {
    expect(card).toContain("if (!submitDecision)");
    expect(card).toContain("setPreviewed(true)");
  });
});
