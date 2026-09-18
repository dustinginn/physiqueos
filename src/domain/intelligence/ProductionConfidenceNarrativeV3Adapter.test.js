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

  it("binds a known single direct assessment to its natural evidence name", () => {
    const fixture = createPairedCalibrationFixtures().dexa;
    const goal = canonicalFallbackGoal(fixture);
    const phase = { id: fixture.goalContract.phase.phaseId,
      name: "Lean Mass Build", startedAt: "2026-08-15" };
    const input = buildProductionConfidenceNarrativeV3Input({
      goal,
      phase,
      store: { dexaScans: scans() },
      evidenceCutoff: fixture.evaluationContext.evidenceCutoff,
    });
    expect(input.goalContract.objectives[0].evaluation).toMatchObject({
      meaningfulChangeThreshold: 0.5,
      significanceBands: [
        { significance: "major", minimumAbsoluteChange: 3 },
        { significance: "meaningful", minimumAbsoluteChange: 0.5 },
        { significance: "minor", minimumAbsoluteChange: 0.1 },
      ],
    });
    expect(input.goalContract.vocabulary).toMatchObject({
      goal: { displayName: "the 10 lb lean-mass goal" },
      objective: { displayName: "lean mass", subject: "you",
        progressVerb: "added", ongoingPhrase: "this kind of progress" },
      phase: { displayName: "Lean Mass Build", contextName: "this build" },
      strategy: { displayName: "the build plan",
        continueAction: "Keep executing consistently",
        reconsiderationTrigger: "if something meaningful changes" },
    });
    expect(input.goalContract.evidenceRequests.find((request) =>
      request.evidencePurpose === "confirm_persistence"))
      .toMatchObject({
        alternatives: [{
          capabilityIds: [
            "body_composition.lean_mass",
            "body_composition.body_fat_percentage",
          ],
          vocabularyKey: "canonical_dexa_assessment",
        }],
      });
    expect(input.goalContract.vocabulary.evidence.requests
      .canonical_dexa_assessment).toEqual({
      displayName: "DEXA",
      grammaticalNumber: "singular",
    });
    expect(input.goalContract.vocabulary.guardrails.body_fat.decimals).toBe(1);
    const result = runConfidenceNarrativeV3({
      ...fixture,
      goalContract: input.goalContract,
      observations: input.observations,
    });
    expect(result.narrativePlan.composition.sections.watch)
      .toContain("The next DEXA is about");
    expect(result.narrativePlan.composition.sections.result)
      .toMatch(/^This is a huge win\./u);
    expect(result.narrativePlan.composition.sections.result)
      .toContain("body fat stayed controlled at 8.1%");
    expect(result.narrativePlan.composition.sections.meaning)
      .toContain("The build plan is clearly working.");
    expect(result.narrativePlan.composition.sections.action)
      .toContain("Stay the course.");
    expect(result.narrativePlan.composition.coachTake)
      .toMatch(/exactly what this build needed/iu);
    expect(result.narrativePlan.nextEvidence)
      .toMatchObject({ displayName: "DEXA", namedFromBinding: true });
  });

  it("keeps unknown and multiple direct-assessment alternatives generic", () => {
    const fixture = createPairedCalibrationFixtures().dexa;
    const phase = { id: fixture.goalContract.phase.phaseId, startedAt: "2026-08-15" };
    const unknown = buildProductionConfidenceNarrativeV3Input({
      goal: {
        id: "future_custom_goal",
        title: "Future Custom Goal",
        target: {
          metric: "launch_index", direction: "increase", unit: "points",
          baselineValue: 0, targetValue: 10,
        },
        timeline: { startDate: "2026-08-15", targetDate: "2026-10-31" },
      },
      phase,
      store: {},
      evidenceCutoff: fixture.evaluationContext.evidenceCutoff,
    });
    expect(unknown.goalContract.evidenceRequests).toEqual([]);
    expect(unknown.goalContract.vocabulary.evidence).toEqual({});

    const goal = canonicalFallbackGoal(fixture);
    goal.evidenceRequestsV3 = [{
      evidencePurpose: "confirm_persistence",
      strategyRevisionId: fixture.goalContract.strategy.strategyRevisionId,
      alternatives: [{
        capabilityIds: ["body_composition.lean_mass"],
        vocabularyKey: "composition_assessment",
      }, {
        capabilityIds: ["performance.load"],
        vocabularyKey: "strength_assessment",
      }],
    }];
    goal.v3Vocabulary = {
      goal: { displayName: goal.title },
      objective: { displayName: "lean mass", ongoingPhrase: "the current response" },
      strategy: { displayName: "the current plan" },
      evidence: { requests: {
        composition_assessment: { displayName: "DEXA", grammaticalNumber: "singular" },
        strength_assessment: { displayName: "strength assessment", grammaticalNumber: "singular" },
      } },
    };
    const multiple = buildProductionConfidenceNarrativeV3Input({
      goal, phase, store: { dexaScans: scans() },
      evidenceCutoff: fixture.evaluationContext.evidenceCutoff,
    });
    const result = runConfidenceNarrativeV3({
      ...fixture,
      goalContract: multiple.goalContract,
      observations: multiple.observations,
    });
    expect(result.narrativePlan.nextEvidence.namedFromBinding).toBe(false);
    expect(result.narrativePlan.composition.sections.watch)
      .toContain("The next check is about");
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
        }, {
          id: "energy_estimate",
          domain: "energy",
          kind: "energy_balance",
          status: "supportive",
          direction: "positive",
          factualSummary: "Reported intake and estimated expenditure were close across the reviewed window.",
          evidenceWindow: { startDate: "2026-09-06", endDate: "2026-09-12" },
          confidence: { level: "moderate" },
          supportingEvidenceIds: ["nutrition_days", "activity_days"],
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
        coachingObservationPolicyV3: { training: {
          allowBoundedPlateauSuggestions: true,
          minimumPlateauExposuresForSuggestion: 5,
        } },
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
    expect(input.goalContract.vocabulary.guardrails).toMatchObject({
      body_fat: { displayName: "body fat", clearDescription: "controlled" },
      strength: { displayName: "training performance",
        riskPhrases: { minimum: "materially declining" } },
    });
    expect(JSON.stringify(input.goalContract.vocabulary))
      .not.toMatch(/support index|falling below 0/iu);
    expect(adaptLatestCanonicalCadenceObservationsV3({
      goalContract: input.goalContract,
      phase: { id: phaseId }, store, cutoff: "2026-09-18T00:00:00.000Z",
    })).toHaveLength(2);
    expect(input.observations.find((item) => item.sourceType ===
      "canonical_training_observation")).toMatchObject({
      capabilities: [{ capabilityId: "performance.training_support_index", value: 1 }],
    });
    expect(input.observations.find((item) => item.sourceType ===
      "canonical_energy_observation")).toMatchObject({
      capabilities: [{ capabilityId: "strategy.energy_balance_estimate" }],
    });
    expect(input.goalContract.evidencePolicies).toEqual(expect.arrayContaining([
      expect.objectContaining({ capabilityPattern: "performance.training_support_index", semanticClass: "LEADING_INDICATOR" }),
      expect.objectContaining({ capabilityPattern: "strategy.energy_balance_estimate", semanticClass: "DERIVED_ESTIMATE" }),
      expect.objectContaining({ capabilityPattern: "body_mass.level", semanticClass: "CONTEXTUAL_EVIDENCE" }),
    ]));
    expect(input.goalContract.coachingObservationPolicy.training).toEqual({
      allowBoundedPlateauSuggestions: true,
      minimumPlateauExposuresForSuggestion: 5,
    });
    expect(adaptLatestCanonicalCadenceObservationsV3({
      goalContract: input.goalContract,
      phase: { id: phaseId },
      store: { dailyBriefings: store.dailyBriefings, goalConfidenceHistory: [] },
      cutoff: "2026-09-18T00:00:00.000Z",
    })).toEqual([]);
  });

  it("adapts canonical Midweek domain sections into Goal-relative V3 observations", () => {
    const paired = createPairedCalibrationFixtures();
    const fixture = paired.weekly;
    const goalId = fixture.goalContract.goalId;
    const phaseId = fixture.goalContract.phase.phaseId;
    const assessmentId = "confidence_assessment_v2|midweek";
    const evidenceWindow = {
      startDate: "2026-09-13", endDate: "2026-09-15",
      cutoff: "2026-09-16T06:59:59.999Z",
    };
    const store = {
      canonicalEvidenceObjects: [
        trainingSession("training_sep13", "2026-09-13", "iso_lateral_high_row",
          "Iso-Lateral High Rows", "Back", 90),
        trainingSession("training_sep14", "2026-09-14", "iso_lateral_high_row",
          "Iso-Lateral High Rows", "Back", 100),
        trainingSession("training_sep15", "2026-09-15", "iso_lateral_high_row",
          "Iso-Lateral High Rows", "Back", 120),
      ],
      goalConfidenceHistory: [{ assessmentId, assessment: { id: assessmentId,
        goalId, phaseId } }],
      dailyBriefings: [{
        id: "midweek_briefing_user_20260913_20260915",
        evidenceWindow,
        confidencePublication: { assessmentId },
        briefing: {
          activeGoal: { id: goalId }, activePhase: { id: phaseId },
          evidenceWindow,
          training: {
            performanceTrend: "improving", sessionsCompleted: 4,
            performanceHeadline: "This window produced measurable training progress",
            interpretation: "Current performance supports the productive environment.",
          },
          energyBalance: {
            comparableDays: 2, estimatedAverageDailyBalance: -454.5,
            balanceDirection: "probably_below", reliability: "limited",
            warnings: ["Nutrition coverage is incomplete."],
          },
          weightContext: {
            observations: 3, averageWeight: 171.6,
            changeFromPriorComparable: 0.4,
          },
          evidenceCompleteness: {
            nutrition: { completeDays: 1, expectedDays: 3 },
            activity: { completeDays: 3, expectedDays: 3 },
            recovery: { completeDays: 0, expectedDays: 3 },
          },
        },
      }],
    };
    const observations = adaptLatestCanonicalCadenceObservationsV3({
      goalContract: fixture.goalContract, phase: { id: phaseId }, store,
      cutoff: evidenceWindow.cutoff,
    });
    expect(observations.map((item) => item.sourceType)).toEqual([
      "canonical_training_observation", "canonical_energy_observation",
      "canonical_nutrition_observation", "canonical_activity_observation",
      "canonical_weight_observation", "canonical_recovery_observation",
    ]);
    expect(observations.find((item) => item.sourceType ===
      "canonical_training_observation")).toMatchObject({
      quality: { status: "adequate" },
      capabilities: [{ capabilityId: "performance.training_support_index",
        value: 1 }],
      coachingDetails: {
        schemaVersion: "coaching_evidence_detail_v3",
        candidates: expect.arrayContaining([
          expect.objectContaining({ subjectId: "iso_lateral_high_row",
            type: expect.stringMatching(/milestone|progression/u) }),
        ]),
      },
    });
    expect(observations.find((item) => item.sourceType ===
      "canonical_energy_observation")).toMatchObject({
      quality: { status: "limited" },
      capabilities: [{ capabilityId: "strategy.energy_balance_estimate",
        value: -454.5 }],
    });
    expect(observations.find((item) => item.sourceType ===
      "canonical_weight_observation")).toMatchObject({
      capabilities: [{ capabilityId: "body_mass.level", value: 171.6 }],
    });
    const event = runConfidenceNarrativeV3(paired.dexa);
    const weekly = runConfidenceNarrativeV3({
      ...paired.weekly,
      priorInterpretation: event.strategicInterpretation,
      priorCoachingState: event.coachingState,
      priorConfidence: event.confidence,
      priorNarrativePlan: event.narrativePlan,
    });
    const midweek = runConfidenceNarrativeV3({
      goalContract: fixture.goalContract, observations,
      priorInterpretation: weekly.strategicInterpretation,
      priorCoachingState: weekly.coachingState,
      priorConfidence: weekly.confidence,
      priorNarrativePlan: weekly.narrativePlan,
      evaluationContext: {
        type: "closed_cadence_boundary", evidenceWindow,
        evidenceCutoff: evidenceWindow.cutoff,
        evaluatedAt: "2026-09-16T07:04:38.549Z",
      },
      surface: "midweek_briefing",
    });
    expect(midweek.confidence).toMatchObject({ currentPercentage: 79, delta: 0 });
    expect(midweek.strategicInterpretation.crossDomainSynthesis.tensions)
      .toContainEqual(expect.objectContaining({
        type: "ESTIMATE_VS_OUTCOME_TENSION",
      }));
    expect(midweek.strategicInterpretation.recommendation.action)
      .toBe("continue_current_strategy");
    expect(midweek.narrativePlan.composition.finalNarrative)
      .toMatch(/Iso-lateral high rows.*Training is still moving/isu);
    expect(midweek.narrativePlan.composition.finalNarrative)
      .not.toMatch(/energy|calorie|estimate alone|direct result|operating evidence/iu);
    expect(midweek.narrativePlan.composition.coachTake)
      .not.toContain(midweek.narrativePlan.composition.sections.result);
    expect(midweek.narrativePlan.composition.finalNarrative).not.toContain("5.0 lb");
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

function canonicalFallbackGoal(fixture) {
  return {
    id: fixture.goalContract.goalId,
    title: "Build Lean Mass",
    target: {
      metric: "lean_mass", direction: "increase", unit: "lb",
      baselineValue: 147.5, amount: 10,
    },
    timeline: {
      startDate: "2026-07-18", targetDate: "2026-10-31",
      activePhaseStrategyId: fixture.goalContract.strategy.strategyRevisionId,
    },
    guardrails: [{
      id: "body_fat", accepted: true,
      text: "Maintain approximately 8–9% body fat.",
    }],
  };
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

function trainingSession(id, date, exerciseId, name, category, load) {
  return {
    id,
    evidence_type: "training",
    observed_at: `${date}T18:00:00.000Z`,
    metadata: { activity_type: "Traditional Strength Training" },
    exercises: [{
      exercise_id: exerciseId,
      name,
      category,
      sets: [
        { set_number: 1, reps: 10, weight: load, weight_unit: "lb" },
        { set_number: 2, reps: 10, weight: load, weight_unit: "lb" },
      ],
    }],
  };
}
