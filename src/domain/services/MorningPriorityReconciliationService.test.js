import { describe, expect, it, vi } from "vitest";
import { createDailyCheckInRepository } from "../../data/repositories/DailyCheckInRepository";
import { createReminderRepository } from "../../data/repositories/ReminderRepository";
import { createProtocolRepository } from "../../data/repositories/ProtocolRepository";
import { createProtocolVersionRepository } from "../../data/repositories/ProtocolVersionRepository";
import {
  MorningPriorityReconciliationValidationError,
  createMorningPriorityReconciliationService,
  parseMorningPriorityReconciliationFormData,
} from "./MorningPriorityReconciliationService";

const NOW = new Date("2026-07-29T15:00:00.000Z");
const TIME_ZONE = "America/Los_Angeles";

function reminder(id, overrides = {}) {
  return {
    id,
    userId: "user",
    title: id,
    type: "protocol_reminder",
    active: true,
    schedule: {
      cadence: "daily",
      type: "daily",
      timeOfDay: "morning",
    },
    ...overrides,
  };
}

function submission(id, overrides = {}) {
  return {
    priorityId: id,
    occurrenceDate: "2026-07-28",
    occurrenceKey: `${id}:2026-07-28`,
    disposition: "skipped",
    note: null,
    ...overrides,
  };
}

function fixture({
  reminders = [reminder("one")],
  checkIns = [],
  protocols = [],
  protocolVersions = [],
} = {}) {
  const reminderWrites = vi.fn();
  const checkInWrites = vi.fn();
  const reminderRepository = createReminderRepository(reminders, {
    onChange: reminderWrites,
  });
  const dailyCheckInRepository = createDailyCheckInRepository(checkIns, {
    onChange: checkInWrites,
  });
  const repositories = {
    reminders: reminderRepository,
    dailyCheckIns: dailyCheckInRepository,
    dexaScans: { listDEXAScans: vi.fn(async () => []) },
    progressPhotos: { listPhotos: vi.fn(async () => []) },
    weights: { listWeightEntries: vi.fn(async () => []) },
    protocols: createProtocolRepository(protocols),
    protocolVersions: createProtocolVersionRepository(protocolVersions),
  };
  const service = createMorningPriorityReconciliationService({
    repositories,
    now: () => NOW,
  });

  return {
    checkIns,
    checkInWrites,
    reminders,
    reminderWrites,
    repositories,
    service,
  };
}

