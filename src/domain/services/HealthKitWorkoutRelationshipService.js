import { createHash } from "node:crypto";
import { HEALTHKIT_CANONICAL_WORKOUT_COLLECTION } from "./HealthKitWorkoutService.js";
import {
  HEALTHKIT_WORKOUT_LINK_COLLECTION,
  HealthKitWorkoutLinkError,
  HealthKitWorkoutLinkStatus,
  assertHealthKitWorkoutLinkAllowed,
  unlinkHealthKitWorkoutLink,
} from "./HealthKitWorkoutLinkService.js";
import { isActiveDetailedStrengthSession } from "./HealthKitObservationService.js";
import { isTrustedNativeLiveLoggerSession } from "./HealthKitWorkoutLinkService.js";
import { createHealthKitQuarantinedEligibility } from "./HealthKitEvidenceEligibilityPolicy.js";

// The guarded write path for HealthKit workout <-> Workout Logger relationships.
// Every confirmation, unlink and relink MUST come through here (the future
// Founder command calls it); nothing else may make a link active.
//
// Enforcement is layered and needs no schema migration:
//   1. domain guard   one-to-one + duplicate-group, evaluated against current state;
//   2. claim rows     one atomic claim per Apple workout and per Logger session,
//                     keyed by a deterministic record id in the existing generic
//                     record table. `putIfAbsent` (INSERT ... ON CONFLICT DO NOTHING
//                     on the primary key) and `put` with `expectedVersion`
//                     (UPDATE ... WHERE version = n) are atomic, so two confirmations
//                     that race can never both hold the same workout or session;
//   3. command layer  every command already runs inside one transaction under the
//                     per-owner advisory lock, so relationship writes are serialized.
// A conflict never overwrites an established link: the second relationship is refused.

export const HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION = "healthKitWorkoutLinkClaims";
export const HEALTHKIT_WORKOUT_LINK_CLAIM_ID_PREFIX = "healthkit_link_claim_";
export const HEALTHKIT_WORKOUT_LINK_CLAIM_SCHEMA_VERSION = "healthkit-workout-link-claim-v1";

const ClaimStatus = Object.freeze({ HELD: "held", RELEASED: "released" });

export function getHealthKitWorkoutLinkClaimId(kind, subjectId) {
  const digest = createHash("sha256").update(`${kind}\u0000${subjectId}`).digest("hex").slice(0, 40);
  return `${HEALTHKIT_WORKOUT_LINK_CLAIM_ID_PREFIX}${kind === "workout" ? "w" : "s"}_${digest}`;
}

/**
 * Confirm a candidate (or relink an unlinked link). Idempotent for an already
 * confirmed link. Fails closed before any read: a confirmation is an explicit,
 * attributable act, so it requires a named actor and a valid time.
 */
