import { describe, expect, it } from "vitest";
import {
  ExecutionPriorityOperationalReason,
  ExecutionPriorityOperationalState,
  findExecutionForProtocol,
  formatExecutionDose,
  projectExecutionPriority,
  scheduleAppliesOnDate,
} from "./ExecutionPriorityProjectionService";
import { resolveExecutionPhase } from "./ExecutionPhaseResolver";

const protocol = {
  id: "protocol_shared_peptide",
  userId: "user",
  name: "Shared Peptide",
  category: "peptide",
  status: "active",
  doseHistory: [
    {
      startDate: "2026-07-30",
      endDate: null,
      dose: 2,
      doseUnit: "mg",
    },
  ],
};
const reminder = {
  id: "reminder_shared_peptide",
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

describe("canonical Execution priority projection", () => {
  it("projects active phase, exact schedule, history identity, and field provenance from Execution", () => {
    const result = projectExecutionPriority({
      executionItem: peptideExecution({
        timeline: [phase("2026-07-30", null, "1")],
      }),
      localDate: "2026-07-30",
      protocol,
      reminder,
      timeZone: "America/Los_Angeles",
    });

    expect(result).toMatchObject({
      executionId: "execution_shared_peptide",
      protocolRootId: protocol.id,
      priorityId: reminder.id,
      historyAnchorId: reminder.id,
      executionStatus: "active",
      occurrenceEligible: true,
      exactLocalTime: "21:45",
      timeOfDayLabel: "Tonight",
      currentDose: "1",
      doseUnit: "mg",
      transitionEffectiveToday: true,
      operationalState: ExecutionPriorityOperationalState.ACTIONABLE,
      operationalReason: ExecutionPriorityOperationalReason.ACTIVE_PHASE,
      completable: true,
      provenance: {
        priorityIdentity: "reminder",
        schedule: "execution",
        exactLocalTime: "execution",
        currentDose: "execution",
      },
    });
  });

  it("returns setup-required with no dose when an active peptide has no active phase", () => {
    const result = projectExecutionPriority({
      executionItem: peptideExecution({
        timeline: [phase("2026-07-23", "2026-07-29", "1.5")],
      }),
      localDate: "2026-07-30",
      protocol,
      reminder,
    });

    expect(result).toMatchObject({
      occurrenceEligible: true,
      activePhase: null,
      currentDose: null,
      doseUnit: null,
      operationalState: ExecutionPriorityOperationalState.SETUP_REQUIRED,
      operationalReason:
        ExecutionPriorityOperationalReason.MISSING_ACTIVE_PHASE,
      completable: false,
    });
  });

  it("omits occurrence eligibility when Execution is inactive or scheduled for another day", () => {
    expect(
      projectExecutionPriority({
        executionItem: peptideExecution({ active: false }),
        localDate: "2026-07-30",
        protocol,
        reminder,
      })
    ).toMatchObject({
      occurrenceEligible: false,
      operationalState: ExecutionPriorityOperationalState.INACTIVE,
    });
    expect(
      projectExecutionPriority({
        executionItem: peptideExecution({
          preferredSchedule: schedule(["friday"]),
        }),
        localDate: "2026-07-30",
        protocol,
        reminder,
      })
    ).toMatchObject({
      occurrenceEligible: false,
      operationalState:
        ExecutionPriorityOperationalState.NOT_SCHEDULED_TODAY,
    });
  });

  it("returns a typed, dose-free missing-Execution state only for a scheduled reminder occurrence", () => {
    const scheduled = projectExecutionPriority({
      executionItem: null,
      localDate: "2026-07-30",
      protocol,
      reminder,
    });
    const unscheduled = projectExecutionPriority({
      executionItem: null,
      localDate: "2026-07-31",
      protocol,
      reminder,
    });

    expect(scheduled).toMatchObject({
      occurrenceEligible: true,
      currentDose: null,
      operationalState: ExecutionPriorityOperationalState.MISSING_EXECUTION,
      operationalReason: ExecutionPriorityOperationalReason.MISSING_EXECUTION,
      priorityId: reminder.id,
      completable: false,
    });
    expect(unscheduled.occurrenceEligible).toBe(false);
  });

  it("requires a reminder history anchor before an otherwise valid action becomes completable", () => {
    const result = projectExecutionPriority({
      executionItem: peptideExecution(),
      localDate: "2026-07-30",
      protocol,
      reminder: null,
    });

    expect(result).toMatchObject({
      occurrenceEligible: true,
      operationalState: ExecutionPriorityOperationalState.SETUP_REQUIRED,
      operationalReason:
        ExecutionPriorityOperationalReason.MISSING_HISTORY_ANCHOR,
      historyAnchorId: null,
      completable: false,
    });
    expect(result.priorityId).toContain("execution-priority-execution_shared_peptide");
  });

  it("supports future peptide identities and supplement models without title branches", () => {
    const future = projectExecutionPriority({
      executionItem: peptideExecution({
        id: "execution_future",
        title: "Future Peptide",
      }),
      localDate: "2026-07-30",
      protocol: { ...protocol, name: "Future Peptide" },
      reminder: { ...reminder, id: "future_history" },
    });
    const supplement = projectExecutionPriority({
      executionItem: {
        id: "execution_supplement",
        type: "supplement",
        title: "Creatine",
        protocolRootId: "protocol_creatine",
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
      },
      localDate: "2026-07-30",
      protocol: {
        id: "protocol_creatine",
        name: "Creatine",
        category: "supplement",
      },
      reminder: { id: "reminder_creatine" },
    });

    expect(future.title).toBe("Future Peptide");
    expect(supplement).toMatchObject({
      currentDose: "5",
      doseUnit: "g",
      operationalState: ExecutionPriorityOperationalState.ACTIONABLE,
    });
  });

  it("uses one inclusive phase contract for closed and open-ended phases", () => {
    const execution = peptideExecution({
      timeline: [
        phase("2026-07-23", "2026-07-29", "1.5"),
        phase("2026-07-31", null, "1"),
      ],
    });

    expect(resolveExecutionPhase(execution, "2026-07-29")).toMatchObject({
      current: { dose: { amount: "1.5" } },
      next: { dose: { amount: "1" } },
    });
    expect(resolveExecutionPhase(execution, "2026-07-30").current).toBeNull();
    expect(resolveExecutionPhase(execution, "2026-08-15")).toMatchObject({
      current: { dose: { amount: "1" } },
      next: null,
    });
  });

  it("resolves timezone-local occurrence dates instead of UTC or server-local dates", () => {
    const instant = new Date("2026-07-30T03:00:00.000Z");
    const pacific = projectExecutionPriority({
      executionItem: peptideExecution(),
      now: instant,
      protocol,
      reminder,
      timeZone: "America/Los_Angeles",
    });
    const utc = projectExecutionPriority({
      executionItem: peptideExecution(),
      now: instant,
      protocol,
      reminder,
      timeZone: "UTC",
    });

    expect(pacific.localDate).toBe("2026-07-29");
    expect(pacific.occurrenceEligible).toBe(false);
    expect(utc.localDate).toBe("2026-07-30");
    expect(utc.occurrenceEligible).toBe(true);
  });

  it("matches stable protocolRootId only and reports ambiguity without title fallback", () => {
    const canonical = peptideExecution();
    const wrongRoot = {
      ...canonical,
      id: "same_title_wrong_root",
      protocolRootId: "another_protocol",
    };

    expect(
      findExecutionForProtocol([wrongRoot, canonical], protocol.id)
    ).toMatchObject({ executionItem: canonical, matchCount: 1 });
    expect(
      findExecutionForProtocol(
        [canonical, { ...canonical, id: "duplicate" }],
        protocol.id
      )
    ).toMatchObject({
      executionItem: null,
      matchCount: 2,
      reason: "ambiguous_execution",
    });
  });

  it("keeps formatting operational and does not inspect protocol doseHistory", () => {
    expect(formatExecutionDose({ amount: ".5", unit: "mg" })).toBe("0.5 mg");
    expect(
      scheduleAppliesOnDate(schedule(["thursday"]), "2026-07-30", {
        type: "specific_days",
      })
    ).toBe(true);
    expect(
      scheduleAppliesOnDate(schedule(["friday"]), "2026-07-30", {
        type: "specific_days",
      })
    ).toBe(false);
    expect(projectExecutionPriority.toString()).not.toContain("doseHistory");
  });
});

function peptideExecution(overrides = {}) {
  return {
    id: "execution_shared_peptide",
    userId: "user",
    type: "peptide",
    title: "Shared Peptide",
    protocolRootId: protocol.id,
    active: true,
    cadence: { type: "specific_days" },
    preferredSchedule: schedule(["thursday"]),
    timingContext: "fasted_before_bed",
    timeline: [phase("2026-07-01", null, "1")],
    ...overrides,
  };
}

function schedule(daysOfWeek) {
  return {
    daysOfWeek,
    timeOfDay: "21:45",
    startDate: "2026-05-01",
    endDate: null,
  };
}

function phase(startDate, endDate, amount) {
  return {
    startDate,
    endDate,
    dose: { amount, unit: "mg" },
    notes: "",
  };
}
