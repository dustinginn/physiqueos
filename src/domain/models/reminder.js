import { createFieldProvenance, createSource } from "./recordMetadata";

export const ReminderType = {
  EVIDENCE_REMINDER: "evidence_reminder",
  PROTOCOL_REMINDER: "protocol_reminder",
  PROTOCOL: "protocol",
  PROGRESS_PHOTO: "progress_photo",
  DEXA: "dexa",
  MORNING_WEIGH_IN: "morning_weigh_in",
  OTHER: "other",
};

export const ReminderPersistenceMode = {
  ALWAYS_VISIBLE: "always_visible",
  ADAPTIVE: "adaptive",
  TEMPORARY: "temporary",
  SCHEDULED: "scheduled",
  TRIGGERED: "triggered",
};

export function createReminder(data = {}) {
  return {
    id: "",
    userId: "",
    title: "",
    type: ReminderType.OTHER,
    linkedEntityType: null,
    linkedEntityId: null,
    linkedEvidenceType: null,
    relatedGoalIds: [],
    schedule: {
      type: "",
      interval: null,
      unit: "",
      daysOfWeek: [],
      cadence: null,
      preferredDay: null,
      dayOfWeek: null,
      timeOfDay: null,
      timingContext: null,
      timezone: null,
    },
    defaultContext: null,
    expectedViews: [],
    persistenceMode: ReminderPersistenceMode.SCHEDULED,
    adaptiveAssistance: {
      eligible: false,
      eligibleAfterCompletions: null,
      completedWindowDays: null,
      recommendation: null,
      userDecision: null,
      lastRecommendedAt: null,
    },
    active: true,
    nextDueAt: null,
    completedAt: null,
    notes: "",
    source: createSource({ type: "manual" }),
    fieldProvenance: createFieldProvenance(),
    createdAt: "",
    updatedAt: "",
    ...data,
  };
}
