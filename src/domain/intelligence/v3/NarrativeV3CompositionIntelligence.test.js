import { describe, expect, it } from "vitest";

import { createPairedCalibrationFixtures } from
  "../../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";
import { createEvidenceObservationV3 } from "./EvidenceObservationV3.js";
import { createGoalContractV3 } from "./GoalContractV3.js";
import { isSemanticallyEquivalent } from "./V3Runtime.js";
import { resolveEnergyVariabilityBaselineWindow } from "./EnergyVariabilityBaselineV3.js";
import { adaptEnergyObservationsV3 } from "../CadenceEnergyObservationsV3.js";
import { createEnergyPIObservations } from "../../services/EnergyPIObservationService.js";
import { buildCanonicalNarrativeV3Extensions } from "../../services/BriefingV3Projection.js";
import { runConfidenceNarrativeV3 } from "./ConfidenceNarrativeV3Pipeline.js";
import { deriveCadenceCoachingDetailsV3 } from
  "./SpecificCoachingObservationV3.js";
import {
  evaluateSecondMovementNarrativeAllocation,
  findNarrativeV3VoiceViolations,
  NARRATIVE_V3_SECTION_PURPOSES,
} from "./NarrativeV3CompositionService.js";

const INTERNAL_TERMS = /direct result|paired (?:energy )?evidence|current operating evidence|estimate-vs-outcome tension|leading-vs-lagging tension|support index|evidence authority|persistence state|reported intake minus estimated expenditure/iu;

