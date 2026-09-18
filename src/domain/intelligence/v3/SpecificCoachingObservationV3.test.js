import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { createEvidenceObservationV3 } from "./EvidenceObservationV3.js";
import { runConfidenceNarrativeV3 } from "./ConfidenceNarrativeV3Pipeline.js";
import {
  deriveCadenceCoachingDetailsV3,
  selectSpecificCoachingObservationsV3,
} from "./SpecificCoachingObservationV3.js";
import { createPairedCalibrationFixtures } from
  "../../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";

describe("V3 specific longitudinal coaching intelligence", () => {
  it("detects a specific Training load milestone", () => {
    const candidates = details([exercisePi({ prs: [{ type: "heaviest_load",
      value: 90, previous_best: 80, unit: "lb" }] })]).candidates;
    expect(candidates).toContainEqual(expect.objectContaining({
      type: "load_milestone",
      narrativeText: "Seated cable row reached 90 lb, up from the previous best of 80 lb.",
    }));
  });

  it("detects the first transition from bodyweight-only to weighted work", () => {
    const value = deriveCadenceCoachingDetailsV3({
      domain: "training",
      rawObservations: [overallPi()],
      evidenceWindow: { startDate: "2026-09-01", endDate: "2026-09-16" },
      canonicalTrainingEvidence: [
        session("bodyweight", "2026-09-02", "Pull-Ups", [
          { reps: 10, weight: "bodyweight", weight_unit: "bodyweight" },
        ], "pull_up"),
        session("weighted", "2026-09-15", "Pull-Ups", [
          { reps: 6, weight: 15, weight_unit: "lb" },
        ], "pull_up"),
      ],
    });
    expect(value.candidates).toContainEqual(expect.objectContaining({
      type: "first_weighted_work",
      subjectLabel: "Pull-Ups",
      evidenceBasis: expect.objectContaining({
        currentSessionId: "weighted",
        priorBodyweightSessionIds: ["bodyweight"],
      }),
    }));
  });

  it("mines longitudinal progression from comparable exposures", () => {
    const value = details([exercisePi({ latest: 1300, previous: 1000,
      percent: 30 })]);
    expect(value.candidates).toContainEqual(expect.objectContaining({
      type: "longitudinal_progression",
      evidenceBasis: expect.objectContaining({ currentValue: 1300,
        previousValue: 1000, percentChange: 30 }),
    }));
  });

  it("recognizes repeated progression rather than a one-session spike", () => {
    const value = details([exercisePi({ exposures: 4, prs: [{
      type: "session_volume", value: 1300, previous_best: 1100, unit: "lb",
    }] })]);
    expect(value.candidates).toContainEqual(expect.objectContaining({
      type: "repeated_progression",
      exposureCount: 4,
    }));
  });

  it("requires at least three comparable exposures before calling a plateau", () => {
    const provisional = details([exercisePi({ status: "plateauing", exposures: 2,
      latest: 1000, previous: 1000, percent: 0 })]).candidates;
    expect(provisional.some((item) => item.type === "sustained_plateau")).toBe(false);
    expect(provisional).toContainEqual(expect.objectContaining({
      type: "provisional_plateau", confidence: "low",
    }));
    expect(details([exercisePi({ status: "plateauing", exposures: 3,
      latest: 1000, previous: 1000, percent: 0 })]).candidates)
      .toContainEqual(expect.objectContaining({ type: "sustained_plateau",
        exposureCount: 3 }));
  });

  it("keeps summarized source-backed percentage detail without inventing values", () => {
    const value = details([exercisePi({ latest: null, previous: null,
      percent: 36.4 })]);
    expect(value.candidates).toContainEqual(expect.objectContaining({
      type: "longitudinal_progression",
      narrativeText: "Seated cable row improved 36.4% from the previous comparable exposure.",
      evidenceBasis: expect.objectContaining({ currentValue: null,
        previousValue: null, percentChange: 36.4, summarizedValuesOnly: true }),
    }));
  });

  it("uses canonical grammatical agreement for plural exercise names", () => {
    const value = details([exercisePi({ id: "pull_up", label: "Pull-Ups",
      status: "improving", exposures: 3, prs: [{ type: "session_volume",
        value: 1300, previous_best: 1100, unit: "lb" }] })]);
    expect(value.candidates).toContainEqual(expect.objectContaining({
      type: "repeated_progression",
      narrativeText: expect.stringMatching(/^Pull-ups have now progressed/),
    }));
  });

  it("compares relative movement only inside a proven relationship or category", () => {
    const value = details([
      exercisePi({ id: "row", label: "Seated Cable Row", category: "Back",
        percent: 5 }),
      exercisePi({ id: "pull_up", label: "Pull-Ups", category: "Back",
        percent: 22 }),
    ]);
    expect(value.candidates).toContainEqual(expect.objectContaining({
      type: "related_movement_contrast",
      evidenceBasis: expect.objectContaining({ relationship: "category:Back" }),
    }));
  });

  it("does not compare unrelated movements", () => {
    const value = details([
      exercisePi({ id: "row", label: "Seated Cable Row", category: "Back",
        percent: 5 }),
      exercisePi({ id: "leg_press", label: "Leg Press", category: "Lower Body",
        percent: 22 }),
    ]);
    expect(value.candidates.some((item) =>
      item.type === "related_movement_contrast")).toBe(false);
  });

  it("keeps observation separate from causal claims", () => {
    const candidate = details([
      exercisePi({ id: "row", label: "Seated Cable Row", category: "Back",
        percent: 5 }),
      exercisePi({ id: "pull_up", label: "Pull-Ups", category: "Back",
        percent: 22 }),
    ]).candidates.find((item) => item.type === "related_movement_contrast");
    expect(candidate.narrativeText).not.toMatch(/caused|because|exercise order|start with/iu);
  });

  it("requires more evidence and explicit policy for a recommendation than an observation", () => {
    const coachingDetails = details([exercisePi({ status: "plateauing",
      exposures: 4, confidence: "high", latest: 1000, previous: 1000,
      percent: 0 })]);
    const ordinary = select({ coachingDetails });
    expect(ordinary.rankedCandidates[0]).toMatchObject({
      narrativeWorthy: true,
      recommendationCapability: { capable: false, mode: "observation_only" },
    });
    const configured = select({ coachingDetails, allowSuggestion: true });
    expect(configured.rankedCandidates[0].recommendationCapability)
      .toMatchObject({ capable: true, mode: "bounded_reversible_suggestion",
        requiresCanonicalStrategyChange: false });
  });

  it("allows internal reasoning evidence to remain unspoken", () => {
    const { event, recurring } = runSpecificSequence({ includeEnergyTension: true });
    expect(recurring.strategicInterpretation.crossDomainSynthesis.tensions)
      .toContainEqual(expect.objectContaining({
        type: "ESTIMATE_VS_OUTCOME_TENSION",
      }));
    expect(recurring.narrativePlan.composition.finalNarrative)
      .not.toMatch(/energy|calorie|expenditure|estimate/iu);
    expect(recurring.confidence.currentPercentage)
      .toBe(event.confidence.currentPercentage);
  });

  it("surfaces a Narrative-worthy observation without changing Confidence", () => {
    const { event, recurring } = runSpecificSequence();
    expect(recurring.narrativePlan.composition.finalNarrative)
      .toContain("Seated cable row reached 90 lb");
    expect(recurring.confidence.currentPercentage)
      .toBe(event.confidence.currentPercentage);
  });

  it("uses communication memory to suppress an unchanged observation", () => {
    const allDetails = details([exercisePi({ prs: [{
      type: "heaviest_load", value: 90, previous_best: 80, unit: "lb",
    }] })]);
    const coachingDetails = { ...allDetails, candidates: allDetails.candidates
      .filter((item) => item.type === "load_milestone") };
    const first = select({ coachingDetails });
    const second = select({ coachingDetails, priorSelection: first });
    expect(first.selected).toHaveLength(1);
    expect(second.selected).toHaveLength(0);
    expect(second.rankedCandidates[0].alreadyCommunicated).toBe(true);
  });

  it("suppresses alternate descriptions of the same subject evidence", () => {
    const coachingDetails = details([exercisePi({ id: "press", label: "Leg Press",
      exposures: 3, prs: [volumePr(1300, 1000)] })]);
    const first = select({ coachingDetails });
    expect(first.selected[0].type).toBe("volume_milestone");
    const second = select({ coachingDetails, priorSelection: first });
    expect(second.selected).toHaveLength(0);
    expect(second.rankedCandidates.filter((item) => item.subjectId === "press")
      .every((item) => item.alreadyCommunicated)).toBe(true);
    expect(second.rankedCandidates.some((item) =>
      item.repeatReason === "same_subject_evidence")).toBe(true);
  });

  it("allows a materially advanced milestone to resurface", () => {
    const first = select({ coachingDetails: details([exercisePi({ prs: [{
      type: "heaviest_load", value: 90, previous_best: 80, unit: "lb",
    }] })]) });
    const advanced = select({ coachingDetails: details([exercisePi({ prs: [{
      type: "heaviest_load", value: 100, previous_best: 90, unit: "lb",
    }] })]), priorSelection: first });
    expect(advanced.selected[0]).toMatchObject({ materiallyAdvanced: true,
      evidenceBasis: expect.objectContaining({ currentValue: 100 }) });
  });

  it("lets Goal-relative evidence role change observation ranking", () => {
    const milestone = details([exercisePi({ prs: [{ type: "heaviest_load",
      value: 90, previous_best: 80, unit: "lb" }] })]);
    const leading = observation("leading", milestone);
    const contextual = observation("contextual", milestone, "context.background");
    const value = selectSpecificCoachingObservationsV3({
      goalContract: contract(), observations: [contextual, leading],
      crossDomainSynthesis: { signals: [
        signal(contextual, "CONTEXTUAL_EVIDENCE"),
        signal(leading, "LEADING_INDICATOR"),
      ] }, evaluationContext: cadenceContext(),
      recommendation: { action: "continue_current_strategy" },
    });
    expect(value.rankedCandidates[0].parentObservationId).toBe("leading");
  });

  it("uses concise no-change coaching when no detail is interesting", () => {
    const fixtures = createPairedCalibrationFixtures();
    const event = runConfidenceNarrativeV3(fixtures.dexa);
    const recurring = runConfidenceNarrativeV3({ ...fixtures.weekly,
      observations: [], priorInterpretation: event.strategicInterpretation,
      priorCoachingState: event.coachingState, priorConfidence: event.confidence,
      priorNarrativePlan: event.narrativePlan });
    expect(recurring.narrativePlan.composition.finalNarrative)
      .toMatch(/nothing here calls for a change/iu);
    expect(recurring.narrativePlan.composition.finalNarrative)
      .not.toMatch(/no items|what changed|what we need next/iu);
  });

  it("selects at most two observations instead of creating a laundry list", () => {
    const coachingDetails = details([
      exercisePi({ id: "row", label: "Row", prs: [volumePr(1300, 1000)] }),
      exercisePi({ id: "press", label: "Press", category: "Chest",
        prs: [volumePr(1400, 1000)] }),
      exercisePi({ id: "curl", label: "Curl", category: "Arms",
        prs: [volumePr(900, 700)] }),
    ]);
    expect(select({ coachingDetails }).selected.length).toBeLessThanOrEqual(2);
  });

  it("does not select two paraphrases of the same exercise evidence", () => {
    const coachingDetails = details([exercisePi({ id: "press", label: "Leg Press",
      category: "Lower Body", exposures: 3,
      prs: [volumePr(1300, 1000)] }), exercisePi({ id: "row",
      label: "Seated Cable Row", category: "Back", percent: 25 })]);
    const selected = select({ coachingDetails }).selected;
    expect(selected).toHaveLength(2);
    expect(new Set(selected.map((item) => item.subjectId)).size).toBe(2);
  });

  it("provides a diverse five-candidate Founder review ranking", () => {
    const coachingDetails = details([
      exercisePi({ id: "press", label: "Leg Press", category: "Lower Body",
        exposures: 3, prs: [volumePr(1300, 1000)] }),
      exercisePi({ id: "row", label: "Seated Cable Row", category: "Back",
        percent: 25 }),
      exercisePi({ id: "pull_up", label: "Pull-Ups", category: "Back",
        percent: 12 }),
      exercisePi({ id: "raise", label: "Front Raises", category: "Shoulders",
        status: "plateauing", exposures: 2, percent: 0 }),
    ]);
    const review = select({ coachingDetails }).reviewCandidates;
    expect(review).toHaveLength(5);
    expect(new Set(review.slice(0, 4).map((item) => item.subjectId)).size).toBe(4);
  });

  it("does not wire the coaching miner into factual evidence pages", () => {
    const sources = [
      "src/app/progress/training/page.js",
      "src/app/progress/nutrition/page.js",
      "src/app/progress/activity/page.js",
      "src/app/progress/weight/page.js",
    ].map((file) => fs.readFileSync(file, "utf8")).join("\n");
    expect(sources).not.toMatch(/SpecificCoachingObservationV3|coachingObservationSelection/u);
  });
});

