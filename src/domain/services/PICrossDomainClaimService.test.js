import { describe, expect, it } from "vitest";
import { createPIObservation } from "./PIObservationService";
import {
  PI_CLAIM_SCHEMA_VERSION,
  createPICrossDomainClaim,
  createPICrossDomainClaims,
  createWeightEnergyClaims,
  isPICrossDomainClaim,
  validatePICrossDomainClaim,
} from "./PICrossDomainClaimService";

const window = { startDate: "2026-07-14", endDate: "2026-07-20" };
const comparison = {
  comparisonStartDate: "2026-07-07",
  comparisonEndDate: "2026-07-13",
};

function observation({
  confidence = "high",
  direction = "stable",
  domain,
  horizon = "rolling_7_days",
  kind,
  limitations = [],
  status = "observed",
  subject = kind,
  evidenceWindow = { ...window, ...comparison },
} = {}) {
  return createPIObservation({
    domain,
    kind,
    semanticScope: `${horizon}.${subject}`,
    subject: { type: `${domain}_metric`, id: subject },
    status,
    direction,
    evidenceWindow,
    supportingEvidenceIds: [`evidence_${domain}_${subject}`],
    confidence: {
      level: confidence,
      limitations,
      method: `${domain}_evidence_sufficiency`,
    },
    explanationData: { calculationHorizon: horizon },
    provenance: {
      producer: `${domain}_pi_observation_service`,
      producerVersion: `${domain}_pi_v1`,
      calculationMethod: `${domain}_period_change`,
      sourceEvidenceIds: [`evidence_${domain}_${subject}`],
    },
  });
}

function weight(direction = "stable", overrides = {}) {
  return observation({
    domain: "weight",
    kind: "weight_average_change",
    subject: "average_comparison",
    direction,
    ...overrides,
  });
}

function energy(kind = "energy_intake", direction = "rising", overrides = {}) {
  return observation({
    domain: "energy",
    kind,
    subject: kind.replace("energy_", ""),
    direction,
    ...overrides,
  });
}

function coverage({
  completePairedDays = 7,
  confidence = "high",
  limitations = [],
  partialDays = 0,
  status = "observed",
  horizon = "rolling_7_days",
} = {}) {
  const result = observation({
    domain: "energy",
    kind: "paired_day_coverage",
    subject: "paired_day_coverage",
    direction: "not_applicable",
    confidence,
    limitations,
    status,
    horizon,
    evidenceWindow: window,
  });
  result.explanationData = {
    ...result.explanationData,
    completePairedDays,
    partialDays,
    nutritionOnlyDays: partialDays,
    activityOnlyDays: 0,
  };
  return result;
}

function synthesize({
  weightDirection = "stable",
  energyKind = "energy_intake",
  energyDirection = "rising",
  coverageObservation = coverage(),
  weightOverrides = {},
  energyOverrides = {},
} = {}) {
  return createPICrossDomainClaims([
    weight(weightDirection, weightOverrides),
    energy(energyKind, energyDirection, energyOverrides),
    ...(coverageObservation ? [coverageObservation] : []),
  ]);
}