describe("Narrative V3 briefing section intelligence", () => {
  it("assigns an explicit and distinct purpose to every briefing section", () => {
    const { weekly } = pairedSequence();
    expect(weekly.narrativePlan.composition.sectionPurposes)
      .toEqual(NARRATIVE_V3_SECTION_PURPOSES);
    expect(new Set(Object.values(NARRATIVE_V3_SECTION_PURPOSES)).size).toBe(6);
  });

  it("keeps internal reasoning jargon out of Founder-facing coaching", () => {
    const { event, weekly } = pairedSequence();
    const copy = founderCopy(event, weekly);
    expect(copy).not.toMatch(INTERNAL_TERMS);
    expect(findNarrativeV3VoiceViolations(copy)).toEqual([]);
  });

  it("translates paired Energy calculations into a practical coaching implication", () => {
    const { weekly } = pairedSequence();
    expect(weekly.narrativePlan.composition.sections.watch)
      .toMatch(/Energy intake ran a little above the estimate.*keep an eye on body fat/isu);
    expect(weekly.narrativePlan.composition.sections.watch)
      .not.toMatch(/paired|displayed days|estimated expenditure|2,686|2,561|171/iu);
  });

  it("allows internal Energy reconciliation to remain unspoken when it changes no decision", () => {
    const { recurring } = recurringWithDetails({ includeEnergyTension: true });
    expect(recurring.strategicInterpretation.crossDomainSynthesis.tensions)
      .toContainEqual(expect.objectContaining({
        type: "ESTIMATE_VS_OUTCOME_TENSION",
      }));
    expect(founderCopy(recurring)).not.toMatch(/energy|calorie|estimate|expenditure/iu);
  });

  // A movement candidate is a `detail`-scope claim: it is preserved (selected,
  // tracked, available for Training) but does not become the hero merely for
  // being the strongest specific claim — here a `holistic` operating signal
  // ("Training supported the plan.") is also present and wins Result, per
  // the hero scope/salience gate. The movement stays out of the hero, not
  // dropped: it is recorded as an explicitly suppressed candidate with a
  // scope-aware reason, and remains selected in narrativeSalience.
  it("preserves a specific movement observation through composition without letting it dominate a holistic hero", () => {
    const { recurring } = recurringWithDetails({ exercises: [exercisePi({
      id: "leg_press", label: "Leg Press", category: "Lower Body",
      prs: [{ type: "session_volume", value: 13100,
        previous_best: 11000, unit: "lb" }],
    })] });
    const { composition, narrativeSalience } = recurring.narrativePlan;
    expect(composition.sections.result).toBe("Training supported the plan.");
    expect(composition.sectionAllocations.result.scope).toBe("holistic");
    const selected = narrativeSalience.selectedCoachingObservations.find(
      (item) => item.topicKey.includes("leg_press"));
    expect(selected).toBeDefined();
    expect(composition.sectionAllocations.result.suppressedCandidateIds)
      .toContain(selected.candidateId);
    expect(composition.sectionAllocations.result.suppressionReason)
      .toBe("detail_subordinate_to_holistic_claim");
  });

  // Same gate exercised again with a different movement/domain shape: the
  // holistic signal still wins Result, and the movement stays a tracked,
  // explicitly-suppressed candidate rather than the hero.
  it("keeps Result holistic even when the movement's own coaching language would otherwise be natural", () => {
    const { recurring } = recurringWithDetails({ exercises: [exercisePi({
      id: "row", label: "ISO-Lateral High Rows", percent: 36.4,
    })] });
    const { composition, narrativeSalience } = recurring.narrativePlan;
    expect(composition.sections.result).toBe("Training supported the plan.");
    const selected = narrativeSalience.selectedCoachingObservations.find(
      (item) => item.topicKey.includes("row"));
    expect(selected).toBeDefined();
    expect(composition.sectionAllocations.result.suppressedCandidateIds)
      .toContain(selected.candidateId);
    // Not in the hero (Result/meaning) — Confidence's own concrete-evidence
    // reason (Part A2) may still name it elsewhere, which is correct and
    // distinct from promoting it to the hero.
    expect(composition.sections.result).not.toMatch(/ISO-Lateral High Rows/u);
    expect(composition.sections.meaning).not.toMatch(/ISO-Lateral High Rows/u);
  });

  it("does not automatically duplicate Result in Coach's Take", () => {
    const { recurring } = recurringWithDetails();
    const { sections, coachTake } = recurring.narrativePlan.composition;
    expect(coachTake).not.toBe(sections.result);
    expect(coachTake).not.toContain(sections.result);
  });

  it("does not automatically duplicate What To Do in Coach's Take", () => {
    const { recurring } = recurringWithDetails();
    const { sections, coachTake } = recurring.narrativePlan.composition;
    expect(coachTake).not.toBe(sections.action);
    expect(coachTake).not.toContain(sections.action);
  });

  it("does not automatically duplicate What To Watch in Coach's Take", () => {
    const { recurring } = recurringWithDetails();
    const { sections, coachTake } = recurring.narrativePlan.composition;
    expect(coachTake).not.toBe(sections.watch);
    expect(coachTake).not.toContain(sections.watch);
  });

  // Release Blocker 2: with a sufficient historical baseline the Energy
  // variability nudge can now fire for a recurring briefing. It belongs to the
  // Energy statement only; it must not be re-said by Hero/Result, What To Do,
  // What To Watch, or Coach's Take, and must appear exactly once.
  it("keeps the Energy variability nudge in the Energy statement only, never duplicated across Hero/Result/Watch/Coach's Take", () => {
    const { recurring } = recurringWithEnergyVariability();
    const variability = recurring.strategicInterpretation.energyExecution?.variability;
    expect(variability).toMatchObject({ nudgeWarranted: true, dominantDirection: "upward" });
    const { energy } = buildCanonicalNarrativeV3Extensions({
      strategicInterpretation: recurring.strategicInterpretation,
      narrativePlan: recurring.narrativePlan,
    });
    expect(energy.statement).toMatch(/running above plan more often than usual/);
    const composition = recurring.narrativePlan.composition;
    const otherSurfaces = [
      composition.summary, composition.finalNarrative, composition.coachTake,
      ...Object.values(composition.sections),
    ].filter(Boolean);
    for (const text of otherSurfaces) {
      expect(text).not.toMatch(/more often than usual|less predictable|running (?:above|below) plan/iu);
      expect(isSemanticallyEquivalent(energy.statement, text)).toBe(false);
    }
    expect(otherSurfaces.filter((text) => text.includes(energy.statement))).toHaveLength(0);
    // The statement itself says the pattern once, without a repeated clause.
    expect((energy.statement.match(/more often than usual/gu) ?? [])).toHaveLength(1);
  });

  it("does not repeat the recent DEXA conclusion across a recurring briefing", () => {
    const { weekly } = pairedSequence();
    const sections = Object.values(weekly.narrativePlan.composition.sections)
      .concat(weekly.narrativePlan.composition.coachTake);
    const dexaMentions = sections.filter((value) => /DEXA/iu.test(value)).length;
    expect(dexaMentions).toBeLessThanOrEqual(1);
    expect(founderCopy(weekly)).not.toContain("5.0 lb");
  });

  it("preserves the high-density strength of a decisive Event briefing", () => {
    const { event } = pairedSequence();
    expect(event.narrativePlan.composition).toMatchObject({
      sections: {
        result: expect.stringMatching(/^This is a huge win/u),
        meaning: expect.stringMatching(/more than halfway.*plan is clearly working/isu),
        action: expect.stringMatching(/^Stay the course/u),
        watch: expect.stringMatching(/next DEXA.*not whether the plan works/isu),
      },
      coachTake: expect.stringMatching(/exactly what this build needed/iu),
    });
  });

  it("keeps a no-change Midweek concise instead of manufacturing filler", () => {
    const { recurring } = recurringWithDetails({ exercises: [] });
    const composition = recurring.narrativePlan.composition;
    expect(composition.sections.result).toBe("Nothing here calls for a change.");
    expect(founderCopy(recurring)).not.toMatch(/No items|What changed|What we need next/iu);
    expect(composition.paragraphs.every((item) => item.split(/\s+/u).length < 40))
      .toBe(true);
  });

  it("keeps one movement prominent when a second movement is not decision-changing, and keeps Result holistic rather than either movement", () => {
    const { event, recurring } = recurringWithDetails({ exercises: [
      exercisePi({ id: "leg_press", label: "Leg Press", category: "Lower Body",
        prs: [{ type: "session_volume", value: 13100,
          previous_best: 11000, unit: "lb" }] }),
      exercisePi({ id: "row", label: "ISO-Lateral High Rows", percent: 36.4 }),
    ] });
    const selected = recurring.strategicInterpretation
      .coachingObservationSelection.selected;
    // Result: holistic, not either movement — the first movement candidate
    // is explicitly tracked as suppressed, not silently dropped.
    expect(recurring.narrativePlan.composition.sections.result)
      .toBe("Training supported the plan.");
    expect(recurring.narrativePlan.composition.sectionAllocations.result)
      .toMatchObject({ scope: "holistic",
        suppressedCandidateIds: [selected[0].candidateId] });
    // Coach's Take: the second movement is still independently suppressed by
    // its own, unrelated gate (not decision-changing) — unaffected by the
    // Result gate above.
    expect(recurring.narrativePlan.composition.coachTake)
      .not.toMatch(/Leg Press|ISO-Lateral High Rows/iu);
    expect(recurring.narrativePlan.composition.sectionAllocations.coachTake)
      .toMatchObject({
        allocationReason: "second_movement_not_decision_changing",
        suppressedCandidateIds: [selected[1].candidateId],
      });
    expect(recurring.confidence.currentPercentage)
      .toBe(event.confidence.currentPercentage);
  });

  // Production-fixture parity: the exact Sep 20–22 case (Machine Lateral
  // Raise 90 lb / Leg Extensions 90 lb). Both facts remain distinct and
  // selected; neither dominates the hero — Result is the holistic training
  // signal, and both movements are available as structured Training facts
  // (verified here via narrativeSalience/suppressedCandidateIds, since this
  // unit only tests composition, not the full presentation contract).
  it("keeps the frozen 90 lb movements distinct while never letting either dominate the hero", () => {
    const { recurring } = recurringWithDetails({ exercises: [
      exercisePi({ id: "lateral_raise_machine",
        label: "Lateral Raises Machine", date: "2026-09-22",
        prs: [{ type: "heaviest_load", value: 90,
          previous_best: 85, unit: "lb" }] }),
      exercisePi({ id: "leg_extension", label: "Leg Extensions",
        date: "2026-09-21", prs: [{ type: "heaviest_load", value: 90,
          previous_best: 80, unit: "lb" }] }),
    ] });
    const selected = recurring.strategicInterpretation
      .coachingObservationSelection.selected;
    expect(selected.map((item) => [item.subjectId,
      item.evidenceBasis.currentValue, item.evidenceBasis.previousValue]))
      .toEqual([["lateral_raise_machine", 90, 85],
        ["leg_extension", 90, 80]]);
    expect(recurring.narrativePlan.composition.sections.result)
      .toBe("Training supported the plan.");
    expect(recurring.narrativePlan.composition.coachTake)
      .not.toMatch(/Leg Extensions|90 lb/iu);
    expect(founderCopy(recurring)).not.toMatch(/90 lb/u);
    expect(recurring.narrativePlan.composition.sectionAllocations.result)
      .toMatchObject({
        scope: "holistic",
        suppressedCandidateIds: [selected[0].candidateId],
        suppressionReason: "detail_subordinate_to_holistic_claim",
      });
    expect(recurring.narrativePlan.composition.sectionAllocations.coachTake)
      .toMatchObject({
        allocationReason: "second_movement_not_decision_changing",
        suppressedCandidateIds: [selected[1].candidateId],
      });
  });

  it("keeps a single movement out of a holistic Result and uses broad coaching for Coach's Take", () => {
    const { recurring } = recurringWithDetails({ exercises: [exercisePi({
      id: "row", label: "ISO-Lateral High Rows", percent: 20,
      prs: [{ type: "heaviest_load", value: 120,
        previous_best: 100, unit: "lb" }],
    })] });
    expect(recurring.narrativePlan.composition.sections.result)
      .toBe("Training supported the plan.");
    expect(recurring.narrativePlan.composition.coachTake)
      .not.toMatch(/ISO-Lateral High Rows|120 lb/iu);
    expect(recurring.narrativePlan.composition.sectionAllocations.coachTake)
      .toMatchObject({ allocationReason: "broad_synthesis",
        suppressedCandidateIds: [] });
  });

  it("does not promote a bounded plateau into a second movement narrative", () => {
    const { event, recurring } = recurringWithDetails({ exercises: [
      exercisePi({ id: "leg_press", label: "Leg Press", category: "Lower Body",
        prs: [{ type: "session_volume", value: 13100,
          previous_best: 11000, unit: "lb" }] }),
      exercisePi({ id: "row", label: "Seated Cable Row", status: "plateauing",
        exposures: 4, latest: 1000, previous: 1000, percent: 0 }),
    ] });
    expect(recurring.narrativePlan.composition.coachTake)
      .not.toMatch(/Seated Cable Row|flat/iu);
    expect(recurring.narrativePlan.composition.sectionAllocations.coachTake
      .allocationReason).toBe("second_movement_not_decision_changing");
    expect(recurring.strategicInterpretation.recommendation.action)
      .toBe("continue_current_strategy");
    expect(recurring.confidence.currentPercentage)
      .toBe(event.confidence.currentPercentage);
  });

  it("requires every explicit gate before a second movement can be allocated", () => {
    const candidate = { recommendationCapability: { decisionChanging: true } };
    expect(evaluateSecondMovementNarrativeAllocation({ candidate,
      recommendationAction: "change_strategy", goalPhaseMeaning: "Meaning.",
      broadDomainSynthesis: true })).toEqual({ allowed: true,
      reasonCode: "decision_changing" });
    expect(evaluateSecondMovementNarrativeAllocation({ candidate,
      recommendationAction: "continue_current_strategy",
      goalPhaseMeaning: "Meaning.", broadDomainSynthesis: true }))
      .toMatchObject({ allowed: false,
        reasonCode: "second_movement_not_decision_changing" });
    expect(evaluateSecondMovementNarrativeAllocation({ candidate,
      recommendationAction: "change_strategy", goalPhaseMeaning: "Meaning.",
      broadDomainSynthesis: false })).toMatchObject({ allowed: false,
        reasonCode: "broad_domain_synthesis_not_satisfied" });
    expect(evaluateSecondMovementNarrativeAllocation({ candidate,
      recommendationAction: "change_strategy", goalPhaseMeaning: "",
      broadDomainSynthesis: true })).toMatchObject({ allowed: false,
        reasonCode: "goal_phase_meaning_not_satisfied" });
  });

  it("keeps Confidence movement independent from Narrative novelty", () => {
    const first = recurringWithDetails({ exercises: [exercisePi({
      id: "leg_press", label: "Leg Press", category: "Lower Body",
      prs: [{ type: "session_volume", value: 13100,
        previous_best: 11000, unit: "lb" }],
    })] });
    const quiet = recurringWithDetails({ exercises: [] });
    expect(first.recurring.confidence).toMatchObject({ currentPercentage: 79,
      delta: 0 });
    expect(quiet.recurring.confidence).toMatchObject({ currentPercentage: 79,
      delta: 0 });
  });
});

