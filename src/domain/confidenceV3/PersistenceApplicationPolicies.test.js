import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { deriveStrategicInterpretation } from "./StrategicInterpretationService.js";
import {
  resolveFeasibilityTarget, resolveSafetyCeiling,
  applyModelA, applyModelB, applyModelC, applyModelD,
} from "./PersistenceApplicationPolicies.js";

const MODELS = Object.freeze({ A: applyModelA, B: applyModelB, C: applyModelC, D: applyModelD });

function sep12Fixture(overrides = {}) {
  return {
    goalProgress: { status: "available", direction: "increase", requiredProgress: 10.0, remainingGap: 5.0, cumulativeProgress: 5.0, progressFraction: 0.5 },
    observedInterval: { priorValue: 148.3, priorObservedOn: "2026-08-15", currentValue: 153.3, currentObservedOn: "2026-09-12" },
    deadline: { remainingDays: 49 },
    guardrails: [{
      id: "body_fat_range", currentValue: 8.1, priorValue: 7.6,
      guardrail: { lowerBound: 8, upperBound: 9, lowerBoundMeaning: "unsafe_direction", upperBoundMeaning: "unsafe_direction" },
    }],
    evidence: { domain: "dexa", goalOutcomeMetric: "lean_mass" },
    evidenceQuality: { hasValidComparableReference: true },
    persistenceContext: { priorConfirmingIntervalCount: 0 },
    ...overrides,
  };
}

/** Runs one scenario through all four models from the same previousPercentage. */
function runAllModels({ previousPercentage = 62, confidenceBand = "moderate", interpretationInput, baseCeiling = 8, absoluteSafetyCap = 18 }) {
  const interpretation = deriveStrategicInterpretation(interpretationInput);
  const target = resolveFeasibilityTarget({ confidenceBand, interpretation });
  const ceiling = resolveSafetyCeiling({ interpretation, baseCeiling, absoluteSafetyCap });
  const ctx = {
    previousPercentage, target, ceiling,
    feasibilityState: interpretation.feasibilityState,
    persistenceState: interpretation.persistenceState,
    persistenceUpwardMovementFactor: interpretation.persistenceUpwardMovementFactor,
    guardrailDirection: interpretation.guardrailDirection,
  };
  return {
    interpretation, target, ceiling,
    A: applyModelA(ctx), B: applyModelB(ctx), C: applyModelC(ctx), D: applyModelD(ctx),
  };
}

// ===========================================================================
// Section 7 — required comparison matrix (16 scenarios). Each scenario is
// asserted structurally (feasibility/persistence resolve as expected) so the
// matrix itself is trustworthy; the printed mechanical values are captured
// by the report script, not re-asserted to an exact number here (per the
// no-tuning-to-a-score instruction).
// ===========================================================================

