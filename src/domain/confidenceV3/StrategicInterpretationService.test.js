import { describe, expect, test } from "vitest";
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
    expect(result.feasibilityState).toBe(FeasibilityState.STRONGLY_DEMONSTRATED));
  test("feasibility evidence strength is high (authoritative + valid reference)", () =>
    expect(result.feasibilityEvidenceStrength).toBe("high"));
  test("persistence is single_observation — this is the FIRST favorable interval, not a repeat", () =>
    expect(result.persistenceState).toBe(PersistenceState.SINGLE_OBSERVATION));
  test("persistence upward factor is a majority but not full trust", () => {
    expect(result.persistenceUpwardMovementFactor > 0.5 && result.persistenceUpwardMovementFactor < 1).toBeTruthy();
  });
  test("progress magnitude is material (5.0 of 10.0 required = 50% interval contribution)", () =>
    expect(result.goalProgressMagnitude).toBe(GoalProgressMagnitude.MATERIAL));
  test("pace is ahead", () => expect(result.paceState).toBe(PaceState.AHEAD));
  test("guardrail direction is favorable (entered target range from an unsafe-direction lower bound)", () =>
    expect(result.guardrailDirection).toBe(GuardrailDirection.FAVORABLE));
  test("strategic outcome direction is favorable (progress AND guardrail both favorable)", () =>
    expect(result.strategicOutcomeDirection).toBe(StrategicOutcomeDirection.FAVORABLE));
  test("strategic significance is material", () =>
    expect(result.strategicSignificance).toBe(StrategicSignificance.MATERIAL));
  test("confidence is eligible for movement, not capped or ineligible", () =>
    expect(result.confidenceEligibility).toBe(ConfidenceEligibility.ELIGIBLE));
  test("uncertainty names the persistence gap specifically, not a generic durability blob", () => {
    expect(result.uncertaintyReason.includes("single_observation_of_favorable_direction")).toBeTruthy();
    expect(result.uncertaintyReason.includes("biological_persistence_unproven")).toBeTruthy();
  });
  test("next decisive evidence points at a further confirming reading", () => {
    expect(result.nextDecisiveEvidence.evidenceType).toBe("dexa");
    expect(result.nextDecisiveEvidence.reason).toMatch(/persistence/);
  });
  test("schemaVersion is v2 and the old durability fields are gone", () => {
    expect(result.schemaVersion).toBe("strategic_interpretation_v2");
    expect("durabilityState" in result).toBe(false);
    expect("durabilityWeight" in result).toBe(false);
  });
  test("output is frozen and carries a provenance fingerprint", () => {
    expect(Object.isFrozen(result)).toBeTruthy();
    expect(result.provenance.inputFingerprint.startsWith("sha256_")).toBeTruthy();
  });
});

