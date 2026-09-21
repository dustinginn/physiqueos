import strategyAuthority from "../fixtures/briefingFamilyV3/strategyAuthority.json";
import nutritionActivity from "../fixtures/briefingFamilyV3/nutritionActivityDays.json";
import dexaScans from "../fixtures/briefingFamilyV3/dexaScans.json";
import weightEntries from "../fixtures/briefingFamilyV3/weightEntries.json";
import weeklyPi from "../fixtures/briefingFamilyV3/weeklyPiObservations.json";
import weeklyBaseline from "../fixtures/briefingFamilyV3/weeklyOriginalV3Baseline.json";
import midweekV2 from "../fixtures/briefingFamilyV3/midweekBriefingV2.json";
import weeklyArtifact from "../fixtures/briefingFamilyV3/weeklyArtifactV3Bound.json";
import dexaEventArtifact from "../fixtures/briefingFamilyV3/dexaEventArtifact.json";
import photoEventArtifact from "../fixtures/briefingFamilyV3/photoEventArtifact.json";
import { adaptCadenceEvidenceObservationsV3, adaptCanonicalDexaScans, adaptCanonicalPhotoObservations } from "../domain/intelligence/ProductionConfidenceNarrativeV3Adapter.js";
import {
  applyNarrativeV3ToBriefingArtifact,
  createBriefingGoalConfidenceBlockFromV3,
} from "../domain/services/BriefingGoalConfidencePresentationService.js";
import { createCadenceEnergyAssessment, CADENCE_RMR_STRATEGIES } from "../domain/services/CadenceEnergyAssessmentService.js";
import { createEnergyPIObservations } from "../domain/services/EnergyPIObservationService.js";
import { withStructuredPhotoObservationsV3 } from "../domain/intelligence/PhotoEventStructuredObservationsV3.js";
import { resolveCommittedPhaseContext } from "../domain/services/FounderPhaseCorrectionService.js";
import { createStrategicInterpretationPublicationServiceV3 } from "../domain/services/StrategicInterpretationPublicationServiceV3.js";

// Permanent golden forensic harness for the Sep 13–19 Weekly.
//
// The fixtures are reduced Founder records exactly as they stood at the
// original generation (2026-09-20T12:34:05Z, evidence cutoff 06:59:59.999Z):
// no later Photo evidence, no later Training correction and no later assessment.
// The harness never writes and never publishes; it only prepares V3.

export const WEEKLY_SEP13_19 = Object.freeze({
  artifactId: "weekly_briefing_2026-09-13_2026-09-19",
  generatedAt: "2026-09-20T12:34:05.415Z",
  evidenceCutoff: "2026-09-20T06:59:59.999Z",
  window: weeklyPi.evidenceWindow,
});

export const fixtures = Object.freeze({
  strategyAuthority, nutritionActivity, dexaScans, weightEntries, weeklyPi,
  weeklyBaseline, midweekV2, weeklyArtifact, dexaEventArtifact, photoEventArtifact,
});

export function currentGoalAndPhase() {
  const goal = structuredClone(strategyAuthority.goal);
  const phase = resolveCommittedPhaseContext(goal, { asOf: "2026-09-19" }).activePhase;
  return { goal, phase };
}

export function midweekArtifactForStore() {
  const artifact = structuredClone(midweekV2);
  // The midweek artifact's own cutoff, as stored.
  return artifact;
}

export function buildWeeklyStore({ includeMidweek = true } = {}) {
  return {
    goals: [structuredClone(strategyAuthority.goal)],
    phaseStrategies: [structuredClone(strategyAuthority.phaseStrategy)],
    protocols: structuredClone(strategyAuthority.protocols),
    protocolVersions: structuredClone(strategyAuthority.protocolVersions),
    dexaScans: structuredClone(dexaScans),
    weightEntries: structuredClone(weightEntries),
    dailyBriefings: includeMidweek ? [midweekArtifactForStore()] : [],
    canonicalEvidenceObjects: [],
    goalConfidenceHistory: [],
    goalConfidenceSnapshots: [],
    analyses: [],
  };
}

