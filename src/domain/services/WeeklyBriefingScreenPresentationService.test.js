import { describe, expect, it } from "vitest";
import { createWeeklyBriefingScreenPresentation } from "./WeeklyBriefingScreenPresentationService";

describe("WeeklyBriefingScreenPresentationService", () => {
  it("passes the exact published confidence object through without mutation", () => {
    const confidence = Object.freeze({
      score: 59,
      band: "developing",
      priorScore: 59,
      delta: 0,
      movementDirection: "held",
      primaryReason: "Confidence remained stable because the outlook did not materially change.",
      presentationExplanation: "Confidence remained stable because the outlook did not materially change.",
    });
    const result = createWeeklyBriefingScreenPresentation({
      goalConfidence: confidence,
      narrativePresentationSelection: {
        hero: { confidenceExplanation: "Confidence improved this week." },
      },
    });
    expect(result.hero.confidence).toBe(confidence);
    expect(result.hero.confidence.presentationExplanation).toBe(confidence.primaryReason);
  });

  it("keeps the canonical training-day count and every structured highlight field", () => {
    const result = createWeeklyBriefingScreenPresentation({
      cards: { progress: { training: { presentation: {
        trainingDayCount: 6,
        comparableCategoryCount: 9,
        counts: { improving: 7, stable: 0, plateauing: 1, regressing: 1, insufficient: 0 },
        categorySummaries: [{ id: "triceps" }],
        highlights: [{ exercise: "Hyperextension Machine", label: "New session-volume mark", value: 4800, delta: 675, percentChange: 16.4, unit: "lb volume" }],
      } } } },
      narrativePresentationSelection: {
        training: { conclusion: "Training progressed.", priorityCategories: [] },
      },
    });
    expect(result.training).toMatchObject({
      trainingDayCount: 6,
      comparableCategoryCount: 9,
      highlights: [{ exercise: "Hyperextension Machine", label: "New session-volume mark", value: 4800, delta: 675, percentChange: 16.4, unit: "lb volume" }],
    });
  });

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
