import { createHash } from "node:crypto";
import {
  HEALTHKIT_CANONICAL_ACTIVATION_MAX_DAYS,
  HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
  HEALTHKIT_CANONICAL_ACTIVATION_POLICY_SCHEMA_VERSION,
  HEALTHKIT_WORKOUT_ACTIVATION_FAMILIES,
  HEALTHKIT_WORKOUT_ACTIVATION_MAX_DAYS,
  HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID,
  HEALTHKIT_WORKOUT_ACTIVATION_POLICY_SCHEMA_VERSION,
  resolveHealthKitCanonicalActivationPolicy,
  resolveHealthKitWorkoutActivationPolicy,
} from "../../domain/services/HealthKitObservationService.js";
import { HEALTHKIT_CANONICAL_DAY_COLLECTION } from "../../domain/services/HealthKitEvidenceEligibilityPolicy.js";
import { HEALTHKIT_CANONICAL_WORKOUT_COLLECTION, classifyHealthKitWorkoutType, deriveHealthKitWorkoutLocalDate } from "../../domain/services/HealthKitWorkoutService.js";
import { HEALTHKIT_WORKOUT_LINK_COLLECTION } from "../../domain/services/HealthKitWorkoutLinkService.js";
import { HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION } from "../../domain/services/HealthKitWorkoutRelationshipService.js";

