import { describe, expect, it } from "vitest";
import {
  createRecoveryBriefingAssessmentV1,
  validateRecoveryBriefingAssessmentV1,
} from "./RecoveryBriefingAssessmentServiceV1.js";
import {
  RECOVERY_BRIEFING_SCHEMA_VERSION,
  RECOVERY_STATUS_POLICY_VERSION,
} from "./RecoveryBriefingPolicyV1.js";

const DAY_MS = 86_400_000;
const EVALUATED_AT = "2026-10-12T12:00:00.000Z";

describe("RecoveryBriefingAssessmentServiceV1", () => {
  it("creates a versioned deterministic Green assessment with no commentary", () => {
    const input = weeklyInput({ values: [420, 415, 425, 418, 422, 417, 423] });
    const first = createRecoveryBriefingAssessmentV1(input);
    const second = createRecoveryBriefingAssessmentV1(structuredClone(input));
    expect(first.schemaVersion).toBe(RECOVERY_BRIEFING_SCHEMA_VERSION);
    expect(first.policy.version).toBe(RECOVERY_STATUS_POLICY_VERSION);
    expect(first.status).toEqual({
      state: "green", label: "Green", reasonCodes: ["period_typical"],
    });
    expect(first.commentary).toEqual({ visible: false, headline: null, body: null });
    expect(first.policy).toMatchObject({
      confidenceCoupling: "none",
      foamCanSetStatus: false,
      causalClaimsAllowed: false,
      medicalThresholds: false,
    });
    expect(first.assessmentId).toBe(second.assessmentId);
    expect(first.integrity).toEqual(second.integrity);
    expect(() => validateRecoveryBriefingAssessmentV1(first)).not.toThrow();
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("fails runtime validation when a non-strategic contract guardrail is weakened", () => {
    const valid = createRecoveryBriefingAssessmentV1(weeklyInput());
    for (const mutate of [
      (value) => { value.policy.foamCanEscalateStatus = true; },
      (value) => { value.policy.trainingCanManufactureNonGreenStatus = true; },
      (value) => { value.policy.medicalThresholds = true; },
      (value) => { value.provenance.strategicEligibility = "eligible"; },
      (value) => { value.provenance.persistenceWrites = 1; },
    ]) {
      const changed = structuredClone(valid);
      mutate(changed);
      expect(() => validateRecoveryBriefingAssessmentV1(changed)).toThrow(
        "Invalid Recovery Briefing V1 assessment."
      );
    }
    const mismatchedIdentity = structuredClone(valid);
    mismatchedIdentity.assessmentId = `recovery_briefing_v1|${"0".repeat(64)}`;
    expect(() => validateRecoveryBriefingAssessmentV1(mismatchedIdentity)).toThrow(
      "Recovery Briefing V1 assessment integrity mismatch."
    );
  });

  it("uses exactly the prior 28 nights and excludes the current period from baseline", () => {
    const assessment = createRecoveryBriefingAssessmentV1(weeklyInput({
      baselineValues: Array(28).fill(420),
      values: Array(7).fill(300),
    }));
    expect(assessment.sleep.baseline).toMatchObject({
      lookbackNights: 28,
      usableNights: 28,
      centerMinutes: 420,
      excludesCurrentPeriod: true,
      usesFutureData: false,
    });
    expect(assessment.status.state).toBe("red");
  });

  it("does not look ahead: adding future evidence cannot change a closed period", () => {
    const input = weeklyInput({ values: Array(7).fill(420) });
    const before = createRecoveryBriefingAssessmentV1(input);
    const after = createRecoveryBriefingAssessmentV1({
      ...input,
      sleepEvidence: [
        ...input.sleepEvidence,
        sleep("future", "2026-10-30", 60, { durationReliable: true }),
      ],
    });
    expect(after).toEqual(before);
  });

  it("does not use evidence that became available after the explicit cutoff", () => {
    const input = weeklyInput({ values: Array(7).fill(420) });
    const before = createRecoveryBriefingAssessmentV1(input);
    const after = createRecoveryBriefingAssessmentV1({
      ...input,
      sleepEvidence: [
        ...input.sleepEvidence,
        sleep("late-arrival", "2026-10-05", 60, {
          availableAt: "2026-10-11T00:00:00.000Z",
        }),
      ],
    });
    expect(after).toEqual(before);
  });

  it("requires fourteen usable baseline nights", () => {
    const assessment = createRecoveryBriefingAssessmentV1(weeklyInput({
      baselineValues: Array(13).fill(420),
      values: Array(7).fill(300),
    }));
    expect(assessment.status.state).toBe("unavailable");
    expect(assessment.status.reasonCodes).toContain("insufficient_baseline_nights");
  });

  it("computes median, MAD and the fifteen-minute robust-spread floor deterministically", () => {
    const assessment = createRecoveryBriefingAssessmentV1(weeklyInput({
      baselineValues: Array.from({ length: 28 }, (_, index) => index % 2 ? 410 : 390),
      values: Array(7).fill(400),
    }));
    expect(assessment.sleep.baseline.centerMinutes).toBe(400);
    expect(assessment.sleep.baseline.robustSpreadMinutes).toBe(15);
  });

  it("honors material and severe boundary values", () => {
    const yellow = createRecoveryBriefingAssessmentV1(weeklyInput({
      values: [390, 390, 390, 390, 390, 390, 390],
    }));
    expect(yellow.sleep.periodSummary.materialLowNights).toBe(7);
    expect(yellow.sleep.periodSummary.severeLowNights).toBe(0);
    expect(yellow.status.state).toBe("yellow");
    const severe = createRecoveryBriefingAssessmentV1(weeklyInput({
      values: [345, 345, 345, 345, 345, 345, 345],
    }));
    expect(severe.sleep.periodSummary.severeLowNights).toBe(7);
    expect(severe.status.state).toBe("red");
  });

  it("uses unrounded internal values at the period-average threshold", () => {
    const assessment = createRecoveryBriefingAssessmentV1(weeklyInput({
      values: [389.9, 389.9, 389.9, 390.145, 390.145, 390.145, 390.145],
    }));
    expect(assessment.sleep.periodSummary.materialLowNights).toBe(3);
    expect(assessment.sleep.periodSummary.deltaFromBaselineMinutes).toBe(-30);
    expect(assessment.status.state).toBe("green");
  });

  it("keeps one or two isolated low nights Green", () => {
    const one = createRecoveryBriefingAssessmentV1(weeklyInput({
      values: [420, 380, 420, 420, 420, 420, 420],
    }));
    const two = createRecoveryBriefingAssessmentV1(weeklyInput({
      values: [380, 420, 420, 380, 420, 420, 420],
    }));
    expect(one.status.state).toBe("green");
    expect(two.status.state).toBe("green");
  });

  it("requires Weekly persistence and period-average magnitude for Yellow", () => {
    const noisy = createRecoveryBriefingAssessmentV1(weeklyInput({
      values: [420, 390, 390, 390, 420, 420, 420],
    }));
    const material = createRecoveryBriefingAssessmentV1(weeklyInput({
      values: [420, 375, 375, 375, 375, 375, 420],
    }));
    expect(noisy.sleep.periodSummary.materialLowNights).toBe(3);
    expect(noisy.status.state).toBe("green");
    expect(material.status.state).toBe("yellow");
    expect(material.commentary.visible).toBe(true);
  });

  it("requires Weekly severe count, run and average for sleep-only Red", () => {
    const assessment = createRecoveryBriefingAssessmentV1(weeklyInput({
      values: [300, 300, 300, 300, 300, 420, 420],
    }));
    expect(assessment.status.state).toBe("red");
    expect(assessment.status.reasonCodes).toContain("severe_persistent_low_sleep");
    expect(assessment.corroboration).toEqual([]);
  });

  it("allows training to corroborate already-Yellow severe Sleep without inferring causality", () => {
    const assessment = createRecoveryBriefingAssessmentV1(weeklyInput({
      values: [330, 330, 375, 375, 375, 420, 420],
      training: constrainedTraining(),
    }));
    expect(assessment.status.state).toBe("red");
    expect(assessment.status.reasonCodes).toContain("corroborated_training_constraint");
    expect(assessment.corroboration).toHaveLength(1);
    expect(assessment.corroboration[0].causality).toBe("not_inferred");
    expect(assessment.commentary.body).toContain("causation is not inferred");
  });

  it("does not allow training to manufacture non-Green status from normal Sleep", () => {
    const assessment = createRecoveryBriefingAssessmentV1(weeklyInput({
      values: Array(7).fill(420),
      training: constrainedTraining(),
    }));
    expect(assessment.status.state).toBe("green");
    expect(assessment.corroboration).toEqual([]);
  });

  it("uses only training baselines completed before the Recovery period", () => {
    const training = constrainedTraining();
    training.baselinePeriods = training.baselinePeriods.map((item, index) => ({
      ...item,
      endDate: `2026-10-${String(12 + index).padStart(2, "0")}`,
    }));
    const assessment = createRecoveryBriefingAssessmentV1(weeklyInput({
      values: [330, 330, 375, 375, 375, 420, 420],
      training,
    }));
    expect(assessment.status.state).toBe("yellow");
    expect(assessment.corroboration).toEqual([]);
    expect(assessment.dataLimitations).toContain("training_comparable_baseline_insufficient");
  });

  it("rejects unbounded or invalid training counts as corroboration", () => {
    for (const change of [
      { periodStartDate: "2026-10-03" },
      { completedSessions: -1 },
      { completedSessions: 1.5 },
    ]) {
      const training = constrainedTraining();
      Object.assign(training.current, change);
      const assessment = createRecoveryBriefingAssessmentV1(weeklyInput({
        values: [330, 330, 375, 375, 375, 420, 420],
        training,
      }));
      expect(assessment.status.state).toBe("yellow");
      expect(assessment.corroboration).toEqual([]);
    }
  });

  it("does not claim training held when the supporting context is insufficient", () => {
    const training = heldTraining();
    training.current.evidenceIds = [];
    const assessment = createRecoveryBriefingAssessmentV1(weeklyInput({
      values: [420, 375, 375, 375, 375, 375, 420],
      training,
    }));
    expect(assessment.status.state).toBe("yellow");
    expect(assessment.commentary.body).not.toContain("Training performance held.");
    expect(assessment.dataLimitations).toContain("training_held_evidence_missing");
  });

  it.each(["plannedRest", "deload", "travel", "illness", "injury", "scheduleChange"])(
    "excludes a known %s context from training corroboration",
    (flag) => {
      const training = constrainedTraining();
      training.current.context = { [flag]: true };
      const assessment = createRecoveryBriefingAssessmentV1(weeklyInput({
        values: [330, 330, 375, 375, 375, 420, 420],
        training,
      }));
      expect(assessment.status.state).toBe("yellow");
      expect(assessment.dataLimitations).toContain(`training_context_excluded_${flag}`);
    }
  );

  it("keeps Midweek Red unavailable even when every night is severe", () => {
    const assessment = createRecoveryBriefingAssessmentV1(midweekInput({
      values: [300, 300, 300],
      training: constrainedTraining(),
    }));
    expect(assessment.status.state).toBe("yellow");
    expect(assessment.status.reasonCodes).toEqual(["persistent_low_sleep"]);
  });

  it("requires all three Midweek nights", () => {
    const assessment = createRecoveryBriefingAssessmentV1(midweekInput({ values: [300, 300] }));
    expect(assessment.status.state).toBe("unavailable");
    expect(assessment.status.reasonCodes).toContain("insufficient_period_nights");
  });

  it("applies Monthly Yellow from twelve material-low nights", () => {
    const values = [...Array(12).fill(375), ...Array(19).fill(420)];
    const assessment = createRecoveryBriefingAssessmentV1(monthlyInput({ values }));
    expect(assessment.status.state).toBe("yellow");
    expect(assessment.sleep.trend.granularity).toBe("week");
  });

  it("applies Monthly Yellow from two week-like Yellow subperiods", () => {
    const values = Array(31).fill(420);
    [4, 5, 6, 11, 12, 13].forEach((day) => { values[day - 1] = 350; });
    const assessment = createRecoveryBriefingAssessmentV1(monthlyInput({ values }));
    expect(assessment.sleep.periodSummary.materialLowNights).toBe(6);
    expect(assessment.status.state).toBe("yellow");
  });

  it("applies Monthly sleep-only Red at sixty percent severe plus severe average", () => {
    const values = [...Array(20).fill(300), ...Array(11).fill(420)];
    const assessment = createRecoveryBriefingAssessmentV1(monthlyInput({ values }));
    expect(assessment.status.state).toBe("red");
  });

  it("applies Monthly corroborated Red without requiring the sleep-only extreme", () => {
    const values = [...Array(6).fill(300), ...Array(6).fill(375), ...Array(19).fill(420)];
    const assessment = createRecoveryBriefingAssessmentV1(monthlyInput({
      values,
      training: constrainedTraining({ currentSessions: 4, baselineSessions: 8 }),
    }));
    expect(assessment.status.state).toBe("red");
    expect(assessment.status.reasonCodes).toContain("corroborated_training_constraint");
  });

  it("scales the preceding weekly training baseline to a Monthly expectation", () => {
    const values = [...Array(6).fill(300), ...Array(6).fill(375), ...Array(19).fill(420)];
    const assessment = createRecoveryBriefingAssessmentV1(monthlyInput({
      values,
      training: constrainedTraining({ currentSessions: 15, baselineSessions: 5 }),
    }));
    expect(assessment.status.state).toBe("red");
    expect(assessment.status.reasonCodes).toContain("corroborated_training_constraint");
  });

  it("requires twenty Monthly nights and missing data cannot become Red", () => {
    const assessment = createRecoveryBriefingAssessmentV1(monthlyInput({
      values: Array(19).fill(240),
    }));
    expect(assessment.status.state).toBe("unavailable");
  });

  it("keeps status invariant under arbitrary foam execution changes", () => {
    const base = weeklyInput({ values: [420, 375, 375, 375, 375, 375, 420] });
    const none = createRecoveryBriefingAssessmentV1({ ...base, foamRolling: null });
    const full = createRecoveryBriefingAssessmentV1({
      ...base,
      foamRolling: foam(["completed", "completed", "completed", "completed", "completed", "completed", "completed"]),
    });
    const missed = createRecoveryBriefingAssessmentV1({
      ...base,
      foamRolling: foam(["missed", "missed", "missed", "missed", "missed", "missed", "missed"]),
    });
    expect([none.status.state, full.status.state, missed.status.state]).toEqual([
      "yellow", "yellow", "yellow",
    ]);
    expect(missed.foamRolling).toMatchObject({
      displayRole: "execution_context_only",
      scheduledOccurrences: 7,
      missedOccurrences: 7,
    });
  });

  it("does not invent a pre-schedule foam denominator", () => {
    const input = weeklyInput({ values: Array(7).fill(420) });
    input.foamRolling = {
      scheduleEffectiveFrom: "2026-10-20",
      occurrences: [{
        id: "observed", date: "2026-10-05", status: "completed", authority: "observed_only",
      }],
    };
    const assessment = createRecoveryBriefingAssessmentV1(input);
    expect(assessment.foamRolling).toMatchObject({
      scheduleAuthority: "not_yet_effective",
      scheduledOccurrences: null,
      completedOccurrences: 1,
      missedOccurrences: null,
      state: "observed_only",
    });
  });

  it("does not mix observed-only completions into authoritative foam counts", () => {
    const input = weeklyInput({ values: Array(7).fill(420) });
    input.foamRolling = foam(["completed"]);
    input.foamRolling.occurrences.push({
      id: "observed-extra",
      date: "2026-10-05",
      status: "completed",
      authority: "observed_only",
    });
    const assessment = createRecoveryBriefingAssessmentV1(input);
    expect(assessment.foamRolling).toMatchObject({
      scheduleAuthority: "authoritative",
      scheduledOccurrences: 1,
      completedOccurrences: 1,
    });
    expect(assessment.dataLimitations).toContain(
      "foam_observed_only_completions_excluded_from_authoritative_counts"
    );
  });

  it("rejects impossible calendar dates", () => {
    const input = weeklyInput();
    input.period.startDate = "2026-02-31";
    expect(() => createRecoveryBriefingAssessmentV1(input)).toThrow(
      "period.startDate requires a valid YYYY-MM-DD date."
    );
  });

  it("allows timezone-uncertain evidence only for duration, never clock consistency", () => {
    const input = weeklyInput({ values: Array(7).fill(420) });
    input.sleepEvidence = input.sleepEvidence.map((row) => ({
      ...row,
      timeZoneUncertain: true,
      clockTimeReliable: false,
    }));
    const assessment = createRecoveryBriefingAssessmentV1(input);
    expect(assessment.status.state).toBe("green");
    expect(assessment.sleep.trend.clockMetricsEligible).toBe(false);
    expect(assessment.dataLimitations).toContain(
      "clock_metrics_ineligible_for_timezone_uncertain_sleep"
    );
    expect(JSON.stringify(assessment.sleep)).not.toMatch(/bedtime|wakeTime|midpoint/);
  });

  it("is order-independent and does not mutate inputs", () => {
    const input = weeklyInput({ values: [420, 375, 375, 375, 375, 375, 420] });
    const snapshot = structuredClone(input);
    const forward = createRecoveryBriefingAssessmentV1(input);
    const reversed = createRecoveryBriefingAssessmentV1({
      ...structuredClone(input),
      sleepEvidence: [...input.sleepEvidence].reverse(),
      foamRolling: {
        ...input.foamRolling,
        occurrences: [...input.foamRolling.occurrences].reverse(),
      },
    });
    expect(reversed).toEqual(forward);
    expect(input).toEqual(snapshot);
  });

  it("removing evidence cannot increase certainty", () => {
    const input = weeklyInput({ values: Array(7).fill(420) });
    const full = createRecoveryBriefingAssessmentV1(input);
    const reduced = createRecoveryBriefingAssessmentV1({
      ...input,
      sleepEvidence: input.sleepEvidence.slice(20),
    });
    expect(full.status.state).toBe("green");
    expect(reduced.status.state).toBe("unavailable");
  });

  it("can change inline narrative detail without changing the Sleep-derived status", () => {
    const values = [420, 375, 375, 375, 375, 375, 420];
    const quiet = createRecoveryBriefingAssessmentV1(weeklyInput({ values }));
    const held = createRecoveryBriefingAssessmentV1(weeklyInput({
      values,
      training: heldTraining(),
    }));
    expect(quiet.status).toEqual(held.status);
    expect(held.commentary.body).toContain("Training performance held.");
  });
});

function weeklyInput({
  values = Array(7).fill(420),
  baselineValues = Array(28).fill(420),
  training = null,
} = {}) {
  return makeInput({
    cadence: "weekly",
    startDate: "2026-10-04",
    endDate: "2026-10-10",
    values,
    baselineValues,
    training,
  });
}

function midweekInput({
  values = Array(3).fill(420),
  baselineValues = Array(28).fill(420),
  training = null,
} = {}) {
  return makeInput({
    cadence: "midweek",
    startDate: "2026-10-04",
    endDate: "2026-10-06",
    values,
    baselineValues,
    training,
  });
}

function monthlyInput({
  values = Array(31).fill(420),
  baselineValues = Array(28).fill(420),
  training = null,
} = {}) {
  return makeInput({
    cadence: "monthly",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    values,
    baselineValues,
    training,
  });
}

function makeInput({ cadence, startDate, endDate, values, baselineValues, training }) {
  const baselineDates = dates(shift(startDate, -baselineValues.length), baselineValues.length);
  const periodDates = dates(startDate, values.length);
  return {
    period: { cadence, startDate, endDate, timeZone: "America/Los_Angeles" },
    evidenceCutoff: `${endDate}T23:59:59.000Z`,
    evaluatedAt: EVALUATED_AT,
    sleepEvidence: [
      ...baselineDates.map((date, index) => sleep(`baseline-${index}`, date, baselineValues[index])),
      ...periodDates.map((date, index) => sleep(`period-${index}`, date, values[index])),
    ],
    foamRolling: foam(Array(values.length).fill("completed"), startDate),
    training: training ? {
      ...training,
      current: {
        ...training.current,
        periodStartDate: training.current?.periodStartDate ?? startDate,
        periodEndDate: training.current?.periodEndDate ?? endDate,
      },
    } : null,
  };
}

function sleep(id, sleepDay, totalSleepMinutes, overrides = {}) {
  return {
    id,
    sleepDay,
    totalSleepMinutes,
    durationReliable: true,
    timeZoneUncertain: false,
    clockTimeReliable: true,
    ...overrides,
  };
}

function foam(statuses, startDate = "2026-10-04") {
  return {
    scheduleEffectiveFrom: startDate,
    occurrences: statuses.map((status, index) => ({
      id: `foam-${index}`,
      date: shift(startDate, index),
      status,
      authority: "authoritative",
    })),
  };
}

function constrainedTraining({ currentSessions = 2, baselineSessions = 5 } = {}) {
  return {
    current: {
      completedSessions: currentSessions,
      materialConstraint: true,
      performanceHeld: false,
      temporalRelation: "sleep_precedes_signal",
      evidenceIds: ["training-current"],
      context: {},
    },
    baselinePeriods: Array.from({ length: 4 }, (_, index) => ({
      id: `training-baseline-${index}`,
      endDate: `2026-09-${String(7 + index * 7).padStart(2, "0")}`,
      completedSessions: baselineSessions,
      comparable: true,
      evidenceIds: [`training-baseline-evidence-${index}`],
    })),
  };
}

function heldTraining() {
  const value = constrainedTraining({ currentSessions: 5, baselineSessions: 5 });
  value.current.materialConstraint = false;
  value.current.performanceHeld = true;
  return value;
}

function dates(start, count) {
  return Array.from({ length: count }, (_, index) => shift(start, index));
}

function shift(value, amount) {
  return new Date(Date.parse(`${value}T12:00:00Z`) + amount * DAY_MS)
    .toISOString().slice(0, 10);
}
