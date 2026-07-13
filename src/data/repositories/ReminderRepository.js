import { seedReminders } from "../seed/reminders";
import { byUserId } from "./repositoryUtils";

export function createReminderRepository(reminders = [], options = {}) {
  return {
    async listReminders(userId) {
      return byUserId(reminders, userId);
    },

    async listActiveReminders(userId) {
      return byUserId(reminders, userId).filter((reminder) => reminder.active);
    },

    async getReminderById(reminderId) {
      return reminders.find((reminder) => reminder.id === reminderId) ?? null;
    },

    async saveReminder(reminder) {
      const existingIndex = reminders.findIndex((item) => item.id === reminder.id);

      if (existingIndex >= 0) {
        reminders[existingIndex] = reminder;
      } else {
        reminders.push(reminder);
      }

      options.onChange?.();

      return reminder;
    },

    async completeReminder(reminderId, completedAt = new Date().toISOString()) {
      const reminderIndex = reminders.findIndex((item) => item.id === reminderId);

      if (reminderIndex < 0) return null;

      reminders[reminderIndex] = {
        ...reminders[reminderIndex],
        completedAt,
      };

      options.onChange?.();

      return reminders[reminderIndex];
    },

    async completeReminderFromEvidence(reminderId, completion = {}) {
      const reminderIndex = reminders.findIndex((item) => item.id === reminderId);
      if (reminderIndex < 0) return null;
      const completionId = completion.id ?? `${reminderId}:${String(completion.completedAt ?? "").slice(0, 10)}`;
      const history = reminders[reminderIndex].completionHistory ?? [];
      if (history.some((item) => item.id === completionId)) return history.find((item) => item.id === completionId);
      const record = { ...completion, id: completionId };
      reminders[reminderIndex] = { ...reminders[reminderIndex], completedAt: completion.completedAt, completedByEvidenceId: completion.canonicalEvidenceId, completionHistory: [...history, record] };
      options.onChange?.();
      return record;
    },
  };
}

export const ReminderRepository = createReminderRepository(seedReminders);
