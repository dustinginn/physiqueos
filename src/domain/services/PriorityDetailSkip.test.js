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

function detailService({ reminder, checkIn = null, protocols = [], executionItems = [] }) {
  const getCheckInForDate = vi.fn(async (_userId, date) => (checkIn?.date === date ? checkIn : null));
  const service = createPriorityDetailService({
    now: NOW,
    repositories: {
      users: { getUserById: async () => USER, getCurrentUser: async () => USER },
      goals: { listGoals: async () => [] },
      reminders: { getReminderById: async (id) => (reminder?.id === id ? reminder : null) },
      protocols: { listProtocols: async () => protocols },
      executionItems: { listExecutionItems: async () => executionItems },
      weightEntries: { listWeightEntries: async () => [] },
      dailyCheckIns: { getCheckInForDate },
    },
  });
  return { service, getCheckInForDate };
}

// Verified production shape for Foam Rolling: a `recovery_reminder` whose
// linked protocol is category `recovery`, backed by a manual-completion
// `recovery` Execution item. Synthetic version numbers only.
const RECOVERY_PROTOCOL = {
  id: "protocol-recovery", userId: "user", category: "recovery", status: "active", name: "Foam Rolling",
};
const RECOVERY_EXECUTION = {
  id: "execution_foam_roll", userId: "user", type: "recovery", title: "Foam Rolling", active: true,
  linkedProtocolId: "protocol-recovery", cadence: { type: "daily" },
  preferredSchedule: { daysOfWeek: [], timeOfDay: "17:00", startDate: "2026-07-23" },
  completionMethod: "manual", executionRevision: 1, notes: "", version: 1,
};

function recoveryReminder(overrides = {}) {
  return {
    id: "reminder_foam_roll_daily",
    userId: "user",
    title: "Foam Roll",
    type: "recovery_reminder",
    linkedEntityType: "protocol",
    linkedEntityId: "protocol-recovery",
    active: true,
    schedule: { type: "daily", timeOfDay: "17:00" },
    completionHistory: [],
    version: 53,
    ...overrides,
  };
}

function recoveryDetailService({ reminder = recoveryReminder(), checkIn = null, executionItems = [RECOVERY_EXECUTION] } = {}) {
  return detailService({ reminder, checkIn, protocols: [RECOVERY_PROTOCOL], executionItems });
}

