import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { createCanonicalPersistenceCommandPorts } from "../../application/commands/CanonicalPersistenceCommandPorts.js";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createHealthKitGraduationReader } from "../../platform/database/HealthKitGraduationReader.js";
import { HealthKitGraduationPurpose } from "./HealthKitGraduation.js";
import { createBriefingCadenceExecutor } from "./BriefingCadenceExecutorService";
import { createBriefingCadenceSettlementGate } from "./BriefingCadenceSettlementGate.js";
import { resolveBriefingCadenceRegistry } from "./BriefingCadenceRegistryService";
import {
  buildEvidenceSettlementWatermarkV1,
  DEFAULT_SETTLEMENT_POLICY,
  evaluateBriefingReadinessV1,
} from "./BriefingEvidenceSettlementPolicy.js";
import { resolveBriefingDueInstant } from "./BriefingScheduleAuthority.js";
import { createMidweekEvidenceWindow } from "./BriefingEvidenceWindowService";
import { composeMidweekBriefingPreview } from "./MidweekBriefingPreviewService";
import { prepareMidweekBriefingReviewPresentation } from "./MidweekBriefingPresentationService";
import { CADENCE_RMR_STRATEGIES, createCadenceEnergyAssessment } from "./CadenceEnergyAssessmentService.js";
import { createEnergyPIObservations } from "./EnergyPIObservationService.js";
import { midweekPreviewFixtures } from "../../fixtures/midweekBriefingPreview";
import nutritionActivity from "../../fixtures/briefingFamilyV3/nutritionActivityDays.json";
import dexaScans from "../../fixtures/briefingFamilyV3/dexaScans.json";
import { prepareMidweekV3 } from "../../testSupport/briefingFamilyV3Harness.js";
import { createPairedCalibrationFixtures } from "../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";
import { createEvidenceObservationV3 } from "../intelligence/v3/EvidenceObservationV3.js";
import { runConfidenceNarrativeV3 } from "../intelligence/v3/ConfidenceNarrativeV3Pipeline.js";
import { deriveCadenceCoachingDetailsV3 } from "../intelligence/v3/SpecificCoachingObservationV3.js";
import {
  findNarrativeV3VoiceViolations,
} from "../intelligence/v3/NarrativeV3CompositionService.js";
import { deepFreeze, isSemanticallyEquivalent } from "../intelligence/v3/V3Runtime.js";

// Part F: integrated, production-shaped acceptance for the combined Server
// candidate (Midweek V3 engine + HealthKit Indoor/Outdoor type fidelity).
//
// Every test here drives REAL modules with data shaped like production:
//  - the sanitized Sep 20-22 Midweek production fixture and the Sep 13-15
//    stored-artifact golden harness (no mocked composition, presentation,
//    settlement policy, gate, reader, ingestion or executor),
//  - HealthKit Activity/Nutrition delivered through the real ingestion
//    command port into a real in-memory canonical store, read back by the real
//    graduation reader and gate, then handed to the real cadence executor.
// Only the *generator* handed to the executor is a thin adapter around the
// real V3 preparation pipeline (the executor's contract is generator-shaped).
// HealthKit-side items live in IntegratedHealthKitProductionShapedAcceptance.test.js.

const OWNER = "user_founder_001";
const TZ = "America/Los_Angeles";

// ---------------------------------------------------------------------------
// Fixtures / builders
// ---------------------------------------------------------------------------

const productionFixture = JSON.parse(fs.readFileSync(new URL(
  "../../../agent-handoffs/fixtures/20260924T051615Z-midweek-slice0-production-lineage-parity.json",
  import.meta.url,
), "utf8"));

// The V3-bound Sep 20-22 Midweek exactly as production stored/served it
// (identities, allocations, claims from the sanitized production fixture).
function sep20to22Source() {
  const f = productionFixture;
  const window = createMidweekEvidenceWindow({ now: new Date("2026-07-22T19:00:00Z"), timeZone: TZ });
  const briefing = structuredClone(composeMidweekBriefingPreview({
    ...midweekPreviewFixtures.trainingImprovement, window, generatedAt: "2026-07-22T19:00:00.000Z",
  }));
  briefing.hero = { verdict: f.claims.machineLateralRaise90Lb.narrativeText, summary: "Canonical V3 meaning." };
  briefing.narrativeV3 = {
    summary: f.claims.machineLateralRaise90Lb.narrativeText,
    detail: "Detail.",
    sections: {
      result: f.claims.machineLateralRaise90Lb.narrativeText,
      meaning: "Canonical V3 meaning.",
      action: "Canonical V3 action.",
      watch: "Canonical V3 watch.",
      confidence: "Canonical V3 confidence explanation.",
    },
    coachTake: f.claims.legExtensions90Lb.narrativeText,
    strategicInterpretationId: f.assessment.strategicInterpretationId,
  };
  briefing.goalConfidence = {
    score: 79, band: "high", priorScore: 79, delta: 0, movementDirection: "held",
    primaryReason: "Canonical V3 confidence explanation.",
    modelVersion: "canonical_confidence_assessment_v3", piVersion: "confidence_v3",
    assessmentId: f.assessment.assessmentId,
  };
  briefing.activeGoal = { id: f.artifact.goal.id, name: f.artifact.goal.name };
  briefing.activePhase = { id: f.artifact.phase.id, name: f.artifact.phase.name };
  briefing.energyBalance.chartPoints = [
    { date: "2026-09-20", complete: false },
    { date: "2026-09-21", complete: true },
    { date: "2026-09-22", complete: true },
  ];
  briefing.weightContext.observations = 3;
  briefing.training.sessionsCompleted = 2;
  const artifact = {
    id: f.artifact.artifactId,
    cadence: "midweek",
    evidenceWindow: { ...window, id: f.artifact.evidenceWindow.id },
    goalContext: { goalId: f.artifact.goal.id, phaseId: f.artifact.phase.id },
    confidencePublication: { schemaVersion: "briefing_confidence_binding_v3", assessmentId: f.assessment.assessmentId },
    briefing,
  };
  const selected = Object.values(f.claims).map((claim) => ({
    candidateId: claim.candidateId, topicKey: claim.topicKey,
    subjectId: claim.subjectId, subjectLabel: claim.subjectLabel,
  }));
  const allocations = Object.fromEntries(f.allocations.map((item) => [item.section, { topicKeys: item.topicKeys }]));
  const assessment = {
    id: f.assessment.assessmentId, assessmentId: f.assessment.assessmentId,
    schemaVersion: "canonical_confidence_assessment_v3",
    briefingArtifactId: artifact.id, evidenceWindowId: artifact.evidenceWindow.id,
    goalId: f.artifact.goal.id, phaseId: f.artifact.phase.id,
    currentPercentage: 79, confidenceBand: "moderate", movement: f.assessment.movement,
    narrativeExplanation: { text: "Canonical V3 confidence explanation." },
    structuredInterpretationId: f.assessment.strategicInterpretationId,
    narrativeAssessmentId: f.assessment.narrativePlanId,
    strategicInterpretation: { id: f.assessment.strategicInterpretationId, coachingObservationSelection: { selected } },
    narrativePlan: {
      id: f.assessment.narrativePlanId, strategicInterpretationId: f.assessment.strategicInterpretationId,
      uncertaintyTypes: f.uncertainty, composition: { sectionAllocations: allocations },
    },
  };
  return { artifact, assessment };
}

