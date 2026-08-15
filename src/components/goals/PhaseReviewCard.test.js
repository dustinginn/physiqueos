import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./PhaseReviewCard.jsx", import.meta.url), "utf8");

describe("reusable Phase Review component boundary", () => {
  it("is Goal-generic and contains no DEXA or Build Lean Mass behavior", () => {
    expect(source).toContain("PhaseReviewPresentationService");
    expect(source).not.toMatch(/DEXA|Build Lean Mass|FounderRepositories|GoalTransition/);
  });
  it("keeps both paths in one card with no separate wizard or persistence", () => {
    expect(source.match(/<DecisionOption/g)).toHaveLength(2);
    expect(source).toContain("phase-review-decisions");
    expect(source).toContain("Extension Duration");
    expect(source).toContain('type="date"');
    expect(source).toContain("Recommended");
    expect(source).toContain("Preview only");
    expect(source).not.toMatch(/router\.push|fetch\(|server action|persist\(|publish\(/i);
  });
  it("requires target review before the explicit Begin authorization", () => {
    expect(source).toContain("phase-establishment");
    expect(source).toContain("Caloric intake target");
    expect(source).toContain("Activity / expenditure target");
    expect(source).toContain("Review ${review.nextPhase.shortName} Strategy");
    expect(source).toContain("Authorize and Begin ${review.nextPhase.shortName}");
    expect(source).toContain("caloricIntakeTarget");
    expect(source).toContain("activityExpenditureTarget");
  });
  it("conditions extension and next-phase projections on the user's selection", () => {
    expect(source).toContain("extending && <fieldset");
    expect(source).toContain("!extending && projection");
    expect(source).toContain("setSelectedOutcome");
    expect(source.indexOf("phase-review-recommendation")).toBeLessThan(
      source.indexOf("phase-review-decisions")
    );
  });
});
