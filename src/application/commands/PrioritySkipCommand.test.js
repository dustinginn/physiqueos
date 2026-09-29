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

function fixture({ dailyCheckIns = [], reminders = null } = {}) {
  return createInMemoryCanonicalRecordStore({
    user: [{ id: ownerUserId, timeZone: "America/Los_Angeles", version: 1 }],
    goals: [{ id: "goal-one", userId: ownerUserId, title: "Goal", primary: true, status: "active", version: 1 }],
    protocols: [],
    executionItems: [],
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
