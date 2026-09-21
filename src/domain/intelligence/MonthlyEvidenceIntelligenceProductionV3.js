import { createEvidenceObservationV3 } from "./v3/EvidenceObservationV3.js";
import {
  MonthlyCrossSourceRelationshipV3,
  MonthlyMeasurementTypeV3,
  createMonthlyEvidenceIntelligenceV3,
} from "./v3/MonthlyEvidenceIntelligenceV3.js";
import { resolveNutritionDayAuthority } from "../models/nutritionDayAuthority.js";

// Production wiring for MonthlyEvidenceIntelligenceV3.
//
// The Monthly production path builds this intelligence from the same canonical
// evidence it already resolved, and the result reaches V3 as evidence:
//   - each source-matrix row (measurement type, reliability, uncertainty,
//     deviation) becomes a V3 observation carrying WEARABLE_ESTIMATE and
//     source-reliability semantics
//   - cross-source relationships (corroboration, tension, estimate-versus-
//     outcome) become V3 observations, and estimate-versus-outcome tension is
//     handed to the same Energy ambiguity path Weekly and Midweek use
// The intelligence itself is stored, bounded, on the artifact and served.
//
// Confidence is unchanged by this wiring: the module's own contract states that
// measurement uncertainty does not automatically lower Confidence.

export const MONTHLY_EVIDENCE_INTELLIGENCE_PRODUCTION_VERSION =
  "monthly_evidence_intelligence_production_v1";

export function buildMonthlyEvidenceIntelligenceInputV3({
  window,
  goal = null,
  evidenceFixture = {},
  currentConfidence = null,
} = {}) {
  const dependencies = evidenceFixture.canonicalDependencies ?? [];
  const byType = (type) => dependencies.filter((item) => (item?.payload ?? item)?.evidence_type === type)
    .map((item) => item?.payload ?? item);
  const expectedDays = daysBetween(window.startDate, window.cutoffDate ?? window.endDate);
  const surplusSupports = goal?.target?.direction === "increase";
  const deficitSupports = goal?.target?.direction === "decrease";
  const dateOf = (record) => String(record.observed_at ?? record.date ?? record.metadata?.date ?? "").slice(0, 10);

  const nutrition = latestPerDate(byType("nutrition"), dateOf).map((record) => {
    const authority = resolveNutritionDayAuthority(record);
    return {
      id: record.id ?? `nutrition-${dateOf(record)}`,
      date: dateOf(record),
      value: authority.dailyTotals.calories,
      expectedDays,
      usable: authority.energyUsable,
      deviation: false,
      direction: "indeterminate",
      limitations: [...authority.ambiguity],
    };
  });
  const activity = latestPerDate(byType("activity_day"), dateOf).map((record) => ({
    id: record.id ?? `activity-${dateOf(record)}`,
    date: dateOf(record),
    value: record.daily_activity?.move_calories ?? null,
    expectedDays,
    usable: Number.isFinite(Number(record.daily_activity?.move_calories)),
    deviation: false,
    direction: "indeterminate",
    limitations: ["active_expenditure_is_wearable_estimated"],
  }));
  const energy = (evidenceFixture.energyContinuations ?? []).filter((day) => Number.isFinite(day.balance))
    .map((day) => ({
      id: day.id ?? `energy-${day.date}`,
      date: day.date,
      balance: day.balance,
      direction: surplusSupports ? (day.balance >= 0 ? "supports" : "contradicts")
        : deficitSupports ? (day.balance <= 0 ? "supports" : "contradicts") : "indeterminate",
      limitations: ["expenditure_is_estimated"],
    }));
  const weight = (evidenceFixture.weights ?? []).map((entry) => ({
    id: entry.id ?? `weight-${String(entry.measuredAt).slice(0, 10)}`,
    date: String(entry.measuredAt ?? entry.date).slice(0, 10),
    value: entry.weight?.value ?? entry.value ?? null,
    expectedDays,
    usable: true,
    deviation: false,
    direction: "indeterminate",
  })).filter((item) => item.date >= window.startDate && item.date <= window.endDate);
  const scans = [...(evidenceFixture.dexaScans ?? [])]
    .sort((left, right) => String(left.measuredAt).localeCompare(String(right.measuredAt)));
  const outcomes = scans.filter((scan) => {
    const date = String(scan.measuredAt ?? "").slice(0, 10);
    return date >= window.startDate && date <= window.endDate;
  }).map((scan) => {
    const prior = scans[scans.indexOf(scan) - 1] ?? null;
    const change = Number(scan.leanMass?.value ?? scan.leanMass) - Number(prior?.leanMass?.value ?? prior?.leanMass);
    return {
      id: scan.id,
      observedAt: String(scan.measuredAt).slice(0, 10),
      direction: !Number.isFinite(change) ? "indeterminate"
        : (goal?.target?.direction === "increase" ? change > 0 : change < 0) ? "supports"
          : change === 0 ? "indeterminate" : "contradicts",
      quality: "robust",
      statement: Number.isFinite(change)
        ? `Lean mass measured ${change >= 0 ? "up" : "down"} ${Math.abs(Math.round(change * 10) / 10)} lb since the prior scan.`
        : "A body-composition scan was recorded.",
    };
  });
  const sessions = byType("training").map((record) => ({
    id: record.id,
    date: dateOf(record),
    categories: [...new Set((record.exercises ?? []).map((exercise) =>
      String(exercise.body_region ?? "").toLowerCase()).filter(Boolean))],
  }));

  return {
    window: {
      startDate: window.startDate,
      endDate: window.endDate,
      cutoff: window.cutoff,
    },
    goalPolicy: { domains: {
      outcome: { goalRelevance: "direct" },
      photos: { goalRelevance: "supporting" },
      training: { goalRelevance: "high" },
      nutrition: { goalRelevance: "supporting" },
      activity: { goalRelevance: "contextual" },
      energy: { goalRelevance: "supporting" },
      weight: { goalRelevance: "supporting" },
    } },
    outcomes,
    photos: [],
    training: { sessions, baselineSessions: [], configuredSplit: null, coachingCandidates: [] },
    nutrition,
    activity,
    energy,
    weight,
    recovery: [],
    execution: [],
    historicalCalibration: [],
    communicationMemory: [],
    currentConfidence,
  };
}

