import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createMidweekEvidenceWindow } from "./BriefingEvidenceWindowService";
import { composeMidweekBriefingPreview } from "./MidweekBriefingPreviewService";
import { prepareMidweekBriefingReviewPresentation } from "./MidweekBriefingPresentationService";
import { auditPIEditorialVoice } from "./PIEditorialTranslationService";
import { midweekPreviewFixtures } from "../../fixtures/midweekBriefingPreview";

const productionFixture = JSON.parse(fs.readFileSync(new URL(
  "../../../agent-handoffs/fixtures/20260924T051615Z-midweek-slice0-production-lineage-parity.json",
  import.meta.url
), "utf8"));

function presentation() {
  const window = createMidweekEvidenceWindow({
    now: new Date("2026-07-22T19:00:00Z"),
    timeZone: "America/Los_Angeles",
  });
  const briefing = structuredClone(composeMidweekBriefingPreview({
    ...midweekPreviewFixtures.trainingImprovement,
    window,
    generatedAt: "2026-07-22T19:00:00.000Z",
  }));
  briefing.energyBalance.estimatedDailyBalanceMidpoint = -502;
  briefing.training.highlights = [{
    exercise: "Single-Leg Leg Press",
    kind: "Record",
    label: "New volume-load record",
  }];
  briefing.training.watch = [{
    exercise: "Lateral Raises Machine",
    status: "plateauing",
    message: "Lateral Raises Machine has been stable for several sessions.",
  }, {
    exercise: "Pull-Ups",
    status: "plateauing",
    message: "Pull-Ups has been stable for several sessions.",
  }];
  briefing.goalConfidence = {
    score: 59,
    band: "moderate",
    priorScore: 58,
    delta: 1,
    movementDirection: "increased",
    primaryReason: "Confidence increased because the published evidence strengthened the outlook.",
    supportingReasons: ["Evidence is sufficiently complete across interpreted domains."],
    limitingReasons: ["Energy coverage prevents a calibration conclusion."],
  };
  return prepareMidweekBriefingReviewPresentation({
    artifact: { cadence: "midweek", briefing },
  });
}

function v3Presentation() {
  const { artifact, assessment } = v3Source();
  return prepareMidweekBriefingReviewPresentation({ artifact, assessment });
}

function v3Source() {
  const window = createMidweekEvidenceWindow({
    now: new Date("2026-07-22T19:00:00Z"),
    timeZone: "America/Los_Angeles",
  });
  const briefing = structuredClone(composeMidweekBriefingPreview({
    ...midweekPreviewFixtures.trainingImprovement,
    window,
    generatedAt: "2026-07-22T19:00:00.000Z",
  }));
  briefing.hero = {
    verdict: "Canonical V3 headline.",
    summary: "Canonical V3 meaning.",
  };
  briefing.narrativeV3 = {
    summary: "Canonical V3 headline.",
    detail: "Canonical V3 detail.",
    sections: {
      result: "Canonical V3 result.",
      meaning: "Canonical V3 meaning.",
      action: "Canonical V3 action.",
      watch: "Canonical V3 watch.",
      confidence: "Canonical V3 confidence explanation.",
    },
    coachTake: "Canonical V3 coach take.",
  };
  briefing.goalConfidence = {
    score: 79,
    band: "high",
    priorScore: 79,
    delta: 0,
    movementDirection: "held",
    primaryReason: "Canonical V3 confidence explanation.",
    modelVersion: "canonical_confidence_assessment_v3",
    piVersion: "confidence_v3",
  };
  const artifact = {
    id: "midweek-v3",
    cadence: "midweek",
    evidenceWindow: { ...window, id: "midweek-window-v3" },
    goalContext: { goalId: "goal-build", phaseId: "phase-build" },
    confidencePublication: {
      schemaVersion: "briefing_confidence_binding_v3",
      assessmentId: "confidence-v3-midweek",
    },
    briefing,
  };
  briefing.activeGoal = { id: "goal-build", name: "Build Lean Mass" };
  briefing.activePhase = { id: "phase-build", name: "Lean Mass Build" };
  briefing.goalConfidence.assessmentId = "confidence-v3-midweek";
  briefing.narrativeV3.strategicInterpretationId = "interpretation-v3";
  return { artifact, assessment: v3Assessment(artifact) };
}

