import { describe, expect, it } from "vitest";
import {
  FOAM_ROLLING_EXECUTION_ID,
  FOAM_ROLLING_REMINDER_ID,
  projectRecoveryFoamContextV1,
  projectRecoveryTrainingContextV1,
} from "./RecoveryExecutionContextProjectionV1.js";

// Synthetic canonical shapes only (no Founder data): the reminder, execution
// item and dated reconciliation check-ins exactly as the production writers
// create them (ReminderRepository.completeReminder, priority.skip.v1,
// MorningPriorityReconciliationService).
const LA = "America/Los_Angeles";
const WEEK = { cadence: "weekly", startDate: "2026-10-18", endDate: "2026-10-24", timeZone: LA };
// End of Sat Oct 24 in Los Angeles.
const WEEK_CUTOFF = "2026-10-25T06:59:59.999Z";
const NOVEMBER = { cadence: "monthly", startDate: "2026-11-01", endDate: "2026-11-30", timeZone: LA };
const NOVEMBER_CUTOFF = "2026-12-01T07:59:59.999Z";

function reminder({ completions = [], schedule = {}, active = true, ...rest } = {}) {
  return {
    id: FOAM_ROLLING_REMINDER_ID,
    userId: "owner",
    active,
    schedule: { type: "daily", cadence: "daily", interval: 1, unit: "day", daysOfWeek: [], timeOfDay: "17:00", ...schedule },
    completionHistory: completions.map((date) => ({
      id: `${FOAM_ROLLING_REMINDER_ID}:${date}`,
      occurrenceDate: date,
      completedAt: `${date}T23:30:00.000Z`,
      satisfactionType: "manual_priority_completion",
    })),
    ...rest,
  };
}

function execution(startDate, extra = {}) {
  return {
    id: FOAM_ROLLING_EXECUTION_ID,
    userId: "owner",
    active: true,
    cadence: { type: "daily" },
    preferredSchedule: { timeOfDay: "17:00", startDate, ...extra },
  };
}

function checkIn(date, entries) {
  return {
    id: `daily_check_in_${date.replaceAll("-", "_")}`,
    userId: "owner",
    date,
    reconciliation: entries.map(({ status, recordedAt = `${date}T23:45:00.000Z`, occurrenceDate = date, id = FOAM_ROLLING_REMINDER_ID }) => ({
      key: `${id}:${occurrenceDate}`, priorityId: id, reminderId: id, occurrenceDate, status, note: null, recordedAt,
    })),
  };
}

const skip = (date, extra = {}) => checkIn(date, [{ status: "skipped", ...extra }]);

function project({ reminders, executionItems = [execution("2026-09-15")], dailyCheckIns = [], period = WEEK, cutoff = WEEK_CUTOFF } = {}) {
  return projectRecoveryFoamContextV1({ reminders, executionItems, dailyCheckIns, period, evidenceCutoff: cutoff });
}

const statuses = (projection) => Object.fromEntries(projection.foamRolling.occurrences.map((item) => [item.date, item.status]));

