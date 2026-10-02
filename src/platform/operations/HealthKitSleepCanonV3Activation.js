import { createHash } from "node:crypto";
import {
  HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION,
  HEALTHKIT_SLEEP_DAY_COLLECTION,
  HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_DAY_COLLECTION,
  HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_SAMPLE_COLLECTION,
  HEALTHKIT_SLEEP_SAMPLE_COLLECTION,
  getHealthKitSleepDayRecordId,
  isCalendarDateKey,
} from "../../domain/services/HealthKitSleepContract.js";
import {
  HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID,
  HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_RECORD_ID,
  HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_SCHEMA_VERSION,
  HEALTHKIT_SLEEP_SOURCE_PREFERENCE_POLICY_RECORD_ID,
  resolveHealthKitSleepActivationPolicy,
  resolveHealthKitSleepCanonicalAlgorithmPolicy,
  resolveHealthKitSleepSourcePreferencePolicy,
} from "../../domain/services/HealthKitSleepPolicies.js";
import {
  HEALTHKIT_SLEEP_CANON_V3_ALGORITHM_VERSION,
  canonicalizeHealthKitSleepV3,
} from "../../domain/services/HealthKitSleepCanonicalizer.js";
import { buildHealthKitSleepDayPayload } from "../../application/commands/HealthKitSleepIngestPort.js";
import { HEALTHKIT_SLEEP_VALIDATION_SAMPLE_COLLECTION } from "../../domain/services/HealthKitSleepHistoricalValidation.js";

export const HEALTHKIT_SLEEP_CANON_V3_AUDIT_PREFIX = "healthkit_sleep_canon_v3_audit_";
const DEFAULT_MAX_DAYS = 7;

/**
 * Bounded, prospective-only activation of sleep-canon-v3 for ORDINARY Sleep
 * days. One transaction (the caller owns it):
 *
 *   dry-run  reads the ordinary Sleep samples/days and the historical counts,
 *            recomputes every stored ordinary day >= D0 with v3, and returns
 *            the per-day ledger and the facts; writes nothing.
 *   apply    requires a non-empty authorization reference and the exact
 *            `expected` facts of the preceding dry run (any new sample, day,
 *            policy change, or historical change refuses); writes the
 *            canonical-algorithm policy record, rewrites ONLY the planned
 *            ordinary days (same identity, revision + 1, algorithm v3), one
 *            audit row, and re-verifies everything in the same transaction.
 *
 * Never touched: historical Sleep (samples, days, validation corpus), any day
 * before D0, any strategic record. Refused when the day set exceeds the bound,
 * when a recomputed day >= D0 is not already stored (or vice versa), or when
 * D0 is not the enabled prospective activation day.
 */
