import { createHash } from "node:crypto";
import {
  HEALTHKIT_TRUSTED_WATCH_CORRELATION_POLICY_RECORD_ID,
  HEALTHKIT_TRUSTED_WATCH_CORRELATION_POLICY_SCHEMA_VERSION,
  resolveHealthKitTrustedWatchWorkoutCorrelationPolicy,
} from "../../domain/services/HealthKitTrustedWatchWorkoutCorrelationPolicy.js";

export const HEALTHKIT_TRUSTED_WATCH_CORRELATION_AUDIT_PREFIX = "healthkit_trusted_watch_correlation_audit_";
const COLLECTION = "healthKitConfiguration";

/**
 * Guarded prospective activation. Dry-run is zero-write. Apply requires the
 * exact dry-run facts and an attributable Founder authorization, and writes
 * only the policy plus one audit row. It never reads or rewrites a workout,
 * review, Logger session, strategic artifact, Activity day, or Sleep record.
 */
export async function runHealthKitTrustedWatchCorrelationPolicy({
  records,
  authorization,
  apply = false,
  expected = null,
  now = () => new Date(),
} = {}) {
  const ownerUserId = authorization?.ownerUserId;
  if (!ownerUserId) throw Object.assign(new Error("Owner authority is required."), { code: "OWNER_REQUIRED" });
  const get = (recordId) => records.get({ ownerUserId, collection: COLLECTION, recordId });
  const current = await get(HEALTHKIT_TRUSTED_WATCH_CORRELATION_POLICY_RECORD_ID);
  const facts = Object.freeze({
    policyDigest: digest(current),
    policyVersion: current?.version ?? null,
  });
  const bundleIdentifiers = authorization.trustedSourceBundleIdentifiers;
  const activityTypes = authorization.traditionalStrengthTrainingActivityTypes;
  const effectiveAt = authorization.effectiveAt;
  const tolerance = authorization.clockToleranceSeconds;
  if (JSON.stringify(bundleIdentifiers) !== JSON.stringify(["com.physiqueos.native.dev"])) {
    return Object.freeze({ outcome: "refused", reason: "trusted_source_bundle_must_match_audited_production_fact", facts });
  }
  if (JSON.stringify(activityTypes) !== JSON.stringify(["50"])) {
    return Object.freeze({ outcome: "refused", reason: "activity_types_must_be_exact_traditional_strength", facts });
  }
  if (tolerance !== 120) return Object.freeze({ outcome: "refused", reason: "clock_tolerance_must_be_120_seconds", facts });
  const parsedEffectiveAt = new Date(effectiveAt);
  if (!effectiveAt || Number.isNaN(parsedEffectiveAt.getTime()) || parsedEffectiveAt.toISOString() !== effectiveAt) {
    return Object.freeze({ outcome: "refused", reason: "effective_at_invalid", facts });
  }
  const desired = {
    id: HEALTHKIT_TRUSTED_WATCH_CORRELATION_POLICY_RECORD_ID,
    schemaVersion: HEALTHKIT_TRUSTED_WATCH_CORRELATION_POLICY_SCHEMA_VERSION,
    status: "enabled",
    prospectiveOnly: true,
    historicalBackfill: false,
    trustedSourceBundleIdentifiers: [...bundleIdentifiers],
    traditionalStrengthTrainingActivityTypes: [...activityTypes],
    clockToleranceSeconds: tolerance,
    effectiveAt,
    authorizationReference: String(authorization.authorizationReference ?? "") || null,
  };
  const resolution = resolveHealthKitTrustedWatchWorkoutCorrelationPolicy(desired);
  if (!resolution.enabled) return Object.freeze({ outcome: "refused", reason: resolution.invalidReason, facts });
  const alreadyApplied = current && digest(stripVolatile(current)) === digest(stripVolatile(desired));
  if (!alreadyApplied && parsedEffectiveAt.getTime() <= now().getTime()) {
    return Object.freeze({ outcome: "refused", reason: "effective_at_must_be_future", facts });
  }
  if (!apply) {
    return Object.freeze({
      outcome: alreadyApplied ? "already_applied" : "dry_run",
      recordId: HEALTHKIT_TRUSTED_WATCH_CORRELATION_POLICY_RECORD_ID,
      plannedRecordDigest: digest(stripVolatile(desired)),
      plannedResolution: resolution,
      predictedMutations: alreadyApplied ? [] : Object.freeze([
        Object.freeze({ collection: COLLECTION, recordId: HEALTHKIT_TRUSTED_WATCH_CORRELATION_POLICY_RECORD_ID, operation: current ? "update" : "create" }),
        Object.freeze({ collection: COLLECTION, recordIdPrefix: HEALTHKIT_TRUSTED_WATCH_CORRELATION_AUDIT_PREFIX, operation: "create" }),
      ]),
      invariants: Object.freeze({ prospectiveOnly: true, historicalBackfill: false, workoutRecordsTouched: 0, strategicArtifactsTouched: 0, sleepRecordsTouched: 0 }),
      facts,
    });
  }
  if (!String(authorization.authorizationReference ?? "").trim()) {
    return Object.freeze({ outcome: "refused", reason: "authorization_reference_required", facts });
  }
  if (!expected || JSON.stringify(expected) !== JSON.stringify(facts)) {
    return Object.freeze({ outcome: "refused", reason: "production_drifted_since_dry_run", facts, expected });
  }
  if (alreadyApplied) return Object.freeze({ outcome: "already_applied", facts, resolution });
  const appliedAt = now().toISOString();
  const written = await records.put({
    ownerUserId,
    collection: COLLECTION,
    recordId: HEALTHKIT_TRUSTED_WATCH_CORRELATION_POLICY_RECORD_ID,
    expectedVersion: current ? current.version : null,
    payload: { ...desired, updatedAt: appliedAt },
  });
  const auditId = `${HEALTHKIT_TRUSTED_WATCH_CORRELATION_AUDIT_PREFIX}${createHash("sha256")
    .update(`${ownerUserId}\u0000${effectiveAt}\u0000${appliedAt}`).digest("hex").slice(0, 32)}`;
  const audit = await records.putIfAbsent({
    ownerUserId,
    collection: COLLECTION,
    recordId: auditId,
    payload: {
      id: auditId,
      kind: "healthkit_trusted_watch_correlation_policy_audit",
      appliedAt,
      authorizationReference: desired.authorizationReference,
      beforeDigest: facts.policyDigest,
      afterDigest: digest(written),
      policyRecordId: HEALTHKIT_TRUSTED_WATCH_CORRELATION_POLICY_RECORD_ID,
      mutationContract: "policy_plus_this_audit_row_only",
    },
  });
  const reread = await get(HEALTHKIT_TRUSTED_WATCH_CORRELATION_POLICY_RECORD_ID);
  const verified = resolveHealthKitTrustedWatchWorkoutCorrelationPolicy(reread);
  if (!audit.created || !verified.enabled || verified.effectiveAt !== effectiveAt ||
    JSON.stringify(verified.trustedSourceBundleIdentifiers) !== JSON.stringify(bundleIdentifiers)) {
    throw Object.assign(new Error("Trusted Watch correlation policy verification failed after write."), {
      code: "TRUSTED_WATCH_CORRELATION_POLICY_VERIFICATION_FAILED",
    });
  }
  return Object.freeze({
    outcome: "applied",
    recordId: HEALTHKIT_TRUSTED_WATCH_CORRELATION_POLICY_RECORD_ID,
    auditId,
    resolution: verified,
    factsBefore: facts,
    mutations: Object.freeze([
      Object.freeze({ collection: COLLECTION, recordId: HEALTHKIT_TRUSTED_WATCH_CORRELATION_POLICY_RECORD_ID }),
      Object.freeze({ collection: COLLECTION, recordId: auditId }),
    ]),
  });
}

function stripVolatile(record) {
  if (!record) return null;
  const { version, updatedAt, authorizationReference, ...rest } = record;
  return rest;
}

function digest(value) {
  if (!value) return null;
  return createHash("sha256").update(stable(value)).digest("hex").slice(0, 32);
}

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
