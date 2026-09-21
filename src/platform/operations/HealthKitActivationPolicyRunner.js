import { createHash } from "node:crypto";
import {
  HEALTHKIT_CANONICAL_ACTIVATION_MAX_DAYS,
  HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
  HEALTHKIT_CANONICAL_ACTIVATION_POLICY_SCHEMA_VERSION,
  resolveHealthKitCanonicalActivationPolicy,
} from "../../domain/services/HealthKitObservationService.js";
import { HEALTHKIT_CANONICAL_DAY_COLLECTION } from "../../domain/services/HealthKitEvidenceEligibilityPolicy.js";

export const HEALTHKIT_ACTIVATION_AUDIT_RECORD_PREFIX = "healthkit_canonical_activation_audit_";
const CONFIGURATION_COLLECTION = "healthKitConfiguration";
const OBSERVATION_COLLECTION = "healthKitObservations";
const EVIDENCE_COLLECTION = "canonicalEvidenceObjects";

/**
 * Bounded, owner-scoped HealthKit canonical activation-policy operation.
 * This is the ONLY writer of the policy record. `records` is the application's
 * canonical record store.
 *
 *   dry-run  reads current state and predicts the exact effect; writes nothing.
 *   apply    requires the `expected` facts captured by an immediately preceding
 *            dry run, refuses (writes nothing) if production drifted, writes
 *            exactly the policy record and one audit row, and verifies inside
 *            the same transaction (a failed invariant throws so the caller
 *            rolls back).
 *
 *   activate    enable canonicalization for explicit domains and an exact
 *               local-date window. Strategic Evidence eligibility is fixed at
 *               "quarantined" and historical backfill at false; neither is a
 *               parameter.
 *   deactivate  set the policy to disabled. Canonical days, source
 *               observations, and Evidence are never deleted or changed.
 */
export async function runHealthKitActivationPolicy({
  records,
  authorization,
  action,
  apply = false,
  expected = null,
  now = () => new Date(),
} = {}) {
  if (!["activate", "deactivate"].includes(action)) {
    throw Object.assign(new Error("Unsupported activation action."), { code: "ACTION_INVALID" });
  }
  const { ownerUserId } = authorization;
  const [policyRecord, observations, canonicalDays, evidence] = await Promise.all([
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID }),
    records.list({ ownerUserId, collection: OBSERVATION_COLLECTION }),
    records.list({ ownerUserId, collection: HEALTHKIT_CANONICAL_DAY_COLLECTION }),
    records.list({ ownerUserId, collection: EVIDENCE_COLLECTION }),
  ]);
  const facts = collectFacts({ policyRecord, observations, canonicalDays, evidence });
  const current = resolveHealthKitCanonicalActivationPolicy(policyRecord);

  const planned = action === "activate"
    ? planActivation({ authorization, policyRecord, current, observations })
    : planDeactivation({ policyRecord, current });
  if (planned.refusal) return Object.freeze({ outcome: "refused", action, reasons: [planned.refusal], facts });

  const auditRecordId = `${HEALTHKIT_ACTIVATION_AUDIT_RECORD_PREFIX}${digest(authorization.authorizationReference ?? "").slice(0, 12)}_${action}`;
  const summary = {
    action,
    policy: planned.summary,
    auditRecordId,
    predictedMutations: [
      { collection: CONFIGURATION_COLLECTION, recordId: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID, operation: policyRecord ? "update" : "create" },
      { collection: CONFIGURATION_COLLECTION, recordId: auditRecordId, operation: "create" },
    ],
    unchangedByDesign: {
      healthKitObservations: facts.observationCount,
      healthKitCanonicalDays: facts.canonicalDayCount,
      canonicalEvidenceObjects: facts.evidenceCount,
    },
    historicalBackfill: false,
    strategicEvidenceEligibility: "quarantined",
    existingObservationsInWindowRemainRaw: planned.observationsInWindow ?? 0,
    facts,
  };
  if (!apply) return Object.freeze({ outcome: "dry_run", ...summary });

  const drift = compareFacts(expected, facts);
  if (drift.length > 0) return Object.freeze({ outcome: "drifted", drift, facts });
  if (!String(authorization.authorizationReference ?? "").trim()) {
    throw Object.assign(new Error("Apply requires an authorization reference."), { code: "AUTHORIZATION_REFERENCE_REQUIRED" });
  }

  const at = now().toISOString();
  const nextPolicy = {
    ...planned.record,
    id: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
    auditRecordId,
    updatedAt: at,
  };
  const audit = await records.putIfAbsent({
    ownerUserId,
    collection: CONFIGURATION_COLLECTION,
    recordId: auditRecordId,
    sourceIdentity: auditRecordId,
    payload: {
      id: auditRecordId,
      kind: "healthkit_canonical_activation_audit",
      action,
      at,
      authorizationReference: String(authorization.authorizationReference),
      policyRecordId: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
      before: { status: policyRecord?.status ?? null, digest: facts.policyDigest },
      after: planned.summary,
      strategicEvidenceEligibility: "quarantined",
      historicalBackfill: false,
    },
  });
  if (!audit.created) {
    throw Object.assign(new Error("This authorization reference was already used for this action."), { code: "AUDIT_ROW_EXISTS" });
  }

  const written = policyRecord
    ? await records.put({
      ownerUserId,
      collection: CONFIGURATION_COLLECTION,
      recordId: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
      expectedVersion: policyRecord.version,
      sourceIdentity: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
      payload: nextPolicy,
    })
    : (await records.putIfAbsent({
      ownerUserId,
      collection: CONFIGURATION_COLLECTION,
      recordId: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
      sourceIdentity: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
      payload: nextPolicy,
    })).record;
  // In-transaction verification. Any failure throws and the caller rolls back.
  const [afterPolicy, afterObservations, afterDays, afterEvidence] = await Promise.all([
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID }),
    records.list({ ownerUserId, collection: OBSERVATION_COLLECTION }),
    records.list({ ownerUserId, collection: HEALTHKIT_CANONICAL_DAY_COLLECTION }),
    records.list({ ownerUserId, collection: EVIDENCE_COLLECTION }),
  ]);
  const resolved = resolveHealthKitCanonicalActivationPolicy(afterPolicy);
  const invariants = {
    policyIsExactlyTheAuthorizedRecord: action === "activate"
      ? resolved.enabled &&
        resolved.effectiveLocalDate === authorization.effectiveLocalDate &&
        resolved.endLocalDate === authorization.endLocalDate &&
        sameSet(resolved.domains, authorization.domains)
      : afterPolicy?.status === "disabled" && resolved.enabled === false,
    strategicEligibilityQuarantined: afterPolicy?.strategicEvidenceEligibility === "quarantined",
    noBackfillRequested: afterPolicy?.historicalBackfill === false,
    auditRowPresent: audit.record?.id === auditRecordId,
    observationsUnchanged: afterObservations.length === facts.observationCount && listDigest(afterObservations) === facts.observationsDigest,
    canonicalDaysUnchanged: afterDays.length === facts.canonicalDayCount && listDigest(afterDays) === facts.canonicalDaysDigest,
    evidenceUnchanged: afterEvidence.length === facts.evidenceCount && listDigest(afterEvidence) === facts.evidenceDigest,
  };
  if (Object.values(invariants).some((ok) => ok !== true)) {
    throw Object.assign(new Error("Post-write invariants failed."), { code: "POST_WRITE_INVARIANT_FAILED", invariants });
  }
  return Object.freeze({ outcome: "applied", ...summary, invariants, policyVersion: written.version });
}