describe("PICrossDomainClaimService contract", () => {
  it("creates a versioned, valid, JSON-safe claim without lifecycle or novelty", () => {
    const [claim] = synthesize();
    expect(claim).toMatchObject({
      schemaVersion: PI_CLAIM_SCHEMA_VERSION,
      kind: "intake_weight_stability",
      participatingDomains: ["energy", "weight"],
      materiality: { level: "unevaluated", method: "ranking_not_implemented" },
      provenance: {
        producer: "pi_cross_domain_claim_service",
        producerVersion: "pi_weight_energy_claims_v1",
        calculationMethod: "weight_energy_observation_relationship",
      },
    });
    expect(isPICrossDomainClaim(claim)).toBe(true);
    expect(validatePICrossDomainClaim(claim)).toBe(true);
    expect(JSON.parse(JSON.stringify(claim))).toEqual(claim);
    expect(claim).not.toHaveProperty("lifecycle");
    expect(claim).not.toHaveProperty("novelty");
  });

  it.each([
    ["stable", "energy_intake", "rising", "intake_weight_stability"],
    ["rising", "energy_intake", "stable", "intake_weight_change"],
    ["falling", "energy_intake", "stable", "intake_weight_change"],
    ["stable", "energy_expenditure", "falling", "expenditure_weight_stability"],
    ["stable", "energy_expenditure", "rising", "expenditure_weight_stability"],
    ["stable", "energy_balance", "rising", "energy_balance_weight_stability"],
    ["rising", "energy_balance", "stable", "energy_balance_weight_change"],
  ])(
    "maps measured %s Weight and %s %s to %s",
    (weightDirection, energyKind, energyDirection, expectedKind) => {
      const claims = synthesize({
        weightDirection,
        energyKind,
        energyDirection,
      });
      expect(claims).toHaveLength(1);
      expect(claims[0]).toMatchObject({
        kind: expectedKind,
        explanationData: { weightDirection, energyDirection },
      });
    }
  );

  it("rejects invalid observations and unsupported domains", () => {
    expect(() => createPICrossDomainClaims([{ domain: "weight" }])).toThrow();
    expect(() =>
      createPICrossDomainClaims([
        observation({
          domain: "nutrition",
          kind: "nutrition_adherence",
          subject: "adherence",
        }),
      ])
    ).toThrow(/Unsupported PI claim domains/);
  });

  it("rejects malformed claims and non-JSON-safe explanation data", () => {
    const [claim] = synthesize();
    expect(() =>
      validatePICrossDomainClaim({ ...claim, schemaVersion: "future" })
    ).toThrow();
    expect(() =>
      createPICrossDomainClaim({
        ...claim,
        id: undefined,
        explanationData: { invalid: undefined },
        semanticScope: "rolling_7_days",
      })
    ).toThrow(/JSON-safe/);
  });
});

describe("Daily Weight and Energy claim compatibility", () => {
  function dailyWeight(direction = "stable", evidenceWindow = window) {
    return observation({
      domain: "weight",
      kind: "weight_daily_rolling_average_change",
      subject: "body_weight",
      direction,
      horizon: "daily",
      evidenceWindow,
    });
  }

  function dailyEnergy(direction = "rising", evidenceWindow = {
    startDate: "2026-07-20",
    endDate: "2026-07-20",
  }) {
    return observation({
      domain: "energy",
      kind: "energy_intake",
      subject: "caloric_intake",
      direction,
      horizon: "daily",
      evidenceWindow,
    });
  }

  it("synthesizes exact Daily observations without changing rolling behavior", () => {
    const daily = createWeightEnergyClaims(
      [dailyWeight()],
      [dailyEnergy()]
    );
    const rolling = synthesize();
    expect(daily).toHaveLength(1);
    expect(daily[0].kind).toBe("intake_weight_stability");
    expect(daily[0].id).toContain("|daily");
    expect(rolling[0].id).toContain("|rolling_7_days");
  });

  it("keeps Daily claim identity stable across advancing evidence dates", () => {
    const first = createWeightEnergyClaims(
      [dailyWeight()],
      [dailyEnergy()]
    )[0];
    const next = createWeightEnergyClaims(
      [dailyWeight("stable", {
        startDate: "2026-07-15",
        endDate: "2026-07-21",
      })],
      [dailyEnergy("rising", {
        startDate: "2026-07-21",
        endDate: "2026-07-21",
      })]
    )[0];
    expect(next.id).toBe(first.id);
  });

  it("prefers the exact Daily Weight kind over a fallback kind in one horizon", () => {
    const fallbackSameHorizon = weight("stable", {
      horizon: "daily",
      evidenceWindow: window,
    });
    const exact = dailyWeight();
    const [claim] = createWeightEnergyClaims(
      [fallbackSameHorizon, exact],
      [dailyEnergy()]
    );
    expect(claim.participatingObservationIds).toContain(exact.id);
    expect(claim.participatingObservationIds).not.toContain(
      fallbackSameHorizon.id
    );
  });
});

