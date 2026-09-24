import { createHash } from "node:crypto";
import { HEALTHKIT_CANONICAL_DAY_COLLECTION } from "../../domain/services/HealthKitEvidenceEligibilityPolicy.js";
import {
  HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
  HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID,
} from "../../domain/services/HealthKitObservationService.js";
import { HEALTHKIT_CANONICAL_WORKOUT_COLLECTION, HealthKitWorkoutFamily } from "../../domain/services/HealthKitWorkoutService.js";
import {
  HEALTHKIT_WORKOUT_LINK_COLLECTION,
  HealthKitWorkoutLinkError,
  HealthKitWorkoutLinkStatus,
} from "../../domain/services/HealthKitWorkoutLinkService.js";
import {
  HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION,
  assertHealthKitWorkoutRelationshipConfirmationAllowed,
  confirmHealthKitWorkoutRelationship,
  findHealthKitWorkoutRelationshipViolations,
  getHealthKitWorkoutLinkClaimId,
} from "../../domain/services/HealthKitWorkoutRelationshipService.js";

export const HEALTHKIT_WORKOUT_LINK_CONFIRMATION_AUDIT_RECORD_PREFIX = "healthkit_workout_link_confirmation_audit_";
export const HEALTHKIT_WORKOUT_LINK_CONFIRMATION_MAX_DAYS = 3;
const CONFIGURATION_COLLECTION = "healthKitConfiguration";
const OBSERVATION_COLLECTION = "healthKitObservations";
const EVIDENCE_COLLECTION = "canonicalEvidenceObjects";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The registered, guarded operation that turns ONE strength link candidate
 * into a confirmed relationship. It is the only production caller of
 * `confirmHealthKitWorkoutRelationship`; nothing else may make a link active.
 *
 *   dry-run  reads current state, selects the single candidate strength link
 *            inside the exact local-date window, proves the confirmation would
 *            be allowed (active Logger session, one-to-one + duplicate-group
 *            guard, no foreign held claim), predicts the exact writes, and
 *            writes nothing.
 *   apply    requires the `expected` facts captured by an immediately
 *            preceding dry run (refuses on any drift), writes exactly one audit
 *            row plus the confirmation's own writes (the link record and its
 *            two claim rows), then verifies inside the same transaction that
 *            exactly one confirmed link exists for that workout and that
 *            session, both claims are held by it, the stored relationship
 *            state has no violations, and nothing else moved: canonical
 *            workouts, Logger/Evidence objects, canonical days, source
 *            observations, both activation policies, and every other link.
 *
 * Selection is by window, never by identifier: zero candidates and more than
 * one candidate both refuse, so ambiguity is preserved for an explicit choice
 * rather than resolved here. Replaying a completed confirmation is idempotent
 * (`already_confirmed`, no writes). The caller must run this inside one
 * transaction under the per-owner advisory lock (see the console entry).
 */
