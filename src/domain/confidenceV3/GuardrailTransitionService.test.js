import { describe, expect, test } from "vitest";
import {
  classifyGuardrailState,
  classifyGuardrailTransition,
  classifyGuardrailDirection,
  evaluateGuardrailTransition,
  GuardrailState,
  GuardrailTransition,
  GuardrailDirection,
} from "./GuardrailTransitionService.js";

const LEAN_MASS_GUARDRAIL = Object.freeze({
  lowerBound: 8, upperBound: 9,
  lowerBoundMeaning: "unsafe_direction", upperBoundMeaning: "unsafe_direction",
});
const UNDECLARED_GUARDRAIL = Object.freeze({ lowerBound: 8, upperBound: 9 });

describe("classifyGuardrailState — position only, symmetric by construction", () => {
  test("below range", () => expect(classifyGuardrailState(7.6, LEAN_MASS_GUARDRAIL)).toBe(GuardrailState.BELOW_RANGE));
  test("lower third — the real Founder value", () =>
    expect(classifyGuardrailState(8.1, LEAN_MASS_GUARDRAIL)).toBe(GuardrailState.LOWER_THIRD));
  test("central", () => expect(classifyGuardrailState(8.5, LEAN_MASS_GUARDRAIL)).toBe(GuardrailState.CENTRAL));
  test("upper third", () => expect(classifyGuardrailState(8.9, LEAN_MASS_GUARDRAIL)).toBe(GuardrailState.UPPER_THIRD));
  test("above range", () => expect(classifyGuardrailState(9.4, LEAN_MASS_GUARDRAIL)).toBe(GuardrailState.ABOVE_RANGE));
  test("unknown for missing guardrail", () => expect(classifyGuardrailState(8.1, null)).toBe(GuardrailState.UNKNOWN));
  test("unknown for non-finite value", () => expect(classifyGuardrailState(null, LEAN_MASS_GUARDRAIL)).toBe(GuardrailState.UNKNOWN));
  test("unknown for degenerate inverted range", () =>
    expect(classifyGuardrailState(8.1, { lowerBound: 9, upperBound: 8 })).toBe(GuardrailState.UNKNOWN));
});

describe("classifyGuardrailTransition", () => {
  test("the real Founder transition: below range into lower third", () =>
    expect(classifyGuardrailTransition(8.1, 7.6, LEAN_MASS_GUARDRAIL)).toBe(GuardrailTransition.ENTERING_FROM_BELOW));
  test("entering from above", () =>
    expect(classifyGuardrailTransition(8.5, 9.4, LEAN_MASS_GUARDRAIL)).toBe(GuardrailTransition.ENTERING_FROM_ABOVE));
  test("stable — identical value", () =>
    expect(classifyGuardrailTransition(8.5, 8.5, LEAN_MASS_GUARDRAIL)).toBe(GuardrailTransition.STABLE));
  test("drifting toward upper edge from central", () =>
    expect(classifyGuardrailTransition(8.85, 8.5, LEAN_MASS_GUARDRAIL)).toBe(GuardrailTransition.DRIFTING_TOWARD_UPPER_EDGE));
  test("drifting toward lower edge from central", () =>
    expect(classifyGuardrailTransition(8.15, 8.5, LEAN_MASS_GUARDRAIL)).toBe(GuardrailTransition.DRIFTING_TOWARD_LOWER_EDGE));
  test("receding from lower edge into central", () =>
    expect(classifyGuardrailTransition(8.5, 8.1, LEAN_MASS_GUARDRAIL)).toBe(GuardrailTransition.RECEDING_FROM_LOWER_EDGE));
  test("receding from upper edge into central", () =>
    expect(classifyGuardrailTransition(8.5, 8.9, LEAN_MASS_GUARDRAIL)).toBe(GuardrailTransition.RECEDING_FROM_UPPER_EDGE));
  test("still below range but improving", () =>
    expect(classifyGuardrailTransition(7.8, 7.4, LEAN_MASS_GUARDRAIL)).toBe(GuardrailTransition.RECEDING_FROM_LOWER_EDGE));
  test("still below range and worsening", () =>
    expect(classifyGuardrailTransition(7.2, 7.4, LEAN_MASS_GUARDRAIL)).toBe(GuardrailTransition.DRIFTING_TOWARD_LOWER_EDGE));
  test("unknown without a prior value", () =>
    expect(classifyGuardrailTransition(8.1, null, LEAN_MASS_GUARDRAIL)).toBe(GuardrailTransition.UNKNOWN));
});