function details(rawObservations) {
  return deriveCadenceCoachingDetailsV3({ domain: "training",
    rawObservations, evidenceWindow: { startDate: "2026-09-01",
      endDate: "2026-09-16" } });
}

function exercisePi({ id = "row", label = "Seated Cable Row",
  category = "Back", status = "improving", confidence = "moderate",
  exposures = 3, latest = 1200, previous = 1000, percent = 20,
  prs = [] } = {}) {
  const ids = Array.from({ length: exposures }, (_, index) =>
    `${id}_session_${index + 1}`);
  return {
    id: `performance|exercise|${id}`,
    domain: "training", kind: "training_performance",
    subject: { type: "exercise", id, label, category },
    status, direction: status === "improving" ? "positive" : "neutral",
    evidenceWindow: { startDate: "2026-09-01", endDate: "2026-09-16" },
    supportingEvidenceIds: ids,
    confidence: { level: confidence },
    explanationData: {
      last_session: { date: "2026-09-16", session_id: ids.at(-1),
        total_volume: latest, set_count: 4 },
      previous_comparable_session: { date: "2026-09-12",
        session_id: ids.at(-2), total_volume: previous, set_count: 4 },
      volume_trend: { latest, previous, percent_change: percent,
        direction: percent > 5 ? "up" : percent < -5 ? "down" : "flat" },
      pr_detection: { detected: prs.length > 0, prs },
      frequency: { total_sessions: exposures },
    },
  };
}

