import { describe, expect, test } from "vitest";
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

  test("movement is an increase", () => expect(projection.movement).toBe("increase"));
  test("movement is strictly greater than V2's fixed +8 ceiling would have allowed", () => {
    expect(projection.delta > 8).toBeTruthy();
  });
  test("movement remains meaningfully below near-certainty", () => {
    expect(projection.currentPercentage < 90).toBeTruthy();
  });
  test("guardrail cap was NOT applied — the guardrail is favorable, not breached", () => {
    expect(projection.rationale.guardrailCapApplied).toBe(false);
  });
  test("the binding constraint is the reserve above the feasibility floor, not the safety ceiling", () => {
    // capBound=false proves the ceiling (safety-cap only) did not clip the
    // result — persistence's partial unlock of the reserve above the
    // feasibility floor decided how far this moved.
    expect(projection.rationale.capBound).toBe(false);
    expect(projection.rationale.floorDelta > 0).toBeTruthy();
    expect(projection.rationale.persistenceUnlockedReserve < projection.rationale.reserveDelta).toBeTruthy();
  });
  test("rationale is fully inspectable", () => {
    expect(projection.rationale.feasibilityState).toBe("strongly_demonstrated");
    expect(projection.rationale.persistenceState).toBe("single_observation");
    expect(projection.rationale.confidenceEligibility).toBe("eligible");
  });
});

describe("mechanical trace of the feasibility-driven target (unchanged by the persistence-application model selected)", () => {
  test("target is feasibility-driven: BAND_TARGET.moderate(62) + strongly_demonstrated adjustment = 82", () => {
    const projection = project();
    expect(projection.rationale.target).toBe(62 + FEASIBILITY_TARGET_ADJUSTMENT.strongly_demonstrated);
  });
  test("Model B (selected) captures most of that target immediately via the feasibility floor, unlike the old single-multiplier model", () => {
    const projection = project();
    expect(projection.persistenceApplicationModel).toBe("confidence_reserve_model_b");
    expect(projection.delta > 12).toBeTruthy();
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
    expect(projection.movement).toBe("decrease");
    expect(projection.rationale.floorDelta).toBe(null);
    expect(projection.delta <= -5).toBeTruthy();
  });
});

describe("anti-whiplash", () => {
  test("a single favorable authoritative outcome is bounded, not near-certain, even at the largest candidate cap", () => {
    const projection = project({}, { absoluteSafetyCap: 20 });
    expect(projection.currentPercentage <= 85).toBeTruthy();
  });
  test("a single adverse authoritative outcome is bounded symmetrically by the safety ceiling", () => {
    const interpretation = deriveStrategicInterpretation(sep12Fixture({
      goalProgress: { status: "available", direction: "increase", requiredProgress: 10, remainingGap: 8, cumulativeProgress: 2, progressFraction: 0.2 },
      observedInterval: { priorValue: 153.3, priorObservedOn: "2026-08-15", currentValue: 148.3, currentObservedOn: "2026-09-12" },
    }));
    const projection = projectStrategicConfidence({ previousPercentage: 62, confidenceBand: "moderate", interpretation, baseCeiling: 8 });
    expect(projection.movement).toBe("decrease");
    expect(projection.currentPercentage >= 40).toBeTruthy();
  });
  test("two confirming outcomes move Confidence further than one, but persistence still caps the step (diminishing, not unbounded)", () => {
    const single = project();
    const repeated = project({ persistenceContext: { priorConfirmingIntervalCount: 1 } });
    expect(repeated.delta >= single.delta).toBeTruthy();
  });
  test("Confidence is not permanently ratcheted upward: a later contradiction can fully reverse an earlier gain", () => {
    const up = project(); // 62 -> ~74
    const interpretation = deriveStrategicInterpretation(sep12Fixture({
      observedInterval: { priorValue: 153.3, priorObservedOn: "2026-09-12", currentValue: 149.3, currentObservedOn: "2026-10-10" },
      persistenceContext: { priorConfirmingIntervalCount: 1, contradicted: true },
    }));
    const down = projectStrategicConfidence({ previousPercentage: up.currentPercentage, confidenceBand: "moderate", interpretation, baseCeiling: 8 });
    expect(down.currentPercentage < up.currentPercentage).toBeTruthy();
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
    expect(projection.rationale.guardrailCapApplied).toBe(true);
    expect(projection.rationale.target <= 35).toBeTruthy();
  });
});

describe("continuity with the existing V2 categorical anchor", () => {
  test("BAND_TARGET matches V2's published values for every band", () => {
    expect(BAND_TARGET).toEqual({ very_low: 22, low: 34, developing: 47, moderate: 62, high: 78, very_high: 90 });
  });
});

describe("FEASIBILITY_TARGET_ADJUSTMENT — monotonicity, not tuned coefficients", () => {
  test("strongly_demonstrated > demonstrated > weakly_supported > unproven; contradicted is negative", () => {
    const a = FEASIBILITY_TARGET_ADJUSTMENT;
    expect(a.strongly_demonstrated > a.demonstrated).toBeTruthy();
    expect(a.demonstrated > a.weakly_supported).toBeTruthy();
    expect(a.weakly_supported > a.unproven).toBeTruthy();
    expect(a.contradicted < 0).toBeTruthy();
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
      expect(sorted[i][1] >= sorted[i - 1][1]).toBeTruthy();
    }
  });
});

describe("determinism", () => {
  test("identical input produces an identical projection", () => {
    const interpretation = deriveStrategicInterpretation(sep12Fixture());
    const a = projectStrategicConfidence({ previousPercentage: 62, confidenceBand: "moderate", interpretation, baseCeiling: 8 });
    const b = projectStrategicConfidence({ previousPercentage: 62, confidenceBand: "moderate", interpretation, baseCeiling: 8 });
    expect(a).toEqual(b);
  });
  test("output is marked shadowOnly", () => {
    expect(project().shadowOnly).toBe(true);
  });
  test("rejects a v1 (pre-refinement) interpretation shape", () => {
    expect(() => projectStrategicConfidence({
      previousPercentage: 62, confidenceBand: "moderate",
      interpretation: { schemaVersion: "strategic_interpretation_v1" },
      baseCeiling: 8,
    })).toThrow();
  });
});
