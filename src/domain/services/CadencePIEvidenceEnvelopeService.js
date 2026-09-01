import { createCadenceTrainingPIObservations } from
  "./CadenceTrainingPIObservationService";
import { createDEXAPIObservations } from "./DEXAPIObservationService";
import { createEnergyPIObservations } from "./EnergyPIObservationService";
import {
  applyPIGoalContextToObservations,
  createPIGoalContext,
} from "./PIObservationGoalContextService";
import { createPhotoPIObservations } from "./PhotoPIObservationService";
import { createRecoveryPIComposition } from "./RecoveryPICompositionService";
import { createTrainingPerformanceIntelligenceReport } from
  "./TrainingPerformanceIntelligenceService";
import { createWeightPIObservations } from "./WeightPIObservationService";

export const CADENCE_PI_EVIDENCE_ENVELOPE_VERSION =
  "cadence_pi_evidence_envelope_v1";

export function createCadencePIEvidenceEnvelope({
  cadence,
  evidenceWindow,
  comparisonWindow = null,
  evaluationDate = evidenceWindow?.endDate,
  timeZone = evidenceWindow?.timeZone ?? "America/Los_Angeles",
  activeGoal = null,
  activePhase = null,
  canonicalTrainingEvidence = [],
  weights = [],
  energyDays = [],
  recoveryEvidenceRecords = [],
  dexaScans = [],
  photoSessions = [],
  trainingReport = null,
} = {}) {
  const before = structuredClone({
    cadence, evidenceWindow, comparisonWindow, evaluationDate, timeZone,
    activeGoal, activePhase, canonicalTrainingEvidence, weights, energyDays,
    recoveryEvidenceRecords, dexaScans, photoSessions, trainingReport,
  });
  requireCadence(cadence);
  requireWindow(evidenceWindow);
  const report = trainingReport ?? createTrainingPerformanceIntelligenceReport({
    canonicalObjects: canonicalTrainingEvidence,
    generatedAt: `${evaluationDate}T12:00:00.000Z`,
    now: `${evaluationDate}T12:00:00.000Z`,
  });
  const goalContext = createPIGoalContext({
    activeGoal,
    activePhase,
    currentDate: `${evaluationDate}T12:00:00Z`,
    timeZone,
  });
  const raw = [
    ...createCadenceTrainingPIObservations({
      report,
      canonicalTrainingEvidence,
      cadence,
      evidenceWindow,
      comparisonWindow,
      windowTimeZone: timeZone,
    }),
    ...createWeightPIObservations({
      weights,
      observationWindow: evidenceWindow,
      comparisonWindow,
      requestedScopes: ["short_window", "average_comparison"],
      semanticHorizon: cadence,
      includeInsufficientData: true,
    }),
    ...createEnergyPIObservations({
      days: normalizeEnergyDays(energyDays),
      observationWindow: evidenceWindow,
      comparisonWindow,
      semanticHorizon: cadence,
      includeInsufficientData: true,
    }),
    ...createDEXAPIObservations({
      scans: selectDexaThroughCutoff(dexaScans, evidenceWindow.endDate),
      includeInsufficientData: false,
    }),
    ...createPhotoPIObservations({
      sessions: photoSessions,
      includeInsufficientData: false,
    }).filter((item) => inside(item.evidenceWindow?.endDate, evidenceWindow)),
  ];
  const contextual = applyPIGoalContextToObservations(raw, goalContext);
  const recoveryPI = createRecoveryPIComposition({
    records: recoveryEvidenceRecords,
    cadence,
    evidenceWindow,
    comparisonWindow,
    timezone: timeZone,
    evaluationDate,
    goalContext,
    trainingObservations: contextual.filter((item) => item.domain === "training"),
    energyObservations: contextual.filter((item) => item.domain === "energy"),
    priorClaims: [],
    competingCandidates: eventCandidates(contextual),
  });
  const observations = [...contextual, ...recoveryPI.observations]
    .sort((left, right) => left.id.localeCompare(right.id));
  const result = {
    schemaVersion: CADENCE_PI_EVIDENCE_ENVELOPE_VERSION,
    cadence,
    evidenceWindow: structuredClone(evidenceWindow),
    comparisonWindow: comparisonWindow ? structuredClone(comparisonWindow) : null,
    observations,
    selection: { primary: [], supporting: [], background: [], suppressed: [] },
    coverage: domainCoverage(observations),
    evidenceCompleteness: completeness(observations),
    provenance: {
      producer: "cadence_pi_evidence_envelope_service",
      producerVersion: CADENCE_PI_EVIDENCE_ENVELOPE_VERSION,
      sourceEvidenceIds: sourceEvidenceIds(observations),
      repositoryReads: 0,
      persistenceWrites: 0,
    },
  };
  if (JSON.stringify({
    cadence, evidenceWindow, comparisonWindow, evaluationDate, timeZone,
    activeGoal, activePhase, canonicalTrainingEvidence, weights, energyDays,
    recoveryEvidenceRecords, dexaScans, photoSessions, trainingReport,
  }) !== JSON.stringify(before)) {
    throw new Error("Cadence PI evidence envelope input mutation detected.");
  }
  return freeze(result);
}

