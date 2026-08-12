import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./GoalsHubScreen.jsx", import.meta.url), "utf8");
const applicationSource = fs.readFileSync(new URL("../application/goals/GoalsHubReadService.js", import.meta.url), "utf8");

describe("GoalsHubScreen finalized goal index", () => {
  it("renders the approved landing-page hierarchy in order", () => {
    const headings = ["Your Goals", "Primary Goal", "Completed Goals", "Add Goal"];
    let cursor = -1;
    for (const heading of headings) {
      const next = source.indexOf(heading);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
  });

  it("retires supporting-goal and relationship presentation without deleting records", () => {
    expect(source).not.toMatch(/Supporting Goals|Goal Relationships|GoalRelationships|getRelationships/);
    expect(source).toContain("CompletedGoals");
    expect(applicationSource).toContain("title: completed.hero.title");
    expect(applicationSource).toContain('href: "/goals/visible-abs"');
  });

  it("keeps future, edit, progress, projection, and explanatory card UI out of the index", () => {
    expect(source).not.toMatch(/FutureGoals|Future Goals/);
    expect(source).not.toMatch(/EditGoalButton|ProgressBar|estimatedCompletion|supportingExplanation/);
    expect(source).not.toMatch(/goal\.description|goal\.presentation\.detail/);
  });

  it("links each full active-goal card to its canonical production route", () => {
    expect(applicationSource).toContain("resolveGoalNavigationHref");
    expect(source).toContain("href={withReturnContext(goal.navigation.href, from)}");
    expect(source).toContain("if (!goal.navigation.available)");
    expect(source).not.toContain("narrative-preview");
  });

  it("renders the completed achievement card as a full accessible link", () => {
    expect(source).toContain('aria-label={`Open completed goal ${goal.title}`}');
    expect(source).toContain("{goal.dates}");
    expect(source).toContain("{goal.achievement}");
    expect(source).toContain("Completed Goal");
  });

  it("keeps objective-specific live states and compact confidence values", () => {
    expect(applicationSource).toContain("evaluation?.projection?.completionStageLabel");
    expect(applicationSource).toContain("summary.presentation?.status ?? summary.current");
    expect(applicationSource).toContain("resolveActiveGoalConfidencePresentation");
    expect(applicationSource).not.toContain("resolveOverallGoalConfidenceReadModel");
    expect(source).toContain("formatConfidence(goal.confidence)");
    expect(source).toContain('"Confidence unavailable"');
    expect(applicationSource).not.toContain("summary.confidence ?? evaluation?.confidence ?? 0");
    expect(applicationSource).toContain('"Visual confirmation developing": "Visual Confirmation Developing"');
    expect(applicationSource).toContain('"Entering target range": "Entering Target Range"');
    expect(applicationSource).toContain('Stable: "Stable"');
    expect(applicationSource).not.toMatch(/toTitleCase|toLocaleUpperCase/);
  });

  it("renders state, separator, and confidence on one shared text baseline", () => {
    expect(source).toContain('className="mt-2 text-sm font-bold leading-5 text-slate-600"');
    expect(source).toContain('<span aria-hidden="true"> • </span>');
    expect(source).not.toMatch(/translate-y|relative top-|h-1 w-1 rounded-full/);
  });

  it("keeps the canonical mobile column free of horizontal overflow", () => {
    expect(source).toContain("max-w-[393px]");
    expect(source).toContain("overflow-x-hidden");
    expect(source).not.toMatch(/w-screen|min-w-\[/);
  });

  it("keeps active cards keyboard accessible and fully tappable", () => {
    expect(source).toContain('aria-label={`Open ${goal.title}`}');
    expect(source).toContain("focus-visible:outline");
    expect(source).toContain("min-h-11");
  });
});
