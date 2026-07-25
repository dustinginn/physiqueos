import { describe, expect, it } from "vitest";
import {
  buildCoachingUpdatesRequest,
  createCoachingUpdatesEditorModel,
} from "./CoachingUpdatesEditorService";
import { mapLegacyCoachingUpdates } from "./CoachingUpdatesReadService";
import { resolveCoachingUpdatesGoalCadencePolicy } from "./CoachingUpdatesGoalCadencePolicyService";

describe("Coaching Updates editor model", () => {
  it("loads repaired production values through the canonical legacy mapping", () => {
    const configuration = mapLegacyCoachingUpdates({
      protocol: { effectiveStrategy: legacy() },
      version: { change: { reviewedChanges: legacy() } },
      timeZone: "America/Los_Angeles",
    });
    const model = createCoachingUpdatesEditorModel({
      readModel: {
        protocolId: "coaching",
        ...configuration,
        eventBriefings: { photo: true, dexa: true },
      },
      policy: resolveCoachingUpdatesGoalCadencePolicy({ type: "build_lean_mass" }),
    });
    expect(model).toMatchObject({
      midweek: { enabled: true, day: "wednesday", localTime: "00:00" },
      weekly: { enabled: true, day: "sunday", localTime: "00:00" },
      daily: { enabled: false },
      notificationPreference: "available_without_notification",
      eventBriefings: { photo: true, dexa: true },
      policy: {
        dailyUserActivationPermitted: false,
        noRoutineSurfacePermitted: false,
      },
    });
  });

  it("builds canonical day, time, and notification values without enabling prohibited Daily", () => {
    const model = createCoachingUpdatesEditorModel({
      readModel: {
        protocolId: "coaching",
        timeZone: "America/Los_Angeles",
        midweek: { enabled: true, day: "wednesday", localTime: "08:00" },
        weekly: { enabled: true, day: "sunday", localTime: "09:00" },
        daily: { enabled: false },
        notificationPreference: "available_without_notification",
        eventBriefings: { photo: true, dexa: true },
      },
      policy: resolveCoachingUpdatesGoalCadencePolicy({ type: "build_lean_mass" }),
    });
    const form = new FormData();
    form.set("midweekEnabled", "on");
    form.set("midweekDay", "tuesday");
    form.set("midweekTime", "08:30");
    form.set("weeklyEnabled", "on");
    form.set("weeklyDay", "saturday");
    form.set("weeklyTime", "09:15");
    form.set("dailyEnabled", "on");
    form.set("notificationPreference", "notify_when_ready");
    expect(buildCoachingUpdatesRequest(form, model)).toEqual({
      timeZone: "America/Los_Angeles",
      midweek: { enabled: true, day: "tuesday", localTime: "08:30" },
      weekly: { enabled: true, day: "saturday", localTime: "09:15" },
      daily: { enabled: false },
      notificationPreference: "notify_when_ready",
    });
  });
});

function legacy() {
  return {
    cadence: "Twice weekly",
    days: ["Wednesday", "Sunday"],
    dailyEvidenceCollection: true,
  };
}