export function createMonthlyEvidenceIntelligenceForProduction(args) {
  const input = buildMonthlyEvidenceIntelligenceInputV3(args);
  return createMonthlyEvidenceIntelligenceV3(input);
}

// Source-matrix rows and relationships -> V3 observations.
export function adaptMonthlyIntelligenceObservationsV3({
  intelligence,
  goalContract,
  phase = null,
  artifactId,
  window,
} = {}) {
  if (!intelligence?.sourceMatrix) return [];
  const endDate = String(window?.endDate ?? intelligence.window?.endDate ?? "").slice(0, 10);
  const observedAt = new Date(`${endDate}T00:00:00.000Z`).toISOString();
  const base = {
    relatedGoalIds: [goalContract.goalId],
    phaseId: phase?.id ?? goalContract.phase.phaseId,
    strategyRevisionId: goalContract.strategy.strategyRevisionId,
    highSalienceEvent: false,
    evidenceWindow: window ?? null,
    observedAt,
    status: "active",
    directness: "behavioral",
  };
  const tensionByRow = new Map();
  for (const relationship of intelligence.relationships ?? []) {
    if (relationship.type !== MonthlyCrossSourceRelationshipV3.ESTIMATE_VS_OUTCOME) continue;
    for (const sourceId of relationship.sourceIds) tensionByRow.set(sourceId, relationship);
  }
  const observations = [];
  for (const row of intelligence.sourceMatrix) {
    const tension = tensionByRow.get(row.sourceId) ?? null;
    observations.push(createEvidenceObservationV3({
      ...base,
      observationId: `cadence_v3|${artifactId}|monthly|${row.sourceId}`,
      canonicalRecordId: `monthly_matrix|${row.sourceId}`,
      sourceType: `canonical_${row.domain}_observation`,
      displayLabel: `Monthly ${row.domain} evidence`,
      quality: {
        status: row.quality,
        provenance: "monthly_evidence_intelligence_v3",
        precision: row.measurementType === MonthlyMeasurementTypeV3.WEARABLE_ESTIMATE ? "estimated" : "derived",
        completeness: row.facts?.coverageRatio != null && row.facts.coverageRatio < 1 ? "partial" : "reported",
        comparability: "unknown",
        coverageRatio: row.facts?.coverageRatio ?? null,
      },
      capabilities: [{
        capabilityId: `monthly.evidence.${row.domain}`,
        value: row.facts?.coverageRatio ?? row.facts?.pairedDays ?? 0,
        factualSummary: row.statement,
        metadata: {
          signalDirection: "neutral",
          matrixDirection: row.direction,
          measurementType: row.measurementType,
          deviation: row.deviation,
          strategicConsequence: row.strategicConsequence,
          narrativeConsequence: row.narrativeConsequence,
          ambiguity: [...(row.uncertainty ?? [])],
          facts: row.facts ?? null,
          ...(tension ? { tension: {
            type: "estimate_vs_outcome_tension",
            materiality: "high",
            lagPlausible: false,
            relationshipId: tension.relationshipId,
          } } : {}),
        },
      }],
      limitations: [...(row.uncertainty ?? [])],
      sourceReferences: [],
    }));
  }
  for (const relationship of intelligence.relationships ?? []) {
    observations.push(createEvidenceObservationV3({
      ...base,
      observationId: `cadence_v3|${artifactId}|monthly|${relationship.relationshipId}`,
      canonicalRecordId: `monthly_matrix|${relationship.relationshipId}`,
      sourceType: "canonical_energy_observation",
      displayLabel: "Monthly cross-source relationship",
      quality: {
        status: "adequate",
        provenance: "monthly_evidence_intelligence_v3",
        precision: "derived",
        completeness: "reported",
        comparability: "unknown",
        coverageRatio: null,
      },
      capabilities: [{
        capabilityId: "monthly.evidence.relationship",
        value: 1,
        factualSummary: relationship.strategicConsequence ?? null,
        metadata: {
          signalDirection: "neutral",
          relationshipType: relationship.type,
          sourceIds: [...relationship.sourceIds],
          strongerSourceId: relationship.strongerSourceId ?? null,
        },
      }],
      limitations: relationship.type === MonthlyCrossSourceRelationshipV3.ESTIMATE_VS_OUTCOME
        ? ["estimate_vs_outcome_tension"] : [],
      sourceReferences: [],
    }));
  }
  return observations;
}

