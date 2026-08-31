import { createPhase4CanonicalRecordStore } from "./Phase4CanonicalRecordStore.js";

export function createPostgresPriorityNavigationReadStore({ pool, ownerUserId, onComplete = null } = {}) {
  if (!pool?.query || !ownerUserId) throw new Error("Priority navigation storage requires a PostgreSQL pool and owner.");
  return Object.freeze({
    async load({ priorityId }) {
      let queryCount = 0;
      let rowCount = 0;
      let payloadBytes = 0;
      const startedAt = performance.now();
      const records = createPhase4CanonicalRecordStore({
        query: async (text, values) => {
          queryCount += 1;
          const result = await pool.query(text, values);
          rowCount += result.rows.length;
          payloadBytes += Buffer.byteLength(JSON.stringify(result.rows));
          return result;
        },
      });
      const list = (collection) => records.list({ ownerUserId, collection });
      try {
        const [users, goals, reminder, protocols, operatingPlans, executionItems] = await Promise.all([
          list("user"),
          list("goals"),
          records.get({ ownerUserId, collection: "reminders", recordId: priorityId }),
          list("protocols"),
          list("operatingPlan"),
          list("executionItems"),
        ]);
        return Object.freeze({
          user: users.find((item) => item.id === ownerUserId) ?? users[0] ?? null,
          goals,
          reminder,
          protocols,
          operatingPlan: operatingPlans.at(-1) ?? null,
          operatingRhythm: null,
          executionItems,
        });
      } finally {
        onComplete?.({
          readModel: "priority.detail",
          queryCount,
          rowCount,
          payloadBytes,
          compatibilityRuntimeLoadCount: 0,
          elapsedMs: Math.round(performance.now() - startedAt),
          pool: { totalCount: pool.totalCount, idleCount: pool.idleCount, waitingCount: pool.waitingCount },
        });
      }
    },
  });
}

export function createRepositoryPriorityNavigationReadStore({ repositories } = {}) {
  return Object.freeze({
    async load({ priorityId }) {
      const user = await repositories.users.getCurrentUser();
      const [goals, reminder, protocols, operatingPlan, operatingRhythm, executionItems] = await Promise.all([
        repositories.goals.listGoals(user?.id),
        repositories.reminders.getReminderById(priorityId),
        repositories.protocols.listProtocols(user?.id),
        repositories.operatingPlan?.getOperatingPlan(user?.id) ?? null,
        repositories.operatingRhythm?.getOperatingRhythm(user?.id) ?? null,
        repositories.executionItems?.listExecutionItems?.(user?.id) ?? [],
      ]);
      return Object.freeze({ user, goals, reminder, protocols, operatingPlan, operatingRhythm, executionItems });
    },
  });
}
