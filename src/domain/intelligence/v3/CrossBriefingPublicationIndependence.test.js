// The shared Briefing Intelligence enriches every briefing type's narrative
// through the real V3 publication path, and never moves Confidence or the
// recommendation. Uses the accepted family harness with synthetic canonical
// period evidence (no founder data, nothing written).

import { describe, expect, it } from "vitest";
import { prepareDexaV3, prepareMidweekV3, preparePhotoV3 } from "../../../testSupport/briefingFamilyV3Harness.js";
import { generateSyntheticPeriod, syntheticCanonicalRecords } from "../../../testSupport/briefingIntelligenceSynthetic.js";

function periodEvidence(windowEnd, windowDays = 7) {
  const period = generateSyntheticPeriod({ seed: 4, scenario: "late_disruption", windowEnd, windowDays, baselineDays: 56 });
  const records = syntheticCanonicalRecords({ days: period.days });
  return { window: { startDate: period.truth.window.startDate, endDate: windowEnd }, timeZone: "America/Los_Angeles",
    canonicalObjects: records.canonicalObjects, weightEntries: records.weightEntries, dexaScans: [] };
}

const CASES = [
  ["midweek", () => prepareMidweekV3(), () => prepareMidweekV3({ periodEvidence: periodEvidence("2026-09-15", 3) })],
  ["dexa", () => prepareDexaV3(), () => prepareDexaV3({ periodEvidence: { ...periodEvidence("2026-09-12"), window: { startDate: "2026-09-12", endDate: "2026-09-12" } } })],
  ["photo", () => preparePhotoV3({ structured: true }), () => preparePhotoV3({ structured: true, periodEvidence: { ...periodEvidence("2026-09-19"), window: { startDate: "2026-09-19", endDate: "2026-09-19" } } })],
];

describe("cross-briefing publication: the shared engine changes words, never Confidence", () => {
  it.each(CASES)("%s: Confidence, movement and recommendation are identical with and without period intelligence", async (type, without, withIntelligence) => {
    // prepareMidweekV3 returns the prepared publication itself; the event harnesses wrap it.
    const unwrap = (result) => ({ prepared: result.prepared ?? result });
    const base = unwrap(await without());
    const enriched = unwrap(await withIntelligence());
    expect(enriched.prepared.briefingIntelligence).toBeTruthy();
    expect(enriched.prepared.confidence.currentPercentage).toBe(base.prepared.confidence.currentPercentage);
    expect(enriched.prepared.confidence.delta).toBe(base.prepared.confidence.delta);
    expect(enriched.prepared.strategicInterpretation.recommendation).toEqual(base.prepared.strategicInterpretation.recommendation);
    const summary = enriched.prepared.narrativePlan.holisticSynthesis;
    expect(summary.failureCode ?? null).toBeNull();
    // A quiet partial week can clear nothing above Midweek's floor; the prior
    // path then speaks. Events always realize around their result.
    if (type !== "midweek") expect(summary.realized).toBe(true);
    expect(enriched.prepared.narrativePlan.claimRestraint.issues).toEqual([]);
  });
});
