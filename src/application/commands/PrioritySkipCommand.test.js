import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createInMemoryFoundationTransactionStore } from "../../platform/commands/InMemoryFoundationTransactionStore.js";
import { createCanonicalPersistenceCommandPorts } from "./CanonicalPersistenceCommandPorts.js";
import { createPhase3CommandService, Phase3Command } from "./Phase3CommandService.js";
import { getPreviousDayIncompletePrioritySelection } from "../../domain/services/DailyFocusService.js";

const ownerUserId = "owner-one";
const principal = { userId: ownerUserId, deviceId: "device-one", sessionId: "session-one" };
// 05:00 on 2026-08-11 in America/Los_Angeles (the user's canonical zone).
const now = () => new Date("2026-08-11T12:00:00.000Z");
const TODAY = "2026-08-11";

// Verified production shape for Foam Rolling: `recovery_reminder` → protocol
// category `recovery` → manual-completion `recovery` Execution item. Synthetic
// ids and version numbers only.
const RECOVERY_PROTOCOL = {
  id: "protocol-recovery", userId: ownerUserId, category: "recovery", name: "Foam Rolling", status: "active", version: 1,
};
const RECOVERY_EXECUTION = {
  id: "execution_foam_roll", userId: ownerUserId, type: "recovery", title: "Foam Rolling", active: true,
  linkedProtocolId: "protocol-recovery", cadence: { type: "daily" },
  preferredSchedule: { daysOfWeek: [], timeOfDay: "17:00", startDate: "2026-07-23" },
  completionMethod: "manual", executionRevision: 1, notes: "", version: 1,
};
const RECOVERY_REMINDER = {
  id: "reminder_foam_roll_daily", userId: ownerUserId, title: "Foam Roll", type: "recovery_reminder",
  linkedEntityType: "protocol", linkedEntityId: "protocol-recovery", active: true,
  schedule: { type: "daily", timeOfDay: "17:00" }, completionHistory: [], version: 1,
};

function fixture({ dailyCheckIns = [], reminders = null } = {}) {
  return createInMemoryCanonicalRecordStore({
    user: [{ id: ownerUserId, timeZone: "America/Los_Angeles", version: 1 }],
    goals: [{ id: "goal-one", userId: ownerUserId, title: "Goal", primary: true, status: "active", version: 1 }],
    protocols: [RECOVERY_PROTOCOL],
    executionItems: [RECOVERY_EXECUTION],
    reminders: reminders ?? [
      {
        id: "priority-one", userId: ownerUserId, title: "Stretch", type: "other", active: true,
        persistenceMode: "always_visible", schedule: { type: "daily", timeOfDay: "morning" },
        completionHistory: [], version: 1,
      },
      {
        id: "reminder_morning_weight", userId: ownerUserId, title: "Morning Weigh-in", type: "morning_weigh_in",
        linkedEvidenceType: "weight", active: true, completionHistory: [], version: 1,
      },
      {
        id: "reminder_peptide", userId: ownerUserId, title: "Peptide", type: "protocol_reminder",
        linkedEntityId: "protocol-peptide", active: true, completionHistory: [], version: 1,
      },
      {
        id: "reminder_creatine", userId: ownerUserId, title: "Creatine", type: "supplement_reminder",
        linkedEntityId: "protocol-supplement", active: true, completionHistory: [], version: 1,
      },
      RECOVERY_REMINDER,
    ],
    weightEntries: [], dailyCheckIns, evidencePackages: [], canonicalEvidenceObjects: [],
    dexaScans: [], protocolVersions: [], progressPhotos: [], dailyBriefings: [], analyses: [],
    briefingReconciliationWorkItems: [], piEnergyConfidenceWorkItems: [], piTrainingConfidenceWorkItems: [],
  });
}

function context(payload, expectedVersion, commandId) {
  return { ownerUserId, principal, metadata: { commandId, expectedVersion }, payload };
}

function ports(records) {
  return createCanonicalPersistenceCommandPorts({ records, now });
}

