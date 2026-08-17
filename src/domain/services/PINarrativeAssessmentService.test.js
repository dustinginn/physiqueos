import { describe, expect, it } from "vitest";
import { createPINarrativeAssessment } from "./PINarrativeAssessmentService";
import { expectInternalDomainNamesNatural } from "../presentation/proseCapitalization";

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

  describe("phaseBoundary (read-only, additive context)", () => {
    const phaseBoundary = { phaseName: "Lean Mass Build", strategicReviewCadence: "monthly", strategicReviewAnchor: "dexa_body_composition" };
    const observationsWithWeight = [...observations, { id: "w1", domain: "weight", direction: "stable", explanationData: { absoluteChange: -1.3 } }];
    const input = { observations: observationsWithWeight, goal: { id: "g", type: "build_lean_mass" }, phase: { id: "p", type: "establish_maintenance" }, operatingState: "calibration" };

    it("preserves the evidence facts, headline, decision, and primary finding when a phase boundary is present", () => {
      const withoutBoundary = createPINarrativeAssessment(input);
      const withBoundary = createPINarrativeAssessment({ ...input, phaseBoundary });
      // The headline and the underlying decision/primary-finding classification are pure
      // evidence facts and stay identical — only trailing strategic wording changes.
      expect(withBoundary.overallConclusion.headline).toEqual(withoutBoundary.overallConclusion.headline);
      expect(withBoundary.decision.type).toEqual(withoutBoundary.decision.type);
      expect(withBoundary.primaryFinding).toEqual(withoutBoundary.primaryFinding);
      // Energy/Weight/summary numeric facts stay identical — only their trailing strategic wording changes.
      const numericFields = (item) => ({ domain: item.domain, status: item.status, direction: item.direction,
        evidenceBasis: item.evidenceBasis, claimReferences: item.claimReferences });
      expect(withBoundary.domainConclusions.map(numericFields)).toEqual(withoutBoundary.domainConclusions.map(numericFields));
    });

    it("preserves the Energy Balance evidence while replacing the stale another-full-week wording", () => {
      const result = createPINarrativeAssessment({ ...input, phaseBoundary });
      const energy = result.domainConclusions.find((item) => item.domain === "energy");
      expect(energy.explanation).toMatch(/6 of 7 days/);
      expect(energy.explanation).not.toMatch(/let's get one more complete week/i);
      expect(energy.explanation).toMatch(/controlled push into Lean Mass Build/);
      expect(energy.explanation).not.toMatch(/Phase Review|authoriz/i);
      expectInternalDomainNamesNatural([energy.explanation]);
    });

    it("preserves the Weight Context evidence without implying Phase 1 must continue until maintenance is perfectly proven", () => {
      const withoutBoundary = createPINarrativeAssessment(input);
      const result = createPINarrativeAssessment({ ...input, phaseBoundary });
      const weight = result.domainConclusions.find((item) => item.domain === "weight");
      const weightWithout = withoutBoundary.domainConclusions.find((item) => item.domain === "weight");
      expect(weight.explanation).toContain(weightWithout.explanation);
      expect(weight.explanation).toMatch(/enough context to move forward cautiously/);
      expect(weight.explanation).not.toMatch(/Phase Review|authoriz/i);
      expectInternalDomainNamesNatural([weight.explanation]);
    });

    it("no longer blindly requires another calibration week in Coach's Take", () => {
      const result = createPINarrativeAssessment({ ...input, phaseBoundary });
      expect(result.coachTake.recommendation).not.toMatch(/hold off on a larger calorie change until another complete week/i);
      expect(result.coachTake.recommendation).toMatch(/wasn't fully proven/i);
      expect(result.coachTake.recommendation).toMatch(/conservative push/i);
      expect(result.coachTake.recommendation).toMatch(/monthly DEXA\/body-composition review/);
      expect(result.coachTake.recommendation).not.toMatch(/sufficiently bounded|user authorized|PI recommended|authoriz/i);
    });

    it("does not claim the weekly briefing itself authorized the transition", () => {
      const result = createPINarrativeAssessment({ ...input, phaseBoundary });
      expect(result.coachTake.recommendation).not.toMatch(/PI recommended review, and the user authorized/);
      expect(result.coachTake.recommendation).not.toMatch(/\bPI\b|authoriz/i);
    });

    it("reflects active Phase 2 in Into Next Week without prescribing an automatic Strategy mutation", () => {
      const result = createPINarrativeAssessment({ ...input, phaseBoundary });
      expect(result.coachTake.actions.some((item) => /Follow the Lean Mass Build calorie and activity targets/.test(item))).toBe(true);
      expect(result.coachTake.actions.some((item) => /Watch how the weekly trends respond/.test(item))).toBe(true);
      expect(result.coachTake.actions.join(" ")).not.toMatch(/increase.*calories|automatically|without.*authoriz|user-authorized|Execute the authorized/i);
    });

    it("leaves other weeks (no phaseBoundary) completely unaffected", () => {
      const result = createPINarrativeAssessment(input);
      expect(result.coachTake.recommendation).toMatch(/hold off on a larger calorie change until another complete week/i);
    });

    it("reads with natural prose capitalization", () => {
      const result = createPINarrativeAssessment({ ...input, phaseBoundary });
      expectInternalDomainNamesNatural([result.coachTake.recommendation, ...result.coachTake.actions]);
    });

    it("replaces the stale another-week clause in the top-level summary while preserving the underlying counts", () => {
      const withoutBoundary = createPINarrativeAssessment(input);
      expect(withoutBoundary.overallConclusion.summary).toMatch(/complete another week of food and activity data before making a larger calorie adjustment/);
      const withBoundary = createPINarrativeAssessment({ ...input, phaseBoundary });
      expect(withBoundary.overallConclusion.summary).not.toMatch(/complete another week/);
      expect(withBoundary.overallConclusion.summary).toMatch(/2 of 3 training areas improved/);
      expect(withBoundary.overallConclusion.summary).toMatch(/6 of 7 days/);
      expect(withBoundary.overallConclusion.summary).toMatch(/enough to move into Lean Mass Build rather than wait longer/);
      expect(withBoundary.overallConclusion.summary).not.toMatch(/Phase Review|authoriz/i);
      expectInternalDomainNamesNatural([withBoundary.overallConclusion.summary]);
    });

    it("does not call the Phase 2 starting DEXA the Goal's starting point in weekly Body Composition", () => {
      const bodyComposition = { measuredAt: "2026-08-15" };
      const withoutBoundary = createPINarrativeAssessment({ ...input, goal: { id: "g", type: "build_lean_mass" }, bodyComposition });
      expect(withoutBoundary.bodyCompositionConclusion.explanation).toMatch(/starting point for this goal/);
      const withBoundary = createPINarrativeAssessment({ ...input, goal: { id: "g", type: "build_lean_mass" }, bodyComposition, phaseBoundary });
      expect(withBoundary.bodyCompositionConclusion.explanation).not.toMatch(/starting point for this goal/);
      expect(withBoundary.bodyCompositionConclusion.explanation).toMatch(/This is where Lean Mass Build begins/);
      expect(withBoundary.bodyCompositionConclusion.headline).toBe("Where Lean Mass Build Begins");
      expect(withBoundary.bodyCompositionConclusion.explanation).not.toMatch(/starting observation|original baseline|current objective/i);
      expectInternalDomainNamesNatural([withBoundary.bodyCompositionConclusion.explanation]);
    });
  });
});
