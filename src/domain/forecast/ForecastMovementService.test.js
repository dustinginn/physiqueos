import { describe, expect, it } from "vitest";
import { determineForecastMovement } from "./ForecastMovementService";

describe("Forecast durability-gated movement", () => {
  it("holds emerging proxy support even when the band improves", () => {
    expect(movement({ band: "moderate", durability: durability() }))
      .toMatchObject({ direction: "no_meaningful_change",
        reasonCode: "proxy_support_emerging_hold" });
  });

  it.each(["repeated", "sustained"])(
    "permits one %s durability transition at the same Forecast status and band",
    (persistence) => {
      expect(movement({ durability: durability({ persistence,
        transition: persistence, count: persistence === "repeated" ? 2 : 3 }) }))
        .toMatchObject({ direction: "increase",
          kind: "proxy_durability_transition",
          reasonCode: `proxy_support_${persistence}_increase` });
    }
  );

  it("allows a safe named uncertainty reduction", () => {
    expect(movement({ durability: durability({ reduced: ["energy_uncertain"] }) }))
      .toMatchObject({ direction: "increase", kind: "uncertainty_reduction",
        reasonCode: "uncertainty_reduced_increase" });
  });

  it("blocks proxy movement when material contradiction exists", () => {
    expect(movement({ durability: durability({ persistence: "repeated",
      transition: "repeated", count: 2, contradiction: "material_direct" }) }))
      .toMatchObject({ direction: "no_meaningful_change",
        reasonCode: "material_contradiction_blocks_increase" });
  });

  it("holds same-period revisions and duplicate evidence", () => {
    expect(movement({ durability: durability({ persistence: "repeated",
      count: 2, samePeriodRevision: true }) })).toMatchObject({
      direction: "no_meaningful_change",
      reasonCode: "same_period_revision_no_new_durability",
    });
    expect(movement({ durability: durability({ persistence: "repeated",
      count: 2, duplicateEvidence: true }) })).toMatchObject({
      direction: "no_meaningful_change",
      reasonCode: "duplicate_evidence_no_change",
    });
  });

  it("preserves material status-and-band transitions", () => {
    expect(movement({ status: "on_forecast", band: "high",
      durability: durability() })).toMatchObject({
      direction: "increase", kind: "material_forecast_transition",
      reasonCode: "material_forecast_transition",
    });
  });
});

function movement({ status = "forecast_uncertain", band = "moderate",
  durability: evidenceDurability }) {
  return determineForecastMovement({
    goalForecastStatus: status,
    confidenceBand: band,
    currentStrategyRevision: "strategy-v1",
    interpretationSemanticFingerprint: "current",
    previousForecastContext: {
      priorForecastRef: "prior", strategyRevision: "strategy-v1",
      goalForecastStatus: "forecast_uncertain", confidenceBand: "moderate",
      interpretationSemanticFingerprint: "prior",
    },
    structuredInterpretation: interpretation(evidenceDurability),
  });
}

function interpretation(evidenceDurability) {
  return {
    strategyValidation: { status: "directionally_supported" },
    evidenceReconciliation: {
      quality: { status: "adequate" }, durability: evidenceDurability,
    },
    objectiveEvaluation: { conclusions: [{ status: "uncertain" }] },
    guardrailEvaluation: { conclusions: [{ status: "clear" }] },
  };
}

function durability({ persistence = "emerging", transition = null, count = 1,
  contradiction = "none", reduced = [], samePeriodRevision = false,
  duplicateEvidence = false } = {}) {
  return {
    persistence, transition, independentPeriodCount: count,
    contradictionState: contradiction,
    triggeringCapabilities: transition ? ["training_progression"] : [],
    corroboratingCapabilityCount: 1,
    currentPeriod: { id: "week-2" },
    reducedUncertaintyKeys: reduced,
    uncertaintyComparisonSafe: reduced.length > 0,
    samePeriodRevision,
    duplicateEvidence,
    signals: [{ capability: "training_progression", persistence,
      priorPersistence: persistence === "emerging" ? "emerging" :
        persistence === "repeated" ? "emerging" : "repeated" }],
  };
}
