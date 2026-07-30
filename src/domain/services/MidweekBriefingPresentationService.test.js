import { describe, expect, it } from "vitest";
import { createMidweekEvidenceWindow } from "./BriefingEvidenceWindowService";
import { composeMidweekBriefingPreview } from "./MidweekBriefingPreviewService";
import { prepareMidweekBriefingReviewPresentation } from "./MidweekBriefingPresentationService";
import { auditPIEditorialVoice } from "./PIEditorialTranslationService";
import { midweekPreviewFixtures } from "../../fixtures/midweekBriefingPreview";

function presentation() {
  const window = createMidweekEvidenceWindow({
    now: new Date("2026-07-22T19:00:00Z"),
    timeZone: "America/Los_Angeles",
  });
  const briefing = structuredClone(composeMidweekBriefingPreview({
    ...midweekPreviewFixtures.trainingImprovement,
    window,
    generatedAt: "2026-07-22T19:00:00.000Z",
  }));
  briefing.energyBalance.estimatedDailyBalanceMidpoint = -502;
  briefing.training.highlights = [{
    exercise: "Single-Leg Leg Press",
    kind: "Record",
    label: "New volume-load record",
  }];
  briefing.training.watch = [{
    exercise: "Lateral Raises Machine",
    status: "plateauing",
    message: "Lateral Raises Machine has been stable for several sessions.",
  }, {
    exercise: "Pull-Ups",
    status: "plateauing",
    message: "Pull-Ups has been stable for several sessions.",
  }];
  briefing.goalConfidence = {
    score: 59,
    band: "moderate",
    priorScore: 58,
    delta: 1,
    movementDirection: "increased",
    supportingReasons: ["Evidence is sufficiently complete across interpreted domains."],
    limitingReasons: ["Energy coverage prevents a calibration conclusion."],
  };
  return prepareMidweekBriefingReviewPresentation({
    artifact: { cadence: "midweek", briefing },
  });
}

describe("Midweek briefing presentation", () => {
  it("keeps confidence identity while translating the explanation upstream", () => {
    const result = presentation();
    expect(result.goalConfidence).toMatchObject({
      score: 59,
      band: "moderate",
      delta: 1,
      movementDirection: "increased",
    });
    expect(result.goalConfidence.presentationExplanation).toBe(
      "Confidence moved up slightly because training, calories, activity, and weight are telling a consistent early story, but the week still needs to finish before Sunday’s full review."
    );
    expect(result.goalConfidence.presentationExplanation).not.toMatch(
      /evidence|domain|coverage|calibration|engine|observation window/i
    );
  });

  it("uses a concise headline and keeps the supporting coaching detail", () => {
    const result = presentation();
    expect(result.hero.verdict).toBe(
      "Calories are moving closer to supporting stronger training."
    );
    expect(result.hero.verdict.match(/[.!?]/g)).toHaveLength(1);
    expect(result.hero.verdict.split(/\s+/)).toHaveLength(8);
    expect(result.hero.summary).toMatch(
      /Lower-body training.*slightly below maintenance.*Saturday.*Sunday/i
    );
  });

  it("uses broader coaching language while preserving exact evidence labels", () => {
    const result = presentation();
    const exactMovement = result.training.highlights[0].exercise;
    expect(result.training.interpretation).toBe(
      "Lower-body training produced the week’s strongest performance. That is the kind of progression we want while building muscle."
    );
    expect(result.coachTake.biggestTakeaway).not.toContain(exactMovement);
    expect(result.training.highlights[0].exercise).toBe(exactMovement);
    expect(result.training.highlights[0].label).toBe("New volume-load record");
    expect(auditPIEditorialVoice([
      result.hero.verdict,
      result.hero.summary,
      result.training.interpretation,
      result.coachTake.biggestTakeaway,
      result.coachTake.recommendation,
    ], {
      internalObjectNames: [
        exactMovement,
        "Build Lean Mass",
        "Establish Maintenance",
      ],
    }).passes).toBe(true);
  });

  it("keeps both Watch recommendations while normalizing movement grammar", () => {
    const result = presentation();
    expect(result.training.watch).toHaveLength(2);
    expect(result.training.watch.map((item) => item.exercise)).toEqual([
      "Lateral Raises Machine",
      "Pull-Ups",
    ]);
    expect(result.training.watch.map((item) => item.message)).toEqual([
      "Machine lateral raises have been stable for several sessions. Consider increasing difficulty before adding more of the same work.",
      "Pull-ups have been stable for several sessions. Consider increasing difficulty before adding more of the same work.",
    ]);
  });
});
