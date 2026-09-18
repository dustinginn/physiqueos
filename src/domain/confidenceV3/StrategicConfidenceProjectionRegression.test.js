// Regression proof that promoting the shadow's Model B math into production
// (this module tree) reproduces the exact reviewed shadow result byte-for-
// byte: 62% -> 79% on the "Sep 12" fixture from
// PersistenceApplicationPolicies.test.js (bb64a72b/5ff537c6/53300b3e).
//
// This is NOT a claim that 79% is today's real Confidence for Build Lean
// Mass — see StrategicActivationService's docs and the Phase 15 report for
// why that number cannot be computed without real production evidence data,
// which is not present in this checkout (private/founder/runtime-store.json
// is gitignored and absent here). This test proves the ENGINE PORT is
// correct against the one number that was already reviewed, so a future
// production run of StrategicActivationService against real evidence is
// running the same math the Founder already validated, not a
// reimplementation that happens to look similar.
import { describe, expect, test } from "vitest";
import { deriveStrategicInterpretation } from "./StrategicInterpretationService.js";
import { projectStrategicConfidence } from "./StrategicConfidenceProjectionService.js";

// Exact fixture from PersistenceApplicationPolicies.test.js's sep12Fixture()
// default (scenario "1_sep12_strongly_demonstrated_single_observation").
// Reproduced exactly from PersistenceApplicationPolicies.test.js's
// sep12Fixture() default (do not "clean up" these values without re-running
// the shadow suite — the guardrail, deadline, and required-progress numbers
// are all load-bearing for feasibilityState/paceState classification).
function sep12InterpretationInput(overrides = {}) {
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

describe("Confidence V3 promoted Model B — Sep 12 regression", () => {
  test("reproduces the exact reviewed 62% -> 79% shadow result", () => {
    const interpretation = deriveStrategicInterpretation(sep12InterpretationInput());
    const projection = projectStrategicConfidence({
      previousPercentage: 62,
      confidenceBand: "moderate",
      interpretation,
      baseCeiling: 8,
    });
    expect(interpretation.feasibilityState).toBe("strongly_demonstrated");
    expect(interpretation.persistenceState).toBe("single_observation");
    expect(projection.previousPercentage).toBe(62);
    expect(projection.currentPercentage).toBe(79);
    expect(projection.delta).toBe(17);
    expect(projection.movement).toBe("increase");
    expect(projection.persistenceApplicationModel).toBe("confidence_reserve_model_b");
  });

  test("repeated favorable evidence moves further than a single observation, from the same starting band", () => {
    // Both projected from the SAME previousPercentage/confidenceBand (62%,
    // "moderate") so the comparison isolates persistence's effect, exactly
    // as PersistenceApplicationPolicies.test.js's required-relationship
    // proofs do (repeated > single). This deliberately does not assert an
    // exact number the shadow's own commit narrative mentioned in passing
    // (82%, computed by re-anchoring previousPercentage/confidenceBand to
    // the prior result) — re-deriving confidenceBand from a new percentage
    // is a Home/publication-time concern this pure module doesn't own, and
    // asserting an unverified number here would be exactly the "fit to a
    // fixture" this whole design pass was built to avoid.
    const single = projectStrategicConfidence({
      previousPercentage: 62, confidenceBand: "moderate", baseCeiling: 8,
      interpretation: deriveStrategicInterpretation(
        sep12InterpretationInput({ persistenceContext: { priorConfirmingIntervalCount: 0 } })),
    });
    const repeated = projectStrategicConfidence({
      previousPercentage: 62, confidenceBand: "moderate", baseCeiling: 8,
      interpretation: deriveStrategicInterpretation(
        sep12InterpretationInput({ persistenceContext: { priorConfirmingIntervalCount: 1 } })),
    });
    expect(single.currentPercentage).toBe(79);
    expect(repeated.currentPercentage > single.currentPercentage).toBeTruthy();
  });

  test("an adverse follow-up reading reverses the increase at full strength", () => {
    const interpretation = deriveStrategicInterpretation(sep12InterpretationInput({
      observedInterval: { priorValue: 153.3, priorObservedOn: "2026-09-12", currentValue: 151.3, currentObservedOn: "2026-10-10" },
      persistenceContext: { priorConfirmingIntervalCount: 1, contradicted: true },
    }));
    expect(interpretation.feasibilityState).toBe("contradicted");
    const projection = projectStrategicConfidence({
      previousPercentage: 79,
      confidenceBand: "high",
      interpretation,
      baseCeiling: 8,
    });
    expect(projection.movement).toBe("decrease");
    expect(projection.currentPercentage < 79).toBeTruthy();
  });
});
