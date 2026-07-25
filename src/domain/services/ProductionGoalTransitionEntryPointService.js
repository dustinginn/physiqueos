const SOURCE_GOAL_ID = "goal_visible_abs_at_rest";

export function safelyGetProductionGoalTransitionEntryPointState(store = {}) {
  try {
    return getProductionGoalTransitionEntryPointState(store);
  } catch {
    return null;
  }
}

export function getProductionGoalTransitionEntryPointState(store = {}) {
  const goals = Array.isArray(store.goals) ? store.goals : [];
  const activePrimaryGoals = goals.filter(
    (goal) => goal.status === "active" && goal.primary === true && !goal.completedAt
  );
  const sourceGoal = activePrimaryGoals.find((goal) => goal.id === SOURCE_GOAL_ID);
  const targetExists = goals.some(isBuildLeanMassGoal);
  if (activePrimaryGoals.length !== 1 || !sourceGoal || targetExists) return null;
  if ((store.goalTransitionDrafts ?? []).some(
    (draft) => draft.sourceGoalId === SOURCE_GOAL_ID
      && draft.liveProduction === true
      && draft.consumed === true
  )) return null;

  const liveGoalDrafts = (store.goalTransitionDrafts ?? [])
    .filter((draft) => draft.userId === sourceGoal.userId
      && draft.sourceGoalId === sourceGoal.id
      && draft.liveProduction === true
      && ["draft", "ready"].includes(draft.status)
      && draft.consumed !== true
      && draft.superseded !== true)
    .sort(newestFirst);
  if (liveGoalDrafts.length > 1) return null;
  const goalDraft = liveGoalDrafts[0] ?? null;
  if (!goalDraft) {
    return entry("Start Goal Transition", "start", null);
  }

  const protocolDrafts = (store.goalProtocolTransitionDrafts ?? [])
    .filter((draft) => draft.goalTransitionDraftId === goalDraft.id
      && ["draft", "ready"].includes(draft.status)
      && draft.consumed !== true
      && draft.superseded !== true)
    .sort(newestFirst);
  if (protocolDrafts.length > 1) return null;
  const protocolDraft = protocolDrafts[0] ?? null;
  if (goalDraft.status === "ready"
    && protocolDraft?.status === "ready"
    && protocolDraft.readyForActivation === true) {
    return entry("Review Goal Transition", "review", goalDraft.id);
  }
  return entry("Continue Goal Transition", "continue", goalDraft.id);
}

export function getProductionGoalTransitionResumeDestination(store, transitionId) {
  const state = getProductionGoalTransitionEntryPointState(store);
  if (!state || state.transitionId !== transitionId) return "/goals/transition";
  const protocolDraft = (store.goalProtocolTransitionDrafts ?? []).find(
    (draft) => draft.goalTransitionDraftId === transitionId
      && ["draft", "ready"].includes(draft.status)
      && draft.consumed !== true
      && draft.superseded !== true
  );
  if (state.mode === "review") {
    return `/goals/transition/review?transitionId=${encodeURIComponent(transitionId)}`;
  }
  if (store.goalTransitionDrafts.find((draft) => draft.id === transitionId)?.status === "ready"
    || protocolDraft) {
    return "/goals/transition/protocols";
  }
  return "/goals/transition";
}

function entry(label, mode, transitionId) {
  return Object.freeze({
    href: "/goals/transition",
    label,
    mode,
    transitionId,
    copy:
      "Build your next goal, review the new plan, and activate it when you are ready. "
      + "Your current goal stays active until the final confirmation.",
  });
}

function isBuildLeanMassGoal(goal) {
  return goal.type === "build_lean_mass"
    || /build lean mass/i.test(goal.title ?? goal.name ?? "");
}

function newestFirst(left, right) {
  return String(right.updatedAt ?? right.createdAt ?? "")
    .localeCompare(String(left.updatedAt ?? left.createdAt ?? ""));
}
