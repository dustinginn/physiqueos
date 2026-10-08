import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { projectRecoverySleepInputsV1, RECOVERY_SLEEP_INPUT_POLICY_V1 } from "./RecoveryBriefingSleepInputProjectionV1.js";
import { createRecoveryBriefingAssessmentV1 } from "./RecoveryBriefingAssessmentServiceV1.js";
import {
  OWNER,
  SLEEP_D0,
  canonicalNight,
  canonicalNights,
  datesFrom,
  recoveryActivationRecord,
  recoveryAlgorithmRecord,
  withAmbiguousContinuation,
} from "../../testSupport/recoverySleepSynthetic.js";

// Weekly Oct 18-24 2026 (published Sun Oct 25) is the FIRST Weekly whose
// prior-28-night baseline (Sep 20-Oct 17) can hold >= 14 prospective nights:
// only Oct 2-17 (16 nights) are on/after Sleep D0.
const WEEKLY = Object.freeze({ cadence: "weekly", startDate: "2026-10-18", endDate: "2026-10-24", timeZone: "America/Los_Angeles" });
const WEEKLY_CUTOFF = "2026-10-25T06:59:59.999Z"; // Sat Oct 24 23:59:59.999 PDT
const MONTHLY = Object.freeze({ cadence: "monthly", startDate: "2026-11-01", endDate: "2026-11-30", timeZone: "America/Los_Angeles" });
const MONTHLY_CUTOFF = "2026-12-01T07:59:59.999Z"; // Nov 30 23:59:59.999 PST

function project(sleepDays, overrides = {}) {
  return projectRecoverySleepInputsV1({
    sleepDays,
    activationPolicyRecord: recoveryActivationRecord(),
    algorithmPolicyRecord: recoveryAlgorithmRecord(),
    recoveryEffectiveSleepDay: SLEEP_D0,
    period: WEEKLY,
    evidenceCutoff: WEEKLY_CUTOFF,
    ownerUserId: OWNER,
    ...overrides,
  });
}

function weeklyDays({ baseline = 420, period = 420 } = {}) {
  return [
    ...canonicalNights(SLEEP_D0, Array(16).fill(baseline)),
    ...canonicalNights(WEEKLY.startDate, Array.isArray(period) ? period : Array(7).fill(period)),
  ];
}

function assess(projection, period = WEEKLY, cutoff = WEEKLY_CUTOFF) {
  return createRecoveryBriefingAssessmentV1({
    mode: "publication",
    period,
    evidenceCutoff: cutoff,
    evaluatedAt: "2026-12-01T11:00:00.000Z",
    sleepEvidence: projection.records,
    foamRolling: null,
    training: null,
  });
}