// Real Confidence/Narrative V3 pipeline, driven with per-exercise PI shaped
// like production (same construction the composition intelligence suite uses).
function exercisePi({ id = "row", label = "Seated Cable Row", category = "Back", status = "improving",
  exposures = 3, latest = 1200, previous = 1000, percent = 20, prs = [], date = "2026-09-16" } = {}) {
  const ids = Array.from({ length: exposures }, (_, index) => `${id}_session_${index + 1}`);
  return {
    id: `performance|exercise|${id}`, domain: "training", kind: "training_performance",
    subject: { type: "exercise", id, label, category }, status,
    direction: status === "improving" ? "positive" : "neutral",
    evidenceWindow: { startDate: "2026-09-13", endDate: "2026-09-16" },
    supportingEvidenceIds: ids, confidence: { level: "moderate" },
    explanationData: {
      last_session: { date, session_id: ids.at(-1), total_volume: latest, set_count: 4 },
      previous_comparable_session: { date: "2026-09-12", session_id: ids.at(-2), total_volume: previous, set_count: 4 },
      volume_trend: { latest, previous, percent_change: percent, direction: percent > 5 ? "up" : percent < -5 ? "down" : "flat" },
      pr_detection: { detected: prs.length > 0, prs },
      frequency: { total_sessions: exposures },
    },
  };
}

function pr(id, label, value, previous) {
  return exercisePi({ id, label, prs: [{ type: "heaviest_load", value, previous_best: previous, unit: "lb" }] });
}

// `holistic:false` keeps the Training observation (and its movement candidate)
// but supplies no holistic operating-signal sentence, so the hero cannot be
// satisfied by a period-level synthesis and must not fall back to a movement.
function recurringWithDetails({ exercises, holistic = true } = {}) {
  const fixtures = createPairedCalibrationFixtures();
  const event = runConfidenceNarrativeV3(fixtures.dexa);
  const observations = [];
  if (exercises.length) {
    const coachingDetails = deriveCadenceCoachingDetailsV3({
      domain: "training", rawObservations: exercises,
      evidenceWindow: { startDate: "2026-09-13", endDate: "2026-09-16" },
    });
    observations.push(createEvidenceObservationV3({
      observationId: "specific_training", sourceType: "canonical_training_observation",
      displayLabel: "Training", observedAt: "2026-09-16T23:59:59.999Z",
      directness: "behavioral", quality: { status: "adequate" }, coachingDetails,
      capabilities: [{
        capabilityId: "performance.training_support_index", value: 1,
        ...(holistic ? { factualSummary: "Training supported the plan." } : {}),
        metadata: { signalDirection: "supports" },
      }],
    }));
  }
  const recurring = runConfidenceNarrativeV3({
    ...fixtures.weekly, observations,
    priorInterpretation: event.strategicInterpretation, priorCoachingState: event.coachingState,
    priorConfidence: event.confidence, priorNarrativePlan: event.narrativePlan,
    evaluationContext: {
      ...fixtures.weekly.evaluationContext,
      evidenceCutoff: "2026-09-16T23:59:59.999Z", evaluatedAt: "2026-09-17T00:00:00.000Z",
    },
    surface: "midweek_briefing",
  });
  return recurring;
}

let scenarioCache = null;
function scenarios() {
  scenarioCache ??= {
    "Sep 20-22 shape: two 90 lb movement PRs + holistic Training signal": recurringWithDetails({
      exercises: [pr("lateral_raise_machine", "Lateral Raises Machine", 90, 85), pr("leg_extension", "Leg Extensions", 90, 80)],
    }),
    "one incidental movement PR + holistic Training signal": recurringWithDetails({
      exercises: [pr("leg_press", "Leg Press", 13100, 11000)],
    }),
    "incidental movement PR with NO holistic signal": recurringWithDetails({
      exercises: [pr("lateral_raise_machine", "Lateral Raises Machine", 90, 85)], holistic: false,
    }),
    "bounded plateau only": recurringWithDetails({
      exercises: [exercisePi({ id: "row", label: "Seated Cable Row", status: "plateauing", exposures: 4, latest: 1000, previous: 1000, percent: 0 })],
    }),
    "no Training observation at all": recurringWithDetails({ exercises: [] }),
  };
  return scenarioCache;
}

let midweekCache = null;
function preparedMidweekSep13to15() {
  midweekCache ??= prepareMidweekV3();
  return midweekCache;
}

const sha256 = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

// ---------------------------------------------------------------------------
// Item 1: Sep 20-22 format inventory unchanged
// ---------------------------------------------------------------------------

describe("Item 1: Sep 20-22 Midweek format inventory is unchanged", () => {
  it("serves the same section inventory, order and labels as production 01d1900b for the V3-bound Sep 20-22 artifact", () => {
    // Inventory captured by running this exact construction against BOTH the
    // production commit (01d1900b) and this candidate: identical.
    const { artifact, assessment } = sep20to22Source();
    const served = prepareMidweekBriefingReviewPresentation({ artifact, assessment });
    expect(served.presentationModel).toBe("canonical_narrative_v3");
    expect(Object.keys(served).sort()).toEqual([
      "activeGoal", "activePhase", "bodyComposition", "briefingDate", "briefingType", "briefingVersion", "charts",
      "coachTake", "energyBalance", "evidenceCompleteness", "evidenceWindow", "generatedAt", "goalConfidence",
      "guardrailEvaluation", "hero", "id", "narrativeV3", "otherRelevantEvidence", "persistence",
      "presentationContract", "presentationModel", "preview", "prioritiesThroughSunday", "timeZone", "training",
      "unavailableSections", "uncertainty", "warnings", "weightContext",
    ]);
    const contract = served.presentationContract;
    expect(Object.keys(contract)).toEqual([
      "schemaVersion", "artifactId", "assessmentId", "lineage", "lead", "modules", "coaching", "uncertainty",
      "claims", "suppressed",
    ]);
    expect(Object.keys(contract.lead)).toEqual([
      "headlineClaimId", "headline", "meaningClaimId", "meaning", "goal", "phase", "confidence",
    ]);
    // Module inventory + order (Energy, Weight, Body Composition, Training, Recovery).
    expect(contract.modules.map((m) => [m.id, m.payloadKey, m.included, m.order])).toEqual([
      ["energy", "energyBalance", true, 1],
      ["weight", "weightContext", true, 2],
      ["body_composition", "bodyComposition", true, 3],
      ["training", "training", true, 4],
      ["recovery", "recovery", false, 5],
    ]);
    // Coaching section inventory, order and user-facing labels.
    expect(contract.coaching.map((c) => [c.section, c.label, c.primarySurface])).toEqual([
      ["action", "What To Do", "coaching.action"],
      ["watch", "What To Watch", "coaching.watch"],
    ]);
    expect(contract.claims.map((c) => c.primarySurface)).toEqual([
      "lead.headline", "lead.meaning", "coaching.action", "coaching.watch", "lead.confidence",
    ]);
    expect(contract.suppressed).toEqual({
      resultSection: "owned_by_lead_headline",
      meaningSection: "owned_by_lead_meaning",
      confidenceSection: "owned_by_lead_confidence",
      coachTake: "second_movement_not_decision_changing",
    });
    expect(Object.keys(served.hero)).toEqual(["verdict", "summary"]);
    expect(Object.keys(served.coachTake)).toEqual(["biggestTakeaway", "recommendation"]);
    expect(Object.keys(served.goalConfidence).sort()).toEqual([
      "assessmentId", "band", "delta", "modelVersion", "movementDirection", "piVersion", "primaryReason", "priorScore", "score",
    ]);
    // Energy module fields (factual data card); training card fields.
    expect(Object.keys(served.energyBalance).sort()).toEqual([
      "averageActiveEnergy", "averageIntake", "balanceDirection", "balanceHeadline", "chartPoints", "chartTitle",
      "comparableDays", "comparison", "comparisonNarrative", "completeActivityDays", "completeNutritionDays",
      "cumulativeBalance", "estimatedAverageDailyBalance", "estimatedAverageExpenditure",
      "estimatedDailyBalanceMidpoint", "headline", "interpretation", "observedNutritionDays", "reliability",
      "restingEnergyBasis", "rmrProvenance", "totalActiveEnergy", "totalIntake", "warnings",
    ]);
    // The real Sep 20-22 claim identities and hierarchy survive.
    expect(contract.lead.headlineClaimId).toBe(productionFixture.claims.machineLateralRaise90Lb.candidateId);
    expect(contract.lineage.valid).toBe(true);
  });

  it("serves the stored (legacy V2) Sep 13-15 Midweek byte-for-byte as production 01d1900b did", () => {
    // Digest captured from `prepareMidweekBriefingReviewPresentation` on the
    // production commit and on this candidate: identical. Any drift in how a
    // historical (non-V3-bound) briefing is presented flips this hash.
    const storedV2 = JSON.parse(fs.readFileSync(new URL(
      "../../fixtures/briefingFamilyV3/midweekBriefingV2.json", import.meta.url), "utf8"));
    const served = prepareMidweekBriefingReviewPresentation({ artifact: storedV2 });
    const json = JSON.stringify(served);
    expect(json.length).toBe(13379);
    expect(sha256(json)).toBe("ddaa20a9e56466d9b48efabe5f84932bcc0664f952de0365f3487419d4ec1a8c");
    // The V2 path keeps its always-on comparison + RMR methodology sentence;
    // only the V3 projection got the materiality gate.
    expect(served.energyBalance.comparisonNarrative).toBe(
      "Average estimated balance was lower than the prior comparable period by 1,112 kcal/day. Estimated expenditure uses the DEXA RMR available on Sep 12 plus active calories.");
    expect(served).toHaveProperty("coachingDecision");
    expect(served).toHaveProperty("openCoachingThreads");
  });
});

