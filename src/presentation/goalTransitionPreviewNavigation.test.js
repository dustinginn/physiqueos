import { describe, expect, it } from "vitest";
import { GOAL_TRANSITION_PREVIEW_SECTIONS, resolveGoalTransitionPreviewSection } from "./goalTransitionPreviewNavigation";

describe("Goal Transition preview entry", () => {
  it("opens direct and invalid routes at Completion Review", () => {
    expect(resolveGoalTransitionPreviewSection()).toBe("completion");
    expect(resolveGoalTransitionPreviewSection({ section: "not-a-section" })).toBe("completion");
  });
  it("honors intentional section and return-section overrides", () => {
    expect(resolveGoalTransitionPreviewSection({ section: "evidence" })).toBe("evidence");
    expect(resolveGoalTransitionPreviewSection({ returnSection: "strategy" })).toBe("strategy");
  });
  it("does not derive preview entry from durable currentSection", () => {
    expect(resolveGoalTransitionPreviewSection({ currentSection: "review" })).toBe("completion");
  });
  it("preserves all ten accepted Goal Creation sections as navigable entries", () => {
    expect(GOAL_TRANSITION_PREVIEW_SECTIONS).toEqual([
      "completion",
      "objective",
      "guardrails",
      "evidence",
      "operating",
      "strategy",
      "commitments",
      "cadence",
      "supporting",
      "review",
    ]);
    for (const section of GOAL_TRANSITION_PREVIEW_SECTIONS) {
      expect(resolveGoalTransitionPreviewSection({ section })).toBe(section);
    }
  });
});
