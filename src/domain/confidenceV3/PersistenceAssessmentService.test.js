import { describe, expect, test } from "vitest";
import {
  classifyPersistenceState,
  computePersistenceMovementFactor,
  evaluatePersistence,
  PersistenceState,
  PERSISTENCE_UPWARD_MOVEMENT_FACTOR,
} from "./PersistenceAssessmentService.js";

describe("classifyPersistenceState — pure repetition/agreement facts", () => {
  test("no observed interval at all is unestablished", () =>
    expect(classifyPersistenceState({ hasObservedInterval: false })).toBe(PersistenceState.UNESTABLISHED));
  test("first-ever favorable interval is single_observation", () =>
    expect(classifyPersistenceState({ hasObservedInterval: true, priorConfirmingIntervalCount: 0 })).toBe(PersistenceState.SINGLE_OBSERVATION));
  test("one prior confirming interval is confirmed_repeat", () =>
    expect(classifyPersistenceState({ hasObservedInterval: true, priorConfirmingIntervalCount: 1 })).toBe(PersistenceState.CONFIRMED_REPEAT));
  test("two or more prior confirming intervals is sustained_repeat", () =>
    expect(classifyPersistenceState({ hasObservedInterval: true, priorConfirmingIntervalCount: 3 })).toBe(PersistenceState.SUSTAINED_REPEAT));
  test("contradiction overrides any confirming count", () =>
    expect(classifyPersistenceState({ hasObservedInterval: true, priorConfirmingIntervalCount: 5, contradicted: true })).toBe(PersistenceState.CONTRADICTED));
});

describe("computePersistenceMovementFactor — the asymmetry (Task 8)", () => {
  test("upward movement at single_observation is discounted but NOT near-zero", () => {
    const factor = computePersistenceMovementFactor({ persistenceState: PersistenceState.SINGLE_OBSERVATION, movementDirection: 1 });
    expect(factor > 0.5).toBeTruthy();
    expect(factor < 1).toBeTruthy();
  });
  test("downward movement is NEVER discounted by persistence, at any persistence state", () => {
    for (const state of Object.values(PersistenceState)) {
      const factor = computePersistenceMovementFactor({ persistenceState: state, movementDirection: -1 });
      expect(factor).toBe(1);
    }
  });
  test("held (zero desired movement) is also never discounted", () => {
    expect(computePersistenceMovementFactor({ persistenceState: PersistenceState.SINGLE_OBSERVATION, movementDirection: 0 })).toBe(1);
  });
  test("upward factor is monotonic in repetition: sustained > confirmed > single > unestablished", () => {
    const order = [PersistenceState.UNESTABLISHED, PersistenceState.SINGLE_OBSERVATION, PersistenceState.CONFIRMED_REPEAT, PersistenceState.SUSTAINED_REPEAT];
    const factors = order.map((persistenceState) => computePersistenceMovementFactor({ persistenceState, movementDirection: 1 }));
    for (let i = 1; i < factors.length; i += 1) {
      expect(factors[i] > factors[i - 1]).toBeTruthy();
    }
  });
  test("unestablished upward factor is exactly zero — nothing to move toward yet", () => {
    expect(computePersistenceMovementFactor({ persistenceState: PersistenceState.UNESTABLISHED, movementDirection: 1 })).toBe(0);
  });
});

describe("table completeness", () => {
  test("every PersistenceState has an upward-movement-factor entry", () => {
    for (const state of Object.values(PersistenceState)) {
      expect(state in PERSISTENCE_UPWARD_MOVEMENT_FACTOR).toBeTruthy();
    }
  });
});

describe("evaluatePersistence — aggregate", () => {
  test("the Sep 12 shape: a first-ever favorable interval with no prior confirming reading", () => {
    const result = evaluatePersistence({ hasObservedInterval: true, priorConfirmingIntervalCount: 0 });
    expect(result.persistenceState).toBe(PersistenceState.SINGLE_OBSERVATION);
    expect(result.persistenceUpwardMovementFactor > 0 && result.persistenceUpwardMovementFactor < 1).toBeTruthy();
    expect(Object.isFrozen(result)).toBeTruthy();
  });
});

describe("genericity", () => {
  test("no Goal/Phase-specific literal; persistence is purely repetition-count driven", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("./PersistenceAssessmentService.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/["'`]build_lean_mass["'`]/i);
    expect(source).not.toMatch(/["'`]establish_maintenance["'`]/i);
    expect(source).not.toMatch(/semanticPhaseType/i);
  });
});
