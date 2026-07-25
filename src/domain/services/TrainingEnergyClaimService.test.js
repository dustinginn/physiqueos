import { describe, expect, it } from "vitest";
import { createPIObservation } from "./PIObservationService";
import { createTrainingEnergyClaims } from "./TrainingEnergyClaimService";

describe("Training Energy claims", () => {
  it.each([
    ["improving", 250, "stable", "training_progress_with_positive_energy_support"],
    ["improving", 50, "stable", "training_progress_with_neutral_energy_support"],
    ["improving", -250, "stable", "training_progress_despite_negative_energy_balance"],
    ["stable", 250, "stable", "training_stability_with_positive_energy_balance"],
    ["stable", 50, "falling", "training_stability_with_declining_energy_support"],
    ["regressing", -250, "stable", "training_decline_with_negative_energy_balance"],
    ["regressing", 250, "stable", "training_decline_despite_positive_energy_balance"],
  ])("maps %s with %s kcal to %s", (status, value, direction, kind) => {
    expect(claim({ status, value, direction }).explanationData.relationshipState).toBe(kind);
  });

  it.each(["daily", "midweek", "weekly"])("requires exact %s windows", (cadence) => {
    expect(claim({ cadence }).explanationData.windowCompatibility.compatible).toBe(true);
    const mismatch = claim({ cadence, energyWindow: { startDate: "2026-07-20", endDate: "2026-07-21" } });
    expect(mismatch.explanationData.relationshipState).toBe("training_energy_relationship_insufficient");
    expect(mismatch.limitations).toContain("training_energy_window_mismatch");
  });

  it("preserves partial coverage and bounds confidence below the weaker input", () => {
    const result = claim({ partialDays: 1, confidence: "moderate" });
    expect(result.explanationData).toMatchObject({ coverageState: "partial", partialDayCount: 1 });
    expect(result.confidence.level).toBe("low");
  });

  it.each([
    ["missing", 0, 0],
    ["unpaired", 0, 1],
  ])("produces insufficiency for %s Energy", (_state, completePairedDays, partialDays) => {
    expect(claim({ completePairedDays, partialDays, coverageStatus: "insufficient_data" }).explanationData.relationshipState)
      .toBe("training_energy_relationship_insufficient");
  });

  it("preserves identity across values, direction, confidence, and dates", () => {
    expect(claim({ value: -300 }).id).toBe(claim({ value: 400, direction: "rising" }).id);
  });

  it("is repository-free, clock-free, immutable, non-causal, and non-prescriptive", () => {
    const training = trainingObservation();
    const energy = energyObservations({});
    const before = structuredClone({ training, energy });
    const result = createTrainingEnergyClaims({ trainingObservations: [training], energyObservations: energy, cadence: "weekly" })[0];
    expect({ training, energy }).toEqual(before);
    expect(result.explanationData).toMatchObject({
      causalInference: false,
      leanMassConclusion: null,
      maintenanceConclusion: null,
    });
    expect(result.explanationData).not.toHaveProperty("recommendation");
    expect(JSON.stringify(result)).not.toMatch(/caused|more calories|required|optimal/i);
  });
});

function claim(options = {}) {
  return createTrainingEnergyClaims({
    trainingObservations: [trainingObservation(options)],
    energyObservations: energyObservations(options),
    cadence: options.cadence ?? "weekly",
  })[0];
}

function trainingObservation({ status = "improving", window = defaultWindow(), confidence = "moderate" } = {}) {
  return createPIObservation({
    id: "performance|overall|resistance",
    domain: "training",
    kind: "training_performance",
    subject: { type: "training_scope", id: "resistance", label: "Resistance training" },
    status,
    direction: status === "improving" ? "positive" : status === "regressing" ? "negative" : "neutral",
    evidenceWindow: window,
    supportingEvidenceIds: ["training-session"],
    confidence: { level: confidence, method: "fixture" },
    explanationData: {},
    provenance: { producer: "fixture", producerVersion: "v1", calculationMethod: "fixture", sourceEvidenceIds: ["training-session"] },
  });
}

function energyObservations({
  value = 250,
  direction = "stable",
  energyWindow = defaultWindow(),
  completePairedDays = 7,
  partialDays = 0,
  coverageStatus = "observed",
  confidence = "moderate",
} = {}) {
  const provenance = { producer: "fixture", producerVersion: "v1", calculationMethod: "fixture", sourceEvidenceIds: ["nutrition", "activity", "dexa"] };
  return [
    createPIObservation({
      domain: "energy", kind: "energy_balance",
      semanticScope: "weekly.balance",
      subject: { type: "energy_metric", id: "estimated_energy_balance", label: "Estimated energy balance" },
      status: "observed", direction, evidenceWindow: energyWindow,
      supportingEvidenceIds: ["nutrition", "activity", "dexa"],
      confidence: { level: confidence, method: "fixture" },
      explanationData: { currentAverage: value, rmrSources: [{ scanId: "dexa" }] },
      provenance,
    }),
    createPIObservation({
      domain: "energy", kind: "paired_day_coverage",
      semanticScope: "weekly.paired_day_coverage",
      subject: { type: "energy_evidence", id: "paired_day_coverage", label: "Paired coverage" },
      status: coverageStatus, direction: "not_applicable", evidenceWindow: energyWindow,
      supportingEvidenceIds: ["nutrition", "activity", "dexa"],
      confidence: { level: confidence, method: "fixture" },
      explanationData: { completePairedDays, partialDays },
      provenance,
    }),
  ];
}

function defaultWindow() {
  return { startDate: "2026-07-19", endDate: "2026-07-25" };
}