// Corrected Energy PI observations computed by the real production pipeline from
// the seven-day Nutrition and Activity records (and the prior comparison week).
export function computeCorrectedEnergyObservations({ nutritionDays, activityDays } = {}) {
  const window = { ...WEEKLY_SEP13_19.window };
  const comparisonWindow = { startDate: "2026-09-06", endDate: "2026-09-12", timeZone: window.timeZone };
  const input = {
    cadence: "weekly",
    timeZone: window.timeZone,
    nutritionDays: nutritionDays ?? nutritionActivity.nutritionDays,
    activityDays: activityDays ?? nutritionActivity.activityDays,
    dexaScans,
    rmrStrategy: CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW,
  };
  const current = createCadenceEnergyAssessment({ ...input, window, comparisonWindow });
  const comparison = createCadenceEnergyAssessment({ ...input, window: comparisonWindow });
  const observations = createEnergyPIObservations({
    days: [...comparison.dailyRecords, ...current.dailyRecords],
    observationWindow: window,
    comparisonWindow,
    semanticHorizon: "weekly",
    includeInsufficientData: true,
  });
  return { observations, current, comparison };
}

export function weeklyPiEnvelope({ energyObservations, dropEnergy = false } = {}) {
  const others = weeklyPi.observations.filter((item) => item.domain !== "energy");
  return {
    status: "ready",
    observations: [...others, ...(dropEnergy ? [] : energyObservations)],
    evidenceWindow: WEEKLY_SEP13_19.window,
  };
}

// A minimal canonical V2 predecessor: the golden harness exercises the V3
// pipeline from an existing series without carrying the Founder's whole history.
export function syntheticPredecessor({ sourceCutoff = "2026-09-16T06:59:59.999Z" } = {}) {
  const { goal, phase } = currentGoalAndPhase();
  return {
    id: "confidence_assessment_v2|golden_harness_predecessor",
    schemaVersion: "canonical_confidence_assessment_v2",
    goalId: goal.id,
    phaseId: phase.id,
    currentPercentage: 62,
    confidenceBand: "moderate",
    sourceCutoff,
    briefingArtifactId: "golden_harness_predecessor_artifact",
  };
}

export async function prepareWeeklyV3({
  piEnvelope,
  store = buildWeeklyStore(),
  goalOverride = null,
} = {}) {
  const { goal: fixtureGoal, phase } = currentGoalAndPhase();
  const goal = goalOverride ?? fixtureGoal;
  const artifact = structuredClone(weeklyArtifact);
  const finalizer = createStrategicInterpretationPublicationServiceV3({
    now: () => new Date(WEEKLY_SEP13_19.generatedAt),
  });
  return finalizer.prepare({
    publisherType: "weekly_briefing",
    userId: "user_founder_001",
    occurrenceId: artifact.id,
    artifactId: artifact.id,
    cadenceOrEventType: "weekly",
    goal,
    phase,
    store,
    evidenceWindowId: artifact.evidenceWindow.id,
    evidenceWindowClosed: true,
    buildAdditionalObservations: ({ goalContract }) => adaptCadenceEvidenceObservationsV3({
      goalContract, phase, artifact, piEnvelope, evidenceCutoff: WEEKLY_SEP13_19.evidenceCutoff,
    }),
    previousCanonicalAssessment: syntheticPredecessor(),
    evidenceCutoff: WEEKLY_SEP13_19.evidenceCutoff,
    finalizedAt: WEEKLY_SEP13_19.generatedAt,
    idempotencyKey: `confidence_v3|weekly|${artifact.id}`,
    sourceLineage: { reason: "golden_forensic_replay", evidenceWindowId: artifact.evidenceWindow.id },
    evaluationType: "closed_cadence_boundary",
    surface: "weekly_briefing",
    composeArtifact: (outputs) => {
      const candidate = applyNarrativeV3ToBriefingArtifact({
        artifact, publicationType: "weekly",
        narrativePlan: outputs.narrativePlan,
        strategicInterpretation: outputs.strategicInterpretation,
      });
      candidate.briefing.weeklyNarrative.goalConfidence = createBriefingGoalConfidenceBlockFromV3({
        assessment: outputs.confidenceAssessment,
        narrativePlan: outputs.narrativePlan,
        capturedAt: WEEKLY_SEP13_19.generatedAt,
      });
      return { artifact: candidate };
    },
  });
}

