import { describe, expect, it } from "vitest";

import { createPairedCalibrationFixtures } from "../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";
import {
  adaptLatestCanonicalCadenceObservationsV3,
  adaptCanonicalPhotoObservations,
  buildProductionConfidenceNarrativeV3Input,
  createCanonicalEvidenceObservationsV3,
} from "./ProductionConfidenceNarrativeV3Adapter.js";
import { runConfidenceNarrativeV3 } from "./v3/ConfidenceNarrativeV3Pipeline.js";
import { selectStrategicallyEligibleEvidenceV3 } from "./v3/EvidenceEligibilityV3.js";
import { createGoalContractV3 } from "./v3/GoalContractV3.js";

describe("production-shaped Goal-generic V3 evidence adapter", () => {
  it("reproduces the reviewed Sep 12 62% to 79% result from canonical DEXA records", () => {
    const fixture = createPairedCalibrationFixtures().dexa;
    const input = buildProductionConfidenceNarrativeV3Input({
      goal: { id: fixture.goalContract.goalId, goalContractV3: fixture.goalContract },
      phase: { id: fixture.goalContract.phase.phaseId },
      store: {
        dexaScans: scans(),
        v3EvidenceObservations: [fixture.observations[1]],
      },
      evidenceCutoff: fixture.evaluationContext.evidenceCutoff,
    });
    const result = runConfidenceNarrativeV3({
      ...fixture,
      goalContract: input.goalContract,
      observations: input.observations,
    });
    expect(result.confidence).toMatchObject({
      priorPercentage: 62,
      currentPercentage: 79,
      delta: 17,
      movement: "increase",
    });
    expect(result.strategicInterpretation).toMatchObject({
      goalAchievement: "in_progress",
      strategyEffectiveness: {
        feasibility: "demonstrated",
        persistence: "emerging",
        attribution: "plausible",
      },
      aggregateGuardrailState: "clear",
    });
  });

  it("uses canonical DEXA measurements and never raw PDF interpretation as authority", () => {
    const fixture = createPairedCalibrationFixtures().dexa;
    const observations = createCanonicalEvidenceObservationsV3({
      goalContract: fixture.goalContract,
      goal: { id: fixture.goalContract.goalId },
      phase: { id: fixture.goalContract.phase.phaseId },
      store: { dexaScans: scans() },
      evidenceCutoff: fixture.evaluationContext.evidenceCutoff,
    });
    const latest = observations.filter((item) => item.sourceType === "canonical_dexa").at(-1);
    expect(latest.capabilities.map((item) => item.capabilityId)).toEqual([
      "body_mass.level",
      "body_composition.lean_mass",
      "body_composition.fat_mass",
      "body_composition.body_fat_percentage",
    ]);
    expect(latest.sourceReferences).toEqual(["dexa_sep12"]);
    expect(JSON.stringify(latest)).not.toMatch(/rawPdf|raw_report|pdf_interpretation/i);
  });

  it("ignores canonical DEXA placeholders that contain no measurements", () => {
    const fixture = createPairedCalibrationFixtures().dexa;
    const observations = createCanonicalEvidenceObservationsV3({
      goalContract: fixture.goalContract,
      goal: { id: fixture.goalContract.goalId },
      phase: { id: fixture.goalContract.phase.phaseId },
      store: {
        dexaScans: [
          { id: "empty_placeholder", measuredAt: "2026-06-20" },
          ...scans(),
        ],
      },
      evidenceCutoff: fixture.evaluationContext.evidenceCutoff,
    });
    expect(observations.filter((item) => item.sourceType === "canonical_dexa")
      .map((item) => item.observationId)).toEqual(["dexa_aug15", "dexa_sep12"]);
  });

  it("uses the accepted canonical Phase strategy revision from the Goal timeline", () => {
    const fixture = createPairedCalibrationFixtures().dexa;
    const input = buildProductionConfidenceNarrativeV3Input({
      goal: {
        id: fixture.goalContract.goalId,
        target: {
          metric: "lean_mass", direction: "increase", unit: "lb",
          baselineValue: 147.5, amount: 10,
        },
        timeline: {
          startDate: "2026-07-18", targetDate: "2026-10-31",
          activePhaseStrategyId: "phase_strategy|accepted|v1",
        },
      },
      phase: {
        id: fixture.goalContract.phase.phaseId,
        startedAt: "2026-08-15",
      },
      store: { dexaScans: scans() },
      evidenceCutoff: fixture.evaluationContext.evidenceCutoff,
    });
    expect(input.goalContract.strategy.strategyRevisionId)
      .toBe("phase_strategy|accepted|v1");
    expect(input.observations.at(-1).strategyRevisionId)
      .toBe("phase_strategy|accepted|v1");
  });

  it("adapts safe legacy guardrails and the latest bound canonical cadence evidence", () => {
    const fixture = createPairedCalibrationFixtures().dexa;
    const goalId = fixture.goalContract.goalId;
    const phaseId = fixture.goalContract.phase.phaseId;
    const assessmentId = "confidence_assessment_v2|weekly";
    const store = {
      dexaScans: scans(),
      goalConfidenceHistory: [{
        assessmentId,
        assessment: { id: assessmentId, goalId, phaseId },
      }],
      dailyBriefings: [{
        id: "weekly_briefing",
        evidenceWindow: { endDate: "2026-09-12" },
        confidencePublication: { assessmentId },
        briefing: { weeklyNarrative: { context: { pi: { observations: [{
          id: "training_exercise_regression",
          domain: "training",
          kind: "training_performance",
          subject: { type: "exercise" },
          status: "regressing",
          direction: "negative",
          evidenceWindow: { startDate: "2026-09-06", endDate: "2026-09-12" },
          confidence: { level: "high" },
          supportingEvidenceIds: ["training_event_regression"],
        }, {
          id: "training_support",
          domain: "training",
          kind: "training_performance",
          subject: { type: "overall" },
          status: "improving",
          direction: "positive",
          evidenceWindow: { startDate: "2026-09-06", endDate: "2026-09-12" },
          confidence: { level: "moderate" },
          supportingEvidenceIds: ["training_event"],
        }] } } } },
      }],
    };
    const input = buildProductionConfidenceNarrativeV3Input({
      goal: {
        id: goalId,
        title: "Configured objective",
        target: { metric: "lean_mass", direction: "increase", unit: "lb",
          baselineValue: 147.5, amount: 10 },
        timeline: { startDate: "2026-07-18", targetDate: "2026-10-31",
          activePhaseStrategyId: "phase_strategy|accepted|v1" },
        guardrails: [{ id: "body_fat", accepted: true,
          text: "Maintain approximately 8–9% body fat." }, {
          id: "strength", accepted: true,
          text: "Avoid sustained strength regression." }, {
          id: "unsupported_text", accepted: true,
          text: "Use judgment about an unstructured constraint." }],
      },
      phase: { id: phaseId, startedAt: "2026-08-15" },
      store,
      evidenceCutoff: "2026-09-18T00:00:00.000Z",
    });
    expect(input.goalContract.guardrails.map((item) => item.guardrailId))
      .toEqual(["body_fat", "strength"]);
    expect(input.goalContract.guardrails[0].evaluation.allowedRange)
      .toMatchObject({ min: 8, max: 9, approximate: true });
    expect(adaptLatestCanonicalCadenceObservationsV3({
      goalContract: input.goalContract,
      phase: { id: phaseId }, store, cutoff: "2026-09-18T00:00:00.000Z",
    })).toHaveLength(1);
    expect(input.observations.find((item) => item.sourceType ===
      "canonical_training_observation")).toMatchObject({
      capabilities: [{ capabilityId: "performance.training_support_index", value: 1 }],
    });
    expect(adaptLatestCanonicalCadenceObservationsV3({
      goalContract: input.goalContract,
      phase: { id: phaseId },
      store: { dailyBriefings: store.dailyBriefings, goalConfidenceHistory: [] },
      cutoff: "2026-09-18T00:00:00.000Z",
    })).toEqual([]);
  });

  it("distinguishes later confirmation, contradiction, no-new-proof, and guardrail breach", () => {
    const fixture = createPairedCalibrationFixtures().dexa;
    const firstInput = productionInput(fixture, scans());
    const first = runConfidenceNarrativeV3({
      ...fixture, goalContract: firstInput.goalContract,
      observations: firstInput.observations,
    });

    const hold = runConfidenceNarrativeV3({
      ...fixture,
      evaluationContext: {
        ...fixture.evaluationContext,
        type: "weekly",
        evaluatedAt: "2026-09-20T00:00:00.000Z",
        evidenceCutoff: "2026-09-20T00:00:00.000Z",
      },
      goalContract: fixture.goalContract,
      observations: [],
      priorInterpretation: first.strategicInterpretation,
      priorCoachingState: first.coachingState,
      priorConfidence: first.confidence,
      priorNarrativePlan: first.narrativePlan,
    });
    expect(hold.strategicInterpretation.strategyEffectiveness)
      .toMatchObject({ feasibility: "demonstrated", persistence: "emerging" });
    expect(hold.confidence.currentPercentage).toBe(79);

    const confirmedInput = productionInput(fixture, [
      ...scans(),
      scan("dexa_oct10", "2026-10-10", 177.2, 155.2, 14.4, 8.1),
    ], "2026-10-11T00:00:00.000Z");
    const confirmed = continueWith(fixture, first, confirmedInput,
      "2026-10-11T00:00:00.000Z");
    expect(confirmed.strategicInterpretation.strategyEffectiveness.persistence)
      .toBe("repeated");

    const contradictedInput = productionInput(fixture, [
      ...scans(),
      scan("dexa_oct10_down", "2026-10-10", 170, 149, 14.5, 8.5),
    ], "2026-10-11T00:00:00.000Z");
    const contradicted = continueWith(fixture, first, contradictedInput,
      "2026-10-11T00:00:00.000Z");
    expect(contradicted.strategicInterpretation.strategyEffectiveness)
      .toMatchObject({ feasibility: "challenged", persistence: "disrupted" });
    expect(contradicted.confidence.currentPercentage)
      .toBeLessThan(first.confidence.currentPercentage);

    const breachedInput = productionInput(fixture, [
      ...scans(),
      scan("dexa_oct10_breach", "2026-10-10", 180, 155.2, 20, 11),
    ], "2026-10-11T00:00:00.000Z");
    const breached = continueWith(fixture, first, breachedInput,
      "2026-10-11T00:00:00.000Z");
    expect(breached.strategicInterpretation.aggregateGuardrailState)
      .toBe("breached");
    expect(breached.confidence.currentPercentage)
      .toBeLessThan(first.confidence.currentPercentage);
  });

  it("keeps irrelevant DEXA distinct from missing relevant evidence", () => {
    const fixture = createPairedCalibrationFixtures().dexa;
    const irrelevantContract = {
      ...fixture.goalContract,
      evidencePolicies: fixture.goalContract.evidencePolicies.filter((policy) =>
        !policy.capabilityPattern.startsWith("body_composition")),
    };
    const observations = createCanonicalEvidenceObservationsV3({
      goalContract: irrelevantContract,
      goal: { id: irrelevantContract.goalId },
      phase: { id: irrelevantContract.phase.phaseId },
      store: { dexaScans: scans() },
      evidenceCutoff: fixture.evaluationContext.evidenceCutoff,
    });
    const eligibility = selectStrategicallyEligibleEvidenceV3({
      goalContract: irrelevantContract,
      observations,
      evidenceCutoff: fixture.evaluationContext.evidenceCutoff,
    });
    expect(eligibility.eligibleObservations).toEqual([]);
    expect(eligibility.excluded.every((item) =>
      item.reason === "no_goal_relative_policy")).toBe(true);
    expect(eligibility.completeness).toBe("missing");
    expect(eligibility.missingSubjects.join(" ")).not.toMatch(/dexa|body_composition/i);
  });
});

