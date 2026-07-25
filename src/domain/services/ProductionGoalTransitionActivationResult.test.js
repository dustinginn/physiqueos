import { describe, expect, it } from "vitest";
import { projectProductionGoalTransitionActivationResult } from "./ProductionGoalTransitionActivationResult";

describe("Production Goal Transition activation result projection", () => {
  it.each([
    ["ACTIVATION_COORDINATOR_DISPATCH_FAILED", "return_to_protocol_review"],
    ["ACTIVATION_COORDINATOR_STAGED_INVARIANT_FAILED", "return_to_protocol_review"],
  ])("preserves deterministic %s diagnostics without refresh guidance", (errorCode, guidance) => {
    const result = projectProductionGoalTransitionActivationResult(failure({ errorCode }));
    expect(result).toMatchObject({
      ok: false,
      committed: false,
      committedRevision: null,
      commitId: null,
      failedOperationId: "activation_op_034_create_protocol_provenance",
      failureStage: "PROTOCOL_PROVENANCE_CREATION",
      errorCode,
      guidance,
    });
    expect(result.error).toMatch(/current goal is unchanged/i);
    expect(result.error).not.toMatch(/refresh/i);
  });

  it("keeps refresh guidance for stale pre-execution state", () => {
    const result = projectProductionGoalTransitionActivationResult(failure({
      errorCode: "ACTIVATION_COORDINATOR_PRE_EXECUTION_REVALIDATION_FAILED",
    }));
    expect(result.guidance).toBe("refresh_final_review");
  });

  it("preserves committed metadata and never represents it as retryable failure", () => {
    const result = projectProductionGoalTransitionActivationResult({
      ...failure({ errorCode: "ACTIVATION_COORDINATOR_POST_COMMIT_EFFECT_FAILED" }),
      status: "failed_committed",
      committed: true,
      committedRevision: 1,
      commitId: "commit_1",
      preCommitFailure: false,
      postCommitFailure: true,
    });
    expect(result).toMatchObject({
      ok: true,
      committed: true,
      committedRevision: 1,
      commitId: "commit_1",
      guidance: null,
    });
  });
});

function failure(overrides = {}) {
  return {
    status: "failed_pre_commit",
    committed: false,
    completed: false,
    committedRevision: null,
    commitId: null,
    pendingExternalEffects: [],
    failedOperationId: "activation_op_034_create_protocol_provenance",
    failureStage: "PROTOCOL_PROVENANCE_CREATION",
    errorCode: "ACTIVATION_COORDINATOR_DISPATCH_FAILED",
    errorMessage: "Internal deterministic failure",
    preCommitFailure: true,
    postCommitFailure: false,
    ...overrides,
  };
}
