import { describe, expect, it } from "vitest";
import { createWeeklyBriefingScreenPresentation } from "./WeeklyBriefingScreenPresentationService";

describe("WeeklyBriefingScreenPresentationService", () => {
  it.each([
    undefined,
    {},
    { cards: undefined },
    { cards: { hero: undefined } },
    { cards: { hero: { presentation: undefined } } },
    { cards: { hero: { presentation: { body: undefined, highlights: "bad" } } } },
    { cards: { snapshot: undefined, progress: undefined } },
    { cards: { progress: { training: undefined }, interpretation: undefined, coachInsight: undefined } },
    { cards: { progress: { energy: { averageBalance: -405 } } }, goalConfidence: undefined },
  ])("always returns a complete render contract for adversarial input %#", (input) => {
    expect(() => createWeeklyBriefingScreenPresentation(input)).not.toThrow();
    const result = createWeeklyBriefingScreenPresentation(input);
    expect(typeof result.hero.body).toBe("string");
    expect(Array.isArray(result.hero.cards)).toBe(true);
    expect(result.energy === null || typeof result.energy === "object").toBe(true);
    expect(result.weight === null || typeof result.weight === "object").toBe(true);
    expect(result.photos === null || typeof result.photos === "object").toBe(true);
    expect(Array.isArray(result.training.categories)).toBe(true);
    expect(Array.isArray(result.training.priorityCategories)).toBe(true);
    expect(Array.isArray(result.training.highlights)).toBe(true);
    expect(Array.isArray(result.training.needsAttention)).toBe(true);
    expect(Array.isArray(result.coachInsight.actionItems)).toBe(true);
    expect([
      result.coachInsight.biggestWin,
      result.coachInsight.keepBuilding,
      result.coachInsight.watchNextWeek,
    ].every((item) => typeof item === "string")).toBe(true);
  });
});