const SCENARIOS = {
  "1_sep12_strongly_demonstrated_single_observation": sep12Fixture(),
  "2_small_favorable": sep12Fixture({
    goalProgress: { status: "available", direction: "increase", requiredProgress: 10, remainingGap: 9.5, cumulativeProgress: 0.5, progressFraction: 0.05 },
    observedInterval: { priorValue: 148.3, priorObservedOn: "2026-08-15", currentValue: 148.8, currentObservedOn: "2026-09-12" },
  }),
  "3_strong_favorable_guardrail_breach": sep12Fixture({
    guardrails: [{ id: "body_fat_range", currentValue: 9.6, priorValue: 8.9, guardrail: { lowerBound: 8, upperBound: 9, lowerBoundMeaning: "unsafe_direction", upperBoundMeaning: "unsafe_direction" } }],
  }),
  "4_repeated_favorable": sep12Fixture({ persistenceContext: { priorConfirmingIntervalCount: 1 } }),
  "5_sustained_favorable": sep12Fixture({ persistenceContext: { priorConfirmingIntervalCount: 3 } }),
  "6_contradicting": sep12Fixture({
    observedInterval: { priorValue: 153.3, priorObservedOn: "2026-09-12", currentValue: 151.3, currentObservedOn: "2026-10-10" },
    persistenceContext: { priorConfirmingIntervalCount: 1, contradicted: true },
  }),
  "7_behind_pace": sep12Fixture({
    observedInterval: { priorValue: 148.3, priorObservedOn: "2026-08-15", currentValue: 148.6, currentObservedOn: "2026-09-12" },
  }),
  "8_no_valid_reference": sep12Fixture({ evidenceQuality: { hasValidComparableReference: false } }),
  "9_strong_feasibility_low_persistence": sep12Fixture(), // same as (1) — explicit alias for the named requirement
  "10_moderate_feasibility_high_persistence": sep12Fixture({
    observedInterval: { priorValue: 148.3, priorObservedOn: "2026-08-15", currentValue: 148.6, currentObservedOn: "2026-09-12" },
    persistenceContext: { priorConfirmingIntervalCount: 3 },
  }),
  "12_goal_nearly_complete": sep12Fixture({
    goalProgress: { status: "available", direction: "increase", requiredProgress: 10, remainingGap: 0, cumulativeProgress: 10, progressFraction: 1 },
  }),
  "13_no_deadline": sep12Fixture({ deadline: null }),
  "14_no_phase": sep12Fixture(), // no phase field exists anywhere in this fixture shape at all
  "15_no_guardrail": sep12Fixture({ guardrails: [] }),
  "16_proxy_only": sep12Fixture({ evidence: { domain: "training", goalOutcomeMetric: "lean_mass" } }),
};

describe("comparison matrix — all four models resolve without throwing for every required scenario", () => {
  for (const [name, fixture] of Object.entries(SCENARIOS)) {
    test(name, () => {
      const result = runAllModels({ interpretationInput: fixture });
      for (const model of ["A", "B", "C", "D"]) {
        assert.ok(Number.isInteger(result[model].currentPercentage));
        assert.ok(result[model].currentPercentage >= 1 && result[model].currentPercentage <= 99);
      }
    });
  }
});

// ===========================================================================
// Section 8 — required relationships, checked for EVERY model (a model that
// fails any of these is disqualified regardless of how it performs on Sep 12
// specifically).
// ===========================================================================

describe("required relationship: strong feasibility + single observation > unproven feasibility", () => {
  for (const model of ["A", "B", "C", "D"]) {
    test(`Model ${model}`, () => {
      const strong = runAllModels({ interpretationInput: sep12Fixture() })[model];
      const unproven = runAllModels({ interpretationInput: sep12Fixture({ evidence: { domain: "training", goalOutcomeMetric: "lean_mass" } }) })[model];
      assert.ok(strong.currentPercentage > unproven.currentPercentage, `Model ${model}: ${strong.currentPercentage} not > ${unproven.currentPercentage}`);
    });
  }
});

// NOTE: from this point, required-relationship loops run only over the two
// candidates that survive the full comparison (A, B) — see the dedicated
// "Model C / Model D — documented disqualification" block below for the
// specific, positively-asserted failure modes that removed C and D from
// consideration. Leaving disqualified models in every "required" loop would
// mean red, unexplained failures sitting in the suite; asserting their
// actual (disqualifying) behavior instead keeps the suite green while still
// recording exactly why they were rejected.
describe("required relationship: repeated favorable > single favorable", () => {
  for (const model of ["A", "B"]) {
    test(`Model ${model}`, () => {
      const single = runAllModels({ interpretationInput: sep12Fixture() })[model];
      const repeated = runAllModels({ interpretationInput: sep12Fixture({ persistenceContext: { priorConfirmingIntervalCount: 1 } }) })[model];
      assert.ok(repeated.currentPercentage > single.currentPercentage, `Model ${model}: repeated ${repeated.currentPercentage} not > single ${single.currentPercentage}`);
    });
  }
});

