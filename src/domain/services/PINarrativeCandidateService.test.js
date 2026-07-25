import { describe, expect, it } from "vitest";
import { createPIObservation } from "./PIObservationService";
import { createPICrossDomainClaim } from "./PICrossDomainClaimService";
import {
  CADENCE_RMR_STRATEGIES,
  createCadenceEnergyAssessment,
} from "./CadenceEnergyAssessmentService";
import {
  createPIClaimNarrativeCandidate,
  createPIEnergyTrendNarrativeCandidate,
  createPIObservationNarrativeCandidate,
  evaluatePINarrativeCandidateLifecycle,
  selectPINarrativeCandidates,
  validatePINarrativeCandidate,
} from "./PINarrativeCandidateService";

function training({ id = "performance|overall|resistance", status = "improving" } = {}) {
  return createPIObservation({
    id,
    domain: "training",
    kind: "training_performance",
    subject: { type: "training_scope", id: "resistance", label: "Resistance" },
    status,
    direction: status === "regressing" ? "negative" : "positive",
    evidenceWindow: { startDate: "2026-07-01", endDate: "2026-07-21" },
    supportingEvidenceIds: ["session-1", "session-2"],
    confidence: {
      level: "high", score: 80, reasons: ["representative"], factors: [],
      limitations: [], method: "training_session_count",
    },
    materiality: {
      level: "high", score: 75, basis: ["performance_change"],
      method: "training_change",
    },
    goalContext: {
      observationRole: "progress",
      primaryOutcomeRelevance: true,
      guardrailRelevance: false,
      phaseRelevance: true,
      configuredRelevance: true,
      limitations: [],
    },
    explanationData: { representative: true },
    provenance: {
      producer: "test", producerVersion: "v1",
      calculationMethod: "test", sourceEvidenceIds: ["session-1", "session-2"],
      sourceObservationIds: [], producerChain: [],
    },
  });
}

function assessment(startDate, endDate, calories) {
  const dates = [startDate, endDate];
  return createCadenceEnergyAssessment({
    cadence: "midweek",
    window: { startDate, endDate, timeZone: "America/Los_Angeles" },
    nutritionDays: dates.map((date, index) => ({
      id: `n-${date}`, date, totals: { calories: calories[index] },
    })),
    activityDays: dates.map((date) => ({
      id: `a-${date}`, date, activeCalories: 500,
    })),
    dexaScans: [{
      id: "dexa", measuredAt: "2026-06-01",
      restingMetabolicRate: { value: 1800 },
    }],
    rmrStrategy: CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW,
  });
}

function claim() {
  return createPICrossDomainClaim({
    kind: "training_progress_weight_stability",
    participatingObservationIds: ["t", "w"],
    participatingDomains: ["training", "weight"],
    semanticScope: "midweek.overall",
    evidenceWindow: {
      startDate: "2026-07-19", endDate: "2026-07-21",
      comparisonStartDate: "2026-07-12", comparisonEndDate: "2026-07-14",
    },
    confidence: {
      level: "high", score: 80, reasons: ["paired"], factors: [],
      limitations: [], method: "cross_domain_confidence",
    },
    materiality: {
      level: "high", score: 75, basis: ["change"],
      method: "cross_domain_materiality",
    },
    explanationData: {
      relationship: "training_and_weight",
      trainingDirection: "improving",
      weightDirection: "stable",
      coverage: { state: "complete" },
      evidenceOverlap: "complete",
    },
    provenance: {
      producer: "test", producerVersion: "v1", calculationMethod: "test",
      sourceObservationIds: ["t", "w"], producerChain: [],
    },
    limitations: [],
  });
}

describe("PINarrativeCandidateService", () => {
  it("normalizes all three deterministic candidate types without prose", () => {
    const direct = createPIObservationNarrativeCandidate({
      observation: training(),
    });
    const energy = createPIEnergyTrendNarrativeCandidate({
      currentAssessment: assessment("2026-07-19", "2026-07-21", [2400, 2500]),
      comparisonAssessment: assessment("2026-07-12", "2026-07-14", [2100, 2200]),
    });
    const cross = createPIClaimNarrativeCandidate({ claim: claim() });
    [direct, energy, cross].forEach((candidate) =>
      expect(validatePINarrativeCandidate(candidate)).toBe(true)
    );
    expect(energy.id).toBe("pi_narrative|energy_trend|midweek.energy_calibration");
    expect(JSON.stringify([direct, energy, cross])).not.toMatch(
      /recommendation|renderedNarrative/
    );
  });

  it("preserves Energy identity across date and direction changes", () => {
    const first = createPIEnergyTrendNarrativeCandidate({
      currentAssessment: assessment("2026-07-19", "2026-07-21", [2400, 2500]),
      comparisonAssessment: assessment("2026-07-12", "2026-07-14", [2100, 2200]),
    });
    const second = createPIEnergyTrendNarrativeCandidate({
      currentAssessment: assessment("2026-07-26", "2026-07-28", [1900, 2000]),
      comparisonAssessment: assessment("2026-07-19", "2026-07-21", [2400, 2500]),
    });
    expect(second.id).toBe(first.id);
    expect(second.direction).not.toBe(first.direction);
  });

  it("ranks direct Training above routine Energy for Build Lean Mass", () => {
    const direct = createPIObservationNarrativeCandidate({
      observation: training(),
    });
    const energy = createPIEnergyTrendNarrativeCandidate({
      currentAssessment: assessment("2026-07-19", "2026-07-21", [2200, 2200]),
      comparisonAssessment: assessment("2026-07-12", "2026-07-14", [2200, 2200]),
    });
    const result = selectPINarrativeCandidates([energy, direct], {
      cadence: "midweek",
      activeGoal: { title: "Build Lean Mass" },
    }, { requireEnergyContext: true });
    expect(result.primary[0].candidate.candidateType).toBe("direct_training");
    expect(result.supporting[0].candidate.candidateType).toBe("energy_trend");
  });

  it("suppresses unchanged communicated candidates and resurfaces direction change", () => {
    const current = createPIObservationNarrativeCandidate({
      observation: training(),
    });
    const first = evaluatePINarrativeCandidateLifecycle(current, null, {
      evaluationDate: "2026-07-21",
    });
    const unchanged = evaluatePINarrativeCandidateLifecycle(current, first, {
      evaluationDate: "2026-07-28",
    });
    expect(selectPINarrativeCandidates([unchanged], {
      communicatedCandidateIds: [current.id],
    }).primary).toEqual([]);
    const regressing = createPIObservationNarrativeCandidate({
      observation: training({ status: "regressing" }),
    });
    const changed = evaluatePINarrativeCandidateLifecycle(regressing, unchanged, {
      evaluationDate: "2026-08-04",
    });
    expect(changed.lifecycle.state).toBe("contradicted");
    expect(selectPINarrativeCandidates([changed], {
      communicatedCandidateIds: [current.id],
    }).primary).toHaveLength(1);
  });
});
