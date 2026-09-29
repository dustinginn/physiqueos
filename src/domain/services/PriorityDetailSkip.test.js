import { describe, expect, it, vi } from "vitest";
import { createPriorityDetailService } from "./PriorityDetailService";
import { createPriorityReconciliationEntry } from "./PriorityOccurrenceReconciliation.js";
import { createPriorityNavigationReadService } from "../../application/priorities/PriorityNavigationReadService.js";
import { createPostgresPriorityNavigationReadStore } from "../../platform/database/PostgresPriorityNavigationReadStore.js";

// 12:00 on 2026-09-16 in America/Los_Angeles.
const NOW = () => new Date("2026-09-16T19:00:00.000Z");
const TODAY = "2026-09-16";
const USER = { id: "user", timeZone: "America/Los_Angeles" };

function plainReminder(overrides = {}) {
  return {
    id: "reminder_stretch",
    userId: "user",
    title: "Stretch",
    type: "other",
    active: true,
    persistenceMode: "always_visible",
    schedule: { type: "daily", timeOfDay: "18:00" },
    completionHistory: [],
    version: 4,
    ...overrides,
  };
}

function skippedCheckIn(priorityId = "reminder_stretch", date = TODAY, note = "rest day") {
  return {
    id: `daily_check_in_${date.replaceAll("-", "_")}`,
    userId: "user",
    date,
    reconciliation: [createPriorityReconciliationEntry({
      priorityId, occurrenceDate: date, disposition: "skipped", note, recordedAt: `${date}T18:00:00.000Z`,
    })],
  };
}

function detailService({ reminder, checkIn = null, protocols = [] }) {
  const getCheckInForDate = vi.fn(async (_userId, date) => (checkIn?.date === date ? checkIn : null));
  const service = createPriorityDetailService({
    now: NOW,
    repositories: {
      users: { getUserById: async () => USER, getCurrentUser: async () => USER },
      goals: { listGoals: async () => [] },
      reminders: { getReminderById: async (id) => (reminder?.id === id ? reminder : null) },
      protocols: { listProtocols: async () => protocols },
      executionItems: { listExecutionItems: async () => [] },
      weightEntries: { listWeightEntries: async () => [] },
      dailyCheckIns: { getCheckInForDate },
    },
  });
  return { service, getCheckInForDate };
}

describe("Priority Detail skip contract", () => {
  it("offers the Server-owned skip command for today's open ordinary priority", async () => {
    const { service, getCheckInForDate } = detailService({ reminder: plainReminder() });
    const detail = await service.getPriorityDetail("reminder_stretch", "user");
    expect(getCheckInForDate).toHaveBeenCalledWith("user", TODAY);
    expect(detail).toMatchObject({
      status: "Open",
      completable: true,
      skippable: true,
      skipContext: null,
      skipCommand: {
        commandType: "priority.skip.v1",
        expectedVersion: 4,
        payload: { priorityId: "reminder_stretch", occurrenceDate: TODAY },
      },
      notificationAction: { classification: "direct_completion_allowed" },
    });
  });

  it("reads a skipped occurrence as Skipped and non-completable", async () => {
    const { service } = detailService({ reminder: plainReminder(), checkIn: skippedCheckIn() });
    const detail = await service.getPriorityDetail("reminder_stretch", "user");
    expect(detail).toMatchObject({
      status: "Skipped",
      completable: false,
      completionContext: null,
      skippable: false,
      skipCommand: null,
      skipContext: { occurrenceDate: TODAY, note: "rest day", skippedAt: `${TODAY}T18:00:00.000Z` },
      notificationAction: { classification: "open_only", completionCommand: null },
    });
  });

  it("keeps Completed when an occurrence is both completed and skipped", async () => {
    const reminder = plainReminder({ completionHistory: [{ occurrenceDate: TODAY, completedAt: `${TODAY}T17:00:00.000Z` }] });
    const { service } = detailService({ reminder, checkIn: skippedCheckIn() });
    const detail = await service.getPriorityDetail("reminder_stretch", "user");
    expect(detail).toMatchObject({ status: "Completed", completable: false, skippable: false, skipContext: null });
  });

  it("is not skippable for a past occurrence (Morning Check-In owns it)", async () => {
    const { service } = detailService({ reminder: plainReminder() });
    const detail = await service.getPriorityDetail("reminder_stretch", "user", { occurrenceDate: "2026-09-15" });
    expect(detail).toMatchObject({ status: "Open", completable: true, skippable: false, skipCommand: null });
  });

  it("is not skippable for specialized or dose-aware workflows", async () => {
    const cases = [
      plainReminder({ id: "reminder_weight_alt", linkedEvidenceType: "weight" }),
      plainReminder({ id: "reminder_dexa_upload", linkedEvidenceType: "dexa" }),
      plainReminder({ id: "reminder_progress_photos", linkedEvidenceType: "progress_photo" }),
      plainReminder({ id: "reminder_peptide", type: "protocol_reminder", linkedEntityId: "protocol-peptide" }),
      plainReminder({ id: "reminder_creatine", type: "supplement_reminder", linkedEntityId: "protocol-supplement" }),
    ];
    const protocols = [
      { id: "protocol-peptide", userId: "user", category: "peptide", status: "active", title: "Peptide" },
      { id: "protocol-supplement", userId: "user", category: "supplement", status: "active", title: "Creatine" },
    ];
    for (const reminder of cases) {
      const { service } = detailService({ reminder, protocols });
      const detail = await service.getPriorityDetail(reminder.id, "user");
      expect(detail, reminder.id).toMatchObject({ skippable: false, skipCommand: null, skipContext: null });
    }
  });

  it("carries the check-in through the Native navigation read store", async () => {
    const loadCheckInForDate = vi.fn(async ({ date }) => (date === TODAY ? skippedCheckIn() : null));
    const navigation = createPriorityNavigationReadService({
      store: {
        load: async () => ({
          user: USER, goals: [], reminder: plainReminder(), protocols: [], operatingPlan: null,
          operatingRhythm: null, executionItems: [], weightEntries: [],
        }),
        loadCheckInForDate,
      },
    });
    const detail = await navigation.getPriorityDetail("reminder_stretch", { occurrenceDate: TODAY });
    expect(loadCheckInForDate).toHaveBeenCalledWith({ date: TODAY });
    expect(detail).toMatchObject({ status: "Skipped", skippable: false });
  });

  it("reads exactly the occurrence day's check-in identity from PostgreSQL", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = createPostgresPriorityNavigationReadStore({ pool: { query }, ownerUserId: "owner" });
    await expect(store.loadCheckInForDate({ date: TODAY })).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(["owner", "dailyCheckIns", "daily_check_in_2026_09_16"]);
    await expect(store.loadCheckInForDate({ date: "not-a-date" })).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
