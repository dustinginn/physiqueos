import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  classifyFeasibilityEvidenceStrength,
  classifyFeasibilityState,
  computeFeasibilityConfidence,
  evaluateFeasibility,
  FeasibilityState,
  FeasibilityEvidenceStrength,
} from "./FeasibilityAssessmentService.js";

describe("classifyFeasibilityEvidenceStrength", () => {
  test("authoritative_direct with a valid reference is HIGH", () =>
    assert.equal(classifyFeasibilityEvidenceStrength({ directOutcomeAuthority: "authoritative_direct", hasValidComparableReference: true }), FeasibilityEvidenceStrength.HIGH));
  test("authoritative_direct WITHOUT a valid reference is downgraded to MODERATE", () =>
    assert.equal(classifyFeasibilityEvidenceStrength({ directOutcomeAuthority: "authoritative_direct", hasValidComparableReference: false }), FeasibilityEvidenceStrength.MODERATE));
  test("supporting_proxy is LOW regardless of reference quality", () =>
    assert.equal(classifyFeasibilityEvidenceStrength({ directOutcomeAuthority: "supporting_proxy", hasValidComparableReference: true }), FeasibilityEvidenceStrength.LOW));
  test("unresolved authority is LOW", () =>
    assert.equal(classifyFeasibilityEvidenceStrength({ directOutcomeAuthority: null }), FeasibilityEvidenceStrength.LOW));
});

describe("classifyFeasibilityState — a single reading CAN demonstrate feasibility", () => {
  test("B: first authoritative interval demonstrates required pace exactly => demonstrated", () =>
    assert.equal(classifyFeasibilityState({ directOutcomeAuthority: "authoritative_direct", guardrailDirection: "favorable", paceState: "on_pace" }), FeasibilityState.DEMONSTRATED));
  test("C: first authoritative interval materially EXCEEDS required pace => strongly_demonstrated (>= demonstrated)", () =>
    assert.equal(classifyFeasibilityState({ directOutcomeAuthority: "authoritative_direct", guardrailDirection: "favorable", paceState: "ahead" }), FeasibilityState.STRONGLY_DEMONSTRATED));
  test("D: first authoritative interval BELOW required pace => weakly_supported (< demonstrated)", () =>
    assert.equal(classifyFeasibilityState({ directOutcomeAuthority: "authoritative_direct", guardrailDirection: "favorable", paceState: "behind" }), FeasibilityState.WEAKLY_SUPPORTED));
  test("repetition is NOT required to reach demonstrated/strongly_demonstrated — a single reading suffices", () => {
    // No repetition-related input exists in this function's signature at
    // all — proving structurally, not just by example, that feasibility
    // does not consult repeat count.
    const result = classifyFeasibilityState({ directOutcomeAuthority: "authoritative_direct", guardrailDirection: "favorable", paceState: "ahead" });
    assert.equal(result, FeasibilityState.STRONGLY_DEMONSTRATED);
  });
});

describe("Guardrail dominance (Task 7) — progress magnitude can never overpower a breach", () => {
  test("H: material progress + Guardrail breach must NOT receive favorable feasibility credit", () => {
    const result = classifyFeasibilityState({ directOutcomeAuthority: "authoritative_direct", guardrailDirection: "unfavorable", paceState: "ahead" });
    assert.equal(result, FeasibilityState.CONTRADICTED);
  });
  test("I: material progress entering a favorable Guardrail range MAY receive favorable credit", () => {
    const result = classifyFeasibilityState({ directOutcomeAuthority: "authoritative_direct", guardrailDirection: "favorable", paceState: "ahead" });
    assert.notEqual(result, FeasibilityState.CONTRADICTED);
  });
  test("regressing pace is contradicted even with a favorable guardrail", () => {
    assert.equal(classifyFeasibilityState({ directOutcomeAuthority: "authoritative_direct", guardrailDirection: "favorable", paceState: "regressing" }), FeasibilityState.CONTRADICTED);
  });
});