export async function runHealthKitWorkoutLinkConfirmation({
  records,
  authorization,
  apply = false,
  expected = null,
  now = () => new Date(),
} = {}) {
  const { ownerUserId, startLocalDate, endLocalDate, authorizationReference } = authorization ?? {};
  if (!ownerUserId) throw operationError("OWNER_REQUIRED", "An owner is required.");
  const calendarValid = (value) => {
    if (!DATE.test(String(value))) return false;
    const parsed = Date.parse(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
  };
  if (!calendarValid(startLocalDate) || !calendarValid(endLocalDate) || startLocalDate > endLocalDate) {
    throw operationError("WINDOW_INVALID", "startLocalDate and endLocalDate must be an ordered, calendar-valid YYYY-MM-DD window.");
  }
  if (daysInclusive(startLocalDate, endLocalDate) > HEALTHKIT_WORKOUT_LINK_CONFIRMATION_MAX_DAYS) {
    throw operationError("WINDOW_TOO_WIDE", `The window may span at most ${HEALTHKIT_WORKOUT_LINK_CONFIRMATION_MAX_DAYS} local days.`);
  }

  const list = (collection) => records.list({ ownerUserId, collection });
  const [links, claims, workouts, evidence, evidenceMetadata, canonicalDays, observations, dailyPolicy, workoutPolicy] = await Promise.all([
    list(HEALTHKIT_WORKOUT_LINK_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION),
    list(HEALTHKIT_CANONICAL_WORKOUT_COLLECTION),
    list(EVIDENCE_COLLECTION),
    records.listStorageMetadata({ ownerUserId, collection: EVIDENCE_COLLECTION }),
    list(HEALTHKIT_CANONICAL_DAY_COLLECTION),
    list(OBSERVATION_COLLECTION),
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID }),
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID }),
  ]);
  const facts = collectFacts({ links, claims, workouts, evidence, evidenceMetadata, canonicalDays, observations, dailyPolicy, workoutPolicy });
  const inWindow = (link) => link.localDate >= startLocalDate && link.localDate <= endLocalDate;
  const workoutById = new Map(workouts.map((workout) => [workout.id, workout]));
  const isStrength = (link) => workoutById.get(link.canonicalWorkoutId)?.current?.family === HealthKitWorkoutFamily.STRENGTH;
  const strengthLinks = links.filter((link) => inWindow(link) && isStrength(link));
  const candidates = strengthLinks.filter((link) => link.status === HealthKitWorkoutLinkStatus.CANDIDATE);
  const confirmed = strengthLinks.filter((link) => link.status === HealthKitWorkoutLinkStatus.CONFIRMED);

  // Stored relationship state must already be clean before anything is
  // predicted or written: a pre-existing violation (e.g. an orphaned held
  // claim) would otherwise pass dry-run and only surface as a post-write
  // invariant failure in apply. Refuse it here, by name, with no write.
  const priorViolations = findHealthKitWorkoutRelationshipViolations({ links, claims });
  if (Object.values(priorViolations).some((count) => count !== 0)) {
    return refused("stored_relationship_violations", facts, { violations: priorViolations });
  }

  // Idempotent replay: the window's single strength relationship is already
  // confirmed and durably claimed; there is nothing left to do and nothing is written.
  if (candidates.length === 0 && confirmed.length === 1 && claimsHeldBy(claims, confirmed[0])) {
    try {
      assertHealthKitWorkoutRelationshipConfirmationAllowed({
        link: confirmed[0], links, workouts, evidence, claims,
        loggerSessionServerCommitTimestamps: new Map(evidenceMetadata.map((row) => [row.recordId, row.createdAt])),
      });
    } catch (error) {
      if (error instanceof HealthKitWorkoutLinkError) return refused(error.code, facts, describe(confirmed[0], workoutById));
      throw error;
    }
    return Object.freeze({ outcome: "already_confirmed", ...describe(confirmed[0], workoutById), facts });
  }
  if (candidates.length === 0 && confirmed.length === 1) {
    return refused("confirmed_link_without_held_claims", facts, describe(confirmed[0], workoutById));
  }
  if (candidates.length === 0) return refused("no_candidate_in_window", facts);
  if (candidates.length > 1) return refused("multiple_candidates_in_window", facts, { candidateCount: candidates.length });
  const [link] = candidates;
  const summary = describe(link, workoutById);

  // Prove the confirmation is allowed before predicting or writing anything.
  try {
    assertHealthKitWorkoutRelationshipConfirmationAllowed({
      link, links, workouts, evidence, claims,
      loggerSessionServerCommitTimestamps: new Map(evidenceMetadata.map((row) => [row.recordId, row.createdAt])),
    });
  } catch (error) {
    if (error instanceof HealthKitWorkoutLinkError) return refused(error.code, facts, summary);
    throw error;
  }
  for (const [kind, subject] of [["workout", link.canonicalWorkoutId], ["session", link.loggerSessionCanonicalId]]) {
    const claim = claims.find((record) => record.id === getHealthKitWorkoutLinkClaimId(kind, subject));
    if (claim && claim.status === "held" && claim.holderLinkId !== link.id) {
      return refused("LINK_ONE_TO_ONE_VIOLATION", facts, { ...summary, heldBy: kind });
    }
  }

  const auditRecordId = `${HEALTHKIT_WORKOUT_LINK_CONFIRMATION_AUDIT_RECORD_PREFIX}${digest(authorizationReference ?? "").slice(0, 12)}`;
  const predictedMutations = [
    { collection: HEALTHKIT_WORKOUT_LINK_COLLECTION, recordId: link.id, operation: "update", to: HealthKitWorkoutLinkStatus.CONFIRMED },
    { collection: HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION, recordId: getHealthKitWorkoutLinkClaimId("workout", link.canonicalWorkoutId), operation: "hold" },
    { collection: HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION, recordId: getHealthKitWorkoutLinkClaimId("session", link.loggerSessionCanonicalId), operation: "hold" },
    { collection: CONFIGURATION_COLLECTION, recordId: auditRecordId, operation: "create" },
  ];
  if (!apply) {
    return Object.freeze({ outcome: "dry_run", ...summary, predictedMutations, unchangedByDesign: UNCHANGED_BY_DESIGN, facts });
  }

  const drift = compareFacts(expected, facts);
  if (drift.length > 0) return Object.freeze({ outcome: "drifted", drift, facts });
  if (!String(authorizationReference ?? "").trim()) throw operationError("AUTHORIZATION_REFERENCE_REQUIRED", "Apply requires an authorization reference.");

  const at = now().toISOString();
  const by = Object.freeze({ kind: "founder", ref: String(authorizationReference) });
  const audit = await records.putIfAbsent({
    ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: auditRecordId, sourceIdentity: auditRecordId,
    payload: {
      id: auditRecordId, kind: "healthkit_workout_link_confirmation_audit", at,
      authorizationReference: String(authorizationReference), linkId: link.id,
      canonicalWorkoutId: link.canonicalWorkoutId, loggerSessionCanonicalId: link.loggerSessionCanonicalId,
      before: { status: link.status, version: link.version, digest: digest(stable(link)) },
      strategicEvidenceEligibility: "quarantined",
    },
  });
  if (!audit.created) throw operationError("AUDIT_ROW_EXISTS", "This authorization reference was already used for a confirmation.");

  const result = await confirmHealthKitWorkoutRelationship({ records, ownerUserId, linkId: link.id, by, now: at });
  if (result.outcome !== "confirmed") throw operationError("CONFIRMATION_NOT_APPLIED", `Unexpected confirmation outcome ${result.outcome}.`);

  // In-transaction verification. Any failure throws and the caller rolls back.
  const [afterLinks, afterClaims, afterWorkouts, afterEvidence, afterDays, afterObservations, afterDaily, afterWorkoutPolicy] = await Promise.all([
    list(HEALTHKIT_WORKOUT_LINK_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION),
    list(HEALTHKIT_CANONICAL_WORKOUT_COLLECTION),
    list(EVIDENCE_COLLECTION),
    list(HEALTHKIT_CANONICAL_DAY_COLLECTION),
    list(OBSERVATION_COLLECTION),
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID }),
    records.get({ ownerUserId, collection: CONFIGURATION_COLLECTION, recordId: HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID }),
  ]);
  const afterLink = afterLinks.find((record) => record.id === link.id);
  const confirmedForWorkout = afterLinks.filter((record) => record.status === HealthKitWorkoutLinkStatus.CONFIRMED && record.canonicalWorkoutId === link.canonicalWorkoutId);
  const confirmedForSession = afterLinks.filter((record) => record.status === HealthKitWorkoutLinkStatus.CONFIRMED && record.loggerSessionCanonicalId === link.loggerSessionCanonicalId);
  const violations = findHealthKitWorkoutRelationshipViolations({ links: afterLinks, claims: afterClaims });
  const invariants = {
    linkConfirmed: afterLink?.status === HealthKitWorkoutLinkStatus.CONFIRMED && Number(afterLink?.version) === Number(link.version) + 1,
    // Absolute, not before==after: confirmation is not graduation, so the
    // link must still be quarantined from strategic evidence afterwards.
    linkQuarantined: afterLink?.evidenceEligibility?.state === "quarantined" && afterLink?.contentAuthority?.trainingContent === "workout_logger",
    exactlyOneConfirmedLinkForWorkout: confirmedForWorkout.length === 1 && confirmedForWorkout[0].id === link.id,
    exactlyOneConfirmedLinkForSession: confirmedForSession.length === 1 && confirmedForSession[0].id === link.id,
    bothClaimsHeldByThisLink: claimsHeldBy(afterClaims, link),
    noStoredViolations: Object.values(violations).every((count) => count === 0),
    otherLinksUnchanged: listDigest(afterLinks.filter((record) => record.id !== link.id)) === listDigest(links.filter((record) => record.id !== link.id)),
    canonicalWorkoutsUnchanged: afterWorkouts.length === facts.canonicalWorkoutCount && listDigest(afterWorkouts) === facts.canonicalWorkoutsDigest,
    evidenceUnchanged: afterEvidence.length === facts.evidenceCount && listDigest(afterEvidence) === facts.evidenceDigest,
    canonicalDaysUnchanged: afterDays.length === facts.canonicalDayCount && listDigest(afterDays) === facts.canonicalDaysDigest,
    observationsUnchanged: afterObservations.length === facts.observationCount && listDigest(afterObservations) === facts.observationsDigest,
    dailyPolicyUntouched: (afterDaily ? digest(stable(afterDaily)) : null) === facts.dailyPolicyDigest,
    workoutPolicyUntouched: (afterWorkoutPolicy ? digest(stable(afterWorkoutPolicy)) : null) === facts.workoutPolicyDigest,
    auditRowPresent: audit.record?.id === auditRecordId,
  };
  if (Object.values(invariants).some((ok) => ok !== true)) {
    throw operationError("POST_WRITE_INVARIANT_FAILED", "Post-write invariants failed.", { invariants, violations });
  }
  return Object.freeze({ outcome: "applied", ...summary, linkVersion: afterLink.version, auditRecordId, invariants, violations });
}

