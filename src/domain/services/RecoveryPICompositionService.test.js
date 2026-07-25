import { describe, expect, it } from "vitest";
import { createRecoveryEvidenceRecord } from "../models/RecoveryEvidenceModel";
import { createPIObservation } from "./PIObservationService";
import { createRecoveryPIComposition } from "./RecoveryPICompositionService";

const current = { startDate: "2026-07-20", endDate: "2026-07-22" };
const comparison = { startDate: "2026-07-13", endDate: "2026-07-15" };
function recovery(value, date, suffix = "") {
  const timestamp = `${date}T14:00:00.000Z`;
  return createRecoveryEvidenceRecord({
    userId: "founder", metric: "subjective_recovery", value,
    evidenceDate: date, recordedAt: timestamp, createdAt: timestamp,
    updatedAt: timestamp, timezone: "America/Los_Angeles",
    source: { kind: "manual_check_in", name: "Morning Check-In",
      ingestionPath: "structured_recovery_check_in", recordedAt: timestamp },
    sourceRecordId: `${date}-subjective${suffix}`,
  });
}
function observation(domain, kind, data = {}) {
  return createPIObservation({
    domain, kind, semanticScope: `midweek.${domain}`,
    subject: { type: `${domain}_scope`, id: domain === "training" ? "resistance" : "estimated_energy_balance" },
    status: data.status ?? "improving",
    direction: data.direction ?? "positive",
    evidenceWindow: data.window ?? current,
    supportingEvidenceIds: [`${domain}-evidence`],
    confidence: { level: "moderate", limitations: [], method: "fixture" },
    explanationData: data.explanationData ?? {},
    provenance: { producer: "fixture", producerVersion: "fixture_v1",
      calculationMethod: "fixture", sourceEvidenceIds: [`${domain}-evidence`] },
  });
}
function compose(records, overrides = {}) {
  return createRecoveryPIComposition({
    records, cadence: "midweek", evidenceWindow: current,
    comparisonWindow: comparison, timezone: "America/Los_Angeles",
    evaluationDate: "2026-07-22",
    trainingObservations: [observation("training", "training_progress")],
    energyObservations: [
      observation("energy", "energy_balance", { status: "observed", explanationData: { value: 200 } }),
      observation("energy", "paired_day_coverage", { status: "observed", direction: "not_applicable", explanationData: { completePairedDays: 2, partialDays: 0 } }),
    ],
    ...overrides,
  });
}
const repeated = [
  recovery("good", "2026-07-20"),
  recovery("good", "2026-07-21"),
  recovery("average", "2026-07-13"),
  recovery("average", "2026-07-14"),
];

describe("RecoveryPICompositionService", () => {
  it("is silent-authority with zero or one Midweek Recovery date", () => {
    expect(compose([]).authorityReadyCandidates).toEqual([]);
    expect(compose([recovery("good", "2026-07-20")]).authorityReadyCandidates).toEqual([]);
  });

  it("activates threshold-ready relationship capabilities with repeated evidence", () => {
    const result = compose(repeated);
    expect(result.readiness.thresholdReady).toBe(true);
    expect(result.authorityReadyCandidates.some((candidate) =>
      candidate.relationshipKind === "recovery_training_relationship"
    )).toBe(true);
    expect(result.authorityReadyCandidates.some((candidate) =>
      candidate.relationshipKind === "recovery_energy_relationship"
    )).toBe(true);
  });

  it("preserves cadence-local lifecycle continuity without persistence", () => {
    const first = compose(repeated);
    const second = compose(repeated, {
      priorClaims: first.lifecycleResult.currentClaims,
      priorCandidates: first.candidates,
    });
    expect(second.lifecycleResult.currentClaims.every(
      (claim) => claim.lifecycle.state === "unchanged"
    )).toBe(true);
    expect(second.provenance).toMatchObject({ repositoryReads: 0, runtimeClockReads: 0 });
  });

  it("suppresses Recovery authority under event ownership", () => {
    const event = {
      candidateType: "dexa_event",
      participatingDomains: ["dexa"],
      semanticFamily: "dexa|event",
    };
    const result = compose(repeated, { competingCandidates: [event] });
    expect(result.authorityReadyCandidates).toEqual([]);
    expect(result.diagnostics.every((item) =>
      item.suppressionReasons.includes("semantic_overlap_or_higher_authority")
    )).toBe(true);
  });
});