describe("O: only proxy/behavioral evidence available => feasibility stays unproven, however much accumulates", () => {
  for (const authority of ["supporting_proxy", "behavioral"]) {
    test(`${authority} with an "ahead" pace and favorable guardrail is still UNPROVEN`, () => {
      const result = classifyFeasibilityState({ directOutcomeAuthority: authority, guardrailDirection: "favorable", paceState: "ahead" });
      assert.equal(result, FeasibilityState.UNPROVEN);
    });
  }
  test("no authority resolved at all is unproven", () => {
    assert.equal(classifyFeasibilityState({ directOutcomeAuthority: null, guardrailDirection: "favorable", paceState: "ahead" }), FeasibilityState.UNPROVEN);
  });
});

describe("no-deadline fallback — magnitude substitutes for pace-vs-deadline", () => {
  test("material magnitude with unassessable pace (no deadline) still demonstrates feasibility", () =>
    assert.equal(classifyFeasibilityState({ directOutcomeAuthority: "authoritative_direct", guardrailDirection: "favorable", paceState: "unassessable", goalProgressMagnitude: "material" }), FeasibilityState.DEMONSTRATED));
  test("marginal magnitude with unassessable pace stays unproven", () =>
    assert.equal(classifyFeasibilityState({ directOutcomeAuthority: "authoritative_direct", guardrailDirection: "favorable", paceState: "unassessable", goalProgressMagnitude: "marginal" }), FeasibilityState.UNPROVEN));
});

describe("computeFeasibilityConfidence — monotonic, bounded", () => {
  test("strongly_demonstrated + high strength scores above demonstrated + high strength", () => {
    const strong = computeFeasibilityConfidence({ feasibilityState: FeasibilityState.STRONGLY_DEMONSTRATED, feasibilityEvidenceStrength: FeasibilityEvidenceStrength.HIGH });
    const demonstrated = computeFeasibilityConfidence({ feasibilityState: FeasibilityState.DEMONSTRATED, feasibilityEvidenceStrength: FeasibilityEvidenceStrength.HIGH });
    assert.ok(strong > demonstrated);
  });
  test("unproven and contradicted both score exactly zero", () => {
    assert.equal(computeFeasibilityConfidence({ feasibilityState: FeasibilityState.UNPROVEN, feasibilityEvidenceStrength: FeasibilityEvidenceStrength.HIGH }), 0);
    assert.equal(computeFeasibilityConfidence({ feasibilityState: FeasibilityState.CONTRADICTED, feasibilityEvidenceStrength: FeasibilityEvidenceStrength.HIGH }), 0);
  });
  test("lower evidence strength never scores higher than higher strength at the same state", () => {
    const high = computeFeasibilityConfidence({ feasibilityState: FeasibilityState.DEMONSTRATED, feasibilityEvidenceStrength: FeasibilityEvidenceStrength.HIGH });
    const low = computeFeasibilityConfidence({ feasibilityState: FeasibilityState.DEMONSTRATED, feasibilityEvidenceStrength: FeasibilityEvidenceStrength.LOW });
    assert.ok(low < high);
  });
});

describe("evaluateFeasibility — Sep 12 shape", () => {
  test("authoritative, valid reference, favorable guardrail, ahead pace => strongly_demonstrated / high", () => {
    const result = evaluateFeasibility({
      directOutcomeAuthority: "authoritative_direct", hasValidComparableReference: true,
      guardrailDirection: "favorable", paceState: "ahead", goalProgressMagnitude: "material",
    });
    assert.equal(result.feasibilityState, FeasibilityState.STRONGLY_DEMONSTRATED);
    assert.equal(result.feasibilityEvidenceStrength, FeasibilityEvidenceStrength.HIGH);
    assert.ok(result.feasibilityConfidence > 0.5);
    assert.ok(Object.isFrozen(result));
  });
});

describe("genericity", () => {
  test("no Build-Lean-Mass, Establish-Maintenance, or literal domain-string scoring branch", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("./FeasibilityAssessmentService.js", import.meta.url), "utf8");
    assert.doesNotMatch(source, /["'`]build_lean_mass["'`]/i);
    assert.doesNotMatch(source, /["'`]establish_maintenance["'`]/i);
    assert.doesNotMatch(source, /===\s*["'`]dexa["'`]/i);
    assert.doesNotMatch(source, /\bphaseId\b/);
  });
});
