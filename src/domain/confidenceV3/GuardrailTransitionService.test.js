import { test, describe } from "node:test";
import assert from "node:assert/strict";
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
  test("below range", () => assert.equal(classifyGuardrailState(7.6, LEAN_MASS_GUARDRAIL), GuardrailState.BELOW_RANGE));
  test("lower third — the real Founder value", () =>
    assert.equal(classifyGuardrailState(8.1, LEAN_MASS_GUARDRAIL), GuardrailState.LOWER_THIRD));
  test("central", () => assert.equal(classifyGuardrailState(8.5, LEAN_MASS_GUARDRAIL), GuardrailState.CENTRAL));
  test("upper third", () => assert.equal(classifyGuardrailState(8.9, LEAN_MASS_GUARDRAIL), GuardrailState.UPPER_THIRD));
  test("above range", () => assert.equal(classifyGuardrailState(9.4, LEAN_MASS_GUARDRAIL), GuardrailState.ABOVE_RANGE));
  test("unknown for missing guardrail", () => assert.equal(classifyGuardrailState(8.1, null), GuardrailState.UNKNOWN));
  test("unknown for non-finite value", () => assert.equal(classifyGuardrailState(null, LEAN_MASS_GUARDRAIL), GuardrailState.UNKNOWN));
  test("unknown for degenerate inverted range", () =>
    assert.equal(classifyGuardrailState(8.1, { lowerBound: 9, upperBound: 8 }), GuardrailState.UNKNOWN));
});

describe("classifyGuardrailTransition", () => {
  test("the real Founder transition: below range into lower third", () =>
    assert.equal(classifyGuardrailTransition(8.1, 7.6, LEAN_MASS_GUARDRAIL), GuardrailTransition.ENTERING_FROM_BELOW));
  test("entering from above", () =>
    assert.equal(classifyGuardrailTransition(8.5, 9.4, LEAN_MASS_GUARDRAIL), GuardrailTransition.ENTERING_FROM_ABOVE));
  test("stable — identical value", () =>
    assert.equal(classifyGuardrailTransition(8.5, 8.5, LEAN_MASS_GUARDRAIL), GuardrailTransition.STABLE));
  test("drifting toward upper edge from central", () =>
    assert.equal(classifyGuardrailTransition(8.85, 8.5, LEAN_MASS_GUARDRAIL), GuardrailTransition.DRIFTING_TOWARD_UPPER_EDGE));
  test("drifting toward lower edge from central", () =>
    assert.equal(classifyGuardrailTransition(8.15, 8.5, LEAN_MASS_GUARDRAIL), GuardrailTransition.DRIFTING_TOWARD_LOWER_EDGE));
  test("receding from lower edge into central", () =>
    assert.equal(classifyGuardrailTransition(8.5, 8.1, LEAN_MASS_GUARDRAIL), GuardrailTransition.RECEDING_FROM_LOWER_EDGE));
  test("receding from upper edge into central", () =>
    assert.equal(classifyGuardrailTransition(8.5, 8.9, LEAN_MASS_GUARDRAIL), GuardrailTransition.RECEDING_FROM_UPPER_EDGE));
  test("still below range but improving", () =>
    assert.equal(classifyGuardrailTransition(7.8, 7.4, LEAN_MASS_GUARDRAIL), GuardrailTransition.RECEDING_FROM_LOWER_EDGE));
  test("still below range and worsening", () =>
    assert.equal(classifyGuardrailTransition(7.2, 7.4, LEAN_MASS_GUARDRAIL), GuardrailTransition.DRIFTING_TOWARD_LOWER_EDGE));
  test("unknown without a prior value", () =>
    assert.equal(classifyGuardrailTransition(8.1, null, LEAN_MASS_GUARDRAIL), GuardrailTransition.UNKNOWN));
});

