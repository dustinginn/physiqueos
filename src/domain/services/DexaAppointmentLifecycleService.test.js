import { describe, expect, it } from "vitest";
import { createExecutionItemRepository } from "../../data/repositories/ExecutionItemRepository";
import {
  DexaPriorityStage,
  applyPreparedDexaAppointmentEvidenceReconciliation,
  parseDexaPriorityId,
  prepareDexaAppointmentEvidenceReconciliation,
  projectDexaAppointmentPriority,
  reconcileDexaAppointmentFromConfirmedEvidence,
  reconcileHistoricalDexaExecutionFromConfirmedEvidence,
  verifyPreparedDexaAppointmentEvidenceReconciliation,
} from "./DexaAppointmentLifecycleService";

describe("DEXA appointment priority lifecycle", () => {
  it.each([
    ["before configured lead time", "2026-08-07T15:00:00.000Z", null],
    ["one week before when disabled", "2026-08-08T15:00:00.000Z", null],
    ["one day before", "2026-08-14T15:00:00.000Z", DexaPriorityStage.DAY_BEFORE],
    ["morning of", "2026-08-15T14:00:00.000Z", DexaPriorityStage.MORNING_OF],
    ["after the appointment", "2026-08-15T14:30:00.000Z", DexaPriorityStage.UPLOAD_RESULTS],
  ])("projects %s", (_label, instant, expectedStage) => {
    const result = projectDexaAppointmentPriority({ appointment: appointment(), now: new Date(instant) });
    expect(result?.stage ?? null).toBe(expectedStage);
    if (result) expect(parseDexaPriorityId(result.priorityId)).toEqual({
      scheduledDate: "2026-08-15",
      stage: expectedStage,
    });
  });

  it("projects each configured advance reminder and keeps appointment day canonical without optional reminders", () => {
    expect(projectDexaAppointmentPriority({
      appointment: appointment({ reminderPreferences: ["week_before"] }),
      now: new Date("2026-08-08T15:00:00.000Z"),
    })?.stage).toBe(DexaPriorityStage.WEEK_BEFORE);
    expect(projectDexaAppointmentPriority({
      appointment: appointment({ reminderPreferences: [] }),
      now: new Date("2026-08-15T14:00:00.000Z"),
    })?.stage).toBe(DexaPriorityStage.APPOINTMENT);
    expect(projectDexaAppointmentPriority({
      appointment: appointment({ reminderPreferences: [], uploadReminder: false }),
      now: new Date("2026-08-15T14:31:00.000Z"),
    })).toBeNull();
  });

  it("parses the stable identity after the route layer URL-encodes its separators", () => {
    expect(parseDexaPriorityId(
      "dexa-appointment%3A2026-08-15%3Aupload-results",
    )).toEqual({ scheduledDate: "2026-08-15", stage: DexaPriorityStage.UPLOAD_RESULTS });
  });

  it("uses the appointment timezone at the date and time boundaries", () => {
    expect(projectDexaAppointmentPriority({
      appointment: appointment({ reminderPreferences: ["morning_of"] }),
      now: new Date("2026-08-15T06:59:00.000Z"),
    })).toBeNull();
    expect(projectDexaAppointmentPriority({
      appointment: appointment(),
      now: new Date("2026-08-15T07:01:00.000Z"),
    })?.stage).toBe(DexaPriorityStage.MORNING_OF);
  });

  it("suppresses every priority after confirmed matching evidence", () => {
    expect(projectDexaAppointmentPriority({
      appointment: appointment({ active: false, status: "completed" }),
      now: new Date("2026-08-15T14:00:00.000Z"),
    })).toBeNull();
  });
});