describe("Photo V3 ownership boundary", () => {
  it("does not treat photo existence as strategic evidence", () => {
    const fixture = createPairedCalibrationFixtures().dexa;
    expect(adaptCanonicalPhotoObservations({
      goalContract: fixture.goalContract,
      phase: { id: fixture.goalContract.phase.phaseId },
      store: { progressPhotos: [{ id: "photo_only", capturedAt: "2026-09-12" }] },
      cutoff: fixture.evaluationContext.evidenceCutoff,
    })).toEqual([]);
  });

  it("keeps incomparable observations insufficient and comparable observations qualitative", () => {
    const fixture = createPairedCalibrationFixtures().dexa;
    const base = {
      id: "analysis",
      type: "photo",
      observedAt: "2026-09-12T00:00:00.000Z",
      interpretation: {
        structured_observations: [{
          metric: "visual_stability",
          direction: "stable",
          magnitude: "none",
          observation: "The comparable visible areas appear stable.",
        }],
      },
    };
    const incomparable = adaptCanonicalPhotoObservations({
      goalContract: fixture.goalContract,
      phase: { id: fixture.goalContract.phase.phaseId },
      store: { analyses: [base] },
      cutoff: fixture.evaluationContext.evidenceCutoff,
    })[0];
    const comparable = adaptCanonicalPhotoObservations({
      goalContract: fixture.goalContract,
      phase: { id: fixture.goalContract.phase.phaseId },
      store: {
        analyses: [{
          ...base,
          id: "analysis_comparable",
          interpretation: {
            ...base.interpretation,
            comparison_metadata: { comparable: true },
          },
        }],
      },
      cutoff: fixture.evaluationContext.evidenceCutoff,
    })[0];
    expect(incomparable.quality.status).toBe("insufficient");
    expect(comparable).toMatchObject({
      directness: "proxy",
      quality: { status: "adequate", precision: "qualitative" },
    });
    expect(comparable.capabilities[0]).toMatchObject({
      capabilityId: "visual.visual_stability",
      value: "stable",
      change: null,
    });
    expect(JSON.stringify(comparable)).not.toMatch(/body.?fat.?percentage|lean.?mass.?amount/i);
  });

  it("allows an eligible qualitative observation to support Narrative without moving Confidence", () => {
    const fixture = createPairedCalibrationFixtures().dexa;
    const goalContract = createGoalContractV3({
      ...fixture.goalContract,
      evidencePolicies: [
        ...fixture.goalContract.evidencePolicies,
        {
          policyId: "photo_context",
          subjectType: "strategy",
          subjectId: fixture.goalContract.strategy.strategyRevisionId,
          capabilityPattern: "visual.*",
          role: "supporting",
          minimumQuality: "adequate",
          participation: "NARRATIVE_CONTEXT_ONLY",
          usableFor: ["narrative"],
          signalRules: {
            supportsWhen: {
              version: "declarative_predicate_v1",
              path: "measurement.metadata.direction",
              operator: "in",
              values: ["stable", "increased", "decreased"],
            },
            significance: "minor",
          },
        },
      ],
    });
    const first = runConfidenceNarrativeV3({
      ...fixture, goalContract,
    });
    const photo = adaptCanonicalPhotoObservations({
      goalContract,
      phase: { id: goalContract.phase.phaseId },
      store: {
        analyses: [{
          id: "photo_context_analysis",
          type: "photo",
          observedAt: "2026-09-19T00:00:00.000Z",
          interpretation: {
            comparison_metadata: { comparable: true },
            structured_observations: [{
              metric: "visual_stability",
              direction: "stable",
              magnitude: "none",
              observation: "The comparable visible areas remain stable.",
            }],
          },
        }],
      },
      cutoff: "2026-09-20T00:00:00.000Z",
    });
    const followup = runConfidenceNarrativeV3({
      ...fixture,
      goalContract,
      observations: photo,
      evaluationContext: {
        type: "photo_event",
        evidenceCutoff: "2026-09-20T00:00:00.000Z",
        evaluatedAt: "2026-09-20T00:00:00.000Z",
      },
      priorInterpretation: first.strategicInterpretation,
      priorCoachingState: first.coachingState,
      priorConfidence: first.confidence,
      priorNarrativePlan: first.narrativePlan,
    });
    expect(followup.confidence.currentPercentage).toBe(first.confidence.currentPercentage);
    expect(followup.narrativePlan.composition.sections.result)
      .toMatch(/comparable visible areas remain stable/i);
  });
});