// ---------------------------------------------------------------------------
// Midweek golden: the stored Sun–Tue Midweek (Sep 13–15) replayed through the
// real V3 pipeline with a stale prior Weekly (Sep 6–12) in the store.

export const MIDWEEK_SEP13_15 = Object.freeze({
  artifactId: midweekV2.id,
  generatedAt: midweekV2.generatedAt,
  evidenceCutoff: midweekV2.evidenceWindow.cutoff,
  window: midweekV2.evidenceWindow,
});

// A prior Weekly bound to Sep 6–12 whose Nutrition observation is the kind of
// stale 1-of-3 style carry-forward a later Midweek must not inherit.
export function priorWeeklyArtifactSep6to12() {
  const artifact = structuredClone(weeklyArtifact);
  const window = {
    ...artifact.evidenceWindow,
    id: "weekly:2026-09-06:2026-09-12:America/Los_Angeles",
    startDate: "2026-09-06", endDate: "2026-09-12", date: "2026-09-12", briefingDate: "2026-09-13",
    start: "2026-09-06T00:00:00", end: "2026-09-12T23:59:59.999", cutoff: "2026-09-13T06:59:59.999Z",
  };
  artifact.id = "weekly_briefing_2026-09-06_2026-09-12";
  artifact.evidenceWindow = window;
  artifact.evidenceCutoff = window.cutoff;
  artifact.generatedAt = "2026-09-13T12:00:00.000Z";
  artifact.briefing.weeklyNarrative.evidenceWindow = window;
  artifact.briefing.weeklyNarrative.context.evidenceWindow = window;
  const shifted = structuredClone(weeklyPi.observations).map((item) => ({
    ...item,
    evidenceWindow: { ...window },
  }));
  artifact.briefing.weeklyNarrative.context.pi = { status: "ready", observations: shifted, evidenceWindow: window };
  const { goal, phase } = currentGoalAndPhase();
  artifact.goalId = goal.id;
  artifact.phaseId = phase.id;
  artifact.briefing.activeGoal = { id: goal.id };
  artifact.briefing.activePhase = { id: phase.id };
  return artifact;
}

export function computeMidweekEnergyObservations() {
  const window = { startDate: "2026-09-13", endDate: "2026-09-15", timeZone: "America/Los_Angeles" };
  const comparisonWindow = { startDate: "2026-09-06", endDate: "2026-09-12", timeZone: window.timeZone };
  const input = {
    cadence: "midweek", timeZone: window.timeZone,
    nutritionDays: nutritionActivity.nutritionDays, activityDays: nutritionActivity.activityDays,
    dexaScans, rmrStrategy: CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW,
  };
  const current = createCadenceEnergyAssessment({ ...input, window, comparisonWindow });
  const comparison = createCadenceEnergyAssessment({ ...input, window: comparisonWindow });
  const observations = createEnergyPIObservations({
    days: [...comparison.dailyRecords, ...current.dailyRecords],
    observationWindow: { ...window }, comparisonWindow, semanticHorizon: "midweek",
    includeInsufficientData: true,
  });
  return { observations, current, comparison };
}

