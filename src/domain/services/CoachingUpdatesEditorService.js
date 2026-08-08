import { WEEKDAYS } from "./CoachingUpdatesReadService.js";

export function createCoachingUpdatesEditorModel({ readModel, policy, photos = null, dexa = null }) {
  if (!readModel || !policy) return null;
  return Object.freeze({
    strategyType: "briefings",
    protocolId: readModel.protocolId,
    title: "Edit Coaching Updates",
    timeZone: readModel.timeZone,
    midweek: structuredClone(readModel.midweek),
    weekly: structuredClone(readModel.weekly),
    monthly: structuredClone(readModel.monthly),
    daily: structuredClone(readModel.daily),
    notificationPreference: readModel.notificationPreference,
    eventBriefings: structuredClone(readModel.eventBriefings),
    photos: photos ? structuredClone(photos) : null,
    dexa: dexa ? structuredClone(dexa) : null,
    policy: structuredClone(policy),
    options: { weekdays: [...WEEKDAYS] },
  });
}

export function buildCoachingUpdatesRequest(form, model) {
  const midweek = surface(form, "midweek");
  const weekly = surface(form, "weekly");
  return {
    timeZone: model.timeZone,
    midweek,
    weekly,
    monthly: {
      enabled: form.has("monthlyEnabled"),
      dayOfMonth: 1,
      localTime: String(form.get("monthlyTime") ?? ""),
    },
    daily: { enabled: false },
    eventBriefings: {
      photo: form.has("photoEventBriefingEnabled"),
      dexa: form.has("dexaEventBriefingEnabled"),
    },
    notificationPreference: String(form.get("notificationPreference") ?? ""),
    photos: {
      cadence: String(form.get("photoCadence") ?? ""),
      day: String(form.get("photoDay") ?? ""),
      timeOfDay: String(form.get("photoTimeOfDay") ?? ""),
      reminderEnabled: form.has("photoReminderEnabled"),
    },
    dexa: {
      plannedDate: String(form.get("dexaPlannedDate") ?? ""),
      localTime: String(form.get("dexaLocalTime") ?? ""),
      reminderPreferences: form.getAll("dexaReminderPreferences").map(String),
      uploadReminder: form.has("dexaUploadReminder"),
      preparationNote: String(form.get("dexaPreparationNote") ?? ""),
    },
  };
}

function surface(form, prefix) {
  return {
    enabled: form.has(`${prefix}Enabled`),
    day: String(form.get(`${prefix}Day`) ?? ""),
    localTime: String(form.get(`${prefix}Time`) ?? ""),
  };
}
