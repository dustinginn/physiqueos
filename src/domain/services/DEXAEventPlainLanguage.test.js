import { describe, expect, it } from "vitest";
import { prepareDexaOct9V3, prepareDexaV3 } from "../../testSupport/briefingFamilyV3Harness.js";
import { isSemanticallyEquivalent } from "../intelligence/v3/V3Runtime.js";
import {
  findNarrativeV3ClaimRestraintIssues, findNarrativeV3VoiceViolations,
} from "../intelligence/v3/NarrativeV3CompositionService.js";
import { applyNarrativeV3ToBriefingArtifact } from "./BriefingGoalConfidencePresentationService.js";
import { classifyBodyFatGuardrail } from "./DEXAEventContextService.js";
import { bodyFatRangeStatus, composeDexaEventPlainLanguage } from "./DEXAEventPlainLanguage.js";

// Contract-valid variants of the October 9 scan (masses reconcile).
const VARIANTS = {
  oct9: null,
  // The published scan's notable body-part change (torso +2.2 lb fat, +0.6 lb lean).
  oct9Regional: (scan) => {
    scan.regionalAssessment.trunk.fatMass.value += 2.2;
    scan.regionalAssessment.trunk.leanMass.value += 0.6;
  },
  leanDown: (scan) => { scan.leanMass = { value: 152.1, unit: "lb" }; scan.totalMass = { value: 176.6, unit: "lb" }; scan.bodyFatPercentage = 9.9; },
  leanFlat: (scan) => { scan.leanMass = { value: 153.3, unit: "lb" }; scan.totalMass = { value: 177.8, unit: "lb" }; scan.bodyFatPercentage = 9.8; },
  bodyFatInRange: (scan) => { scan.fatMass = { value: 15.0, unit: "lb" }; scan.totalMass = { value: 176.7, unit: "lb" }; scan.bodyFatPercentage = 8.5; },
  bodyFatBelowRange: (scan) => { scan.fatMass = { value: 13.1, unit: "lb" }; scan.totalMass = { value: 174.8, unit: "lb" }; scan.bodyFatPercentage = 7.5; },
};

async function variant(name) {
  return prepareDexaOct9V3({ mutateScan: VARIANTS[name] });
}

async function allNarratives() {
  const out = [];
  for (const name of Object.keys(VARIANTS)) {
    const { artifact, prepared } = await variant(name);
    out.push({ name, narrative: artifact.briefing.dexaEventNarrative, prepared });
  }
  const sep12 = await prepareDexaV3();
  out.push({ name: "sep12", narrative: sep12.artifact.briefing.dexaEventNarrative, prepared: sep12.prepared });
  return out;
}

// Everything a reader sees, in reading order (Native DEXABriefingSections and the web screen).
function readerText(narrative) {
  const i = narrative.interpretation;
  const c = narrative.coachInsight;
  return [
    narrative.hero.title, narrative.hero.body,
    ...(narrative.hero.results ?? []).flatMap((item) => [item.label, item.context]),
    i.opening, i.fatLoss, i.leanMass, i.regional, i.phaseMeaning, i.stoodOut, i.goalProgress, i.guardrailStatus,
    i.supportingEvidence, i.uncertainty, c.biggestWin, c.protect, c.watch, c.next,
  ].filter((text) => typeof text === "string" && text.trim() !== "");
}

function proseSlots(narrative) {
  const i = narrative.interpretation;
  const c = narrative.coachInsight;
  return [narrative.hero.title, narrative.hero.body, i.opening, i.regional, i.phaseMeaning, i.supportingEvidence,
    i.uncertainty, c.biggestWin, c.protect, c.next].filter(Boolean);
}

function sentences(text) {
  return String(text).match(/[^.!?]+(?:\.(?=\d)[^.!?]*)*[.!?]/g)?.map((value) => value.trim()) ?? [];
}

const TECHNICAL = /lean tissue|guardrail|comparab|calibrat|phase transition|\bDEXA\b|canonical|pressing the limit|measured progress|uncomplicated win/i;

