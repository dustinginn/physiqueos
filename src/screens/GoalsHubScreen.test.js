import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./GoalsHubScreen.jsx", import.meta.url), "utf8");

describe("GoalsHubScreen active-goal index", () => {
  it("renders the approved landing-page hierarchy in order", () => {
    const headings = ["Your Goals", "Primary Goal", "Supporting Goals", "Goal Relationships", "Add Goal"];
    let cursor = -1;
    for (const heading of headings) {
      const next = source.indexOf(heading);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
  });

  it("removes completed, future, edit, progress, projection, and explanatory card UI", () => {
    expect(source).not.toMatch(/CompletedGoals|Completed Goals|FutureGoals|Future Goals/);
    expect(source).not.toMatch(/EditGoalButton|ProgressBar|estimatedCompletion|supportingExplanation/);
    expect(source).not.toMatch(/goal\.description|goal\.presentation\.detail/);
  });

  it("links each full active-goal card to its canonical production route", () => {
    expect(source).toContain('return "/goals/visible-abs"');
    expect(source).toContain('return "/goals/maintenance"');
    expect(source).toContain('return "/goals/lean-mass"');
    expect(source).toContain("href={withReturnContext(goal.href, from)}");
    expect(source).not.toContain("narrative-preview");
  });

  it("keeps objective-specific live states and compact confidence values", () => {
    expect(source).toContain("evaluation?.projection?.completionStageLabel");
    expect(source).toContain("summary.presentation?.status ?? summary.current");
    expect(source).toContain("summary.confidence ?? evaluation?.confidence ?? 0");
    expect(source).toContain("{goal.confidence}% confidence");
    expect(source).toContain('"Visual confirmation developing": "Visual Confirmation Developing"');
    expect(source).toContain('"Entering target range": "Entering Target Range"');
    expect(source).toContain('Stable: "Stable"');
    expect(source).not.toMatch(/toTitleCase|toLocaleUpperCase/);
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
