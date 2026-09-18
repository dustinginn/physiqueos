import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  classifyPersistenceState,
  computePersistenceMovementFactor,
  evaluatePersistence,
  PersistenceState,
  PERSISTENCE_UPWARD_MOVEMENT_FACTOR,
} from "./PersistenceAssessmentService.js";

describe("classifyPersistenceState — pure repetition/agreement facts", () => {
  test("no observed interval at all is unestablished", () =>
    assert.equal(classifyPersistenceState({ hasObservedInterval: false }), PersistenceState.UNESTABLISHED));
  test("first-ever favorable interval is single_observation", () =>
    assert.equal(classifyPersistenceState({ hasObservedInterval: true, priorConfirmingIntervalCount: 0 }), PersistenceState.SINGLE_OBSERVATION));
  test("one prior confirming interval is confirmed_repeat", () =>
    assert.equal(classifyPersistenceState({ hasObservedInterval: true, priorConfirmingIntervalCount: 1 }), PersistenceState.CONFIRMED_REPEAT));
  test("two or more prior confirming intervals is sustained_repeat", () =>
    assert.equal(classifyPersistenceState({ hasObservedInterval: true, priorConfirmingIntervalCount: 3 }), PersistenceState.SUSTAINED_REPEAT));
  test("contradiction overrides any confirming count", () =>
    assert.equal(classifyPersistenceState({ hasObservedInterval: true, priorConfirmingIntervalCount: 5, contradicted: true }), PersistenceState.CONTRADICTED));
});

describe("computePersistenceMovementFactor — the asymmetry (Task 8)", () => {
  test("upward movement at single_observation is discounted but NOT near-zero", () => {
    const factor = computePersistenceMovementFactor({ persistenceState: PersistenceState.SINGLE_OBSERVATION, movementDirection: 1 });
    assert.ok(factor > 0.5, `expected a majority factor, got ${factor}`);
    assert.ok(factor < 1, "a first observation must not receive full trust upward");
  });
  test("downward movement is NEVER discounted by persistence, at any persistence state", () => {
    for (const state of Object.values(PersistenceState)) {
      const factor = computePersistenceMovementFactor({ persistenceState: state, movementDirection: -1 });
      assert.equal(factor, 1, `expected full-strength downward movement at ${state}, got ${factor}`);
    }
  });
  test("held (zero desired movement) is also never discounted", () => {
    assert.equal(computePersistenceMovementFactor({ persistenceState: PersistenceState.SINGLE_OBSERVATION, movementDirection: 0 }), 1);
  });
  test("upward factor is monotonic in repetition: sustained > confirmed > single > unestablished", () => {
    const order = [PersistenceState.UNESTABLISHED, PersistenceState.SINGLE_OBSERVATION, PersistenceState.CONFIRMED_REPEAT, PersistenceState.SUSTAINED_REPEAT];
    const factors = order.map((persistenceState) => computePersistenceMovementFactor({ persistenceState, movementDirection: 1 }));
    for (let i = 1; i < factors.length; i += 1) {
      assert.ok(factors[i] > factors[i - 1], `expected ${order[i]} (${factors[i]}) > ${order[i - 1]} (${factors[i - 1]})`);
    }
  });
  test("unestablished upward factor is exactly zero — nothing to move toward yet", () => {
    assert.equal(computePersistenceMovementFactor({ persistenceState: PersistenceState.UNESTABLISHED, movementDirection: 1 }), 0);
  });
});

describe("table completeness", () => {
  test("every PersistenceState has an upward-movement-factor entry", () => {
    for (const state of Object.values(PersistenceState)) {
      assert.ok(state in PERSISTENCE_UPWARD_MOVEMENT_FACTOR, `missing entry for ${state}`);
    }
  });
});

describe("evaluatePersistence — aggregate", () => {
  test("the Sep 12 shape: a first-ever favorable interval with no prior confirming reading", () => {
    const result = evaluatePersistence({ hasObservedInterval: true, priorConfirmingIntervalCount: 0 });
    assert.equal(result.persistenceState, PersistenceState.SINGLE_OBSERVATION);
    assert.ok(result.persistenceUpwardMovementFactor > 0 && result.persistenceUpwardMovementFactor < 1);
    assert.ok(Object.isFrozen(result));
  });
});

describe("genericity", () => {
  test("no Goal/Phase-specific literal; persistence is purely repetition-count driven", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("./PersistenceAssessmentService.js", import.meta.url), "utf8");
    assert.doesNotMatch(source, /["'`]build_lean_mass["'`]/i);
    assert.doesNotMatch(source, /["'`]establish_maintenance["'`]/i);
    assert.doesNotMatch(source, /semanticPhaseType/i);
  });
});
