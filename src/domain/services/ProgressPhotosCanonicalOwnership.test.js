import { describe, expect, it } from "vitest";
import { createFounderRuntimeStore } from "../../data/repositories/founderRuntimeStore";
import { createDailyFocusService } from "./DailyFocusService";
import { createPriorityDetailService } from "./PriorityDetailService";
import {
  applyPreparedProgressPhotosReminderEnablement,
  createProgressPhotosExecutionHydrationModel,
  prepareProgressPhotosReminderEnablement,
  verifyPreparedProgressPhotosReminderEnablement,
} from "./ProgressPhotosExecutionScheduleService";

const reminderId = "reminder_weekly_progress_photo_set";
const recurrence = {
  recurrenceVersion: "protocol_recurrence_v1",
  frequency: "weekly",
  interval: 2,
  weekdays: ["tuesday"],
  daysOfWeek: ["tuesday"],
  preferredDay: "tuesday",
  dayOfWeek: "tuesday",
  timeOfDay: "evening",
  timezone: "America/Los_Angeles",
  anchorDate: "2026-07-28",
};

describe("Progress Photos canonical ownership", () => {
  it("preserves valid persisted schedule and reminder state through runtime hydration", () => {
    const completionHistory = [{ evidenceDate: "2026-07-28", id: "completed-photo" }];
    const store = createFounderRuntimeStore({
      operatingPlan: {
        evidenceProtocols: {
          progressPhotos: [{
            id: "weekly-photo-plan",
            title: "Weekly Progress Photo Set",
            dayOfWeek: "tuesday",
            timeOfDay: "evening",
          }],
        },
      },
      reminders: [{
        id: reminderId,
        active: false,
        schedule: recurrence,
        completionHistory,
      }],
    });
    const reminder = store.reminders.find((item) => item.id === reminderId);

    expect(reminder).toMatchObject({
      active: false,
      schedule: {
        interval: 2,
        daysOfWeek: ["tuesday"],
        preferredDay: "tuesday",
        dayOfWeek: "tuesday",
        timeOfDay: "evening",
        timezone: "America/Los_Angeles",
        anchorDate: "2026-07-28",
      },
      completionHistory,
    });
    expect(store.operatingPlan.evidenceProtocols.progressPhotos[0]).toMatchObject({
      dayOfWeek: "tuesday",
      timeOfDay: "evening",
    });
  });

  it("repairs only malformed schedule fields with legacy defaults", () => {
    const store = createFounderRuntimeStore({
      reminders: [{
        id: reminderId,
        active: true,
        schedule: { daysOfWeek: ["not-a-day"], timeOfDay: "not-a-time" },
      }],
    });
    const reminder = store.reminders.find((item) => item.id === reminderId);
    expect(reminder.schedule).toMatchObject({
      daysOfWeek: ["saturday"],
      preferredDay: "saturday",
      dayOfWeek: "saturday",
      timeOfDay: "afternoon",
    });
  });

  it("toggles only canonical reminder eligibility and preserves history and recurrence", () => {
    const store = compactStore();
    const beforeSchedule = structuredClone(store.reminders[0].schedule);
    const beforeHistory = structuredClone(store.reminders[0].completionHistory);
    const disabled = prepareProgressPhotosReminderEnablement(store, { enabled: false });

    expect(disabled).toMatchObject({ ok: true, changed: true, enabled: false });
    applyPreparedProgressPhotosReminderEnablement(store, disabled);
    expect(verifyPreparedProgressPhotosReminderEnablement(store, disabled)).toBe(true);
    expect(store.reminders[0]).toMatchObject({ active: false });
    expect(store.reminders[0].schedule).toEqual(beforeSchedule);
    expect(store.reminders[0].completionHistory).toEqual(beforeHistory);
    expect(createProgressPhotosExecutionHydrationModel(store).item).toMatchObject({
      reminderEnabled: false,
      recurrence: {
        interval: 2,
        weekdays: ["tuesday"],
        timeOfDay: "evening",
        timezone: "America/Los_Angeles",
        anchorDate: "2026-07-28",
      },
    });

    const enabled = prepareProgressPhotosReminderEnablement(store, { enabled: true });
    applyPreparedProgressPhotosReminderEnablement(store, enabled);
    expect(store.reminders[0].completionHistory).toEqual(beforeHistory);
    expect(store.reminders[0].schedule).toEqual(beforeSchedule);
  });

  it("projects Home only for an active due occurrence", () => {
    const active = compactStore().reminders[0];
    const due = new Date("2026-08-11T23:00:00.000Z");
    const offCycle = new Date("2026-08-04T23:00:00.000Z");
    const service = createDailyFocusService();
    const containsPhoto = (focus) => focus.some((item) =>
      item.id === active.id || item.sessionItems?.some((entry) => entry.id === active.id));

    expect(containsPhoto(service.getDailyFocus({ reminders: [active], now: due }))).toBe(true);
    expect(containsPhoto(service.getDailyFocus({
      reminders: [{ ...active, active: false }], now: due,
    }))).toBe(false);
    expect(containsPhoto(service.getDailyFocus({ reminders: [active], now: offCycle }))).toBe(false);
  });

  it("uses the configured daypart and saved execution notes in Priority Detail", async () => {
    const store = compactStore();
    const service = createPriorityDetailService({
      repositories: {
        users: { getUserById: async () => ({ id: "user", timeZone: "America/Los_Angeles" }) },
        goals: { listGoals: async () => [] },
        reminders: { getReminderById: async () => store.reminders[0] },
        protocols: { listProtocols: async () => [] },
        operatingPlan: { getOperatingPlan: async () => null },
        operatingRhythm: { getOperatingRhythm: async () => null },
        executionItems: { listExecutionItems: async () => store.executionItems },
      },
    });
    const detail = await service.getPriorityDetail(reminderId, "user");
    const serialized = JSON.stringify(detail);

    expect(detail.subtitle).toBe("Scheduled for this evening.");
    expect(detail.sections.find((section) => section.title === "Execution Notes")?.items[0].detail)
      .toBe("Use the saved universal photo note.");
    expect(serialized).not.toMatch(/morning evidence|morning, fasted/i);
  });
});

function compactStore() {
  return {
    protocols: [{
      id: "photos",
      protocolType: "photos",
      status: "active",
      currentVersionId: "photos-v2",
      activatedAt: "2026-07-28",
    }],
    protocolVersions: [{
      id: "photos-v2",
      protocolId: "photos",
      status: "active",
      effectiveAt: "2026-07-28",
      recurrence,
    }],
    executionItems: [{
      id: "execution_progress_photos",
      cadence: { type: "weekly", interval: 2 },
      preferredSchedule: recurrence,
      notes: "Use the saved universal photo note.",
      completionHistory: [{ evidenceDate: "2026-07-28" }],
    }],
    reminders: [{
      id: reminderId,
      title: "Progress Photos",
      active: true,
      linkedEvidenceType: "progress_photo",
      linkedEntityType: "progress_photo_set",
      expectedViews: ["front-relaxed", "back-relaxed", "back-flexed"],
      schedule: recurrence,
      completionHistory: [{ evidenceDate: "2026-07-28", id: "history" }],
    }],
  };
}
