import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GoalPhaseStatus,
  GoalPhaseTimingMode,
  GoalPhaseTransitionPolicy,
  GoalPhaseValidationError,
  createGoalPhase,
  normalizeGoalPhaseCollection,
  resolveGoalPhases,
  validateGoalPhaseCollection,
} from "./goalPhase";

function phase(overrides = {}) {
  return {
    id: "phase-foundation",
    goalId: "goal-one",
    name: "Foundation",
    purpose: "Establish the initial baseline.",
    status: "active",
    order: 0,
    startDate: "2026-07-21",
    targetDate: null,
    duration: null,
    timingMode: "completion_criteria",
    successCriteria: [],
    guardrails: [],
    transitionPolicy: "manual_review",
    createdAt: "2026-07-21T12:00:00.000Z",
    updatedAt: "2026-07-21T12:00:00.000Z",
    ...overrides,
  };
}

describe("GoalPhase domain contract", () => {
  it("normalizes a valid fixed-duration phase", () => {
    expect(createGoalPhase(phase({
      duration: { value: 4, unit: "weeks" },
      timingMode: "fixed_duration",
    }))).toMatchObject({ duration: { value: 4, unit: "weeks" }, timingMode: "fixed_duration" });
  });

  it("normalizes valid target-date and completion-criteria phases", () => {
    expect(createGoalPhase(phase({ timingMode: "target_date", targetDate: "2026-08-21" })).targetDate).toBe("2026-08-21");
    expect(createGoalPhase(phase({
      timingMode: "completion_criteria",
      successCriteria: [{ id: "criterion-one", label: "Baseline established" }],
    })).successCriteria).toEqual([{ id: "criterion-one", label: "Baseline established" }]);
  });

  it.each([
    ["status", "expired", "GOAL_PHASE_STATUS_UNSUPPORTED"],
    ["timingMode", "indefinite", "GOAL_PHASE_TIMING_MODE_UNSUPPORTED"],
    ["transitionPolicy", "silent", "GOAL_PHASE_TRANSITION_POLICY_UNSUPPORTED"],
  ])("rejects unsupported %s values", (field, value, code) => {
    expect(() => createGoalPhase(phase({ [field]: value }))).toThrowError(expect.objectContaining({ code }));
  });

  it("rejects invalid fixed duration and missing target date", () => {
    expect(() => createGoalPhase(phase({ timingMode: "fixed_duration", duration: { value: 0, unit: "weeks" } })))
      .toThrowError(expect.objectContaining({ code: "GOAL_PHASE_DURATION_INVALID" }));
    expect(() => createGoalPhase(phase({ timingMode: "target_date", targetDate: null })))
      .toThrowError(expect.objectContaining({ code: "GOAL_PHASE_TARGET_DATE_REQUIRED" }));
  });

  it("normalizes missing collections and rejects malformed collections", () => {
    const normalized = createGoalPhase(phase({ successCriteria: undefined, guardrails: null }));
    expect(normalized.successCriteria).toEqual([]);
    expect(normalized.guardrails).toEqual([]);
    expect(() => createGoalPhase(phase({ guardrails: "none" })))
      .toThrowError(expect.objectContaining({ code: "GOAL_PHASE_COLLECTION_FIELD_INVALID" }));
  });

  it("does not mutate input, preserves unknown fields, and deeply freezes output", () => {
    const input = phase({ customMetadata: { source: "future-authoring" }, guardrails: [{ label: "Stable" }] });
    const before = structuredClone(input);
    const result = createGoalPhase(input);
    expect(input).toEqual(before);
    expect(result.customMetadata).toEqual({ source: "future-authoring" });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.guardrails[0])).toBe(true);
  });

  it("rejects conflicting active and completed representations", () => {
    expect(() => createGoalPhase(phase({ status: "active", completed: true })))
      .toThrowError(expect.objectContaining({ code: "GOAL_PHASE_STATE_CONFLICT" }));
  });

  it("exports exactly the supported enum values", () => {
    expect(Object.values(GoalPhaseStatus)).toEqual(["upcoming", "planned", "active", "review_due", "review_pending_decision", "completed", "skipped", "superseded", "paused"]);
    expect(Object.values(GoalPhaseTimingMode)).toEqual(["fixed_duration", "target_date", "completion_criteria"]);
    expect(Object.values(GoalPhaseTransitionPolicy)).toEqual(["manual_review", "evidence_review", "automatic"]);
  });
});

