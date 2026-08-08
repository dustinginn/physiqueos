import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./PhaseReviewCard.jsx", import.meta.url), "utf8");

describe("reusable Phase Review component boundary", () => {
  it("is Goal-generic and contains no DEXA or Build Lean Mass behavior", () => {
    expect(source).toContain("PhaseReviewPresentationService");
    expect(source).not.toMatch(/DEXA|Build Lean Mass|FounderRepositories|GoalTransition/);
  });
  it("keeps both paths in one card with no wizard or persistence", () => {
    expect(source.match(/<DecisionOption/g)).toHaveLength(2);
    expect(source).toContain("phase-review-decisions");
    expect(source).toContain("Extension Duration");
    expect(source).toContain('type="date"');
    expect(source).toContain("Recommended");
    expect(source).toContain("Preview only");
    expect(source).not.toMatch(/router\.push|fetch\(|server action|persist|publish/i);
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