describe("DEXA Event plain language: the October 9 briefing", () => {
  it("reads in everyday coaching language, each conclusion once", async () => {
    const narrative = (await variant("oct9Regional")).artifact.briefing.dexaEventNarrative;
    expect(narrative.hero.title).toBe("You're making progress toward your muscle-building goal, but body fat needs attention.");
    expect(narrative.hero.body).toBe(
      "Since your September 12 scan, your lean mass (muscle plus water and other non-fat tissue) went up 1.3 lb. " +
      "Your body fat rose to 9.7%, which is above your 8–9% target range.");
    expect(narrative.hero.results.map((item) => [item.label, item.context])).toEqual([
      ["Lean Mass", "Your main goal measure"],
      ["Body Fat", "Above your 8–9% target"],
      ["Scan Weight", "Includes water and food, not just muscle and fat"],
      ["Fat Mass", "Since the last scan"],
    ]);
    expect(narrative.interpretation.opening).toBe(
      "You also gained 3.2 lb of fat, more than the lean mass you added. " +
      "Some fat gain is normal while building muscle, but right now fat is coming on faster than lean mass.");
    expect(narrative.interpretation.regional).toBe(
      "The biggest changes were in your torso: about 2.2 lb more fat and 0.6 lb more lean mass. " +
      "Body-part numbers are less precise than the whole-body totals.");
    expect(narrative.interpretation.phaseMeaning).toBe(
      "One scan isn't enough to decide whether you're ready for the next part of your plan. " +
      "We'll weigh it alongside your training, weight trend and next scan first.");
    expect(narrative.interpretation.uncertainty).toBe(
      "A scan gives a useful picture of how your body is changing, but it can't tell us exactly how much of the increase " +
      "in lean mass is new muscle. Water, food and recent training can all shift the reading, so it helps to have your " +
      "next scan under similar conditions.");
    expect(narrative.coachInsight).toMatchObject({
      biggestWin: "You're more than halfway to your muscle-building target. That's meaningful progress, and it's worth protecting.",
      protect: "Keep training the way you have been. There's no reason to overhaul your whole plan when part of it is moving in the right direction.",
      watch: "",
      next: "Take a closer look at your calorie intake before trying to gain more weight. " +
        "The priority now is keeping your muscle-building progress while bringing body fat back toward your target.",
    });
  });

  it("keeps the assessment: progress, body fat above range, fat before more gain, Confidence untouched", async () => {
    const plain = await variant("oct9");
    const roles = await prepareDexaOct9V3({ withRoles: false });
    expect(plain.prepared.assessment.currentPercentage).toBe(roles.prepared.assessment.currentPercentage);
    expect(plain.prepared.assessment.movement).toBe(roles.prepared.assessment.movement);
    expect(plain.prepared.strategicInterpretation.recommendation.action).toBe("continue_with_guardrail_monitoring");
    const narrative = plain.artifact.briefing.dexaEventNarrative;
    expect(narrative.goalConfidence).toEqual(roles.artifact.briefing.dexaEventNarrative.goalConfidence);
    expect(plain.artifact.briefing.narrativeV3).toEqual(roles.artifact.briefing.narrativeV3);
    // Hero values and progress data are unchanged; only words around them are.
    expect(narrative.hero.results.map((item) => item.value))
      .toEqual(roles.artifact.briefing.dexaEventNarrative.hero.results.map((item) => item.value));
    expect(narrative.progress).toEqual(roles.artifact.briefing.dexaEventNarrative.progress);
  });
});

