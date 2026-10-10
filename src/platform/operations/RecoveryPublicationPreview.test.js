import { describe, expect, it } from "vitest";
import { checkRecoveryNativeCardContractV1, runRecoveryPublicationPreview } from "./RecoveryPublicationPreview.js";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import { RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID } from "../database/RecoverySleepInputReaderV1.js";
import { FOAM_ROLLING_EXECUTION_ID, FOAM_ROLLING_REMINDER_ID } from "../../domain/services/RecoveryExecutionContextProjectionV1.js";
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
import { recoveryAuthorityRecord } from "../../testSupport/recoveryBriefingSynthetic.js";

// Synthetic data only. Mirrors the audited production shape: Sleep D0 Oct 2,
// one ambiguous-continuation night (Oct 7), authority absent.
const WEEK = { cadence: "weekly", startDate: "2026-10-18", endDate: "2026-10-24" };
const AT_OCT10 = new Date("2026-10-10T05:30:00.000Z");      // Fri Oct 9 22:30 PDT
const AT_CHECKPOINT = new Date("2026-10-18T03:00:00.000Z"); // Sat Oct 17 20:00 PDT
const AT_SAT_EVENING = new Date("2026-10-25T03:00:00.000Z"); // Sat Oct 24 20:00 PDT
const AT_SAT_NOON = new Date("2026-10-24T19:00:00.000Z");   // Sat Oct 24 12:00 PDT
const AT_SUNDAY = new Date("2026-10-25T09:00:00.000Z");     // Sun Oct 25 02:00 PDT, before the tick

function sleepRows({ through = "2026-10-24", ambiguous = ["2026-10-07"], missing = [], minutes = () => 420 } = {}) {
  const dates = datesFrom(SLEEP_D0, Math.round((Date.parse(`${through}T12:00:00Z`) - Date.parse(`${SLEEP_D0}T12:00:00Z`)) / 86_400_000) + 1);
  return dates.filter((date) => !missing.includes(date)).map((date) => {
    const night = canonicalNight(date, minutes(date), { computedAt: `${date}T14:00:00.000Z` });
    return ambiguous.includes(date) ? withAmbiguousContinuation(night, 79) : night;
  });
}

function storeWith({ sleepDays = sleepRows(), authority = null, reminders = [], executionItems = [], dailyCheckIns = [], canonicalEvidenceObjects = [] } = {}) {
  const store = createInMemoryCanonicalRecordStore({
    healthKitConfiguration: [
      { ...recoveryActivationRecord(), id: "healthkit_sleep_canonical_activation_policy" },
      { ...recoveryAlgorithmRecord(), id: "healthkit_sleep_canonical_algorithm_policy" },
      ...(authority ? [{ ...authority, id: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID }] : []),
    ],
    reminders, executionItems, dailyCheckIns, canonicalEvidenceObjects,
  });
  const reads = [];
  // Read-only facade: production's occurrence-date index, by sleep day. Any write throws.
  const records = Object.freeze({
    get: (input) => { reads.push(input.collection); return store.get(input); },
    list: (input) => { reads.push(input.collection); return store.list(input); },
    listByOccurrenceDateRange: async ({ collection, startDate, endDate }) => {
      reads.push(collection);
      if (collection !== "healthKitSleepDays") return [];
      return sleepDays.filter((day) => day.sleepDay >= startDate && day.sleepDay <= endDate).map((day) => structuredClone(day));
    },
  });
  return { records, reads };
}

const preview = (records, at, request = {}) => runRecoveryPublicationPreview({
  records, ownerUserId: OWNER, kind: "preview", ...WEEK, ...request, now: () => at,
});
const checkpoint = (records, at, request = {}) => runRecoveryPublicationPreview({
  records, ownerUserId: OWNER, kind: "checkpoint", ...WEEK, ...request, now: () => at,
});