function productionInput(fixture, dexaScans, cutoff = fixture.evaluationContext.evidenceCutoff) {
  return buildProductionConfidenceNarrativeV3Input({
    goal: { id: fixture.goalContract.goalId, goalContractV3: fixture.goalContract },
    phase: { id: fixture.goalContract.phase.phaseId },
    store: {
      dexaScans,
      v3EvidenceObservations: [fixture.observations[1]],
    },
    evidenceCutoff: cutoff,
  });
}

function continueWith(fixture, prior, input, at) {
  return runConfidenceNarrativeV3({
    ...fixture,
    goalContract: input.goalContract,
    observations: input.observations,
    evaluationContext: {
      ...fixture.evaluationContext,
      evaluatedAt: at,
      evidenceCutoff: at,
    },
    priorInterpretation: prior.strategicInterpretation,
    priorCoachingState: prior.coachingState,
    priorConfidence: prior.confidence,
    priorNarrativePlan: prior.narrativePlan,
  });
}

function scans() {
  return [
    scan("dexa_aug15", "2026-08-15", 168.3, 148.3, 12.8, 7.6),
    scan("dexa_sep12", "2026-09-12", 174.7, 153.3, 14.2, 8.1),
  ];
}

function scan(id, date, total, lean, fat, bodyFat) {
  return {
    id,
    measuredAt: `${date}T23:59:59.999Z`,
    totalMass: { value: total, unit: "lb" },
    leanMass: { value: lean, unit: "lb" },
    fatMass: { value: fat, unit: "lb" },
    bodyFatPercentage: bodyFat,
    status: "active",
  };
}