function overallPi() {
  return { id: "performance|overall|resistance", domain: "training",
    kind: "training_performance", subject: { type: "overall" },
    status: "improving", direction: "positive",
    evidenceWindow: { startDate: "2026-09-01", endDate: "2026-09-16" },
    supportingEvidenceIds: [], confidence: { level: "moderate" },
    explanationData: {} };
}

function session(id, date, name, sets, canonicalExerciseId) {
  return { canonicalId: `canonical_${id}`, payload: { id,
    evidence_type: "training", observed_at: date,
    metadata: { activity_type: "Traditional Strength Training" },
    exercises: [{ id: `${id}_exercise`, name, canonicalExerciseId, sets }] } };
}

function select({ coachingDetails, allowSuggestion = false,
  priorSelection = null } = {}) {
  const item = observation("training", coachingDetails);
  return selectSpecificCoachingObservationsV3({
    goalContract: contract(allowSuggestion), observations: [item],
    crossDomainSynthesis: { signals: [signal(item, "LEADING_INDICATOR")] },
    priorInterpretation: priorSelection ? {
      coachingObservationSelection: priorSelection,
    } : null,
    evaluationContext: cadenceContext(),
    recommendation: { action: "continue_current_strategy" },
  });
}

function observation(id, coachingDetails, capability =
  "performance.training_support_index") {
  return createEvidenceObservationV3({ observationId: id,
    sourceType: "canonical_training_observation", displayLabel: "Training",
    observedAt: "2026-09-16T23:59:59.999Z", directness: "behavioral",
    quality: { status: "adequate" }, coachingDetails,
    capabilities: [{ capabilityId: capability, value: 1,
      factualSummary: "Training supported the plan.",
      metadata: { signalDirection: "supports" } }] });
}

