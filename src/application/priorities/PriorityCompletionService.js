import { createReminderRepository } from "../../data/repositories/ReminderRepository.js";
import {
  isReminderOccurrenceCompleted,
  createPriorityOccurrenceKey,
  resolvePriorityExecutionContract,
  resolveReminderOccurrenceDate,
} from "../../domain/services/ReminderOccurrenceCompletion.js";

export const PRIORITY_COMPLETION_COLLECTIONS = Object.freeze(["reminders"]);

export function createPriorityCompletionService({ mutateCanonicalRuntime, now = () => new Date() } = {}) {
  if (typeof mutateCanonicalRuntime !== "function") throw new Error("Priority completion requires a bounded canonical mutation.");
  return Object.freeze({
    async complete({ priorityId, occurrenceDate = "", dose = "", protocolId = "", timeZone = null } = {}) {
      if (!priorityId) throw new Error("Priority id is required.");
      const completedAt = now().toISOString();
      const effectiveOccurrenceDate = resolveReminderOccurrenceDate({
        completedAt,
        occurrenceDate,
        timeZone,
      });
      const committed = await mutateCanonicalRuntime({
        operation: "priority-completion",
        allowedCollections: PRIORITY_COMPLETION_COLLECTIONS,
        readCollections: PRIORITY_COMPLETION_COLLECTIONS,
        readApplicationContext: false,
        readImportMetadata: false,
        allowApplicationContextMutation: false,
        async mutate(candidate) {
          const reminders = createReminderRepository(candidate.reminders ?? []);
          const current = await reminders.getReminderById(priorityId);
          if (!current) {
            throw Object.assign(new Error("The priority is unavailable."), { code: "PRIORITY_NOT_FOUND" });
          }
          if (isReminderOccurrenceCompleted(current, {
            occurrenceDate: effectiveOccurrenceDate,
            timeZone,
          })) {
            return Object.freeze({
              status: "already_completed",
              occurrenceDate: effectiveOccurrenceDate,
              occurrenceKey: createPriorityOccurrenceKey(priorityId, effectiveOccurrenceDate),
              execution: resolvePriorityExecutionContract({ reminder: current, occurrenceDate: effectiveOccurrenceDate }),
              reminder: current,
            });
          }
          if (effectiveOccurrenceDate && dose && protocolId) {
            await reminders.completeReminderFromEvidence(priorityId, {
                id: `${priorityId}:${effectiveOccurrenceDate}`,
                completedAt,
                evidenceDate: effectiveOccurrenceDate,
                effectiveDose: dose,
                protocolId,
                satisfactionType: "scheduled_protocol_execution",
                canonicalEvidenceId: null,
            });
          } else {
            await reminders.completeReminder(priorityId, completedAt, {
              occurrenceDate: effectiveOccurrenceDate,
            });
          }
          const result = await reminders.getReminderById(priorityId);
          return Object.freeze({
            status: "completed",
            occurrenceDate: effectiveOccurrenceDate,
            occurrenceKey: createPriorityOccurrenceKey(priorityId, effectiveOccurrenceDate),
            execution: resolvePriorityExecutionContract({ reminder: result, occurrenceDate: effectiveOccurrenceDate }),
            reminder: result,
          });
        },
      });
      return Object.freeze({
        ...committed,
        status: committed.result.status,
        occurrenceDate: committed.result.occurrenceDate,
        occurrenceKey: committed.result.occurrenceKey,
        execution: committed.result.execution,
        completion: committed.result.reminder,
      });
    },
  });
}