function pairedSequence() {
  const fixtures = createPairedCalibrationFixtures();
  const event = runConfidenceNarrativeV3(fixtures.dexa);
  const weekly = runConfidenceNarrativeV3({ ...fixtures.weekly,
    priorInterpretation: event.strategicInterpretation,
    priorCoachingState: event.coachingState, priorConfidence: event.confidence,
    priorNarrativePlan: event.narrativePlan });
  return { event, weekly };
}

function recurringWithDetails({ exercises = [exercisePi()],
  includeEnergyTension = false } = {}) {
  const fixtures = createPairedCalibrationFixtures();
  const event = runConfidenceNarrativeV3(fixtures.dexa);
  const observations = [];
  if (exercises.length) {
    const coachingDetails = deriveCadenceCoachingDetailsV3({ domain: "training",
      rawObservations: exercises, evidenceWindow: {
        startDate: "2026-09-13", endDate: "2026-09-16" } });
    observations.push(createEvidenceObservationV3({
      observationId: "specific_training", sourceType: "canonical_training_observation",
      displayLabel: "Training", observedAt: "2026-09-16T23:59:59.999Z",
      directness: "behavioral", quality: { status: "adequate" },
      coachingDetails, capabilities: [{
        capabilityId: "performance.training_support_index", value: 1,
        factualSummary: "Training supported the plan.",
        metadata: { signalDirection: "supports" },
      }],
    }));
  }
  if (includeEnergyTension) {
    observations.push(createEvidenceObservationV3({
      observationId: "energy_tension", sourceType: "canonical_energy_observation",
      displayLabel: "Energy estimate", observedAt: "2026-09-16T23:59:59.999Z",
      directness: "behavioral", quality: { status: "limited" },
      limitations: ["limited_coverage"], capabilities: [{
        capabilityId: "strategy.energy_balance_estimate", value: -454.5,
        unit: "kcal/day", factualSummary:
          "Reported intake minus estimated expenditure averaged -454.5 kcal/day.",
        metadata: { signalDirection: "contradicts" },
      }],
    }));
  }
  const recurring = runConfidenceNarrativeV3({ ...fixtures.weekly,
    observations, priorInterpretation: event.strategicInterpretation,
    priorCoachingState: event.coachingState, priorConfidence: event.confidence,
    priorNarrativePlan: event.narrativePlan,
    evaluationContext: { ...fixtures.weekly.evaluationContext,
      evidenceCutoff: "2026-09-16T23:59:59.999Z",
      evaluatedAt: "2026-09-17T00:00:00.000Z" },
    surface: "midweek_briefing" });
  return { event, recurring };
}

