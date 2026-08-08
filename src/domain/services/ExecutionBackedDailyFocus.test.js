import { describe, expect, it } from "vitest";
import { createDailyFocusService } from "./DailyFocusService";

const protocol = {
  id: "protocol_retatrutide",
  userId: "user",
  name: "Retatrutide",
  category: "peptide",
  status: "active",
  doseHistory: [
    {
      startDate: "2026-07-30",
      endDate: null,
      dose: 2,
      doseUnit: "mg",
      status: "planned",
      label: "legacy_taper",
    },
  ],
};
const reminder = {
  id: "reminder_retatrutide",
  title: "Retatrutide",
  type: "protocol_reminder",
  linkedEntityId: protocol.id,
  active: true,
  schedule: {
    type: "weekly",
    daysOfWeek: ["thursday"],
    timeOfDay: "night",
  },
};
const thursday = new Date("2026-07-30T19:00:00.000Z");
const friday = new Date("2026-07-31T19:00:00.000Z");

describe("Execution-backed Daily Focus composition", () => {
  it("lets Execution win when protocol doseHistory intentionally disagrees", () => {
    const item = priority(focus({
      executionItems: [execution({ timeline: [phase("1")] })],
    }));

    expect(item).toMatchObject({
      id: reminder.id,
      label: "Retatrutide",
      subtitle: "Tonight",
      metadata: "1 mg tonight",
      exactLocalTime: "21:45",
      completable: true,
      completionId: reminder.id,
      protocolId: protocol.id,
      executionId: "execution_retatrutide",
    });
    expect(item.metadata).not.toContain("2 mg");
    expect(item.executionProjection.provenance.currentDose).toBe("execution");
  });

  it("reconciles the saved Support record across due, not-due, and disabled reminder states", () => {
    const supportExecution = execution({
      executionRevision: 4,
      notes: "Use the saved Support conditions.",
      timeline: [{
        startDate: "2026-08-06",
        endDate: null,
        dose: { amount: "0.5", unit: "mg" },
        notes: "",
      }],
    });
    const synchronizedReminder = {
      ...reminder,
      completedAt: "2026-07-30T20:00:00Z",
      completionHistory: [{ date: "2026-07-23", status: "completed" }],
      schedule: {
        type: "weekly_days",
        cadence: "specific_days",
        daysOfWeek: ["thursday"],
        timeOfDay: "21:45",
        startDate: "2026-05-21",
        endDate: null,
      },
    };
    const historyBefore = structuredClone(synchronizedReminder.completionHistory);
    const due = priority(focus({
      executionItems: [supportExecution],
      reminders: [synchronizedReminder],
      now: new Date("2026-08-06T19:00:00.000Z"),
    }));

    expect(due).toMatchObject({
      metadata: "0.5 mg tonight",
      executionId: "execution_retatrutide",
      completionId: reminder.id,
      completable: true,
      exactLocalTime: "21:45",
    });
    expect(JSON.stringify(due)).not.toMatch(/Execution setup required|Missing Execution|2 mg/);
    expect(priority(focus({
      executionItems: [supportExecution],
      reminders: [synchronizedReminder],
      now: new Date("2026-08-07T19:00:00.000Z"),
    }))).toBeUndefined();
    expect(priority(focus({
      executionItems: [supportExecution],
      reminders: [{ ...synchronizedReminder, active: false }],
      now: new Date("2026-08-06T19:00:00.000Z"),
    }))).toBeUndefined();
    expect(synchronizedReminder.completionHistory).toEqual(historyBefore);
  });

  it("shows one non-completable setup item when today has no active phase", () => {
    const items = focus({
      executionItems: [
        execution({
          timeline: [
            {
              ...phase("1.5"),
              startDate: "2026-07-23",
              endDate: "2026-07-29",
            },
          ],
        }),
      ],
    });

    expect(items.filter((item) => item.label === "Retatrutide")).toHaveLength(1);
    expect(priority(items)).toMatchObject({
      id: reminder.id,
      metadata: "Dose schedule needs update",
      changeLabel: "No active phase",
      actionLabel: "Review Execution",
      completable: false,
      href: `/profile/operating-plan/execution/peptides/${protocol.id}`,
    });
    expect(JSON.stringify(priority(items))).not.toMatch(/1 mg tonight|Taper begins today/);
  });

  it("does not let active reminder or protocol taper override inactive Execution", () => {
    expect(
      priority(focus({ executionItems: [execution({ active: false })] }))
    ).toBeUndefined();
  });

  it("returns a dose-free setup item for a known peptide reminder with missing Execution", () => {
    const item = priority(focus({ executionItems: [] }));

    expect(item).toMatchObject({
      id: reminder.id,
      metadata: "Execution setup required",
      changeLabel: "Missing Execution",
      completable: false,
    });
    expect(JSON.stringify(item)).not.toContain("2 mg");
  });

  it("reflects phase edits and removals on fresh composition", () => {
    const configured = execution({ timeline: [phase("1")] });
    expect(priority(focus({ executionItems: [configured] })).metadata).toBe(
      "1 mg tonight"
    );
    configured.timeline[0].dose.amount = "0.5";
    expect(priority(focus({ executionItems: [configured] })).metadata).toBe(
      "0.5 mg tonight"
    );
    configured.timeline = [];
    expect(priority(focus({ executionItems: [configured] }))).toMatchObject({
      metadata: "Dose schedule needs update",
      completable: false,
    });
  });

  it("uses Execution weekday and exact time for occurrence eligibility", () => {
    const configured = execution({
      preferredSchedule: schedule(["friday"], "20:30"),
    });

    expect(priority(focus({ executionItems: [configured] }))).toBeUndefined();
    const item = priority(focus({ executionItems: [configured], now: friday }));
    expect(item).toMatchObject({
      exactLocalTime: "20:30",
      subtitle: "Tonight",
      metadata: "1 mg tonight",
    });
  });

  it("uses canonical phase transitions and never legacy taper labels", () => {
    const item = priority(focus({
      executionItems: [
        execution({
          timeline: [
            {
              ...phase("1"),
              startDate: "2026-07-30",
              notes: "",
            },
          ],
        }),
      ],
    }));

    expect(item.changeLabel).toBe("New phase begins today");
    expect(item.changeLabel).not.toBe("Taper begins today");
  });

  it("uses the same generic branch when Tesamorelin records disagree", () => {
    const tesaProtocol = {
      ...protocol,
      id: "protocol_tesamorelin",
      name: "Tesamorelin",
      dose: { value: 0.5, unit: "mg" },
      doseHistory: [],
    };
    const tesaReminder = {
      ...reminder,
      id: "reminder_tesamorelin",
      title: "Tesamorelin",
      linkedEntityId: tesaProtocol.id,
    };
    const tesaExecution = execution({
      id: "execution_tesamorelin",
      protocolRootId: tesaProtocol.id,
      title: "Tesamorelin",
      preferredSchedule: schedule(["sunday", "monday", "tuesday", "wednesday", "thursday"], "21:45"),
      timeline: [phase("0.75")],
    });
    const item = priority(createDailyFocusService().getDailyFocus({
      checkIns: recentCheckIns,
      executionItems: [tesaExecution],
      now: thursday,
      protocols: [tesaProtocol],
      reminders: [tesaReminder],
      timeZone: "America/Los_Angeles",
    }), "Tesamorelin");

    expect(item).toMatchObject({
      id: tesaReminder.id,
      metadata: "0.75 mg tonight",
      completionId: tesaReminder.id,
    });
    expect(priority(createDailyFocusService().getDailyFocus({
      checkIns: recentCheckIns,
      executionItems: [tesaExecution],
      now: friday,
      protocols: [tesaProtocol],
      reminders: [tesaReminder],
      timeZone: "America/Los_Angeles",
    }), "Tesamorelin")).toBeUndefined();
    expect(priority(createDailyFocusService().getDailyFocus({
      checkIns: recentCheckIns,
      executionItems: [tesaExecution],
      now: thursday,
      protocols: [tesaProtocol],
      reminders: [{ ...tesaReminder, completedAt: "2026-07-30T18:00:00.000Z" }],
      timeZone: "America/Los_Angeles",
    }), "Tesamorelin")).toBeUndefined();
  });

  it("deduplicates two reminder anchors deterministically", () => {
    const duplicate = { ...reminder, id: "z_reminder_retatrutide" };
    const items = focus({
      executionItems: [execution()],
      reminders: [duplicate, reminder],
    });

    expect(items.filter((item) => item.label === "Retatrutide")).toHaveLength(1);
    expect(priority(items).id).toBe(reminder.id);
  });

  it("uses a typed non-completable configuration item when history anchor is missing", () => {
    const item = priority(focus({
      executionItems: [execution()],
      reminders: [],
    }));

    expect(item).toMatchObject({
      metadata: "Completion setup needs update",
      changeLabel: "No history anchor",
      completable: false,
      completionId: null,
    });
  });

  it("does not force supplement Execution into Home without an existing reminder policy", () => {
    const supplementProtocol = {
      id: "protocol_creatine",
      name: "Creatine",
      category: "supplement",
      status: "active",
    };
    const supplementExecution = {
      id: "execution_creatine",
      type: "supplement",
      title: "Creatine",
      protocolRootId: supplementProtocol.id,
      active: true,
      cadence: { type: "daily" },
      preferredSchedule: {
        daysOfWeek: [],
        timeOfDay: "morning",
        startDate: "2026-07-01",
        endDate: null,
      },
      dose: { amount: "5", unit: "g" },
      timeline: [],
    };

    expect(
      createDailyFocusService().getDailyFocus({
        checkIns: recentCheckIns,
        executionItems: [supplementExecution],
        now: thursday,
        protocols: [supplementProtocol],
        reminders: [],
        timeZone: "America/Los_Angeles",
      }).find((item) => item.label === "Creatine")
    ).toBeUndefined();
  });
});

function focus(overrides = {}) {
  return createDailyFocusService().getDailyFocus({
    checkIns: recentCheckIns,
    executionItems: [execution()],
    now: thursday,
    protocols: [protocol],
    reminders: [reminder],
    timeZone: "America/Los_Angeles",
    ...overrides,
  });
}

function priority(items, label = "Retatrutide") {
  return items.find((item) => item.label === label);
}

const recentCheckIns = [
  "2026-07-24",
  "2026-07-25",
  "2026-07-26",
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-30",
].map((date) => ({ date }));

function execution(overrides = {}) {
  return {
    id: "execution_retatrutide",
    type: "peptide",
    title: "Retatrutide",
    protocolRootId: protocol.id,
    active: true,
    cadence: { type: "specific_days" },
    preferredSchedule: schedule(["thursday"], "21:45"),
    timingContext: "fasted_before_bed",
    timeline: [phase("1")],
    ...overrides,
  };
}

function schedule(daysOfWeek, timeOfDay) {
  return {
    daysOfWeek,
    timeOfDay,
    startDate: "2026-05-01",
    endDate: null,
  };
}

function phase(amount) {
  return {
    startDate: "2026-07-01",
    endDate: null,
    dose: { amount, unit: "mg" },
    notes: "",
  };
}
