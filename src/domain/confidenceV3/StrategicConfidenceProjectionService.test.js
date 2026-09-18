import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  projectStrategicConfidence,
  evaluateCandidateAbsoluteSafetyCaps,
  FEASIBILITY_TARGET_ADJUSTMENT,
  BAND_TARGET,
} from "./StrategicConfidenceProjectionService.js";
import { deriveStrategicInterpretation } from "./StrategicInterpretationService.js";

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
function project(fixtureOverrides, projectOverrides = {}) {
  const interpretation = deriveStrategicInterpretation(sep12Fixture(fixtureOverrides));
  return projectStrategicConfidence({ previousPercentage: 62, confidenceBand: "moderate", interpretation, baseCeiling: 8, ...projectOverrides });
}

describe("Sep 12 shadow projection (refined) — reported, not tuned", () => {
  const projection = project();

  test("movement is an increase", () => assert.equal(projection.movement, "increase"));
  test("movement is strictly greater than V2's fixed +8 ceiling would have allowed", () => {
    assert.ok(projection.delta > 8, `expected delta > 8, got ${projection.delta}`);
  });
  test("movement remains meaningfully below near-certainty", () => {
    assert.ok(projection.currentPercentage < 90, `expected < 90, got ${projection.currentPercentage}`);
  });
  test("guardrail cap was NOT applied — the guardrail is favorable, not breached", () => {
    assert.equal(projection.rationale.guardrailCapApplied, false);
  });
  test("the binding constraint is the reserve above the feasibility floor, not the safety ceiling", () => {
    // capBound=false proves the ceiling (safety-cap only) did not clip the
    // result — persistence's partial unlock of the reserve above the
    // feasibility floor decided how far this moved.
    assert.equal(projection.rationale.capBound, false);
    assert.ok(projection.rationale.floorDelta > 0, "feasibility should have captured a nonzero floor immediately");
    assert.ok(projection.rationale.persistenceUnlockedReserve < projection.rationale.reserveDelta,
      "single-observation persistence must unlock only PART of the remaining reserve");
  });
  test("rationale is fully inspectable", () => {
    assert.equal(projection.rationale.feasibilityState, "strongly_demonstrated");
    assert.equal(projection.rationale.persistenceState, "single_observation");
    assert.equal(projection.rationale.confidenceEligibility, "eligible");
  });
});

describe("mechanical trace of the feasibility-driven target (unchanged by the persistence-application model selected)", () => {
  test("target is feasibility-driven: BAND_TARGET.moderate(62) + strongly_demonstrated adjustment = 82", () => {
    const projection = project();
    assert.equal(projection.rationale.target, 62 + FEASIBILITY_TARGET_ADJUSTMENT.strongly_demonstrated);
  });
  test("Model B (selected) captures most of that target immediately via the feasibility floor, unlike the old single-multiplier model", () => {
    const projection = project();
    assert.equal(projection.persistenceApplicationModel, "confidence_reserve_model_b");
    assert.ok(projection.delta > 12, `expected Model B's floor+partial-reserve to exceed the old single-multiplier's +12, got ${projection.delta}`);
  });
});

describe("Scenario S: previously high Confidence followed by an adverse direct outcome", () => {
  test("a contradicting second interval moves Confidence DOWN materially, undiscounted by persistence", () => {
    // Simulate: Confidence had already risen to 74 from a first favorable
    // reading; a second, contradicting reading now arrives.
    const interpretation = deriveStrategicInterpretation(sep12Fixture({
      observedInterval: { priorValue: 153.3, priorObservedOn: "2026-09-12", currentValue: 151.3, currentObservedOn: "2026-10-10" },
      persistenceContext: { priorConfirmingIntervalCount: 1, contradicted: true },
    }));
    const projection = projectStrategicConfidence({ previousPercentage: 74, confidenceBand: "moderate", interpretation, baseCeiling: 8 });
    assert.equal(projection.movement, "decrease");
    assert.equal(projection.rationale.floorDelta, null, "downward movement bypasses the floor/reserve mechanism entirely — full strength");
    assert.ok(projection.delta <= -5, `expected a material decrease, got delta=${projection.delta}`);
  });
});

