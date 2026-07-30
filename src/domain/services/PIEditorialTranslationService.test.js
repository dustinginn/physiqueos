import { describe, expect, it } from "vitest";
import {
  auditPIEditorialVoice,
  coachGoalLanguage,
  describeMissingInformationNaturally,
  translatePIEditorialNarrative,
} from "./PIEditorialTranslationService";

describe("PI canonical editorial translation", () => {
  it("preserves scientific reasoning by reference while translating only narration", () => {
    const reasoning = Object.freeze({
      confidence: 0.72,
      rankedStoryIds: ["training", "energy"],
      evidenceWeights: { training: 0.7, energy: 0.3 },
    });
    const result = translatePIEditorialNarrative({
      reasoning,
      paragraphs: [{
        observation: "Your major lifts continued to progress",
        interpretation: "Training is responding the way we would hope this early",
        whyItMatters: "That is the first useful sign that your current plan can support muscle growth",
        forwardImplication: "Keep the plan steady and look for the pattern to repeat",
      }],
    });

    expect(result.reasoning).toBe(reasoning);
    expect(result.paragraphs[0].text).toMatch(
      /major lifts continued.*responding.*first useful sign.*pattern to repeat/i
    );
  });

  it.each([
    "Build Lean Mass officially has a starting point.",
    "Training supplied the first forward signal.",
    "Photos preserved the visual thread.",
    "Training has earned patience.",
    "Observed coverage increased.",
    "Progress spans eleven movement areas.",
    "The briefing shows that the plan is working.",
  ])("rejects internal or unnatural narration: %s", (text) => {
    expect(auditPIEditorialVoice(text).passes).toBe(false);
  });

  it("keeps intentional object labels separate from coaching language", () => {
    expect(coachGoalLanguage("Build Lean Mass")).toBe("building muscle");
    expect(coachGoalLanguage("Build Lean Mass", { phase: true }))
      .toBe("your muscle-building phase");
    expect(coachGoalLanguage("Visible Abs at Rest", { phase: true }))
      .toBe("your cut");
  });

  it("explains missing information as a coaching consequence and next step", () => {
    const prose = describeMissingInformationNaturally({
      known: "We have enough nutrition logs to see that intake is moving up",
      missing: "A few unlogged days still make the weekly average less certain",
      consequence: "Filling those days in will make the recommendation much stronger",
      nextStep: "Log the remaining days before the next review",
    });

    expect(prose).toMatch(/less certain.*recommendation much stronger.*remaining days/i);
    expect(prose).not.toMatch(/coverage|observation window|evidence completeness/i);
  });

  it("centers narration on the user rather than the reporting system", () => {
    expect(auditPIEditorialVoice(
      "Your calorie intake is getting much closer to supporting training."
    ).passes).toBe(true);
    expect(auditPIEditorialVoice(
      "The analysis shows that energy calibration improved."
    ).passes).toBe(false);
  });
});
