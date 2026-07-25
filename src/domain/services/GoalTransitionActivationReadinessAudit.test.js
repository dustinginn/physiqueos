import { describe, expect, it, vi } from "vitest";
import { auditGoalTransitionActivationReadiness } from "./GoalTransitionActivationReadinessAudit";

function fixture() {
  const state = {
    goals: [{ id: "old-goal", userId: "u", primary: true, status: "active" }],
    goalDrafts: [{
      id: "goal-draft",
      userId: "u",
      sourceGoalId: "old-goal",
      status: "ready",
    }],
    protocolDrafts: [{
      id: "protocol-draft",
      goalTransitionDraftId: "goal-draft",
      sourceGoalId: "old-goal",
      status: "ready",
      readyForActivation: true,
      validation: { valid: true, preparedCount: 1, unresolvedReviewIds: [] },
      generatedCommitments: [{ id: "future-commitment" }],
    }],
    protocols: [{
      id: "historical-protocol",
      userId: "u",
      status: "active",
      currentVersionId: "historical-protocol-v1",
    }],
    protocolVersions: [{
      id: "historical-protocol-v1",
      protocolId: "historical-protocol",
      status: "active",
    }],
    executionItems: [{ id: "existing-commitment", userId: "u", active: true }],
    reminders: [{ id: "existing-reminder", userId: "u", active: true }],
  };
  const mutation = vi.fn(() => {
    throw new Error("The audit attempted a production write.");
  });
  return {
    state,
    mutation,
    repositories: {
      goals: {
        listGoals: vi.fn(async () => state.goals),
        updateGoal: mutation,
        saveGoal: mutation,
      },
      goalTransitions: {
        getLatestActiveForSourceGoal: vi.fn(async () => state.goalDrafts[0]),
        save: mutation,
      },
      goalProtocolTransitions: {
        getLatestActiveForGoalTransition: vi.fn(async () => state.protocolDrafts[0]),
        save: mutation,
      },
      protocols: {
        listProtocols: vi.fn(async () => state.protocols),
        saveProtocol: mutation,
        updateProtocol: mutation,
      },
      protocolVersions: {
        listVersions: vi.fn(async (id) => state.protocolVersions.filter((item) => item.protocolId === id)),
        appendVersion: mutation,
        supersedeVersion: mutation,
      },
      executionItems: {
        listExecutionItems: vi.fn(async () => state.executionItems),
        saveExecutionItem: mutation,
      },
      reminders: {
        listReminders: vi.fn(async () => state.reminders),
        saveReminder: mutation,
        completeReminder: mutation,
      },
    },
  };
}

describe("GoalTransitionActivationReadinessAudit", () => {
  it("inspects accepted artifacts without mutating any lifecycle repository", async () => {
    const { state, repositories, mutation } = fixture();
    const before = JSON.stringify(state);

    const result = await auditGoalTransitionActivationReadiness({
      repositories,
      userId: "u",
      sourceGoalId: "old-goal",
    });

    expect(result.readOnly).toBe(true);
    expect(result.acceptedArtifactsReady).toBe(true);
    expect(result.activationSafe).toBe(false);
    expect(result.blockers).toContain("architecture:atomicCommit");
    expect(mutation).not.toHaveBeenCalled();
    expect(JSON.stringify(state)).toBe(before);
  });

  it("returns detached inventory and leaves evidence-adjacent relationships byte-identical", async () => {
    const { state, repositories } = fixture();
    state.protocols[0].relatedGoalIds = ["old-goal"];
    state.reminders[0].relatedGoalIds = ["old-goal"];
    const before = structuredClone(state);

    const result = await auditGoalTransitionActivationReadiness({
      repositories,
      userId: "u",
      sourceGoalId: "old-goal",
    });
    result.inventory.activePrimaryGoalIds.push("attempted-result-mutation");

    expect(state).toEqual(before);
  });
});