function v3Assessment(artifact, overrides = {}) {
  return {
    id: artifact.confidencePublication.assessmentId,
    assessmentId: artifact.confidencePublication.assessmentId,
    schemaVersion: "canonical_confidence_assessment_v3",
    briefingArtifactId: artifact.id,
    evidenceWindowId: artifact.evidenceWindow.id,
    goalId: artifact.goalContext.goalId,
    phaseId: artifact.goalContext.phaseId,
    currentPercentage: 79,
    confidenceBand: "high",
    movement: "no_meaningful_change",
    narrativeExplanation: { text: "Canonical V3 confidence explanation." },
    structuredInterpretationId: "interpretation-v3",
    narrativeAssessmentId: "narrative-plan-v3",
    strategicInterpretation: {
      id: "interpretation-v3",
      coachingObservationSelection: { selected: [{
        candidateId: "candidate-result", topicKey: "training|press|heaviest_load",
        subjectId: "press", subjectLabel: "Press",
      }, {
        candidateId: "candidate-coach", topicKey: "training|row|heaviest_load",
        subjectId: "row", subjectLabel: "Row",
      }] },
    },
    narrativePlan: {
      id: "narrative-plan-v3",
      strategicInterpretationId: "interpretation-v3",
      uncertaintyTypes: [],
      composition: { sectionAllocations: {
        result: { topicKeys: ["training|press|heaviest_load"] },
        meaning: { topicKeys: ["goal_implication"] },
        action: { topicKeys: ["recommendation"] },
        watch: { topicKeys: ["energy_ambiguity"] },
        confidence: { topicKeys: ["confidence_movement"] },
        coachTake: { topicKeys: ["training|row|heaviest_load"] },
      } },
    },
    ...overrides,
  };
}