describe("Morning priority reconciliation server boundary", () => {
  it("parses independent occurrence-keyed form values", () => {
    const formData = new FormData();
    formData.append("reconciliationKeys", "one:2026-07-28");
    formData.append("one:2026-07-28_priorityId", "one");
    formData.append("one:2026-07-28_date", "2026-07-28");
    formData.append("one:2026-07-28_status", "completed");
    formData.append("reconciliationKeys", "two:2026-07-28");
    formData.append("two:2026-07-28_priorityId", "two");
    formData.append("two:2026-07-28_date", "2026-07-28");
    formData.append("two:2026-07-28_status", "note");
    formData.append("two:2026-07-28_note", "  Still needs attention. ");

    expect(parseMorningPriorityReconciliationFormData(formData)).toEqual([
      submission("one", { disposition: "completed" }),
      submission("two", {
        disposition: "note",
        note: "Still needs attention.",
      }),
    ]);
  });

  it("Cases B and M persist two independent dispositions without overwriting either", async () => {
    const { service, repositories } = fixture({
      reminders: [reminder("one"), reminder("two")],
    });

    await service.save({
      userId: "user",
      timeZone: TIME_ZONE,
      submissions: [
        submission("one", { disposition: "completed" }),
        submission("two", {
          disposition: "note",
          note: "Leave this incomplete.",
        }),
      ],
    });

    const checkIn = await repositories.dailyCheckIns.getCheckInForDate(
      "user",
      "2026-07-28"
    );
    expect(checkIn.reconciliation).toEqual([
      expect.objectContaining({
        key: "one:2026-07-28",
        reminderId: "one",
        occurrenceDate: "2026-07-28",
        status: "completed",
      }),
      expect.objectContaining({
        key: "two:2026-07-28",
        reminderId: "two",
        occurrenceDate: "2026-07-28",
        status: "note",
        note: "Leave this incomplete.",
      }),
    ]);
    expect(await repositories.reminders.getReminderById("one")).toMatchObject({
      completionHistory: [expect.objectContaining({
        id: "one:2026-07-28",
        occurrenceDate: "2026-07-28",
        satisfactionType: "morning_check_in_reconciliation",
      })],
    });
  });

  it.each([
    [
      "Case S fabricated priority ID",
      submission("fabricated"),
      "ineligible_occurrence",
    ],
    [
      "Case T older occurrence date",
      submission("one", {
        occurrenceDate: "2026-07-27",
        occurrenceKey: "one:2026-07-27",
      }),
      "invalid_occurrence_date",
    ],
    [
      "Case T today occurrence date",
      submission("one", {
        occurrenceDate: "2026-07-29",
        occurrenceKey: "one:2026-07-29",
      }),
      "invalid_occurrence_date",
    ],
    [
      "Case U unsupported disposition",
      submission("one", { disposition: "rescheduled" }),
      "unsupported_disposition",
    ],
  ])("rejects %s before any write", async (_label, submitted, code) => {
    const { checkInWrites, reminderWrites, service } = fixture();

    await expect(
      service.save({
        userId: "user",
        timeZone: TIME_ZONE,
        submissions: [submitted],
      })
    ).rejects.toMatchObject({
      name: "MorningPriorityReconciliationValidationError",
      code,
    });
    expect(checkInWrites).not.toHaveBeenCalled();
    expect(reminderWrites).not.toHaveBeenCalled();
  });

  it("rejects a titleless or internal record even when submitted by a client", async () => {
    const { checkInWrites, service } = fixture({
      reminders: [
        reminder("internal", {
          title: "",
          internalOnly: true,
        }),
      ],
    });

    await expect(
      service.save({
        userId: "user",
        timeZone: TIME_ZONE,
        submissions: [submission("internal")],
      })
    ).rejects.toMatchObject({
      code: "ineligible_occurrence",
    });
    expect(checkInWrites).not.toHaveBeenCalled();
  });

  it("requires an explicit disposition for every authoritative eligible item", async () => {
    const { checkInWrites, service } = fixture({
      reminders: [reminder("one"), reminder("two")],
    });

    await expect(
      service.save({
        userId: "user",
        timeZone: TIME_ZONE,
        submissions: [submission("one")],
      })
    ).rejects.toBeInstanceOf(
      MorningPriorityReconciliationValidationError
    );
    expect(checkInWrites).not.toHaveBeenCalled();
  });

  it("Cases K and L do not mutate on view and suppress after explicit dated resolution", async () => {
    const { checkInWrites, service } = fixture();

    expect((await service.getSelection({
      userId: "user",
      timeZone: TIME_ZONE,
    })).items).toHaveLength(1);
    expect((await service.getSelection({
      userId: "user",
      timeZone: TIME_ZONE,
    })).items).toHaveLength(1);
    expect(checkInWrites).not.toHaveBeenCalled();

    await service.save({
      userId: "user",
      timeZone: TIME_ZONE,
      submissions: [submission("one")],
    });

    expect((await service.getSelection({
      userId: "user",
      timeZone: TIME_ZONE,
    })).items).toEqual([]);
  });

  it("Case Y persists one dated record and treats an equivalent repeat as idempotent", async () => {
    const { checkInWrites, repositories, service } = fixture();
    const input = {
      userId: "user",
      timeZone: TIME_ZONE,
      submissions: [submission("one")],
    };

    const first = await service.save(input);
    const repeated = await service.save(input);
    const checkIn = await repositories.dailyCheckIns.getCheckInForDate(
      "user",
      "2026-07-28"
    );

    expect(first.persisted).toEqual(["one:2026-07-28"]);
    expect(repeated).toMatchObject({
      persisted: [],
      idempotent: ["one:2026-07-28"],
    });
    expect(checkIn.reconciliation).toHaveLength(1);
    expect(checkInWrites).toHaveBeenCalledTimes(1);
  });

  it("Gate H never clones a priority or mutates its scheduled date", async () => {
    const original = reminder("one", {
      schedule: {
        cadence: "daily",
        type: "daily",
        timeOfDay: "night",
      },
    });
    const { reminders, repositories, service } = fixture({
      reminders: [original],
    });
    const scheduleBefore = structuredClone(original.schedule);

    await service.save({
      userId: "user",
      timeZone: TIME_ZONE,
      submissions: [submission("one")],
    });

    expect(reminders).toHaveLength(1);
    expect(reminders[0].schedule).toEqual(scheduleBefore);
    expect(
      await repositories.dailyCheckIns.getCheckInForDate("user", "2026-07-29")
    ).toBeNull();
  });

  it("requires the scheduled evidence occurrence to be added or intentionally skipped", async () => {
    const { checkInWrites, service } = fixture({
      reminders: [reminder("photos", {
        linkedEvidenceType: "progress_photo",
        type: "progress_photo",
      })],
    });

    const selected = await service.getSelection({
      userId: "user",
      timeZone: TIME_ZONE,
    });
    await expect(service.save({ userId: "user", timeZone: TIME_ZONE, submissions: [] }))
      .rejects.toMatchObject({ code: "missing_disposition" });
    const result = await service.save({
      userId: "user", timeZone: TIME_ZONE, submissions: [submission("photos")],
    });

    expect(selected.items[0]).toMatchObject({
      kind: "execution_reconciliation",
      evidenceRequired: true,
      status: "missing",
      primaryAction: { label: "Upload Photos" },
    });
    expect(result.persisted).toEqual(["photos:2026-07-28"]);
    expect(checkInWrites).toHaveBeenCalledOnce();
  });

  it("cannot fabricate completion for scheduled evidence without evidence", async () => {
    const { service } = fixture({
      reminders: [reminder("photos", {
        linkedEvidenceType: "progress_photo",
        type: "progress_photo",
      })],
    });
    await expect(service.save({
      userId: "user",
      timeZone: TIME_ZONE,
      submissions: [submission("photos", { disposition: "completed" })],
    })).rejects.toMatchObject({ code: "unsupported_disposition" });
  });

  it("loads the accepted source version for a sparse active Activity successor", async () => {
    const sourceVersionId = "activity-source-v2";
    const { service } = fixture({
      reminders: [],
      protocols: [{
        id: "activity-successor",
        userId: "user",
        protocolType: "activity",
        category: "activity",
        status: "active",
        currentVersionId: "activity-successor-v1",
        activationProvenance: { sourceVersionId },
      }],
      protocolVersions: [{
        id: "activity-successor-v1",
        protocolId: "activity-successor",
        status: "active",
        effectiveAt: "2026-07-21",
        change: { previousVersionId: sourceVersionId },
      }, {
        id: sourceVersionId,
        protocolId: "activity-source",
        status: "active",
        effectiveAt: "2026-07-11",
        expectations: [{
          cadence: "daily",
          includedEvidenceTypes: ["activity_day"],
        }],
      }],
    });

    const selected = await service.getSelection({
      userId: "user",
      timeZone: TIME_ZONE,
    });

    expect(selected.evidenceRecoveryItems).toEqual([
      expect.objectContaining({
        evidenceType: "activity_day",
        occurrenceDate: "2026-07-28",
        status: "missing",
        primaryAction: expect.objectContaining({ label: "Add Activity" }),
      }),
    ]);
  });
});

