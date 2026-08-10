export function createBriefingReconciliationWorkItemRepository(
  workItems = [],
  options = {}
) {
  return Object.freeze({
    async listWorkItems(userId = null) {
      return workItems
        .filter((item) => !userId || !item.userId || item.userId === userId)
        .map((item) => structuredClone(item));
    },

    async getWorkItemById(id) {
      const item = workItems.find((candidate) => candidate.id === id);
      return item ? structuredClone(item) : null;
    },

    async saveWorkItem(workItem) {
      if (!workItem?.id) throw new Error("Briefing reconciliation work item ID is required.");
      const index = workItems.findIndex((item) => item.id === workItem.id);
      if (index >= 0) workItems[index] = structuredClone(workItem);
      else workItems.push(structuredClone(workItem));
      options.onChange?.();
      return structuredClone(workItem);
    },
  });
}
