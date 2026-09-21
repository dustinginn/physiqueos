import { createHash } from "node:crypto";
import {
  HEALTHKIT_CANONICAL_ACTIVATION_MAX_DAYS,
  HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
  HEALTHKIT_CANONICAL_ACTIVATION_POLICY_SCHEMA_VERSION,
  HEALTHKIT_WORKOUT_ACTIVATION_MAX_DAYS,
  HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID,
  HEALTHKIT_WORKOUT_ACTIVATION_POLICY_SCHEMA_VERSION,
  resolveHealthKitCanonicalActivationPolicy,
  resolveHealthKitWorkoutActivationPolicy,
} from "../../domain/services/HealthKitObservationService.js";
import { HEALTHKIT_CANONICAL_DAY_COLLECTION } from "../../domain/services/HealthKitEvidenceEligibilityPolicy.js";
import { HEALTHKIT_CANONICAL_WORKOUT_COLLECTION, classifyHealthKitWorkoutType, deriveHealthKitWorkoutLocalDate } from "../../domain/services/HealthKitWorkoutService.js";
import { HEALTHKIT_WORKOUT_LINK_COLLECTION } from "../../domain/services/HealthKitWorkoutLinkService.js";

export const HEALTHKIT_ACTIVATION_AUDIT_RECORD_PREFIX = "healthkit_canonical_activation_audit_";
export const HEALTHKIT_WORKOUT_ACTIVATION_AUDIT_RECORD_PREFIX = "healthkit_workout_activation_audit_";
const CONFIGURATION_COLLECTION = "healthKitConfiguration";
const OBSERVATION_COLLECTION = "healthKitObservations";
const EVIDENCE_COLLECTION = "canonicalEvidenceObjects";

export const HealthKitPolicyKind = Object.freeze({ DAILY: "daily", WORKOUT: "workout" });

// Two independent policies, each with its own record, exact window, and audit
// trail. Activating or deactivating one never reads, writes, or widens the
// other, and the runner proves that by digest.
const POLICY_KINDS = Object.freeze({
  [HealthKitPolicyKind.DAILY]: Object.freeze({
    recordId: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
    otherRecordId: HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID,
    auditPrefix: HEALTHKIT_ACTIVATION_AUDIT_RECORD_PREFIX,
    schemaVersion: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_SCHEMA_VERSION,
    maxDays: HEALTHKIT_CANONICAL_ACTIVATION_MAX_DAYS,
    resolve: resolveHealthKitCanonicalActivationPolicy,
    supportedDomains: ["activity", "nutrition"],
    dailyObservationTypes: ["activity_summary", "nutrition_daily_total"],
  }),
  [HealthKitPolicyKind.WORKOUT]: Object.freeze({
    recordId: HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID,
    otherRecordId: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
    auditPrefix: HEALTHKIT_WORKOUT_ACTIVATION_AUDIT_RECORD_PREFIX,
    schemaVersion: HEALTHKIT_WORKOUT_ACTIVATION_POLICY_SCHEMA_VERSION,
    maxDays: HEALTHKIT_WORKOUT_ACTIVATION_MAX_DAYS,
    resolve: resolveHealthKitWorkoutActivationPolicy,
    supportedDomains: ["workout"],
    dailyObservationTypes: [],
  }),
});

/**
 * Bounded, owner-scoped HealthKit activation-policy operation. This is the ONLY
 * writer of these policy records. `records` is the application's canonical
 * record store.
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
 *               "quarantined", historical backfill at false, and (Workout) link
 *               auto-confirm at false; none of them is a parameter.
 *   deactivate  set the policy to disabled. Canonical days, workouts, links,
 *               source observations, and Evidence are never deleted or changed.
 */