export async function runHealthKitSleepCanonV3Activation({
  records,
  authorization,
  apply = false,
  expected = null,
  now = () => new Date(),
} = {}) {
  const { ownerUserId, effectiveSleepDay } = authorization ?? {};
  if (!ownerUserId) throw Object.assign(new Error("Owner authority is required."), { code: "OWNER_REQUIRED" });
  const maxDays = Number(authorization.maxDays ?? DEFAULT_MAX_DAYS);
  const get = (recordId) => records.get({ ownerUserId, collection: HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION, recordId });
  const list = (collection) => records.list({ ownerUserId, collection });

  const [activationRecord, preferenceRecord, algorithmRecord, samples, days, historicalDays, historicalSamples, validationSamples] = await Promise.all([
    get(HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID),
    get(HEALTHKIT_SLEEP_SOURCE_PREFERENCE_POLICY_RECORD_ID),
    get(HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_RECORD_ID),
    list(HEALTHKIT_SLEEP_SAMPLE_COLLECTION),
    list(HEALTHKIT_SLEEP_DAY_COLLECTION),
    list(HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_DAY_COLLECTION),
    list(HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_SAMPLE_COLLECTION),
    list(HEALTHKIT_SLEEP_VALIDATION_SAMPLE_COLLECTION),
  ]);
  const activation = resolveHealthKitSleepActivationPolicy(activationRecord);
  const preference = resolveHealthKitSleepSourcePreferencePolicy(preferenceRecord);
  const currentAlgorithm = resolveHealthKitSleepCanonicalAlgorithmPolicy(algorithmRecord);

  const historicalFacts = Object.freeze({
    historicalDayCount: historicalDays.length,
    historicalDayDigest: digestRows(historicalDays),
    historicalSampleCount: historicalSamples.length,
    historicalSampleDigest: digestRows(historicalSamples),
    validationSampleCount: validationSamples.length,
    validationSampleDigest: digestRows(validationSamples),
  });

  const refuse = (reason, extra = {}) => Object.freeze({ outcome: "refused", reason, ...extra });
  if (!isCalendarDateKey(effectiveSleepDay)) return refuse("effective_sleep_day_invalid");
  if (!activation.enabled || activation.effectiveSleepDay !== effectiveSleepDay) return refuse("prospective_activation_d0_mismatch");
  if (!Number.isInteger(maxDays) || maxDays < 1 || maxDays > 31) return refuse("max_days_invalid");

  // v3 over the ordinary stream only. Historical samples are never an input.
  const computed = canonicalizeHealthKitSleepV3({ samples, preference });
  const stored = new Map(days.map((day) => [day.sleepDay, day]));
  const targetDays = [...new Set([
    ...days.map((day) => day.sleepDay).filter((day) => day >= effectiveSleepDay),
    ...[...computed.keys()].filter((day) => day >= effectiveSleepDay),
  ])].sort();
  const beforeD0 = days.filter((day) => day.sleepDay < effectiveSleepDay).map((day) => day.sleepDay).sort();

  const ledger = targetDays.map((sleepDay) => {
    const before = stored.get(sleepDay) ?? null;
    const after = computed.get(sleepDay) ?? null;
    return Object.freeze({
      sleepDay,
      recordId: getHealthKitSleepDayRecordId(sleepDay),
      storedBefore: Boolean(before),
      computedAfter: Boolean(after),
      before: before ? summarize(before) : null,
      after: after ? summarize(after) : null,
      changed: Boolean(before && after && before.inputDigest !== after.inputDigest),
    });
  });
  const facts = Object.freeze({
    effectiveSleepDay,
    activationPolicyDigest: recordDigest(activationRecord),
    sourcePreferenceDigest: recordDigest(preferenceRecord),
    canonicalAlgorithmPolicyDigest: recordDigest(algorithmRecord),
    ordinarySampleCount: samples.length,
    ordinarySampleDigest: digestRows(samples),
    ordinaryDayCount: days.length,
    ordinaryDaysBeforeD0: beforeD0,
    targetDays,
    plannedDigests: ledger.map((entry) => [entry.sleepDay, entry.before?.inputDigest ?? null, entry.after?.inputDigest ?? null]),
    ...historicalFacts,
  });

  if (ledger.some((entry) => !entry.storedBefore || !entry.computedAfter)) {
    return refuse("prospective_day_set_mismatch", { facts, ledger });
  }
  if (ledger.length > maxDays) return refuse("prospective_day_bound_exceeded", { facts, ledger });
  if (ledger.some((entry) => entry.sleepDay < effectiveSleepDay)) return refuse("pre_d0_day_selected", { facts, ledger });

  const desiredPolicy = {
    id: HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_RECORD_ID,
    status: "enabled",
    schemaVersion: HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_SCHEMA_VERSION,
    algorithmVersion: HEALTHKIT_SLEEP_CANON_V3_ALGORITHM_VERSION,
    effectiveSleepDay,
    scope: "ordinary_prospective_only",
    historicalAlgorithmVersion: "sleep-canon-v2",
    authorizationReference: String(authorization.authorizationReference ?? "") || null,
  };
  const alreadyApplied = currentAlgorithm.enabled &&
    currentAlgorithm.algorithmVersion === HEALTHKIT_SLEEP_CANON_V3_ALGORITHM_VERSION &&
    currentAlgorithm.effectiveSleepDay === effectiveSleepDay &&
    ledger.every((entry) => !entry.changed);

  if (!apply) {
    return Object.freeze({ outcome: alreadyApplied ? "already_applied" : "dry_run", facts, ledger });
  }
  if (!String(authorization.authorizationReference ?? "").trim()) return refuse("authorization_reference_required", { facts });
  if (!expected || JSON.stringify(expected) !== JSON.stringify(facts)) {
    return refuse("production_drifted_since_dry_run", { facts, expected });
  }
  if (alreadyApplied) return Object.freeze({ outcome: "already_applied", facts, ledger });

  const appliedAt = now().toISOString();
  const writtenPolicy = await records.put({
    ownerUserId, collection: HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION, recordId: HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_RECORD_ID,
    payload: { ...desiredPolicy, updatedAt: appliedAt },
    expectedVersion: algorithmRecord ? algorithmRecord.version : null,
  });
  const writes = [];
  for (const entry of ledger) {
    if (!entry.changed) continue;
    const existing = stored.get(entry.sleepDay);
    const payload = buildHealthKitSleepDayPayload({
      content: computed.get(entry.sleepDay), existing, ownerUserId, sleepDay: entry.sleepDay, computedAt: appliedAt,
    });
    await records.put({
      ownerUserId, collection: HEALTHKIT_SLEEP_DAY_COLLECTION, recordId: entry.recordId, payload, expectedVersion: existing.version,
    });
    writes.push(Object.freeze({ sleepDay: entry.sleepDay, revisionBefore: existing.revision ?? null, revisionAfter: payload.revision }));
  }
  const auditId = `${HEALTHKIT_SLEEP_CANON_V3_AUDIT_PREFIX}${createHash("sha256").update(`${appliedAt}\u0000${effectiveSleepDay}`).digest("hex").slice(0, 32)}`;
  const audit = await records.putIfAbsent({
    ownerUserId, collection: HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION, recordId: auditId,
    payload: {
      id: auditId, kind: "healthkit_sleep_canon_v3_activation_audit", appliedAt,
      authorizationReference: desiredPolicy.authorizationReference,
      policyDigestBefore: facts.canonicalAlgorithmPolicyDigest, policyDigestAfter: recordDigest(writtenPolicy),
      writes, factsBefore: facts,
    },
  });

  // Re-verify inside the same transaction.
  const [policyAfter, daysAfter, historicalDaysAfter, historicalSamplesAfter, validationAfter, samplesAfter] = await Promise.all([
    get(HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_RECORD_ID),
    list(HEALTHKIT_SLEEP_DAY_COLLECTION),
    list(HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_DAY_COLLECTION),
    list(HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_SAMPLE_COLLECTION),
    list(HEALTHKIT_SLEEP_VALIDATION_SAMPLE_COLLECTION),
    list(HEALTHKIT_SLEEP_SAMPLE_COLLECTION),
  ]);
  const resolvedAfter = resolveHealthKitSleepCanonicalAlgorithmPolicy(policyAfter);
  const recomputed = canonicalizeHealthKitSleepV3({ samples: samplesAfter, preference });
  const storedAfter = new Map(daysAfter.map((day) => [day.sleepDay, day]));
  const verification = Object.freeze({
    policyEnabledV3: resolvedAfter.enabled && resolvedAfter.algorithmVersion === HEALTHKIT_SLEEP_CANON_V3_ALGORITHM_VERSION &&
      resolvedAfter.effectiveSleepDay === effectiveSleepDay,
    daysStoredEqualFreshV3: ledger.every((entry) => storedAfter.get(entry.sleepDay)?.inputDigest === recomputed.get(entry.sleepDay)?.inputDigest &&
      storedAfter.get(entry.sleepDay)?.algorithmVersion === HEALTHKIT_SLEEP_CANON_V3_ALGORITHM_VERSION),
    daysStillQuarantined: ledger.every((entry) => storedAfter.get(entry.sleepDay)?.strategicEligible === false),
    ordinaryDayCountUnchanged: daysAfter.length === days.length,
    ordinaryDaysBeforeD0Unchanged: days.filter((day) => day.sleepDay < effectiveSleepDay)
      .every((day) => storedAfter.get(day.sleepDay)?.inputDigest === day.inputDigest && storedAfter.get(day.sleepDay)?.revision === day.revision),
    ordinarySamplesUnchanged: digestRows(samplesAfter) === facts.ordinarySampleDigest,
    historicalUnchanged: digestRows(historicalDaysAfter) === historicalFacts.historicalDayDigest &&
      digestRows(historicalSamplesAfter) === historicalFacts.historicalSampleDigest &&
      digestRows(validationAfter) === historicalFacts.validationSampleDigest,
    auditWritten: audit.created === true,
  });
  if (Object.values(verification).some((value) => value !== true)) {
    throw Object.assign(new Error("Sleep canon v3 activation verification failed."), { code: "SLEEP_CANON_V3_VERIFICATION_FAILED" });
  }
  return Object.freeze({ outcome: "applied", auditId, writes, verification, factsBefore: facts, ledger });
}

