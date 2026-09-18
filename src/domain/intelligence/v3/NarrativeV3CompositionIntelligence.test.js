import { describe, expect, it } from "vitest";

import { createPairedCalibrationFixtures } from
  "../../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";
import { createEvidenceObservationV3 } from "./EvidenceObservationV3.js";
import { runConfidenceNarrativeV3 } from "./ConfidenceNarrativeV3Pipeline.js";
import { deriveCadenceCoachingDetailsV3 } from
  "./SpecificCoachingObservationV3.js";
import {
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

  it("preserves a specific movement observation through composition", () => {
    const { recurring } = recurringWithDetails({ exercises: [exercisePi({
      id: "leg_press", label: "Leg Press", category: "Lower Body",
      prs: [{ type: "session_volume", value: 13100,
        previous_best: 11000, unit: "lb" }],
    })] });
    expect(recurring.narrativePlan.composition.sections.result)
      .toBe("Leg Press set another session-volume best, 19.1% above the previous one.");
  });

  it("uses natural movement-level coaching instead of a generic domain summary", () => {
    const { recurring } = recurringWithDetails({ exercises: [exercisePi({
      id: "row", label: "ISO-Lateral High Rows", percent: 36.4,
    })] });
    expect(founderCopy(recurring)).toMatch(/ISO-Lateral High Rows.*36\.4%/u);
    expect(founderCopy(recurring)).not.toMatch(/upper-body pulling produced|training support remains positive|longitudinal progression detected/iu);
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

  it("lets Coach's Take celebrate a second movement without changing Confidence", () => {
    const { event, recurring } = recurringWithDetails({ exercises: [
      exercisePi({ id: "leg_press", label: "Leg Press", category: "Lower Body",
        prs: [{ type: "session_volume", value: 13100,
          previous_best: 11000, unit: "lb" }] }),
      exercisePi({ id: "row", label: "ISO-Lateral High Rows", percent: 36.4 }),
    ] });
    expect(recurring.narrativePlan.composition.coachTake)
      .toMatch(/ISO-lateral high rows took a nice jump.*worth recognizing/isu);
    expect(recurring.confidence.currentPercentage).toBe(event.confidence.currentPercentage);
  });

  it("lets Coach's Take raise a bounded plateau concern without changing strategy", () => {
    const { event, recurring } = recurringWithDetails({ exercises: [
      exercisePi({ id: "leg_press", label: "Leg Press", category: "Lower Body",
        prs: [{ type: "session_volume", value: 13100,
          previous_best: 11000, unit: "lb" }] }),
      exercisePi({ id: "row", label: "Seated Cable Row", status: "plateauing",
        exposures: 4, latest: 1000, previous: 1000, percent: 0 }),
    ] });
    expect(recurring.narrativePlan.composition.coachTake)
      .toMatch(/Seated cable row has been flat.*does not justify changing the whole plan/isu);
    expect(recurring.strategicInterpretation.recommendation.action)
      .toBe("continue_current_strategy");
    expect(recurring.confidence.currentPercentage).toBe(event.confidence.currentPercentage);
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

function exercisePi({ id = "row", label = "Seated Cable Row", category = "Back",
  status = "improving", exposures = 3, latest = 1200, previous = 1000,
  percent = 20, prs = [] } = {}) {
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

function founderCopy(...results) {
  return results.map((result) => {
    const composition = result.narrativePlan.composition;
    return `${composition.finalNarrative}\n${composition.coachTake ?? ""}`;
  }).join("\n");
}