const UNCHANGED_BY_DESIGN = Object.freeze({
  loggerSession: "never written: exercises, sets, reps, load, variants, supersets, notes stay Logger-authoritative",
  canonicalWorkout: "never written by confirmation",
  strategicEligibility: "quarantined before and after; confirmation is not graduation",
  activationPolicies: "daily and workout policy records are read for the drift fence only",
});

function describe(link, workoutById) {
  const workout = workoutById.get(link.canonicalWorkoutId);
  return {
    linkId: link.id,
    linkStatus: link.status,
    linkVersion: link.version,
    canonicalWorkoutId: link.canonicalWorkoutId,
    loggerSessionCanonicalId: link.loggerSessionCanonicalId,
    localDate: link.localDate,
    family: workout?.current?.family ?? null,
    canonicalType: workout?.current?.canonicalType ?? null,
    matchOutcome: link.matchOutcome,
    confidence: link.confidence,
    matchBasis: link.matchBasis ?? null,
    createdBy: link.createdBy ?? null,
  };
}

function claimsHeldBy(claims, link) {
  const held = (kind, subject) => claims.some((claim) =>
    claim.id === getHealthKitWorkoutLinkClaimId(kind, subject) && claim.status === "held" && claim.holderLinkId === link.id);
  return held("workout", link.canonicalWorkoutId) && held("session", link.loggerSessionCanonicalId);
}

