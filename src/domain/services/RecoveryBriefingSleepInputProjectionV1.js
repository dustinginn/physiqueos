import {
  HEALTHKIT_SLEEP_DAY_ID_PREFIX,
  HealthKitSleepIngestionPurpose,
} from "./HealthKitSleepContract.js";
import {
  resolveHealthKitSleepActivationPolicy,
  resolveHealthKitSleepCanonicalAlgorithmPolicy,
} from "./HealthKitSleepPolicies.js";
import {
  RECOVERY_BRIEFING_CADENCES,
  RECOVERY_SLEEP_INPUT_PROJECTION_VERSION,
  RECOVERY_STATUS_POLICY_V1,
} from "./RecoveryBriefingPolicyV1.js";

// Canonical HealthKit Sleep day (healthKitSleepDays, quarantined, unchanged)
//   -> THIS non-strategic, read-only, prospective-only projection
//   -> reliable Recovery nights for the pure Recovery assessment, and nothing
//      else.
//
// It never decides strategic meaning and never produces a `sleep_night` V3
// evidence object: its output is a Recovery-only row shape that no V3,
// Confidence, Narrative, recommendation or settlement reader consumes. It does
// not read the strategic Sleep graduation scope either, so Recovery neither
// depends on nor widens strategic Sleep.
//
// Every expected sleep day of the prior-28-night baseline and of the closed
// period is accounted for exactly once, by sleep day, as one of:
//   reliable                 a trustworthy prospective sleep-canon-v3 night
//   withheld                 a row exists but cannot be trusted (reason given)
//   missing                  no canonical row exists for that sleep day
//   before_prospective_floor the night precedes the prospective floor, so it can
//                            never count, whatever a row says (pre-policy era)
// Only `reliable` nights reach the assessment. An unreliable night is never
// borrowed, substituted or interpolated to reach the 14-night baseline.
//
// The canonical store keeps ONLY the latest revision of a sleep day. A night
// whose stored revision was computed after the evidence cutoff therefore has
// no recoverable as-of-cutoff value and is withheld (`revised_after_cutoff`):
// late data can never change a closed assessment, and a stale value is never
// guessed at.

export const RECOVERY_SLEEP_INPUT_POLICY_V1 = Object.freeze({
  schemaVersion: RECOVERY_SLEEP_INPUT_PROJECTION_VERSION,
  algorithmVersion: "sleep-canon-v3",
  // Production prospective Sleep is activated as `validation_only` (D0
  // 2026-10-02). `operational` is deliberately NOT accepted: moving Recovery
  // onto it is a separately reviewed authority change, never a silent widening.
  prospectivePurposes: Object.freeze([HealthKitSleepIngestionPurpose.VALIDATION_ONLY]),
  requiredSourceBasis: "sensor",
  maximumAsleepSeconds: 86_400,
  withholdAmbiguousContinuation: true,
  strategicEvidenceEligibility: "excluded",
});

