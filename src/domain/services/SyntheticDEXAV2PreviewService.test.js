import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createSyntheticDexaV2Preview } from "./SyntheticDEXAV2PreviewService";

describe("synthetic DEXA V2 end-to-end preview", () => {
  it("executes the canonical Interpretation to Forecast to Narrative chain", () => {
    const result = createSyntheticDexaV2Preview();
    const { structuredInterpretation: interpretation, forecastAssessment: forecast,
      narrativeAssessment: narrative } = result.diagnostics;

    expect(interpretation.objectiveEvaluation.aggregateStatus).toBe("ahead");
    expect(interpretation.guardrailEvaluation.aggregateStatus).toBe("watch");
    expect(interpretation.guardrailEvaluation.conclusions).toEqual(expect.arrayContaining([
      expect.objectContaining({ guardrailId: "guardrail_body_fat", status: "clear" }),
      expect.objectContaining({ guardrailId: "guardrail_fat_gain_pace", status: "watch" }),
    ]));
    expect(interpretation.strategyValidation.status).toBe("directionally_supported");
    expect(interpretation.remainingUncertainty.items.map((item) => item.kind)).toContain("attribution");
    expect(forecast.interpretationRef).toBe(interpretation.id);
    expect(forecast.goalForecastStatus).toBe("on_forecast");
    expect(forecast.confidenceBand).toBe("moderate");
    expect(forecast.movement.direction).toBe("increase");
    expect(forecast.nextDecisiveEvidence).toMatchObject({
      evidenceCapability: "dexa_body_composition",
      expectedEventType: "dexa_scan",
      expectedWindow: { start: "2026-09-12", end: "2026-09-19" },
    });
    expect(narrative.forecastRef).toBe(forecast.id);
    expect(narrative.recommendedCoachingDirection.state).toBe("monitor_closely");
    expect(forecast.forecastExplanation.primaryLimitingFactors).toContain("guardrails_watch");
    expect(narrative.confidenceExplanation.text).toMatch(/confidence improved.*right direction.*next consistently prepared DEXA.*raise confidence further/i);
    expect(narrative.remainingUncertaintyExplanation.items.map((item) => item.text).join(" ")).toMatch(/durable muscle.*hydration.*glycogen.*preparation/i);
    expect(result.diagnostics.previousForecastContext.compatibility).toMatchObject({
      missingSemantics: expect.arrayContaining(["observed_lean_mass_gain_rate_under_current_strategy"]),
      inferredSemantics: expect.arrayContaining(["historical_execution_strong", "prior_cut_lean_mass_retention_supported"]),
      ignoredLegacyFields: ["numeric_confidence_score"],
    });
  });

  it("keeps the baseline, synthetic outcome, and relevance semantics explicit", () => {
    const result = createSyntheticDexaV2Preview();
    const contract = result.diagnostics.normalizedGoalContract;
    const presentation = result.presentation;
    expect(presentation.snapshot).toMatchObject({ scanDate: "2026-08-15", leanMass: 150, fatMass: 14.3, weight: 171.4, rmr: 1818 });
    expect(presentation.snapshot.bodyFat).toBeCloseTo(14.3 / 171.4 * 100, 12);
    expect(Number(presentation.snapshot.bodyFat.toFixed(1))).toBe(8.3);
    expect(presentation.progress.headline.find((item) => item.label === "DEXA Weight").delta).toBe(4);
    expect(presentation.progress.headline.find((item) => item.label === "Lean Tissue").delta).toBe(2.5);
    expect(presentation.progress.headline.find((item) => item.label === "Fat Mass").delta).toBe(1.5);
    expect(presentation.progress.headline.find((item) => item.label === "Body Fat").delta).toBe(0.6);
    expect(presentation.progress.timeline.scans[0].date).toBe("2026-07-18");
    expect(presentation.interpretation.opening).toContain("July 18 is still the starting point");
    expect(presentation.interpretation.opening).toContain("August 15 is the first real check");
    expect(contract.timeline.currentPhase.semanticPurpose).toBe("establish_maintenance_before_controlled_surplus");
    expect(contract.relevantEvidence.entries.find((item) => item.evidenceMapId === "map_dexa_objective").role).toBe("primary");
    expect(contract.relevantEvidence.entries.find((item) => item.evidenceMapId === "map_dexa_guardrail").role).toBe("primary");
    expect(contract.relevantEvidence.entries.find((item) => item.evidenceMapId === "map_dexa_fat_gain_pace").role).toBe("primary");
    expect(contract.relevantEvidence.entries.find((item) => item.evidenceMapId === "map_photos_guardrail").role).toBe("primary");
    expect(contract.relevantEvidence.entries.find((item) => item.evidenceMapId === "map_recovery_capacity").appliesTo.hypothesisRefs).toEqual(["response_recovery_capacity"]);
    expect(contract.relevantEvidence.entries.find((item) => item.evidenceMapId === "map_execution_context").appliesTo.objectiveRefs).toEqual([]);
  });

  it("projects a bounded preview-only numeric confidence and preserves canonical lineage", () => {
    const result = createSyntheticDexaV2Preview();
    expect(result.presentation.hero.confidence).toMatchObject({
      score: 58,
      priorScore: 50,
      delta: 8,
      band: "moderate",
      movementDirection: "increased",
      previewOnly: true,
      persisted: false,
      published: false,
      calibrationAuthority: false,
    });
    expect(result.diagnostics.presentationInputs.confidenceScore).toBe(58);
    expect(result.presentation.canonicalRefs).toEqual({
      interpretation: result.diagnostics.structuredInterpretation.id,
      forecast: result.diagnostics.forecastAssessment.id,
      narrative: result.diagnostics.narrativeAssessment.id,
    });
    expect(result.presentation.hero).toMatchObject({
      title: "Lean tissue rose meaningfully, with fat gain to watch",
      results: expect.arrayContaining([
        expect.objectContaining({ label: "Lean Tissue", value: "+2.5 lb" }),
        expect.objectContaining({ label: "Body Fat", value: "8.3%" }),
      ]),
    });
  });

  it("translates engine conclusions into ordinary briefing language", () => {
    const { presentation } = createSyntheticDexaV2Preview();
    const userFacingText = [
      presentation.hero.title,
      presentation.hero.body,
      presentation.hero.confidence.presentationExplanation,
      ...Object.values(presentation.interpretation),
      ...Object.values(presentation.coachInsight),
    ].join(" ");
    expect(userFacingText).not.toMatch(/objective comparison|durable rate|acceptable lean-to-fat outcome|intended job|trajectory|strong convergence|moderate convergence|directionally supported|assessment quality|adequate coverage|partial coverage|strategy exposure|accepted boundary|observed response|available signals|evidence agreement|remaining uncertainty|limiting factors|objective status|guardrail status|forecast status|forecast direction|attribution uncertainty|next decisive evidence/i);
    expect(presentation.hero.body).not.toBe(presentation.hero.confidence.presentationExplanation);
    expect(presentation.hero.confidence.presentationExplanation).not.toMatch(/2\.5|8\.3|1\.5/);
    expect(presentation.interpretationLabels).toEqual({
      bodyFat: "Body-fat range",
      strategy: "What This Tells Us",
      uncertainty: "What We Still Need to Learn",
    });
    expect(presentation.coachLabels).toEqual({
      biggestWin: "🎉 Biggest Takeaway",
      protect: "💪 Recommendation",
      watch: "👀 What to Watch",
      next: "🎯 Next Actions",
    });
    expect(presentation.hero.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Lean Tissue", emoji: "💪" }),
      expect.objectContaining({ label: "Body Fat", emoji: "📈" }),
    ]));
  });

  it("compresses coaching into concise, conversational, decision-first paragraphs", () => {
    const { presentation } = createSyntheticDexaV2Preview();
    const paragraphs = [
      presentation.hero.body,
      presentation.hero.confidence.presentationExplanation,
      ...Object.values(presentation.interpretation),
      ...Object.values(presentation.coachInsight),
    ];
    const counts = paragraphs.map(sentenceCount);
    expect(Math.max(...counts)).toBeLessThanOrEqual(2);
    expect(counts.reduce((total, count) => total + count, 0) / counts.length).toBeLessThanOrEqual(2);
    expect(Object.values(presentation.coachInsight).join(" ")).toMatch(/exactly the kind|stay exactly where|things to watch|determine whether/i);
    expect(presentation.coachInsight.biggestWin).toMatch(/exactly the kind of first check/i);
    expect(presentation.coachInsight.protect).toMatch(/calories and training stay exactly where they are/i);
  });

  it("keeps every translated Interpretation conclusion factually equivalent", () => {
    const { presentation } = createSyntheticDexaV2Preview();
    expect(presentation.hero.body).toMatch(/lean tissue increased 2\.5 lb.*body fat held at 8\.3%.*fat mass also rose 1\.5 lb/i);
    expect(presentation.interpretation.fatLoss).toMatch(/8\.3%.*no corrective change is needed.*1\.5 lb/i);
    expect(presentation.interpretation.leanMass).toMatch(/lean tissue rose 2\.5 lb.*too early to call all of it permanent muscle.*next scan/i);
    expect(presentation.interpretation.regional).toMatch(/arms, legs, and trunk.*doesn’t change the plan/i);
    expect(presentation.interpretation.phaseMeaning).toMatch(/nothing changes yet.*4\.0 lb.*not to push the surplus/i);
    expect(presentation.interpretation.uncertainty).toMatch(/first follow-up.*hydration, glycogen, and preparation.*September scan/i);
  });

  it("keeps first-person narration out of every user-facing DEXA paragraph", () => {
    const { presentation } = createSyntheticDexaV2Preview();
    const userFacingText = [
      presentation.hero.title,
      presentation.hero.body,
      presentation.hero.confidence.presentationExplanation,
      ...presentation.hero.results.flatMap((result) => [result.label, result.context]),
      ...Object.values(presentation.interpretation),
      ...Object.values(presentation.coachInsight),
    ].join(" ");
    expect(userFacingText).not.toMatch(/\b(?:I|me|my|we|our|us)\b|\b(?:I|we)[’'](?:m|ll|d|re|ve)\b/i);
  });

  it("limits confidence copy to improvement and the next confidence-building evidence", () => {
    const { presentation } = createSyntheticDexaV2Preview();
    const explanation = presentation.hero.confidence.presentationExplanation;
    expect(sentenceCount(explanation)).toBe(2);
    expect(explanation).toMatch(/confidence improved because/i);
    expect(explanation).toMatch(/next consistently prepared DEXA.*raise confidence further/i);
    expect(explanation).not.toMatch(/not higher|isn't higher|is not higher|one scan cannot/i);
  });

  it("uses the production DEXA trend-icon language for rising Body Fat", () => {
    const { presentation } = createSyntheticDexaV2Preview();
    const productionSource = fs.readFileSync(new URL("./DEXAEventNarrativeService.js", import.meta.url), "utf8");
    expect(productionSource).toMatch(/emoji: "📉", label: "Body Fat"/);
    expect(presentation.hero.results.find((result) => result.label === "Body Fat")?.emoji).toBe("📈");
  });

  it("is deterministic, immutable, and structurally isolated from persistence", () => {
    const first = createSyntheticDexaV2Preview();
    const second = createSyntheticDexaV2Preview();
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.presentation)).toBe(true);
    expect(Object.isFrozen(first.phaseReview)).toBe(true);
    expect(first.phaseReview).toMatchObject({
      previewOnly: true,
      recommendation: "begin_next_phase",
      recommendationLabel: "Begin Phase 2 — Lean Mass Build",
      recommendedDurationDays: 14,
      originalReviewDate: "2026-08-15",
      persistence: "none_preview_only",
    });
    expect(() => { first.presentation.hero.title = "changed"; }).toThrow();
    expect(first.diagnostics.mutationSafetyReport).toEqual(expect.objectContaining({
      repositoryAccess: false, publication: false, homeMutation: false,
      briefingHistoryMutation: false, founderMutation: false,
      goalMutation: false, phaseMutation: false, phaseReviewPersistence: false,
      notificationMutation: false, protocolMutation: false,
      july18ArtifactMutation: false,
    }));
    const source = fs.readFileSync(new URL("./SyntheticDEXAV2PreviewService.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/FounderRepositories|createDailyBriefing|\.persist\(|\.publish\(|notifications?\./i);
  });
});

function sentenceCount(value) {
  return [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(value)].length;
}