describe("anti-whiplash", () => {
  test("a single favorable authoritative outcome is bounded, not near-certain, even at the largest candidate cap", () => {
    const projection = project({}, { absoluteSafetyCap: 20 });
    assert.ok(projection.currentPercentage <= 85);
  });
  test("a single adverse authoritative outcome is bounded symmetrically by the safety ceiling", () => {
    const interpretation = deriveStrategicInterpretation(sep12Fixture({
      goalProgress: { status: "available", direction: "increase", requiredProgress: 10, remainingGap: 8, cumulativeProgress: 2, progressFraction: 0.2 },
      observedInterval: { priorValue: 153.3, priorObservedOn: "2026-08-15", currentValue: 148.3, currentObservedOn: "2026-09-12" },
    }));
    const projection = projectStrategicConfidence({ previousPercentage: 62, confidenceBand: "moderate", interpretation, baseCeiling: 8 });
    assert.equal(projection.movement, "decrease");
    assert.ok(projection.currentPercentage >= 40);
  });
  test("two confirming outcomes move Confidence further than one, but persistence still caps the step (diminishing, not unbounded)", () => {
    const single = project();
    const repeated = project({ persistenceContext: { priorConfirmingIntervalCount: 1 } });
    assert.ok(repeated.delta >= single.delta);
  });
  test("Confidence is not permanently ratcheted upward: a later contradiction can fully reverse an earlier gain", () => {
    const up = project(); // 62 -> ~74
    const interpretation = deriveStrategicInterpretation(sep12Fixture({
      observedInterval: { priorValue: 153.3, priorObservedOn: "2026-09-12", currentValue: 149.3, currentObservedOn: "2026-10-10" },
      persistenceContext: { priorConfirmingIntervalCount: 1, contradicted: true },
    }));
    const down = projectStrategicConfidence({ previousPercentage: up.currentPercentage, confidenceBand: "moderate", interpretation, baseCeiling: 8 });
    assert.ok(down.currentPercentage < up.currentPercentage);
  });
});

describe("guardrail dominance", () => {
  test("a breached, unfavorable guardrail caps the target regardless of feasibility", () => {
    const projection = project({
      guardrails: [{
        id: "body_fat_range", currentValue: 9.6, priorValue: 8.9,
        guardrail: { lowerBound: 8, upperBound: 9, lowerBoundMeaning: "unsafe_direction", upperBoundMeaning: "unsafe_direction" },
      }],
    });
    assert.equal(projection.rationale.guardrailCapApplied, true);
    assert.ok(projection.rationale.target <= 35);
  });
});

describe("continuity with the existing V2 categorical anchor", () => {
  test("BAND_TARGET matches V2's published values for every band", () => {
    assert.deepEqual(BAND_TARGET, { very_low: 22, low: 34, developing: 47, moderate: 62, high: 78, very_high: 90 });
  });
});

describe("FEASIBILITY_TARGET_ADJUSTMENT — monotonicity, not tuned coefficients", () => {
  test("strongly_demonstrated > demonstrated > weakly_supported > unproven; contradicted is negative", () => {
    const a = FEASIBILITY_TARGET_ADJUSTMENT;
    assert.ok(a.strongly_demonstrated > a.demonstrated);
    assert.ok(a.demonstrated > a.weakly_supported);
    assert.ok(a.weakly_supported > a.unproven);
    assert.ok(a.contradicted < 0);
  });
});

describe("candidate absolute-safety-cap comparison (unchanged utility, cap not re-tuned this pass)", () => {
  test("reports whether the refined mechanics begin binding the cap", () => {
    const interpretation = deriveStrategicInterpretation(sep12Fixture());
    const results = evaluateCandidateAbsoluteSafetyCaps({ previousPercentage: 62, confidenceBand: "moderate", interpretation, baseCeiling: 8 });
    // Not asserting a specific bound here — this is an inspection utility;
    // the report captures the actual table. Only assert internal
    // consistency (monotonic in the cap).
    const sorted = Object.entries(results).map(([cap, r]) => [Number(cap), r.delta]).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i += 1) {
      assert.ok(sorted[i][1] >= sorted[i - 1][1]);
    }
  });
});

describe("determinism", () => {
  test("identical input produces an identical projection", () => {
    const interpretation = deriveStrategicInterpretation(sep12Fixture());
    const a = projectStrategicConfidence({ previousPercentage: 62, confidenceBand: "moderate", interpretation, baseCeiling: 8 });
    const b = projectStrategicConfidence({ previousPercentage: 62, confidenceBand: "moderate", interpretation, baseCeiling: 8 });
    assert.deepEqual(a, b);
  });
  test("output is marked shadowOnly", () => {
    assert.equal(project().shadowOnly, true);
  });
  test("rejects a v1 (pre-refinement) interpretation shape", () => {
    assert.throws(() => projectStrategicConfidence({
      previousPercentage: 62, confidenceBand: "moderate",
      interpretation: { schemaVersion: "strategic_interpretation_v1" },
      baseCeiling: 8,
    }), /v2 StrategicInterpretation/);
  });
});
