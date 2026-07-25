import fs from "node:fs";
import { describe, expect, it } from "vitest";

const goalsSource = fs.readFileSync(new URL("./GoalsHubScreen.jsx", import.meta.url), "utf8");
const entryPage = fs.readFileSync(
  new URL("../app/goals/transition/page.js", import.meta.url),
  "utf8"
);
const reviewSource = fs.readFileSync(
  new URL("../app/goals/transition/review/ProductionGoalTransitionFinalReview.jsx", import.meta.url),
  "utf8"
);
const successSource = fs.readFileSync(
  new URL("../app/goals/transition/success/page.js", import.meta.url),
  "utf8"
);

describe("Goals live transition entry point", () => {
  it("places one semantic, full-width, keyboard-visible link in Add Goal", () => {
    expect(goalsSource).toContain("function AddGoalEntry({ transitionEntry })");
    expect(goalsSource).toContain("href={transitionEntry.href}");
    expect(goalsSource).toContain("{transitionEntry.label}");
    expect(goalsSource).toContain("min-h-12 w-full");
    expect(goalsSource).toContain("focus-visible:outline");
  });

  it("uses only the canonical entry route and exposes no preview or final-review shortcut", () => {
    expect(goalsSource).not.toContain("/preview/goals/transition");
    expect(goalsSource).not.toContain("/goals/transition/review");
    expect(goalsSource).not.toContain("ProductionGoalTransitionActivationService");
    expect(goalsSource).not.toContain("GoalTransitionActivationCoordinator");
    expect(goalsSource).not.toContain("FounderStoreUnitOfWork");
  });

  it("keeps rendering and prefetch read-only", () => {
    expect(goalsSource).toContain("safelyGetProductionGoalTransitionEntryPointState");
    expect(goalsSource).not.toMatch(/\.save\(|markReady|activateProduction|consume/);
    expect(goalsSource).not.toContain("<button");
  });

  it("preserves the centered 393px mobile-first layout without overflow", () => {
    expect(goalsSource).toContain("max-w-[393px]");
    expect(goalsSource).toContain("overflow-x-hidden");
    expect(goalsSource).not.toMatch(/w-screen|min-w-\[/);
  });

  it("has a complete production route chain with safe final-review and success exits", () => {
    expect(entryPage).toContain('protocolReviewRoute="/goals/transition/protocols"');
    expect(entryPage).toContain("getProductionGoalTransitionResumeDestination");
    expect(reviewSource).toContain("Confirm and activate");
    expect(reviewSource).toContain('href="/goals/transition/protocols?section=review"');
    expect(successSource).toContain('href="/"');
    expect([goalsSource, entryPage, reviewSource, successSource].join(""))
      .not.toContain("/preview/goals/transition");
  });
});