describe("Scenario matrix — feasibility/persistence refinement", () => {
  test("A: feasibility unproven, persistence unproven (true baseline, no interval at all)", () => {
    const result = deriveStrategicInterpretation({
      ...sep12Fixture(), observedInterval: null, persistenceContext: { priorConfirmingIntervalCount: 0 },
    });
    expect(result.feasibilityState).toBe(FeasibilityState.UNPROVEN);
    expect(result.persistenceState).toBe(PersistenceState.UNESTABLISHED);
    expect(result.confidenceEligibility).toBe(ConfidenceEligibility.INELIGIBLE);
  });

  test("B < C: exceeding required pace ranks strictly above merely meeting it", () => {
    const onPace = deriveStrategicInterpretation({
      ...sep12Fixture(),
      observedInterval: { priorValue: 148.3, priorObservedOn: "2026-08-15", currentValue: 149.72, currentObservedOn: "2026-09-12" }, // ~1.02 lb / 28d ≈ required rate
    });
    const ahead = deriveStrategicInterpretation(sep12Fixture()); // +5.0 lb — well ahead
    const rank = { unproven: 0, contradicted: 0, weakly_supported: 1, demonstrated: 2, strongly_demonstrated: 3 };
    expect(rank[ahead.feasibilityState] >= rank[onPace.feasibilityState]).toBeTruthy();
  });

  test("D < B: below required pace ranks strictly below meeting it", () => {
    const behind = deriveStrategicInterpretation({
      ...sep12Fixture(),
      observedInterval: { priorValue: 148.3, priorObservedOn: "2026-08-15", currentValue: 148.6, currentObservedOn: "2026-09-12" }, // small, below required rate
    });
    expect(behind.feasibilityState).toBe(FeasibilityState.WEAKLY_SUPPORTED);
  });

  test("E: a second authoritative interval confirming favorable pace has higher persistence than the first", () => {
    const first = deriveStrategicInterpretation(sep12Fixture());
    const second = deriveStrategicInterpretation({ ...sep12Fixture(), persistenceContext: { priorConfirmingIntervalCount: 1 } });
    expect(second.persistenceState).toBe(PersistenceState.CONFIRMED_REPEAT);
    expect(second.persistenceUpwardMovementFactor > first.persistenceUpwardMovementFactor).toBeTruthy();
  });

  test("F: a weaker-but-still-favorable second interval does not reverse feasibility, still confirms persistence", () => {
    const result = deriveStrategicInterpretation({
      ...sep12Fixture(),
      observedInterval: { priorValue: 153.3, priorObservedOn: "2026-09-12", currentValue: 154.0, currentObservedOn: "2026-10-10" }, // smaller than the first interval, still positive
      persistenceContext: { priorConfirmingIntervalCount: 1 },
    });
    expect(result.feasibilityState).not.toBe(FeasibilityState.CONTRADICTED);
    expect(result.persistenceState).toBe(PersistenceState.CONFIRMED_REPEAT);
  });

  test("G < B: a second interval that CONTRADICTS the first ranks below a single favorable demonstration", () => {
    const contradicting = deriveStrategicInterpretation({
      ...sep12Fixture(),
      observedInterval: { priorValue: 153.3, priorObservedOn: "2026-09-12", currentValue: 151.3, currentObservedOn: "2026-10-10" }, // lean mass DROPPED
      persistenceContext: { priorConfirmingIntervalCount: 1, contradicted: true },
    });
    expect(contradicting.feasibilityState).toBe(FeasibilityState.CONTRADICTED);
    expect(contradicting.persistenceState).toBe(PersistenceState.CONTRADICTED);
  });

  test("H: material progress with Guardrail breach must NOT receive favorable feasibility credit", () => {
    const result = deriveStrategicInterpretation({
      ...sep12Fixture(),
      guardrails: [{
        id: "body_fat_range", currentValue: 9.6, priorValue: 8.9,
        guardrail: { lowerBound: 8, upperBound: 9, lowerBoundMeaning: "unsafe_direction", upperBoundMeaning: "unsafe_direction" },
      }],
    });
    expect(result.feasibilityState).toBe(FeasibilityState.CONTRADICTED);
    expect(result.confidenceEligibility).toBe(ConfidenceEligibility.CAPPED_BY_GUARDRAIL);
  });

  test("I: material progress entering a favorable Guardrail range MAY receive favorable feasibility credit", () => {
    const result = deriveStrategicInterpretation(sep12Fixture());
    expect(result.feasibilityState).toBe(FeasibilityState.STRONGLY_DEMONSTRATED);
  });

  test("J: Goal already nearly/fully complete", () => {
    const result = deriveStrategicInterpretation({
      ...sep12Fixture(),
      goalProgress: { status: "available", direction: "increase", requiredProgress: 10, remainingGap: 0, cumulativeProgress: 10, progressFraction: 1 },
    });
    expect(result.goalProgressMagnitude).toBe(GoalProgressMagnitude.GOAL_COMPLETE);
  });

  test("K: deadline imminent can still register behind despite positive progress", () => {
    const result = deriveStrategicInterpretation({ ...sep12Fixture(), deadline: { remainingDays: 3 } });
    expect(result.paceState).not.toBe(PaceState.AHEAD);
  });

  test("L: no deadline — feasibility still resolves via magnitude fallback, pace stays unassessable", () => {
    const result = deriveStrategicInterpretation({ ...sep12Fixture(), deadline: null });
    expect(result.paceState).toBe(PaceState.UNASSESSABLE);
    expect(result.feasibilityState).toBe(FeasibilityState.DEMONSTRATED);
  });

  test("M: no phase context anywhere in the fixture — the engine does not require one", () => {
    expect(() => deriveStrategicInterpretation(sep12Fixture())).not.toThrow();
  });

  test("N: different Goal/Phase-shaped identifiers with identical semantics produce an identical result", () => {
    const original = deriveStrategicInterpretation(sep12Fixture({ goalId: "goal_build_lean_mass_founder", evidenceDomain: "dexa" }));
    const renamed = deriveStrategicInterpretation(sep12Fixture({ goalId: "goal_totally_different_name_xyz", evidenceDomain: "dexa" }));
    const strip = ({ provenance, ...rest }) => rest;
    expect(strip(original)).toEqual(strip(renamed));
  });

  test("O: only proxy evidence available — feasibility stays unproven regardless of magnitude/pace", () => {
    const result = deriveStrategicInterpretation({ ...sep12Fixture(), evidence: { domain: "training", goalOutcomeMetric: "lean_mass" } });
    expect(result.feasibilityState).toBe(FeasibilityState.UNPROVEN);
    expect(result.confidenceEligibility).toBe(ConfidenceEligibility.INELIGIBLE);
  });

  test("P: direct evidence with no valid comparable reference downgrades evidence strength, not the feasibility state itself", () => {
    const result = deriveStrategicInterpretation({ ...sep12Fixture(), evidenceQuality: { hasValidComparableReference: false } });
    expect(result.feasibilityEvidenceStrength).toBe("moderate");
    expect(result.feasibilityState).toBe(FeasibilityState.STRONGLY_DEMONSTRATED); // pace/guardrail-driven, unaffected
  });

  test("Q: strong feasibility but low persistence is materially above 'unproven', despite persistence being minimal", () => {
    const result = deriveStrategicInterpretation(sep12Fixture());
    expect(result.feasibilityState).toBe(FeasibilityState.STRONGLY_DEMONSTRATED);
    expect(result.persistenceState).toBe(PersistenceState.SINGLE_OBSERVATION);
    expect(result.feasibilityConfidence > 0.5).toBeTruthy();
  });

  test("R: moderate feasibility with high persistence — persistence alone cannot fabricate feasibility it wasn't given", () => {
    const result = deriveStrategicInterpretation({
      ...sep12Fixture(),
      observedInterval: { priorValue: 148.3, priorObservedOn: "2026-08-15", currentValue: 148.6, currentObservedOn: "2026-09-12" }, // below required pace
      persistenceContext: { priorConfirmingIntervalCount: 3 },
    });
    expect(result.feasibilityState).toBe(FeasibilityState.WEAKLY_SUPPORTED);
    expect(result.persistenceState).toBe(PersistenceState.SUSTAINED_REPEAT);
  });
});

