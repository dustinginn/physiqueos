import { describe, expect, it } from "vitest";
import { fixtures, prepareDexaOct9V3 } from "../../testSupport/briefingFamilyV3Harness.js";
import { isSemanticallyEquivalent } from "../intelligence/v3/V3Runtime.js";
import { applyNarrativeV3ToBriefingArtifact } from "./BriefingGoalConfidencePresentationService.js";

// Regression for the October 9 2026 DEXA Event briefing. The Founder accepts its
// strategic assessment (70% Confidence, decreased; lean-tissue progress; the
// body-fat guardrail breach; address body fat before pushing lean mass harder)
// but the briefing repeated the same conclusions across the hero, the
// interpretation and Coach's Insight. The fixture is the published text; the
// harness reproduces it from the production code path.

const STORED = fixtures.dexaEventOct9Narrative.stored;

// What every reader shows, in order (Native DEXABriefingSections and the web
// screen): empty optional fields are omitted.
function renderedSlots(narrative) {
  const i = narrative.interpretation ?? {};
  const c = narrative.coachInsight ?? {};
  return [
    ["hero.title", narrative.hero?.title], ["hero.body", narrative.hero?.body],
    ["interpretation.opening", i.opening], ["interpretation.fatLoss", i.fatLoss],
    ["interpretation.leanMass", i.leanMass], ["interpretation.regional", i.regional],
    ["interpretation.phaseMeaning", i.phaseMeaning], ["interpretation.stoodOut", i.stoodOut],
    ["interpretation.goalProgress", i.goalProgress], ["interpretation.guardrailStatus", i.guardrailStatus],
    ["evidence.supportingEvidence", i.supportingEvidence], ["evidence.uncertainty", i.uncertainty],
    ["coach.biggestWin", c.biggestWin], ["coach.protect", c.protect], ["coach.watch", c.watch], ["coach.next", c.next],
  ].filter(([, text]) => typeof text === "string" && text.trim() !== "");
}

function sentences(text) {
  const out = [];
  let rest = String(text).trim();
  while (rest) {
    const match = /^.*?[.!?](?:\s+|$)/su.exec(rest);
    const next = match ? match[0] : rest;
    out.push(next.trim());
    rest = rest.slice(next.length).trim();
  }
  return out;
}

function repeatedSentences(narrative) {
  const all = renderedSlots(narrative).flatMap(([slot, text]) => sentences(text).map((value) => ({ slot, value })));
  const repeats = [];
  for (let left = 0; left < all.length; left += 1) {
    for (let right = left + 1; right < all.length; right += 1) {
      if (isSemanticallyEquivalent(all[left].value, all[right].value)) repeats.push([all[left], all[right]]);
    }
  }
  return repeats;
}

// The Oct 9 conclusions, by the facts that state them.
const FACTS = {
  leanChange: /1\.3 lb/,
  bodyFatValue: /9\.7%/,
  coachingPriority: /before pushing harder/i,
  oneScanCaveat: /one scan cannot prove/i,
  headline: /strong result, with one important caveat/i,
};
const occurrences = (narrative, pattern) => renderedSlots(narrative).filter(([, text]) => pattern.test(text)).length;

describe("October 9 DEXA Event: faithful reproduction", () => {
  it("reproduces the published V3 narrative and DEXA interpretation from the production code path", async () => {
    const { artifact, prepared } = await prepareDexaOct9V3({ withRoles: false });
    const v3 = artifact.briefing.narrativeV3;
    expect(v3.summary).toBe(STORED.narrativeV3.summary);
    for (const section of ["result", "meaning", "action"]) expect(v3.sections[section]).toBe(STORED.narrativeV3.sections[section]);
    expect(v3.coachTake).toBe(STORED.narrativeV3.coachTake);
    const interpretation = artifact.briefing.dexaEventNarrative.interpretation;
    for (const field of ["opening", "fatLoss", "leanMass", "phaseMeaning", "uncertainty", "goalProgress", "guardrailStatus"]) {
      expect(interpretation[field]).toBe(STORED.interpretation[field]);
    }
    expect(prepared.strategicInterpretation.recommendation.action).toBe("continue_with_guardrail_monitoring");
    // The prior mapping is exactly what was published.
    const coach = artifact.briefing.dexaEventNarrative.coachInsight;
    expect(coach.biggestWin).toBe(STORED.coachInsight.biggestWin);
    expect(coach.protect).toBe(STORED.coachInsight.protect);
    expect(coach.next).toBe(STORED.coachInsight.next);
  });

  it("documents the published defect: the same conclusions repeated across slots", () => {
    const stored = { hero: STORED.hero, interpretation: STORED.interpretation, coachInsight: STORED.coachInsight };
    expect(STORED.coachInsight.biggestWin).toBe(STORED.hero.body);
    expect(STORED.interpretation.goalProgress).toBe(STORED.interpretation.opening);
    expect(STORED.interpretation.guardrailStatus).toBe(STORED.interpretation.fatLoss);
    expect(occurrences(stored, FACTS.leanChange)).toBeGreaterThanOrEqual(5);
    expect(occurrences(stored, FACTS.headline)).toBe(3);
    expect(repeatedSentences(stored).length).toBeGreaterThan(5);
  });
});

