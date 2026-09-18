import { describe, expect, test } from "vitest";
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
    expect(classifyFeasibilityEvidenceStrength({ directOutcomeAuthority: "authoritative_direct", hasValidComparableReference: true })).toBe(FeasibilityEvidenceStrength.HIGH));
  test("authoritative_direct WITHOUT a valid reference is downgraded to MODERATE", () =>
    expect(classifyFeasibilityEvidenceStrength({ directOutcomeAuthority: "authoritative_direct", hasValidComparableReference: false })).toBe(FeasibilityEvidenceStrength.MODERATE));
  test("supporting_proxy is LOW regardless of reference quality", () =>
    expect(classifyFeasibilityEvidenceStrength({ directOutcomeAuthority: "supporting_proxy", hasValidComparableReference: true })).toBe(FeasibilityEvidenceStrength.LOW));
  test("unresolved authority is LOW", () =>
    expect(classifyFeasibilityEvidenceStrength({ directOutcomeAuthority: null })).toBe(FeasibilityEvidenceStrength.LOW));
});

describe("classifyFeasibilityState — a single reading CAN demonstrate feasibility", () => {
  test("B: first authoritative interval demonstrates required pace exactly => demonstrated", () =>
    expect(classifyFeasibilityState({ directOutcomeAuthority: "authoritative_direct", guardrailDirection: "favorable", paceState: "on_pace" })).toBe(FeasibilityState.DEMONSTRATED));
  test("C: first authoritative interval materially EXCEEDS required pace => strongly_demonstrated (>= demonstrated)", () =>
    expect(classifyFeasibilityState({ directOutcomeAuthority: "authoritative_direct", guardrailDirection: "favorable", paceState: "ahead" })).toBe(FeasibilityState.STRONGLY_DEMONSTRATED));
  test("D: first authoritative interval BELOW required pace => weakly_supported (< demonstrated)", () =>
    expect(classifyFeasibilityState({ directOutcomeAuthority: "authoritative_direct", guardrailDirection: "favorable", paceState: "behind" })).toBe(FeasibilityState.WEAKLY_SUPPORTED));
  test("repetition is NOT required to reach demonstrated/strongly_demonstrated — a single reading suffices", () => {
    // No repetition-related input exists in this function's signature at
    // all — proving structurally, not just by example, that feasibility
    // does not consult repeat count.
    const result = classifyFeasibilityState({ directOutcomeAuthority: "authoritative_direct", guardrailDirection: "favorable", paceState: "ahead" });
    expect(result).toBe(FeasibilityState.STRONGLY_DEMONSTRATED);
  });
});

describe("Guardrail dominance (Task 7) — progress magnitude can never overpower a breach", () => {
  test("H: material progress + Guardrail breach must NOT receive favorable feasibility credit", () => {
    const result = classifyFeasibilityState({ directOutcomeAuthority: "authoritative_direct", guardrailDirection: "unfavorable", paceState: "ahead" });
    expect(result).toBe(FeasibilityState.CONTRADICTED);
  });
  test("I: material progress entering a favorable Guardrail range MAY receive favorable credit", () => {
    const result = classifyFeasibilityState({ directOutcomeAuthority: "authoritative_direct", guardrailDirection: "favorable", paceState: "ahead" });
    expect(result).not.toBe(FeasibilityState.CONTRADICTED);
  });
  test("regressing pace is contradicted even with a favorable guardrail", () => {
    expect(classifyFeasibilityState({ directOutcomeAuthority: "authoritative_direct", guardrailDirection: "favorable", paceState: "regressing" })).toBe(FeasibilityState.CONTRADICTED);
  });
});

describe("O: only proxy/behavioral evidence available => feasibility stays unproven, however much accumulates", () => {
  for (const authority of ["supporting_proxy", "behavioral"]) {
    test(`${authority} with an "ahead" pace and favorable guardrail is still UNPROVEN`, () => {
      const result = classifyFeasibilityState({ directOutcomeAuthority: authority, guardrailDirection: "favorable", paceState: "ahead" });
      expect(result).toBe(FeasibilityState.UNPROVEN);
    });
  }
  test("no authority resolved at all is unproven", () => {
    expect(classifyFeasibilityState({ directOutcomeAuthority: null, guardrailDirection: "favorable", paceState: "ahead" })).toBe(FeasibilityState.UNPROVEN);
  });
});

