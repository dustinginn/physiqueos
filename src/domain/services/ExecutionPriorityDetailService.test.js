import { describe, expect, it } from "vitest";
import { createDailyFocusService } from "./DailyFocusService";
import { resolveExecutionPhase } from "./ExecutionPhaseResolver";
import { createPriorityDetailService } from "./PriorityDetailService";

describe("Execution-backed priority detail", () => {
  it("uses the same canonical Execution dose and exact schedule as Home", async () => {
    const detail = await service({
      executionItems: [execution({ timeline: [phase("0.75")], notes: "Use the saved conditions." })],
      protocol: {
        ...protocol,
        dose: { value: 0.5, unit: "mg" },
      },
    }).getPriorityDetail(reminder.id);

    expect(detail).toMatchObject({
      id: reminder.id,
      title: "Shared Peptide",
      subtitle: "Tonight",
      status: "Open",
      completable: true,
      completionContext: {
        occurrenceDate: "2026-07-30",
        dose: "0.75 mg",
        protocolId: protocol.id,
      },
      executionProjection: {
        executionId: "execution_shared",
        currentDose: "0.75",
        exactLocalTime: "21:45",
      },
    });
    expect(section(detail, "When").items[0].label).toBe("Thu · 9:45 PM");
    expect(section(detail, "Dose").items[0]).toMatchObject({
      label: "0.75 mg",
      detail: "2026-07-01 – Until changed",
    });
    expect(JSON.stringify(detail)).not.toContain("0.5 mg");
    expect(section(detail, "Execution Notes").items[0].detail).toBe("Use the saved conditions.");
  });

  it("shows setup-required detail with no completion action or legacy dose", async () => {
    const detail = await service({
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
      protocol: {
        ...protocol,
        doseHistory: [
          {
            startDate: "2026-07-30",
            endDate: null,
            dose: 1,
            doseUnit: "mg",
          },
        ],
      },
    }).getPriorityDetail(reminder.id);

    expect(detail).toMatchObject({
      status: "Setup required",
      completable: false,
      completionContext: null,
      action: {
        label: "Review Execution",
        href: `/profile/operating-plan/execution/peptides/${protocol.id}`,
      },
    });
    expect(section(detail, "What").items[0].label).toBe(
      "Dose schedule needs update"
    );
    expect(section(detail, "Dose").items[0]).toEqual({
      label: "No dose scheduled",
      detail: "No active phase",
    });
    expect(JSON.stringify(detail)).not.toContain("1 mg");
  });

  it("returns missing-Execution setup detail without reading protocol doseHistory", async () => {
    const detail = await service({
      executionItems: [],
      protocol: {
        ...protocol,
        doseHistory: [
          {
            startDate: "2026-07-30",
            endDate: null,
            dose: 2,
            doseUnit: "mg",
          },
        ],
      },
    }).getPriorityDetail(reminder.id);

    expect(detail).toMatchObject({
      status: "Setup required",
      completable: false,
      action: { label: "Review Execution" },
      executionProjection: {
        executionStatus: "missing",
        currentDose: null,
      },
    });
    expect(JSON.stringify(detail)).not.toContain("2 mg");
  });

  it("keeps Home, priority detail, and the Execution resolver on one phase answer", async () => {
    const canonicalExecution = execution({
      timeline: [phase("0.75")],
    });
    const home = createDailyFocusService().getDailyFocus({
      checkIns: [
        { date: "2026-07-24" },
        { date: "2026-07-25" },
        { date: "2026-07-26" },
        { date: "2026-07-27" },
      ],
      executionItems: [canonicalExecution],
      now: new Date("2026-07-30T19:00:00.000Z"),
      protocols: [protocol],
      reminders: [reminder],
      timeZone: "America/Los_Angeles",
    });
    const homePriority = home.find((item) => item.id === reminder.id);
    const detail = await service({
      executionItems: [canonicalExecution],
      protocol,
    }).getPriorityDetail(reminder.id);
    const executionPhase = resolveExecutionPhase(
      canonicalExecution,
      "2026-07-30"
    );

    expect(homePriority.metadata).toBe("0.75 mg tonight");
    expect(detail.completionContext.dose).toBe("0.75 mg");
    expect(executionPhase.current.dose).toEqual({
      amount: "0.75",
      unit: "mg",
    });
  });
});

function service({ executionItems, protocol: protocolRecord }) {
  const repositories = {
    users: {
      getCurrentUser: async () => ({
        id: "user",
        timeZone: "America/Los_Angeles",
      }),
    },
    goals: {
      listGoals: async () => [],
    },
    reminders: {
      getReminderById: async () => reminder,
    },
    protocols: {
      listProtocols: async () => [protocolRecord],
    },
    executionItems: {
      listExecutionItems: async () => executionItems,
    },
  };

  return createPriorityDetailService({
    repositories,
    now: () => new Date("2026-07-30T19:00:00.000Z"),
  });
}

function section(detail, title) {
  return detail.sections.find((item) => item.title === title);
}

const protocol = {
  id: "protocol_shared",
  userId: "user",
  name: "Shared Peptide",
  category: "peptide",
  status: "active",
  currentGoalIds: [],
  relatedGoalIds: [],
};

const reminder = {
  id: "reminder_shared",
  title: "Shared Peptide",
  type: "protocol_reminder",
  linkedEntityId: protocol.id,
  active: true,
  schedule: {
    type: "weekly",
    daysOfWeek: ["thursday"],
    timeOfDay: "night",
  },
};

function execution(overrides = {}) {
  return {
    id: "execution_shared",
    type: "peptide",
    title: "Shared Peptide",
    protocolRootId: protocol.id,
    active: true,
    cadence: { type: "specific_days" },
    preferredSchedule: {
      daysOfWeek: ["thursday"],
      timeOfDay: "21:45",
      startDate: "2026-05-01",
      endDate: null,
    },
    timingContext: "fasted_before_bed",
    timeline: [phase("1")],
    ...overrides,
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