describe("Recovery eligibility checkpoint (zero-write)", () => {
  it("as of Oct 10 the Oct 25 Weekly is pending: 7 reliable, 8 nights to come, 1 more failure tolerated", async () => {
    const { records } = storeWith({ sleepDays: sleepRows({ through: "2026-10-09" }) });
    const result = await checkpoint(records, AT_OCT10);
    expect(result.outcome).toBe("checkpoint");
    expect(result.lastClosedSleepDay).toBe("2026-10-09");
    expect(result.decision).toBe("baseline_pending");
    expect(result.baseline).toMatchObject({ reliableNights: 7, withheldNights: 1, withheldByReason: { ambiguous_revision_continuation: 1 } });
    expect(result.pendingBaselineNights).toBe(8);
    expect(result.maximumPossibleBaselineNights).toBe(15);
    expect(result.additionalFailuresTolerated).toBe(1);
    expect(result.baselineFinal).toBe(false);
    expect(result.liveAuthority).toEqual({ enabled: false, invalidReason: "recovery_publication_authority_absent" });
    expect(result.simulatedAuthority.written).toBe(false);
    expect(result.period).toEqual({ startDate: "2026-10-18", endDate: "2026-10-24", timeZone: "America/Los_Angeles" });
    expect(result.periodAccounting).toMatchObject({ expectedNights: 7, reliableNights: 0, missingNights: 7 });
  });

  it("after the Oct 17 sleep-day cutoff with one more failure: exactly 14 → eligible and final", async () => {
    const { records } = storeWith({ sleepDays: sleepRows({ through: "2026-10-17", ambiguous: ["2026-10-07", "2026-10-12"] }) });
    const result = await checkpoint(records, AT_CHECKPOINT);
    expect(result.lastClosedSleepDay).toBe("2026-10-17");
    expect(result.baselineFinal).toBe(true);
    expect(result.baseline.reliableNights).toBe(14);
    expect(result.decision).toBe("baseline_eligible");
  });

  it("two more failures → 13 → cannot qualify, defer (to the Nov 8 Weekly)", async () => {
    const { records } = storeWith({ sleepDays: sleepRows({ through: "2026-10-17", ambiguous: ["2026-10-07", "2026-10-12"], missing: ["2026-10-15"] }) });
    const result = await checkpoint(records, AT_CHECKPOINT);
    expect(result.baseline.reliableNights).toBe(13);
    expect(result.decision).toBe("baseline_cannot_qualify_defer");
    const nov8 = await checkpoint(records, AT_CHECKPOINT, { startDate: "2026-11-01", endDate: "2026-11-07" });
    expect(nov8.decision).toBe("baseline_pending");
    expect(nov8.maximumPossibleBaselineNights).toBeGreaterThanOrEqual(14);
  });

  it("the Oct 18 Weekly (Oct 11–17) can never qualify", async () => {
    const { records } = storeWith({ sleepDays: sleepRows({ through: "2026-10-09" }) });
    const result = await checkpoint(records, AT_OCT10, { startDate: "2026-10-11", endDate: "2026-10-17" });
    expect(result.maximumPossibleBaselineNights).toBe(8);
    expect(result.decision).toBe("baseline_cannot_qualify_defer");
  });
});