export const HEALTHKIT_ACTIVATION_AUDIT_RECORD_PREFIX = "healthkit_canonical_activation_audit_";
export const HEALTHKIT_WORKOUT_ACTIVATION_AUDIT_RECORD_PREFIX = "healthkit_workout_activation_audit_";
export const HEALTHKIT_WORKOUT_FAMILY_REPLACEMENT_AUDIT_KIND = "healthkit_workout_family_replacement_audit";
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
    // Normal, permanent daily-driver operation needs a forward window with no
    // end date.
    supportsOpenEnded: true,
    supportsFamilies: false,
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
    // Prospective (open-ended) Workout operation is scoped by family: the
    // Strength graduation enables exactly ["strength"], cardio stays a
    // separate, later decision. A bounded canary may still name every family.
    supportsOpenEnded: true,
    supportsFamilies: true,
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
 *               "quarantined" and historical backfill at false.
 *   set-link-auto-confirm
 *               separately toggle only the Workout auto-confirm flag while
 *               preserving the already-active scope, window, families, and
 *               every strategic/backfill guard.
 *   replace-families
 *               Workout policy only. Atomically replace an already-enabled
 *               policy's exact family scope in ONE guarded transaction, so no
 *               disabled-policy window is ever visible to ingestion (the
 *               deactivate-then-reactivate path this exists to eliminate).
 *               The caller must restate the exact CURRENT family set
 *               (`expectedCurrentFamilies`) and the current policy record's
 *               digest (`expectedCurrentPolicyDigest`); either mismatching the
 *               live record refuses cleanly. The target `families` is taken
 *               literally with no implicit union with the current set; if it
 *               would drop any currently-enabled family the caller must pass
 *               `acknowledgeNarrowing: true` or the operation refuses. Every
 *               other field (window, openEnded, linkAutoConfirm, strategic
 *               eligibility, backfill) is carried forward unchanged. Replaying
 *               the identical authorized request after it already applied is
 *               a safe no-op.
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
  if (!["activate", "deactivate", "set-link-auto-confirm", "replace-families"].includes(action)) {
    throw Object.assign(new Error("Unsupported activation action."), { code: "ACTION_INVALID" });
  }
  const { ownerUserId } = authorization;
  const list = (collection) => records.list({ ownerUserId, collection });
  const [policyRecord, otherPolicyRecord, observations, canonicalDays, canonicalWorkouts, links, claims, evidence] = await Promise.all([
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: kind.recordId }),
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: kind.otherRecordId }),
    list(OBSERVATION_COLLECTION),
    list(HEALTHKIT_CANONICAL_DAY_COLLECTION),
    list(HEALTHKIT_CANONICAL_WORKOUT_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION),
    list(EVIDENCE_COLLECTION),
  ]);
  const facts = collectFacts({ policyRecord, otherPolicyRecord, observations, canonicalDays, canonicalWorkouts, links, claims, evidence });
  const current = kind.resolve(policyRecord);
  const operationAt = now().toISOString();

  if (action === "replace-families") {
    return runFamilyReplacement({
      records, ownerUserId, kind, policyKind, authorization, policyRecord, current, facts, operationAt, apply, expected,
    });
  }

  const planned = action === "activate"
    ? planActivation({ kind, policyKind, authorization, policyRecord, current, observations })
    : action === "deactivate"
      ? planDeactivation({ policyRecord, current })
      : planLinkAutoConfirm({ policyKind, authorization, policyRecord, current, operationAt });
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

  const at = operationAt;
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
  const [afterPolicy, afterOther, afterObservations, afterDays, afterWorkouts, afterLinks, afterClaims, afterEvidence] = await Promise.all([
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: kind.recordId }),
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: kind.otherRecordId }),
    list(OBSERVATION_COLLECTION),
    list(HEALTHKIT_CANONICAL_DAY_COLLECTION),
    list(HEALTHKIT_CANONICAL_WORKOUT_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION),
    list(EVIDENCE_COLLECTION),
  ]);
  const resolved = kind.resolve(afterPolicy);
  const invariants = {
    policyIsExactlyTheAuthorizedRecord: action === "activate"
      ? resolved.enabled &&
        resolved.effectiveLocalDate === authorization.effectiveLocalDate &&
        (authorization.openEnded === true ? resolved.endLocalDate === null : resolved.endLocalDate === authorization.endLocalDate) &&
        (resolved.openEnded === true) === (authorization.openEnded === true) &&
        sameSet(resolved.domains ?? kind.supportedDomains, authorization.domains)
      : action === "deactivate"
        ? afterPolicy?.status === "disabled" && resolved.enabled === false
        : resolved.enabled && resolved.linkAutoConfirm === authorization.linkAutoConfirm &&
          resolved.linkAutoConfirmEffectiveAt === (authorization.linkAutoConfirm ? at : null) &&
          afterPolicy?.effectiveLocalDate === policyRecord?.effectiveLocalDate &&
          (afterPolicy?.endLocalDate ?? null) === (policyRecord?.endLocalDate ?? null) &&
          sameSet(afterPolicy?.families ?? HEALTHKIT_WORKOUT_ACTIVATION_FAMILIES, policyRecord?.families ?? HEALTHKIT_WORKOUT_ACTIVATION_FAMILIES),
    strategicEligibilityQuarantined: afterPolicy?.strategicEvidenceEligibility === "quarantined",
    noBackfillRequested: afterPolicy?.historicalBackfill === false,
    ...(policyKind === HealthKitPolicyKind.WORKOUT
      ? {
        ...(action === "set-link-auto-confirm"
          ? {
              linkAutoConfirmIsExactlyAuthorized: afterPolicy?.linkAutoConfirm === authorization.linkAutoConfirm,
              linkAutoConfirmIsProspective: authorization.linkAutoConfirm
                ? resolved.linkAutoConfirmEffectiveAt === at
                : resolved.linkAutoConfirmEffectiveAt === null,
            }
          : { linkAutoConfirmOff: afterPolicy?.linkAutoConfirm === false }),
        // The stored and resolved family scope is exactly what was authorized
        // (an activation without an explicit list means every family).
        familiesAreExactlyAuthorized: action === "activate"
          ? sameSet(afterPolicy?.families ?? HEALTHKIT_WORKOUT_ACTIVATION_FAMILIES, authorization.families ?? HEALTHKIT_WORKOUT_ACTIVATION_FAMILIES) &&
            sameSet(resolved.families, authorization.families ?? HEALTHKIT_WORKOUT_ACTIVATION_FAMILIES)
          : true,
      }
      : {}),
    auditRowPresent: audit.record?.id === auditRecordId,
    otherPolicyUntouched: (afterOther ? digest(stable(afterOther)) : null) === facts.otherPolicyDigest,
    observationsUnchanged: afterObservations.length === facts.observationCount && listDigest(afterObservations) === facts.observationsDigest,
    canonicalDaysUnchanged: afterDays.length === facts.canonicalDayCount && listDigest(afterDays) === facts.canonicalDaysDigest,
    canonicalWorkoutsUnchanged: afterWorkouts.length === facts.canonicalWorkoutCount && listDigest(afterWorkouts) === facts.canonicalWorkoutsDigest,
    linksUnchanged: afterLinks.length === facts.linkCount && listDigest(afterLinks) === facts.linksDigest,
    claimsUnchanged: afterClaims.length === facts.claimCount && listDigest(afterClaims) === facts.claimsDigest,
    evidenceUnchanged: afterEvidence.length === facts.evidenceCount && listDigest(afterEvidence) === facts.evidenceDigest,
  };
  if (Object.values(invariants).some((ok) => ok !== true)) {
    throw Object.assign(new Error("Post-write invariants failed."), { code: "POST_WRITE_INVARIANT_FAILED", invariants });
  }
  return Object.freeze({ outcome: "applied", ...summary, invariants, policyVersion: written.version });
}