export async function prepareMidweekV3({ withPriorWeekly = true, energyObservations } = {}) {
  const { goal, phase } = currentGoalAndPhase();
  const artifact = structuredClone(midweekV2);
  const observations = energyObservations ?? computeMidweekEnergyObservations().observations;
  const store = buildWeeklyStore({ includeMidweek: false });
  store.dailyBriefings = withPriorWeekly ? [priorWeeklyArtifactSep6to12()] : [];
  const finalizer = createStrategicInterpretationPublicationServiceV3({
    now: () => new Date(MIDWEEK_SEP13_15.generatedAt),
  });
  return finalizer.prepare({
    publisherType: "midweek_briefing", userId: "user_founder_001",
    occurrenceId: artifact.id, artifactId: artifact.id, cadenceOrEventType: "midweek",
    goal, phase, store,
    evidenceWindowId: artifact.evidenceWindow.id, evidenceWindowClosed: true,
    buildAdditionalObservations: ({ goalContract }) => adaptCadenceEvidenceObservationsV3({
      goalContract, phase, artifact,
      piEnvelope: { status: "ready", observations, evidenceWindow: artifact.evidenceWindow },
      evidenceCutoff: MIDWEEK_SEP13_15.evidenceCutoff,
    }),
    previousCanonicalAssessment: syntheticPredecessor({ sourceCutoff: "2026-09-13T06:59:59.999Z" }),
    evidenceCutoff: MIDWEEK_SEP13_15.evidenceCutoff,
    finalizedAt: MIDWEEK_SEP13_15.generatedAt,
    idempotencyKey: `confidence_v3|midweek|${artifact.id}`,
    sourceLineage: { reason: "golden_forensic_replay", evidenceWindowId: artifact.evidenceWindow.id },
    evaluationType: "closed_cadence_boundary", surface: "midweek_briefing",
    composeArtifact: (outputs) => {
      const candidate = applyNarrativeV3ToBriefingArtifact({
        artifact, publicationType: "midweek",
        narrativePlan: outputs.narrativePlan, strategicInterpretation: outputs.strategicInterpretation,
      });
      candidate.briefing.goalConfidence = createBriefingGoalConfidenceBlockFromV3({
        assessment: outputs.confidenceAssessment, narrativePlan: outputs.narrativePlan,
        capturedAt: MIDWEEK_SEP13_15.generatedAt,
      });
      return { artifact: candidate };
    },
  });
}

// ---------------------------------------------------------------------------
// DEXA and Photo event goldens: the same V3 pipeline run on the accepted
// events' evidence. The recorded text hashes were produced by the pristine
// production base (895935bd) on identical inputs.

function eventStore(goal) {
  return {
    goals: [goal], phaseStrategies: [structuredClone(strategyAuthority.phaseStrategy)],
    protocols: structuredClone(strategyAuthority.protocols),
    protocolVersions: structuredClone(strategyAuthority.protocolVersions),
    dexaScans: structuredClone(dexaScans), weightEntries: structuredClone(weightEntries),
    dailyBriefings: [], canonicalEvidenceObjects: [], goalConfidenceHistory: [],
    goalConfidenceSnapshots: [], analyses: [],
  };
}

function eventPredecessor({ goal, phase, sourceCutoff }) {
  return {
    id: "confidence_assessment_v2|golden_harness_event_predecessor",
    schemaVersion: "canonical_confidence_assessment_v2",
    goalId: goal.id, phaseId: phase.id, currentPercentage: 62, confidenceBand: "moderate",
    sourceCutoff, briefingArtifactId: "golden_harness_predecessor_artifact",
  };
}

export const DEXA_SCAN_ID = "evidence_submission_44462ABB3969473DA82FBF2B46A504EF_pdf_1_2026_09_12";
export const DEXA_PRIOR_SCAN_ID = "dexa_submission_20260815181333895_review_pdf_1_2026_08_15";