describe("priority.skip.v1 canonical port", () => {
  it("skips today's occurrence through the canonical dated reconciliation entry", async () => {
    const records = fixture();
    const outcome = await ports(records).skipPriority(context(
      { priorityId: "priority-one", occurrenceDate: TODAY, note: "  travel day " }, "1", "skip-one"
    ));
    expect(outcome).toMatchObject({
      status: "committed",
      outbox: [],
      result: {
        status: "skipped",
        priorityId: "priority-one",
        occurrenceDate: TODAY,
        occurrenceKey: "priority-one:2026-08-11",
        note: "travel day",
        skippedAt: "2026-08-11T12:00:00.000Z",
        revision: 2,
        checkInId: "daily_check_in_2026_08_11",
        execution: { workflow: "priority_detail", expectedVersion: 2 },
      },
    });
    const snapshot = records.snapshot();
    const reminder = snapshot.reminders.find((item) => item.id === "priority-one");
    expect(reminder.completionHistory).toEqual([]);
    expect(reminder.version).toBe(2);
    const checkIn = snapshot.dailyCheckIns.find((item) => item.id === "daily_check_in_2026_08_11");
    expect(checkIn).toMatchObject({ userId: ownerUserId, date: TODAY });
    expect(checkIn.reconciliation).toEqual([{
      key: "priority-one:2026-08-11",
      priorityId: "priority-one",
      reminderId: "priority-one",
      occurrenceDate: TODAY,
      status: "skipped",
      note: "travel day",
      recordedAt: "2026-08-11T12:00:00.000Z",
    }]);
  });

  it("treats an exact replay as a no-op even with the pre-skip If-Match", async () => {
    const records = fixture();
    await ports(records).skipPriority(context({ priorityId: "priority-one", occurrenceDate: TODAY }, "1", "skip-a"));
    const before = records.snapshot();
    const replay = await ports(records).skipPriority(context({ priorityId: "priority-one", occurrenceDate: TODAY }, "1", "skip-b"));
    expect(replay.result).toMatchObject({ status: "already_skipped", occurrenceKey: "priority-one:2026-08-11", revision: 2, note: null });
    expect(records.snapshot()).toEqual(before);
  });

  it("requires If-Match and rejects a stale reminder version", async () => {
    const records = fixture();
    await expect(ports(records).skipPriority(context({ priorityId: "priority-one", occurrenceDate: TODAY }, null, "skip-none")))
      .rejects.toMatchObject({ status: 428, code: "PRECONDITION_REQUIRED" });
    await expect(ports(records).skipPriority(context({ priorityId: "priority-one", occurrenceDate: TODAY }, "7", "skip-stale")))
      .rejects.toMatchObject({ status: 412, code: "STALE_VERSION", recovery: { resource: "priority:priority-one" } });
    expect(records.snapshot().dailyCheckIns).toEqual([]);
  });

  it("keeps a completed occurrence completed (terminal completed wins) without writing", async () => {
    const records = fixture();
    await ports(records).completePriority(context({ priorityId: "priority-one", occurrenceDate: TODAY }, "1", "complete"));
    const before = records.snapshot();
    const outcome = await ports(records).skipPriority(context({ priorityId: "priority-one", occurrenceDate: TODAY }, "2", "skip-after"));
    expect(outcome.result).toMatchObject({ status: "already_completed", priorityId: "priority-one", revision: 2 });
    expect(records.snapshot()).toEqual(before);
  });

  it("returns already_skipped when completion targets an occurrence skipped today", async () => {
    const records = fixture();
    await ports(records).skipPriority(context({ priorityId: "priority-one", occurrenceDate: TODAY }, "1", "skip"));
    const before = records.snapshot();
    const outcome = await ports(records).completePriority(context({ priorityId: "priority-one", occurrenceDate: TODAY }, "2", "complete-after"));
    expect(outcome.result).toMatchObject({
      status: "already_skipped", priorityId: "priority-one", occurrenceKey: "priority-one:2026-08-11",
      skippedAt: "2026-08-11T12:00:00.000Z", revision: 2,
    });
    expect(records.snapshot()).toEqual(before);
    expect(records.snapshot().reminders.find((item) => item.id === "priority-one").completionHistory).toEqual([]);
  });

  it("rejects past dates (Morning Check-In owns them) and future dates", async () => {
    const records = fixture();
    await expect(ports(records).skipPriority(context({ priorityId: "priority-one", occurrenceDate: "2026-08-10" }, "1", "past")))
      .rejects.toMatchObject({
        status: 422, code: "PRIORITY_SKIP_PAST_OCCURRENCE",
        recovery: { today: TODAY, workflow: "morning_check_in" },
      });
    await expect(ports(records).skipPriority(context({ priorityId: "priority-one", occurrenceDate: "2026-08-12" }, "1", "future")))
      .rejects.toMatchObject({ status: 422, code: "PRIORITY_SKIP_FUTURE_OCCURRENCE" });
    expect(records.snapshot().dailyCheckIns).toEqual([]);
  });

  it("refuses specialized and dose-aware workflows", async () => {
    const records = fixture();
    await expect(ports(records).skipPriority(context({ priorityId: "reminder_morning_weight", occurrenceDate: TODAY }, "1", "weight")))
      .rejects.toMatchObject({ status: 422, code: "PRIORITY_SKIP_UNSUPPORTED", recovery: { workflow: "morning_check_in" } });
    await expect(ports(records).skipPriority(context({ priorityId: "reminder_peptide", occurrenceDate: TODAY }, "1", "peptide")))
      .rejects.toMatchObject({ status: 422, code: "PRIORITY_SKIP_UNSUPPORTED" });
    await expect(ports(records).skipPriority(context({ priorityId: "missing", occurrenceDate: TODAY }, "1", "missing")))
      .rejects.toMatchObject({ status: 404, code: "RESOURCE_NOT_FOUND" });
  });

  it("appends to an existing same-day check-in and a later same-day weigh-in preserves the skip", async () => {
    const records = fixture({ dailyCheckIns: [{
      id: "daily_check_in_2026_08_11", userId: ownerUserId, date: TODAY, notes: "slept well", version: 4,
      reconciliation: [],
    }] });
    const skip = await ports(records).skipPriority(context({ priorityId: "priority-one", occurrenceDate: TODAY }, "1", "skip"));
    expect(skip.result.checkInRevision).toBe(5);
    await ports(records).submitWeight(context({ localDate: TODAY, value: 180 }, null, "weigh-in"));
    const checkIn = records.snapshot().dailyCheckIns.find((item) => item.id === "daily_check_in_2026_08_11");
    expect(checkIn.weightEntryId).toBeTruthy();
    expect(checkIn.reconciliation).toEqual([expect.objectContaining({
      key: "priority-one:2026-08-11", reminderId: "priority-one", occurrenceDate: TODAY, status: "skipped",
    })]);
  });

  it("is excluded from the next morning's selection as a dated reconciliation", async () => {
    const records = fixture();
    await ports(records).skipPriority(context({ priorityId: "priority-one", occurrenceDate: TODAY }, "1", "skip"));
    const snapshot = records.snapshot();
    const selection = getPreviousDayIncompletePrioritySelection({
      now: new Date("2026-08-12T15:00:00.000Z"),
      timeZone: "America/Los_Angeles",
      reminders: snapshot.reminders.filter((item) => item.id === "priority-one"),
      checkIns: snapshot.dailyCheckIns,
    });
    expect(selection.items).toEqual([]);
    expect(selection.diagnostics.exclusions).toEqual([{ priorityId: "priority-one", reason: "dated_reconciliation" }]);
    expect(selection.diagnostics.existingReconciliationKeys).toEqual(["priority-one:2026-08-11"]);
  });
});

