import { createHash } from "node:crypto";
import {
  HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION,
  HEALTHKIT_SLEEP_DAY_COLLECTION,
  HEALTHKIT_SLEEP_SAMPLE_COLLECTION,
  isCalendarDateKey,
  isValidTimeZone,
  shiftDateKey,
} from "../../domain/services/HealthKitSleepContract.js";
import {
  HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID,
  HEALTHKIT_SLEEP_ACTIVATION_POLICY_SCHEMA_VERSION,
  HEALTHKIT_SLEEP_SOURCE_PREFERENCE_POLICY_RECORD_ID,
  HEALTHKIT_SLEEP_SOURCE_PREFERENCE_SCHEMA_VERSION,
  resolveHealthKitSleepActivationPolicy,
  resolveHealthKitSleepSourcePreferencePolicy,
} from "../../domain/services/HealthKitSleepPolicies.js";
import {
  HEALTHKIT_SLEEP_VALIDATION_MAX_DAYS,
  HEALTHKIT_SLEEP_VALIDATION_POLICY_RECORD_ID,
  HEALTHKIT_SLEEP_VALIDATION_POLICY_SCHEMA_VERSION,
  HEALTHKIT_SLEEP_VALIDATION_PURPOSE,
  HEALTHKIT_SLEEP_VALIDATION_SAMPLE_COLLECTION,
  resolveHealthKitSleepValidationPolicy,
} from "../../domain/services/HealthKitSleepHistoricalValidation.js";

export const HEALTHKIT_SLEEP_POLICY_AUDIT_PREFIX = "healthkit_sleep_policy_audit_";

export const HealthKitSleepPolicyAction = Object.freeze({
  ACTIVATE_PROSPECTIVE: "activate-prospective",
  DEACTIVATE_PROSPECTIVE: "deactivate-prospective",
  SET_SOURCE_PREFERENCE: "set-source-preference",
  OPEN_HISTORICAL_VALIDATION: "open-historical-validation",
  CLOSE_HISTORICAL_VALIDATION: "close-historical-validation",
});

const ACTION_RECORD = Object.freeze({
  [HealthKitSleepPolicyAction.ACTIVATE_PROSPECTIVE]: HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID,
  [HealthKitSleepPolicyAction.DEACTIVATE_PROSPECTIVE]: HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID,
  [HealthKitSleepPolicyAction.SET_SOURCE_PREFERENCE]: HEALTHKIT_SLEEP_SOURCE_PREFERENCE_POLICY_RECORD_ID,
  [HealthKitSleepPolicyAction.OPEN_HISTORICAL_VALIDATION]: HEALTHKIT_SLEEP_VALIDATION_POLICY_RECORD_ID,
  [HealthKitSleepPolicyAction.CLOSE_HISTORICAL_VALIDATION]: HEALTHKIT_SLEEP_VALIDATION_POLICY_RECORD_ID,
});

/**
 * The ONLY writer of the three Sleep configuration records. Same contract as
 * the accepted HealthKit activation runner:
 *
 *   dry-run  reads current state and predicts the exact record; writes nothing.
 *   apply    requires the `expected` facts of an immediately preceding dry run
 *            and a non-empty authorization reference; refuses (writes nothing)
 *            if production drifted; writes exactly the one policy record plus
 *            one audit row and re-verifies both in the same transaction.
 *
 * Guards that are not configurable:
 *   - prospective activation only: D0 may not precede the operation's local
 *     date in the policy zone; historicalBackfill is false; strategic evidence
 *     eligibility is "quarantined";
 *   - the historical-validation window is at most 30 sleep days and ends the
 *     day before D0; it is refused if an enabled prospective policy names a
 *     different D0;
 *   - nothing is ever deleted, and no Sleep sample/day or strategic record is
 *     read beyond counts.
 */
