// Analytical "read" jargon stays out of Founder-facing Briefing Intelligence
// copy: in the templates that write it and in every generated briefing.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ANALYTICAL_READ_JARGON, findAnalyticalReadJargon } from "./BriefingLanguage.js";
import { buildEvidencePicture } from "./BriefingEvidencePicture.js";
import { synthesizeBriefing } from "./BriefingHolisticSynthesis.js";
import { resolveNarrativeBudget } from "./BriefingIntelligencePolicies.js";
import { BRIEFING_REALIZABLE_KINDS, realizeHolisticBriefingV3 } from "../v3/HolisticNarrativeV3.js";
import { HOLISTIC_GOAL_TYPES, HOLISTIC_KINDS, holisticScenario } from "../../../testSupport/briefingHolisticSynthetic.js";

const ROOT = path.resolve("src/domain");
const TEMPLATE_FILES = [
  "intelligence/v3/HolisticNarrativeV3.js", "intelligence/v3/NarrativeV3CompositionService.js",
  ...fs.readdirSync(path.join(ROOT, "intelligence/shared")).filter((file) => file.endsWith(".js") && !file.endsWith(".test.js") && file !== "BriefingLanguage.js")
    .map((file) => `intelligence/shared/${file}`),
  "intelligence/CadenceEnergyObservationsV3.js",
  "presentation/NarrativeV3SurfaceProjectionService.js", "presentation/confidenceExplanationPresentation.js",
  "confidenceV3/NarrativeV3Service.js", "confidenceV3/StrategicInterpretationService.js",
  "services/MonthlyReviewPresentationService.js", "services/MonthlyBriefingPresentationService.js", "services/MonthlyBriefingPreviewService.js",
  "services/MidweekBriefingPreviewService.js", "services/WeeklyNarrativeService.js", "services/DEXAEventNarrativeService.js",
  "services/PhotoEventNarrativeService.js", "interpreters/PhotoInterpreterService.js",
  "presentation/evidenceInterpretationPresentation.js", "services/PhaseAwareActiveGoalPreviewService.js",
];

// String and template literals only; code identifiers and comments are not copy.
function literals(source) {
  return [...source.matchAll(/"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/gu)].map((match) => match[0]);
}

describe("no analytical \"read\" jargon in Founder-facing Briefing Intelligence copy", () => {
  it("the rule targets the jargon, not the English word", () => {
    for (const text of ["Performance stayed the clearest read.", "21 were complete enough to read.", "read the weekly balance as directional",
      "Early read: the gains are real.", "The waist reads tighter.", "the steadier read of intake", "Energy was a little hard to read this month.",
      "The torso reads as leaner.", "The clearest reading of the trend."]) {
      expect(findAnalyticalReadJargon(text), text).not.toBeNull();
    }
    for (const text of ["Read the label on the tub.", "Tap to read the full briefing.", "PhysiqueOS is reading your upload.",
      "The scale that read 174 lb this morning.", "The report can be read on the web.", "Read the scale first thing in the morning.",
      "An authoritative reading of lean mass."]) {
      expect(findAnalyticalReadJargon(text), text).toBeNull();
    }
  });

  it("no template in the Briefing Intelligence and Confidence paths writes it", () => {
    for (const file of TEMPLATE_FILES) {
      const source = fs.readFileSync(path.join(ROOT, file), "utf8");
      for (const literal of literals(source)) {
        expect(ANALYTICAL_READ_JARGON.test(literal), `${file}: ${literal.slice(0, 120)}`).toBe(false);
      }
    }
  });

  it("no generated briefing of any type contains it, nor the word \"read\" at all", () => {
    let checked = 0;
    for (const cadence of ["midweek", "weekly", "monthly", "dexa", "photo"]) {
      for (const goalType of HOLISTIC_GOAL_TYPES) for (const kind of HOLISTIC_KINDS) for (const seed of [1, 2]) {
        const scenario = holisticScenario({ seed, kind, goalType, cadence });
        const picture = buildEvidencePicture({ intelligence: scenario.intelligence, goalPolicy: scenario.goalPolicy, goalFacts: scenario.goalFacts });
        const synthesis = synthesizeBriefing({ picture, budget: resolveNarrativeBudget(scenario.policy, picture), realizableKinds: BRIEFING_REALIZABLE_KINDS });
        const realized = realizeHolisticBriefingV3({ cadence, synthesis, picture, goalLabel: "the goal", goalPolicy: scenario.goalPolicy,
          goalProgress: "You are more than halfway to the goal." });
        if (!realized) continue;
        const texts = [realized.headline, realized.meaning, realized.result, realized.coachTake, realized.action, realized.watch,
          realized.confidenceBody, JSON.stringify(realized.review?.modules ?? [])].filter(Boolean);
        for (const text of texts) expect(text, `${cadence}/${goalType}/${kind}#${seed}`).not.toMatch(/\bread(?:s|able|ing)?\b/iu);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(700);
  });
});