describe("GoalPhase collection invariants", () => {
  it("orders deterministically without mutating source order", () => {
    const input = [
      phase({ id: "phase-two", order: 2, status: "upcoming" }),
      phase({ id: "phase-zero", order: 0, status: "completed" }),
      phase({ id: "phase-one", order: 1, status: "active" }),
    ];
    const before = structuredClone(input);
    const result = normalizeGoalPhaseCollection(input);
    expect(result.map((item) => item.id)).toEqual(["phase-zero", "phase-one", "phase-two"]);
    expect(input).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    [[phase(), phase({ order: 1 })], "GOAL_PHASE_ID_DUPLICATE"],
    [[phase(), phase({ id: "other" })], "GOAL_PHASE_ORDER_DUPLICATE"],
    [[phase(), phase({ id: "other", order: 1, status: "active" })], "GOAL_PHASE_MULTIPLE_ACTIVE"],
    [[phase({ status: "active" }), phase({ id: "later", order: 1, status: "completed" })], "GOAL_PHASE_SEQUENCE_INVALID"],
    [[phase({ status: "upcoming" }), phase({ id: "later", order: 1, status: "active" })], "GOAL_PHASE_SEQUENCE_INVALID"],
    [[phase(), phase({ id: "other", goalId: "goal-two", order: 1, status: "upcoming" })], "GOAL_PHASE_GOAL_MISMATCH"],
  ])("rejects invalid aggregate relationships", (input, code) => {
    expect(() => normalizeGoalPhaseCollection(input)).toThrowError(expect.objectContaining({ code }));
  });

  it("supports skipped phases in the completed portion of a valid sequence", () => {
    const result = normalizeGoalPhaseCollection([
      phase({ id: "complete", order: 0, status: "completed" }),
      phase({ id: "skipped", order: 1, status: "skipped" }),
      phase({ id: "active", order: 2, status: "active" }),
      phase({ id: "upcoming", order: 3, status: "upcoming" }),
    ]);
    expect(result.map((item) => item.status)).toEqual(["completed", "skipped", "active", "upcoming"]);
  });

  it("accepts an empty collection for legacy goals", () => {
    expect(normalizeGoalPhaseCollection([])).toEqual([]);
    expect(validateGoalPhaseCollection([])).toMatchObject({ valid: true, errors: [], phases: [] });
  });

  it("returns explicit aggregate validation errors", () => {
    const result = validateGoalPhaseCollection([phase(), phase({ order: 1 })]);
    expect(result).toMatchObject({ valid: false, phases: null, errors: [{ code: "GOAL_PHASE_ID_DUPLICATE" }] });
  });
});

describe("legacy goal phase compatibility", () => {
  it("resolves a deterministic implicit active phase without fabricating phase facts", () => {
    const goal = Object.freeze({ id: "goal-legacy", title: "Legacy Goal", status: "active" });
    const first = resolveGoalPhases(goal);
    const second = resolveGoalPhases(goal);
    expect(second).toEqual(first);
    expect(first).toEqual([expect.objectContaining({
      id: "goal_phase_goal_legacy_implicit",
      goalId: "goal-legacy",
      name: "Legacy Goal",
      status: "active",
      implicit: true,
      duration: null,
      targetDate: null,
      successCriteria: [],
      guardrails: [],
    })]);
    expect(goal).toEqual({ id: "goal-legacy", title: "Legacy Goal", status: "active" });
  });

  it("preserves a completed goal as a completed implicit phase", () => {
    expect(resolveGoalPhases({ id: "goal-done", title: "Done", status: "completed" })[0])
      .toMatchObject({ status: "completed", sourceGoalStatus: "completed", implicit: true });
  });

  it("uses explicit phases when authored without changing the goal", () => {
    const goal = { id: "goal-one", phases: [phase()] };
    const before = structuredClone(goal);
    const resolved = resolveGoalPhases(goal)[0];
    expect(resolved).toMatchObject({ id: "phase-foundation" });
    expect(resolved).not.toHaveProperty("implicit");
    expect(goal).toEqual(before);
  });

  it("does not write implicit phases into production state", () => {
    const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");
    const before = fs.readFileSync(storePath, "utf8");
    const store = JSON.parse(before);
    for (const goal of store.goals) resolveGoalPhases(goal);
    expect(fs.readFileSync(storePath, "utf8")).toBe(before);
    expect(store).toEqual(JSON.parse(before));
  });

  it("uses typed validation errors", () => {
    expect(() => resolveGoalPhases({})).toThrow(GoalPhaseValidationError);
  });
});