function signal(item, semanticClass) {
  return { observationId: item.observationId, semanticClass,
    direction: "supports" };
}

function contract(allowSuggestion = false) {
  const fixture = createPairedCalibrationFixtures().weekly.goalContract;
  return { ...fixture, coachingObservationPolicy: { training: {
    allowBoundedPlateauSuggestions: allowSuggestion,
    minimumPlateauExposuresForSuggestion: 4,
  } } };
}

function cadenceContext() {
  return { type: "closed_cadence_boundary",
    evaluatedAt: "2026-09-17T00:00:00.000Z" };
}

function runSpecificSequence({ includeEnergyTension = false } = {}) {
  const fixtures = createPairedCalibrationFixtures();
  const event = runConfidenceNarrativeV3(fixtures.dexa);
  const training = observation("specific_training", details([exercisePi({
    prs: [{ type: "heaviest_load", value: 90, previous_best: 80,
      unit: "lb" }],
  })]));
  const observations = [training];
  if (includeEnergyTension) {
    observations.push(createEvidenceObservationV3({
      observationId: "energy_tension", sourceType: "canonical_energy_observation",
      displayLabel: "Energy estimate", observedAt: "2026-09-16T23:59:59.999Z",
      directness: "behavioral", quality: { status: "limited" },
      capabilities: [{ capabilityId: "strategy.energy_balance_estimate",
        value: -400, factualSummary: "The estimate was negative on paper.",
        metadata: { signalDirection: "contradicts" } }],
      limitations: ["limited_coverage"] }));
  }
  const recurring = runConfidenceNarrativeV3({ ...fixtures.weekly,
    observations, priorInterpretation: event.strategicInterpretation,
    priorCoachingState: event.coachingState, priorConfidence: event.confidence,
    priorNarrativePlan: event.narrativePlan,
    evaluationContext: { ...fixtures.weekly.evaluationContext,
      evidenceCutoff: "2026-09-17T00:00:00.000Z",
      evaluatedAt: "2026-09-17T00:00:00.000Z" } });
  return { event, recurring };
}

function volumePr(value, previous_best) {
  return { type: "session_volume", value, previous_best, unit: "lb" };
}