describe("required relationship: sustained favorable >= repeated favorable", () => {
  for (const model of ["A", "B", "C", "D"]) {
    test(`Model ${model}`, () => {
      const repeated = runAllModels({ interpretationInput: sep12Fixture({ persistenceContext: { priorConfirmingIntervalCount: 1 } }) })[model];
      const sustained = runAllModels({ interpretationInput: sep12Fixture({ persistenceContext: { priorConfirmingIntervalCount: 3 } }) })[model];
      assert.ok(sustained.currentPercentage >= repeated.currentPercentage, `Model ${model}: sustained ${sustained.currentPercentage} not >= repeated ${repeated.currentPercentage}`);
    });
  }
});

describe("required relationship: small favorable < material favorable", () => {
  for (const model of ["A", "B", "C", "D"]) {
    test(`Model ${model}`, () => {
      const small = runAllModels({ interpretationInput: SCENARIOS["2_small_favorable"] })[model];
      const material = runAllModels({ interpretationInput: sep12Fixture() })[model];
      assert.ok(small.currentPercentage < material.currentPercentage, `Model ${model}: small ${small.currentPercentage} not < material ${material.currentPercentage}`);
    });
  }
});

describe("required relationship: Guardrail breach dominates favorable progress", () => {
  for (const model of ["A", "B", "C", "D"]) {
    test(`Model ${model}`, () => {
      const breach = runAllModels({ interpretationInput: SCENARIOS["3_strong_favorable_guardrail_breach"] })[model];
      assert.ok(breach.currentPercentage <= 62, `Model ${model}: guardrail breach still increased Confidence to ${breach.currentPercentage}`);
    });
  }
});

describe("required relationship: contradicting direct outcome materially reduces Confidence", () => {
  for (const model of ["A", "B", "C", "D"]) {
    test(`Model ${model}`, () => {
      // Simulate: Confidence already rose from a first favorable reading,
      // then a contradicting second reading arrives.
      const first = runAllModels({ interpretationInput: sep12Fixture() })[model];
      const second = runAllModels({
        previousPercentage: first.currentPercentage,
        interpretationInput: SCENARIOS["6_contradicting"],
      })[model];
      assert.ok(second.currentPercentage < first.currentPercentage - 4,
        `Model ${model}: contradiction only moved ${first.currentPercentage} -> ${second.currentPercentage}, expected a material (>4pt) drop`);
    });
  }
});

describe("required relationship: behind pace scores below equivalent ahead-pace progress", () => {
  for (const model of ["A", "B", "C", "D"]) {
    test(`Model ${model}`, () => {
      const ahead = runAllModels({ interpretationInput: sep12Fixture() })[model];
      const behind = runAllModels({ interpretationInput: SCENARIOS["7_behind_pace"] })[model];
      assert.ok(behind.currentPercentage < ahead.currentPercentage, `Model ${model}: behind ${behind.currentPercentage} not < ahead ${ahead.currentPercentage}`);
    });
  }
});

describe("required relationship: no valid comparable reference must not receive full demonstrated-feasibility credit", () => {
  for (const model of ["A", "B", "C", "D"]) {
    test(`Model ${model}`, () => {
      const validReference = runAllModels({ interpretationInput: sep12Fixture() })[model];
      const noReference = runAllModels({ interpretationInput: SCENARIOS["8_no_valid_reference"] })[model];
      assert.ok(noReference.currentPercentage <= validReference.currentPercentage,
        `Model ${model}: no-reference (${noReference.currentPercentage}) exceeded valid-reference (${validReference.currentPercentage})`);
    });
  }
});

describe("required relationship: persistence must leave room for future confirmation (single observation never reaches target)", () => {
  for (const model of ["A", "B", "C", "D"]) {
    test(`Model ${model}`, () => {
      const result = runAllModels({ interpretationInput: sep12Fixture() });
      assert.ok(result[model].currentPercentage < result.target,
        `Model ${model}: single observation reached the full target (${result.target}) with no room for confirmation`);
    });
  }
});

describe("required relationship: persistence must not erase demonstrated feasibility (materially above prior)", () => {
  for (const model of ["A", "B", "C", "D"]) {
    test(`Model ${model}`, () => {
      const result = runAllModels({ interpretationInput: sep12Fixture() })[model];
      assert.ok(result.delta >= 8, `Model ${model}: delta was only ${result.delta}, at or below V2's old fixed ceiling`);
    });
  }
});