describe("DEXA appointment evidence reconciliation", () => {
  it("completes the exact scheduled date, preserves legacy history, and verifies the transition", () => {
    const legacy = legacyExecution();
    const store = { executionItems: [appointment(), legacy] };
    const prepared = prepareDexaAppointmentEvidenceReconciliation(store, confirmation());
    expect(prepared).toMatchObject({ outcome: "ready", matched: true });
    applyPreparedDexaAppointmentEvidenceReconciliation(store, prepared);
    expect(verifyPreparedDexaAppointmentEvidenceReconciliation(store, prepared)).toBe(true);
    expect(store.executionItems[0]).toMatchObject({
      active: false,
      status: "completed",
      completedByEvidenceId: "dexa-aug15",
      completedEvidenceDate: "2026-08-15",
      executionRevision: 2,
      completionHistory: [{
        id: "execution_next_dexa:2026-08-15:dexa-aug15",
        evidenceDate: "2026-08-15",
      }],
    });
    expect(store.executionItems[1]).toEqual(legacy);
  });

  it.each([
    ["historical", "2026-07-18"],
    ["future unrelated", "2026-08-22"],
  ])("does not complete the current appointment for %s evidence", (_label, evidenceDate) => {
    const prepared = prepareDexaAppointmentEvidenceReconciliation(
      { executionItems: [appointment()] },
      confirmation({ evidenceDate }),
    );
    expect(prepared).toMatchObject({ outcome: "not_matched", matched: false });
  });

  it("does not complete an exact-date appointment before that local scan date exists", () => {
    const prepared = prepareDexaAppointmentEvidenceReconciliation(
      { executionItems: [appointment()] },
      confirmation({ confirmedAt: "2026-08-07T20:00:00.000Z" }),
    );
    expect(prepared).toMatchObject({
      outcome: "not_matched",
      matched: false,
      reason: "evidence_date_is_future",
    });
  });

  it("allows a late confirmation for the matching scan date and is idempotent", async () => {
    const items = [appointment(), legacyExecution()];
    const repositories = { executionItems: createExecutionItemRepository(items) };
    const late = confirmation({ confirmedAt: "2026-08-20T20:00:00.000Z" });
    const first = await reconcileDexaAppointmentFromConfirmedEvidence({ repositories, ...late });
    const second = await reconcileDexaAppointmentFromConfirmedEvidence({ repositories, ...late });
    expect(first).toMatchObject({ outcome: "ready", matched: true, persisted: true });
    expect(second).toMatchObject({ outcome: "idempotent", matched: true });
    expect(items[0].completionHistory).toHaveLength(1);
    expect(items[1]).toEqual(legacyExecution());
  });

  it("uses legacy completion only for genuinely historical evidence and never for a future unrelated scan", async () => {
    const items = [appointment(), legacyExecution()];
    const repositories = { executionItems: createExecutionItemRepository(items) };
    const historical = await reconcileHistoricalDexaExecutionFromConfirmedEvidence({
      repositories,
      ...confirmation({ canonicalEvidenceId: "dexa-july18", evidenceDate: "2026-07-18" }),
    });
    const repeated = await reconcileHistoricalDexaExecutionFromConfirmedEvidence({
      repositories,
      ...confirmation({ canonicalEvidenceId: "dexa-july18", evidenceDate: "2026-07-18" }),
    });
    const future = await reconcileHistoricalDexaExecutionFromConfirmedEvidence({
      repositories,
      ...confirmation({ canonicalEvidenceId: "dexa-aug22", evidenceDate: "2026-08-22" }),
    });
    expect(historical).toMatchObject({ outcome: "persisted", matched: true, legacy: true });
    expect(repeated).toMatchObject({ outcome: "idempotent", matched: true, legacy: true });
    expect(future).toMatchObject({ outcome: "not_matched", matched: false });
    expect(items[0]).toEqual(appointment());
    expect(items[1].completionHistory).toHaveLength(2);
  });

  it("does not classify a date before the appointment but after confirmation as historical", async () => {
    const items = [appointment(), legacyExecution()];
    const repositories = { executionItems: createExecutionItemRepository(items) };
    const futureAtConfirmation = await reconcileHistoricalDexaExecutionFromConfirmedEvidence({
      repositories,
      ...confirmation({
        canonicalEvidenceId: "dexa-aug10",
        confirmedAt: "2026-08-07T20:00:00.000Z",
        evidenceDate: "2026-08-10",
      }),
    });
    expect(futureAtConfirmation).toMatchObject({ outcome: "not_matched", matched: false });
    expect(items[1]).toEqual(legacyExecution());
  });
});

function appointment(overrides = {}) {
  return {
    id: "execution_next_dexa",
    userId: "user",
    type: "dexa_appointment",
    active: true,
    status: "scheduled",
    preferredSchedule: { date: "2026-08-15", timeOfDay: "07:30", daysOfWeek: [] },
    timezone: "America/Los_Angeles",
    reminderPreferences: ["day_before", "morning_of"],
    uploadReminder: true,
    preparationNote: "",
    linkedGoalIds: ["goal"],
    executionRevision: 1,
    ...overrides,
  };
}

function legacyExecution() {
  return {
    id: "execution_dexa",
    completedAt: "2026-07-18T12:00:00.000Z",
    completedByEvidenceId: "existing-july18",
    completionHistory: [{
      id: "legacy-existing",
      canonicalEvidenceId: "existing-july18",
      evidenceDate: "2026-07-18",
    }],
  };
}

function confirmation(overrides = {}) {
  return {
    canonicalEvidenceId: "dexa-aug15",
    confirmedAt: "2026-08-20T20:00:00.000Z",
    evidenceDate: "2026-08-15",
    ...overrides,
  };
}
