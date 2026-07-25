import { describe, expect, it } from "vitest";
import { createPIObservation } from "./PIObservationService";
import { assessPITrainingEnergyReadiness } from "./PITrainingEnergyReadinessService";

describe("PI Training Energy readiness", () => {
  it.each([
    ["daily", window("2026-07-24", "2026-07-24"), 1],
    ["midweek", window("2026-07-20", "2026-07-24"), 4],
    ["weekly", window("2026-07-19", "2026-07-25"), 7],
  ])("marks exact-ready %s inputs deterministically", (cadence, evidenceWindow, days) => {
    const first = assess({
      cadence,
      evidenceWindow,
      completePairedDays: days,
    });
    const second = assess({
      cadence,
      evidenceWindow,
      completePairedDays: days,
    });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      cadence,
      window: evidenceWindow,
      energyCompleteness: "complete",
      compatibility: { state: "exact_match" },
      authorityReady: true,
      reason: "exact_ready",
      repositoryReads: 0,
      runtimeClockReads: 0,
      authoritativeOutputChanges: 0,
      memoryMutations: 0,
    });
  });

  it.each([
    ["no session", { currentWindowSessionCount: 0 }, "no_training_session_in_current_window"],
    ["rolling trend only", { currentWindowSessionCount: 0, sourceStart: "2026-07-01" }, "no_training_session_in_current_window"],
    ["partial Daily Energy", { partialDays: 1, completePairedDays: 0 }, "daily_energy_evidence_not_exact"],
    ["event-owned surface", { event: "photo_event" }, "higher_authority_event_owns_surface"],
    ["direct overlap", { redundant: true }, "semantic_overlap_redundant"],
  ])("keeps Daily shadow-only for %s", (_name, options, reason) => {
    const result = assess({
      cadence: "daily",
      evidenceWindow: window("2026-07-24", "2026-07-24"),
      ...options,
    });
    expect(result.authorityReady).toBe(false);
    expect(result.reasons).toContain(reason);
  });

  it.each([
    ["off-by-one", { energyWindow: window("2026-07-21", "2026-07-24") }, "training_energy_window_overlap_only"],
    ["DEXA authority", { event: "dexa_event" }, "higher_authority_event_owns_surface"],
    ["Photo authority", { event: "photo_event" }, "higher_authority_event_owns_surface"],
    ["mandatory Energy repetition", { redundant: true }, "semantic_overlap_redundant"],
  ])("keeps Midweek shadow-only for %s", (_name, options, reason) => {
    const result = assess({
      cadence: "midweek",
      evidenceWindow: window("2026-07-20", "2026-07-24"),
      completePairedDays: 4,
      ...options,
    });
    expect(result.authorityReady).toBe(false);
    expect(result.reasons).toContain(reason);
  });

  it("keeps comparison sessions separate and accepts partial cadence Energy with reduced confidence", () => {
    const result = assess({
      cadence: "midweek",
      evidenceWindow: window("2026-07-20", "2026-07-24"),
      completePairedDays: 3,
      partialDays: 1,
      comparisonWindowSessionCount: 2,
    });
    expect(result).toMatchObject({
      authorityReady: true,
      energyCompleteness: "partial",
      trainingEvidence: {
        currentWindowSessionCount: 1,
        comparisonWindowSessionCount: 2,
      },
      claim: { confidence: { level: "low" } },
    });
  });

  it.each([
    ["Goal completion", "goal_completion"],
    ["Goal transition", "goal_transition"],
    ["milestone", "milestone"],
  ])("preserves Weekly %s authority", (_name, event) => {
    const result = assess({
      cadence: "weekly",
      evidenceWindow: window("2026-07-19", "2026-07-25"),
      completePairedDays: 7,
      event,
    });
    expect(result).toMatchObject({
      authorityReady: false,
      eventConflict: true,
      reason: "higher_authority_event_owns_surface",
    });
  });

  it("requires rendering and memory support without widening either window", () => {
    const evidenceWindow = window("2026-07-19", "2026-07-25");
    const result = assess({
      cadence: "weekly",
      evidenceWindow,
      completePairedDays: 6,
      partialDays: 1,
      renderingCompatible: false,
      memoryCompatible: false,
    });
    expect(result.window).toMatchObject(evidenceWindow);
    expect(result.reasons).toEqual(expect.arrayContaining([
      "rendering_unsupported",
      "memory_unsupported",
    ]));
    expect(result.claim.explanationData).not.toHaveProperty("proteinTarget");
  });
});