function planActivation({ kind, policyKind, authorization, policyRecord, current, observations }) {
  const { domains, effectiveLocalDate, endLocalDate, openEnded, families } = authorization;
  if (openEnded === true && !kind.supportsOpenEnded) {
    return { refusal: `The ${policyKind} policy does not support an open-ended window; provide an exact endLocalDate at most ${kind.maxDays} local days from effectiveLocalDate.` };
  }
  if (families !== undefined && !kind.supportsFamilies) {
    return { refusal: `The ${policyKind} policy has no family scope; families apply to the workout policy only.` };
  }
  if (families !== undefined && !Array.isArray(families)) {
    return { refusal: "families must be a list of workout families when provided." };
  }
  // The family scope is always written explicitly so the stored record says
  // what it covers; an authorization without one means every family.
  const plannedFamilies = kind.supportsFamilies
    ? [...new Set(families ?? HEALTHKIT_WORKOUT_ACTIVATION_FAMILIES)].sort()
    : null;
  const candidate = {
    schemaVersion: kind.schemaVersion,
    status: "enabled",
    domains: [...new Set(domains ?? [])].sort(),
    effectiveLocalDate,
    ...(openEnded === true ? { openEnded: true } : { endLocalDate }),
    strategicEvidenceEligibility: "quarantined",
    historicalBackfill: false,
    ...(policyKind === HealthKitPolicyKind.WORKOUT
      ? { linkAutoConfirm: false, linkAutoConfirmEffectiveAt: null, families: plannedFamilies }
      : {}),
    authorizationReference: String(authorization.authorizationReference ?? ""),
  };
  const resolved = kind.resolve(candidate);
  if (!resolved.enabled) {
    const windowDescription = kind.supportsOpenEnded
      ? `the window either open-ended (no end date) or at most ${kind.maxDays} local days`
      : `the window at most ${kind.maxDays} local days`;
    const familiesDescription = kind.supportsFamilies ? `, families a non-empty subset of ${HEALTHKIT_WORKOUT_ACTIVATION_FAMILIES.join("/")}` : "";
    return { refusal: `The requested policy is not valid (${resolved.invalidReason ?? "unknown"}): domains must be ${kind.supportedDomains.join(" and/or ")} and ${windowDescription}${familiesDescription}.` };
  }
  // A workout's day is derived from its own start in its own time zone, the
  // same rule ingestion applies, not from the client label. An open-ended
  // resolved window has no upper bound: nothing is ever after it.
  const effectiveDate = (record) => (record.observationType === "workout"
    ? deriveHealthKitWorkoutLocalDate({ startedAt: record.occurrence?.startedAt, timeZone: record.occurrence?.timeZone })
    : null) ?? record.occurrenceDate;
  const inWindow = (record) => effectiveDate(record) >= resolved.effectiveLocalDate &&
    (resolved.endLocalDate === null || effectiveDate(record) <= resolved.endLocalDate);
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
    families: plannedFamilies,
    summary: {
      status: "enabled",
      domains: resolved.domains ?? kind.supportedDomains,
      effectiveLocalDate: resolved.effectiveLocalDate,
      endLocalDate: resolved.endLocalDate,
      openEnded: resolved.openEnded === true,
      ...(kind.supportsFamilies ? { families: resolved.families } : {}),
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
      openEnded: current.openEnded === true,
      ...(current.families ? { families: current.families } : {}),
    },
  };
}