describe("PICrossDomainClaimService eligibility and coverage", () => {
  it("requires overlapping windows and compatible semantic horizons", () => {
    const weightObservation = weight("stable");
    const laterEnergy = energy("energy_intake", "rising", {
      evidenceWindow: {
        startDate: "2026-08-01",
        endDate: "2026-08-07",
        ...comparison,
      },
    });
    const monthlyEnergy = energy("energy_intake", "rising", {
      horizon: "rolling_30_days",
    });
    const noOverlap = createWeightEnergyClaims([weightObservation], [laterEnergy]);
    const wrongHorizon = createWeightEnergyClaims([weightObservation], [monthlyEnergy]);
    expect(noOverlap.map((claim) => claim.kind)).toEqual(
      expect.arrayContaining([
        "insufficient_energy_to_explain_weight",
        "insufficient_weight_to_support_energy_claim",
      ])
    );
    expect(noOverlap.flatMap((claim) => claim.limitations)).toContain(
      "evidence_windows_do_not_overlap"
    );
    expect(wrongHorizon.flatMap((claim) => claim.limitations)).toContain(
      "semantic_horizon_mismatch"
    );
  });

  it.each([
    [coverage(), "complete", "high"],
    [
      coverage({
        completePairedDays: 4,
        confidence: "moderate",
        limitations: ["nutrition_without_activity"],
        partialDays: 2,
      }),
      "partial",
      "low",
    ],
    [null, "missing", "moderate"],
  ])("preserves %s coverage conservatively", (coverageObservation, state, level) => {
    const [claim] = synthesize({ coverageObservation });
    expect(claim.explanationData.coverage.state).toBe(state);
    expect(claim.confidence.level).toBe(level);
    if (state !== "complete") expect(claim.limitations.length).toBeGreaterThan(0);
  });

  it("emits explicit insufficiency claims for one-sided evidence", () => {
    const weightOnly = createWeightEnergyClaims([weight("rising")], []);
    const energyOnly = createWeightEnergyClaims([], [
      energy("energy_intake", "rising"),
    ]);
    expect(weightOnly[0]).toMatchObject({
      kind: "insufficient_energy_to_explain_weight",
      participatingDomains: ["weight"],
      limitations: expect.arrayContaining(["relationship_unavailable"]),
    });
    expect(energyOnly[0]).toMatchObject({
      kind: "insufficient_weight_to_support_energy_claim",
      participatingDomains: ["energy"],
      limitations: expect.arrayContaining(["relationship_unavailable"]),
    });
  });

  it("does not synthesize insufficient observations as measured relationships", () => {
    const insufficientWeight = weight("not_applicable", {
      status: "insufficient_data",
      confidence: "low",
    });
    const claims = createWeightEnergyClaims(
      [insufficientWeight],
      [energy("energy_intake", "rising")]
    );
    expect(claims).toHaveLength(1);
    expect(claims[0].kind).toBe(
      "insufficient_weight_to_support_energy_claim"
    );
  });
});