// ---------------------------------------------------------------------------
// Items 2, 3, 5: hero / confidence / coach slots through the real V3 pipeline
// ---------------------------------------------------------------------------

function movementLabels(result) {
  return result.strategicInterpretation.coachingObservationSelection.selected
    .map((item) => item.subjectLabel).filter(Boolean);
}

describe("Item 2: the hero is holistic; an incidental movement PR is never the thesis", () => {
  const withMovement = Object.entries(scenarios()).filter(([name]) => !name.startsWith("no Training"));

  it.each(withMovement)("%s: no movement name, number or candidate reaches Result/headline/meaning", (_name, result) => {
    const composition = result.narrativePlan.composition;
    const labels = movementLabels(result);
    expect(labels.length).toBeGreaterThan(0);
    const hero = [composition.sections.result, composition.headline, composition.sections.meaning].join("\n");
    for (const label of labels) expect(hero.toLowerCase()).not.toContain(label.toLowerCase());
    expect(hero).not.toMatch(/\b\d[\d,]*\s?lb\b/u);
    const allocation = composition.sectionAllocations.result;
    expect(allocation.scope).not.toBe("detail");
    expect(allocation.candidateIds ?? []).toEqual([]);
    // The movement is retained (selected + explicitly suppressed), never silently dropped.
    expect(allocation.suppressedCandidateIds.length).toBeGreaterThan(0);
  });

  it("a movement PR beside a holistic Training signal yields the holistic sentence as the hero", () => {
    const result = scenarios()["one incidental movement PR + holistic Training signal"];
    const { composition } = result.narrativePlan;
    expect(composition.sections.result).toBe("Training supported the plan.");
    expect(composition.sectionAllocations.result).toMatchObject({
      scope: "holistic", suppressionReason: "detail_subordinate_to_holistic_claim",
    });
  });

  it("with NO holistic signal, a non-decision-changing PR still cannot become the hero (falls to the no-change statement)", () => {
    const result = scenarios()["incidental movement PR with NO holistic signal"];
    const { composition } = result.narrativePlan;
    expect(composition.sections.result).toBe("Nothing here calls for a change.");
    expect(composition.sectionAllocations.result).toMatchObject({
      scope: "none", suppressionReason: "detail_not_decision_changing",
    });
    expect(composition.sectionAllocations.result.suppressedCandidateIds).toHaveLength(1);
    expect(composition.sections.meaning).not.toMatch(/Lateral Raises Machine|90 lb/iu);
  });

  it("the hero output budget holds on every scenario (short headline, at most two body sentences)", () => {
    for (const result of Object.values(scenarios())) {
      const { composition } = result.narrativePlan;
      expect(composition.headline.length).toBeLessThanOrEqual(160);
      expect((composition.sections.meaning.match(/[.!?](?:\s|$)/gu) ?? []).length).toBeLessThanOrEqual(2);
    }
  });
});

describe("Item 3: Confidence is concrete and never uses an undefined update phrase", () => {
  const confidenceText = (result) => result.narrativePlan.composition.sections.confidence;
  const UNDEFINED_REFERENT = /\b(?:one|an|this|the) (?:update|signal|evidence item)\b|\ban evidence item\b/iu;

  it.each(Object.entries(scenarios()))("%s: the hold explanation names its concrete subject (or states plainly that nothing changed)", (_name, result) => {
    const text = confidenceText(result);
    expect(text).toMatch(/Confidence holds\./u);
    expect(text).not.toMatch(UNDEFINED_REFERENT);
    expect(findNarrativeV3VoiceViolations(text)).toEqual([]);
    const labels = movementLabels(result);
    if (labels.length) {
      expect(text.toLowerCase()).toContain(labels[0].toLowerCase());
      expect(text).toMatch(/’s recent result does not move the overall goal outlook by itself/u);
    } else {
      expect(text).toMatch(/Confidence holds\. (?:Nothing new changes the outlook for the goal|This check-in does not change the outlook for reaching the goal)\./u);
    }
  });

  it("the deterministic voice guard rejects the retired generic phrasing outright", () => {
    const retired = "Confidence holds. This progress supports the current approach, but one update does not change the overall goal outlook.";
    expect(findNarrativeV3VoiceViolations(retired).some((v) => v.startsWith("engine_language:"))).toBe(true);
    expect(findNarrativeV3VoiceViolations("There is an evidence item to weigh.").some((v) => v.startsWith("engine_language:"))).toBe(true);
  });

  it("a moving Confidence (Sep 13-15 golden, +17) states its concrete evidence, not a generic referent", async () => {
    const prepared = await preparedMidweekSep13to15();
    const text = prepared.narrativePlan.composition.sections.confidence;
    expect(text).toMatch(/added 5\.0 lb of lean mass since August 15/u);
    expect(text).not.toMatch(UNDEFINED_REFERENT);
    const served = prepareMidweekBriefingReviewPresentation({ artifact: prepared.artifact, assessment: prepared.assessment });
    expect(served.presentationContract.lead.confidence.reason).toMatch(/lean mass/u);
    expect(served.presentationContract.lead.confidence.reason).not.toMatch(UNDEFINED_REFERENT);
  });
});