describe("classifyGuardrailDirection — Goal-declared semantics required for FAVORABLE", () => {
  test("the real Founder case resolves favorable given declared unsafe lower bound", () => {
    assert.equal(
      classifyGuardrailDirection({ currentValue: 8.1, priorValue: 7.6, guardrail: LEAN_MASS_GUARDRAIL }),
      GuardrailDirection.FAVORABLE
    );
  });
  test("without declared meaning, entering from below is NEUTRAL, never invented as favorable", () => {
    assert.equal(
      classifyGuardrailDirection({ currentValue: 8.1, priorValue: 7.6, guardrail: UNDECLARED_GUARDRAIL }),
      GuardrailDirection.NEUTRAL
    );
  });
  test("breaching above range defaults to UNFAVORABLE even without declared meaning", () => {
    assert.equal(
      classifyGuardrailDirection({ currentValue: 9.4, priorValue: 8.5, guardrail: UNDECLARED_GUARDRAIL }),
      GuardrailDirection.UNFAVORABLE
    );
  });
  test("breaching a bound explicitly declared safe_direction is NEUTRAL, not unfavorable", () => {
    const guardrail = { lowerBound: 8, upperBound: 9, upperBoundMeaning: "safe_direction" };
    assert.equal(
      classifyGuardrailDirection({ currentValue: 9.4, priorValue: 8.5, guardrail }),
      GuardrailDirection.NEUTRAL
    );
  });
  test("drifting toward an unsafe upper edge while still inside range is UNFAVORABLE", () => {
    assert.equal(
      classifyGuardrailDirection({ currentValue: 8.85, priorValue: 8.5, guardrail: LEAN_MASS_GUARDRAIL }),
      GuardrailDirection.UNFAVORABLE
    );
  });
  test("the OPPOSITE goal-type declaration reverses meaning without any code branch on the Goal", () => {
    // A hypothetical fat-loss Goal: lower bound is safe (you may go below), upper is unsafe.
    const fatLossGuardrail = { lowerBound: 12, upperBound: 15, lowerBoundMeaning: "safe_direction", upperBoundMeaning: "unsafe_direction" };
    assert.equal(
      classifyGuardrailDirection({ currentValue: 12.3, priorValue: 11.0, guardrail: fatLossGuardrail }),
      GuardrailDirection.NEUTRAL, // entering from below a SAFE-direction bound is neutral, not favorable
    );
    assert.equal(
      classifyGuardrailDirection({ currentValue: 14.8, priorValue: 13.5, guardrail: fatLossGuardrail }),
      GuardrailDirection.UNFAVORABLE, // drifting toward the UNSAFE upper bound
    );
  });
});

describe("evaluateGuardrailTransition — Guardrail-optional capability", () => {
  test("no guardrail at all resolves to unknown/unknown/unknown, never a fabricated judgment", () => {
    const result = evaluateGuardrailTransition({ currentValue: 8.1, priorValue: 7.6, guardrail: null });
    assert.equal(result.guardrailState, GuardrailState.UNKNOWN);
    assert.equal(result.guardrailTransition, GuardrailTransition.UNKNOWN);
    assert.equal(result.guardrailDirection, GuardrailDirection.UNKNOWN);
  });
  test("aggregate object is frozen", () => {
    const result = evaluateGuardrailTransition({ currentValue: 8.1, priorValue: 7.6, guardrail: LEAN_MASS_GUARDRAIL });
    assert.ok(Object.isFrozen(result));
  });
});

describe("genericity — no Goal-specific branch", () => {
  test("module source contains no Build-Lean-Mass or Establish-Maintenance literal", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("./GuardrailTransitionService.js", import.meta.url), "utf8");
    assert.doesNotMatch(source, /build[_ -]?lean[_ -]?mass/i);
    assert.doesNotMatch(source, /establish[_ -]?maintenance/i);
    assert.doesNotMatch(source, /lean[_ -]?mass[_ -]?build/i);
  });
});