function assess({
  cadence,
  evidenceWindow,
  energyWindow = evidenceWindow,
  currentWindowSessionCount = 1,
  comparisonWindowSessionCount = 1,
  completePairedDays = cadence === "daily" ? 1 : 4,
  partialDays = 0,
  sourceStart = "2026-07-12",
  event = null,
  redundant = false,
  renderingCompatible = true,
  memoryCompatible = true,
}) {
  const training = trainingObservation({
    evidenceWindow,
    cadence,
    currentWindowSessionCount,
    comparisonWindowSessionCount,
    sourceStart,
  });
  const claimIdentity = "fixture-training-energy";
  return assessPITrainingEnergyReadiness({
    cadence,
    trainingObservations: [training],
    energyObservations: energyObservations({
      evidenceWindow: energyWindow,
      completePairedDays,
      partialDays,
    }),
    competingCandidates: [
      ...(event ? [{ candidateType: event, participatingDomains: ["training"] }] : []),
      ...(redundant ? [{
        id: claimIdentity,
        semanticFamily: claimIdentity,
        semanticOverlap: "redundant",
        participatingDomains: ["training", "energy"],
        explanationData: { trainingStatus: "improving" },
        limitations: partialDays ? ["energy_coverage_partial"] : [],
      }] : []),
    ],
    renderingCompatible,
    memoryCompatible,
  });
}

function trainingObservation({
  evidenceWindow,
  cadence,
  currentWindowSessionCount,
  comparisonWindowSessionCount,
  sourceStart,
}) {
  return createPIObservation({
    domain: "training",
    kind: "training_performance",
    semanticScope: "overall.resistance",
    subject: { type: "training_scope", id: "resistance", label: "Resistance training" },
    status: "improving",
    direction: "positive",
    evidenceWindow,
    supportingEvidenceIds: ["training-current"],
    confidence: { level: "moderate", method: "fixture" },
    explanationData: {
      cadenceWindow: {
        cadence,
        evidenceWindow,
        comparisonWindow: window("2026-07-12", "2026-07-18"),
        sourceWindow: { startDate: sourceStart, endDate: evidenceWindow.endDate },
        currentWindowSessionCount,
        comparisonWindowSessionCount,
        authoritativeEligible: currentWindowSessionCount > 0,
      },
    },
    provenance: {
      producer: "fixture",
      producerVersion: "v1",
      calculationMethod: "fixture",
      sourceEvidenceIds: ["training-current"],
    },
  });
}

function energyObservations({ evidenceWindow, completePairedDays, partialDays }) {
  const provenance = {
    producer: "fixture",
    producerVersion: "v1",
    calculationMethod: "fixture",
    sourceEvidenceIds: ["nutrition", "activity", "dexa"],
  };
  return [
    createPIObservation({
      domain: "energy",
      kind: "energy_balance",
      semanticScope: "cadence.balance",
      subject: { type: "energy_metric", id: "estimated_energy_balance", label: "Estimated energy balance" },
      status: completePairedDays ? "observed" : "insufficient_data",
      direction: "stable",
      evidenceWindow,
      supportingEvidenceIds: ["nutrition", "activity", "dexa"],
      confidence: { level: "moderate", method: "fixture" },
      explanationData: { currentAverage: 250 },
      provenance,
    }),
    createPIObservation({
      domain: "energy",
      kind: "paired_day_coverage",
      semanticScope: "cadence.coverage",
      subject: { type: "energy_evidence", id: "paired_day_coverage", label: "Paired coverage" },
      status: completePairedDays ? "observed" : "insufficient_data",
      direction: "not_applicable",
      evidenceWindow,
      supportingEvidenceIds: ["nutrition", "activity", "dexa"],
      confidence: { level: "moderate", method: "fixture" },
      explanationData: { completePairedDays, partialDays },
      provenance,
    }),
  ];
}

function window(startDate, endDate) {
  return { startDate, endDate };
}
