import { describe, expect, it, vi } from "vitest";
import { projectRecoveryCardForNativeV1 } from "./RecoveryBriefingPublicationV1.js";
import { createRecoveryBriefingComposerV1 } from "./RecoveryBriefingComposerV1.js";
import { createWeeklyEvidenceWindow, createMonthlyEvidenceWindow } from "./BriefingEvidenceWindowService.js";
import { FOAM_ROLLING_EXECUTION_ID, FOAM_ROLLING_REMINDER_ID } from "./RecoveryExecutionContextProjectionV1.js";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import {
  OWNER,
  SLEEP_D0,
  canonicalNights,
  datesFrom,
  recoveryActivationRecord,
  recoveryAlgorithmRecord,
} from "../../testSupport/recoverySleepSynthetic.js";
import { recoveryAuthorityRecord } from "../../testSupport/recoveryBriefingSynthetic.js";

// Founder-approved Recovery content correction (2026-10-08): the composer
// projects foam and non-escalating training context from the generator's
// already-loaded, read-only canonical snapshot. Synthetic data only.
const LA = "America/Los_Angeles";
const WEEKLY_AT = new Date("2026-10-25T10:00:00.000Z");
const MONTHLY_AT = new Date("2026-12-01T11:00:00.000Z");

function artifactFor(cadence) {
  const at = cadence === "monthly" ? MONTHLY_AT : WEEKLY_AT;
  return {
    id: `${cadence}_artifact`, userId: OWNER, cadence, artifactType: "scheduled", generatedAt: at.toISOString(),
    evidenceWindow: cadence === "monthly"
      ? createMonthlyEvidenceWindow({ now: at, timeZone: LA })
      : createWeeklyEvidenceWindow({ now: at, timeZone: LA }),
    briefing: { version: "x" },
  };
}

function foamReminder(completedDates) {
  return {
    id: FOAM_ROLLING_REMINDER_ID, userId: OWNER, title: "Foam Roll", active: true,
    schedule: { type: "daily", cadence: "daily", interval: 1, unit: "day", daysOfWeek: [], timeOfDay: "17:00" },
    completionHistory: completedDates.map((date) => ({
      id: `${FOAM_ROLLING_REMINDER_ID}:${date}`, occurrenceDate: date, completedAt: `${date}T23:30:00.000Z`,
      satisfactionType: "manual_priority_completion",
    })),
  };
}

function foamExecution(startDate) {
  return { id: FOAM_ROLLING_EXECUTION_ID, userId: OWNER, active: true, cadence: { type: "daily" }, preferredSchedule: { timeOfDay: "17:00", startDate } };
}

function skipCheckIn(date) {
  return {
    id: `daily_check_in_${date.replaceAll("-", "_")}`, userId: OWNER, date,
    reconciliation: [{
      key: `${FOAM_ROLLING_REMINDER_ID}:${date}`, priorityId: FOAM_ROLLING_REMINDER_ID, reminderId: FOAM_ROLLING_REMINDER_ID,
      occurrenceDate: date, status: "skipped", note: null, recordedAt: `${date}T23:45:00.000Z`,
    }],
  };
}

// Resistance training on Mon/Tue/Thu/Fri of every week in the range.
function trainingDays(startDate, count) {
  return datesFrom(startDate, count)
    .filter((date) => [1, 2, 4, 5].includes(new Date(`${date}T12:00:00Z`).getUTCDay()))
    .map((date) => ({
      id: `training_${date}`, userId: OWNER, lastObservedAt: `${date}T17:00:00.000Z`, createdAt: `${date}T18:00:00.000Z`,
      quality: { status: "accepted" },
      payload: { evidence_type: "training", exercises: [{ name: "Squat" }], observed_at: `${date}T17:00:00.000Z` },
    }));
}

function snapshot({ reminders = [], executionItems = [], dailyCheckIns = [], canonicalEvidenceObjects = [] }) {
  const repositories = createSeedRepositories({
    user: { id: OWNER }, goals: [], weightEntries: [], dexaScans: [], protocols: [], milestones: [], analyses: [],
    reminders, executionItems, dailyCheckIns, canonicalEvidenceObjects,
  }, { onChange() { throw new Error("read-only snapshot"); } });
  const reads = { count: 0 };
  for (const [name, method] of [["reminders", "listReminders"], ["executionItems", "listExecutionItems"],
    ["dailyCheckIns", "listCheckIns"], ["canonicalEvidence", "listCanonicalEvidenceObjects"]]) {
    const original = repositories[name][method].bind(repositories[name]);
    repositories[name][method] = (...args) => {
      reads.count += 1;
      return original(...args);
    };
  }
  return { repositories, reads };
}

function composer({ authority = recoveryAuthorityRecord(), sleepDays }) {
  const readSleepInputs = vi.fn(async () => ({
    sleepDays, activationPolicyRecord: recoveryActivationRecord(), algorithmPolicyRecord: recoveryAlgorithmRecord(),
  }));
  return { readSleepInputs, recovery: createRecoveryBriefingComposerV1({ readAuthorityRecord: async () => authority, readSleepInputs }) };
}