describe("no-deadline fallback — magnitude substitutes for pace-vs-deadline", () => {
  test("material magnitude with unassessable pace (no deadline) still demonstrates feasibility", () =>
    expect(classifyFeasibilityState({ directOutcomeAuthority: "authoritative_direct", guardrailDirection: "favorable", paceState: "unassessable", goalProgressMagnitude: "material" })).toBe(FeasibilityState.DEMONSTRATED));
  test("marginal magnitude with unassessable pace stays unproven", () =>
    expect(classifyFeasibilityState({ directOutcomeAuthority: "authoritative_direct", guardrailDirection: "favorable", paceState: "unassessable", goalProgressMagnitude: "marginal" })).toBe(FeasibilityState.UNPROVEN));
});

describe("computeFeasibilityConfidence — monotonic, bounded", () => {
  test("strongly_demonstrated + high strength scores above demonstrated + high strength", () => {
    const strong = computeFeasibilityConfidence({ feasibilityState: FeasibilityState.STRONGLY_DEMONSTRATED, feasibilityEvidenceStrength: FeasibilityEvidenceStrength.HIGH });
    const demonstrated = computeFeasibilityConfidence({ feasibilityState: FeasibilityState.DEMONSTRATED, feasibilityEvidenceStrength: FeasibilityEvidenceStrength.HIGH });
    expect(strong > demonstrated).toBeTruthy();
  });
  test("unproven and contradicted both score exactly zero", () => {
    expect(computeFeasibilityConfidence({ feasibilityState: FeasibilityState.UNPROVEN, feasibilityEvidenceStrength: FeasibilityEvidenceStrength.HIGH })).toBe(0);
    expect(computeFeasibilityConfidence({ feasibilityState: FeasibilityState.CONTRADICTED, feasibilityEvidenceStrength: FeasibilityEvidenceStrength.HIGH })).toBe(0);
  });
  test("lower evidence strength never scores higher than higher strength at the same state", () => {
    const high = computeFeasibilityConfidence({ feasibilityState: FeasibilityState.DEMONSTRATED, feasibilityEvidenceStrength: FeasibilityEvidenceStrength.HIGH });
    const low = computeFeasibilityConfidence({ feasibilityState: FeasibilityState.DEMONSTRATED, feasibilityEvidenceStrength: FeasibilityEvidenceStrength.LOW });
    expect(low < high).toBeTruthy();
  });
});

describe("evaluateFeasibility — Sep 12 shape", () => {
  test("authoritative, valid reference, favorable guardrail, ahead pace => strongly_demonstrated / high", () => {
    const result = evaluateFeasibility({
      directOutcomeAuthority: "authoritative_direct", hasValidComparableReference: true,
      guardrailDirection: "favorable", paceState: "ahead", goalProgressMagnitude: "material",
    });
    expect(result.feasibilityState).toBe(FeasibilityState.STRONGLY_DEMONSTRATED);
    expect(result.feasibilityEvidenceStrength).toBe(FeasibilityEvidenceStrength.HIGH);
    expect(result.feasibilityConfidence > 0.5).toBeTruthy();
    expect(Object.isFrozen(result)).toBeTruthy();
  });
});

describe("genericity", () => {
  test("no Build-Lean-Mass, Establish-Maintenance, or literal domain-string scoring branch", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("./FeasibilityAssessmentService.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/["'`]build_lean_mass["'`]/i);
    expect(source).not.toMatch(/["'`]establish_maintenance["'`]/i);
    expect(source).not.toMatch(/===\s*["'`]dexa["'`]/i);
    expect(source).not.toMatch(/\bphaseId\b/);
  });
});