describe("RecoveryBriefingSleepInputProjectionV1", () => {
  it("accounts for every baseline and period sleep day exactly once", () => {
    const result = project(weeklyDays());
    expect(result.status).toBe("projected");
    expect(result.floor).toEqual({
      prospectiveFloor: SLEEP_D0, recoveryEffectiveSleepDay: SLEEP_D0,
      activationEffectiveSleepDay: SLEEP_D0, canonV3EffectiveSleepDay: SLEEP_D0,
    });
    expect(result.windows.baseline).toEqual({ startDate: "2026-09-20", endDate: "2026-10-17", expectedNights: 28 });
    expect(result.ledger.map((item) => item.sleepDay)).toEqual([
      ...datesFrom("2026-09-20", 28), ...datesFrom("2026-10-18", 7),
    ]);
    expect(result.accounting.baseline).toEqual({
      expectedNights: 28, reliableNights: 16, withheldNights: 0, missingNights: 0,
      beforeProspectiveFloorNights: 12, withheldByReason: {},
    });
    expect(result.accounting.period).toMatchObject({ expectedNights: 7, reliableNights: 7 });
    expect(result.records).toHaveLength(23);
    expect(result.strategicEvidenceEligibility).toBe("excluded");
  });

  it("makes the first Weekly with >= 14 reliable prior nights eligible (Green)", () => {
    const assessment = assess(project(weeklyDays()));
    expect(assessment.status.state).toBe("green");
    expect(assessment.sleep.baseline.usableNights).toBe(16);
  });

  it("does not treat elapsed calendar nights as reliable nights", () => {
    const days = weeklyDays().map((day) => {
      if (day.sleepDay === "2026-10-05") return withAmbiguousContinuation(day);
      if (day.sleepDay === "2026-10-06") return { ...day, computedAt: "2026-10-26T15:00:00.000Z" };
      if (day.sleepDay === "2026-10-07") return canonicalNight("2026-10-07", 420, { source: "manual" });
      return day;
    });
    const projection = project(days);
    expect(projection.accounting.baseline).toMatchObject({
      reliableNights: 13,
      withheldNights: 3,
      withheldByReason: {
        ambiguous_revision_continuation: 1, manual_only_source: 1, revised_after_cutoff: 1,
      },
    });
    const assessment = assess(projection);
    expect(assessment.status.state).toBe("unavailable");
    expect(assessment.status.reasonCodes).toContain("insufficient_baseline_nights");
  });

  it("keeps the previous Weekly (Oct 11-17) not eligible: only nine prospective prior nights exist", () => {
    const period = { ...WEEKLY, startDate: "2026-10-11", endDate: "2026-10-17" };
    const projection = project([
      ...canonicalNights(SLEEP_D0, Array(9).fill(420)),
      ...canonicalNights("2026-10-11", Array(7).fill(300)),
    ], { period, evidenceCutoff: "2026-10-18T06:59:59.999Z" });
    expect(projection.accounting.baseline).toMatchObject({ reliableNights: 9, beforeProspectiveFloorNights: 19 });
    expect(assess(projection, period, "2026-10-18T06:59:59.999Z").status.state).toBe("unavailable");
  });

  it("distinguishes missing rows from withheld rows and never borrows other nights", () => {
    const days = weeklyDays().filter((day) => !["2026-10-03", "2026-10-19"].includes(day.sleepDay));
    const projection = project([
      ...days,
      // A night outside both windows can never be borrowed.
      canonicalNight("2026-09-15", 420, { computedAt: "2026-09-15T18:00:00.000Z" }),
      canonicalNight("2026-10-25", 420),
    ]);
    expect(projection.accounting.baseline).toMatchObject({ reliableNights: 15, missingNights: 1 });
    expect(projection.accounting.period).toMatchObject({ reliableNights: 6, missingNights: 1 });
    expect(projection.ledger.find((item) => item.sleepDay === "2026-10-19"))
      .toMatchObject({ state: "missing", reason: "no_canonical_row", canonicalId: null });
    expect(projection.records.map((row) => row.sleepDay)).not.toContain("2026-09-15");
    expect(projection.records.map((row) => row.sleepDay)).not.toContain("2026-10-25");
  });

  it("refuses pre-policy nights by the prospective floor whatever the row says", () => {
    const projection = project([
      ...canonicalNights("2026-09-20", Array(12).fill(420), { computedAt: "2026-10-01T18:00:00.000Z" }),
      ...weeklyDays(),
    ]);
    expect(projection.accounting.baseline).toMatchObject({ reliableNights: 16, beforeProspectiveFloorNights: 12 });
    const later = project(weeklyDays(), { recoveryEffectiveSleepDay: "2026-10-10" });
    expect(later.floor.prospectiveFloor).toBe("2026-10-10");
    expect(later.accounting.baseline).toMatchObject({ reliableNights: 8, beforeProspectiveFloorNights: 20 });
    expect(assess(later).status.state).toBe("unavailable");
  });

  it.each([
    ["duplicate rows for one sleep day", (days) => [...days, { ...days[20] }], "2026-10-22", "duplicate_sleep_day_rows"],
    ["a non-ordinary record id", (days) => swap(days, "2026-10-20", (day) => ({ ...day, id: "custom_2026-10-20" })), "2026-10-20", "not_an_ordinary_canonical_day"],
    ["another owner", (days) => swap(days, "2026-10-20", (day) => ({ ...day, userId: "someone-else" })), "2026-10-20", "owner_mismatch"],
    ["operational provenance", (days) => swap(days, "2026-10-20", () => canonicalNight("2026-10-20", 420, { purpose: "operational" })), "2026-10-20", "provenance_not_prospective"],
    ["conflicting provenance labels", (days) => swap(days, "2026-10-20", (day) => ({ ...day, origin: "operational" })), "2026-10-20", "provenance_not_prospective"],
    ["a sleep-canon-v2 night", (days) => swap(days, "2026-10-20", () => canonicalNight("2026-10-20", 420, { algorithmVersion: "sleep-canon-v2" })), "2026-10-20", "algorithm_not_canon_v3"],
    ["a revision computed after the cutoff", (days) => swap(days, "2026-10-24", (day) => ({ ...day, computedAt: "2026-10-25T09:00:00.000Z", revision: 2 })), "2026-10-24", "revised_after_cutoff"],
    ["an unknown availability instant", (days) => swap(days, "2026-10-20", (day) => ({ ...day, computedAt: null })), "2026-10-20", "availability_unknown"],
    ["an ambiguous revision continuation", (days) => swap(days, "2026-10-20", (day) => withAmbiguousContinuation(day, 2)), "2026-10-20", "ambiguous_revision_continuation"],
    ["a manual-only night", (days) => swap(days, "2026-10-20", () => canonicalNight("2026-10-20", 420, { source: "manual" })), "2026-10-20", "manual_only_source"],
    ["an in-bed-only night", (days) => swap(days, "2026-10-20", () => canonicalNight("2026-10-20", 420, { stage: "inBed" })), "2026-10-20", "no_main_sleep"],
    ["an implausible duration", (days) => swap(days, "2026-10-20", (day) => ({ ...day, mainSleep: { ...day.mainSleep, asleepSeconds: 90_000 } })), "2026-10-20", "duration_implausible"],
    ["an unknown sleep-day window", (days) => swap(days, "2026-10-20", (day) => ({ ...day, windowClosesAt: null })), "2026-10-20", "sleep_day_window_unknown"],
  ])("withholds %s", (_label, mutate, sleepDay, reason) => {
    const projection = project(mutate(weeklyDays()));
    expect(projection.status).toBe("projected");
    expect(projection.ledger.find((item) => item.sleepDay === sleepDay)).toMatchObject({ state: "withheld", reason });
    expect(projection.records.map((row) => row.sleepDay)).not.toContain(sleepDay);
  });

  it("withholds a night whose sleep-day window had not closed at the cutoff", () => {
    const projection = project(weeklyDays(), { evidenceCutoff: "2026-10-24T19:00:00.000Z" });
    expect(projection.ledger.find((item) => item.sleepDay === "2026-10-24"))
      .toMatchObject({ state: "withheld", reason: "sleep_day_window_open_at_cutoff" });
  });

  it("keeps a time-zone-uncertain night for duration only, never clock metrics", () => {
    const projection = project(swap(weeklyDays(), "2026-10-20",
      () => canonicalNight("2026-10-20", 420, { timeZoneSource: "device_at_ingest" })));
    expect(projection.records.find((row) => row.sleepDay === "2026-10-20"))
      .toMatchObject({ durationReliable: true, timeZoneUncertain: true, clockTimeReliable: false });
    expect(assess(projection).sleep.trend.clockMetricsEligible).toBe(false);
  });

  it.each([
    ["historical provenance anywhere in the input", { sleepDays: [...weeklyDays(), { ...canonicalNight("2026-10-20", 420), ingestionPurpose: "historical_evidence_import" }] }, "historical_sleep_categorically_forbidden"],
    ["a disabled Sleep activation policy", { activationPolicyRecord: recoveryActivationRecord({ status: "disabled" }) }, "sleep_activation_policy_not_enabled"],
    ["no canonical-algorithm policy (v2 everywhere)", { algorithmPolicyRecord: null }, "sleep_canon_v3_policy_not_enabled"],
    ["a Midweek period", { period: { cadence: "midweek", startDate: "2026-10-18", endDate: "2026-10-20" } }, "recovery_period_invalid"],
    ["a DEXA event period", { period: { cadence: "dexa_event", startDate: "2026-10-18", endDate: "2026-10-18" } }, "recovery_period_invalid"],
    ["an invalid cutoff", { evidenceCutoff: "later" }, "evidence_cutoff_invalid"],
    ["no Recovery floor", { recoveryEffectiveSleepDay: null }, "recovery_effective_sleep_day_invalid"],
  ])("blocks on %s", (_label, overrides, reason) => {
    const result = project(overrides.sleepDays ?? weeklyDays(), overrides);
    expect(result).toMatchObject({ status: "blocked", blockedReason: reason, records: [] });
  });

  it("is deterministic, order independent and never mutates its input", () => {
    const days = weeklyDays();
    const snapshot = structuredClone(days);
    const forward = project(days);
    const reversed = project([...days].reverse());
    expect(reversed).toEqual(forward);
    expect(days).toEqual(snapshot);
    expect(Object.isFrozen(forward.ledger[0])).toBe(true);
  });

  it("carries no Sleep values in its ledger and never emits V3 evidence objects", () => {
    const projection = project(weeklyDays());
    for (const entry of projection.ledger) {
      expect(Object.keys(entry).sort()).toEqual(["canonicalId", "reason", "revision", "sleepDay", "state", "window"]);
    }
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain("sleep_night");
    expect(serialized).not.toContain("evidence_type");
    expect(serialized).not.toMatch(/"strategic":\s*true/);
    expect(RECOVERY_SLEEP_INPUT_POLICY_V1.prospectivePurposes).toEqual(["validation_only"]);
  });

  it("projects Monthly November against an Oct 4-31 baseline and needs >= 20 period nights", () => {
    const baseline = canonicalNights("2026-10-04", Array(28).fill(420));
    const eligible = project([...baseline, ...canonicalNights("2026-11-01", Array(30).fill(420),
      { computedAt: undefined })], { period: MONTHLY, evidenceCutoff: MONTHLY_CUTOFF });
    expect(eligible.accounting.baseline).toMatchObject({ reliableNights: 28 });
    expect(eligible.accounting.period).toMatchObject({ expectedNights: 30, reliableNights: 30 });
    expect(assess(eligible, MONTHLY, MONTHLY_CUTOFF).status.state).toBe("green");
    const sparse = project([...baseline, ...canonicalNights("2026-11-01",
      Array.from({ length: 30 }, (_, index) => index < 19 ? 300 : null))], { period: MONTHLY, evidenceCutoff: MONTHLY_CUTOFF });
    expect(sparse.accounting.period).toMatchObject({ reliableNights: 19, missingNights: 11 });
    const assessment = assess(sparse, MONTHLY, MONTHLY_CUTOFF);
    expect(assessment.status.state).toBe("unavailable");
    expect(assessment.status.reasonCodes).toEqual(["insufficient_period_nights"]);
  });

  it("proves the October Monthly can never be Recovery-eligible (no prospective baseline)", () => {
    const october = { cadence: "monthly", startDate: "2026-10-01", endDate: "2026-10-31", timeZone: "America/Los_Angeles" };
    const projection = project(canonicalNights(SLEEP_D0, Array(30).fill(420)), {
      period: october, evidenceCutoff: "2026-11-01T06:59:59.999Z",
    });
    expect(projection.accounting.baseline).toMatchObject({ reliableNights: 0, beforeProspectiveFloorNights: 28 });
    expect(assess(projection, october, "2026-11-01T06:59:59.999Z").status.reasonCodes).toContain("insufficient_baseline_nights");
  });

  it("produces Green, Yellow, Red and Not enough data from deterministic synthetic canonical nights", () => {
    const states = {
      green: [420, 415, 425, 418, 422, 417, 423],
      yellow: [420, 375, 375, 375, 375, 375, 420],
      red: [300, 300, 300, 300, 300, 420, 420],
      unavailable: [420, 420, 420, 420, null, null, null],
    };
    for (const [state, period] of Object.entries(states)) {
      const assessment = assess(project(weeklyDays({ period })));
      expect(assessment.status.state).toBe(state);
    }
  });

  it("imports only pure domain Sleep contracts and the Recovery policy", () => {
    const source = fs.readFileSync(new URL("./RecoveryBriefingSleepInputProjectionV1.js", import.meta.url), "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
    expect(imports).toEqual([
      "./HealthKitSleepContract.js",
      "./HealthKitSleepPolicies.js",
      "./RecoveryBriefingPolicyV1.js",
    ]);
    expect(source).not.toMatch(/HealthKitSleepGraduation|StrategicEligibility|Repository|\.put\(|\.list\(|new Date\(\)/);
  });
});

function swap(days, sleepDay, replace) {
  return days.map((day) => day.sleepDay === sleepDay ? replace(day) : day);
}
