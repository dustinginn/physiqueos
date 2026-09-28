// Measurement is not causation, across V3 realization.
//
// An authoritative outcome measurement (a DEXA, a photo comparison) proves
// what changed. It does not, by itself, prove that the current plan caused
// the change. V3 may speak strongly and positively about measured progress,
// goal trajectory and compatibility with staying the course — never "the plan
// is working" (or equivalent) without explicit authoritative causal support.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPairedCalibrationFixtures } from "../../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";
import { runConfidenceNarrativeV3 } from "./ConfidenceNarrativeV3Pipeline.js";
import { prepareDexaV3, preparePhotoV3 } from "../../../testSupport/briefingFamilyV3Harness.js";
import {
  EFFECTIVENESS_LANGUAGE, auditClaimRestraint, hasAuthoritativeCausalSupport,
} from "../shared/BriefingClaimRestraint.js";

const narrativeTexts = (narrative) => [narrative.summary, narrative.detail, narrative.coachTake,
  ...Object.values(narrative.sections ?? {}), JSON.stringify(narrative.confidenceExplanation ?? {})].filter(Boolean);

describe("an authoritative outcome measurement speaks to what changed, not what caused it", () => {
  it("a decisive DEXA still produces strong factual progress wording", () => {
    const result = runConfidenceNarrativeV3(createPairedCalibrationFixtures().dexa);
    const { sections, coachTake } = result.narrativePlan.composition;
    expect(result.strategicInterpretation.strategyEffectiveness.feasibility).toBe("demonstrated");
    expect(sections.result).toMatch(/^This is a huge win\./u);
    expect(sections.meaning).toMatch(/measured progress in .+ is real/u);
    expect(coachTake).toMatch(/exactly what this build needed/iu);
  });

  it("outcome measurement alone never realizes as plan effectiveness, on any V3 surface", async () => {
    const paired = runConfidenceNarrativeV3(createPairedCalibrationFixtures().dexa);
    const { composition } = paired.narrativePlan;
    const pairedTexts = [...Object.values(composition.sections), composition.coachTake, composition.finalNarrative];
    const dexa = await prepareDexaV3();
    const photo = await preparePhotoV3({ structured: true });
    for (const text of [...pairedTexts, ...narrativeTexts(dexa.artifact.briefing.narrativeV3),
      ...narrativeTexts(photo.artifact.briefing.narrativeV3)]) {
      expect(text).not.toMatch(EFFECTIVENESS_LANGUAGE);
      expect(text).not.toMatch(/not whether the plan works|question has been answered/u);
    }
  });

  it("the restraint changes words only: DEXA Confidence and recommendation are as before", async () => {
    // Recorded on e83b27d0, before the restraint, on the same evidence.
    const { prepared } = await prepareDexaV3();
    expect(prepared.assessment.currentPercentage).toBe(76);
    expect(prepared.strategicInterpretation.recommendation).toEqual({
      action: "continue_current_strategy", reason: "strategy_supported", urgency: "routine",
      nextEvidencePurpose: "confirm_persistence",
    });
    expect(prepared.strategicInterpretation.strategyEffectiveness.feasibility).toBe("demonstrated");
  });
});

describe("the Confidence body credits the measurement, not the plan", () => {
  it("a standout DEXA jump says what was measured", async () => {
    const { artifact } = await prepareDexaV3();
    const text = narrativeTexts(artifact.briefing.narrativeV3).join(" ");
    expect(text).toMatch(/measured a standout result/u);
    expect(text).not.toMatch(/plan delivered|already answered|question has been answered|Don't change it/u);
  });

  it("every composed V3 narrative records an empty claim-restraint audit", async () => {
    const empty = { schemaVersion: "narrative_claim_restraint_v1", issues: [] };
    for (const fixture of Object.values(createPairedCalibrationFixtures())) {
      expect(runConfidenceNarrativeV3(fixture).narrativePlan.claimRestraint).toEqual(empty);
    }
    for (const run of [await prepareDexaV3(), await preparePhotoV3({ structured: false }), await preparePhotoV3({ structured: true })]) {
      expect(run.prepared.narrativePlan.claimRestraint).toEqual(empty);
    }
  });

  it("detects delivered/appears/answered forms of causal overreach", () => {
    for (const text of ["Confidence jumped because the plan delivered a standout result.",
      "The current strategy appears to be working.", "The DEXA already answered the big question."]) {
      expect(text).toMatch(EFFECTIVENESS_LANGUAGE);
    }
    for (const text of ["Confidence jumped because the DEXA measured a standout result.",
      "The next DEXA will show whether the progress continues."]) {
      expect(text).not.toMatch(EFFECTIVENESS_LANGUAGE);
    }
  });
});

describe("explicit causal support is distinguishable from measurement", () => {
  it("demonstrated feasibility is not causal support; an explicit authoritative marker would be", () => {
    expect(hasAuthoritativeCausalSupport({ strategyEffectiveness: { feasibility: "demonstrated" } })).toBe(false);
    expect(hasAuthoritativeCausalSupport({ strategyEffectiveness: { feasibility: "demonstrated", causalSupport: "authoritative" } })).toBe(true);
    const claim = { meaning: "The build plan is clearly working." };
    expect(auditClaimRestraint(claim, { effectiveness: false })).toHaveLength(1);
    expect(auditClaimRestraint(claim, { effectiveness: true })).toEqual([]);
  });
});

describe("no V3 realization source carries a causal-effectiveness template", () => {
  // Founder-facing string templates in every V3 realization module. Regex
  // literals (detection vocabulary for model output) are not realization.
  const MODULES = [
    "./NarrativeV3CompositionService.js", "./HolisticNarrativeV3.js", "./AmbiguityVocabularyV3.js",
    "../../presentation/NarrativeV3SurfaceProjectionService.js", "../../presentation/confidenceExplanationPresentation.js",
    "../../interpreters/PhotoInterpreterService.js",
  ];
  const literals = (source) => source.split("\n")
    .filter((line) => !/^\s*\/\/|^\s*\/\\b|\.test\(|new RegExp/u.test(line))
    .flatMap((line) => line.match(/(["'`])(?:\\.|(?!\1).)*\1/gu) ?? []);

  it.each(MODULES)("%s states measured progress, never that the plan/strategy/phase works", (module) => {
    const source = readFileSync(new URL(module, import.meta.url), "utf8");
    for (const text of literals(source)) {
      expect(text, module).not.toMatch(EFFECTIVENESS_LANGUAGE);
      expect(text, module).not.toMatch(/\b(?:strategy|plan|phase)\b[^"'`]{0,20}\b(?:is|remains)\s+(?:still\s+)?(?:working|doing (?:its|the) job)\b/u);
    }
  });
});