// A recurring briefing whose Energy evidence flows through the real per-day
// path (EnergyPIObservationService with a bounded historical baseline ->
// CadenceEnergyObservationsV3) so EnergyVariabilityV3 has a sufficient
// baseline and a repeated upward current pattern.
function recurringWithEnergyVariability() {
  const fixtures = createPairedCalibrationFixtures();
  const event = runConfidenceNarrativeV3(fixtures.dexa);
  const baseContract = fixtures.weekly.goalContract;
  const energyPolicy = baseContract.evidencePolicies
    .find((item) => item.capabilityPattern === "strategy.energy_balance_estimate");
  const goalContract = createGoalContractV3({
    ...baseContract,
    evidencePolicies: [...baseContract.evidencePolicies, ...["execution.energy_intake"].map((pattern) => ({
      ...energyPolicy, policyId: `strategy_${pattern}|test`, capabilityPattern: pattern,
      semanticClass: "EXECUTION_SUPPORT", vocabularyKey: "energy_intake_execution",
      reconciliationGroup: "energy_intake_plan", participation: "NARRATIVE_CONTEXT_ONLY",
      usableFor: ["narrative", "attribution", "execution"],
    }))],
    strategy: { ...fixtures.weekly.goalContract.strategy, energyStrategy: {
      intakeTarget: { value: 2500, unit: "kcal/day" }, activityTarget: { value: 800, unit: "kcal/day" },
      adjustmentAuthorization: "user_required", automaticAdjustmentAllowed: false,
      effectiveAt: "2026-08-01T00:00:00.000Z",
    } },
  });
  const day = (date, kcal) => ({
    date, calorieIntake: kcal, activeCalories: 500, rmr: 1700, estimatedExpenditure: 2200, energyBalance: kcal - 2200,
    nutritionCompleteness: "complete", pairedCompleteness: "complete",
    nutritionAuthority: {
      tier: "full_day_asserted", reliability: "high", energyUsable: true, ambiguity: [],
      mealDetailCompleteness: "complete",
    },
    activitySource: { captureMethod: "device_aggregate", reliability: "high", measurementType: "wearable_estimate" },
  });
  const dates = (from, to) => {
    const out = [];
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 86400000)) out.push(d.toISOString().slice(0, 10));
    return out;
  };
  const window = { startDate: "2026-09-13", endDate: "2026-09-16" };
  const piObservations = createEnergyPIObservations({
    days: dates("2026-09-13", "2026-09-16").map((date) => day(date, 3200)),
    observationWindow: window, semanticHorizon: "midweek",
    baselineDays: dates("2026-08-02", "2026-09-12").map((date) => day(date, 2500)),
    baselineWindow: resolveEnergyVariabilityBaselineWindow(window),
  });
  const observations = adaptEnergyObservationsV3({
    observations: piObservations, goalContract, artifactId: "variability", evidenceCutoff: "2026-09-16T23:59:59.999Z",
  });
  const recurring = runConfidenceNarrativeV3({ ...fixtures.weekly,
    goalContract, observations, priorInterpretation: event.strategicInterpretation,
    priorCoachingState: event.coachingState, priorConfidence: event.confidence,
    priorNarrativePlan: event.narrativePlan,
    evaluationContext: { ...fixtures.weekly.evaluationContext,
      evidenceCutoff: "2026-09-16T23:59:59.999Z", evaluatedAt: "2026-09-17T00:00:00.000Z" },
    surface: "midweek_briefing" });
  return { event, recurring };
}

function exercisePi({ id = "row", label = "Seated Cable Row", category = "Back",
  status = "improving", exposures = 3, latest = 1200, previous = 1000,
  percent = 20, prs = [], date = "2026-09-16" } = {}) {
  const ids = Array.from({ length: exposures }, (_, index) =>
    `${id}_session_${index + 1}`);
  return {
    id: `performance|exercise|${id}`, domain: "training",
    kind: "training_performance",
    subject: { type: "exercise", id, label, category }, status,
    direction: status === "improving" ? "positive" : "neutral",
    evidenceWindow: { startDate: "2026-09-13", endDate: "2026-09-16" },
    supportingEvidenceIds: ids, confidence: { level: "moderate" },
    explanationData: {
      last_session: { date, session_id: ids.at(-1),
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

function founderCopy(...results) {
  return results.map((result) => {
    const composition = result.narrativePlan.composition;
    return `${composition.finalNarrative}\n${composition.coachTake ?? ""}`;
  }).join("\n");
}