describe("priority.skip.v1 for an execution-backed recovery Support reminder (Foam Rolling)", () => {
  const FOAM = "reminder_foam_roll_daily";

  it("skips today's recovery occurrence through the same dated reconciliation entry", async () => {
    const records = fixture();
    const outcome = await ports(records).skipPriority(context({ priorityId: FOAM, occurrenceDate: TODAY }, "1", "foam-skip"));
    expect(outcome).toMatchObject({
      status: "committed",
      outbox: [],
      result: {
        status: "skipped",
        priorityId: FOAM,
        occurrenceDate: TODAY,
        occurrenceKey: `${FOAM}:2026-08-11`,
        note: null,
        skippedAt: "2026-08-11T12:00:00.000Z",
        revision: 2,
        checkInId: "daily_check_in_2026_08_11",
        execution: { workflow: "priority_detail", expectedVersion: 2 },
      },
    });
    const snapshot = records.snapshot();
    const reminder = snapshot.reminders.find((item) => item.id === FOAM);
    expect(reminder.completionHistory).toEqual([]);
    expect(reminder.version).toBe(2);
    expect(snapshot.executionItems.find((item) => item.id === "execution_foam_roll")).toEqual(RECOVERY_EXECUTION);
    const checkIn = snapshot.dailyCheckIns.find((item) => item.id === "daily_check_in_2026_08_11");
    expect(checkIn.reconciliation).toEqual([{
      key: `${FOAM}:2026-08-11`,
      priorityId: FOAM,
      reminderId: FOAM,
      occurrenceDate: TODAY,
      status: "skipped",
      note: null,
      recordedAt: "2026-08-11T12:00:00.000Z",
    }]);
  });

  it("returns already_skipped when completion targets the skipped recovery occurrence, without writing", async () => {
    const records = fixture();
    await ports(records).skipPriority(context({ priorityId: FOAM, occurrenceDate: TODAY }, "1", "foam-skip"));
    const before = records.snapshot();
    const outcome = await ports(records).completePriority(context(
      { priorityId: FOAM, occurrenceDate: TODAY, dose: null, protocolId: "protocol-recovery" }, "2", "foam-complete-after"
    ));
    expect(outcome.result).toMatchObject({
      status: "already_skipped", priorityId: FOAM, occurrenceKey: `${FOAM}:2026-08-11`,
      skippedAt: "2026-08-11T12:00:00.000Z", revision: 2,
    });
    expect(records.snapshot()).toEqual(before);
    expect(records.snapshot().reminders.find((item) => item.id === FOAM).completionHistory).toEqual([]);
  });

  it("refuses a peptide reminder whose protocol does not resolve, and the (deferred) supplement reminder", async () => {
    const records = fixture();
    await expect(ports(records).skipPriority(context({ priorityId: "reminder_peptide", occurrenceDate: TODAY }, "1", "peptide")))
      .rejects.toMatchObject({ status: 422, code: "PRIORITY_SKIP_UNSUPPORTED", recovery: { workflow: "priority_detail" } });
    await expect(ports(records).skipPriority(context({ priorityId: "reminder_creatine", occurrenceDate: TODAY }, "1", "supplement")))
      .rejects.toMatchObject({ status: 422, code: "PRIORITY_SKIP_UNSUPPORTED", recovery: { workflow: "priority_detail" } });
    expect(records.snapshot().dailyCheckIns).toEqual([]);
  });

  it("excludes the skipped recovery occurrence from the next morning's selection as a dated reconciliation", async () => {
    const records = fixture();
    await ports(records).skipPriority(context({ priorityId: FOAM, occurrenceDate: TODAY }, "1", "foam-skip"));
    const snapshot = records.snapshot();
    const selection = getPreviousDayIncompletePrioritySelection({
      now: new Date("2026-08-12T15:00:00.000Z"),
      timeZone: "America/Los_Angeles",
      reminders: snapshot.reminders.filter((item) => item.id === FOAM),
      checkIns: snapshot.dailyCheckIns,
    });
    expect(selection.items).toEqual([]);
    expect(selection.diagnostics.exclusions).toEqual([{ priorityId: FOAM, reason: "dated_reconciliation" }]);
    expect(selection.diagnostics.existingReconciliationKeys).toEqual([`${FOAM}:2026-08-11`]);
  });
});

