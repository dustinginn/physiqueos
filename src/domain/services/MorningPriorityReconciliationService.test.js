import { describe, expect, it, vi } from "vitest";
import { createDailyCheckInRepository } from "../../data/repositories/DailyCheckInRepository";
import { createReminderRepository } from "../../data/repositories/ReminderRepository";
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

function fixture({ reminders = [reminder("one")], checkIns = [] } = {}) {
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
});
