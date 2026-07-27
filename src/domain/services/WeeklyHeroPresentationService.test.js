import { describe, expect, it } from "vitest";
import { normalizeWeeklyHeroDomains } from "./WeeklyHeroPresentationService";

describe("WeeklyHeroPresentationService", () => {
  it("normalizes selector-owned cards in deterministic domain order", () => {
    const result = normalizeWeeklyHeroDomains([
      { domain: "photos", headline: "Directional guardrail" },
      { domain: "energy", headline: "Below maintenance" },
      { domain: "training", headline: "Broadly constructive" },
      { domain: "weight", headline: "Supporting context" },
    ]);
    expect(result.map((item) => item.domain)).toEqual([
      "training",
      "energy_balance",
      "weight",
      "photos",
    ]);
    expect(result.map((item) => item.headline)).toEqual([
      "Broadly constructive",
      "Below maintenance",
      "Supporting context",
      "Directional guardrail",
    ]);
  });

  it.each([
    undefined,
    null,
    {},
    [{ domain: "training" }],
    [{ domain: "unknown", headline: "Ignore me" }],
  ])("returns a safe formatting contract for malformed input %#", (input) => {
    expect(() => normalizeWeeklyHeroDomains(input)).not.toThrow();
    expect(normalizeWeeklyHeroDomains(input)).toHaveLength(4);
  });

  it("does not infer card meaning from progress facts", () => {
    const result = normalizeWeeklyHeroDomains({
      progress: {
        energy: { averageBalance: -405 },
        training: { counts: { improving: 7 } },
      },
    });
    expect(result.every((item) => item.headline === "")).toBe(true);
  });
});
