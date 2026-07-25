import { describe, expect, it } from "vitest";
import { createPIObservation } from "./PIObservationService";
import { createPIV3TrainingSupportShadowResult } from "./PIV3TrainingSupportShadowService";

describe("PI V3 Training support shadow", () => {
  it.each([
    ["daily", "2026-07-24", "2026-07-24"],
    ["midweek", "2026-07-19", "2026-07-22"],
    ["weekly", "2026-07-19", "2026-07-25"],
  ])("uses the exact %s window without artifact, memory, or recommendation authority", (cadence, startDate, endDate) => {
    const window = { startDate, endDate };
    const result = createPIV3TrainingSupportShadowResult({
      cadence,
      window,
      trainingObservations: [training(window)],
      energyObservations: energy(window),
      nutritionDays: nutrition(startDate, endDate),
      proteinTarget: {
        value: 167,
        unit: "g",
        sourceId: "nutrition-protocol",
        version: "v2",
        effectiveDate: startDate,
      },
    });
    expect(result.claims.map((claim) => claim.explanationData.relationshipState))
      .toEqual(expect.arrayContaining([
        "training_progress_with_positive_energy_support",
        "training_progress_with_consistent_protein_support",
      ]));
    expect(result.authority).toEqual({
      state: "shadow_only",
      artifactMutation: false,
      memoryMutation: false,
      recommendationMutation: false,
    });
    expect(result.provenance).toMatchObject({
      repositoryReads: 0,
      persistenceWrites: 0,
      runtimeClockReads: 0,
    });
  });

  it("rejects adjacent cadence evidence through structured insufficiency", () => {
    const result = createPIV3TrainingSupportShadowResult({
      cadence: "daily",
      window: { startDate: "2026-07-24", endDate: "2026-07-24" },
      trainingObservations: [training({ startDate: "2026-07-23", endDate: "2026-07-23" })],
      energyObservations: energy({ startDate: "2026-07-24", endDate: "2026-07-24" }),
      nutritionDays: nutrition("2026-07-24", "2026-07-24"),
      proteinTarget: { value: 167, unit: "g", sourceId: "protocol", version: "v1", effectiveDate: "2026-07-24" },
    });
    expect(result.claims.every((claim) =>
      claim.explanationData.relationshipState.endsWith("_insufficient")
    )).toBe(true);
  });
});

function training(window) {
  return createPIObservation({
    id: "performance|overall|resistance",
    domain: "training",
    kind: "training_performance",
    subject: { type: "training_scope", id: "resistance", label: "Resistance training" },
    status: "improving",
    direction: "positive",
    evidenceWindow: window,
    supportingEvidenceIds: ["training-session"],
    confidence: { level: "moderate", method: "fixture" },
    explanationData: {},
    provenance: { producer: "fixture", producerVersion: "v1", calculationMethod: "fixture", sourceEvidenceIds: ["training-session"] },
  });
}
function energy(window) {
  const completePairedDays =
    Math.floor((Date.parse(`${window.endDate}T00:00:00Z`) -
      Date.parse(`${window.startDate}T00:00:00Z`)) / 86400000) + 1;
  const shared = {
    domain: "energy",
    evidenceWindow: window,
    supportingEvidenceIds: ["nutrition", "activity", "dexa"],
    confidence: { level: "moderate", method: "fixture" },
    provenance: { producer: "fixture", producerVersion: "v1", calculationMethod: "fixture", sourceEvidenceIds: ["nutrition", "activity", "dexa"] },
  };
  return [
    createPIObservation({
      ...shared,
      id: "energy-balance",
      kind: "energy_balance",
      subject: { type: "energy_metric", id: "estimated_energy_balance", label: "Energy balance" },
      status: "observed",
      direction: "rising",
      explanationData: { currentAverage: 150, rmrSources: [{ scanId: "dexa" }] },
    }),
    createPIObservation({
      ...shared,
      id: "energy-coverage",
      kind: "paired_day_coverage",
      subject: { type: "energy_metric", id: "paired_day_coverage", label: "Paired coverage" },
      status: "observed",
      direction: "not_applicable",
      explanationData: { completePairedDays, partialDays: 0 },
    }),
  ];
}
function nutrition(startDate, endDate) {
  const values = [];
  for (let date = startDate; date <= endDate;) {
    values.push({ id: `nutrition-${date}`, date, daily_totals: { protein_g: 180 }, metadata: { completeness: "complete" } });
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    date = next.toISOString().slice(0, 10);
  }
  return values;
}