describe("priority.skip.v1 command contract", () => {
  function service(records = fixture()) {
    return createPhase3CommandService({
      transactionRunner: createInMemoryFoundationTransactionStore(),
      ports: ports(records),
    });
  }

  it("requires priorityId, occurrenceDate, and an expected version", async () => {
    await expect(service().execute({
      commandType: Phase3Command.SKIP_PRIORITY, principal,
      metadata: { idempotencyKey: "priority-skip-missing-version" },
      payload: { priorityId: "priority-one", occurrenceDate: TODAY },
    })).rejects.toMatchObject({ status: 400, code: "CONTRACT_VALIDATION_FAILED", fieldErrors: [{ field: "expectedVersion" }] });
    await expect(service().execute({
      commandType: Phase3Command.SKIP_PRIORITY, principal,
      metadata: { idempotencyKey: "priority-skip-missing-date", expectedVersion: "1" },
      payload: { priorityId: "priority-one" },
    })).rejects.toMatchObject({ status: 400, fieldErrors: [{ field: "occurrenceDate" }] });
    await expect(service().execute({
      commandType: Phase3Command.SKIP_PRIORITY, principal,
      metadata: { idempotencyKey: "priority-skip-bad-note", expectedVersion: "1" },
      payload: { priorityId: "priority-one", occurrenceDate: TODAY, note: 42 },
    })).rejects.toMatchObject({ status: 400, fieldErrors: [{ field: "note" }] });
  });

  it("commits through the idempotent command boundary", async () => {
    const records = fixture();
    const receipt = await service(records).execute({
      commandType: Phase3Command.SKIP_PRIORITY, principal,
      metadata: { idempotencyKey: "priority-skip-boundary-0001", expectedVersion: "1" },
      payload: { priorityId: "priority-one", occurrenceDate: TODAY },
    });
    expect(receipt.receipt.result).toMatchObject({ status: "skipped", occurrenceKey: "priority-one:2026-08-11", revision: 2 });
  });
});

