import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createCanonicalPersistenceCommandPorts } from "./CanonicalPersistenceCommandPorts.js";
import { createDailyFocusService } from "../../domain/services/DailyFocusService.js";
import { createDexaPriorityId, DexaPriorityStage } from "../../domain/services/DexaAppointmentLifecycleService.js";
import { resolveMorningWeighInSupport, isMorningWeighInDue } from "../../domain/services/TrackingSupportService.js";

const USER = "founder";
const TODAY = "2026-08-11";
const NOW = new Date("2026-08-11T12:00:00.000Z");

describe("Universal Priority Skip canonical command", () => {
  it("skips anchored every-two-day Fadogia without moving cadence, schedule, dose, or next occurrence", async () => {
    const fadogia = reminder("reminder_fadogia", {
      type: "supplement_reminder",
      linkedEntityId: "protocol_fadogia",
      linkedEvidenceType: "supplement",
      schedule: {
        type: "every_x_days", cadence: "every_x_days", interval: 2, intervalDays: 2,
        anchorDate: TODAY, startDate: TODAY, timeOfDay: "05:45",
      },
    });
    const execution = {
      id: "execution_fadogia", userId: USER, type: "supplement", title: "Fadogia Agrestis",
      active: true, protocolRootId: "protocol_fadogia", cadence: { type: "every_x_days", interval: 2 },
      preferredSchedule: {
        daysOfWeek: [], timeOfDay: "05:45", startDate: TODAY, anchorDate: TODAY,
        intervalDays: 2, endDate: null,
      },
      completionHistory: [], version: 7,
    };
    const records = store({
      reminders: [fadogia],
      protocols: [{ id: "protocol_fadogia", userId: USER, name: "Fadogia Agrestis", category: "supplement", status: "active" }],
      executionItems: [execution],
    });
    const before = records.snapshot();
    const outcome = await skip(records, fadogia.id, 4);
    const after = records.snapshot();

    expect(outcome.result.status).toBe("skipped");
    expect(after.reminders[0].schedule).toEqual(before.reminders[0].schedule);
    expect(after.reminders[0].completionHistory).toEqual([]);
    expect(after.executionItems[0]).toEqual(before.executionItems[0]);
    expect(JSON.stringify(after.dailyCheckIns)).not.toMatch(/dose|effectiveDose|amountTaken/i);
    const future = createDailyFocusService().getNotificationOccurrences({
      checkIns: after.dailyCheckIns,
      executionItems: after.executionItems,
      horizonDays: 4,
      now: NOW,
      protocols: after.protocols,
      reminders: after.reminders,
      timeZone: "America/Los_Angeles",
    });
    expect(future.some((item) =>
      item.executionContract?.priorityId === fadogia.id && item.occurrenceDate === "2026-08-13"
    )).toBe(true);
  });

  it.each([
    ["Morning Weight", morningWeightFixture, "reminder_morning_weight"],
    ["Progress Photos", progressPhotoFixture, "reminder_progress_photos"],
  ])("skips scheduled evidence-backed %s without creating evidence", async (_label, fixture, priorityId) => {
    const records = fixture();
    if (priorityId === "reminder_morning_weight") {
      const snapshot = records.snapshot();
      const support = resolveMorningWeighInSupport(snapshot);
      expect(support).not.toBeNull();
      expect(isMorningWeighInDue(support.supportSchedule, TODAY)).toBe(true);
    }
    const outcome = await skip(records, priorityId, 3);
    const snapshot = records.snapshot();
    expect(outcome.result).toMatchObject({ status: "skipped", priorityId });
    expect(snapshot.weightEntries).toEqual([]);
    expect(snapshot.progressPhotos).toEqual([]);
    expect(snapshot.dexaScans).toEqual([]);
    expect(snapshot.canonicalEvidenceObjects).toEqual([]);
  });

  it("rejects DEXA appointment Skip as an informational reminder without touching its record", async () => {
    const appointment = {
      id: "execution_next_dexa", userId: USER, type: "dexa_appointment", active: true,
      status: "scheduled", preferredSchedule: { date: "2026-08-12", timeOfDay: "07:30", daysOfWeek: [] },
      timezone: "America/Los_Angeles", reminderPreferences: ["day_before"], uploadReminder: true,
      linkedGoalIds: ["goal"], executionRevision: 8, version: 5,
    };
    const records = store({ executionItems: [appointment] });
    const priorityId = createDexaPriorityId("2026-08-12", DexaPriorityStage.DAY_BEFORE);
    await expect(skip(records, priorityId, 5)).rejects.toMatchObject({
      status: 422,
      code: "PRIORITY_SKIP_UNSUPPORTED",
      recovery: { workflow: "dexa_appointment" },
    });
    const stored = records.snapshot().executionItems[0];
    expect(stored).toEqual(appointment);
    expect(records.snapshot().dailyCheckIns).toEqual([]);
    expect(records.snapshot().dexaScans).toEqual([]);
  });

  it("rejects DEXA Skip even when matching scan evidence already satisfies the appointment", async () => {
    const appointment = {
      id: "execution_next_dexa", userId: USER, type: "dexa_appointment", active: true,
      status: "scheduled", preferredSchedule: { date: "2026-08-12", timeOfDay: "07:30", daysOfWeek: [] },
      timezone: "America/Los_Angeles", reminderPreferences: ["day_before"], uploadReminder: true,
      linkedGoalIds: [], executionRevision: 1, version: 5,
    };
    const records = store({
      executionItems: [appointment],
      dexaScans: [{ id: "dexa", userId: USER, measuredAt: "2026-08-12T15:00:00.000Z", version: 1 }],
    });
    const priorityId = createDexaPriorityId("2026-08-12", DexaPriorityStage.DAY_BEFORE);
    await expect(skip(records, priorityId, 5)).rejects.toMatchObject({
      status: 422, code: "PRIORITY_SKIP_UNSUPPORTED",
    });
    expect(records.snapshot().dailyCheckIns).toEqual([]);
    expect(records.snapshot().executionItems[0].version).toBe(5);
  });

  it("rejects inactive and not-scheduled Reminder sources as non-occurrences", async () => {
    const inactive = store({ reminders: [reminder("inactive", { active: false })] });
    await expect(skip(inactive, "inactive", 4)).rejects.toMatchObject({
      status: 422, code: "PRIORITY_SKIP_UNSUPPORTED",
    });
    const weekly = store({ reminders: [reminder("weekly", {
      schedule: { type: "weekly", daysOfWeek: ["wednesday"], timeOfDay: "morning" },
    })] });
    await expect(skip(weekly, "weekly", 4)).rejects.toMatchObject({
      status: 422, code: "PRIORITY_SKIP_UNSUPPORTED",
    });
  });
});

