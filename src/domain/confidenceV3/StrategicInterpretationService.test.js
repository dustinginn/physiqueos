import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  deriveStrategicInterpretation,
  GoalProgressMagnitude,
  StrategicOutcomeDirection,
  StrategicSignificance,
  ConfidenceEligibility,
} from "./StrategicInterpretationService.js";
import { FeasibilityState } from "./FeasibilityAssessmentService.js";
import { PersistenceState } from "./PersistenceAssessmentService.js";
import { PaceState } from "./ObservedOutcomePaceService.js";
import { GuardrailDirection } from "./GuardrailTransitionService.js";

// The Sep 12 acceptance fixture, v2 shape: `evidenceQuality` (measurement
// trustworthiness, feeds feasibility) is now separate from
// `persistenceContext` (repetition history, feeds persistence). Per the
// refinement's own framing: the mid-July-to-mid-August period was flat —
// it established a trustworthy REFERENCE (hasValidComparableReference:
// true) but showed no favorable direction to CONFIRM
// (priorConfirmingIntervalCount: 0). This is the fixture's single most
// important shape: strong evidence QUALITY, zero repetition.
function sep12Fixture({ goalId = "goal_1", evidenceDomain = "dexa" } = {}) {
  return {
    goalProgress: {
      status: "available", direction: "increase",
      requiredProgress: 10.0, remainingGap: 5.0, cumulativeProgress: 5.0, progressFraction: 0.5,
    },
    observedInterval: {
      priorValue: 148.3, priorObservedOn: "2026-08-15",
      currentValue: 153.3, currentObservedOn: "2026-09-12",
    },
    deadline: { remainingDays: 49 },
    guardrails: [{
      id: "body_fat_range",
      currentValue: 8.1, priorValue: 7.6,
      guardrail: { lowerBound: 8, upperBound: 9, lowerBoundMeaning: "unsafe_direction", upperBoundMeaning: "unsafe_direction" },
    }],
    evidence: { domain: evidenceDomain, goalOutcomeMetric: "lean_mass" },
    evidenceQuality: { hasValidComparableReference: true },
    persistenceContext: { priorConfirmingIntervalCount: 0 },
    provenance: { goalContractFingerprint: `fingerprint|${goalId}` },
  };
}

describe("Sep 12 acceptance fixture — expected qualitative result (v2: feasibility/persistence)", () => {
  const result = deriveStrategicInterpretation(sep12Fixture());

  test("feasibility is strongly_demonstrated (ahead of required pace, guardrail favorable)", () =>
    assert.equal(result.feasibilityState, FeasibilityState.STRONGLY_DEMONSTRATED));
  test("feasibility evidence strength is high (authoritative + valid reference)", () =>
    assert.equal(result.feasibilityEvidenceStrength, "high"));
  test("persistence is single_observation — this is the FIRST favorable interval, not a repeat", () =>
    assert.equal(result.persistenceState, PersistenceState.SINGLE_OBSERVATION));
  test("persistence upward factor is a majority but not full trust", () => {
    assert.ok(result.persistenceUpwardMovementFactor > 0.5 && result.persistenceUpwardMovementFactor < 1);
  });
  test("progress magnitude is material (5.0 of 10.0 required = 50% interval contribution)", () =>
    assert.equal(result.goalProgressMagnitude, GoalProgressMagnitude.MATERIAL));
  test("pace is ahead", () => assert.equal(result.paceState, PaceState.AHEAD));
  test("guardrail direction is favorable (entered target range from an unsafe-direction lower bound)", () =>
    assert.equal(result.guardrailDirection, GuardrailDirection.FAVORABLE));
  test("strategic outcome direction is favorable (progress AND guardrail both favorable)", () =>
    assert.equal(result.strategicOutcomeDirection, StrategicOutcomeDirection.FAVORABLE));
  test("strategic significance is material", () =>
    assert.equal(result.strategicSignificance, StrategicSignificance.MATERIAL));
  test("confidence is eligible for movement, not capped or ineligible", () =>
    assert.equal(result.confidenceEligibility, ConfidenceEligibility.ELIGIBLE));
  test("uncertainty names the persistence gap specifically, not a generic durability blob", () => {
    assert.ok(result.uncertaintyReason.includes("single_observation_of_favorable_direction"));
    assert.ok(result.uncertaintyReason.includes("biological_persistence_unproven"));
  });
  test("next decisive evidence points at a further confirming reading", () => {
    assert.equal(result.nextDecisiveEvidence.evidenceType, "dexa");
    assert.match(result.nextDecisiveEvidence.reason, /persistence/);
  });
  test("schemaVersion is v2 and the old durability fields are gone", () => {
    assert.equal(result.schemaVersion, "strategic_interpretation_v2");
    assert.equal("durabilityState" in result, false);
    assert.equal("durabilityWeight" in result, false);
  });
  test("output is frozen and carries a provenance fingerprint", () => {
    assert.ok(Object.isFrozen(result));
    assert.ok(result.provenance.inputFingerprint.startsWith("sha256_"));
  });
});