export async function prepareDexaV3() {
  const goal = structuredClone(strategyAuthority.goal);
  const phase = resolveCommittedPhaseContext(goal, { asOf: "2026-09-13" }).activePhase;
  const scan = dexaScans.find((item) => item.id === DEXA_SCAN_ID);
  const prior = dexaScans.find((item) => item.id === DEXA_PRIOR_SCAN_ID);
  const cutoff = "2026-09-13T06:59:59.999Z";
  const artifact = structuredClone(dexaEventArtifact);
  let composed = null;
  const finalizer = createStrategicInterpretationPublicationServiceV3({
    now: () => new Date("2026-09-13T06:28:58.012Z"),
  });
  const prepared = await finalizer.prepare({
    publisherType: "dexa_event_briefing", userId: "user_founder_001",
    occurrenceId: artifact.id, artifactId: artifact.id, cadenceOrEventType: "dexa", goal, phase,
    store: eventStore(goal), evidenceWindowId: `dexa_event|${scan.id}`, evidenceWindowClosed: true,
    buildAdditionalObservations: ({ goalContract }) => adaptCanonicalDexaScans({
      goalContract, phase, scans: [prior, scan], cutoff,
    }),
    previousCanonicalAssessment: eventPredecessor({ goal, phase, sourceCutoff: "2026-08-16T06:59:59.999Z" }),
    evidenceCutoff: cutoff, finalizedAt: "2026-09-13T06:28:58.012Z",
    idempotencyKey: "golden|dexa", sourceLineage: { reason: "golden_forensic_replay" },
    evaluationType: "event_evidence_boundary", surface: "dexa_event_briefing",
    composeArtifact: (outputs) => {
      composed = applyNarrativeV3ToBriefingArtifact({
        artifact, publicationType: "dexa",
        narrativePlan: outputs.narrativePlan, strategicInterpretation: outputs.strategicInterpretation,
      });
      composed.briefing.dexaEventNarrative.goalConfidence = createBriefingGoalConfidenceBlockFromV3({
        assessment: outputs.confidenceAssessment, narrativePlan: outputs.narrativePlan,
        capturedAt: "2026-09-13T06:28:58.012Z",
      });
      return { artifact: composed };
    },
  });
  return { prepared, artifact: composed, stored: dexaEventArtifact };
}

export async function preparePhotoV3({ structured = false } = {}) {
  const goal = structuredClone(strategyAuthority.goal);
  const phase = resolveCommittedPhaseContext(goal, { asOf: "2026-09-19" }).activePhase;
  const narrative = structuredClone(photoEventArtifact.briefing.photoEventNarrative);
  const session = { id: narrative.photoSessionId, capturedAt: "2026-09-19T20:00:00.000Z", captureDate: "2026-09-19" };
  const cutoff = "2026-09-20T06:59:59.999Z";
  const interpretation = structured ? withStructuredPhotoObservationsV3(narrative) : narrative;
  const artifact = structuredClone(photoEventArtifact);
  let composed = null;
  const finalizer = createStrategicInterpretationPublicationServiceV3({
    now: () => new Date("2026-09-20T17:51:47.391Z"),
  });
  const prepared = await finalizer.prepare({
    publisherType: "photo_event_briefing", userId: "user_founder_001",
    occurrenceId: artifact.id, artifactId: artifact.id, cadenceOrEventType: "photo", goal, phase,
    store: eventStore(goal), evidenceWindowId: `photo_event|${session.id}`, evidenceWindowClosed: true,
    buildAdditionalObservations: ({ goalContract }) => adaptCanonicalPhotoObservations({
      goalContract, phase, store: { photoAnalyses: [{ ...session, interpretation }] }, cutoff,
    }),
    previousCanonicalAssessment: eventPredecessor({ goal, phase, sourceCutoff: "2026-09-16T06:59:59.999Z" }),
    evidenceCutoff: cutoff, finalizedAt: "2026-09-20T17:51:47.391Z",
    idempotencyKey: "golden|photo", sourceLineage: { reason: "golden_forensic_replay" },
    evaluationType: "event_evidence_boundary", surface: "photo_event_briefing", qualifyingPhotoEvent: true,
    composeArtifact: (outputs) => {
      composed = applyNarrativeV3ToBriefingArtifact({
        artifact, publicationType: "photo",
        narrativePlan: outputs.narrativePlan, strategicInterpretation: outputs.strategicInterpretation,
      });
      composed.briefing.photoEventNarrative.goalConfidence = createBriefingGoalConfidenceBlockFromV3({
        assessment: outputs.confidenceAssessment, narrativePlan: outputs.narrativePlan,
        capturedAt: "2026-09-20T17:51:47.391Z",
      });
      return { artifact: composed };
    },
  });
  return { prepared, artifact: composed, stored: photoEventArtifact };
}
