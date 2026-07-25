import { WEEKDAYS } from "./CoachingUpdatesReadService.js";

export function createCoachingUpdatesEditorModel({ readModel, policy }) {
  if (!readModel || !policy) return null;
  return Object.freeze({
    strategyType: "briefings",
    protocolId: readModel.protocolId,
    title: "Edit Coaching Updates",
    timeZone: readModel.timeZone,
    midweek: structuredClone(readModel.midweek),
    weekly: structuredClone(readModel.weekly),
    daily: structuredClone(readModel.daily),
    notificationPreference: readModel.notificationPreference,
    eventBriefings: structuredClone(readModel.eventBriefings),
    policy: structuredClone(policy),
    options: { weekdays: [...WEEKDAYS] },
  });
}

export function buildCoachingUpdatesRequest(form, model) {
  const midweek = surface(form, "midweek");
  const weekly = surface(form, "weekly");
  const dailyRequested = form.has("dailyEnabled");
  return {
    timeZone: model.timeZone,
    midweek,
    weekly,
    daily: {
      enabled: model.policy.dailyUserActivationPermitted ? dailyRequested : false,
    },
    notificationPreference: String(form.get("notificationPreference") ?? ""),
  };
}

function surface(form, prefix) {
  return {
    enabled: form.has(`${prefix}Enabled`),
    day: String(form.get(`${prefix}Day`) ?? ""),
    localTime: String(form.get(`${prefix}Time`) ?? ""),
  };
}
