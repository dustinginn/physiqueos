// Synthetic canonical Sleep days for Recovery tests. No Founder data.
//
// Every day is produced by the REAL production path: synthetic HealthKit
// samples -> the sleep-canon-v3 (or v2) canonicalizer -> the stored-day payload
// builder ingestion uses. Recovery tests therefore exercise the exact record
// shape production stores, not a hand-written imitation of it.
import {
  HEALTHKIT_SLEEP_CANON_V2_ALGORITHM_VERSION,
  HEALTHKIT_SLEEP_CANON_V3_ALGORITHM_VERSION,
  canonicalizeHealthKitSleepWithAlgorithm,
} from "../domain/services/HealthKitSleepCanonicalizer.js";
import { buildHealthKitSleepDayPayload } from "../application/commands/HealthKitSleepIngestPort.js";
import {
  HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_SCHEMA_VERSION,
} from "../domain/services/HealthKitSleepPolicies.js";
import { LA, OWNER, activationPolicy, stored, uuid } from "./healthKitSleepSynthetic.js";

export { LA, OWNER };
export const SLEEP_D0 = "2026-10-02";

const DAY_MS = 86_400_000;
let sequence = 90_000;

export function shiftDay(value, amount) {
  return new Date(Date.parse(`${value}T12:00:00Z`) + amount * DAY_MS).toISOString().slice(0, 10);
}

export function datesFrom(start, count) {
  return Array.from({ length: count }, (_, index) => shiftDay(start, index));
}

/** The production-shaped Sleep activation record (validation_only, D0 Oct 2). */
export function recoveryActivationRecord(overrides = {}) {
  return activationPolicy({ effectiveSleepDay: SLEEP_D0, mode: "validation_only", ...overrides });
}

/** The production-shaped canonical-algorithm record (sleep-canon-v3, Oct 2). */
export function recoveryAlgorithmRecord(overrides = {}) {
  return {
    status: "enabled",
    schemaVersion: HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_SCHEMA_VERSION,
    algorithmVersion: HEALTHKIT_SLEEP_CANON_V3_ALGORITHM_VERSION,
    effectiveSleepDay: SLEEP_D0,
    scope: "ordinary_prospective_only",
    ...overrides,
  };
}

/**
 * One stored canonical sleep day with `minutes` asleep on wake date
 * `sleepDay`. The night starts 00:00 Pacific daylight (07:00Z), well inside the
 * [D-1 18:00, D 18:00) sleep-day window in either PDT or PST.
 */
export function canonicalNight(sleepDay, minutes, {
  computedAt = `${sleepDay}T18:00:00.000Z`,
  purpose = "validation_only",
  source = "watch",
  stage = "core",
  algorithmVersion = HEALTHKIT_SLEEP_CANON_V3_ALGORITHM_VERSION,
  revision = 1,
  timeZoneSource = "sample_metadata",
} = {}) {
  const startMs = Date.parse(`${sleepDay}T07:00:00.000Z`);
  const sample = stored({
    id: uuid((sequence += 1)),
    source,
    stage,
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + minutes * 60_000).toISOString(),
    timeZone: LA,
    timeZoneSource,
  }, { purpose, receivedAt: computedAt, batchId: `batch-${sleepDay}` });
  const content = canonicalizeHealthKitSleepWithAlgorithm(
    algorithmVersion === HEALTHKIT_SLEEP_CANON_V2_ALGORITHM_VERSION
      ? HEALTHKIT_SLEEP_CANON_V2_ALGORITHM_VERSION : algorithmVersion,
    { samples: [sample] },
  ).get(sleepDay);
  if (!content) throw new Error(`Synthetic night ${sleepDay} did not canonicalize.`);
  return buildHealthKitSleepDayPayload({
    content,
    existing: revision > 1 ? { revision: revision - 1 } : null,
    ownerUserId: OWNER,
    sleepDay,
    computedAt,
  });
}

/** Consecutive canonical nights from `start`, one per value (null = no row). */
export function canonicalNights(start, values, options = {}) {
  return values.flatMap((minutes, index) => minutes === null ? []
    : [canonicalNight(shiftDay(start, index), minutes, options)]);
}

/** A copy of a stored day whose v3 copy selection reports an ambiguous continuation. */
export function withAmbiguousContinuation(day, count = 1) {
  const copy = structuredClone(day);
  copy.episodes[copy.mainEpisodeIndex].reconciliation.copySelection.ambiguousContinuationCount = count;
  return copy;
}