describe("PICrossDomainClaimService confidence and identity", () => {
  it("uses the weaker participant and never exceeds an observation", () => {
    const [claim] = synthesize({
      weightOverrides: { confidence: "moderate" },
      energyOverrides: { confidence: "very_high" },
      coverageObservation: coverage({ confidence: "high" }),
    });
    expect(claim.confidence.level).toBe("moderate");
    expect(claim.confidence.factors.map((factor) => factor.level)).toEqual(
      expect.arrayContaining(["moderate", "very_high", "high"])
    );
  });

  it("reduces confidence one level when limitations are present", () => {
    const [claim] = synthesize({
      weightOverrides: {
        confidence: "high",
        limitations: ["limited_weight_sampling"],
      },
      energyOverrides: { confidence: "high" },
      coverageObservation: coverage({ confidence: "high" }),
    });
    expect(claim.confidence.level).toBe("moderate");
    expect(claim.limitations).toContain("limited_weight_sampling");
  });

  it("preserves identity across windows and directional changes within one relationship", () => {
    const rising = synthesize({ weightDirection: "rising" })[0];
    const fallingAdvanced = synthesize({
      weightDirection: "falling",
      weightOverrides: {
        evidenceWindow: {
          startDate: "2026-07-21",
          endDate: "2026-07-27",
          comparisonStartDate: "2026-07-14",
          comparisonEndDate: "2026-07-20",
        },
      },
      energyOverrides: {
        evidenceWindow: {
          startDate: "2026-07-21",
          endDate: "2026-07-27",
          comparisonStartDate: "2026-07-14",
          comparisonEndDate: "2026-07-20",
        },
      },
      coverageObservation: coverage(),
    })[0];
    expect(rising.kind).toBe("intake_weight_change");
    expect(fallingAdvanced.kind).toBe("intake_weight_change");
    expect(rising.id).toBe(fallingAdvanced.id);
  });

  it("changes identity for relationship, horizon, or participating-domain changes", () => {
    const stable = synthesize()[0];
    const changed = synthesize({ weightDirection: "rising" })[0];
    const monthly = synthesize({
      weightOverrides: { horizon: "rolling_30_days" },
      energyOverrides: { horizon: "rolling_30_days" },
      coverageObservation: coverage({ horizon: "rolling_30_days" }),
    })[0];
    const insufficient = createWeightEnergyClaims([weight("stable")], [])[0];
    expect(new Set([stable.id, changed.id, monthly.id, insufficient.id]).size).toBe(4);
  });

  it("is stable across input ordering and ignores identical duplicates", () => {
    const inputs = [weight("stable"), energy(), coverage()];
    const forward = createPICrossDomainClaims(inputs);
    const reversed = createPICrossDomainClaims([...inputs].reverse());
    const duplicated = createPICrossDomainClaims([...inputs, ...inputs]);
    expect(reversed).toEqual(forward);
    expect(duplicated).toEqual(forward);
  });

  it("chooses one deterministic Weight observation when producers expose two compatible scopes", () => {
    const average = weight("stable");
    const shortWindow = observation({
      domain: "weight",
      kind: "weight_short_window_change",
      subject: "short_window",
      direction: "stable",
    });
    const claims = createPICrossDomainClaims([
      shortWindow,
      energy(),
      average,
      coverage(),
    ]);
    expect(claims).toHaveLength(1);
    expect(claims[0].participatingObservationIds).toContain(average.id);
    expect(claims[0].participatingObservationIds).not.toContain(shortWindow.id);
  });

  it("rejects conflicting duplicate observation identities", () => {
    const first = weight("stable");
    const conflict = { ...first, direction: "rising" };
    expect(() => createPICrossDomainClaims([first, conflict])).toThrow(
      /Conflicting duplicate/
    );
  });

  it("exposes structured explanation and producer metadata without narrative or coaching", () => {
    const [claim] = synthesize();
    expect(claim.explanationData).toMatchObject({
      semanticHorizon: "rolling_7_days",
      relationship: "intake",
      weightDirection: "stable",
      energyDirection: "rising",
      coverage: { state: "complete", completePairedDays: 7 },
      participatingObservationIds: claim.participatingObservationIds,
      sharedEvidenceWindow: window,
      confidenceBasis: {
        method: "weakest_participant_with_limitation_reduction",
      },
      limitations: [],
    });
    expect(claim.provenance.producerChain).toHaveLength(3);
    expect(JSON.stringify(claim)).not.toMatch(
      /recommend|should|coach|good|bad|progress|failure|metabolism|muscle|fat gain|maintenance calories|adaptation/i
    );
  });
});