export async function runHealthKitActivationPolicy({
  records,
  authorization,
  action,
  policyKind = HealthKitPolicyKind.DAILY,
  apply = false,
  expected = null,
  now = () => new Date(),
} = {}) {
  const kind = POLICY_KINDS[policyKind];
  if (!kind) throw Object.assign(new Error("Unsupported policy kind."), { code: "POLICY_KIND_INVALID" });
  if (!["activate", "deactivate"].includes(action)) {
    throw Object.assign(new Error("Unsupported activation action."), { code: "ACTION_INVALID" });
  }
  const { ownerUserId } = authorization;
  const list = (collection) => records.list({ ownerUserId, collection });
  const [policyRecord, otherPolicyRecord, observations, canonicalDays, canonicalWorkouts, links, evidence] = await Promise.all([
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: kind.recordId }),
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: kind.otherRecordId }),
    list(OBSERVATION_COLLECTION),
    list(HEALTHKIT_CANONICAL_DAY_COLLECTION),
    list(HEALTHKIT_CANONICAL_WORKOUT_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_COLLECTION),
    list(EVIDENCE_COLLECTION),
  ]);
  const facts = collectFacts({ policyRecord, otherPolicyRecord, observations, canonicalDays, canonicalWorkouts, links, evidence });
  const current = kind.resolve(policyRecord);

  const planned = action === "activate"
    ? planActivation({ kind, policyKind, authorization, policyRecord, current, observations })
    : planDeactivation({ policyRecord, current });
  if (planned.refusal) return Object.freeze({ outcome: "refused", action, policyKind, reasons: [planned.refusal], facts });

  const auditRecordId = `${kind.auditPrefix}${digest(authorization.authorizationReference ?? "").slice(0, 12)}_${action}`;
  const summary = {
    action,
    policyKind,
    policy: planned.summary,
    auditRecordId,
    predictedMutations: [
      { collection: CONFIGURATION_COLLECTION, recordId: kind.recordId, operation: policyRecord ? "update" : "create" },
      { collection: CONFIGURATION_COLLECTION, recordId: auditRecordId, operation: "create" },
    ],
    unchangedByDesign: {
      healthKitObservations: facts.observationCount,
      healthKitCanonicalDays: facts.canonicalDayCount,
      healthKitCanonicalWorkouts: facts.canonicalWorkoutCount,
      healthKitWorkoutLinks: facts.linkCount,
      canonicalEvidenceObjects: facts.evidenceCount,
      otherPolicyRecord: facts.otherPolicyDigest ?? "absent",
    },
    historicalBackfill: false,
    strategicEvidenceEligibility: "quarantined",
    existingObservationsInWindowRemainRaw: planned.observationsInWindow ?? 0,
    ...(planned.workoutPreview ? { workoutPreview: planned.workoutPreview } : {}),
    facts,
  };
  if (!apply) return Object.freeze({ outcome: "dry_run", ...summary });

  const drift = compareFacts(expected, facts);
  if (drift.length > 0) return Object.freeze({ outcome: "drifted", drift, facts });
  if (!String(authorization.authorizationReference ?? "").trim()) {
    throw Object.assign(new Error("Apply requires an authorization reference."), { code: "AUTHORIZATION_REFERENCE_REQUIRED" });
  }

  const at = now().toISOString();
  const nextPolicy = { ...planned.record, id: kind.recordId, auditRecordId, updatedAt: at };
  const audit = await records.putIfAbsent({
    ownerUserId,
    collection: CONFIGURATION_COLLECTION,
    recordId: auditRecordId,
    sourceIdentity: auditRecordId,
    payload: {
      id: auditRecordId,
      kind: policyKind === HealthKitPolicyKind.WORKOUT ? "healthkit_workout_activation_audit" : "healthkit_canonical_activation_audit",
      action,
      at,
      authorizationReference: String(authorization.authorizationReference),
      policyRecordId: kind.recordId,
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
      recordId: kind.recordId,
      expectedVersion: policyRecord.version,
      sourceIdentity: kind.recordId,
      payload: nextPolicy,
    })
    : (await records.putIfAbsent({
      ownerUserId,
      collection: CONFIGURATION_COLLECTION,
      recordId: kind.recordId,
      sourceIdentity: kind.recordId,
      payload: nextPolicy,
    })).record;
  // In-transaction verification. Any failure throws and the caller rolls back.
  const [afterPolicy, afterOther, afterObservations, afterDays, afterWorkouts, afterLinks, afterEvidence] = await Promise.all([
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: kind.recordId }),
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: kind.otherRecordId }),
    list(OBSERVATION_COLLECTION),
    list(HEALTHKIT_CANONICAL_DAY_COLLECTION),
    list(HEALTHKIT_CANONICAL_WORKOUT_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_COLLECTION),
    list(EVIDENCE_COLLECTION),
  ]);
  const resolved = kind.resolve(afterPolicy);
  const invariants = {
    policyIsExactlyTheAuthorizedRecord: action === "activate"
      ? resolved.enabled &&
        resolved.effectiveLocalDate === authorization.effectiveLocalDate &&
        resolved.endLocalDate === authorization.endLocalDate &&
        sameSet(resolved.domains ?? kind.supportedDomains, authorization.domains)
      : afterPolicy?.status === "disabled" && resolved.enabled === false,
    strategicEligibilityQuarantined: afterPolicy?.strategicEvidenceEligibility === "quarantined",
    noBackfillRequested: afterPolicy?.historicalBackfill === false,
    ...(policyKind === HealthKitPolicyKind.WORKOUT ? { linkAutoConfirmOff: afterPolicy?.linkAutoConfirm === false } : {}),
    auditRowPresent: audit.record?.id === auditRecordId,
    otherPolicyUntouched: (afterOther ? digest(stable(afterOther)) : null) === facts.otherPolicyDigest,
    observationsUnchanged: afterObservations.length === facts.observationCount && listDigest(afterObservations) === facts.observationsDigest,
    canonicalDaysUnchanged: afterDays.length === facts.canonicalDayCount && listDigest(afterDays) === facts.canonicalDaysDigest,
    canonicalWorkoutsUnchanged: afterWorkouts.length === facts.canonicalWorkoutCount && listDigest(afterWorkouts) === facts.canonicalWorkoutsDigest,
    linksUnchanged: afterLinks.length === facts.linkCount && listDigest(afterLinks) === facts.linksDigest,
    evidenceUnchanged: afterEvidence.length === facts.evidenceCount && listDigest(afterEvidence) === facts.evidenceDigest,
  };
  if (Object.values(invariants).some((ok) => ok !== true)) {
    throw Object.assign(new Error("Post-write invariants failed."), { code: "POST_WRITE_INVARIANT_FAILED", invariants });
  }
  return Object.freeze({ outcome: "applied", ...summary, invariants, policyVersion: written.version });
}