function summarize(day) {
  const main = day.mainSleep ?? null;
  const episode = day.episodes?.[day.mainEpisodeIndex] ?? null;
  return Object.freeze({
    algorithmVersion: day.algorithmVersion,
    inputDigest: day.inputDigest,
    revision: day.revision ?? null,
    status: day.status,
    asleepSeconds: main?.asleepSeconds ?? null,
    deepSeconds: main?.deepSeconds ?? null,
    remSeconds: main?.remSeconds ?? null,
    coreSeconds: main?.coreSeconds ?? null,
    awakeSeconds: main?.awakeSeconds ?? null,
    timelineSegments: episode?.timeline?.length ?? null,
    selectedSampleCount: episode?.sourceSampleIds?.length ?? null,
    copySelection: episode?.reconciliation?.copySelection ?? null,
    strategicEligible: day.strategicEligible ?? null,
  });
}

function digestRows(rows) {
  const material = [...rows]
    .map((row) => [row.id, row.version ?? null, row.inputDigest ?? row.contentFingerprint ?? null, row.status ?? null, row.revision ?? null])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  return createHash("sha256").update(JSON.stringify(material)).digest("hex").slice(0, 32);
}

function recordDigest(record) {
  if (!record) return null;
  const { version, updatedAt, authorizationReference, ...rest } = record;
  return createHash("sha256").update(stable(rest)).digest("hex").slice(0, 32);
}

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