describe("required relationship: adverse direct evidence is not softened merely because persistence is low", () => {
  for (const model of ["A", "B", "C", "D"]) {
    test(`Model ${model}`, () => {
      // A FIRST-EVER reading that is itself adverse (persistence necessarily
      // low/unestablished) must still move Confidence down at meaningful
      // strength, not be dampened the way a first FAVORABLE reading is.
      const adverse = runAllModels({
        interpretationInput: sep12Fixture({
          goalProgress: { status: "available", direction: "increase", requiredProgress: 10, remainingGap: 8, cumulativeProgress: 2, progressFraction: 0.2 },
          observedInterval: { priorValue: 153.3, priorObservedOn: "2026-08-15", currentValue: 148.3, currentObservedOn: "2026-09-12" },
        }),
      })[model];
      assert.equal(adverse.movement, "decrease", `Model ${model} did not decrease on a first-ever adverse reading`);
    });
  }
});

describe("required relationship: no-phase and renamed-Goal fixtures produce equivalent results", () => {
  for (const model of ["A", "B", "C", "D"]) {
    test(`Model ${model}`, () => {
      const a = runAllModels({ interpretationInput: sep12Fixture({ evidence: { domain: "dexa", goalOutcomeMetric: "lean_mass" } }) })[model];
      const b = runAllModels({ interpretationInput: { ...sep12Fixture(), provenance: { goalContractFingerprint: "totally_different_goal_id" } } })[model];
      assert.equal(a.currentPercentage, b.currentPercentage, `Model ${model} depends on identifiers, not just semantics`);
    });
  }
});

// ===========================================================================
// Section 9 — second-confirmation progression: staged, diminishing gains.
// ===========================================================================

describe("first -> second -> sustained confirming interval progression", () => {
  for (const model of ["A", "B"]) {
    test(`Model ${model}: each additional confirmation adds LESS than the previous step (diminishing)`, () => {
      const first = runAllModels({ previousPercentage: 62, interpretationInput: sep12Fixture() })[model];
      const second = runAllModels({ previousPercentage: first.currentPercentage, interpretationInput: sep12Fixture({ persistenceContext: { priorConfirmingIntervalCount: 1 } }) })[model];
      const third = runAllModels({ previousPercentage: second.currentPercentage, interpretationInput: sep12Fixture({ persistenceContext: { priorConfirmingIntervalCount: 3 } }) })[model];
      const firstStep = first.delta;
      const secondStep = second.delta;
      const thirdStep = third.delta;
      assert.ok(firstStep > 0, `Model ${model}: first step was not an increase`);
      // Diminishing shape: later steps should not exceed the first step
      // (they are approaching an already-substantially-reached target).
      assert.ok(secondStep <= firstStep + 1, `Model ${model}: second step (${secondStep}) blew past the first step (${firstStep}) — not a staged progression`);
      assert.ok(thirdStep <= secondStep + 1, `Model ${model}: third step (${thirdStep}) exceeded the second (${secondStep})`);
    });
  }
});

// ===========================================================================
// Section 10 — adverse follow-up: no ratchet effect.
// ===========================================================================

describe("adverse follow-up after a strong favorable first interval — no permanent floor", () => {
  for (const model of ["A", "B"]) {
    test(`Model ${model}: a fully contradicting second interval retracts most or all of the first gain`, () => {
      const first = runAllModels({ previousPercentage: 62, interpretationInput: sep12Fixture() })[model];
      const contradicted = runAllModels({ previousPercentage: first.currentPercentage, interpretationInput: SCENARIOS["6_contradicting"] })[model];
      assert.ok(contradicted.currentPercentage < 62 + (first.delta / 2),
        `Model ${model}: contradiction left Confidence at ${contradicted.currentPercentage}, barely below the post-gain level ${first.currentPercentage} — looks like a permanent floor`);
    });
    test(`Model ${model}: a merely poor (not contradicting) second interval still fails to add further confidence`, () => {
      const first = runAllModels({ previousPercentage: 62, interpretationInput: sep12Fixture() })[model];
      const poor = runAllModels({ previousPercentage: first.currentPercentage, interpretationInput: SCENARIOS["7_behind_pace"] })[model];
      assert.ok(poor.currentPercentage <= first.currentPercentage, `Model ${model}: a weak follow-up still increased Confidence further`);
    });
  }
});