describe("Morning priority reconciliation honours pause windows (S3)", () => {
  function pausedFixture(scheduleSuspensions) {
    const base = fixture({
      reminders: [reminder("one"), reminder("reminder_peptide", { linkedEntityId: "protocol_peptide" })],
      protocols: [{ id: "protocol_peptide", userId: "user", category: "peptide", status: "active", name: "Peptide" }],
    });
    base.repositories.executionItems = {
      listExecutionItems: vi.fn(async () => [{
        id: "execution_peptide", userId: "user", type: "peptide", protocolRootId: "protocol_peptide", active: true,
        ...(scheduleSuspensions === undefined ? {} : { scheduleSuspensions }),
      }]),
    };
    return base;
  }

  it("excludes the paused peptide occurrence from the selection with reason execution_paused", async () => {
    const { service } = pausedFixture([{ pausedFrom: "2026-07-28", resumedOn: null }]);
    const selection = await service.getSelection({ userId: "user", timeZone: TIME_ZONE });
    expect(selection.items.map((item) => item.id)).toEqual(["one"]);
    expect(selection.diagnostics.exclusions).toContainEqual({ priorityId: "reminder_peptide", reason: "execution_paused" });
  });

  it("refuses to reconcile (and never completes) a paused occurrence, while resumed and absent windows stay eligible", async () => {
    const paused = pausedFixture([{ pausedFrom: "2026-07-28", resumedOn: null }]);
    await expect(paused.service.save({
      userId: "user", timeZone: TIME_ZONE,
      submissions: [submission("one"), submission("reminder_peptide", { disposition: "completed" })],
    })).rejects.toMatchObject({ code: "ineligible_occurrence" });
    expect(paused.reminderWrites).not.toHaveBeenCalled();

    for (const windows of [[{ pausedFrom: "2026-07-20", resumedOn: "2026-07-28" }], undefined]) {
      const { service } = pausedFixture(windows);
      const selection = await service.getSelection({ userId: "user", timeZone: TIME_ZONE });
      expect(selection.items.map((item) => item.id)).toEqual(["one", "reminder_peptide"]);
    }
  });
});