function planLinkAutoConfirm({ policyKind, authorization, policyRecord, current, operationAt }) {
  if (policyKind !== HealthKitPolicyKind.WORKOUT) {
    return { refusal: "Automatic link confirmation belongs to the workout policy only." };
  }
  if (typeof authorization.linkAutoConfirm !== "boolean") {
    return { refusal: "linkAutoConfirm must be an explicit boolean." };
  }
  if (!policyRecord || !current.enabled) {
    return { refusal: "The workout activation policy must already be enabled before automatic link confirmation is configured." };
  }
  if (current.linkAutoConfirm === authorization.linkAutoConfirm) {
    return { refusal: `Workout automatic link confirmation is already ${authorization.linkAutoConfirm ? "enabled" : "disabled"}.` };
  }
  const effectiveAt = authorization.linkAutoConfirm ? operationAt : null;
  return {
    record: {
      ...policyRecord,
      linkAutoConfirm: authorization.linkAutoConfirm,
      linkAutoConfirmEffectiveAt: effectiveAt,
    },
    summary: {
      status: "enabled",
      domains: ["workout"],
      effectiveLocalDate: current.effectiveLocalDate,
      endLocalDate: current.endLocalDate,
      openEnded: current.openEnded === true,
      families: current.families,
      linkAutoConfirm: authorization.linkAutoConfirm,
      linkAutoConfirmEffectiveAt: effectiveAt,
    },
    observationsInWindow: 0,
    previouslyPresent: true,
  };
}