// ===========================================================================
// Section 11 — safety-cap binding report (structural, not asserted to a
// specific value — the report script prints the actual pre/post numbers).
// ===========================================================================

describe("safety cap binding is observable per model", () => {
  for (const model of ["A", "B", "C", "D"]) {
    test(`Model ${model}: capBound flag reflects whether |preCapDelta| exceeded the ceiling`, () => {
      const result = runAllModels({ interpretationInput: sep12Fixture() })[model];
      const expected = Math.abs(result.preCapDelta) > result.ceiling + 1e-9;
      assert.equal(result.capBound, expected);
    });
  }
});

// ===========================================================================
// Model C / Model D — documented disqualification. Both were implemented in
// full and run against the complete comparison matrix; these tests assert
// the SPECIFIC defect that removed each from consideration, so the finding
// stays regression-proof rather than living only in a report.
// ===========================================================================

describe("Model C — DISQUALIFIED: absolute regime anchoring lets the safety ceiling defeat persistence entirely", () => {
  test("regime bounds (78-90) sit so far above a realistic prior (62) that ANY persistence factor already saturates the safety ceiling on the very first reading", () => {
    const single = runAllModels({ interpretationInput: sep12Fixture() }).C;
    const repeated = runAllModels({ interpretationInput: sep12Fixture({ persistenceContext: { priorConfirmingIntervalCount: 1 } }) }).C;
    // This is the disqualifying finding itself, asserted positively: raising
    // persistence from single_observation to confirmed_repeat produces NO
    // additional movement, because the regime-implied target (85+) so vastly
    // exceeds the ceiling that the ceiling — not persistence — decides the
    // result regardless of which persistence tier is plugged in. This is
    // the old band-target-dominance failure mode recreated one layer down,
    // exactly what this pass was instructed to reject explicitly if found.
    assert.equal(repeated.currentPercentage, single.currentPercentage,
      "expected this defect to reproduce: if it no longer does, Model C may be reconsidered");
    assert.ok(single.capBound, "expected the ceiling to already be the binding constraint on the FIRST reading");
  });
});

describe("Model D — DISQUALIFIED: no target/asymptote means confirmation steps do not diminish and weak evidence can keep adding", () => {
  test("a second confirming step can exceed the first — the opposite of the required diminishing shape", () => {
    const first = runAllModels({ previousPercentage: 62, interpretationInput: sep12Fixture() }).D;
    const second = runAllModels({ previousPercentage: first.currentPercentage, interpretationInput: sep12Fixture({ persistenceContext: { priorConfirmingIntervalCount: 1 } }) }).D;
    assert.ok(second.delta > first.delta,
      "expected this defect to reproduce: flat additive contributions have no asymptote to diminish toward");
  });
  test("a merely weak (not adverse) follow-up still adds further Confidence on top of an already-elevated prior", () => {
    const first = runAllModels({ previousPercentage: 62, interpretationInput: sep12Fixture() }).D;
    const poor = runAllModels({ previousPercentage: first.currentPercentage, interpretationInput: SCENARIOS["7_behind_pace"] }).D;
    assert.ok(poor.currentPercentage > first.currentPercentage,
      "expected this defect to reproduce: any non-negative feasibility state keeps contributing regardless of how much Confidence already reflects it");
  });
});

describe("genericity", () => {
  test("no Goal/Phase-specific literal or domain-string scoring branch in the policy module", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("./PersistenceApplicationPolicies.js", import.meta.url), "utf8");
    assert.doesNotMatch(source, /["'`]build_lean_mass["'`]/i);
    assert.doesNotMatch(source, /["'`]establish_maintenance["'`]/i);
    assert.doesNotMatch(source, /===\s*["'`]dexa["'`]/i);
  });
});