describe("Recovery card execution context (Founder content correction 2026-10-08)", () => {
  it("Monthly reproduces the locked content: editorial title, titled block, training sentence, 18 of 22 · 3 excused · 1 missed", async () => {
    // November 2026: weeks Nov 15-21 and Nov 22-28 materially below a 7h baseline.
    const november = Array(30).fill(420).map((value, index) => index >= 14 && index < 28 ? 370 : value);
    const sleepDays = [...canonicalNights("2026-10-04", Array(28).fill(420)), ...canonicalNights("2026-11-01", november)];
    const scheduled = datesFrom("2026-11-09", 22);
    const excused = scheduled.slice(4, 7);
    const missed = scheduled[12];
    const { repositories } = snapshot({
      reminders: [foamReminder(scheduled.filter((date) => !excused.includes(date) && date !== missed))],
      executionItems: [foamExecution("2026-11-09")],
      dailyCheckIns: excused.map(skipCheckIn),
      canonicalEvidenceObjects: trainingDays("2026-10-04", 58),
    });
    const { recovery } = composer({ sleepDays });
    const { artifact, decision } = await recovery.composeForNewArtifact({ cadence: "monthly", artifact: artifactFor("monthly"), repositories });
    expect(decision.reason).toBe("recovery_card_published");
    const card = projectRecoveryCardForNativeV1(artifact);
    expect(card.status.state).toBe("yellow");
    expect(card.commentary).toEqual({
      visible: true,
      headline: "Sleep softened across the second half",
      title: "A multi-week shift",
      body: "Two completed weeks were meaningfully below your prior 28-night baseline. No downstream training constraint was established.",
    });
    expect(card.foamRolling).toEqual({
      state: "mixed", scheduledOccurrences: 22, completedOccurrences: 18, missedOccurrences: 1, excusedOccurrences: 3,
    });
    // No Confidence/strategic coupling and no corroboration on a published card.
    expect(artifact.briefing.recoveryAssessment.isolation.confidenceCoupling).toBe("none");
    expect(artifact.briefing.recoveryAssessment.assessment.corroboration).toEqual([]);
  });

  it("Weekly Green carries the foam row (4 of 7 · three misses) and no commentary", async () => {
    const sleepDays = [...canonicalNights(SLEEP_D0, Array(16).fill(420)), ...canonicalNights("2026-10-18", Array(7).fill(420))];
    const { repositories } = snapshot({
      reminders: [foamReminder(["2026-10-18", "2026-10-20", "2026-10-21", "2026-10-24"])],
      executionItems: [foamExecution("2026-09-15")],
    });
    const { recovery } = composer({ sleepDays });
    const { artifact } = await recovery.composeForNewArtifact({ cadence: "weekly", artifact: artifactFor("weekly"), repositories });
    const card = projectRecoveryCardForNativeV1(artifact);
    expect(card.status.state).toBe("green");
    expect(card.commentary).toEqual({ visible: false, headline: null, title: null, body: null });
    expect(card.foamRolling).toEqual({
      state: "mixed", scheduledOccurrences: 7, completedOccurrences: 4, missedOccurrences: 3, excusedOccurrences: 0,
    });
  });

  it("foam never changes the status: the same Sleep with full or zero foam is identical apart from the row", async () => {
    const sleepDays = [...canonicalNights(SLEEP_D0, Array(16).fill(420)), ...canonicalNights("2026-10-18", [330, 330, 375, 375, 375, 420, 420])];
    const statusFor = async (completed) => {
      const { repositories } = snapshot({ reminders: [foamReminder(completed)], executionItems: [foamExecution("2026-09-15")] });
      const { artifact } = await composer({ sleepDays }).recovery.composeForNewArtifact({ cadence: "weekly", artifact: artifactFor("weekly"), repositories });
      return projectRecoveryCardForNativeV1(artifact);
    };
    const full = await statusFor(datesFrom("2026-10-18", 7));
    const none = await statusFor([]);
    expect(none.status).toEqual(full.status);
    expect(none.commentary).toEqual(full.commentary);
    expect([full.foamRolling.completedOccurrences, none.foamRolling.completedOccurrences]).toEqual([7, 0]);
  });

  it("without a snapshot the card is composed from Sleep alone (row hidden), exactly as before", async () => {
    const sleepDays = [...canonicalNights(SLEEP_D0, Array(16).fill(420)), ...canonicalNights("2026-10-18", Array(7).fill(420))];
    const { artifact } = await composer({ sleepDays }).recovery.composeForNewArtifact({ cadence: "weekly", artifact: artifactFor("weekly") });
    expect(projectRecoveryCardForNativeV1(artifact).foamRolling.state).toBe("unavailable");
  });

  it("authority absent = OFF: zero Sleep reads and zero snapshot reads; Midweek never reads either", async () => {
    const { repositories, reads } = snapshot({ reminders: [foamReminder([])], executionItems: [foamExecution("2026-09-15")] });
    const off = composer({ authority: null, sleepDays: [] });
    const weekly = artifactFor("weekly");
    const result = await off.recovery.composeForNewArtifact({ cadence: "weekly", artifact: weekly, repositories });
    expect(result.artifact).toBe(weekly);
    const midweek = { ...artifactFor("weekly"), cadence: "midweek" };
    const on = composer({ sleepDays: [] });
    expect((await on.recovery.composeForNewArtifact({ cadence: "midweek", artifact: midweek, repositories })).artifact).toBe(midweek);
    expect(off.readSleepInputs).not.toHaveBeenCalled();
    expect(on.readSleepInputs).not.toHaveBeenCalled();
    expect(reads.count).toBe(0);
  });

  it("a period before the publication effective date never reads the snapshot (no backfill)", async () => {
    const { repositories, reads } = snapshot({ reminders: [foamReminder([])] });
    const early = { ...artifactFor("weekly"), evidenceWindow: { ...artifactFor("weekly").evidenceWindow, startDate: "2026-10-11", endDate: "2026-10-17" } };
    const { recovery, readSleepInputs } = composer({ sleepDays: [] });
    const result = await recovery.composeForNewArtifact({ cadence: "weekly", artifact: early, repositories });
    expect(result.artifact).toBe(early);
    expect(readSleepInputs).not.toHaveBeenCalled();
    expect(reads.count).toBe(0);
  });
});