describe("RecoveryFoamContextProjectionV1", () => {
  it("counts exact completed / excused / missed occurrences for a closed week", () => {
    const result = project({
      reminders: [reminder({ completions: ["2026-10-18", "2026-10-19", "2026-10-21", "2026-10-24"] })],
      dailyCheckIns: [skip("2026-10-22")],
    });
    expect(result.foamRolling.scheduleEffectiveFrom).toBe("2026-09-15");
    expect(result.accounting).toMatchObject({ scheduled: 7, completed: 4, excused: 1, missed: 2 });
    expect(statuses(result)).toEqual({
      "2026-10-18": "completed", "2026-10-19": "completed", "2026-10-20": "missed", "2026-10-21": "completed",
      "2026-10-22": "excused", "2026-10-23": "missed", "2026-10-24": "completed",
    });
    expect(result.foamRolling.occurrences.every((item) => item.authority === "authoritative")).toBe(true);
  });

  it("keeps exactly one disposition per date: duplicates collapse, completed > excused > missed", () => {
    const base = reminder({ completions: ["2026-10-18", "2026-10-19"] });
    base.completionHistory.push({ ...base.completionHistory[0], id: "duplicate" });
    const result = project({
      reminders: [base],
      dailyCheckIns: [
        // A Skip and a completion for the same day: the completion wins.
        checkIn("2026-10-19", [{ status: "skipped" }]),
        // The same Skip written twice (Home Skip, then Morning Check-In).
        skip("2026-10-20"),
        checkIn("2026-10-21", [{ status: "skipped", occurrenceDate: "2026-10-20" }]),
        // A Morning Check-In note is not an explicit Skip.
        checkIn("2026-10-23", [{ status: "note" }]),
      ],
    });
    expect(statuses(result)).toMatchObject({
      "2026-10-18": "completed", "2026-10-19": "completed", "2026-10-20": "excused", "2026-10-23": "missed",
    });
    expect(result.foamRolling.occurrences).toHaveLength(7);
    expect(result.accounting).toMatchObject({ scheduled: 7, completed: 2, excused: 1, missed: 4 });
  });

  it("never creates a pre-schedule denominator", () => {
    const result = project({ reminders: [reminder()], executionItems: [execution("2026-10-21")] });
    expect(result.foamRolling.scheduleEffectiveFrom).toBe("2026-10-21");
    expect(Object.keys(statuses(result))).toEqual(["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
    expect(result.accounting).toMatchObject({ scheduled: 4, preSchedule: 3 });
  });

  it("derives the effective date from the canonical schedule, never a constant", () => {
    for (const startDate of ["2026-09-15", "2026-10-20", "2026-10-24"]) {
      const result = project({ reminders: [reminder()], executionItems: [execution(startDate)] });
      expect(result.foamRolling.scheduleEffectiveFrom).toBe(startDate);
      expect(result.foamRolling.occurrences[0].date).toBe(startDate > WEEK.startDate ? startDate : WEEK.startDate);
    }
    // Reminder-only schedule authority (no execution item start).
    const reminderOnly = project({ reminders: [reminder({ schedule: { startDate: "2026-10-23" } })], executionItems: [] });
    expect(reminderOnly.foamRolling.scheduleEffectiveFrom).toBe("2026-10-23");
  });

  it("reports a schedule that starts after the period without inventing occurrences", () => {
    const result = project({ reminders: [reminder()], executionItems: [execution("2026-11-02")] });
    expect(result.foamRolling).toEqual({ scheduleEffectiveFrom: "2026-11-02", occurrences: [] });
  });

  it("without schedule authority shows observed completions only (no denominator)", () => {
    const result = project({
      reminders: [reminder({ completions: ["2026-10-19", "2026-10-20"] })],
      executionItems: [{ id: FOAM_ROLLING_EXECUTION_ID, active: true, preferredSchedule: {} }],
    });
    expect(result.foamRolling.scheduleEffectiveFrom).toBeNull();
    expect(result.foamRolling.occurrences.map((item) => [item.date, item.authority]))
      .toEqual([["2026-10-19", "observed_only"], ["2026-10-20", "observed_only"]]);
    expect(result.limitations).toContain("foam_schedule_effective_date_unavailable");
    expect(result.accounting).toBeNull();
  });

  it("returns no foam context when the reminder is absent, and none for an inactive schedule", () => {
    expect(project({ reminders: [] })).toMatchObject({ foamRolling: null, limitations: ["foam_reminder_absent"] });
    const inactive = project({ reminders: [reminder({ active: false, completions: ["2026-10-19"] })] });
    expect(inactive.foamRolling.scheduleEffectiveFrom).toBeNull();
    expect(inactive.limitations).toContain("foam_schedule_inactive");
  });

  it("ignores Skips and completions recorded after the generation cutoff (no lookahead)", () => {
    const late = "2026-10-25T16:00:00.000Z";
    const lateCompletion = reminder({ completions: ["2026-10-18"] });
    lateCompletion.completionHistory.push({
      id: `${FOAM_ROLLING_REMINDER_ID}:2026-10-24`, occurrenceDate: "2026-10-24", completedAt: late,
    });
    // The Morning Check-In writes a backdated naive 20:00 completedAt; its
    // real recording instant is the reconciliation entry's.
    lateCompletion.completionHistory.push({
      id: `${FOAM_ROLLING_REMINDER_ID}:2026-10-23`, occurrenceDate: "2026-10-23",
      completedAt: "2026-10-23T20:00:00", satisfactionType: "morning_check_in_reconciliation",
    });
    const result = project({
      reminders: [lateCompletion],
      dailyCheckIns: [
        skip("2026-10-22", { recordedAt: late }),
        checkIn("2026-10-23", [{ status: "completed", recordedAt: late }]),
      ],
    });
    expect(statuses(result)).toMatchObject({
      "2026-10-18": "completed", "2026-10-22": "missed", "2026-10-23": "missed", "2026-10-24": "missed",
    });
    // The same Morning completion recorded before the cutoff counts.
    const onTime = project({
      reminders: [lateCompletion],
      dailyCheckIns: [checkIn("2026-10-23", [{ status: "completed", recordedAt: "2026-10-24T15:00:00.000Z" }])],
    });
    expect(statuses(onTime)["2026-10-23"]).toBe("completed");
  });

  it("takes a day with undatable evidence out of the denominator instead of guessing", () => {
    const result = project({
      reminders: [reminder()],
      dailyCheckIns: [skip("2026-10-20", { recordedAt: null })],
    });
    expect(statuses(result)["2026-10-20"]).toBeUndefined();
    expect(result.accounting).toMatchObject({ scheduled: 6, unverifiable: 1 });
    expect(result.limitations).toContain("foam_evidence_time_unknown_occurrence_excluded");
  });

  it("an empty period is all missed against the schedule; paused days are not scheduled", () => {
    expect(project({ reminders: [reminder()] }).accounting).toMatchObject({ scheduled: 7, missed: 7, completed: 0 });
    const paused = project({
      reminders: [reminder()],
      executionItems: [{
        ...execution("2026-09-15"), scheduleSuspensions: [{ pausedFrom: "2026-10-20", resumedOn: "2026-10-23" }],
      }],
    });
    expect(Object.keys(statuses(paused))).toEqual(["2026-10-18", "2026-10-19", "2026-10-23", "2026-10-24"]);
    expect(paused.accounting).toMatchObject({ scheduled: 4, paused: 3 });
  });

  it("supports specific-weekday schedules", () => {
    const result = project({
      reminders: [reminder({ schedule: { type: "weekly_days", cadence: "specific_days", daysOfWeek: ["monday", "wednesday", "friday"] } })],
    });
    expect(Object.keys(statuses(result))).toEqual(["2026-10-19", "2026-10-21", "2026-10-23"]);
  });

  it("projects a partial month from a mid-month schedule start (locked 18 of 22 · 3 excused · 1 missed)", () => {
    const days = Array.from({ length: 22 }, (_, index) => `2026-11-${String(9 + index).padStart(2, "0")}`);
    const excused = days.slice(4, 7);
    const missed = days[12];
    const completed = days.filter((date) => !excused.includes(date) && date !== missed);
    const result = project({
      period: NOVEMBER,
      cutoff: NOVEMBER_CUTOFF,
      reminders: [reminder({ completions: completed })],
      executionItems: [execution("2026-11-09")],
      dailyCheckIns: excused.map((date) => skip(date)),
    });
    expect(result.accounting).toMatchObject({ scheduled: 22, completed: 18, excused: 3, missed: 1, preSchedule: 8 });
  });

  it("is pure: it never mutates its inputs", () => {
    const input = {
      reminders: [reminder({ completions: ["2026-10-18"] })],
      executionItems: [execution("2026-09-15")],
      dailyCheckIns: [skip("2026-10-19")],
    };
    const before = JSON.stringify(input);
    project(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

function session(date, { cardio = false, superseded = false, createdAt = `${date}T18:00:00.000Z` } = {}) {
  return {
    id: `training_${date}${cardio ? "_cardio" : ""}`,
    userId: "owner",
    lastObservedAt: `${date}T17:00:00.000Z`,
    createdAt,
    quality: superseded ? { status: "superseded" } : { status: "accepted" },
    payload: cardio
      ? { evidence_type: "training", exercises: [], metadata: { activity_type: "walking" }, observed_at: `${date}T17:00:00.000Z` }
      : { evidence_type: "training", exercises: [{ name: "Squat" }], observed_at: `${date}T17:00:00.000Z` },
  };
}

describe("RecoveryTrainingContextProjectionV1", () => {
  it("counts resistance-training days in the period and the four preceding weeks, never asserting a constraint", () => {
    const evidence = [
      ...["2026-09-21", "2026-09-23", "2026-09-25", "2026-09-28", "2026-09-30", "2026-10-02", "2026-10-05",
        "2026-10-07", "2026-10-09", "2026-10-12", "2026-10-14", "2026-10-16"].map((date) => session(date)),
      session("2026-10-19"), session("2026-10-21"), session("2026-10-21"),
      session("2026-10-22", { cardio: true }), session("2026-10-23", { superseded: true }),
      session("2026-10-24", { createdAt: "2026-10-26T12:00:00.000Z" }),
    ];
    const result = projectRecoveryTrainingContextV1({ canonicalEvidenceObjects: evidence, period: WEEK, evidenceCutoff: WEEK_CUTOFF });
    expect(result.current).toMatchObject({
      periodStartDate: "2026-10-18", periodEndDate: "2026-10-24", completedSessions: 2,
      materialConstraint: false, performanceHeld: false, temporalRelation: null,
    });
    expect(result.baselinePeriods.map((item) => [item.startDate, item.completedSessions]))
      .toEqual([["2026-09-20", 3], ["2026-09-27", 3], ["2026-10-04", 3], ["2026-10-11", 3]]);
  });

  it("returns null without canonical training evidence", () => {
    expect(projectRecoveryTrainingContextV1({ canonicalEvidenceObjects: [], period: WEEK, evidenceCutoff: WEEK_CUTOFF })).toBeNull();
  });
});
