export function createGoalConfidenceRepository({
  snapshots = [],
  history = [],
  continuitySeeds = [],
} = {}, { allowStagedMutations = false } = {}) {
  const requireTransaction = () => {
    if (!allowStagedMutations) {
      throw new Error(
        "Goal-confidence mutations require an active Founder Store unit of work."
      );
    }
  };
  return Object.freeze({
    getCurrentSnapshot(goalId, phaseId) {
      return clone(snapshots.find((item) =>
        item.goalId === goalId && item.phaseId === phaseId) ?? null);
    },
    listHistory(goalId, phaseId, { limit = null } = {}) {
      const records = history.filter((item) =>
        item.goalId === goalId && item.phaseId === phaseId);
      const selected = Number.isSafeInteger(limit) && limit >= 0
        ? records.slice(-limit)
        : records;
      return clone(selected);
    },
    getHistoryRecord(historyRecordId) {
      return clone(history.find((item) => item.id === historyRecordId) ?? null);
    },
    getHistoryByAssessmentId(assessmentId) {
      return clone(history.find((item) =>
        item.assessmentId === assessmentId) ?? null);
    },
    getContinuitySeed(goalId, phaseId) {
      return clone(continuitySeeds.find((item) =>
        item.goalId === goalId && item.phaseId === phaseId) ?? null);
    },
    getContinuitySeedById(seedId) {
      return clone(continuitySeeds.find((item) => item.id === seedId) ?? null);
    },
    stageReplaceSnapshot(record) {
      requireTransaction();
      const matches = snapshots.map((item, index) => ({ item, index }))
        .filter(({ item }) =>
          item.goalId === record.goalId && item.phaseId === record.phaseId);
      if (matches.length > 1) {
        throw new Error("Multiple current goal-confidence snapshots exist.");
      }
      if (matches.length === 1) snapshots.splice(matches[0].index, 1, clone(record));
      else snapshots.push(clone(record));
      return clone(record);
    },
    stageAppendHistory(record) {
      requireTransaction();
      if (history.some((item) =>
        item.id === record.id || item.assessmentId === record.assessmentId)) {
        throw new Error("Goal-confidence history identity already exists.");
      }
      history.push(clone(record));
      return clone(record);
    },
    stageCreateContinuitySeed(record) {
      requireTransaction();
      if (continuitySeeds.some((item) =>
        item.id === record.id ||
        (item.goalId === record.goalId && item.phaseId === record.phaseId))) {
        throw new Error("Goal-confidence continuity seed already exists.");
      }
      continuitySeeds.push(clone(record));
      return clone(record);
    },
  });
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}