export async function confirmHealthKitWorkoutRelationship({ records, ownerUserId, linkId, by, now } = {}) {
  if (!by || typeof by !== "object" || !String(by.kind ?? "").trim() || !String(by.ref ?? "").trim()) {
    throw new HealthKitWorkoutLinkError("LINK_ACTOR_REQUIRED", "A confirmation requires an attributable actor ({ kind, ref }).");
  }
  const parsed = new Date(now);
  if (now == null || Number.isNaN(parsed.getTime())) {
    throw new HealthKitWorkoutLinkError("LINK_TIME_INVALID", "A confirmation requires a valid time.");
  }
  const at = parsed.toISOString();
  const link = await records.get({ ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_COLLECTION, recordId: linkId });
  if (!link) throw new HealthKitWorkoutLinkError("LINK_NOT_FOUND", "The workout link does not exist.");

  const [links, workouts, evidence, claims] = await Promise.all([
    records.list({ ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_COLLECTION }),
    records.list({ ownerUserId, collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION }),
    records.list({ ownerUserId, collection: "canonicalEvidenceObjects" }),
    records.list({ ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION }),
  ]);
  // The Logger session must still be an active detailed strength session: a
  // stale candidate never confirms against a superseded or removed session.
  const session = evidence.find((record) => (record.canonicalId ?? record.payload?.id) === link.loggerSessionCanonicalId);
  if (!session || !isActiveDetailedStrengthSession(session) || !isTrustedNativeLiveLoggerSession(session.payload ?? session)) {
    throw new HealthKitWorkoutLinkError("LINK_SESSION_UNAVAILABLE", "The Workout Logger session for this link is no longer an active strength session.");
  }
  assertHealthKitWorkoutRelationshipIntegrity({ links, claims });
  assertHealthKitWorkoutLinkAllowed(link, { existingLinks: links, canonicalWorkouts: workouts });
  if (link.status === HealthKitWorkoutLinkStatus.CONFIRMED) return Object.freeze({ outcome: "already_confirmed", link });

  const acquired = [];
  try {
    for (const [kind, subject] of [["workout", link.canonicalWorkoutId], ["session", link.loggerSessionCanonicalId]]) {
      const claim = await acquireClaim({ records, ownerUserId, kind, subject, linkId: link.id, at });
      if (claim.acquired) acquired.push(claim.id);
    }
  } catch (error) {
    // Compensate so a refused confirmation leaves no half-held claim behind.
    for (const claimId of acquired) await releaseClaim({ records, ownerUserId, claimId, linkId: link.id, at });
    throw error;
  }
  const confirmed = Object.freeze({
    ...link,
    status: HealthKitWorkoutLinkStatus.CONFIRMED,
    updatedAt: at,
    statusHistory: [...link.statusHistory, { status: HealthKitWorkoutLinkStatus.CONFIRMED, at, by }],
  });
  let saved;
  try {
    saved = await records.put({
      ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_COLLECTION, recordId: link.id,
      expectedVersion: link.version, sourceIdentity: link.id, payload: confirmed,
    });
  } catch (error) {
    for (const claimId of acquired) await releaseClaim({ records, ownerUserId, claimId, linkId: link.id, at });
    throw error;
  }
  return Object.freeze({ outcome: "confirmed", link: saved });
}

/** Unlink keeps the link, the Apple workout, and the Logger session; only the claims are released. */
export async function unlinkHealthKitWorkoutRelationship({ records, ownerUserId, linkId, by, now, reason = null } = {}) {
  const at = new Date(now).toISOString();
  const link = await records.get({ ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_COLLECTION, recordId: linkId });
  if (!link) throw new HealthKitWorkoutLinkError("LINK_NOT_FOUND", "The workout link does not exist.");
  if (link.status === HealthKitWorkoutLinkStatus.UNLINKED) return Object.freeze({ outcome: "already_unlinked", link });
  const unlinked = unlinkHealthKitWorkoutLink(link, { by, now: at, reason });
  const saved = await records.put({
    ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_COLLECTION, recordId: link.id,
    expectedVersion: link.version, sourceIdentity: link.id, payload: unlinked,
  });
  if (link.status === HealthKitWorkoutLinkStatus.CONFIRMED) {
    for (const [kind, subject] of [["workout", link.canonicalWorkoutId], ["session", link.loggerSessionCanonicalId]]) {
      await releaseClaim({ records, ownerUserId, claimId: getHealthKitWorkoutLinkClaimId(kind, subject), linkId: link.id, at });
    }
  }
  return Object.freeze({ outcome: "unlinked", link: saved });
}

/**
 * Read-only integrity check for stored relationship state: every violation of
 * the invariant, without needing a write. Used by the audit.
 */