describe("DEXA Event plain language: every variant", () => {
  it("avoids technical labels anywhere a reader sees", async () => {
    for (const { name, narrative } of await allNarratives()) {
      for (const text of readerText(narrative)) expect(`${name}: ${text}`).not.toMatch(TECHNICAL);
    }
  });

  it("never says a scan proves muscle was gained or lost", async () => {
    for (const { name, narrative } of await allNarratives()) {
      for (const sentence of proseSlots(narrative).flatMap(sentences)) {
        if (/\b(new|lost) muscle\b/i.test(sentence)) expect(`${name}: ${sentence}`).toMatch(/can't tell/);
        expect(`${name}: ${sentence}`).not.toMatch(/\byou (gained|added|built|lost|put on) [^.]*\bmuscle\b/i);
      }
    }
  });

  it("says plainly when body fat is above the range", async () => {
    for (const name of ["oct9", "leanDown", "leanFlat"]) {
      const narrative = (await variant(name)).artifact.briefing.dexaEventNarrative;
      expect(narrative.hero.title).toMatch(/body fat needs attention\.$/);
      expect(narrative.hero.body).toMatch(/which is above your 8–9% target range\./);
      expect(readerText(narrative).join(" ")).not.toMatch(/pressing|approaching|nearing|close to the top/i);
    }
  });

  it("repeats no sentence and gives every slot its own claim", async () => {
    for (const { name, narrative } of await allNarratives()) {
      const all = proseSlots(narrative).flatMap(sentences);
      const repeats = [];
      for (let left = 0; left < all.length; left += 1) {
        for (let right = left + 1; right < all.length; right += 1) {
          if (isSemanticallyEquivalent(all[left], all[right])) repeats.push([all[left], all[right]]);
        }
      }
      expect(repeats, name).toEqual([]);
      const claims = Object.values(narrative.plainLanguage.claims).flat();
      expect(new Set(claims).size, name).toBe(claims.length);
    }
  });

  it("keeps the V3 voice and claims no cause the evidence cannot support", async () => {
    for (const { name, narrative, prepared } of await allNarratives()) {
      const texts = proseSlots(narrative);
      expect(findNarrativeV3VoiceViolations(texts.join("\n")), name).toEqual([]);
      expect(findNarrativeV3ClaimRestraintIssues({ interpretation: prepared.strategicInterpretation, texts }), name).toEqual([]);
    }
  });
});

describe("DEXA Event plain language adapts to the result", () => {
  it("leaves body fat out of the headline and Protect out of Coach's Insight when nothing needs correcting", async () => {
    const { artifact, prepared } = await variant("bodyFatInRange");
    const narrative = artifact.briefing.dexaEventNarrative;
    expect(prepared.strategicInterpretation.recommendation.action).toBe("continue_current_strategy");
    expect(narrative.hero.title).toBe("You're making progress toward your muscle-building goal.");
    expect(narrative.hero.body).toMatch(/Your body fat rose to 8\.5%, inside your 8–9% target range\./);
    expect(narrative.interpretation.opening).toMatch(/^That's the balance you want while building muscle/);
    expect(narrative.coachInsight.protect).toBe("");
    expect(narrative.coachInsight.next).toBe("Stay the course. There's no reason to change your plan right now.");
  });

  it("does not treat body fat below the range as automatically good", async () => {
    const narrative = (await variant("bodyFatBelowRange")).artifact.briefing.dexaEventNarrative;
    expect(narrative.hero.body).toMatch(/which is below your 8–9% target range\./);
    expect(narrative.coachInsight.next).toBe(
      "Make sure you're eating enough to support your training. Lower body fat isn't automatically better while you're building muscle.");
  });

  it("drops the win and the Protect advice when lean mass went down", async () => {
    const narrative = (await variant("leanDown")).artifact.briefing.dexaEventNarrative;
    expect(narrative.hero.title).toBe("This scan moved away from your muscle-building goal, and body fat needs attention.");
    expect(narrative.hero.body).toMatch(/your lean mass \(muscle plus water and other non-fat tissue\) went down 1\.2 lb\./);
    expect(narrative.coachInsight.biggestWin).toBe("");
    expect(narrative.coachInsight.protect).toBe("");
    expect(narrative.coachInsight.next).toMatch(/calorie intake, training and recovery/);
    expect(narrative.coachInsight.next).toMatch(/getting lean mass moving up again\.$/);
  });

  it("does not call a flat scan new progress", async () => {
    const narrative = (await variant("leanFlat")).artifact.briefing.dexaEventNarrative;
    expect(narrative.hero.title).toMatch(/^This scan didn't show clear progress toward your muscle-building goal/);
    expect(narrative.hero.body).toMatch(/your lean mass \(muscle plus water and other non-fat tissue\) stayed about the same\./);
    expect(narrative.coachInsight.biggestWin).toBe("You're still more than halfway to your muscle-building target.");
    expect(narrative.interpretation.uncertainty).toMatch(/small changes can get lost/);
  });

  it("leaves out body-part detail that is not notable", async () => {
    expect((await variant("oct9")).artifact.briefing.dexaEventNarrative.interpretation.regional).toBe("");
  });
});

describe("DEXA Event plain language for other goals and missing context", () => {
  function syntheticEvent(overrides = {}) {
    return {
      semanticGoalType: "fat_loss",
      priorScanDate: "2026-09-12",
      progress: { headline: [
        { label: "DEXA Weight", previous: 180, current: 177, delta: -3 },
        { label: "Body Fat", previous: 12.4, current: 11.2, delta: -1.2 },
        { label: "Fat Mass", previous: 22.3, current: 19.8, delta: -2.5 },
        { label: "Lean Tissue", previous: 150.2, current: 149.6, delta: -0.6 },
      ], regionalFat: [], regionalLean: [] },
      regionalChanges: { fat: [{ region: "android", delta: -0.9 }], lean: [{ region: "legs", delta: -0.7 }] },
      hero: { results: [{ label: "Lean Tissue", value: "−0.6 lb", context: "Measured change" }] },
      context: { bodyFatGuardrail: { lowerBound: 8, upperBound: 9 }, activePhase: { name: "Cut" } },
      interpretation: { opening: "x", stoodOut: null },
      supportingEvidence: { weightDays: 12, trainingDays: 0, nutritionDays: 5, photoSessions: 0 },
      pi: { status: "ok" },
      ...overrides,
    };
  }
  const plan = { objectiveStates: [{ state: "progressed" }], goalAchievement: "in_progress",
    recommendation: { action: "continue_current_strategy" }, strategyEffectiveness: { feasibility: "demonstrated" } };
  const roles = { goalProgress: null, claims: {} };

  it("words a fat-loss scan around body fat, without muscle-building language or a range verdict", () => {
    const plain = composeDexaEventPlainLanguage({ event: syntheticEvent(), narrativePlan: plan, roles });
    expect(plain.hero.title).toBe("You're making progress toward your fat-loss goal.");
    expect(plain.hero.body).toBe(
      "Your body fat dropped to 11.2%. Since your September 12 scan, your lean mass (muscle plus water and other non-fat tissue) went down 0.6 lb.");
    expect(plain.interpretation.opening).toMatch(/Some of the weight you lost was lean mass/);
    expect(plain.interpretation.regional).toBe(
      "Fat changed most in your belly (about 0.9 lb less fat). Lean mass changed most in your legs (about 0.7 lb less lean mass). " +
      "Body-part numbers are less precise than the whole-body totals.");
    expect(plain.interpretation.supportingEvidence).toBe("Your weigh-ins and food logs from the same period help put this scan in context.");
    expect(plain.hero.results[0]).toMatchObject({ label: "Lean Mass", context: "Change since your last scan" });
    expect(JSON.stringify(plain)).not.toMatch(/muscle-building|target range/);
  });

  it("uses neutral goal words for an unknown goal", () => {
    const plain = composeDexaEventPlainLanguage({ event: syntheticEvent({ semanticGoalType: "something_else" }), narrativePlan: plan, roles });
    expect(plain.hero.title).toBe("You're making progress toward your goal.");
    expect(plain.hero.results[0].context).toBe("Change since your last scan");
  });

  it("says when the goal information is incomplete", () => {
    const plain = composeDexaEventPlainLanguage({ event: syntheticEvent({ pi: { status: "fallback" } }), narrativePlan: plan, roles });
    expect(plain.interpretation.uncertainty).toMatch(/^We can compare the two scans, but some of your goal information is missing/);
  });

  it("names only the supporting evidence that exists, and omits it when there is none", () => {
    const all = composeDexaEventPlainLanguage({ event: syntheticEvent({ supportingEvidence: {
      weightDays: 20, trainingDays: 14, nutritionDays: 25, photoSessions: 2 } }), narrativePlan: plan, roles });
    expect(all.interpretation.supportingEvidence)
      .toBe("Your weigh-ins, workouts, food logs and progress photos from the same period help put this scan in context.");
    const plain = composeDexaEventPlainLanguage({ event: syntheticEvent({ supportingEvidence: { weightDays: 0 } }), narrativePlan: plan, roles });
    expect(plain.interpretation.supportingEvidence).toBe("");
  });

  it("marks a reached goal without inventing a next phase", () => {
    const plain = composeDexaEventPlainLanguage({ event: syntheticEvent(), narrativePlan: { ...plan, goalAchievement: "achieved",
      recommendation: { action: "transition_goal" } }, roles: { goalProgress: "reached", claims: {} } });
    expect(plain.hero.title).toBe("You've reached your fat-loss goal.");
    expect(plain.coachInsight.biggestWin).toBe("");
    expect(plain.interpretation.phaseMeaning).toBeNull();
    expect(plain.coachInsight.next).toBe("Take a moment to lock in this result before choosing your next target.");
  });

  it("returns nothing without a prior scan, so the existing presentation stays", () => {
    expect(composeDexaEventPlainLanguage({ event: syntheticEvent({ priorScanDate: null }), narrativePlan: plan, roles })).toBeNull();
    expect(composeDexaEventPlainLanguage({ event: syntheticEvent(), narrativePlan: plan, roles: null })).toBeNull();
  });

  it("does not reword a stored briefing that has no measured comparison", () => {
    const artifact = { briefing: { dexaEventNarrative: { hero: { title: "Stored." }, interpretation: { opening: "Stored opening." }, coachInsight: {} } } };
    const narrativePlan = { composition: { headline: "Headline.", sections: { result: "Result." }, coachTake: "Take.",
      eventPresentation: { heroBody: "Result.", biggestWin: null, protect: null, next: "Next.", claims: {} } } };
    const composed = applyNarrativeV3ToBriefingArtifact({ artifact, publicationType: "dexa", narrativePlan, strategicInterpretation: {} });
    expect(composed.briefing.dexaEventNarrative.plainLanguage).toBeUndefined();
    expect(composed.briefing.dexaEventNarrative.interpretation.opening).toBe("Stored opening.");
  });
});

describe("DEXA body-fat range classification", () => {
  it("matches the DEXA context classification exactly", () => {
    const range = { lowerBound: 8, upperBound: 9 };
    for (const value of [6, 7.84, 7.85, 7.9, 8, 8.1, 8.15, 8.16, 8.5, 8.84, 8.85, 9, 9.01, 9.15, 9.7, 12, null]) {
      expect(bodyFatRangeStatus(value, range), String(value)).toBe(classifyBodyFatGuardrail(value, range).status);
    }
    expect(bodyFatRangeStatus(9.7, null)).toBe(classifyBodyFatGuardrail(9.7, null).status);
  });
});