function planActivation({ kind, policyKind, authorization, policyRecord, current, observations }) {
  const { domains, effectiveLocalDate, endLocalDate } = authorization;
  const candidate = {
    schemaVersion: kind.schemaVersion,
    status: "enabled",
    domains: [...new Set(domains ?? [])].sort(),
    effectiveLocalDate,
    endLocalDate,
    strategicEvidenceEligibility: "quarantined",
    historicalBackfill: false,
    ...(policyKind === HealthKitPolicyKind.WORKOUT ? { linkAutoConfirm: false } : {}),
    authorizationReference: String(authorization.authorizationReference ?? ""),
  };
  const resolved = kind.resolve(candidate);
  if (!resolved.enabled) {
    return { refusal: `The requested policy is not valid (${resolved.invalidReason ?? "unknown"}): domains must be ${kind.supportedDomains.join(" and/or ")} and the window at most ${kind.maxDays} local days.` };
  }
  // A workout's day is derived from its own start in its own time zone, the
  // same rule ingestion applies, not from the client label.
  const effectiveDate = (record) => (record.observationType === "workout"
    ? deriveHealthKitWorkoutLocalDate({ startedAt: record.occurrence?.startedAt, timeZone: record.occurrence?.timeZone })
    : null) ?? record.occurrenceDate;
  const inWindow = (record) => effectiveDate(record) >= resolved.effectiveLocalDate && effectiveDate(record) <= resolved.endLocalDate;
  const validationOnlyInWindow = observations.filter((record) =>
    inWindow(record) && kind.dailyObservationTypes.includes(record.observationType) &&
    record.ingestionPurpose === "validation_only"
  ).length;
  if (validationOnlyInWindow > 0) {
    return { refusal: `${validationOnlyInWindow} validation-only observation(s) already exist inside the window; an operational upload for those dates could collide with their immutable purpose. Choose a window with no validation-only data.` };
  }
  if (current.enabled) {
    return { refusal: "A canonical activation policy is already enabled. Deactivate it first; windows are never widened in place." };
  }
  const workoutPreview = policyKind === HealthKitPolicyKind.WORKOUT ? previewWorkouts(observations.filter(inWindow)) : null;
  return {
    record: candidate,
    summary: {
      status: "enabled",
      domains: resolved.domains ?? kind.supportedDomains,
      effectiveLocalDate: resolved.effectiveLocalDate,
      endLocalDate: resolved.endLocalDate,
    },
    observationsInWindow: policyKind === HealthKitPolicyKind.WORKOUT
      ? observations.filter((record) => inWindow(record) && record.observationType === "workout").length
      : observations.filter((record) =>
        inWindow(record) && kind.dailyObservationTypes.includes(record.observationType) && record.ingestionPurpose !== "validation_only"
      ).length,
    workoutPreview,
    previouslyPresent: Boolean(policyRecord),
  };
}