function morningWeightFixture() {
  return store({
    protocols: [{ id: "protocol_weight", userId: USER, category: "weight", protocolType: "weight", status: "active" }],
    executionItems: [{
      id: "execution_morning_weigh_in", userId: USER, type: "evidence", active: true,
      linkedProtocolId: "protocol_weight", cadence: { type: "daily" },
      preferredSchedule: { timeOfDay: "05:30", startDate: "2026-07-23", daysOfWeek: [] },
      version: 2,
    }],
    reminders: [reminder("reminder_morning_weight", {
      type: "evidence_reminder", linkedEntityId: "protocol_weight", linkedEvidenceType: "weight",
      schedule: { type: "daily", timeOfDay: "05:30", startDate: "2026-07-23" },
      version: 3,
    })],
  });
}

function progressPhotoFixture() {
  return store({ reminders: [reminder("reminder_progress_photos", {
    type: "progress_photo", linkedEvidenceType: "progress_photo",
    schedule: { type: "daily", timeOfDay: "afternoon" }, version: 3,
  })] });
}

function reminder(id, overrides = {}) {
  return {
    id, userId: USER, title: id, type: "other", active: true,
    schedule: { type: "daily", timeOfDay: "morning" }, completionHistory: [], version: 4,
    ...overrides,
  };
}

function store(overrides = {}) {
  return createInMemoryCanonicalRecordStore({
    user: [{ id: USER, timeZone: "America/Los_Angeles", version: 1 }],
    reminders: [], protocols: [], executionItems: [], dailyCheckIns: [], weightEntries: [],
    progressPhotos: [], dexaScans: [], canonicalEvidenceObjects: [], evidencePackages: [],
    ...overrides,
  });
}

function skip(records, priorityId, expectedVersion) {
  return createCanonicalPersistenceCommandPorts({ records, now: () => NOW }).skipPriority({
    ownerUserId: USER,
    principal: { userId: USER, deviceId: "test-device" },
    metadata: { commandId: `skip-${priorityId}`, expectedVersion: String(expectedVersion) },
    payload: { priorityId, occurrenceDate: TODAY },
  });
}