function normalizeEnergyDays(days) {
  return (Array.isArray(days) ? days : []).map((day) => ({
    ...structuredClone(day),
    calorieIntake: finite(day.calorieIntake ?? day.estimatedIntake),
    estimatedExpenditure: finite(day.estimatedExpenditure),
    energyBalance: finite(day.energyBalance ?? day.balance),
    pairedCompleteness: day.pairedCompleteness ?? day.completeness ?? "complete",
    completeness: day.completeness ?? "complete",
    nutritionDayId: day.nutritionDayId ?? day.evidenceRefs?.[0] ?? null,
    activityDayId: day.activityDayId ?? day.evidenceRefs?.[1] ?? null,
    rmrScanId: day.rmrScanId ?? day.evidenceRefs?.[2] ?? null,
  }));
}

function selectDexaThroughCutoff(scans, cutoff) {
  return (Array.isArray(scans) ? scans : []).filter((scan) => {
    const date = String(scan?.measuredAt ?? scan?.date ?? "").slice(0, 10);
    return date && date <= cutoff;
  });
}

function eventCandidates(observations) {
  return [
    ...(observations.some((item) => item.domain === "dexa")
      ? [{ candidateType: "dexa_event", participatingDomains: ["dexa"] }]
      : []),
    ...(observations.some((item) => item.domain === "photos")
      ? [{ candidateType: "photo_event", participatingDomains: ["photos"] }]
      : []),
  ];
}

function domainCoverage(observations) {
  return Object.fromEntries([
    "training", "energy", "weight", "recovery", "dexa", "photos",
  ].map((domain) => {
    const values = observations.filter((item) => item.domain === domain);
    return [domain, {
      state: values.some((item) => item.status !== "insufficient_data")
        ? "available" : values.length ? "insufficient" : "missing",
      observationCount: values.length,
      sourceEvidenceCount: sourceEvidenceIds(values).length,
    }];
  }));
}

function completeness(observations) {
  const domains = domainCoverage(observations);
  return {
    overall: ["training", "energy", "weight"].every((domain) =>
      domains[domain].state === "available") ? "complete" : "partial",
    ...Object.fromEntries(Object.entries(domains).map(([domain, value]) =>
      [domain, value.state === "available" ? "complete" : value.state === "missing"
        ? "missing" : "partial"])),
  };
}

function sourceEvidenceIds(observations) {
  return [...new Set(observations.flatMap((item) =>
    item.supportingEvidenceIds ?? item.provenance?.sourceEvidenceIds ?? []
  ).filter(Boolean).map(String))].sort();
}

function requireCadence(value) {
  if (!["daily", "midweek", "weekly", "monthly"].includes(value)) {
    throw new Error("Cadence PI evidence envelope requires a supported cadence.");
  }
}

function requireWindow(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value?.startDate ?? "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value?.endDate ?? "")) {
    throw new Error("Cadence PI evidence envelope requires a canonical window.");
  }
}

function inside(value, window) {
  const date = String(value ?? "").slice(0, 10);
  return Boolean(date && date >= window.startDate && date <= window.endDate);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