export const RecoverySleepNightState = Object.freeze({
  RELIABLE: "reliable",
  WITHHELD: "withheld",
  MISSING: "missing",
  BEFORE_PROSPECTIVE_FLOOR: "before_prospective_floor",
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/**
 * @param sleepDays canonical healthKitSleepDays records (any order, may include
 *   rows outside the windows; they are ignored)
 * @param activationPolicyRecord / algorithmPolicyRecord the raw Server-owned
 *   Sleep policy records (resolved here with the production resolvers)
 * @param recoveryEffectiveSleepDay the Recovery authority's own explicit floor
 * @param period `{ cadence, startDate, endDate }` (Weekly or Monthly only)
 * @param evidenceCutoff ISO instant: nothing computed after it is used
 * Pure: no clock, no repository, no mutation of its inputs.
 */
export function projectRecoverySleepInputsV1({
  sleepDays = [],
  activationPolicyRecord = null,
  algorithmPolicyRecord = null,
  recoveryEffectiveSleepDay = null,
  period = null,
  evidenceCutoff = null,
  ownerUserId = null,
} = {}) {
  const blocked = (reason, extra = {}) => deepFreeze({
    schemaVersion: RECOVERY_SLEEP_INPUT_PROJECTION_VERSION,
    status: "blocked",
    blockedReason: reason,
    floor: null,
    windows: null,
    ledger: [],
    records: [],
    accounting: null,
    strategicEvidenceEligibility: "excluded",
    ...extra,
  });
  if (!Array.isArray(sleepDays)) return blocked("sleep_days_invalid");
  if (!period || !RECOVERY_BRIEFING_CADENCES.includes(period.cadence) ||
      !isDate(period.startDate) || !isDate(period.endDate) || period.startDate > period.endDate) {
    return blocked("recovery_period_invalid");
  }
  const cutoffMs = typeof evidenceCutoff === "string" ? Date.parse(evidenceCutoff) : NaN;
  if (!Number.isFinite(cutoffMs)) return blocked("evidence_cutoff_invalid");
  if (!isDate(recoveryEffectiveSleepDay)) return blocked("recovery_effective_sleep_day_invalid");
  const activation = resolveHealthKitSleepActivationPolicy(activationPolicyRecord);
  if (!activation.enabled) return blocked("sleep_activation_policy_not_enabled");
  const algorithm = resolveHealthKitSleepCanonicalAlgorithmPolicy(algorithmPolicyRecord);
  if (!algorithm.enabled || algorithm.algorithmVersion !== RECOVERY_SLEEP_INPUT_POLICY_V1.algorithmVersion) {
    return blocked("sleep_canon_v3_policy_not_enabled");
  }
  // Historical import is categorically display-only. Its presence in a
  // Recovery read means the read was wired to the wrong collection: refuse it
  // whole instead of quietly skipping rows.
  if (sleepDays.some(isHistoricalProvenance)) return blocked("historical_sleep_categorically_forbidden");

  const prospectiveFloor = [
    recoveryEffectiveSleepDay, activation.effectiveSleepDay, algorithm.effectiveSleepDay,
  ].sort().at(-1);
  const baselineStart = shift(period.startDate, -RECOVERY_STATUS_POLICY_V1.baseline.lookbackNights);
  const baselineEnd = shift(period.startDate, -1);
  const byDay = new Map();
  for (const day of sleepDays) {
    const sleepDay = day?.sleepDay;
    if (!isDate(sleepDay) || sleepDay < baselineStart || sleepDay > period.endDate) continue;
    const rows = byDay.get(sleepDay) ?? [];
    rows.push(day);
    byDay.set(sleepDay, rows);
  }
  const ledger = [];
  const records = [];
  for (const [window, start, end] of [["baseline", baselineStart, baselineEnd], ["period", period.startDate, period.endDate]]) {
    for (let sleepDay = start; sleepDay <= end; sleepDay = shift(sleepDay, 1)) {
      const rows = byDay.get(sleepDay) ?? [];
      const decision = sleepDay < prospectiveFloor
        ? { state: RecoverySleepNightState.BEFORE_PROSPECTIVE_FLOOR, reason: "before_prospective_floor" }
        : rows.length === 0
          ? { state: RecoverySleepNightState.MISSING, reason: "no_canonical_row" }
          : rows.length > 1
            ? withheld("duplicate_sleep_day_rows")
            : assessNight(rows[0], { sleepDay, cutoffMs, activation, ownerUserId });
      const row = rows.length === 1 ? rows[0] : null;
      ledger.push(Object.freeze({
        window,
        sleepDay,
        state: decision.state,
        reason: decision.reason,
        canonicalId: row?.id ?? null,
        revision: row && Number.isFinite(Number(row.revision)) ? Number(row.revision) : null,
      }));
      if (decision.state === RecoverySleepNightState.RELIABLE) records.push(decision.record);
    }
  }
  return deepFreeze({
    schemaVersion: RECOVERY_SLEEP_INPUT_PROJECTION_VERSION,
    status: "projected",
    blockedReason: null,
    floor: {
      prospectiveFloor,
      recoveryEffectiveSleepDay,
      activationEffectiveSleepDay: activation.effectiveSleepDay,
      canonV3EffectiveSleepDay: algorithm.effectiveSleepDay,
    },
    windows: {
      baseline: { startDate: baselineStart, endDate: baselineEnd, expectedNights: RECOVERY_STATUS_POLICY_V1.baseline.lookbackNights },
      period: { cadence: period.cadence, startDate: period.startDate, endDate: period.endDate, expectedNights: daysBetween(period.startDate, period.endDate) + 1 },
    },
    ledger,
    records,
    accounting: {
      baseline: account(ledger.filter((item) => item.window === "baseline")),
      period: account(ledger.filter((item) => item.window === "period")),
    },
    strategicEvidenceEligibility: "excluded",
  });
}

function assessNight(day, { sleepDay, cutoffMs, activation, ownerUserId }) {
  const policy = RECOVERY_SLEEP_INPUT_POLICY_V1;
  if (!String(day.id ?? "").startsWith(HEALTHKIT_SLEEP_DAY_ID_PREFIX) || day.id !== `${HEALTHKIT_SLEEP_DAY_ID_PREFIX}${sleepDay}`) {
    return withheld("not_an_ordinary_canonical_day");
  }
  if (ownerUserId !== null && day.userId !== ownerUserId) return withheld("owner_mismatch");
  const purposes = [...new Set([day.ingestionPurpose, day.origin].filter(Boolean))];
  if (purposes.length !== 1 || !policy.prospectivePurposes.includes(purposes[0])) {
    return withheld("provenance_not_prospective");
  }
  if (day.algorithmVersion !== policy.algorithmVersion) return withheld("algorithm_not_canon_v3");
  // Availability: the instant this exact stored revision existed.
  const computedMs = Date.parse(String(day.computedAt ?? ""));
  if (!Number.isFinite(computedMs)) return withheld("availability_unknown");
  if (computedMs > cutoffMs) return withheld("revised_after_cutoff");
  const closesMs = Date.parse(String(day.windowClosesAt ?? ""));
  if (!Number.isFinite(closesMs)) return withheld("sleep_day_window_unknown");
  if (closesMs > cutoffMs) return withheld("sleep_day_window_open_at_cutoff");
  if (activation.endSleepDay !== null && sleepDay > activation.endSleepDay) return withheld("after_activation_window");
  const episodes = Array.isArray(day.episodes) ? day.episodes : [];
  const main = episodes[day.mainEpisodeIndex] ?? null;
  const asleep = day.mainSleep?.asleepSeconds;
  if (day.status !== "asleep_recorded" || !main || main.kind !== "main" ||
      !Number.isFinite(asleep) || asleep <= 0) return withheld("no_main_sleep");
  if (asleep > policy.maximumAsleepSeconds) return withheld("duration_implausible");
  if (main.completeness?.sourceBasis !== policy.requiredSourceBasis) return withheld("manual_only_source");
  const ambiguous = Number(main.reconciliation?.copySelection?.ambiguousContinuationCount ?? 0);
  if (!Number.isFinite(ambiguous) || ambiguous < 0) return withheld("revision_selection_unreadable");
  if (policy.withholdAmbiguousContinuation && ambiguous > 0) return withheld("ambiguous_revision_continuation");
  const timeZoneUncertain = day.timeZoneShift === true || main.timeZoneSource !== "sample_metadata" || !main.timeZone;
  return Object.freeze({
    state: RecoverySleepNightState.RELIABLE,
    reason: "trusted_prospective_canon_v3_night",
    record: Object.freeze({
      id: day.id,
      sleepDay,
      totalSleepMinutes: asleep / 60,
      durationReliable: true,
      timeZoneUncertain,
      clockTimeReliable: !timeZoneUncertain,
      availableAt: new Date(computedMs).toISOString(),
      revision: Number.isFinite(Number(day.revision)) ? Number(day.revision) : null,
    }),
  });
}

function withheld(reason) {
  return Object.freeze({ state: RecoverySleepNightState.WITHHELD, reason });
}

function isHistoricalProvenance(day) {
  const historical = HealthKitSleepIngestionPurpose.HISTORICAL_EVIDENCE_IMPORT;
  return [day?.ingestionPurpose, day?.origin, day?.provenance?.ingestionPurpose, day?.provenance?.origin]
    .includes(historical) || day?.evidenceEligibility?.permanent === true;
}

function account(entries) {
  const byState = Object.fromEntries(Object.values(RecoverySleepNightState).map((state) => [state, 0]));
  const withheldByReason = {};
  for (const entry of entries) {
    byState[entry.state] += 1;
    if (entry.state === RecoverySleepNightState.WITHHELD) {
      withheldByReason[entry.reason] = (withheldByReason[entry.reason] ?? 0) + 1;
    }
  }
  return {
    expectedNights: entries.length,
    reliableNights: byState.reliable,
    withheldNights: byState.withheld,
    missingNights: byState.missing,
    beforeProspectiveFloorNights: byState.before_prospective_floor,
    withheldByReason: Object.fromEntries(Object.entries(withheldByReason).sort(([a], [b]) => a.localeCompare(b))),
  };
}

function isDate(value) {
  if (!DATE.test(String(value ?? ""))) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function shift(value, amount) {
  return new Date(Date.parse(`${value}T12:00:00Z`) + amount * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(left, right) {
  return Math.round((Date.parse(`${right}T12:00:00Z`) - Date.parse(`${left}T12:00:00Z`)) / DAY_MS);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