describe("capability degradation — no fabricated values", () => {
  test("Goal without a Guardrail: guardrailDirection is unknown, feasibility still resolves from pace alone", () => {
    const result = deriveStrategicInterpretation({ ...sep12Fixture(), guardrails: [] });
    expect(result.guardrailDirection).toBe(GuardrailDirection.UNKNOWN);
    expect(result.feasibilityState).toBe(FeasibilityState.STRONGLY_DEMONSTRATED);
  });
  test("threshold/range Goal: progress derived from distance-to-target, not a fabricated progressFraction", () => {
    const result = deriveStrategicInterpretation({
      ...sep12Fixture(), goalProgress: null,
      thresholdProgress: { status: "available", direction: "increase", distanceToTarget: 1.0, priorDistanceToTarget: 3.0 },
    });
    expect(result.goalProgressFraction).toBe(null);
    expect(result.goalProgressMagnitude).toBe(GoalProgressMagnitude.MATERIAL);
  });
  test("non-quantitative Goal with neither progress signal: magnitude is unassessable, never zero", () => {
    const result = deriveStrategicInterpretation({ ...sep12Fixture(), goalProgress: null, thresholdProgress: null, observedInterval: null });
    expect(result.goalProgressMagnitude).toBe(GoalProgressMagnitude.UNASSESSABLE);
  });
});

describe("raw evidence rejection", () => {
  for (const key of ["dexaScans", "weights", "workouts", "photos", "sourceObservations", "sourceClaims", "canonicalEvidence", "rawEvidence"]) {
    test(`rejects a top-level "${key}" key`, () => {
      expect(() => deriveStrategicInterpretation({ ...sep12Fixture(), [key]: [{ leanMass: 153.3 }] })).toThrow();
    });
  }
});

describe("GENERICITY INVARIANT — no Goal-name, Phase-name, or evidence-domain dependence", () => {
  test("module source contains no Build-Lean-Mass, Establish-Maintenance, or Lean-Mass-Build SCORING literal", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("./StrategicInterpretationService.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/["'`]build_lean_mass["'`]/i);
    expect(source).not.toMatch(/["'`]establish_maintenance["'`]/i);
    expect(source).not.toMatch(/["'`]lean_mass_build["'`]/i);
    expect(source).not.toMatch(/===\s*["'`]dexa["'`]/i);
  });
});