describe("October 9 DEXA Event: each conclusion said once", () => {
  it("has no semantically repeated sentence anywhere a reader sees", async () => {
    const { artifact } = await prepareDexaOct9V3();
    expect(repeatedSentences(artifact.briefing.dexaEventNarrative)).toEqual([]);
  });

  it("states each Oct 9 conclusion in exactly one place", async () => {
    const narrative = (await prepareDexaOct9V3()).artifact.briefing.dexaEventNarrative;
    expect(occurrences(narrative, FACTS.headline)).toBe(1);
    expect(occurrences(narrative, FACTS.leanChange)).toBe(1);
    expect(occurrences(narrative, FACTS.bodyFatValue)).toBe(1);
    expect(occurrences(narrative, FACTS.coachingPriority)).toBe(1);
    expect(occurrences(narrative, FACTS.oneScanCaveat)).toBe(1);
    expect(narrative.hero.body.startsWith(narrative.hero.title)).toBe(false);
  });

  it("removes the same repetition the prior mapping produced on identical inputs", async () => {
    const before = (await prepareDexaOct9V3({ withRoles: false })).artifact.briefing.dexaEventNarrative;
    const after = (await prepareDexaOct9V3()).artifact.briefing.dexaEventNarrative;
    expect(repeatedSentences(before).length).toBeGreaterThan(5);
    expect(repeatedSentences(after)).toEqual([]);
  });
});

describe("October 9 DEXA Event: distinct Coach's Insight responsibilities", () => {
  it("gives Biggest Win, Protect and Next distinct claims", async () => {
    const narrative = (await prepareDexaOct9V3()).artifact.briefing.dexaEventNarrative;
    const { claims } = narrative.presentationRolesV3;
    const roleClaims = [claims.biggestWin, claims.protect, claims.next].flat();
    expect(new Set(roleClaims).size).toBe(roleClaims.length);
    expect(claims.biggestWin).toEqual(["goal_progress", "measured_progress"]);
    expect(claims.protect).toEqual(["preserve_routine_and_comparability"]);
    expect(claims.next[0]).toBe("address_guardrail_first");
  });

  it("keeps each role to its own job", async () => {
    const { biggestWin, protect, next, watch } = (await prepareDexaOct9V3()).artifact.briefing.dexaEventNarrative.coachInsight;
    // Biggest Win: the earned goal progress, without the caveat or the hero's numbers.
    expect(biggestWin).toMatch(/more than halfway to the 10 lb lean-mass goal/);
    expect(biggestWin).not.toMatch(/body fat|caveat|1\.3 lb|9\.7%/i);
    // Protect: what to keep steady while correcting; not the correction itself.
    expect(protect).toMatch(/keep the rest of the current routine steady/i);
    expect(protect).not.toMatch(/body fat|before pushing harder/i);
    // Next: the single coaching priority, then what the next check decides.
    expect(next).toMatch(/^Address body fat before pushing harder on lean mass\./);
    expect(next).not.toMatch(/1\.3 lb|9\.7%/);
    // The bounded watch question is part of Next, so it is not repeated.
    expect(watch).toBe("");
    for (const [left, right] of [[biggestWin, protect], [biggestWin, next], [protect, next]]) {
      for (const a of sentences(left)) for (const b of sentences(right)) expect(isSemanticallyEquivalent(a, b)).toBe(false);
    }
  });
});

