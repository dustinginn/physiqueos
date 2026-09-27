// End-to-end: generated periods through the real Weekly V3 pipeline
// (`StrategicInterpretationPublicationServiceV3.prepare`). Assertions are
// product rules, not copy: characterization never moves Confidence or forces
// a strategy change, a stable period keeps the concise no-change narrative,
// Goal Confidence is explained at goal level, wearable estimates are never
// stated with precision, generic "still unresolved" uncertainty is not
// presentable, and a run without period evidence is unchanged.

import { describe, expect, it } from "vitest";
import {
  computeCorrectedEnergyObservations, prepareWeeklyV3, weeklyPiEnvelope,
} from "../../../testSupport/briefingFamilyV3Harness.js";
import { SYNTHETIC_SCENARIOS, generateSyntheticPeriod, syntheticCanonicalRecords } from
  "../../../testSupport/briefingIntelligenceSynthetic.js";
import { findNarrativeV3VoiceViolations } from "../v3/NarrativeV3CompositionService.js";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const piEnvelope = () => weeklyPiEnvelope({ energyObservations: computeCorrectedEnergyObservations().observations });

async function weekly(period) {
  const { canonicalObjects, weightEntries } = syntheticCanonicalRecords({ days: period.days });
  return prepareWeeklyV3({ piEnvelope: piEnvelope(), periodEvidence: {
    window: period.truth.window, timeZone: "America/Los_Angeles", canonicalObjects, weightEntries, dexaScans: [] } });
}

let reference;
async function withoutIntelligence() {
  reference ??= await prepareWeeklyV3({ piEnvelope: piEnvelope() });
  return reference;
}

const exerciseNames = (prepared) => (prepared.strategicInterpretation.coachingObservationSelection?.candidates ??
  prepared.strategicInterpretation.coachingObservationSelection?.selected ?? [])
  .map((item) => item.subjectLabel).filter(Boolean);

describe("Shared Briefing Intelligence through the Weekly V3 pipeline", () => {
  it("never moves Confidence or changes the recommendation by characterization alone", async () => {
    const base = await withoutIntelligence();
    for (const scenario of SYNTHETIC_SCENARIOS) {
      for (const seed of SEEDS.slice(0, 3)) {
        const prepared = await weekly(generateSyntheticPeriod({ seed, scenario }));
        expect(prepared.confidence.currentPercentage).toBe(base.confidence.currentPercentage);
        expect(prepared.confidence.delta).toBe(base.confidence.delta);
        expect(prepared.strategicInterpretation.recommendation.action)
          .toBe(base.strategicInterpretation.recommendation.action);
      }
    }
  });

  it("a materially different week yields a rich, specific recap while the plan holds", async () => {
    for (const seed of SEEDS) {
      const prepared = await weekly(generateSyntheticPeriod({ seed, scenario: "late_disruption" }));
      const { composition, periodCharacterization } = prepared.narrativePlan;
      expect(periodCharacterization.realized).toBe(true);
      expect(composition.headline).toMatch(/^Late in the week the usual routine changed: /u);
      expect(composition.headline).not.toMatch(/Nothing here calls for a change/u);
      expect(composition.coachTake).not.toMatch(/Nothing needs fixing right now/u);
      expect(composition.sections.action).toMatch(/Keep the current setup in place\.$/u);
      expect(composition.sections.watch).toMatch(/^Watch whether next week holds its routine/u);
      expect(composition.headline.length).toBeLessThanOrEqual(160);
      expect(findNarrativeV3VoiceViolations(Object.values(composition.sections).join("\n") + composition.coachTake)).toEqual([]);
    }
  });

  it("a stable week keeps the existing concise no-change narrative", async () => {
    const base = await withoutIntelligence();
    let concise = 0;
    for (const seed of SEEDS) {
      const prepared = await weekly(generateSyntheticPeriod({ seed, scenario: "stable" }));
      if (prepared.narrativePlan.periodCharacterization.realized) continue;
      concise += 1;
      expect(prepared.narrativePlan.composition.sections).toEqual(base.narrativePlan.composition.sections);
      expect(prepared.narrativePlan.composition.coachTake).toBe(base.narrativePlan.composition.coachTake);
    }
    expect(concise).toBeGreaterThanOrEqual(SEEDS.length - 1);
  });

  it("Goal Confidence is explained at goal level: no single exercise, no undefined referent", async () => {
    for (const scenario of ["stable", "late_disruption", "intake_run"]) {
      const prepared = await weekly(generateSyntheticPeriod({ seed: 2, scenario }));
      const text = prepared.narrativePlan.composition.sections.confidence;
      for (const name of exerciseNames(prepared)) expect(text.toLowerCase()).not.toContain(name.toLowerCase());
      expect(text).not.toMatch(/’s recent result|\b(?:one|this) update\b/u);
      if (prepared.confidence.delta === 0) expect(text).toMatch(/Confidence holds\./u);
    }
  });

  it("wearable activity is described directionally, never with estimated precision", async () => {
    for (const seed of SEEDS) {
      const prepared = await weekly(generateSyntheticPeriod({ seed, scenario: "late_disruption" }));
      const text = [...Object.values(prepared.narrativePlan.composition.sections), prepared.narrativePlan.composition.coachTake].join(" ");
      expect(text).not.toMatch(/\b\d[\d,]*\s*(?:kcal|calories|cal)\b[^.]*\b(?:move|movement|activity|burn)/iu);
      expect(text).not.toMatch(/\b(?:move|movement|activity|burn)[^.]*\b\d[\d,]*\s*(?:kcal|calories|cal)\b/iu);
    }
  });

  it("an unreliable nutrition day is disclosed as a logging question, never as eating more or less", async () => {
    for (const seed of SEEDS) {
      const period = generateSyntheticPeriod({ seed, scenario: "late_disruption" });
      const last = period.days.at(-1);
      last.nutrition.protein = Math.round(last.nutrition.protein * 0.3);
      const prepared = await weekly(period);
      const coach = prepared.narrativePlan.composition.coachTake;
      expect(coach).toMatch(/look incomplete, so intake on (?:that day|those days) is not counted either way\./u);
      const all = [...Object.values(prepared.narrativePlan.composition.sections), coach].join(" ");
      expect(all).not.toMatch(/\b(?:ate|eating|intake) (?:more|less|higher|lower)\b/iu);
    }
  });

  it("the presentable Weekly uncertainty is bounded; the full profile stays for audit", async () => {
    const prepared = await weekly(generateSyntheticPeriod({ seed: 4, scenario: "late_disruption" }));
    const narrative = prepared.artifact.briefing.narrativeV3;
    expect(narrative.uncertainty.length).toBeLessThanOrEqual(2);
    expect(narrative.uncertainty.every((item) => item.surfaced === true && item.surfacedIn !== "module")).toBe(true);
    expect(narrative.uncertaintyAudit.length).toBe(prepared.strategicInterpretation.uncertaintyProfile.length);
  });

  it("without period evidence, V3 runs exactly as before: no characterization, no lineage stamp", async () => {
    const base = await withoutIntelligence();
    expect(base.narrativePlan.periodCharacterization).toBeUndefined();
    expect(base.briefingIntelligence).toBeNull();
    expect(base.assessment.sourceLineage.briefingIntelligenceVersion).toBeUndefined();
    const withEvidence = await weekly(generateSyntheticPeriod({ seed: 1, scenario: "late_disruption" }));
    expect(withEvidence.assessment.sourceLineage.briefingIntelligenceVersion).toBe("briefing_intelligence_v1");
  });
});
