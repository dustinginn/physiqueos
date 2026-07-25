export function createGoalTransitionRepository(drafts = [], options = {}) {
  return {
    async getById(id) {
      return structuredClone(drafts.find((draft) => draft.id === id) ?? null);
    },
    async getLatestActiveForSourceGoal(userId, sourceGoalId) {
      return structuredClone(
        drafts
          .filter((draft) => draft.userId === userId && draft.sourceGoalId === sourceGoalId && ["draft", "ready"].includes(draft.status))
          .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] ?? null
      );
    },
    async save(draft) {
      const index = drafts.findIndex((item) => item.id === draft.id);
      const next = structuredClone(draft);
      if (index >= 0) drafts[index] = next;
      else drafts.push(next);
      options.onChange?.();
      return structuredClone(next);
    },
  };
}