describe("October 9 DEXA Event: optional content contracts", () => {
  it("omits interpretation fields whose every sentence is said elsewhere, and only those", async () => {
    const { interpretation } = (await prepareDexaOct9V3()).artifact.briefing.dexaEventNarrative;
    expect(interpretation.opening).toBe("");
    expect(interpretation.leanMass).toBe("");
    expect(interpretation.goalProgress).toBeNull();
    expect(interpretation.guardrailStatus).toBeNull();
    // Unique reasoning stays, unaltered.
    expect(interpretation.fatLoss).toBe(STORED.interpretation.fatLoss);
    expect(interpretation.phaseMeaning).toBe(STORED.interpretation.phaseMeaning);
    expect(interpretation.uncertainty).toBe(STORED.interpretation.uncertainty);
    expect(interpretation.regional).toMatch(/Regional DEXA changes remain measurements/);
  });

  it("never truncates: every kept sentence is a whole sentence the composers wrote", async () => {
    const { artifact, legacy } = await prepareDexaOct9V3();
    const narrative = artifact.briefing.dexaEventNarrative;
    const written = new Set([
      ...Object.values(legacy.interpretation).filter((value) => typeof value === "string").flatMap(sentences),
      ...Object.values(narrative.presentationRolesV3).filter((value) => typeof value === "string").flatMap(sentences),
      ...sentences(artifact.briefing.narrativeV3.summary),
    ]);
    for (const [, text] of renderedSlots(narrative)) for (const value of sentences(text)) expect(written.has(value)).toBe(true);
  });

  it("keeps a decrease caution that nothing else says", async () => {
    const { interpretation } = (await prepareDexaOct9V3({
      // A contract-valid scan whose lean tissue fell 1.2 lb (masses reconcile).
      mutateScan: (scan) => {
        scan.leanMass = { value: 152.1, unit: "lb" };
        scan.totalMass = { value: 176.6, unit: "lb" };
        scan.bodyFatPercentage = 9.9;
      },
    })).artifact.briefing.dexaEventNarrative;
    expect(`${interpretation.opening} ${interpretation.leanMass}`).toMatch(/one scan|closer look/i);
  });
});

describe("October 9 DEXA Event: the strategic conclusion is preserved", () => {
  it("leaves the assessment, Confidence and canonical V3 narrative unchanged", async () => {
    const before = await prepareDexaOct9V3({ withRoles: false });
    const after = await prepareDexaOct9V3();
    expect(after.prepared.assessment.currentPercentage).toBe(before.prepared.assessment.currentPercentage);
    expect(after.prepared.assessment.movement).toBe(before.prepared.assessment.movement);
    expect(after.prepared.strategicInterpretation.recommendation).toEqual(before.prepared.strategicInterpretation.recommendation);
    // The canonical composition is identical; only the additive roles differ in use.
    const canonical = ({ eventPresentation: _roles, ...rest }) => rest;
    expect(canonical(after.prepared.narrativePlan.composition)).toEqual(canonical(before.prepared.narrativePlan.composition));
    expect(after.artifact.briefing.narrativeV3).toEqual(before.artifact.briefing.narrativeV3);
    expect(after.artifact.briefing.dexaEventNarrative.goalConfidence).toEqual(before.artifact.briefing.dexaEventNarrative.goalConfidence);
    expect(after.artifact.briefing.dexaEventNarrative.strategicMeaningV3).toEqual(before.artifact.briefing.dexaEventNarrative.strategicMeaningV3);
  });

  it("still says the strategic conclusion: lean progress, the breach, and fat before lean", async () => {
    const narrative = (await prepareDexaOct9V3()).artifact.briefing.dexaEventNarrative;
    const text = renderedSlots(narrative).map(([, value]) => value).join("\n");
    expect(narrative.hero.title).toBe(STORED.hero.title);
    expect(text).toMatch(/You added 1\.3 lb of lean mass since September 12\./);
    expect(text).toMatch(/Body fat is pressing the limit at 9\.7%\./);
    expect(text).toMatch(/Body fat is above your chosen 8–9% range\./);
    expect(text).toMatch(/Address body fat before pushing harder on lean mass\./);
    expect(text).toMatch(/more than halfway to the 10 lb lean-mass goal/);
  });

  it("does not touch the published 70% Confidence of a stored Oct 9 artifact", () => {
    const artifact = { id: "dexa_event_oct9", briefing: { dexaEventNarrative: {
      hero: { ...STORED.hero }, interpretation: { ...STORED.interpretation }, coachInsight: { ...STORED.coachInsight },
      goalConfidence: { ...STORED.goalConfidence },
    } } };
    const narrativePlan = { composition: {
      headline: STORED.narrativeV3.summary, sections: STORED.narrativeV3.sections, coachTake: STORED.narrativeV3.coachTake,
      eventPresentation: { heroBody: "x.", biggestWin: "y.", protect: "z.", next: "w.", claims: { heroBody: [], biggestWin: [], protect: [], next: [] } },
    } };
    const composed = applyNarrativeV3ToBriefingArtifact({ artifact, publicationType: "dexa", narrativePlan, strategicInterpretation: {} });
    expect(composed.briefing.dexaEventNarrative.goalConfidence).toEqual(STORED.goalConfidence);
    expect(composed.briefing.dexaEventNarrative.goalConfidence.score).toBe(70);
    // A stored artifact without interpretation claims keeps its interpretation as written.
    expect(composed.briefing.dexaEventNarrative.interpretation).toEqual(STORED.interpretation);
  });
});

