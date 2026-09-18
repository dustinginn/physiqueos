import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateGoalGenericV3Acceptance } from "../../../fixtures/goalGenericV3AcceptanceFixtures.js";
import { findNarrativeV3VoiceViolations } from "./NarrativeV3CompositionService.js";
import { createHomeConfidenceV3Sample } from "./HomeConfidenceV3SampleService.js";

describe("Full declarative Goal-generic V3 acceptance gate", () => {
  const rows = evaluateGoalGenericV3Acceptance();
  it.each(rows)("passes all semantic/voice dimensions for case $fixture.id: $fixture.name", ({ fixture, result, checks, prior }) => {
    expect(Object.values(checks).every(Boolean), JSON.stringify(checks)).toBe(true);
    const copy = `${result.narrativePlan.composition.finalNarrative}\n${result.narrativePlan.composition.coachTake}\n${JSON.stringify(createHomeConfidenceV3Sample(result).expanded.explanation)}`;
    expect(findNarrativeV3VoiceViolations(copy)).toEqual([]);
    expect(copy).not.toMatch(/\b(?:feasibility|persistence|attribution|semantic fingerprint|evidence authority|not_assessed|strategy_supported|confirm_persistence)\b/iu);
    if (![1, 2].includes(fixture.id)) expect(copy).not.toContain("DEXA");
    if (fixture.id === 16 || fixture.id === 18) {
      expect(result.coachingState.questions.filter((item) => item.status === "answered")).toEqual(expect.arrayContaining(prior.coachingState.questions.filter((item) => item.status === "answered")));
      expect(result.coachingState.questions.some((item) => item.status === "superseded")).toBe(true);
    }
    if (fixture.id === 5) expect(copy).not.toMatch(/huge win|improved by|progress stalling/iu);
    if ([2, 4, 12].includes(fixture.id)) expect(copy).not.toMatch(/huge win|stay the course/iu);
  });

  it("does not reward the presence or punish the absence of an acceptable guardrail", () => {
    expect(rows[0].result.confidence.currentPercentage).toBe(rows[10].result.confidence.currentPercentage);
  });

  it("prioritizes an open configured safety question without erasing the answered feasibility question", () => {
    for (const index of [1, 3, 11]) {
      expect(rows[index].result.coachingState.questions.some((question) => question.kind === "feasibility" && question.status === "answered")).toBe(true);
      expect(rows[index].result.strategicInterpretation.nextCoachingQuestion.evidencePurpose).toBe("assess_guardrail");
      expect(rows[index].result.narrativePlan.composition.sections.watch).not.toContain("not whether the plan works");
    }
  });

  it("contains no Goal-name, evidence-source or metric-specific core branches", () => {
    const directory = path.resolve("src/domain/intelligence/v3");
    const source = fs.readdirSync(directory).filter((file) => file.endsWith(".js") && !file.endsWith(".test.js")).map((file) => fs.readFileSync(path.join(directory, file), "utf8")).join("\n");
    expect(source).not.toMatch(/build_lean_mass|visible_abs|strength_goal|cutting|\bDEXA\b|\bbody_fat\b/iu);
    expect(source).not.toMatch(/eval\s*\(|new Function\s*\(|api\.openai\.com|anthropic/iu);
  });
});