const section = (detail, title) => detail.sections.find((item) => item.title === title);

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

  describe("execution-backed recovery Support (Foam Rolling)", () => {
    it("offers the Server-owned skip command for today's open recovery occurrence", async () => {
      const { service, getCheckInForDate } = recoveryDetailService();
      const detail = await service.getPriorityDetail("reminder_foam_roll_daily", "user");
      expect(getCheckInForDate).toHaveBeenCalledWith("user", TODAY);
      expect(detail).toMatchObject({
        id: "reminder_foam_roll_daily",
        status: "Open",
        completable: true,
        completionContext: { occurrenceDate: TODAY, dose: null, protocolId: "protocol-recovery" },
        skippable: true,
        skipContext: null,
        skipCommand: {
          commandType: "priority.skip.v1",
          expectedVersion: 53,
          payload: { priorityId: "reminder_foam_roll_daily", occurrenceDate: TODAY },
        },
        executionContract: { workflow: "priority_detail", occurrenceKey: `reminder_foam_roll_daily:${TODAY}` },
        notificationAction: {
          workflow: "priority_detail",
          completionCommand: { commandType: "priority.complete.v1", expectedVersion: 53 },
          scheduledTime: "17:00",
        },
      });
      expect(section(detail, "Completion")).toBeDefined();
    });

    it("reads a skipped recovery occurrence as Skipped, non-completable, with no Completion section", async () => {
      const { service } = recoveryDetailService({ checkIn: skippedCheckIn("reminder_foam_roll_daily", TODAY, "sore") });
      const detail = await service.getPriorityDetail("reminder_foam_roll_daily", "user");
      expect(detail).toMatchObject({
        status: "Skipped",
        completable: false,
        completionContext: null,
        skippable: false,
        skipCommand: null,
        skipContext: { occurrenceDate: TODAY, note: "sore", skippedAt: `${TODAY}T18:00:00.000Z` },
        notificationAction: { workflow: "priority_detail", completionCommand: null },
      });
      expect(section(detail, "Completion")).toBeUndefined();
      expect(section(detail, "What").items[0].label).toBe("Foam Rolling");
    });

    it("keeps Completed when a recovery occurrence is both completed and skipped", async () => {
      const reminder = recoveryReminder({
        completionHistory: [{ occurrenceDate: TODAY, completedAt: `${TODAY}T17:30:00.000Z` }],
      });
      const { service } = recoveryDetailService({ reminder, checkIn: skippedCheckIn("reminder_foam_roll_daily") });
      const detail = await service.getPriorityDetail("reminder_foam_roll_daily", "user");
      expect(detail).toMatchObject({
        status: "Completed", completable: false, completionContext: null,
        skippable: false, skipCommand: null, skipContext: null,
      });
      expect(section(detail, "Completion")).toBeUndefined();
    });

    it("is not skippable for a past recovery occurrence (Morning Check-In owns it)", async () => {
      const { service, getCheckInForDate } = recoveryDetailService();
      const detail = await service.getPriorityDetail("reminder_foam_roll_daily", "user", { occurrenceDate: "2026-09-15" });
      expect(getCheckInForDate).toHaveBeenCalledWith("user", "2026-09-15");
      expect(detail).toMatchObject({
        status: "Open", completable: true, skippable: false, skipCommand: null, skipContext: null,
        executionContract: { occurrenceDate: "2026-09-15" },
      });
    });

    it("is not skippable when the recovery Support needs setup (missing Execution)", async () => {
      const { service } = recoveryDetailService({ executionItems: [] });
      const detail = await service.getPriorityDetail("reminder_foam_roll_daily", "user");
      expect(detail).toMatchObject({
        status: "Setup required", completable: false, completionContext: null,
        skippable: false, skipCommand: null, skipContext: null,
        action: { label: "Review Support" },
      });
    });

    it("does not 500 when a Support reminder's linked protocol cannot be resolved", async () => {
      const { service } = detailService({
        reminder: recoveryReminder({ linkedEntityId: "protocol-gone" }),
        protocols: [], executionItems: [RECOVERY_EXECUTION],
      });
      await expect(service.getPriorityDetail("reminder_foam_roll_daily", "user")).resolves.toBeNull();
    });
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

// Peptides: skip is independent of the dose-aware completion. 2026-09-16 is a
// Wednesday. Synthetic ids and versions only.
describe("execution-backed peptide Support skip contract", () => {
  const PEPTIDE_PROTOCOL = { id: "protocol-peptide", userId: "user", category: "peptide", status: "active", name: "Peptide" };
  const PEPTIDE_EXECUTION = {
    id: "execution_peptide", userId: "user", type: "peptide", title: "Peptide", active: true,
    protocolRootId: "protocol-peptide", cadence: { type: "specific_days" },
    preferredSchedule: { daysOfWeek: ["wednesday"], timeOfDay: "21:00", startDate: "2026-05-01", endDate: null },
    timeline: [{ startDate: "2026-07-01", endDate: null, dose: { amount: "0.5", unit: "mg" }, notes: "" }],
  };
  function peptideReminder(overrides = {}) {
    return {
      id: "reminder_peptide_weekly", userId: "user", title: "Peptide", type: "protocol_reminder",
      linkedEntityType: "protocol", linkedEntityId: "protocol-peptide", active: true,
      schedule: { type: "weekly", daysOfWeek: ["wednesday"], timeOfDay: "21:00" }, completionHistory: [], version: 12,
      ...overrides,
    };
  }
  const peptideService = ({ reminder = peptideReminder(), checkIn = null, executionItems = [PEPTIDE_EXECUTION] } = {}) =>
    detailService({ reminder, checkIn, protocols: [PEPTIDE_PROTOCOL], executionItems });

  it("offers Skip for today's open peptide while completion stays dose-aware", async () => {
    const { service } = peptideService();
    const detail = await service.getPriorityDetail("reminder_peptide_weekly", "user");
    expect(detail).toMatchObject({
      status: "Open",
      completable: true,
      completionContext: { occurrenceDate: TODAY, dose: "0.5 mg", protocolId: "protocol-peptide" },
      doseAdjustable: true,
      skippable: true,
      skipCommand: {
        commandType: "priority.skip.v1", expectedVersion: 12,
        payload: { priorityId: "reminder_peptide_weekly", occurrenceDate: TODAY },
      },
      notificationAction: {
        classification: "specialized_workflow_required",
        workflow: "peptide_protocol",
        completionCommand: { payload: { dose: "0.5 mg", protocolId: "protocol-peptide" } },
        skipCommand: { commandType: "priority.skip.v1", expectedVersion: 12 },
      },
    });
    expect(detail.skipCommand.payload).not.toHaveProperty("dose");
  });

  it("reads a skipped peptide as Skipped with no dose, completion or amount field", async () => {
    const { service } = peptideService({ checkIn: skippedCheckIn("reminder_peptide_weekly", TODAY, null) });
    const detail = await service.getPriorityDetail("reminder_peptide_weekly", "user");
    expect(detail).toMatchObject({
      status: "Skipped",
      completable: false,
      completionContext: null,
      skippable: false,
      skipCommand: null,
      skipContext: { occurrenceDate: TODAY, note: null, skippedAt: `${TODAY}T18:00:00.000Z` },
      notificationAction: { completionCommand: null, skipCommand: null },
    });
    expect(detail.doseAdjustable).toBeUndefined();
    expect(section(detail, "Completion")).toBeUndefined();
    expect(section(detail, "What").items[0].detail).toContain("No dose was recorded");
  });

  it("is not skippable when paused, past, or completed", async () => {
    const paused = peptideService({ executionItems: [{ ...PEPTIDE_EXECUTION, scheduleSuspensions: [{ pausedFrom: "2026-09-10", resumedOn: null }] }] });
    expect(await paused.service.getPriorityDetail("reminder_peptide_weekly", "user")).toMatchObject({
      status: "Paused", skippable: false, skipCommand: null,
      notificationAction: { classification: "open_only", completionCommand: null, skipCommand: null },
    });
    const past = peptideService();
    expect(await past.service.getPriorityDetail("reminder_peptide_weekly", "user", { occurrenceDate: "2026-09-09" }))
      .toMatchObject({ skippable: false, skipCommand: null, notificationAction: { skipCommand: null } });
    // A future occurrence: the notification may skip on its own day; the
    // detail button (today-only) may not.
    expect(await past.service.getPriorityDetail("reminder_peptide_weekly", "user", { occurrenceDate: "2026-09-23" }))
      .toMatchObject({ skippable: false, skipCommand: null, notificationAction: { skipCommand: { commandType: "priority.skip.v1" } } });
    const completed = peptideService({ reminder: peptideReminder({
      completionHistory: [{ occurrenceDate: TODAY, completedAt: `${TODAY}T17:30:00.000Z`, effectiveDose: "0.5 mg" }],
    }) });
    expect(await completed.service.getPriorityDetail("reminder_peptide_weekly", "user"))
      .toMatchObject({ status: "Completed", skippable: false, skipCommand: null });
  });

  it("adds the Foam Rolling notification skipCommand while keeping its completion", async () => {
    const { service } = recoveryDetailService();
    const detail = await service.getPriorityDetail("reminder_foam_roll_daily", "user");
    expect(detail.notificationAction).toMatchObject({
      classification: "specialized_workflow_required",
      completionCommand: { commandType: "priority.complete.v1", expectedVersion: 53 },
      skipCommand: {
        commandType: "priority.skip.v1", expectedVersion: 53,
        payload: { priorityId: "reminder_foam_roll_daily", occurrenceDate: TODAY },
      },
    });
  });
});