describe("other briefing types keep their mapping", () => {
  it("projects a Photo Event exactly as before even when the plan carries event roles", () => {
    const base = { id: "photo_event", briefing: { photoEventNarrative: { hero: { title: "t" } } } };
    const sections = { result: "Result sentence here.", meaning: "Meaning sentence here.", action: "Action sentence here." };
    const plain = { composition: { headline: "Headline.", sections, coachTake: "Coach take." } };
    const withRoles = { composition: { ...plain.composition, eventPresentation: { heroBody: "Different.", biggestWin: "a.", protect: "b.", next: "c.", claims: {} } } };
    const left = applyNarrativeV3ToBriefingArtifact({ artifact: base, publicationType: "photo", narrativePlan: plain, strategicInterpretation: {} });
    const right = applyNarrativeV3ToBriefingArtifact({ artifact: base, publicationType: "photo", narrativePlan: withRoles, strategicInterpretation: {} });
    expect(right.briefing.photoEventNarrative).toEqual(left.briefing.photoEventNarrative);
  });

  it("keeps the prior DEXA mapping for a plan composed before event roles existed", () => {
    const base = { id: "dexa_event", briefing: { dexaEventNarrative: { hero: {}, coachInsight: {} } } };
    const plan = { composition: { headline: STORED.narrativeV3.summary, sections: STORED.narrativeV3.sections, coachTake: STORED.narrativeV3.coachTake } };
    const composed = applyNarrativeV3ToBriefingArtifact({ artifact: base, publicationType: "dexa", narrativePlan: plan, strategicInterpretation: {} });
    expect(composed.briefing.dexaEventNarrative.hero.body).toBe(STORED.hero.body);
    expect(composed.briefing.dexaEventNarrative.coachInsight.biggestWin).toBe(STORED.coachInsight.biggestWin);
    expect(composed.briefing.dexaEventNarrative.presentationRolesV3).toBeUndefined();
  });
});

describe("DEXA Event roles when nothing needs correcting", () => {
  it("keeps Protect to comparability so it never repeats Next's instruction", async () => {
    // The Sep 12 paired calibration case: lean progress, body fat controlled, continue unchanged.
    const { prepareDexaV3 } = await import("../../testSupport/briefingFamilyV3Harness.js");
    const { prepared, artifact } = await prepareDexaV3();
    expect(prepared.strategicInterpretation.recommendation.action).toBe("continue_current_strategy");
    const narrative = artifact.briefing.dexaEventNarrative;
    expect(narrative.coachInsight.protect).toBe("Prepare for the next DEXA the same way so the comparison stays fair.");
    expect(narrative.coachInsight.next).toMatch(/^Stay the course\./);
    // This fixture's interpretation was stored before interpretation claims
    // existed, so it is served as written; the hero and Coach roles are new.
    expect(repeatedSentences({ hero: narrative.hero, coachInsight: narrative.coachInsight })).toEqual([]);
  });
});