describe("classifyGuardrailDirection — Goal-declared semantics required for FAVORABLE", () => {
  test("the real Founder case resolves favorable given declared unsafe lower bound", () => {
    expect(classifyGuardrailDirection({ currentValue: 8.1, priorValue: 7.6, guardrail: LEAN_MASS_GUARDRAIL })).toBe(GuardrailDirection.FAVORABLE);
  });
  test("without declared meaning, entering from below is NEUTRAL, never invented as favorable", () => {
    expect(classifyGuardrailDirection({ currentValue: 8.1, priorValue: 7.6, guardrail: UNDECLARED_GUARDRAIL })).toBe(GuardrailDirection.NEUTRAL);
  });
  test("breaching above range defaults to UNFAVORABLE even without declared meaning", () => {
    expect(classifyGuardrailDirection({ currentValue: 9.4, priorValue: 8.5, guardrail: UNDECLARED_GUARDRAIL })).toBe(GuardrailDirection.UNFAVORABLE);
  });
  test("breaching a bound explicitly declared safe_direction is NEUTRAL, not unfavorable", () => {
    const guardrail = { lowerBound: 8, upperBound: 9, upperBoundMeaning: "safe_direction" };
    expect(classifyGuardrailDirection({ currentValue: 9.4, priorValue: 8.5, guardrail })).toBe(GuardrailDirection.NEUTRAL);
  });
  test("drifting toward an unsafe upper edge while still inside range is UNFAVORABLE", () => {
    expect(classifyGuardrailDirection({ currentValue: 8.85, priorValue: 8.5, guardrail: LEAN_MASS_GUARDRAIL })).toBe(GuardrailDirection.UNFAVORABLE);
  });
  test("the OPPOSITE goal-type declaration reverses meaning without any code branch on the Goal", () => {
    // A hypothetical fat-loss Goal: lower bound is safe (you may go below), upper is unsafe.
    const fatLossGuardrail = { lowerBound: 12, upperBound: 15, lowerBoundMeaning: "safe_direction", upperBoundMeaning: "unsafe_direction" };
    expect(classifyGuardrailDirection({ currentValue: 12.3, priorValue: 11.0, guardrail: fatLossGuardrail })).toBe(GuardrailDirection.NEUTRAL);
    expect(classifyGuardrailDirection({ currentValue: 14.8, priorValue: 13.5, guardrail: fatLossGuardrail })).toBe(GuardrailDirection.UNFAVORABLE);
  });
});

describe("evaluateGuardrailTransition — Guardrail-optional capability", () => {
  test("no guardrail at all resolves to unknown/unknown/unknown, never a fabricated judgment", () => {
    const result = evaluateGuardrailTransition({ currentValue: 8.1, priorValue: 7.6, guardrail: null });
    expect(result.guardrailState).toBe(GuardrailState.UNKNOWN);
    expect(result.guardrailTransition).toBe(GuardrailTransition.UNKNOWN);
    expect(result.guardrailDirection).toBe(GuardrailDirection.UNKNOWN);
  });
  test("aggregate object is frozen", () => {
    const result = evaluateGuardrailTransition({ currentValue: 8.1, priorValue: 7.6, guardrail: LEAN_MASS_GUARDRAIL });
    expect(Object.isFrozen(result)).toBeTruthy();
  });
});

describe("genericity — no Goal-specific branch", () => {
  test("module source contains no Build-Lean-Mass or Establish-Maintenance literal", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("./GuardrailTransitionService.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/build[_ -]?lean[_ -]?mass/i);
    expect(source).not.toMatch(/establish[_ -]?maintenance/i);
    expect(source).not.toMatch(/lean[_ -]?mass[_ -]?build/i);
  });
});
