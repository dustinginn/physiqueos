import { describe, expect, it } from "vitest";
import { createPINarrativeAssessment } from "./PINarrativeAssessmentService";

const observations = [
  { id: "t2", domain: "training", status: "plateauing", subject: { type: "training_category", id: "back" } },
  { id: "t1", domain: "training", status: "improving", subject: { type: "training_category", id: "chest" } },
  { id: "t3", domain: "training", status: "improving", subject: { type: "training_category", id: "quads" } },
  { id: "e1", domain: "energy", kind: "energy_balance", explanationData: { currentAverage: -405 } },
  { id: "e2", domain: "energy", kind: "paired_day_coverage", confidence: { level: "low", limitations: ["partial"] }, explanationData: { partialDays: 5, estimatedExpenditureDays: 6, evidenceDays: 7 } },
  { id: "p1", domain: "photos", kind: "photo_visual_stability", direction: "stable" },
];

describe("PINarrativeAssessmentService", () => {
  it("is deterministic across reordered inputs", () => {
    const input = { observations, claims: [{ id: "c2" }, { id: "c1" }], goal: { id: "g", type: "build_lean_mass" }, phase: { id: "p", type: "establish_maintenance" }, operatingState: "calibration" };
    expect(createPINarrativeAssessment(input)).toEqual(createPINarrativeAssessment({ ...input, observations: [...observations].reverse(), claims: [...input.claims].reverse() }));
  });
  it("prioritizes broad Training, preserves Energy limits, and keeps Photos directional", () => {
    const result = createPINarrativeAssessment({ observations, goal: { type: "build_lean_mass" }, phase: { type: "establish_maintenance" }, operatingState: "calibration" });
    expect(result.overallConclusion.headline).toBe("Training moved forward, but calories still look low.");
    expect(result.overallConclusion.summary).toContain("2 of 3 training areas improved");
    expect(result.overallConclusion.summary).toContain("keep training steady");
    expect(result.overallConclusion.summary).toMatch(/6 of 7 days/i);
    expect(result.overallConclusion.summary).toMatch(/405 calories below estimated expenditure/i);
    expect(result.primaryFinding.domain).toBe("training");
    expect(result.domainConclusions.find((item) => item.domain === "photos").authority).toBe("directional");
    expect(result.uncertainties).toContain("partial");
    expect(result.recommendation.text).toMatch(/Record both food and activity consistently/i);
    expect(result.nextObservation.text).toMatch(/back performance.*estimated maintenance/);
    const visibleCopy = JSON.stringify({
      overallConclusion: result.overallConclusion,
      explanations: result.domainConclusions.map((item) => ({
        headline: item.headline,
        explanation: item.explanation,
      })),
      bodyCompositionConclusion: result.bodyCompositionConclusion,
      recommendation: result.recommendation,
      nextObservation: result.nextObservation,
    });
    expect(visibleCopy).not.toMatch(/constructive|comparable categories|paired Energy|plan remains viable|directional visual guardrail|completed-week direction/i);
    expectInternalDomainNamesNatural([
      result.overallConclusion.headline,
      result.overallConclusion.summary,
      ...result.domainConclusions.flatMap((item) => [item.headline, item.explanation]),
      result.recommendation.text,
      result.nextObservation.text,
      result.confidenceExplanation,
      result.coachTake.biggestTakeaway,
      result.coachTake.recommendation,
      ...result.coachTake.actions,
    ]);
  });
  it("changes meaning for a fat-loss Goal without changing cadence code", () => {
    const result = createPINarrativeAssessment({ observations, goal: { type: "fat_loss" } });
    expect(result.overallConclusion.summary).toMatch(/supports the current fat-loss direction/i);
    expect(result.overallConclusion.summary).not.toMatch(/maintenance-calorie decision/i);
  });
});

function expectInternalDomainNamesNatural(values) {
  for (const copy of values.filter(Boolean)) {
    for (const domain of ["Training", "Energy", "Weight", "Photos", "Goal", "Recovery", "Activity"]) {
      const matches = [...copy.matchAll(new RegExp(`\\b${domain}\\b`, "g"))];
      for (const match of matches) {
        const prefix = copy.slice(0, match.index).trimEnd();
        expect(
          prefix === "" || /[.!?]$/.test(prefix),
          `${domain} should only be capitalized at the start of a sentence: ${copy}`
        ).toBe(true);
      }
    }
  }
}