describe("Midweek briefing presentation", () => {
  it("preserves the complete canonical V3 narrative instead of legacy editorial", () => {
    const result = v3Presentation();
    expect(result.presentationModel).toBe("canonical_narrative_v3");
    expect(result.hero).toEqual({
      verdict: "Canonical V3 headline.",
      summary: "Canonical V3 meaning.",
    });
    expect(result.narrativeV3.sections).toEqual({
      result: "Canonical V3 result.",
      meaning: "Canonical V3 meaning.",
      action: "Canonical V3 action.",
      watch: "Canonical V3 watch.",
      confidence: "Canonical V3 confidence explanation.",
    });
    expect(result.coachTake).toEqual({
      biggestTakeaway: "Canonical V3 coach take.",
      recommendation: "Canonical V3 action.",
    });
    expect(result.hero.verdict).not.toBe(
      "Calories are moving closer to supporting stronger training."
    );
  });

  it("fails closed instead of substituting legacy copy for an incomplete V3 publication", () => {
    const { artifact, assessment } = v3Source();
    delete artifact.briefing.narrativeV3.sections.watch;
    expect(() => prepareMidweekBriefingReviewPresentation({ artifact,
      assessment })).toThrow(/requires complete canonical Narrative V3/);
  });

  it("emits one assessment-bound Server presentation contract", () => {
    const result = v3Presentation();
    expect(result.presentationContract).toMatchObject({
      schemaVersion: "midweek_presentation_contract_v1",
      artifactId: "midweek-v3",
      assessmentId: "confidence-v3-midweek",
      lineage: { valid: true, failures: [] },
      lead: {
        headlineClaimId: "candidate-result",
        meaning: "Canonical V3 meaning.",
        confidence: { primarySurface: "lead.confidence", score: 79 },
      },
      suppressed: {
        resultSection: "owned_by_lead_headline",
        meaningSection: "owned_by_lead_meaning",
        confidenceSection: "owned_by_lead_confidence",
        coachTake: "second_movement_not_decision_changing",
      },
    });
    expect(result.presentationContract.coaching.map((item) => item.section))
      .toEqual(["action", "watch"]);
    expect(result.presentationContract.claims.map((item) => item.primarySurface))
      .toEqual(["lead.headline", "lead.meaning", "coaching.action",
        "coaching.watch", "lead.confidence"]);
    expect(new Set(result.presentationContract.claims.map((item) =>
      item.claimId)).size).toBe(result.presentationContract.claims.length);
  });

  it("projects without mutating the frozen artifact or bound assessment", () => {
    const source = v3Source();
    const before = structuredClone(source);
    prepareMidweekBriefingReviewPresentation(source);
    expect(source).toEqual(before);
  });

  it("deduplicates repeated lead meaning and Confidence reason by semantic text", () => {
    const { artifact, assessment } = v3Source();
    artifact.briefing.narrativeV3.sections.meaning =
      artifact.briefing.narrativeV3.summary;
    assessment.narrativeExplanation.text =
      artifact.briefing.narrativeV3.sections.action;
    const contract = prepareMidweekBriefingReviewPresentation({ artifact,
      assessment }).presentationContract;
    expect(contract.lead.meaning).toBeNull();
    expect(contract.lead.meaningClaimId).toBeNull();
    expect(contract.lead.confidence.reason).toBeNull();
    expect(contract.claims.filter((item) => item.kind === "confidence"))
      .toHaveLength(1);
    const visibleText = contract.claims.map((item) => item.text).filter(Boolean);
    expect(new Set(visibleText.map((item) => item.toLowerCase())).size)
      .toBe(visibleText.length);
  });

  it("requires two paired Energy days before including the chart", () => {
    const { artifact, assessment } = v3Source();
    artifact.briefing.energyBalance.chartPoints = [
      { date: "2026-07-19", complete: true },
      { date: "2026-07-20", complete: false },
    ];
    const energy = prepareMidweekBriefingReviewPresentation({ artifact,
      assessment }).presentationContract.modules[0];
    expect(energy).toMatchObject({ id: "energy", included: true,
      pairedDayCount: 1, chartIncluded: false,
      chartReason: "insufficient_paired_days" });
  });

  it.each([
    ["assessment id", ({ assessment }) => { assessment.id = "wrong"; }],
    ["artifact id", ({ assessment }) => {
      assessment.briefingArtifactId = "wrong";
    }],
    ["strategic interpretation", ({ assessment }) => {
      assessment.strategicInterpretation.id = "wrong";
    }],
    ["narrative plan", ({ assessment }) => {
      assessment.narrativePlan.id = "wrong";
    }],
    ["artifact interpretation", ({ artifact }) => {
      artifact.briefing.narrativeV3.strategicInterpretationId = "wrong";
    }],
  ])("fails closed to factual-only modules when %s binding is mutated",
    (_label, mutate) => {
      const source = v3Source();
      mutate(source);
      const result = prepareMidweekBriefingReviewPresentation(source);
      expect(result.presentationModel)
        .toBe("canonical_narrative_v3_factual_fallback");
      expect(result.presentationContract.lineage.valid).toBe(false);
      expect(result.presentationContract.coaching).toEqual([]);
      expect(result.presentationContract.lead.confidence).toBeNull();
      expect(result.goalConfidence).toBeNull();
      expect(result.narrativeV3).toBeNull();
    });

  it("applies the sanitized Sep 20-22 production identities and hierarchy", () => {
    const { artifact } = v3Source();
    const fixture = productionFixture;
    artifact.id = fixture.artifact.artifactId;
    artifact.evidenceWindow.id = fixture.artifact.evidenceWindow.id;
    artifact.goalContext = { goalId: fixture.artifact.goal.id,
      phaseId: fixture.artifact.phase.id };
    artifact.briefing.activeGoal = { id: fixture.artifact.goal.id,
      name: fixture.artifact.goal.name };
    artifact.briefing.activePhase = { id: fixture.artifact.phase.id,
      name: fixture.artifact.phase.name };
    artifact.briefing.energyBalance.chartPoints = [
      { date: "2026-09-20", complete: false },
      { date: "2026-09-21", complete: true },
      { date: "2026-09-22", complete: true },
    ];
    artifact.briefing.weightContext.observations = 3;
    artifact.briefing.training.sessionsCompleted = 2;
    artifact.briefing.narrativeV3.summary =
      fixture.claims.machineLateralRaise90Lb.narrativeText;
    artifact.briefing.narrativeV3.sections.result =
      fixture.claims.machineLateralRaise90Lb.narrativeText;
    artifact.briefing.narrativeV3.coachTake =
      fixture.claims.legExtensions90Lb.narrativeText;
    artifact.confidencePublication.assessmentId = fixture.assessment.assessmentId;
    artifact.briefing.goalConfidence.assessmentId =
      fixture.assessment.assessmentId;
    artifact.briefing.narrativeV3.strategicInterpretationId =
      fixture.assessment.strategicInterpretationId;
    const selected = Object.values(fixture.claims).map((claim) => ({
      candidateId: claim.candidateId,
      topicKey: claim.topicKey,
      subjectId: claim.subjectId,
      subjectLabel: claim.subjectLabel,
    }));
    const allocations = Object.fromEntries(fixture.allocations.map((item) =>
      [item.section, { topicKeys: item.topicKeys } ]));
    const assessment = v3Assessment(artifact, {
      id: fixture.assessment.assessmentId,
      assessmentId: fixture.assessment.assessmentId,
      currentPercentage: fixture.assessment.currentPercentage,
      confidenceBand: "moderate",
      movement: fixture.assessment.movement,
      structuredInterpretationId: fixture.assessment.strategicInterpretationId,
      narrativeAssessmentId: fixture.assessment.narrativePlanId,
      strategicInterpretation: { id: fixture.assessment.strategicInterpretationId,
        coachingObservationSelection: { selected } },
      narrativePlan: { id: fixture.assessment.narrativePlanId,
        strategicInterpretationId: fixture.assessment.strategicInterpretationId,
        uncertaintyTypes: fixture.uncertainty,
        composition: { sectionAllocations: allocations } },
    });
    const result = prepareMidweekBriefingReviewPresentation({ artifact,
      assessment });
    const contract = result.presentationContract;
    expect(contract.lineage.valid).toBe(true);
    expect(contract.lead.headlineClaimId)
      .toBe(fixture.claims.machineLateralRaise90Lb.candidateId);
    expect(contract.suppressed.coachTake)
      .toBe("second_movement_not_decision_changing");
    expect(contract.claims.map((item) => item.candidateId).filter(Boolean))
      .toEqual([fixture.claims.machineLateralRaise90Lb.candidateId]);
    expect(contract.modules.map((item) => [item.id, item.included]))
      .toEqual([["energy", true], ["weight", true],
        ["body_composition", true], ["training", true],
        ["recovery", false]]);
    expect(contract.modules[0]).toMatchObject({ pairedDayCount: 2,
      chartIncluded: true });
    expect(contract.uncertainty.visibleItems).toEqual([]);
    expect(contract.uncertainty.coveredIds).toHaveLength(3);
  });

  it("preserves canonical published confidence without editorial translation", () => {
    const result = presentation();
    expect(result.goalConfidence).toMatchObject({
      score: 59,
      band: "moderate",
      delta: 1,
      movementDirection: "increased",
    });
    expect(result.goalConfidence.primaryReason).toBe(
      "Confidence increased because the published evidence strengthened the outlook."
    );
    expect(result.goalConfidence).not.toHaveProperty("presentationExplanation");
  });

  it("uses a concise headline and keeps the supporting coaching detail", () => {
    const result = presentation();
    expect(result.hero.verdict).toBe(
      "Calories are moving closer to supporting stronger training."
    );
    expect(result.hero.verdict.match(/[.!?]/g)).toHaveLength(1);
    expect(result.hero.verdict.split(/\s+/)).toHaveLength(8);
    expect(result.hero.summary).toMatch(
      /Lower-body training.*slightly below maintenance.*Saturday.*Sunday/i
    );
  });

  it("uses broader coaching language while preserving exact evidence labels", () => {
    const result = presentation();
    const exactMovement = result.training.highlights[0].exercise;
    expect(result.training.interpretation).toBe(
      "Lower-body training produced the week’s strongest performance. That is the kind of progression we want while building muscle."
    );
    expect(result.coachTake.biggestTakeaway).not.toContain(exactMovement);
    expect(result.training.highlights[0].exercise).toBe(exactMovement);
    expect(result.training.highlights[0].label).toBe("New volume-load record");
    expect(auditPIEditorialVoice([
      result.hero.verdict,
      result.hero.summary,
      result.training.interpretation,
      result.coachTake.biggestTakeaway,
      result.coachTake.recommendation,
    ], {
      internalObjectNames: [
        exactMovement,
        "Build Lean Mass",
        "Establish Maintenance",
      ],
    }).passes).toBe(true);
  });

  it("keeps both Watch recommendations while normalizing movement grammar", () => {
    const result = presentation();
    expect(result.training.watch).toHaveLength(2);
    expect(result.training.watch.map((item) => item.exercise)).toEqual([
      "Lateral Raises Machine",
      "Pull-Ups",
    ]);
    expect(result.training.watch.map((item) => item.message)).toEqual([
      "Machine lateral raises have been stable for several sessions. Consider increasing difficulty before adding more of the same work.",
      "Pull-ups have been stable for several sessions. Consider increasing difficulty before adding more of the same work.",
    ]);
  });
});