// Bounded, serializable summary served with the Monthly artifact. This is a
// production consumer of the intelligence, not a shadow-only projection.
export function summarizeMonthlyIntelligenceV3(intelligence) {
  if (!intelligence) return null;
  return {
    schemaVersion: MONTHLY_EVIDENCE_INTELLIGENCE_PRODUCTION_VERSION,
    window: intelligence.window,
    sourceMatrix: intelligence.sourceMatrix.map((row) => ({
      sourceId: row.sourceId,
      domain: row.domain,
      measurementType: row.measurementType,
      quality: row.quality,
      uncertainty: row.uncertainty,
      deviation: row.deviation,
      direction: row.direction,
      statement: row.statement,
    })),
    relationships: intelligence.relationships.map((item) => ({
      relationshipId: item.relationshipId,
      type: item.type,
      sourceIds: item.sourceIds,
      strategicConsequence: item.strategicConsequence,
    })),
    personalCalibration: intelligence.personalCalibration
      ? { currentRelationship: intelligence.personalCalibration.currentRelationship,
        comparableWindows: intelligence.personalCalibration.comparableWindows } : null,
    recommendation: intelligence.recommendation,
    confidenceConsequence: intelligence.confidenceConsequence,
    selectedHighlights: (intelligence.selectedHighlights ?? []).map((item) => ({
      candidateId: item.candidateId, domain: item.domain, headline: item.headline ?? null,
    })),
  };
}

function latestPerDate(records, dateOf) {
  const byDate = new Map();
  for (const record of records) {
    const date = dateOf(record);
    if (!date) continue;
    byDate.set(date, record);
  }
  return [...byDate.values()].sort((left, right) => dateOf(left).localeCompare(dateOf(right)));
}

function daysBetween(start, end) {
  const from = Date.parse(`${String(start).slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${String(end).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(from) && Number.isFinite(to) ? Math.max(1, Math.round((to - from) / 86400000) + 1) : 1;
}
