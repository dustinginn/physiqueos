export function projectProductionGoalTransitionActivationResult(result) {
  const deterministicPlanFailure = [
    "ACTIVATION_COORDINATOR_DISPATCH_FAILED",
    "ACTIVATION_COORDINATOR_STAGED_INVARIANT_FAILED",
  ].includes(result.errorCode);
  return {
    ok: result.committed === true,
    status: result.status,
    committed: result.committed === true,
    completed: result.completed === true,
    committedRevision: result.committedRevision,
    commitId: result.commitId,
    pendingExternalEffectCount: result.pendingExternalEffects?.length ?? 0,
    failedOperationId: result.failedOperationId ?? null,
    failureStage: result.failureStage ?? null,
    errorCode: result.errorCode ?? null,
    preCommitFailure: result.preCommitFailure === true,
    postCommitFailure: result.postCommitFailure === true,
    error: deterministicPlanFailure
      ? "We couldn't activate the new goal because one part of the reviewed plan could not be applied. Your current goal is unchanged."
      : result.errorMessage ?? null,
    guidance: deterministicPlanFailure
      ? "return_to_protocol_review"
      : result.preCommitFailure ? "refresh_final_review" : null,
  };
}