export async function runHealthKitSleepPolicy({
  records,
  authorization,
  action,
  apply = false,
  expected = null,
  now = () => new Date(),
} = {}) {
  const recordId = ACTION_RECORD[action];
  if (!recordId) throw Object.assign(new Error("Unsupported Sleep policy action."), { code: "ACTION_INVALID" });
  const { ownerUserId } = authorization ?? {};
  if (!ownerUserId) throw Object.assign(new Error("Owner authority is required."), { code: "OWNER_REQUIRED" });
  const get = (id) => records.get({ ownerUserId, collection: HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION, recordId: id });
  const count = async (collection) => (await records.list({ ownerUserId, collection })).length;
  const [activationRecord, preferenceRecord, validationRecord, sleepSamples, sleepDays, validationSamples] = await Promise.all([
    get(HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID),
    get(HEALTHKIT_SLEEP_SOURCE_PREFERENCE_POLICY_RECORD_ID),
    get(HEALTHKIT_SLEEP_VALIDATION_POLICY_RECORD_ID),
    count(HEALTHKIT_SLEEP_SAMPLE_COLLECTION),
    count(HEALTHKIT_SLEEP_DAY_COLLECTION),
    count(HEALTHKIT_SLEEP_VALIDATION_SAMPLE_COLLECTION),
  ]);
  const facts = Object.freeze({
    activationPolicyDigest: recordDigest(activationRecord),
    sourcePreferenceDigest: recordDigest(preferenceRecord),
    validationPolicyDigest: recordDigest(validationRecord),
    sleepSampleCount: sleepSamples,
    sleepDayCount: sleepDays,
    validationSampleCount: validationSamples,
  });
  const operationAt = now();
  const current = { activation: resolveHealthKitSleepActivationPolicy(activationRecord), validation: resolveHealthKitSleepValidationPolicy(validationRecord) };
  const existing = { [HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID]: activationRecord, [HEALTHKIT_SLEEP_SOURCE_PREFERENCE_POLICY_RECORD_ID]: preferenceRecord, [HEALTHKIT_SLEEP_VALIDATION_POLICY_RECORD_ID]: validationRecord }[recordId];

  const plan = planRecord({ action, authorization, current, operationAt, existing });
  if (plan.refused) return Object.freeze({ outcome: "refused", reason: plan.refused, facts });
  const desired = { ...plan.record, id: recordId, authorizationReference: String(authorization.authorizationReference ?? "") || null };
  const unchanged = existing && recordDigest(stripVolatile(existing)) === recordDigest(stripVolatile(desired));
  if (!apply) {
    return Object.freeze({
      outcome: unchanged ? "already_applied" : "dry_run",
      action,
      recordId,
      plannedRecordDigest: recordDigest(stripVolatile(desired)),
      plannedResolution: plan.resolution(desired),
      facts,
    });
  }
  if (!String(authorization.authorizationReference ?? "").trim()) {
    return Object.freeze({ outcome: "refused", reason: "authorization_reference_required", facts });
  }
  if (!expected || JSON.stringify(expected) !== JSON.stringify(facts)) {
    return Object.freeze({ outcome: "refused", reason: "production_drifted_since_dry_run", facts, expected });
  }
  if (unchanged) return Object.freeze({ outcome: "already_applied", action, recordId, facts });
  const appliedAt = operationAt.toISOString();
  const written = await records.put({
    ownerUserId, collection: HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION, recordId,
    payload: { ...desired, updatedAt: appliedAt },
    expectedVersion: existing ? existing.version : null,
  });
  const auditId = `${HEALTHKIT_SLEEP_POLICY_AUDIT_PREFIX}${createHash("sha256").update(`${action}\u0000${appliedAt}\u0000${recordId}`).digest("hex").slice(0, 32)}`;
  await records.put({
    ownerUserId, collection: HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION, recordId: auditId,
    payload: {
      id: auditId, kind: "healthkit_sleep_policy_audit", action, recordId, appliedAt,
      authorizationReference: desired.authorizationReference,
      beforeDigest: facts[digestKey(recordId)], afterDigest: recordDigest(written), factsBefore: facts,
    },
  });
  const reread = await get(recordId);
  const resolution = plan.resolution(reread);
  if (!plan.verify(resolution)) {
    throw Object.assign(new Error("Sleep policy verification failed after write."), { code: "SLEEP_POLICY_VERIFICATION_FAILED" });
  }
  return Object.freeze({ outcome: "applied", action, recordId, auditId, resolution, factsBefore: facts });
}