describe("Item 5: Coach slots are distinct, nonempty-or-omitted, and carry no first-person label", () => {
  const SECTION_KEYS = ["result", "meaning", "action", "watch", "confidence"];

  it.each(Object.entries(scenarios()))("%s: Coach's Take is nonempty, distinct from every other slot, in second-person voice", (_name, result) => {
    const { composition } = result.narrativePlan;
    expect(typeof composition.coachTake).toBe("string");
    expect(composition.coachTake.trim().length).toBeGreaterThan(0);
    for (const key of SECTION_KEYS) {
      expect(isSemanticallyEquivalent(composition.coachTake, composition.sections[key]), `coachTake vs ${key}`).toBe(false);
    }
    expect(findNarrativeV3VoiceViolations(composition.coachTake)).toEqual([]);
    // All main slots are pairwise distinct as well.
    const slots = [...SECTION_KEYS.map((key) => composition.sections[key]), composition.coachTake];
    for (let i = 0; i < slots.length; i += 1) {
      for (let j = i + 1; j < slots.length; j += 1) expect(isSemanticallyEquivalent(slots[i], slots[j])).toBe(false);
    }
  });

  it("the served Sep 13-15 contract lists only nonempty, mutually distinct coaching slots with non-first-person labels", async () => {
    const prepared = await preparedMidweekSep13to15();
    const served = prepareMidweekBriefingReviewPresentation({ artifact: prepared.artifact, assessment: prepared.assessment });
    const coaching = served.presentationContract.coaching;
    expect(coaching.length).toBeGreaterThan(0);
    for (const slot of coaching) {
      expect(slot.text.trim().length).toBeGreaterThan(0);
      expect(["What To Do", "What To Watch", "Coach's Take"]).toContain(slot.label);
      expect(findNarrativeV3VoiceViolations(slot.label)).toEqual([]);
    }
    for (let i = 0; i < coaching.length; i += 1) {
      for (let j = i + 1; j < coaching.length; j += 1) {
        expect(isSemanticallyEquivalent(coaching[i].text, coaching[j].text)).toBe(false);
      }
    }
    // Lead surfaces never repeat a coaching slot.
    for (const slot of coaching) {
      expect(isSemanticallyEquivalent(slot.text, served.presentationContract.lead.headline)).toBe(false);
    }
    expect(findNarrativeV3VoiceViolations(served.hero.label)).toEqual([]);
    expect(Object.keys(served.coachTake)).toEqual(["biggestTakeaway", "recommendation"]);
  });

  it("an empty Coach's Take fails closed at the Server contract instead of publishing an empty slot", async () => {
    const prepared = await preparedMidweekSep13to15();
    const artifact = structuredClone(prepared.artifact);
    artifact.briefing.narrativeV3.coachTake = "   ";
    expect(() => prepareMidweekBriefingReviewPresentation({ artifact, assessment: prepared.assessment }))
      .toThrow(/complete canonical Narrative V3/u);
  });

  it("a Coach's Take that merely repeats another slot is omitted from the contract, not duplicated", async () => {
    const prepared = await preparedMidweekSep13to15();
    const artifact = structuredClone(prepared.artifact);
    artifact.briefing.narrativeV3.coachTake = artifact.briefing.narrativeV3.sections.action;
    const served = prepareMidweekBriefingReviewPresentation({ artifact, assessment: prepared.assessment });
    const texts = served.presentationContract.coaching.map((slot) => slot.text);
    expect(new Set(texts).size).toBe(texts.length);
    expect(served.presentationContract.coaching.filter((slot) => slot.section === "coachTake")).toEqual([]);
  });

  it("the Sep 20-22 production hierarchy suppresses a second, non-decision-changing movement from Coach's Take", () => {
    const { artifact, assessment } = sep20to22Source();
    const contract = prepareMidweekBriefingReviewPresentation({ artifact, assessment }).presentationContract;
    expect(contract.coaching.map((slot) => slot.section)).not.toContain("coachTake");
    expect(contract.suppressed.coachTake).toBe("second_movement_not_decision_changing");
  });
});

// ---------------------------------------------------------------------------
// Item 4: Energy is data-first (production-shaped Sep 13-15 Energy evidence)
// ---------------------------------------------------------------------------

describe("Item 4: Energy is data-first, with no metric transcription or pipeline narration", () => {
  const PIPELINE_NARRATION = /pipeline|paired (?:energy )?(?:evidence|days?)|estimate-vs-outcome|reported intake minus|current operating evidence|support index|evidence authority/iu;

  it("the Energy module interpretation adds one incremental sentence and transcribes no figure", async () => {
    const prepared = await preparedMidweekSep13to15();
    const served = prepareMidweekBriefingReviewPresentation({ artifact: prepared.artifact, assessment: prepared.assessment });
    const interpretation = served.energyBalance.interpretation;
    expect(interpretation).toMatch(/^Treat the calorie estimate as directional: /u);
    expect(interpretation).not.toMatch(/\d/u);
    expect(interpretation).not.toMatch(/kcal|averaged|target|of \d+ (?:paired )?days/iu);
    expect(interpretation).not.toMatch(PIPELINE_NARRATION);
    expect((interpretation.match(/[.!?](?:\s|$)/gu) ?? []).length).toBe(1);
    // The figures live in structured data, not prose.
    expect(served.energyBalance.averageIntake).toBeGreaterThan(0);
    expect(served.energyBalance.chartPoints).toHaveLength(3);
    expect(prepared.strategicInterpretation.energyExecution.findings.length).toBeGreaterThan(0);
    expect(prepared.artifact.briefing.narrativeV3.energy.findings.length).toBeGreaterThan(0);
  });

  it("no main narrative slot restates Energy figures or narrates the calculation", async () => {
    const prepared = await preparedMidweekSep13to15();
    const { composition } = prepared.narrativePlan;
    const slots = [composition.sections.result, composition.sections.meaning, composition.sections.action,
      composition.sections.watch, composition.coachTake].join("\n");
    expect(slots).not.toMatch(/kcal/iu);
    expect(slots).not.toMatch(/\b2,?[3-9]\d\d\b/u);
    expect(slots).not.toMatch(PIPELINE_NARRATION);
    expect(composition.sections.watch).not.toContain(composition.energyAmbiguity);
  });

  it("stays silent when nothing beyond the structured data needs saying (no nudge, no ambiguity)", async () => {
    const prepared = await prepareMidweekV3({ energyObservations: [] });
    const served = prepareMidweekBriefingReviewPresentation({ artifact: prepared.artifact, assessment: prepared.assessment });
    expect(prepared.artifact.briefing.narrativeV3.energy ?? null).toBeNull();
    expect(served.energyBalance.interpretation).toBeNull();
  });

  it("gates the prior-period comparison sentence on materiality and the RMR note on a real limitation", async () => {
    const prepared = await preparedMidweekSep13to15();
    const serve = (mutate) => {
      const artifact = structuredClone(prepared.artifact);
      mutate(artifact.briefing.energyBalance);
      return prepareMidweekBriefingReviewPresentation({ artifact, assessment: prepared.assessment }).energyBalance.comparisonNarrative;
    };
    // Material change (well over 150 kcal/day) is stated; RMR source present -> no methodology note.
    expect(serve(() => {})).toBe("Average estimated balance was lower than the prior comparable period by 1,112 kcal/day.");
    // Immaterial change: nothing to say, the numbers already sit in the tiles.
    expect(serve((energy) => { energy.comparison.averageBalance = energy.estimatedAverageDailyBalance + 40; })).toBeNull();
    // Missing RMR source: the limitation is stated once, subordinately, even when the change is immaterial.
    expect(serve((energy) => {
      energy.comparison.averageBalance = energy.estimatedAverageDailyBalance + 40;
      energy.rmrProvenance = { estimated: true, sourceDexaDate: null };
    })).toBe("Estimated expenditure is limited because an eligible RMR source is unavailable.");
  });
});

// ---------------------------------------------------------------------------
// Item 6: a historical artifact is immutable under re-composition / later evidence
// ---------------------------------------------------------------------------