// Peptides: skip is a separate capability from the dose-aware completion. A
// skip records the dated reconciliation entry only — never a dose, a
// completion or evidence. Synthetic ids and versions only.
describe("priority.skip.v1 for a peptide occurrence", () => {
  const PEPTIDE = "reminder_peptide_daily";
  const PEPTIDE_PROTOCOL = {
    id: "protocol-peptide", userId: ownerUserId, category: "peptide", name: "Peptide", status: "active", version: 1,
  };
  const SUPPLEMENT_PROTOCOL = {
    id: "protocol-supplement", userId: ownerUserId, category: "supplement", name: "Creatine", status: "active", version: 1,
  };
  function peptideExecution(overrides = {}) {
    return {
      id: "execution_peptide", userId: ownerUserId, type: "peptide", title: "Peptide", active: true,
      protocolRootId: "protocol-peptide", cadence: { type: "daily" },
      preferredSchedule: { daysOfWeek: [], timeOfDay: "21:00", startDate: "2026-07-23" },
      timeline: [{ startDate: "2026-07-23", endDate: null, dose: { amount: "0.5", unit: "mg" } }],
      executionRevision: 1, version: 1, ...overrides,
    };
  }
  function peptideRecords({ execution = peptideExecution(), completionHistory = [] } = {}) {
    return createInMemoryCanonicalRecordStore({
      user: [{ id: ownerUserId, timeZone: "America/Los_Angeles", version: 1 }],
      goals: [],
      protocols: [PEPTIDE_PROTOCOL, SUPPLEMENT_PROTOCOL],
      executionItems: [execution, {
        id: "execution_creatine", userId: ownerUserId, type: "supplement", title: "Creatine", active: true,
        protocolRootId: "protocol-supplement", cadence: { type: "daily" },
        preferredSchedule: { daysOfWeek: [], timeOfDay: "08:00", startDate: "2026-07-23" },
        executionRevision: 1, version: 1,
      }],
      reminders: [
        {
          id: PEPTIDE, userId: ownerUserId, title: "Peptide", type: "protocol_reminder",
          linkedEntityType: "protocol", linkedEntityId: "protocol-peptide", active: true,
          schedule: { type: "daily", timeOfDay: "21:00" }, completionHistory, version: 3,
        },
        {
          id: "reminder_creatine_daily", userId: ownerUserId, title: "Creatine", type: "protocol_reminder",
          linkedEntityType: "protocol", linkedEntityId: "protocol-supplement", active: true,
          schedule: { type: "daily", timeOfDay: "08:00" }, completionHistory: [], version: 1,
        },
      ],
      weightEntries: [], dailyCheckIns: [], evidencePackages: [], canonicalEvidenceObjects: [],
      dexaScans: [], protocolVersions: [], progressPhotos: [], dailyBriefings: [], analyses: [],
      briefingReconciliationWorkItems: [], piEnergyConfidenceWorkItems: [], piTrainingConfidenceWorkItems: [],
    });
  }

  it("skips today's peptide occurrence without recording a dose or completion", async () => {
    const records = peptideRecords();
    const outcome = await ports(records).skipPriority(context({ priorityId: PEPTIDE, occurrenceDate: TODAY }, "3", "peptide-skip"));
    expect(outcome.result).toMatchObject({ status: "skipped", priorityId: PEPTIDE, occurrenceDate: TODAY, revision: 4 });
    const snapshot = records.snapshot();
    const reminder = snapshot.reminders.find((item) => item.id === PEPTIDE);
    expect(reminder.completionHistory).toEqual([]);
    expect(JSON.stringify(snapshot.reminders)).not.toContain("effectiveDose");
    expect(JSON.stringify(snapshot.dailyCheckIns)).not.toMatch(/dose|amountTaken/i);
    expect(snapshot.dailyCheckIns[0].reconciliation).toEqual([expect.objectContaining({
      reminderId: PEPTIDE, occurrenceDate: TODAY, status: "skipped",
    })]);
    expect(snapshot.canonicalEvidenceObjects).toEqual([]);
    expect(snapshot.evidencePackages).toEqual([]);
  });

  it("is idempotent, and completion afterwards is a no-op already_skipped", async () => {
    const records = peptideRecords();
    await ports(records).skipPriority(context({ priorityId: PEPTIDE, occurrenceDate: TODAY }, "3", "peptide-skip"));
    const before = records.snapshot();
    const replay = await ports(records).skipPriority(context({ priorityId: PEPTIDE, occurrenceDate: TODAY }, "3", "peptide-skip-again"));
    expect(replay.result).toMatchObject({ status: "already_skipped" });
    const complete = await ports(records).completePriority(context(
      { priorityId: PEPTIDE, occurrenceDate: TODAY, dose: "0.5 mg", protocolId: "protocol-peptide" }, "4", "peptide-complete-after"
    ));
    expect(complete.result).toMatchObject({ status: "already_skipped" });
    expect(records.snapshot()).toEqual(before);
  });

  it("leaves an already completed peptide occurrence completed", async () => {
    const records = peptideRecords();
    await ports(records).completePriority(context(
      { priorityId: PEPTIDE, occurrenceDate: TODAY, dose: "0.5 mg", protocolId: "protocol-peptide" }, "3", "peptide-complete"
    ));
    const before = records.snapshot();
    const outcome = await ports(records).skipPriority(context({ priorityId: PEPTIDE, occurrenceDate: TODAY }, "4", "peptide-skip-late"));
    expect(outcome.result).toMatchObject({ status: "already_completed" });
    expect(records.snapshot()).toEqual(before);
  });

  it("refuses a stale version and a paused date, while accepting supplement Support", async () => {
    await expect(ports(peptideRecords()).skipPriority(context({ priorityId: PEPTIDE, occurrenceDate: TODAY }, "2", "stale")))
      .rejects.toMatchObject({ status: 412, code: "STALE_VERSION" });
    const paused = peptideRecords({ execution: peptideExecution({ scheduleSuspensions: [{ pausedFrom: "2026-08-10", resumedOn: null }] }) });
    await expect(ports(paused).skipPriority(context({ priorityId: PEPTIDE, occurrenceDate: TODAY }, "3", "paused")))
      .rejects.toMatchObject({ status: 422, code: "PRIORITY_OCCURRENCE_PAUSED" });
    expect(paused.snapshot().dailyCheckIns).toEqual([]);
    const supplement = peptideRecords();
    const result = await ports(supplement).skipPriority(context({ priorityId: "reminder_creatine_daily", occurrenceDate: TODAY }, "1", "supp"));
    expect(result.result).toMatchObject({ status: "skipped", priorityId: "reminder_creatine_daily" });
    expect(supplement.snapshot().dailyCheckIns[0].reconciliation[0]).toMatchObject({
      priorityId: "reminder_creatine_daily", reminderId: "reminder_creatine_daily", status: "skipped",
    });
  });

  it("still refuses past and future peptide occurrences", async () => {
    await expect(ports(peptideRecords()).skipPriority(context({ priorityId: PEPTIDE, occurrenceDate: "2026-08-10" }, "3", "past")))
      .rejects.toMatchObject({ status: 422, code: "PRIORITY_SKIP_PAST_OCCURRENCE" });
    await expect(ports(peptideRecords()).skipPriority(context({ priorityId: PEPTIDE, occurrenceDate: "2026-08-12" }, "3", "future")))
      .rejects.toMatchObject({ status: 422, code: "PRIORITY_SKIP_FUTURE_OCCURRENCE" });
  });
});
