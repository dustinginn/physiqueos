import { describe, expect, it } from "vitest";
import {
  createPIDecisionCadenceContext,
  safelyCreatePIDecisionCadenceContext,
} from "./PIDecisionCadenceContextService";

const window = {
  startDate: "2026-07-19",
  endDate: "2026-07-25",
  briefingDate: "2026-07-25",
  timeZone: "America/Los_Angeles",
};
function input(overrides = {}) {
  return {
    cadence: "weekly",
    evidenceWindow: window,
    activeGoal: {
      id: "goal",
      title: "Build Lean Mass",
      status: "active",
      phases: [{ id: "phase", status: "active" }],
    },
    activePhase: { id: "phase", status: "active" },
    rankedCandidates: [{ id: "candidate" }],
    claims: [{ id: "claim" }],
    lifecycle: { status: "evaluated", currentClaims: [{ id: "claim" }] },
    evidenceCompleteness: {
      overall: "complete", training: "complete", energy: "complete",
      recovery: "partial", bodyComposition: "complete",
    },
    eventAuthority: { state: "no_event" },
    recommendationMetadata: {
      id: "recommendation", kind: "hold", priority: 1, count: 1,
      compatibility: "compatible",
    },
    priorDecisionMemory: {
      cadence: "weekly",
      decisionSnapshots: [{
        id: "decision", decisionKind: "maintain_current_plan",
        status: "supported", lifecycle: { state: "unchanged" },
      }],
    },
    ...overrides,
  };
}

describe("PIDecisionCadenceContextService", () => {
  it.each(["daily", "midweek", "weekly"])(
    "normalizes known Goal and phase at the %s boundary",
    (cadence) => {
      const result = createPIDecisionCadenceContext(input({ cadence }));
      expect(result).toMatchObject({
        cadence,
        readiness: "ready",
        goalContext: {
          activeGoalId: "goal",
          semanticGoalType: "lean_mass_gain",
          phaseId: "phase",
        },
        phaseContext: { phaseId: "phase" },
        provenance: { repositoryReads: 0, runtimeClockReads: 0 },
      });
    }
  );

  it.each(["daily", "midweek", "weekly"])(
    "normalizes unknown phase without crashing for %s",
    (cadence) => {
      const result = createPIDecisionCadenceContext(input({
        cadence,
        activePhase: null,
        activeGoal: { id: "goal", title: "Build Lean Mass", phases: [] },
      }));
      expect(result.readiness).toBe("ready");
      expect(result.phaseContext).toMatchObject({
        phaseId: null,
        phaseAgeBand: "unknown",
      });
      expect(result.limitations).toContain("active_phase_unavailable");
    }
  );

  it("uses normalized Goal and phase context before explicit records", () => {
    const result = createPIDecisionCadenceContext(input({
      normalizedGoalContext: {
        activeGoalId: "normalized_goal",
        semanticGoalType: "fat_loss",
        phaseId: "normalized_phase",
        phaseAgeBand: "week_5_to_8",
      },
      normalizedPhaseContext: {
        phaseId: "normalized_phase",
        phaseStatus: "active",
        phaseAgeBand: "week_5_to_8",
      },
    }));
    expect(result.goalContext.activeGoalId).toBe("normalized_goal");
    expect(result.phaseContext.phaseId).toBe("normalized_phase");
    expect(result.provenance).toMatchObject({
      goalContextSource: "existing_normalized_goal_context",
      phaseContextSource: "existing_normalized_phase_context",
    });
  });

  it.each([
    ["daily", "event_owns_decision"],
    ["midweek", "event_suppresses_routine_decision"],
    ["weekly", "goal_completion_owns_surface"],
    ["weekly", "goal_transition_owns_surface"],
  ])("preserves %s event authority %s", (cadence, state) => {
    const result = createPIDecisionCadenceContext(input({
      cadence,
      activeGoal: null,
      activePhase: null,
      eventGoalContext: {
        activeGoalId: "event_goal",
        semanticGoalType: "fat_loss",
      },
      eventPhaseContext: { phaseId: null, phaseAgeBand: "unknown" },
      eventAuthority: { state, sourceId: "event" },
    }));
    expect(result.eventAuthority).toEqual({ state, sourceId: "event" });
    expect(result.goalContext.activeGoalId).toBe("event_goal");
  });

  it("supports no active Goal and Daily cadence-disabled limitations", () => {
    const result = createPIDecisionCadenceContext(input({
      cadence: "daily", activeGoal: null, activePhase: null,
      limitations: ["daily_cadence_not_enabled_for_goal"],
    }));
    expect(result.goalContext.semanticGoalType).toBe("unknown");
    expect(result.limitations).toContain("daily_cadence_not_enabled_for_goal");
  });

  it("prevents the branch-local phase regression by carrying a bounded phase value", () => {
    const branchPhase = { id: "branch_phase", status: "active" };
    const result = createPIDecisionCadenceContext(input({
      activePhase: branchPhase,
    }));
    expect(result.phaseContext).toEqual({
      phaseId: "branch_phase",
      phaseStatus: "active",
      phaseAgeBand: "unknown",
    });
    expect(JSON.stringify(result)).not.toContain("activePhase");
  });

  it("bounds candidates and claims", () => {
    expect(() => createPIDecisionCadenceContext(input({
      rankedCandidates: Array.from({ length: 25 }, (_, index) => ({
        id: `candidate_${index}`,
      })),
    }))).toThrow(/bounded/);
    expect(() => createPIDecisionCadenceContext(input({
      claims: Array.from({ length: 25 }, (_, index) => ({
        id: `claim_${index}`,
      })),
    }))).toThrow(/bounded/);
  });

  it("is deterministic and immutable with no repository or runtime-clock reads", () => {
    const source = input();
    const before = structuredClone(source);
    const result = createPIDecisionCadenceContext(source);
    expect(source).toEqual(before);
    expect(createPIDecisionCadenceContext(source)).toEqual(result);
    expect(result.provenance).toMatchObject({
      repositoryReads: 0,
      runtimeClockReads: 0,
      persistenceWrites: 0,
    });
  });

  it("returns bounded fallback diagnostics on malformed context", () => {
    expect(safelyCreatePIDecisionCadenceContext({
      cadence: "midweek",
      evidenceWindow: null,
    })).toMatchObject({
      status: "blocked",
      context: null,
      diagnostics: [{
        code: "decision_cadence_context_normalization_failed",
      }],
    });
  });
});