function refused(reason, facts, detail = {}) {
  return Object.freeze({ outcome: "refused", reasons: [reason], ...detail, facts });
}

function collectFacts({ links, claims, workouts, evidence, evidenceMetadata, canonicalDays, observations, dailyPolicy, workoutPolicy }) {
  return {
    linkCount: links.length,
    linksDigest: listDigest(links),
    claimCount: claims.length,
    claimsDigest: listDigest(claims),
    canonicalWorkoutCount: workouts.length,
    canonicalWorkoutsDigest: listDigest(workouts),
    evidenceCount: evidence.length,
    evidenceDigest: listDigest(evidence),
    evidenceStorageMetadataDigest: listDigest(evidenceMetadata),
    canonicalDayCount: canonicalDays.length,
    canonicalDaysDigest: listDigest(canonicalDays),
    observationCount: observations.length,
    observationsDigest: listDigest(observations),
    dailyPolicyDigest: dailyPolicy ? digest(stable(dailyPolicy)) : null,
    workoutPolicyDigest: workoutPolicy ? digest(stable(workoutPolicy)) : null,
  };
}

function compareFacts(expected, actual) {
  if (!expected || typeof expected !== "object") return ["expected facts are required for apply"];
  return Object.keys(actual).filter((key) => JSON.stringify(expected[key] ?? null) !== JSON.stringify(actual[key] ?? null));
}

function daysInclusive(start, end) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

function operationError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

function listDigest(list) {
  return digest(list.map((record) => `${record.id ?? record.canonicalId}:${record.version ?? 1}:${digest(stable(record))}`).sort().join(","));
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 32);
}
