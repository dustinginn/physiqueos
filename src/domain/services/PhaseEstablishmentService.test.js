import { describe, expect, it } from "vitest";
import { validatePhaseStrategy } from "../models/phaseStrategy";
import { validatePhaseExpectedTrajectory } from "../models/phaseExpectedTrajectory";
import { createAuthorizedPhaseEstablishment } from "./PhaseEstablishmentService";

const goal = { id: "goal", target: { metric: "lean_mass", direction: "increase", amount: 5, unit: "lb" },
  timeline: { targetDate: "2026-12-31" }, guardrails: [{ text: "Maintain 10–12% body fat." }] };
const currentPhase = { id: "phase-1" };
const nextPhase = { id: "phase-2", purpose: "Build", targetDate: "2026-12-31" };
function create(overrides = {}) { return createAuthorizedPhaseEstablishment({ goal, currentPhase,
  nextPhase, actorId: "user", decisionId: "decision", idempotencyKey: "key",
  decidedAt: "2026-09-01T12:00:00.000Z", projectedStart: "2026-09-02",
  caloricIntakeTarget: { value: 2800, unit: "kcal/day" },
  activityExpenditureTarget: { value: 800, unit: "kcal/day" },
  sourceArtifactId: "briefing", sourceEvidenceId: "scan", ...overrides }); }

describe("authorized Phase establishment", () => {
  it("builds accepted semantic and trajectory records while keeping execution targets separate", () => {
    const result = create();
    expect(validatePhaseStrategy(result.strategy)).toBe(true);
    expect(validatePhaseExpectedTrajectory(result.trajectory)).toBe(true);
    expect(result.executionTargets).toMatchObject({ caloricIntake: { value: 2800, unit: "kcal/day" },
      activityExpenditure: { value: 800, unit: "kcal/day" } });
    expect(JSON.stringify(result.strategy.domains)).not.toContain("2800");
  });
  it("requires both typed targets and rejects unsafe values", () => {
    expect(() => create({ caloricIntakeTarget: null })).toThrow(/caloricIntakeTarget/);
    expect(() => create({ activityExpenditureTarget: { value: -1, unit: "kcal\/day" } }))
      .toThrow(/activityExpenditureTarget/);
  });
  it("does not depend on Founder-specific identities or dates", () => {
    const text = JSON.stringify(create());
    for (const value of ["Founder", "2026-07-18", "2026-08-15", "2026-10-31", "Build Lean Mass"]) {
      expect(text).not.toContain(value);
    }
  });
});