describe("Recovery publication preview (zero-write, deployed composition)", () => {
  it("refuses before every period sleep-day window has closed", async () => {
    const { records } = storeWith();
    const result = await preview(records, AT_SAT_NOON);
    expect(result.outcome).toBe("refused");
    expect(result.reasons).toEqual(["period_sleep_windows_open"]);
    expect(result.earliestPreviewAt).toBe("2026-10-25T01:00:00.000Z"); // Sat Oct 24 18:00 PDT
  });

  it("previews a Green card Saturday evening (provisional) and again before the Sunday tick (final)", async () => {
    const { records, reads } = storeWith();
    const evening = await preview(records, AT_SAT_EVENING);
    expect(evening.outcome).toBe("card");
    expect(evening.provisional).toBe(true);
    expect(evening.card.status).toEqual({ state: "green", label: "Green" });
    expect(evening.card.commentary).toMatchObject({ visible: false });
    expect(evening.card.period).toEqual({ expectedNights: 7, observedNights: 7 });
    expect(evening.card.baselineNights).toBe(15);
    expect(evening.validation).toMatchObject({
      envelopeValid: true, cadenceInvariant: true, nativeProjectionPresent: true,
      excludedCadencesRefused: { midweek: true, dexaEvent: true, photoEvent: true },
      foamCannotSetStatus: true, confidenceCoupling: "none", trainingCorroborationPublished: false,
    });
    expect(evening.validation.nativeDecoder).toMatchObject({ ok: true, failures: [] });
    expect(evening.validation.isolation).toEqual({ strategicEligibility: "excluded", confidenceCoupling: "none",
      narrativeCoupling: "none", recommendationCoupling: "none", settlementCoupling: "none", historicalRewrite: false });
    const final = await preview(records, AT_SUNDAY);
    expect(final.provisional).toBe(false);
    expect(final.card.status.state).toBe("green");
    // Zero writes: the facade has no write method; reads are bounded to these collections.
    expect(new Set(reads)).toEqual(new Set(["healthKitConfiguration", "healthKitSleepDays", "reminders", "executionItems", "dailyCheckIns", "canonicalEvidenceObjects"]));
  });

  it("sanitizes: no sleep duration, baseline or trend value leaves the preview", async () => {
    const { records } = storeWith();
    const text = JSON.stringify(await preview(records, AT_SUNDAY));
    expect(text).not.toMatch(/Minutes"?\s*:/);
    expect(text).not.toMatch(/totalSleep|averageMinutes|centerMinutes|asleep/i);
  });

  it("the 14-night gate is exact: 13 reliable baseline nights publish nothing, 14 publish a card", async () => {
    const thirteen = storeWith({ sleepDays: sleepRows({ ambiguous: ["2026-10-07", "2026-10-12"], missing: ["2026-10-15"] }) });
    const none = await preview(thirteen.records, AT_SUNDAY);
    expect(none.outcome).toBe("no_card");
    expect(none.reason).toBe("baseline_not_yet_eligible");
    expect(none.eligibility.baseline.reliableNights).toBe(13);
    const fourteen = storeWith({ sleepDays: sleepRows({ ambiguous: ["2026-10-07", "2026-10-12"] }) });
    const card = await preview(fourteen.records, AT_SUNDAY);
    expect(card.outcome).toBe("card");
    expect(card.card.baselineNights).toBe(14);
  });

  it("Not enough data: baseline eligible but fewer than 5 of 7 period nights", async () => {
    const { records } = storeWith({ sleepDays: sleepRows({ missing: ["2026-10-19", "2026-10-20", "2026-10-22"] }) });
    const result = await preview(records, AT_SUNDAY);
    expect(result.card.status).toEqual({ state: "unavailable", label: "Not enough data" });
    expect(result.card.statusReasonCodes).toContain("insufficient_period_nights");
    expect(result.validation.nativeDecoder.ok).toBe(true);
  });

  it("Yellow carries the exact Server-authored editorial copy", async () => {
    const low = new Set(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"]);
    const { records } = storeWith({ sleepDays: sleepRows({ minutes: (date) => (low.has(date) ? 330 : 420) }) });
    const result = await preview(records, AT_SUNDAY);
    expect(result.card.status.state).toBe("yellow");
    expect(result.card.commentary).toMatchObject({ visible: true, headline: "Sleep was persistently below baseline",
      body: "Four nights were materially low." });
    expect(result.validation.nativeDecoder).toMatchObject({ ok: true, rendersCommentary: true });
  });

  it("projects the foam row from the snapshot and it never changes the status", async () => {
    const foam = {
      reminders: [{ id: FOAM_ROLLING_REMINDER_ID, userId: OWNER, title: "Foam Roll", active: true,
        schedule: { type: "daily", cadence: "daily", interval: 1, unit: "day", daysOfWeek: [], timeOfDay: "17:00" },
        completionHistory: ["2026-10-18", "2026-10-19", "2026-10-21", "2026-10-23"].map((date) => ({
          id: `${FOAM_ROLLING_REMINDER_ID}:${date}`, occurrenceDate: date, completedAt: `${date}T23:30:00.000Z`, satisfactionType: "manual_priority_completion" })) }],
      executionItems: [{ id: FOAM_ROLLING_EXECUTION_ID, userId: OWNER, active: true, cadence: { type: "daily" }, preferredSchedule: { timeOfDay: "17:00", startDate: "2026-09-15" } }],
      // Another owner's rows are ignored, exactly as the generator's repositories do.
      dailyCheckIns: [{ id: "x", userId: "someone_else", date: "2026-10-20", reconciliation: [] }],
    };
    const withFoam = await preview(storeWith(foam).records, AT_SUNDAY);
    const without = await preview(storeWith().records, AT_SUNDAY);
    expect(withFoam.card.foamRolling).toMatchObject({ state: "mixed", scheduledOccurrences: 7, completedOccurrences: 4, missedOccurrences: 3 });
    expect(withFoam.validation.nativeDecoder.rendersFoamRow).toBe(true);
    expect(withFoam.card.status).toEqual(without.card.status);
  });

  it("previews the November Monthly with weekly aggregates on Dec 1", async () => {
    const { records } = storeWith({ sleepDays: sleepRows({ through: "2026-11-30" }) });
    const result = await preview(records, new Date("2026-12-01T09:00:00.000Z"), { cadence: "monthly", startDate: "2026-11-01", endDate: "2026-11-30" });
    expect(result.outcome).toBe("card");
    expect(result.card.trend.granularity).toBe("week");
    expect(result.card.baselineNights).toBe(27);
    expect(result.validation.nativeDecoder.ok).toBe(true);
  });

  it("refuses excluded cadences and non-cadence periods outright", async () => {
    const { records } = storeWith();
    for (const cadence of ["midweek", "daily", "dexa", "photo"]) {
      expect((await preview(records, AT_SUNDAY, { cadence })).reasons).toEqual(["cadence_excluded"]);
    }
    expect((await preview(records, AT_SUNDAY, { startDate: "2026-10-19", endDate: "2026-10-25" })).reasons).toEqual(["period_is_not_a_cadence_window"]);
    expect((await preview(records, AT_SUNDAY, { startDate: "2026-10-32" })).reasons).toEqual(["period_dates_invalid"]);
  });

  it("before the proposed effective period the deployed gate refuses; a diagnostic simulated start runs the full path", async () => {
    const { records } = storeWith({ sleepDays: sleepRows({ through: "2026-10-09" }) });
    const at = new Date("2026-10-10T05:30:00.000Z");
    const request = { startDate: "2026-09-27", endDate: "2026-10-03" };
    expect((await preview(records, at, request)).reasons).toEqual(["period_before_publication_effective"]);
    const diagnostic = await preview(records, at, { ...request, simulatedEffectiveFrom: "2026-09-27" });
    expect(diagnostic.outcome).toBe("no_card");
    expect(diagnostic.reason).toBe("baseline_not_yet_eligible");
    expect(diagnostic.simulatedAuthority).toMatchObject({ written: false, diagnosticEffectiveFrom: true, effectiveFromPeriodStart: "2026-09-27" });
    expect(diagnostic.eligibility.baseline.reliableNights).toBe(0);
    expect(diagnostic.eligibility.period.reliableNights).toBe(2);
  });

  it("uses the simulated authority even when a live one exists, and reports the live one", async () => {
    const { records } = storeWith({ authority: recoveryAuthorityRecord({ status: "disabled" }) });
    const result = await preview(records, AT_SUNDAY);
    expect(result.liveAuthority).toEqual({ enabled: false, invalidReason: "recovery_publication_authority_disabled" });
    expect(result.outcome).toBe("card");
  });
});

describe("Native decoder contract port", () => {
  it("rejects shapes the shipped Swift decoder rejects", async () => {
    const { records } = storeWith();
    const result = await preview(records, AT_SUNDAY);
    const card = { schemaVersion: "recovery_card_v1", presentation: "single_recovery_card_v1", cadence: "weekly", assessmentId: "a",
      status: { state: "green", label: "Green" }, period: { startDate: "2026-10-18", endDate: "2026-10-24", expectedNights: 7, observedNights: 2 },
      sleep: { averageMinutes: 400, baselineMinutes: 410, deltaFromBaselineMinutes: -10, baselineNights: 14, baselineLookbackNights: 28,
        trend: { granularity: "night", points: [{ label: "2026-10-18", totalSleepMinutes: 400 }, { label: "2026-10-19", totalSleepMinutes: 400 }] } },
      commentary: { visible: false }, foamRolling: { state: "unavailable" }, dataLimitations: [] };
    const window = { cadence: "weekly", startDate: "2026-10-18", endDate: "2026-10-24" };
    expect(checkRecoveryNativeCardContractV1(card, window).ok).toBe(true);
    expect(checkRecoveryNativeCardContractV1({ ...card, sleep: { ...card.sleep, baselineNights: 13 } }, window).failures).toContain("baseline_nights");
    expect(checkRecoveryNativeCardContractV1({ ...card, period: { ...card.period, observedNights: 3 } }, window).failures).toContain("trend_night_count");
    expect(checkRecoveryNativeCardContractV1({ ...card, foamRolling: { state: "mixed", scheduledOccurrences: 7, completedOccurrences: 7, missedOccurrences: 0, excusedOccurrences: 0 } }, window).failures)
      .toContain("foam_split_rejected");
    expect(checkRecoveryNativeCardContractV1(card, { ...window, startDate: "2026-10-11" }).failures).toContain("period_window_mismatch");
    expect(checkRecoveryNativeCardContractV1(null, window).ok).toBe(false);
    expect(result.validation.nativeDecoder.ok).toBe(true);
  });
});