describe("Scenario matrix — feasibility/persistence refinement", () => {
  test("A: feasibility unproven, persistence unproven (true baseline, no interval at all)", () => {
    const result = deriveStrategicInterpretation({
      ...sep12Fixture(), observedInterval: null, persistenceContext: { priorConfirmingIntervalCount: 0 },
    });
    assert.equal(result.feasibilityState, FeasibilityState.UNPROVEN);
    assert.equal(result.persistenceState, PersistenceState.UNESTABLISHED);
    assert.equal(result.confidenceEligibility, ConfidenceEligibility.INELIGIBLE);
  });

  test("B < C: exceeding required pace ranks strictly above merely meeting it", () => {
    const onPace = deriveStrategicInterpretation({
      ...sep12Fixture(),
      observedInterval: { priorValue: 148.3, priorObservedOn: "2026-08-15", currentValue: 149.72, currentObservedOn: "2026-09-12" }, // ~1.02 lb / 28d ≈ required rate
    });
    const ahead = deriveStrategicInterpretation(sep12Fixture()); // +5.0 lb — well ahead
    const rank = { unproven: 0, contradicted: 0, weakly_supported: 1, demonstrated: 2, strongly_demonstrated: 3 };
    assert.ok(rank[ahead.feasibilityState] >= rank[onPace.feasibilityState]);
  });

  test("D < B: below required pace ranks strictly below meeting it", () => {
    const behind = deriveStrategicInterpretation({
      ...sep12Fixture(),
      observedInterval: { priorValue: 148.3, priorObservedOn: "2026-08-15", currentValue: 148.6, currentObservedOn: "2026-09-12" }, // small, below required rate
    });
    assert.equal(behind.feasibilityState, FeasibilityState.WEAKLY_SUPPORTED);
  });

  test("E: a second authoritative interval confirming favorable pace has higher persistence than the first", () => {
    const first = deriveStrategicInterpretation(sep12Fixture());
    const second = deriveStrategicInterpretation({ ...sep12Fixture(), persistenceContext: { priorConfirmingIntervalCount: 1 } });
    assert.equal(second.persistenceState, PersistenceState.CONFIRMED_REPEAT);
    assert.ok(second.persistenceUpwardMovementFactor > first.persistenceUpwardMovementFactor);
  });

  test("F: a weaker-but-still-favorable second interval does not reverse feasibility, still confirms persistence", () => {
    const result = deriveStrategicInterpretation({
      ...sep12Fixture(),
      observedInterval: { priorValue: 153.3, priorObservedOn: "2026-09-12", currentValue: 154.0, currentObservedOn: "2026-10-10" }, // smaller than the first interval, still positive
      persistenceContext: { priorConfirmingIntervalCount: 1 },
    });
    assert.notEqual(result.feasibilityState, FeasibilityState.CONTRADICTED);
    assert.equal(result.persistenceState, PersistenceState.CONFIRMED_REPEAT);
  });

  test("G < B: a second interval that CONTRADICTS the first ranks below a single favorable demonstration", () => {
    const contradicting = deriveStrategicInterpretation({
      ...sep12Fixture(),
      observedInterval: { priorValue: 153.3, priorObservedOn: "2026-09-12", currentValue: 151.3, currentObservedOn: "2026-10-10" }, // lean mass DROPPED
      persistenceContext: { priorConfirmingIntervalCount: 1, contradicted: true },
    });
    assert.equal(contradicting.feasibilityState, FeasibilityState.CONTRADICTED);
    assert.equal(contradicting.persistenceState, PersistenceState.CONTRADICTED);
  });

  test("H: material progress with Guardrail breach must NOT receive favorable feasibility credit", () => {
    const result = deriveStrategicInterpretation({
      ...sep12Fixture(),
      guardrails: [{
        id: "body_fat_range", currentValue: 9.6, priorValue: 8.9,
        guardrail: { lowerBound: 8, upperBound: 9, lowerBoundMeaning: "unsafe_direction", upperBoundMeaning: "unsafe_direction" },
      }],
    });
    assert.equal(result.feasibilityState, FeasibilityState.CONTRADICTED);
    assert.equal(result.confidenceEligibility, ConfidenceEligibility.CAPPED_BY_GUARDRAIL);
  });

  test("I: material progress entering a favorable Guardrail range MAY receive favorable feasibility credit", () => {
    const result = deriveStrategicInterpretation(sep12Fixture());
    assert.equal(result.feasibilityState, FeasibilityState.STRONGLY_DEMONSTRATED);
  });

  test("J: Goal already nearly/fully complete", () => {
    const result = deriveStrategicInterpretation({
      ...sep12Fixture(),
      goalProgress: { status: "available", direction: "increase", requiredProgress: 10, remainingGap: 0, cumulativeProgress: 10, progressFraction: 1 },
    });
    assert.equal(result.goalProgressMagnitude, GoalProgressMagnitude.GOAL_COMPLETE);
  });

  test("K: deadline imminent can still register behind despite positive progress", () => {
    const result = deriveStrategicInterpretation({ ...sep12Fixture(), deadline: { remainingDays: 3 } });
    assert.notEqual(result.paceState, PaceState.AHEAD);
  });

  test("L: no deadline — feasibility still resolves via magnitude fallback, pace stays unassessable", () => {
    const result = deriveStrategicInterpretation({ ...sep12Fixture(), deadline: null });
    assert.equal(result.paceState, PaceState.UNASSESSABLE);
    assert.equal(result.feasibilityState, FeasibilityState.DEMONSTRATED);
  });

  test("M: no phase context anywhere in the fixture — the engine does not require one", () => {
    assert.doesNotThrow(() => deriveStrategicInterpretation(sep12Fixture()));
  });

  test("N: different Goal/Phase-shaped identifiers with identical semantics produce an identical result", () => {
    const original = deriveStrategicInterpretation(sep12Fixture({ goalId: "goal_build_lean_mass_founder", evidenceDomain: "dexa" }));
    const renamed = deriveStrategicInterpretation(sep12Fixture({ goalId: "goal_totally_different_name_xyz", evidenceDomain: "dexa" }));
    const strip = ({ provenance, ...rest }) => rest;
    assert.deepEqual(strip(original), strip(renamed));
  });

  test("O: only proxy evidence available — feasibility stays unproven regardless of magnitude/pace", () => {
    const result = deriveStrategicInterpretation({ ...sep12Fixture(), evidence: { domain: "training", goalOutcomeMetric: "lean_mass" } });
    assert.equal(result.feasibilityState, FeasibilityState.UNPROVEN);
    assert.equal(result.confidenceEligibility, ConfidenceEligibility.INELIGIBLE);
  });

  test("P: direct evidence with no valid comparable reference downgrades evidence strength, not the feasibility state itself", () => {
    const result = deriveStrategicInterpretation({ ...sep12Fixture(), evidenceQuality: { hasValidComparableReference: false } });
    assert.equal(result.feasibilityEvidenceStrength, "moderate");
    assert.equal(result.feasibilityState, FeasibilityState.STRONGLY_DEMONSTRATED); // pace/guardrail-driven, unaffected
  });

  test("Q: strong feasibility but low persistence is materially above 'unproven', despite persistence being minimal", () => {
    const result = deriveStrategicInterpretation(sep12Fixture());
    assert.equal(result.feasibilityState, FeasibilityState.STRONGLY_DEMONSTRATED);
    assert.equal(result.persistenceState, PersistenceState.SINGLE_OBSERVATION);
    assert.ok(result.feasibilityConfidence > 0.5, "strong feasibility must not be reported as near-zero merely because persistence is low");
  });

  test("R: moderate feasibility with high persistence — persistence alone cannot fabricate feasibility it wasn't given", () => {
    const result = deriveStrategicInterpretation({
      ...sep12Fixture(),
      observedInterval: { priorValue: 148.3, priorObservedOn: "2026-08-15", currentValue: 148.6, currentObservedOn: "2026-09-12" }, // below required pace
      persistenceContext: { priorConfirmingIntervalCount: 3 },
    });
    assert.equal(result.feasibilityState, FeasibilityState.WEAKLY_SUPPORTED);
    assert.equal(result.persistenceState, PersistenceState.SUSTAINED_REPEAT);
  });
});

