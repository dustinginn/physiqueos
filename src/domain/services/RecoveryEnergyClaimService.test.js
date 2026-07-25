import { describe, expect, it } from "vitest";
import { createPIObservation } from "./PIObservationService";
import { createRecoveryEnergyClaims } from "./RecoveryEnergyClaimService";

const window = { startDate: "2026-07-19", endDate: "2026-07-25" };
function observation(domain, kind, status, direction, subjectId, data = {}) {
  return createPIObservation({
    domain, kind, semanticScope: `weekly.${subjectId}`,
    subject: { type: `${domain}_metric`, id: subjectId },
    status, direction, evidenceWindow: window,
    supportingEvidenceIds: [`${domain}-${kind}`],
    confidence: { level: "moderate", limitations: [], method: "fixture" },
    explanationData: data,
    provenance: { producer: "fixture", producerVersion: "fixture_v1",
      calculationMethod: "fixture", sourceEvidenceIds: [`${domain}-${kind}`] },
  });
}
function claim(recoveryState, balance) {
  const recovery = observation(
    "recovery", "recovery_state",
    recoveryState === "strained" ? "regressing" : recoveryState,
    recoveryState === "strained" ? "negative" : recoveryState === "improving" ? "positive" : "stable",
    "whole_body"
  );
  return createRecoveryEnergyClaims({
    recoveryAssessment: {
      compositeState: recoveryState, conflictState: "none",
      completeness: "complete", freshness: "current", limitations: [],
    },
    recoveryObservations: [recovery],
    energyObservations: [
      observation("energy", "energy_balance", "observed", "stable", "estimated_energy_balance", { value: balance }),
      observation("energy", "paired_day_coverage", "observed", "not_applicable", "paired_day_coverage", { completePairedDays: 3, partialDays: 0 }),
    ],
    cadence: "weekly",
  })[0];
}

describe("RecoveryEnergyClaimService", () => {
  it.each([
    ["stable", 200, "recovery_stability_with_positive_energy_support"],
    ["stable", 0, "recovery_stability_with_neutral_energy_support"],
    ["strained", -200, "recovery_strain_with_negative_energy_balance"],
    ["strained", 200, "recovery_strain_despite_positive_energy_support"],
    ["improving", -200, "recovery_improvement_despite_negative_energy_balance"],
  ])("maps %s Recovery and %s Energy", (recovery, balance, expected) => {
    expect(claim(recovery, balance).explanationData.relationshipState).toBe(expected);
  });

  it("uses a stable semantic identity and weaker-input confidence ceiling", () => {
    const positive = claim("stable", 200);
    const negative = claim("strained", -200);
    expect(positive.id).toBe(negative.id);
    expect(positive.confidence.level).toBe("moderate");
    expect(positive.explanationData).toMatchObject({
      causalInference: false, protocolConclusion: null,
    });
  });
});