describe("Item 6: a frozen historical artifact is never mutated by re-composition or later evidence", () => {
  it("presentation of a deep-frozen artifact + assessment succeeds (cannot mutate) and is stable across re-composition with different evidence", async () => {
    const original = await preparedMidweekSep13to15();
    const frozenArtifact = deepFreeze(structuredClone(original.artifact));
    const frozenAssessment = deepFreeze(structuredClone(original.assessment));
    const before = JSON.stringify(frozenArtifact);
    const servedBefore = JSON.stringify(prepareMidweekBriefingReviewPresentation({
      artifact: frozenArtifact, assessment: frozenAssessment }));
    const fixtureBefore = sha256(JSON.stringify(nutritionActivity));

    // Later evidence: a complete 3/3 Energy week, and an Energy-less recomposition.
    await prepareMidweekV3({ energyObservations: [] });
    await prepareMidweekV3({ energyObservations: (await settledEnergyWeek()).observations });

    expect(JSON.stringify(frozenArtifact)).toBe(before);
    expect(JSON.stringify(prepareMidweekBriefingReviewPresentation({
      artifact: frozenArtifact, assessment: frozenAssessment }))).toBe(servedBefore);
    expect(sha256(JSON.stringify(nutritionActivity))).toBe(fixtureBefore);
    expect(() => { frozenArtifact.briefing.hero.summary = "rewritten"; }).toThrow(TypeError);
    expect(() => { frozenAssessment.currentPercentage = 1; }).toThrow(TypeError);
  });

  it("re-composing later evidence builds a NEW artifact and leaves the original object untouched", async () => {
    const original = await preparedMidweekSep13to15();
    const snapshot = JSON.stringify({ artifact: original.artifact, assessment: original.assessment });
    const recomposed = await prepareMidweekV3({ energyObservations: (await settledEnergyWeek()).observations });
    expect(recomposed.artifact).not.toBe(original.artifact);
    expect(recomposed.strategicInterpretation.energyExecution.estimate.pairing.pairedDayCount).toBe(3);
    // Same 3/3 pairing, but the settled HealthKit day upgrades intake authority; the original keeps its own.
    expect(original.strategicInterpretation.energyExecution.estimate.intakeEvidence.byTier)
      .toEqual({ meal_derived_unverified: 3 });
    expect(recomposed.strategicInterpretation.energyExecution.estimate.intakeEvidence.byTier)
      .toEqual({ full_day_asserted: 3 });
    expect(JSON.stringify({ artifact: original.artifact, assessment: original.assessment })).toBe(snapshot);
  });

  it("the settlement watermark is deeply immutable and unaffected by later readiness changes", () => {
    const partial = { present: true, coverage: "partial_day", canonicalRecordId: "n", revision: 1 };
    const readiness = evaluateBriefingReadinessV1({
      domainStates: { activity: { present: true, coverage: "complete_day", canonicalRecordId: "a", revision: 1 }, nutrition: partial } });
    const decision = { reasonCode: "hard_deadline_reached", unsettledDomains: ["nutrition"] };
    const watermark = buildEvidenceSettlementWatermarkV1({
      evidenceWindow: { startDate: "2026-09-13", endDate: "2026-09-15", nested: { tags: ["a"] } },
      readiness, publishDecision: decision, generatedAt: "2026-09-16T18:00:00.000Z" });
    const before = JSON.stringify(watermark);
    // Later evidence settles the domain; a fresh readiness evaluation moves on, the frozen record must not.
    const later = evaluateBriefingReadinessV1({
      domainStates: { activity: { present: true, coverage: "complete_day", canonicalRecordId: "a", revision: 1 },
        nutrition: { present: true, coverage: "complete_day", canonicalRecordId: "n", revision: 2 } } });
    decision.unsettledDomains.push("activity");
    expect(later.ready).toBe(true);
    expect(JSON.stringify(watermark)).toBe(before);
    expect(watermark.readyAtGeneration).toBe(false);
    expect(() => { watermark.readyAtGeneration = true; }).toThrow(TypeError);
    expect(() => { watermark.domains.nutrition.coverage = "complete_day"; }).toThrow(TypeError);
    expect(() => { watermark.evidenceWindow.nested.tags.push("z"); }).toThrow(TypeError);
    expect(() => { watermark.unsettledDomainsAtGeneration.push("z"); }).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// HealthKit-backed settlement world (real ingestion -> real store -> real
// reader -> real gate -> real executor)
// ---------------------------------------------------------------------------

const DAILY_POLICY_ID = "healthkit_canonical_daily_activation_policy";
const GRADUATION_POLICY_ID = "healthkit_canonical_graduation_policy";
const POLICY_START = "2026-09-13";

function hkStore() {
  return createInMemoryCanonicalRecordStore({
    user: [{ id: OWNER, timeZone: TZ, version: 1 }],
    healthKitObservations: [],
    healthKitCanonicalDays: [],
    healthKitConfiguration: [{
      id: DAILY_POLICY_ID, schemaVersion: "healthkit-canonical-activation-policy-v1", status: "enabled",
      domains: ["activity", "nutrition"], effectiveLocalDate: POLICY_START, openEnded: true,
      strategicEvidenceEligibility: "quarantined", historicalBackfill: false, version: 1,
    }, {
      id: GRADUATION_POLICY_ID, schemaVersion: "healthkit-canonical-graduation-policy-v1",
      projection: { enabled: true, domains: ["activity", "nutrition"], startLocalDate: POLICY_START, endLocalDate: null },
      evidenceEligibility: { enabled: true, domains: ["activity", "nutrition"], startLocalDate: POLICY_START, endLocalDate: null },
      historicalBackfill: false,
    }],
    canonicalEvidenceObjects: [],
    evidencePackages: [],
  });
}

const hkSource = () => ({ bundleIdentifier: "com.apple.Health", sourceName: "Apple Health", productType: "iPhone17,1" });
const activityObservation = (date, calories, { revision = 1, coverage = "complete_day" } = {}) => ({
  observationType: "activity_summary", externalId: `activity-summary:${date}`, source: hkSource(),
  occurrence: { localDate: date, timeZone: TZ, utcOffsetSeconds: -25200 },
  activitySummary: {
    aggregationScope: "daily_total_including_workouts", coverage, sourceRevision: revision,
    dailyActivity: { move_calories: calories, exercise_minutes: 50, stand_hours: 11 },
  },
});
const fixtureTotals = (date) => nutritionActivity.nutritionDays
  .find((day) => day.canonicalId === `nutrition|${date}|nutrition-day`)?.payload.daily_totals ?? {};
const nutritionObservation = (date, calories, { revision = 1, coverage = "complete_day" } = {}) => ({
  observationType: "nutrition_daily_total", externalId: `nutrition-daily-total:${date}`, source: hkSource(),
  occurrence: { localDate: date, timeZone: TZ, utcOffsetSeconds: -25200 },
  nutritionDailyTotal: {
    aggregationScope: "daily_total_all_sources", coverage, sourceRevision: revision,
    // Macros come from the same day's recorded totals so HealthKit agrees with the logged day.
    dailyNutrition: {
      calories, protein_g: fixtureTotals(date).protein_g ?? 180,
      carbs_g: fixtureTotals(date).carbs_g ?? 200, fat_g: fixtureTotals(date).fat_g ?? 70,
    },
  },
});

let batchCounter = 0;
async function ingest(records, observations, receivedAt = "2026-09-16T10:30:00.000Z") {
  batchCounter += 1;
  const result = await createCanonicalPersistenceCommandPorts({ records, now: () => new Date(receivedAt) })
    .ingestHealthKitObservations({
      ownerUserId: OWNER,
      principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
      metadata: { clientOccurredAt: receivedAt, clientTimeZone: TZ, idempotencyKey: `part-f-key-${batchCounter}` },
      payload: { batchId: `part-f-batch-${batchCounter}`, observations },
    });
  expect(result.status === "accepted" || result.status === "committed" || result.result?.status === "accepted").toBe(true);
  return result;
}

const MIDWEEK_DAYS = [["2026-09-13", 994, 2285], ["2026-09-14", 948, 2442], ["2026-09-15", 824, 2484]];

// Sun-Tue HealthKit week ingested through the real command port. `finalNutrition`
// selects the final day's Nutrition state: "complete_day", "partial_day" or
// null (never delivered).
async function ingestMidweekWeek(records, { finalNutrition = "complete_day", finalActivity = "complete_day" } = {}) {
  const observations = [];
  for (const [index, [date, activity, nutrition]] of MIDWEEK_DAYS.entries()) {
    const last = index === MIDWEEK_DAYS.length - 1;
    const activityCoverage = last ? finalActivity : "complete_day";
    const nutritionCoverage = last ? finalNutrition : "complete_day";
    if (activityCoverage) observations.push(activityObservation(date, activity, { coverage: activityCoverage }));
    if (nutritionCoverage) observations.push(nutritionObservation(date, nutrition, { coverage: nutritionCoverage }));
  }
  return ingest(records, observations);
}

// 3/3 Energy week from settled HealthKit evidence: the real graduation overlay
// on top of the ordinary (manual/screenshot) evidence, then the real Energy
// assessment and PI observation builders.
let settledWeekPromise = null;
function settledEnergyWeek() {
  settledWeekPromise ??= (async () => {
    const records = hkStore();
    await ingestMidweekWeek(records);
    const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
    const ordinary = [...nutritionActivity.activityDays, ...nutritionActivity.nutritionDays];
    const overlaid = await reader.overlay(ordinary, { purpose: HealthKitGraduationPurpose.EVIDENCE, keepDateOrder: true });
    const isActivity = (object) => (object.evidence_type ?? object.payload?.evidence_type) === "activity_day";
    const window = { startDate: "2026-09-13", endDate: "2026-09-15", timeZone: TZ };
    const comparisonWindow = { startDate: "2026-09-06", endDate: "2026-09-12", timeZone: TZ };
    const input = {
      cadence: "midweek", timeZone: TZ,
      nutritionDays: overlaid.filter((object) => !isActivity(object)),
      activityDays: overlaid.filter(isActivity),
      dexaScans, rmrStrategy: CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW,
    };
    const current = createCadenceEnergyAssessment({ ...input, window, comparisonWindow });
    const comparison = createCadenceEnergyAssessment({ ...input, window: comparisonWindow });
    const observations = createEnergyPIObservations({
      days: [...comparison.dailyRecords, ...current.dailyRecords],
      observationWindow: { ...window }, comparisonWindow, semanticHorizon: "midweek", includeInsufficientData: true,
    });
    return { records, current, observations };
  })();
  return settledWeekPromise;
}

// Unsettled reality: the original Sep 13-15 evidence (2 of 3 Nutrition days).
function unsettledEnergyObservations() {
  const window = { startDate: "2026-09-13", endDate: "2026-09-15", timeZone: TZ };
  const comparisonWindow = { startDate: "2026-09-06", endDate: "2026-09-12", timeZone: TZ };
  const input = {
    cadence: "midweek", timeZone: TZ, nutritionDays: nutritionActivity.nutritionDays,
    activityDays: nutritionActivity.activityDays, dexaScans, rmrStrategy: CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW,
  };
  const current = createCadenceEnergyAssessment({ ...input, window, comparisonWindow });
  const comparison = createCadenceEnergyAssessment({ ...input, window: comparisonWindow });
  return createEnergyPIObservations({
    days: [...comparison.dailyRecords, ...current.dailyRecords], observationWindow: { ...window },
    comparisonWindow, semanticHorizon: "midweek", includeInsufficientData: true,
  });
}

function cadenceRepositories({ artifacts }) {
  const protocol = { id: "briefings", protocolType: "briefings", currentVersionId: "briefings-v1" };
  return {
    users: {
      getCurrentUser: vi.fn(async () => ({ id: OWNER, timeZone: TZ })),
      getUserById: vi.fn(async () => ({ id: OWNER, timeZone: TZ })),
    },
    protocols: { listActiveProtocols: vi.fn(async () => [protocol]) },
    protocolVersions: {
      getCurrentVersion: vi.fn(async () => ({
        id: "briefings-v1", protocolId: "briefings", effectiveAt: "2026-07-01",
        coachingUpdates: {
          schemaVersion: "coaching_updates_schedule_v1", timeZone: TZ,
          midweek: { enabled: true, day: "wednesday", localTime: "00:00" },
          weekly: { enabled: true, day: "sunday", localTime: "00:00" },
          daily: { enabled: false }, notificationPreference: "available_without_notification",
        },
      })),
    },
    goals: { getActiveGoal: vi.fn(async () => null) },
    dailyBriefings: {
      getBriefingByEvidenceWindow: vi.fn(async (_userId, windowId) =>
        artifacts.find((artifact) => artifact.evidenceWindow?.id === windowId) ?? null),
    },
  };
}

// Real executor + real gate + real reader over `records`. The Midweek generator
// runs the REAL V3 preparation pipeline on the supplied Energy observations and
// "stores" the resulting artifact the way the persistence layer would.
function cadenceWorld({ records, energyObservations, monthlyStub = null }) {
  const artifacts = [];
  const executionRecords = [];
  const info = vi.fn();
  const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
  const realGate = createBriefingCadenceSettlementGate({ healthKitGraduationReader: reader });
  const gate = { beginTick: vi.fn(() => realGate.beginTick()), evaluate: vi.fn((args) => realGate.evaluate(args)) };
  const prepared = [];
  const midweek = { generateForCurrentWindow: vi.fn(async () => {
    const result = await prepareMidweekV3({ energyObservations: energyObservations() });
    prepared.push(result);
    const artifact = structuredClone(result.artifact);
    artifact.lifecycle = { ...(artifact.lifecycle ?? {}), generationStatus: "completed" };
    artifacts.push(artifact);
    return { state: "completed", artifact, idempotent: false };
  }) };
  const generators = {
    midweek,
    weekly: { generateForCurrentWindow: vi.fn(async () => ({ state: "completed", artifact: { id: "weekly" } })) },
    monthly: monthlyStub ?? { generateForCurrentWindow: vi.fn(async () => ({ state: "completed", artifact: { id: "monthly" } })) },
  };
  const repositories = cadenceRepositories({ artifacts });
  const executor = createBriefingCadenceExecutor({
    repositories, generators, settlementGate: gate, logger: { info },
    executionStore: {
      createExecutionId: () => `run-${executionRecords.length}`,
      async record(record) { executionRecords.push(record); },
      async getRetryState() {
        return { terminalFailure: false, consecutiveTransientFailures: 0, lastFailureAt: null, lastFailureCategory: null };
      },
    },
    executionLock: { async acquire() { return { acquired: true, async release() {} }; } },
    source: "part-f-acceptance",
  });
  return {
    records, reader, gate, artifacts, executionRecords, info, generators, repositories, prepared,
    async run(asOfIso) {
      const result = await executor.execute({ asOf: new Date(asOfIso) });
      return { result, midweek: result.outcomes.find((o) => o.cadenceKey === "midweek"),
        monthly: result.outcomes.find((o) => o.cadenceKey === "monthly") };
    },
  };
}

const MIDWEEK_DUE = resolveBriefingDueInstant({ localDate: "2026-09-16", timeZone: TZ });
const at = (minutesAfterDue) => new Date(MIDWEEK_DUE.valueOf() + minutesAfterDue * 60_000).toISOString();
const DEADLINE_MINUTES = DEFAULT_SETTLEMENT_POLICY.maximumWaitMinutes;

// ---------------------------------------------------------------------------
// Items 7-10
// ---------------------------------------------------------------------------

describe("Items 7-10: Midweek settlement lifecycle over real HealthKit ingestion", () => {
  it("(sanity) the earliest publish instant is 03:00 local on the briefing date and the deadline is eight hours later", () => {
    expect(MIDWEEK_DUE.toISOString()).toBe("2026-09-16T10:00:00.000Z");
    expect(DEADLINE_MINUTES).toBe(480);
  });

  it("Item 7: with the final Sun-Tue day settled, generates (readiness_satisfied) a 3/3 complete Energy fixture", async () => {
    const settled = await settledEnergyWeek();
    // The real Energy assessment over settled HealthKit evidence: all three days paired and complete.
    expect(settled.current.dailyRecords.map((day) => day.pairedCompleteness)).toEqual(["complete", "complete", "complete"]);

    const records = hkStore();
    await ingestMidweekWeek(records);
    const world = cadenceWorld({ records, energyObservations: () => settled.observations });
    const { midweek } = await world.run(at(5));

    expect(world.gate.evaluate).toHaveBeenCalledOnce();
    expect(midweek).toMatchObject({ resultStatus: "generation_completed", settlementReasonCode: "readiness_satisfied" });
    expect(world.generators.midweek.generateForCurrentWindow).toHaveBeenCalledOnce();
    expect(world.info).toHaveBeenCalledWith("briefing_settlement.readiness_satisfied", expect.objectContaining({ unsettledDomains: [] }));
    expect(world.info).not.toHaveBeenCalledWith("briefing_settlement.deadline_fallback_used", expect.anything());

    // The generated briefing carries the 3/3 Energy execution and serves cleanly.
    const [prepared] = world.prepared;
    expect(prepared.strategicInterpretation.energyExecution.estimate.pairing).toMatchObject({
      eligibleDayCount: 3, pairedDayCount: 3, completePairedDayCount: 3, pairedCoverageRatio: 1, quality: "complete",
    });
    // Intake authority is the settled HealthKit full-day total, not a partial meal subtotal.
    const { intakeEvidence } = prepared.strategicInterpretation.energyExecution.estimate;
    expect(intakeEvidence.byTier).toEqual({ full_day_asserted: 3 });
    expect(intakeEvidence.ambiguity).not.toContain("intake_meal_derived_unverified");
    const served = prepareMidweekBriefingReviewPresentation({ artifact: prepared.artifact, assessment: prepared.assessment });
    expect(served.presentationModel).toBe("canonical_narrative_v3");
    expect(served.presentationContract.lineage.valid).toBe(true);
  });

  it("Item 7: the gate's readiness reads only coverage/identity/revision, never an observed value", async () => {
    const records = hkStore();
    await ingestMidweekWeek(records);
    const world = cadenceWorld({ records, energyObservations: unsettledEnergyObservations });
    await world.gate.beginTick();
    const decision = await world.gate.evaluate({
      finalEvidenceDate: "2026-09-15", earliestPublishAt: MIDWEEK_DUE.toISOString(), now: at(5) });
    expect(decision).toMatchObject({ action: "generate", reasonCode: "readiness_satisfied" });
    expect(decision.readiness.domains.nutrition).toMatchObject({ present: true, coverage: "complete_day", settled: true, revision: 1 });
    expect(JSON.stringify(decision)).not.toMatch(/2484|824|calories|move_calories/u);
  });

  it("Item 8: before the earliest publish time it never generates, even with everything already settled", async () => {
    const records = hkStore();
    await ingestMidweekWeek(records);
    const world = cadenceWorld({ records, energyObservations: unsettledEnergyObservations });
    const { midweek } = await world.run(at(-30));
    expect(midweek).toMatchObject({ resultStatus: "ineligible", skipReason: "before_local_eligible_time" });
    expect(world.generators.midweek.generateForCurrentWindow).not.toHaveBeenCalled();
    expect(world.gate.evaluate).not.toHaveBeenCalled();
    expect(world.artifacts).toEqual([]);
  });

  it.each([
    ["Nutrition delivered only as partial_day", { finalNutrition: "partial_day" }, ["nutrition"]],
    ["Nutrition never delivered (fail-closed)", { finalNutrition: null }, ["nutrition"]],
    ["Activity partial and Nutrition partial", { finalNutrition: "partial_day", finalActivity: "partial_day" }, ["activity", "nutrition"]],
  ])("Item 8: an unsettled final day waits before the deadline (%s)", async (_label, options, unsettled) => {
    const records = hkStore();
    await ingestMidweekWeek(records, options);
    const world = cadenceWorld({ records, energyObservations: unsettledEnergyObservations });

    const { midweek } = await world.run(at(65));
    expect(midweek).toMatchObject({
      resultStatus: "awaiting_evidence_settlement", skipReason: "awaiting_settlement",
      unsettledDomains: unsettled, retryability: true, artifactOutcome: "none",
      nextRetryAt: at(95),
    });
    expect(world.generators.midweek.generateForCurrentWindow).not.toHaveBeenCalled();
    expect(world.artifacts).toEqual([]);
    expect(world.info).toHaveBeenCalledWith("briefing_settlement.awaiting_settlement",
      expect.objectContaining({ unsettledDomains: unsettled }));

    // Still waiting one minute before the hard deadline, retry capped AT the deadline.
    const late = await world.run(at(DEADLINE_MINUTES - 1));
    expect(late.midweek).toMatchObject({ resultStatus: "awaiting_evidence_settlement", nextRetryAt: at(DEADLINE_MINUTES) });
    expect(world.generators.midweek.generateForCurrentWindow).not.toHaveBeenCalled();
  });

  it("Item 8: the wait resolves as soon as the domain settles (a later complete_day delivery), without waiting for the deadline", async () => {
    const records = hkStore();
    await ingestMidweekWeek(records, { finalNutrition: "partial_day" });
    const world = cadenceWorld({ records, energyObservations: unsettledEnergyObservations });
    expect((await world.run(at(40))).midweek.resultStatus).toBe("awaiting_evidence_settlement");
    await ingest(records, [nutritionObservation("2026-09-15", 2484, { revision: 2, coverage: "complete_day" })], at(50));
    const { midweek } = await world.run(at(65));
    expect(midweek).toMatchObject({ resultStatus: "generation_completed", settlementReasonCode: "readiness_satisfied" });
    expect(world.generators.midweek.generateForCurrentWindow).toHaveBeenCalledOnce();
  });

  it("Item 9: at the hard deadline it publishes anyway and logs which domains were unsettled (watermark persistence on the artifact is a disclosed, unwired gap)", async () => {
    const records = hkStore();
    await ingestMidweekWeek(records, { finalNutrition: "partial_day" });
    const world = cadenceWorld({ records, energyObservations: unsettledEnergyObservations });

    const { midweek } = await world.run(at(DEADLINE_MINUTES));
    expect(midweek).toMatchObject({ resultStatus: "generation_completed", settlementReasonCode: "hard_deadline_reached" });
    expect(world.generators.midweek.generateForCurrentWindow).toHaveBeenCalledOnce();
    // Distinct lifecycle event carrying the unsettled-domain metadata; NOT the ordinary readiness event.
    expect(world.info).toHaveBeenCalledWith("briefing_settlement.deadline_fallback_used", expect.objectContaining({
      cadenceKey: "midweek", reasonCode: "hard_deadline_reached", unsettledDomains: ["nutrition"] }));
    expect(world.info).not.toHaveBeenCalledWith("briefing_settlement.readiness_satisfied", expect.anything());
    expect(world.info).toHaveBeenCalledWith("briefing_settlement.briefing_generated",
      expect.objectContaining({ settlementReasonCode: "hard_deadline_reached" }));
    // The execution records for this occurrence carry the fallback reason on every generation record.
    const generationRecords = world.executionRecords.filter((r) => r.cadenceKey === "midweek");
    expect(generationRecords.length).toBeGreaterThan(0);
    for (const record of generationRecords) expect(record.settlementReasonCode).toBe("hard_deadline_reached");

    // The freeze/watermark shaped from the very same decision retains the unsettled domains, immutably.
    const gateDecision = await world.gate.evaluate({
      finalEvidenceDate: "2026-09-15", earliestPublishAt: MIDWEEK_DUE.toISOString(), now: at(DEADLINE_MINUTES) });
    const watermark = buildEvidenceSettlementWatermarkV1({
      evidenceWindow: { startDate: "2026-09-13", endDate: "2026-09-15" },
      readiness: gateDecision.readiness, publishDecision: gateDecision, generatedAt: at(DEADLINE_MINUTES) });
    expect(watermark).toMatchObject({
      readyAtGeneration: false, unsettledDomainsAtGeneration: ["nutrition"], publishReasonCode: "hard_deadline_reached" });
    expect(watermark.domains.activity.settled).toBe(true);
    expect(watermark.domains.nutrition).toMatchObject({ settled: false, coverage: "partial_day" });
  });

  it("Item 10: a later evidence revision never rewrites the frozen briefing, and no second generation is attempted", async () => {
    const settled = await settledEnergyWeek();
    const records = hkStore();
    await ingestMidweekWeek(records);
    const world = cadenceWorld({ records, energyObservations: () => settled.observations });
    expect((await world.run(at(5))).midweek.resultStatus).toBe("generation_completed");
    const [frozen] = world.artifacts;
    const frozenSnapshot = JSON.stringify(frozen);
    const servedBefore = JSON.stringify(prepareMidweekBriefingReviewPresentation({
      artifact: frozen, assessment: world.prepared[0].assessment }));

    // Later evidence: a corrected Nutrition day (revision 2) lands after the briefing froze.
    await ingest(records, [nutritionObservation("2026-09-15", 2900, { revision: 2 }),
      activityObservation("2026-09-15", 1100, { revision: 2 })], at(120));
    const days = records.snapshot().healthKitCanonicalDays;
    expect(days.find((day) => day.id === "healthkit_canonical_day_nutrition_2026-09-15")).toMatchObject({
      revision: 2, current: { values: { dailyTotals: { calories: 2900 } } } });

    const later = await world.run(at(130));
    expect(later.midweek).toMatchObject({ resultStatus: "already_completed", artifactOutcome: "existing_immutable_artifact" });
    expect(world.generators.midweek.generateForCurrentWindow).toHaveBeenCalledOnce();
    expect(world.artifacts).toHaveLength(1);
    expect(JSON.stringify(world.artifacts[0])).toBe(frozenSnapshot);
    expect(JSON.stringify(prepareMidweekBriefingReviewPresentation({
      artifact: world.artifacts[0], assessment: world.prepared[0].assessment }))).toBe(servedBefore);
    // The settlement gate is not even consulted for an already-published occurrence.
    expect(world.gate.evaluate).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Monthly stays day 1; event-driven DEXA / Photo are never delayed by the gate
// ---------------------------------------------------------------------------

describe("Monthly stays on day 1; event-driven DEXA/Photo never enter the settlement gate", () => {
  const MONTHLY_DUE = resolveBriefingDueInstant({ localDate: "2026-10-01", timeZone: TZ });

  it("the real registry keeps Monthly due 03:00 local on the 1st and ineligible on every other day, with the gate wired in", async () => {
    const records = hkStore();
    const world = cadenceWorld({ records, energyObservations: unsettledEnergyObservations });
    const onFirst = await resolveBriefingCadenceRegistry({
      repositories: world.repositories, generators: world.generators, userId: OWNER, now: new Date(MONTHLY_DUE.valueOf() + 5 * 60_000) });
    const monthly = onFirst.find((entry) => entry.cadence === "monthly");
    expect(monthly).toMatchObject({ eligible: true, localDate: "2026-10-01", dueAt: "2026-10-01T10:00:00.000Z" });
    expect(monthly.evidenceWindow).toMatchObject({ startDate: "2026-09-01", endDate: "2026-09-30" });
    for (const day of ["2026-10-02", "2026-09-30", "2026-10-15"]) {
      const other = await resolveBriefingCadenceRegistry({
        repositories: world.repositories, generators: world.generators, userId: OWNER,
        now: new Date(`${day}T20:00:00.000Z`) });
      expect(other.find((entry) => entry.cadence === "monthly").eligible, day).toBe(false);
    }
  });

  it("Monthly with a settled final day generates on day 1 at 03:00 local, exactly as before the gate existed", async () => {
    const records = hkStore();
    await ingest(records, [activityObservation("2026-09-30", 900), nutritionObservation("2026-09-30", 2500)], "2026-10-01T09:30:00.000Z");
    const world = cadenceWorld({ records, energyObservations: unsettledEnergyObservations });
    const { monthly } = await world.run(new Date(MONTHLY_DUE.valueOf() + 5 * 60_000).toISOString());
    expect(world.gate.evaluate).toHaveBeenCalledWith(expect.objectContaining({ finalEvidenceDate: "2026-09-30" }));
    expect(monthly).toMatchObject({ resultStatus: "generation_completed", localBriefingDate: "2026-10-01", settlementReasonCode: "readiness_satisfied" });
  });

  it("Monthly with an unsettled final day waits/falls back WITHIN day 1; the gate never moves the cadence to another day", async () => {
    const records = hkStore();
    await ingest(records, [activityObservation("2026-09-30", 900), nutritionObservation("2026-09-30", 900, { coverage: "partial_day" })],
      "2026-10-01T09:30:00.000Z");
    const world = cadenceWorld({ records, energyObservations: unsettledEnergyObservations });
    const waiting = await world.run(new Date(MONTHLY_DUE.valueOf() + 60 * 60_000).toISOString());
    expect(waiting.monthly).toMatchObject({ resultStatus: "awaiting_evidence_settlement", localBriefingDate: "2026-10-01" });
    expect(new Date(waiting.monthly.nextRetryAt).toISOString().slice(0, 10)).toBe("2026-10-01");
    const deadline = await world.run(new Date(MONTHLY_DUE.valueOf() + DEADLINE_MINUTES * 60_000).toISOString());
    expect(deadline.monthly).toMatchObject({ resultStatus: "generation_completed", localBriefingDate: "2026-10-01", settlementReasonCode: "hard_deadline_reached" });
    // Still 2026-10-01 in the briefing timezone at the deadline (18:00Z = 11:00 PDT).
    expect(new Date(MONTHLY_DUE.valueOf() + DEADLINE_MINUTES * 60_000).toISOString()).toBe("2026-10-01T18:00:00.000Z");
  });

  it("the executor evaluates only the recurring cadences; DEXA and Photo are event-triggered and have no settlement entry", async () => {
    const records = hkStore();
    const world = cadenceWorld({ records, energyObservations: unsettledEnergyObservations });
    const { result } = await world.run(at(65));
    expect(result.outcomes.map((outcome) => outcome.cadenceKey).sort()).toEqual(["midweek", "monthly", "weekly"]);
    expect(DEFAULT_SETTLEMENT_POLICY.readinessDomains).toEqual(["activity", "nutrition"]);
    expect(Object.keys(DEFAULT_SETTLEMENT_POLICY).join(" ")).not.toMatch(/dexa|photo|event/iu);
  });

  it("no DEXA/Photo event path (or any other module) imports the settlement policy or gate", () => {
    const root = path.resolve(new URL("../..", import.meta.url).pathname);
    const importers = [];
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(?:js|mjs)$/u.test(entry.name) || /\.test\.(?:js|mjs)$/u.test(entry.name)) continue;
        const text = fs.readFileSync(full, "utf8");
        if (/BriefingEvidenceSettlementPolicy|BriefingCadenceSettlementGate|settlementGate/u.test(text)) {
          importers.push(path.relative(root, full));
        }
      }
    };
    walk(root);
    expect(importers.sort()).toEqual([
      "application/composition/providerBriefingCadenceComposition.js",
      "domain/services/BriefingCadenceExecutorService.js",
      "domain/services/BriefingCadenceSettlementGate.js",
    ]);
    // The Gate is the only consumer of the policy module (besides tests).
    expect(fs.readFileSync(path.join(root, "domain/services/BriefingCadenceSettlementGate.js"), "utf8"))
      .toContain("./BriefingEvidenceSettlementPolicy.js");
    expect(importers.filter((file) => /dexa|photo|event/iu.test(path.basename(file)))).toEqual([]);
  });
});