// Proving mechanism for a future exact-window Workout canary: how the same
// classification the ingestion path uses sees the raw workouts already in the
// window. Already-stored raw observations are never reconsidered, so this also
// shows what would stay raw if a sync happened before activation.
function previewWorkouts(inWindowObservations) {
  const families = { strength: 0, cardio: 0, unsupported: 0 };
  for (const record of inWindowObservations.filter((item) => item.observationType === "workout")) {
    families[classifyHealthKitWorkoutType(record.measurement?.activityType).family] += 1;
  }
  return {
    rawWorkoutObservationsInWindow: families.strength + families.cardio + families.unsupported,
    byFamily: families,
    note: "existing raw workout observations are never reconsidered; activate before the first sync",
  };
}

function planDeactivation({ policyRecord, current }) {
  if (!policyRecord) return { refusal: "No canonical activation policy exists to deactivate." };
  if (!current.enabled) return { refusal: "The canonical activation policy is not enabled." };
  return {
    record: { ...policyRecord, status: "disabled" },
    summary: {
      status: "disabled",
      domains: current.domains ?? ["workout"],
      effectiveLocalDate: current.effectiveLocalDate,
      endLocalDate: current.endLocalDate,
    },
  };
}

function collectFacts({ policyRecord, otherPolicyRecord, observations, canonicalDays, canonicalWorkouts, links, evidence }) {
  return {
    policyPresent: Boolean(policyRecord),
    policyStatus: policyRecord?.status ?? null,
    policyDigest: policyRecord ? digest(stable(policyRecord)) : null,
    otherPolicyDigest: otherPolicyRecord ? digest(stable(otherPolicyRecord)) : null,
    observationCount: observations.length,
    observationsDigest: listDigest(observations),
    canonicalDayCount: canonicalDays.length,
    canonicalDaysDigest: listDigest(canonicalDays),
    canonicalWorkoutCount: canonicalWorkouts.length,
    canonicalWorkoutsDigest: listDigest(canonicalWorkouts),
    linkCount: links.length,
    linksDigest: listDigest(links),
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