// Atomically replaces an already-enabled Workout policy's exact family scope
// in one guarded transaction: no separate deactivate/reactivate pair, and
// therefore no disabled-policy window for ingestion to observe. This never
// widens, narrows, or touches anything else about the policy implicitly — the
// target family list is authoritative and literal, and every other field
// (window, openEnded, linkAutoConfirm, strategic eligibility, backfill) is
// carried forward byte-for-byte from the current record.
async function runFamilyReplacement({ records, ownerUserId, kind, policyKind, authorization, policyRecord, current, facts, operationAt, apply, expected }) {
  const refuse = (reason, detail = {}) => Object.freeze({ outcome: "refused", action: "replace-families", policyKind, reasons: [reason], ...detail, facts });

  if (policyKind !== HealthKitPolicyKind.WORKOUT || !kind.supportsFamilies) {
    return refuse("Family-scope replacement belongs to the workout policy only.");
  }
  if (!policyRecord || !current.enabled) {
    return refuse("The workout activation policy must already be enabled before its family scope can be replaced. Use activate first.");
  }

  const { families, expectedCurrentFamilies, expectedCurrentPolicyDigest, acknowledgeNarrowing, authorizationReference } = authorization;
  if (!Array.isArray(families) || families.length === 0 || families.some((family) => typeof family !== "string")) {
    return refuse("families must be a non-empty explicit list of the exact target family scope.");
  }
  const targetFamilies = [...new Set(families)].sort();
  if (targetFamilies.length !== families.length) {
    return refuse("families must not contain duplicate entries; the target scope is stated exactly once per family.");
  }
  if (!targetFamilies.every((family) => HEALTHKIT_WORKOUT_ACTIVATION_FAMILIES.includes(family))) {
    return refuse(`families must be a subset of ${HEALTHKIT_WORKOUT_ACTIVATION_FAMILIES.join("/")}.`);
  }

  const auditRecordId = `${HEALTHKIT_WORKOUT_ACTIVATION_AUDIT_RECORD_PREFIX}${digest(authorizationReference ?? "").slice(0, 12)}_replace-families`;
  const summaryOf = (targetSet) => ({
    status: "enabled",
    domains: current.domains ?? ["workout"],
    effectiveLocalDate: current.effectiveLocalDate,
    endLocalDate: current.endLocalDate,
    openEnded: current.openEnded === true,
    families: targetSet,
    linkAutoConfirm: current.linkAutoConfirm,
  });

  // Idempotent replay: the exact target scope is already live. Nothing to
  // write; the only question is whether this authorization already earned
  // that state (a safe no-op) or the state was reached some other way (which
  // this authorization reference may not silently claim).
  if (sameSet(current.families, targetFamilies)) {
    const summary = summaryOf(targetFamilies);
    if (!apply) return Object.freeze({ outcome: "already_replaced", action: "replace-families", policyKind, policy: summary, facts });
    if (!String(authorizationReference ?? "").trim()) {
      throw Object.assign(new Error("Apply requires an authorization reference."), { code: "AUTHORIZATION_REFERENCE_REQUIRED" });
    }
    const existingAudit = await records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: auditRecordId });
    if (existingAudit?.kind === HEALTHKIT_WORKOUT_FAMILY_REPLACEMENT_AUDIT_KIND &&
      existingAudit?.authorizationReference === String(authorizationReference) &&
      sameSet(existingAudit?.after?.families ?? [], targetFamilies)) {
      return Object.freeze({ outcome: "already_replaced", action: "replace-families", policyKind, policy: summary, auditRecordId, facts });
    }
    const replayDrift = compareFacts(expected, facts);
    if (replayDrift.length > 0) return Object.freeze({ outcome: "drifted", drift: replayDrift, facts });
    return refuse("The policy already matches the requested family scope but not through a matching authorized replacement; review before reusing this authorization reference.");
  }

  if (!Array.isArray(expectedCurrentFamilies) || expectedCurrentFamilies.length === 0) {
    return refuse("expectedCurrentFamilies must be the exact family set the caller believes is currently enabled.");
  }
  if (!sameSet(expectedCurrentFamilies, current.families)) {
    return refuse(`expectedCurrentFamilies does not match the current policy's actual family scope (${[...current.families].sort().join(",")}); refusing to replace against a stale belief of the current scope.`);
  }
  if (typeof expectedCurrentPolicyDigest !== "string" || !expectedCurrentPolicyDigest.trim()) {
    return refuse("expectedCurrentPolicyDigest is required: the digest of the policy record this replacement is authorized against.");
  }
  if (expectedCurrentPolicyDigest !== facts.policyDigest) {
    return refuse("expectedCurrentPolicyDigest does not match the current policy record; it changed since this replacement was authorized.");
  }
  const droppedFamilies = current.families.filter((family) => !targetFamilies.includes(family));
  if (droppedFamilies.length > 0 && acknowledgeNarrowing !== true) {
    return refuse(`This target drops ${droppedFamilies.join(", ")} from the current scope; pass acknowledgeNarrowing: true if that narrowing is genuinely intended.`, { droppedFamilies });
  }

  const candidate = { ...policyRecord, families: targetFamilies };
  const resolvedCandidate = kind.resolve(candidate);
  if (!resolvedCandidate.enabled || !sameSet(resolvedCandidate.families, targetFamilies)) {
    return refuse(`The requested family scope is not valid (${resolvedCandidate.invalidReason ?? "families_invalid"}).`);
  }

  const addedFamilies = targetFamilies.filter((family) => !current.families.includes(family));
  const summary = summaryOf(targetFamilies);
  const resultBase = {
    action: "replace-families",
    policyKind,
    policy: summary,
    auditRecordId,
    addedFamilies,
    droppedFamilies,
    predictedMutations: [
      { collection: CONFIGURATION_COLLECTION, recordId: kind.recordId, operation: "update" },
      { collection: CONFIGURATION_COLLECTION, recordId: auditRecordId, operation: "create" },
    ],
    unchangedByDesign: {
      healthKitObservations: facts.observationCount,
      healthKitCanonicalDays: facts.canonicalDayCount,
      healthKitCanonicalWorkouts: facts.canonicalWorkoutCount,
      healthKitWorkoutLinks: facts.linkCount,
      canonicalEvidenceObjects: facts.evidenceCount,
      otherPolicyRecord: facts.otherPolicyDigest ?? "absent",
      linkAutoConfirm: current.linkAutoConfirm,
      effectiveLocalDate: current.effectiveLocalDate,
      endLocalDate: current.endLocalDate,
      openEnded: current.openEnded === true,
      strategicEvidenceEligibility: "quarantined",
      historicalBackfill: false,
    },
    historicalBackfill: false,
    strategicEvidenceEligibility: "quarantined",
    facts,
  };
  if (!apply) return Object.freeze({ outcome: "dry_run", ...resultBase });

  const drift = compareFacts(expected, facts);
  if (drift.length > 0) return Object.freeze({ outcome: "drifted", drift, facts });
  if (!String(authorizationReference ?? "").trim()) {
    throw Object.assign(new Error("Apply requires an authorization reference."), { code: "AUTHORIZATION_REFERENCE_REQUIRED" });
  }

  const at = operationAt;
  const nextPolicy = { ...candidate, id: kind.recordId, auditRecordId, updatedAt: at };
  const newDigest = digest(stable(nextPolicy));
  const audit = await records.putIfAbsent({
    ownerUserId,
    collection: CONFIGURATION_COLLECTION,
    recordId: auditRecordId,
    sourceIdentity: auditRecordId,
    payload: {
      id: auditRecordId,
      kind: HEALTHKIT_WORKOUT_FAMILY_REPLACEMENT_AUDIT_KIND,
      action: "replace-families",
      at,
      authorizationReference: String(authorizationReference),
      policyRecordId: kind.recordId,
      before: { status: policyRecord.status, digest: facts.policyDigest, families: current.families },
      after: { ...summary, digest: newDigest },
      strategicEvidenceEligibility: "quarantined",
      historicalBackfill: false,
    },
  });
  if (!audit.created) {
    throw Object.assign(new Error("This authorization reference was already used for this action."), { code: "AUDIT_ROW_EXISTS" });
  }

  const written = await records.put({
    ownerUserId,
    collection: CONFIGURATION_COLLECTION,
    recordId: kind.recordId,
    expectedVersion: policyRecord.version,
    sourceIdentity: kind.recordId,
    payload: nextPolicy,
  });

  const list = (collection) => records.list({ ownerUserId, collection });
  const [afterPolicy, afterOther, afterObservations, afterDays, afterWorkouts, afterLinks, afterClaims, afterEvidence] = await Promise.all([
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: kind.recordId }),
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: kind.otherRecordId }),
    list(OBSERVATION_COLLECTION),
    list(HEALTHKIT_CANONICAL_DAY_COLLECTION),
    list(HEALTHKIT_CANONICAL_WORKOUT_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION),
    list(EVIDENCE_COLLECTION),
  ]);
  const resolvedAfter = kind.resolve(afterPolicy);
  const sansVolatile = (record) => {
    if (!record) return null;
    const { families: _families, updatedAt: _updatedAt, auditRecordId: _auditRecordId, version: _version, ...rest } = record;
    return rest;
  };
  const invariants = {
    familiesAreExactlyTheTarget: resolvedAfter.enabled && sameSet(resolvedAfter.families, targetFamilies) && sameSet(afterPolicy?.families ?? [], targetFamilies),
    onlyFamiliesFieldChanged: stable(sansVolatile(afterPolicy)) === stable(sansVolatile(policyRecord)),
    windowUnchanged: resolvedAfter.effectiveLocalDate === current.effectiveLocalDate &&
      resolvedAfter.endLocalDate === current.endLocalDate && resolvedAfter.openEnded === current.openEnded,
    linkAutoConfirmUnchanged: resolvedAfter.linkAutoConfirm === current.linkAutoConfirm,
    strategicEligibilityQuarantined: afterPolicy?.strategicEvidenceEligibility === "quarantined",
    noBackfillRequested: afterPolicy?.historicalBackfill === false,
    auditRowPresent: audit.record?.id === auditRecordId,
    auditRecordsOldAndNewDigest: audit.record?.before?.digest === facts.policyDigest && audit.record?.after?.digest === newDigest,
    otherPolicyUntouched: (afterOther ? digest(stable(afterOther)) : null) === facts.otherPolicyDigest,
    observationsUnchanged: afterObservations.length === facts.observationCount && listDigest(afterObservations) === facts.observationsDigest,
    canonicalDaysUnchanged: afterDays.length === facts.canonicalDayCount && listDigest(afterDays) === facts.canonicalDaysDigest,
    canonicalWorkoutsUnchanged: afterWorkouts.length === facts.canonicalWorkoutCount && listDigest(afterWorkouts) === facts.canonicalWorkoutsDigest,
    linksUnchanged: afterLinks.length === facts.linkCount && listDigest(afterLinks) === facts.linksDigest,
    claimsUnchanged: afterClaims.length === facts.claimCount && listDigest(afterClaims) === facts.claimsDigest,
    evidenceUnchanged: afterEvidence.length === facts.evidenceCount && listDigest(afterEvidence) === facts.evidenceDigest,
  };
  if (Object.values(invariants).some((ok) => ok !== true)) {
    throw Object.assign(new Error("Post-write invariants failed."), { code: "POST_WRITE_INVARIANT_FAILED", invariants });
  }
  return Object.freeze({ outcome: "applied", ...resultBase, invariants, policyVersion: written.version });
}

function collectFacts({ policyRecord, otherPolicyRecord, observations, canonicalDays, canonicalWorkouts, links, claims, evidence }) {
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
    claimCount: claims.length,
    claimsDigest: listDigest(claims),
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