function planRecord({ action, authorization, current, operationAt, existing }) {
  const zone = authorization.timeZone ?? "America/Los_Angeles";
  switch (action) {
    case HealthKitSleepPolicyAction.ACTIVATE_PROSPECTIVE: {
      const d0 = authorization.effectiveSleepDay;
      if (!isCalendarDateKey(d0)) return { refused: "effective_sleep_day_invalid" };
      if (!isValidTimeZone(zone)) return { refused: "time_zone_invalid" };
      if (d0 < localDate(operationAt, zone)) return { refused: "effective_sleep_day_not_prospective" };
      const mode = authorization.mode ?? "validation_only";
      if (!["validation_only", "operational"].includes(mode)) return { refused: "mode_invalid" };
      if (current.activation.enabled && current.activation.effectiveSleepDay !== d0) return { refused: "active_policy_has_different_d0" };
      if (current.validation.enabled && current.validation.prospectiveEffectiveSleepDay !== d0) return { refused: "historical_validation_anchored_to_different_d0" };
      return {
        record: {
          status: "enabled", schemaVersion: HEALTHKIT_SLEEP_ACTIVATION_POLICY_SCHEMA_VERSION,
          effectiveSleepDay: d0, timeZone: zone, mode, openEnded: true,
          strategicEvidenceEligibility: "quarantined", historicalBackfill: false,
        },
        resolution: resolveHealthKitSleepActivationPolicy,
        verify: (resolved) => resolved.enabled && resolved.effectiveSleepDay === d0 && resolved.mode === mode && resolved.openEnded === true,
      };
    }
    case HealthKitSleepPolicyAction.DEACTIVATE_PROSPECTIVE:
      return {
        record: { status: "disabled", schemaVersion: HEALTHKIT_SLEEP_ACTIVATION_POLICY_SCHEMA_VERSION, strategicEvidenceEligibility: "quarantined", historicalBackfill: false },
        resolution: resolveHealthKitSleepActivationPolicy,
        verify: (resolved) => resolved.enabled === false,
      };
    case HealthKitSleepPolicyAction.SET_SOURCE_PREFERENCE: {
      const families = authorization.preferredSourceFamilies ?? ["oura"];
      const record = {
        status: "enabled", schemaVersion: HEALTHKIT_SLEEP_SOURCE_PREFERENCE_SCHEMA_VERSION,
        preferredSources: families.map((sourceFamily) => ({ sourceFamily })),
      };
      if (!resolveHealthKitSleepSourcePreferencePolicy(record).configured) return { refused: "preferred_sources_invalid" };
      return {
        record,
        resolution: resolveHealthKitSleepSourcePreferencePolicy,
        verify: (resolved) => resolved.configured && JSON.stringify(resolved.preferredSources.map((entry) => entry.sourceFamily)) === JSON.stringify(families),
      };
    }
    case HealthKitSleepPolicyAction.OPEN_HISTORICAL_VALIDATION: {
      const d0 = authorization.effectiveSleepDay;
      const days = authorization.historicalDays ?? HEALTHKIT_SLEEP_VALIDATION_MAX_DAYS;
      if (!isCalendarDateKey(d0)) return { refused: "effective_sleep_day_invalid" };
      if (!Number.isInteger(days) || days < 1 || days > HEALTHKIT_SLEEP_VALIDATION_MAX_DAYS) return { refused: "historical_days_invalid" };
      if (!isValidTimeZone(zone)) return { refused: "time_zone_invalid" };
      // Anchored to a prospective D0 only: the window can never reach into
      // days the ordinary prospective stream could already own.
      if (d0 < localDate(operationAt, zone)) return { refused: "effective_sleep_day_not_prospective" };
      if (current.activation.enabled && current.activation.effectiveSleepDay !== d0) return { refused: "active_policy_has_different_d0" };
      const runId = `hv-${d0}-${days}d`;
      const record = {
        status: "enabled", schemaVersion: HEALTHKIT_SLEEP_VALIDATION_POLICY_SCHEMA_VERSION,
        purpose: HEALTHKIT_SLEEP_VALIDATION_PURPOSE, runId, timeZone: zone,
        windowStartSleepDay: shiftDateKey(d0, -days), windowEndSleepDay: shiftDateKey(d0, -1),
        prospectiveEffectiveSleepDay: d0,
        strategicEvidenceEligibility: "quarantined", canonicalProductionHistory: false,
      };
      if (!resolveHealthKitSleepValidationPolicy(record).enabled) return { refused: "validation_window_invalid" };
      return {
        record,
        resolution: resolveHealthKitSleepValidationPolicy,
        verify: (resolved) => resolved.enabled && resolved.runId === runId && resolved.windowEndSleepDay === shiftDateKey(d0, -1),
      };
    }
    case HealthKitSleepPolicyAction.CLOSE_HISTORICAL_VALIDATION:
      return {
        // Keeps the run's window facts so the zero-write shape audit can
        // still summarize the stored validation samples after closing.
        record: {
          ...(stripVolatile(existing) ?? {}),
          status: "disabled", schemaVersion: HEALTHKIT_SLEEP_VALIDATION_POLICY_SCHEMA_VERSION,
          purpose: HEALTHKIT_SLEEP_VALIDATION_PURPOSE, strategicEvidenceEligibility: "quarantined", canonicalProductionHistory: false,
        },
        resolution: resolveHealthKitSleepValidationPolicy,
        verify: (resolved) => resolved.enabled === false,
      };
    default:
      return { refused: "action_invalid" };
  }
}

function digestKey(recordId) {
  if (recordId === HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID) return "activationPolicyDigest";
  if (recordId === HEALTHKIT_SLEEP_SOURCE_PREFERENCE_POLICY_RECORD_ID) return "sourcePreferenceDigest";
  return "validationPolicyDigest";
}

function stripVolatile(record) {
  if (!record) return null;
  const { version, updatedAt, authorizationReference, ...rest } = record;
  return rest;
}

function recordDigest(record) {
  if (!record) return null;
  return createHash("sha256").update(stable(record)).digest("hex").slice(0, 32);
}

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function localDate(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
