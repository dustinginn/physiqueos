import { createReminderRepository } from "../../data/repositories/ReminderRepository.js";

export const PRIORITY_COMPLETION_COLLECTIONS = Object.freeze(["reminders"]);

export function createPriorityCompletionService({ mutateCanonicalRuntime, now = () => new Date() } = {}) {
  if (typeof mutateCanonicalRuntime !== "function") throw new Error("Priority completion requires a bounded canonical mutation.");
  return Object.freeze({
    async complete({ priorityId, occurrenceDate = "", dose = "", protocolId = "" } = {}) {
      if (!priorityId) throw new Error("Priority id is required.");
      const completedAt = now().toISOString();
      const committed = await mutateCanonicalRuntime({
        operation: "priority-completion",
        allowedCollections: PRIORITY_COMPLETION_COLLECTIONS,
        readCollections: PRIORITY_COMPLETION_COLLECTIONS,
        readApplicationContext: false,
        readImportMetadata: false,
        allowApplicationContextMutation: false,
        async mutate(candidate) {
          const reminders = createReminderRepository(candidate.reminders ?? []);
          const result = occurrenceDate && dose && protocolId
            ? await reminders.completeReminderFromEvidence(priorityId, {
                id: `${priorityId}:${occurrenceDate}`,
                completedAt,
                evidenceDate: occurrenceDate,
                effectiveDose: dose,
                protocolId,
                satisfactionType: "scheduled_protocol_execution",
                canonicalEvidenceId: null,
              })
            : await reminders.completeReminder(priorityId, completedAt);
          if (!result) throw Object.assign(new Error("The priority is unavailable."), { code: "PRIORITY_NOT_FOUND" });
          return result;
        },
      });
      return Object.freeze({ ...committed, completion: committed.result });
    },
  });
}
