const MUTATING_METHOD_PATTERN = /^(save|update|append|supersede|complete|create|delete|remove|persist|activate|apply)/i;

/**
 * Read-only inspection of the goal-transition activation boundary.
 *
 * This is deliberately not the activation validator. It records whether the
 * accepted artifacts are internally ready and whether the current repository
 * boundary is capable of applying them safely.
 */
export async function auditGoalTransitionActivationReadiness({
  repositories,
  userId,
  sourceGoalId,
}) {
  assertReadOnlyRepositorySurface(repositories);

  const [goals, goalDraft, protocols, executionItems, reminders] = await Promise.all([
    repositories.goals.listGoals(userId),
    repositories.goalTransitions.getLatestActiveForSourceGoal(userId, sourceGoalId),
    repositories.protocols.listProtocols(userId),
    repositories.executionItems.listExecutionItems(userId),
    repositories.reminders.listReminders(userId),
  ]);
  const protocolDraft = goalDraft
    ? await repositories.goalProtocolTransitions.getLatestActiveForGoalTransition(goalDraft.id)
    : null;
  const protocolVersions = (
    await Promise.all(protocols.map((protocol) => repositories.protocolVersions.listVersions(protocol.id)))
  ).flat();

  const snapshot = structuredClone({
    goals,
    goalDraft,
    protocolDraft,
    protocols,
    protocolVersions,
    executionItems,
    reminders,
  });
  const activePrimaryGoals = snapshot.goals.filter(
    (goal) => goal.primary === true && goal.status === "active"
  );
  const sourceGoal = snapshot.goals.find((goal) => goal.id === sourceGoalId) ?? null;
  const unresolvedReviewIds = protocolDraft?.validation?.unresolvedReviewIds ?? [];
  const draftChecks = {
    sourceGoalExists: Boolean(sourceGoal),
    sourceGoalIsActive: sourceGoal?.status === "active",
    exactlyOneActivePrimaryGoal: activePrimaryGoals.length === 1,
    sourceGoalIsActivePrimary: activePrimaryGoals[0]?.id === sourceGoalId,
    goalCreationDraftAccepted: goalDraft?.status === "ready",
    protocolTransitionDraftAccepted: protocolDraft?.status === "ready",
    protocolTransitionValidated: protocolDraft?.validation?.valid === true,
    protocolTransitionReadyForActivation: protocolDraft?.readyForActivation === true,
    noUnresolvedProtocolDecisions: unresolvedReviewIds.length === 0,
    protocolDraftBelongsToGoalDraft:
      Boolean(goalDraft) && protocolDraft?.goalTransitionDraftId === goalDraft.id,
    protocolDraftBelongsToSourceGoal: protocolDraft?.sourceGoalId === sourceGoalId,
  };
  const architectureChecks = {
    atomicCommit: false,
    rollback: false,
    stagedWrites: false,
    writeBatching: false,
    persistenceFailurePropagates: false,
    cacheInvalidationContract: false,
    schedulerTransactionParticipant: false,
  };

  return {
    kind: "goal_transition_activation_readiness_audit",
    readOnly: true,
    sourceGoalId,
    goalTransitionDraftId: goalDraft?.id ?? null,
    protocolTransitionDraftId: protocolDraft?.id ?? null,
    draftChecks,
    architectureChecks,
    acceptedArtifactsReady: Object.values(draftChecks).every(Boolean),
    activationSafe: Object.values(draftChecks).every(Boolean)
      && Object.values(architectureChecks).every(Boolean),
    blockers: [
      ...Object.entries(draftChecks)
        .filter(([, passed]) => !passed)
        .map(([check]) => `draft:${check}`),
      ...Object.entries(architectureChecks)
        .filter(([, passed]) => !passed)
        .map(([check]) => `architecture:${check}`),
    ],
    inventory: {
      goalCount: snapshot.goals.length,
      activePrimaryGoalIds: activePrimaryGoals.map((goal) => goal.id),
      protocolCount: snapshot.protocols.length,
      protocolVersionCount: snapshot.protocolVersions.length,
      executionItemCount: snapshot.executionItems.length,
      reminderCount: snapshot.reminders.length,
      preparedProtocolReviewCount: protocolDraft?.validation?.preparedCount ?? 0,
      unresolvedProtocolReviewIds: structuredClone(unresolvedReviewIds),
      generatedCommitmentPreviewCount: protocolDraft?.generatedCommitments?.length ?? 0,
    },
  };
}

function assertReadOnlyRepositorySurface(repositories) {
  const requiredReads = {
    goals: ["listGoals"],
    goalTransitions: ["getLatestActiveForSourceGoal"],
    goalProtocolTransitions: ["getLatestActiveForGoalTransition"],
    protocols: ["listProtocols"],
    protocolVersions: ["listVersions"],
    executionItems: ["listExecutionItems"],
    reminders: ["listReminders"],
  };
  for (const [repositoryName, methods] of Object.entries(requiredReads)) {
    const repository = repositories?.[repositoryName];
    for (const method of methods) {
      if (typeof repository?.[method] !== "function") {
        throw new Error(`Readiness audit requires ${repositoryName}.${method}().`);
      }
      if (MUTATING_METHOD_PATTERN.test(method)) {
        throw new Error(`Readiness audit cannot call mutating method ${repositoryName}.${method}().`);
      }
    }
  }
}
