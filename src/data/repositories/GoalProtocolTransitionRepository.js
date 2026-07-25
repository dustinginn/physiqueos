export function createGoalProtocolTransitionRepository(drafts = [], options = {}) {
  return {
    async getById(id) {
      return clone(drafts.find((draft) => draft.id === id) ?? null);
    },
    async getLatestActiveForGoalTransition(goalTransitionDraftId) {
      return clone(
        drafts
          .filter((draft) => draft.goalTransitionDraftId === goalTransitionDraftId && ["draft", "ready"].includes(draft.status))
          .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))[0] ?? null
      );
    },
    async save(draft) {
      const next = clone(draft);
      const index = drafts.findIndex((item) => item.id === next.id);
      if (index >= 0) drafts[index] = next;
      else drafts.push(next);
      options.onChange?.();
      return clone(next);
    },
  };
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}