export function findHealthKitWorkoutRelationshipViolations({ links = [], claims = [] } = {}) {
  const confirmed = links.filter((link) => link.status === HealthKitWorkoutLinkStatus.CONFIRMED);
  const count = (key) => confirmed.reduce((acc, link) => ({ ...acc, [link[key]]: (acc[link[key]] ?? 0) + 1 }), {});
  const workoutCounts = count("canonicalWorkoutId");
  const sessionCounts = count("loggerSessionCanonicalId");
  const heldClaims = claims.filter((claim) => claim.status === ClaimStatus.HELD);
  const confirmedById = new Map(confirmed.map((link) => [link.id, link]));
  const validClaimFor = (claim, link, kind, subject) => claim?.id === getHealthKitWorkoutLinkClaimId(kind, subject) &&
    claim.kind === kind && claim.schemaVersion === HEALTHKIT_WORKOUT_LINK_CLAIM_SCHEMA_VERSION &&
    claim.status === ClaimStatus.HELD && claim.holderLinkId === link.id &&
    Array.isArray(claim.history) && claim.history.length > 0 &&
    claim.history.at(-1)?.status === ClaimStatus.HELD && claim.history.at(-1)?.holderLinkId === link.id;
  const validHeldClaim = (claim) => {
    const link = confirmedById.get(claim.holderLinkId);
    if (!link) return false;
    return validClaimFor(claim, link, "workout", link.canonicalWorkoutId) ||
      validClaimFor(claim, link, "session", link.loggerSessionCanonicalId);
  };
  return Object.freeze({
    workoutsWithMultipleConfirmedLinks: Object.values(workoutCounts).filter((n) => n > 1).length,
    sessionsWithMultipleConfirmedLinks: Object.values(sessionCounts).filter((n) => n > 1).length,
    confirmedLinksWithoutHeldClaims: confirmed.filter((link) => {
      const heldByLink = heldClaims.filter((claim) => claim.holderLinkId === link.id);
      return heldByLink.length !== 2 ||
        heldByLink.filter((claim) => validClaimFor(claim, link, "workout", link.canonicalWorkoutId)).length !== 1 ||
        heldByLink.filter((claim) => validClaimFor(claim, link, "session", link.loggerSessionCanonicalId)).length !== 1;
    }).length,
    heldClaimsWithoutConfirmedLink: heldClaims.filter((claim) => !validHeldClaim(claim)).length,
  });
}

export function assertHealthKitWorkoutRelationshipIntegrity({ links = [], claims = [] } = {}) {
  const violations = findHealthKitWorkoutRelationshipViolations({ links, claims });
  if (Object.values(violations).some((count) => count !== 0)) {
    throw new HealthKitWorkoutLinkError(
      "LINK_RELATIONSHIP_INTEGRITY_INVALID",
      "Stored workout relationship claims do not exactly match the confirmed links.",
    );
  }
  return violations;
}

async function acquireClaim({ records, ownerUserId, kind, subject, linkId, at }) {
  const id = getHealthKitWorkoutLinkClaimId(kind, subject);
  const fresh = {
    schemaVersion: HEALTHKIT_WORKOUT_LINK_CLAIM_SCHEMA_VERSION,
    id,
    userId: ownerUserId,
    kind,
    status: ClaimStatus.HELD,
    holderLinkId: linkId,
    history: [{ status: ClaimStatus.HELD, holderLinkId: linkId, at }],
    evidenceEligibility: createHealthKitQuarantinedEligibility(),
    createdAt: at,
    updatedAt: at,
  };
  const created = await records.putIfAbsent({
    ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION, recordId: id, sourceIdentity: id, payload: fresh,
  });
  if (created.created) return { id, acquired: true };
  const existing = created.record;
  if (existing.status === ClaimStatus.HELD) {
    if (existing.holderLinkId === linkId) return { id, acquired: false };
    throw new HealthKitWorkoutLinkError("LINK_ONE_TO_ONE_VIOLATION",
      kind === "workout" ? "This Apple workout already has a confirmed link." : "This Logger session already has a confirmed link.");
  }
  try {
    await records.put({
      ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION, recordId: id, expectedVersion: existing.version, sourceIdentity: id,
      payload: { ...existing, status: ClaimStatus.HELD, holderLinkId: linkId, updatedAt: at, history: [...existing.history, { status: ClaimStatus.HELD, holderLinkId: linkId, at }] },
    });
  } catch (error) {
    // Another confirmation took the claim between our read and our write.
    throw new HealthKitWorkoutLinkError("LINK_ONE_TO_ONE_VIOLATION", "The relationship was claimed by another confirmation.");
  }
  return { id, acquired: true };
}

async function releaseClaim({ records, ownerUserId, claimId, linkId, at }) {
  const claim = await records.get({ ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION, recordId: claimId });
  if (!claim || claim.status !== ClaimStatus.HELD || claim.holderLinkId !== linkId) return;
  await records.put({
    ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION, recordId: claimId, expectedVersion: claim.version, sourceIdentity: claimId,
    payload: { ...claim, status: ClaimStatus.RELEASED, updatedAt: at, history: [...claim.history, { status: ClaimStatus.RELEASED, holderLinkId: linkId, at }] },
  });
}