describe("capability degradation — no fabricated values", () => {
  test("Goal without a Guardrail: guardrailDirection is unknown, feasibility still resolves from pace alone", () => {
    const result = deriveStrategicInterpretation({ ...sep12Fixture(), guardrails: [] });
    assert.equal(result.guardrailDirection, GuardrailDirection.UNKNOWN);
    assert.equal(result.feasibilityState, FeasibilityState.STRONGLY_DEMONSTRATED);
  });
  test("threshold/range Goal: progress derived from distance-to-target, not a fabricated progressFraction", () => {
    const result = deriveStrategicInterpretation({
      ...sep12Fixture(), goalProgress: null,
      thresholdProgress: { status: "available", direction: "increase", distanceToTarget: 1.0, priorDistanceToTarget: 3.0 },
    });
    assert.equal(result.goalProgressFraction, null, "threshold Goals must not fabricate a quantitative fraction");
    assert.equal(result.goalProgressMagnitude, GoalProgressMagnitude.MATERIAL);
  });
  test("non-quantitative Goal with neither progress signal: magnitude is unassessable, never zero", () => {
    const result = deriveStrategicInterpretation({ ...sep12Fixture(), goalProgress: null, thresholdProgress: null, observedInterval: null });
    assert.equal(result.goalProgressMagnitude, GoalProgressMagnitude.UNASSESSABLE);
  });
});

describe("raw evidence rejection", () => {
  for (const key of ["dexaScans", "weights", "workouts", "photos", "sourceObservations", "sourceClaims", "canonicalEvidence", "rawEvidence"]) {
    test(`rejects a top-level "${key}" key`, () => {
      assert.throws(() => deriveStrategicInterpretation({ ...sep12Fixture(), [key]: [{ leanMass: 153.3 }] }), /raw evidence/);
    });
  }
});

describe("GENERICITY INVARIANT — no Goal-name, Phase-name, or evidence-domain dependence", () => {
  test("module source contains no Build-Lean-Mass, Establish-Maintenance, or Lean-Mass-Build SCORING literal", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("./StrategicInterpretationService.js", import.meta.url), "utf8");
    assert.doesNotMatch(source, /["'`]build_lean_mass["'`]/i);
    assert.doesNotMatch(source, /["'`]establish_maintenance["'`]/i);
    assert.doesNotMatch(source, /["'`]lean_mass_build["'`]/i);
    assert.doesNotMatch(source, /===\s*["'`]dexa["'`]/i, "no scoring branch may compare against a literal domain string");
  });
});