function planActivation({ authorization, policyRecord, current, observations }) {
  const { domains, effectiveLocalDate, endLocalDate } = authorization;
  const candidate = {
    schemaVersion: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_SCHEMA_VERSION,
    status: "enabled",
    domains: [...new Set(domains ?? [])].sort(),
    effectiveLocalDate,
    endLocalDate,
    strategicEvidenceEligibility: "quarantined",
    historicalBackfill: false,
    authorizationReference: String(authorization.authorizationReference ?? ""),
  };
  const resolved = resolveHealthKitCanonicalActivationPolicy(candidate);
  if (!resolved.enabled) {
    return { refusal: `The requested policy is not valid (${resolved.invalidReason ?? "unknown"}): domains must be activity and/or nutrition and the window at most ${HEALTHKIT_CANONICAL_ACTIVATION_MAX_DAYS} local days.` };
  }
  if (current.enabled) {
    return { refusal: "A canonical activation policy is already enabled. Deactivate it first; windows are never widened in place." };
  }
  return {
    record: candidate,
    summary: {
      status: "enabled",
      domains: resolved.domains,
      effectiveLocalDate: resolved.effectiveLocalDate,
      endLocalDate: resolved.endLocalDate,
    },
    observationsInWindow: observations.filter((record) =>
      record.occurrenceDate >= resolved.effectiveLocalDate && record.occurrenceDate <= resolved.endLocalDate &&
      ["activity_summary", "nutrition_daily_total"].includes(record.observationType) &&
      record.ingestionPurpose !== "validation_only"
    ).length,
    previouslyPresent: Boolean(policyRecord),
  };
}

function planDeactivation({ policyRecord, current }) {
  if (!policyRecord) return { refusal: "No canonical activation policy exists to deactivate." };
  if (!current.enabled) return { refusal: "The canonical activation policy is not enabled." };
  return {
    record: { ...policyRecord, status: "disabled" },
    summary: {
      status: "disabled",
      domains: current.domains,
      effectiveLocalDate: current.effectiveLocalDate,
      endLocalDate: current.endLocalDate,
    },
  };
}

function collectFacts({ policyRecord, observations, canonicalDays, evidence }) {
  return {
    policyPresent: Boolean(policyRecord),
    policyStatus: policyRecord?.status ?? null,
    policyDigest: policyRecord ? digest(stable(policyRecord)) : null,
    observationCount: observations.length,
    observationsDigest: listDigest(observations),
    canonicalDayCount: canonicalDays.length,
    canonicalDaysDigest: listDigest(canonicalDays),
    evidenceCount: evidence.length,
    evidenceDigest: listDigest(evidence),
  };
}

function compareFacts(expected, actual) {
  if (!expected || typeof expected !== "object") return ["expected facts are required for apply"];
  return Object.keys(actual).filter((key) => JSON.stringify(expected[key] ?? null) !== JSON.stringify(actual[key] ?? null));
}

function listDigest(list) {
  return digest(list.map((record) => `${record.id ?? record.canonicalId}:${record.version ?? 1}:${digest(stable(record))}`).sort().join(","));
}

function sameSet(left, right) {
  return JSON.stringify([...new Set(left ?? [])].sort()) === JSON.stringify([...new Set(right ?? [])].sort());
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 32);
}

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
