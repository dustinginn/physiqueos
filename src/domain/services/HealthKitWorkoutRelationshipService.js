import { createHash } from "node:crypto";
import { HEALTHKIT_CANONICAL_WORKOUT_COLLECTION } from "./HealthKitWorkoutService.js";
import {
  HEALTHKIT_WORKOUT_LINK_COLLECTION,
  HEALTHKIT_WORKOUT_LINK_SCHEMA_VERSION,
  HEALTHKIT_WORKOUT_MATCHER_VERSION,
  HealthKitWorkoutLinkError,
  HealthKitWorkoutLinkStatus,
  assessHealthKitStrengthLinkCandidates,
  assertHealthKitWorkoutLinkAllowed,
  getHealthKitWorkoutLinkRecordId,
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

  const [links, workouts, evidence, claims, metadata] = await Promise.all([
    records.list({ ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_COLLECTION }),
    records.list({ ownerUserId, collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION }),
    records.list({ ownerUserId, collection: "canonicalEvidenceObjects" }),
    records.list({ ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION }),
    records.listStorageMetadata({ ownerUserId, collection: "canonicalEvidenceObjects" }),
  ]);
  assertHealthKitWorkoutRelationshipConfirmationAllowed({
    ownerUserId,
    link,
    links,
    workouts,
    evidence,
    claims,
    loggerSessionServerCommitTimestamps: new Map(metadata.map((row) => [row.recordId, row.createdAt])),
  });
  if (link.status === HealthKitWorkoutLinkStatus.CONFIRMED) return Object.freeze({ outcome: "already_confirmed", link });

  const acquired = [];
  try {
    for (const [kind, subject] of [["workout", link.canonicalWorkoutId], ["session", link.loggerSessionCanonicalId]]) {
      const claim = await acquireClaim({ records, ownerUserId, kind, subject, linkId: link.id, at, links });
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
  const postWriteClaims = await records.list({ ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION });
  assertHealthKitWorkoutRelationshipIntegrity({
    links: [saved],
    claims: postWriteClaims.filter((claim) => claim.status === ClaimStatus.HELD && claim.holderLinkId === saved.id),
    claimHistoryLinks: [...links.filter((candidate) => candidate.id !== saved.id), saved],
  });
  return Object.freeze({ outcome: "confirmed", link: saved });
}

/**
 * One pure, reusable confirmation boundary. Dry-runs, idempotent replays and
 * writes all use the same current-state proof: canonical claim graph, active
 * trusted live Logger provenance, one-to-one/duplicate-family rules, and a
 * temporally plausible current matcher candidate.
 */
export function assertHealthKitWorkoutRelationshipConfirmationAllowed({
  ownerUserId,
  link,
  links = [],
  workouts = [],
  evidence = [],
  claims = [],
  loggerSessionServerCommitTimestamps = new Map(),
} = {}) {
  if (!validLinkRecord(link, ownerUserId)) {
    throw new HealthKitWorkoutLinkError("LINK_RELATIONSHIP_INTEGRITY_INVALID", "The stored workout relationship link is not canonical.");
  }
  assertHealthKitWorkoutRelationshipIntegrity({ links, claims });
  const session = evidence.find((record) => (record.canonicalId ?? record.payload?.id) === link?.loggerSessionCanonicalId);
  if (!session || !isActiveDetailedStrengthSession(session) || !isTrustedNativeLiveLoggerSession(session.payload ?? session)) {
    throw new HealthKitWorkoutLinkError("LINK_SESSION_UNAVAILABLE", "The Workout Logger session for this link is no longer an active trusted live Logger strength session.");
  }
  assertHealthKitWorkoutLinkAllowed(link, { existingLinks: links, canonicalWorkouts: workouts });
  const workout = workouts.find((candidate) => candidate.id === link.canonicalWorkoutId);
  const assessment = assessHealthKitStrengthLinkCandidates({
    canonicalWorkout: workout,
    canonicalObjects: evidence,
    existingLinks: links,
    canonicalWorkouts: workouts,
    loggerSessionServerCommitTimestamps,
  });
  if (!assessment.candidates.some((candidate) => candidate.loggerSessionCanonicalId === link.loggerSessionCanonicalId)) {
    throw new HealthKitWorkoutLinkError(
      "LINK_TEMPORAL_GUARD_FAILED",
      "The selected Logger session is not a temporally plausible current match for this Apple workout.",
    );
  }
  return Object.freeze({ session, workout, assessment });
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
export function findHealthKitWorkoutRelationshipViolations({ links = [], claims = [], claimHistoryLinks = links } = {}) {
  const confirmed = links.filter((link) => link.status === HealthKitWorkoutLinkStatus.CONFIRMED);
  const count = (key) => confirmed.reduce((acc, link) => ({ ...acc, [link[key]]: (acc[link[key]] ?? 0) + 1 }), {});
  const workoutCounts = count("canonicalWorkoutId");
  const sessionCounts = count("loggerSessionCanonicalId");
  const heldClaims = claims.filter((claim) => claim.status === ClaimStatus.HELD);
  const inactiveClaims = claims.filter((claim) => claim.status !== ClaimStatus.HELD);
  const confirmedById = new Map(confirmed.map((link) => [link.id, link]));
  const linkById = new Map(links.map((link) => [link.id, link]));
  const validClaimFor = (claim, link, kind, subject) => {
    const history = Array.isArray(claim?.history) ? claim.history : [];
    const confirmedTransition = Array.isArray(link?.statusHistory) ? link.statusHistory.at(-1) : null;
    const linkHistoryIsCanonical = validConfirmedLinkHistory(link);
    const quarantine = createHealthKitQuarantinedEligibility();
    return linkHistoryIsCanonical && claimHasExactShape(claim) && claim?.id === getHealthKitWorkoutLinkClaimId(kind, subject) &&
    claim.kind === kind && claim.schemaVersion === HEALTHKIT_WORKOUT_LINK_CLAIM_SCHEMA_VERSION &&
    claim.userId === link.userId && claim.status === ClaimStatus.HELD && claim.holderLinkId === link.id &&
    exactObject(claim.evidenceEligibility, quarantine) && validClaimHistory(claim, ClaimStatus.HELD, {
      links: claimHistoryLinks,
      ownerUserId: link.userId,
      kind,
      subject,
    }) &&
    history.at(-1)?.status === ClaimStatus.HELD && history.at(-1)?.holderLinkId === link.id &&
    claim.createdAt === history[0].at && claim.updatedAt === history.at(-1).at &&
    confirmedTransition?.status === HealthKitWorkoutLinkStatus.CONFIRMED &&
    validInstant(confirmedTransition.at) && String(confirmedTransition.by?.kind ?? "").length > 0 &&
    String(confirmedTransition.by?.ref ?? "").length > 0 &&
    history.at(-1).at === confirmedTransition.at && claim.updatedAt === link.updatedAt &&
    validInstant(claim.createdAt) && validInstant(claim.updatedAt);
  };
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
    malformedReleasedClaims: inactiveClaims.filter((claim) => {
      const link = linkById.get(claim.holderLinkId);
      if (!link) return true;
      const subject = claim.kind === "workout" ? link.canonicalWorkoutId
        : claim.kind === "session" ? link.loggerSessionCanonicalId : null;
      if (!subject || !isCanonicalReusableReleasedClaim(claim, {
        ownerUserId: link.userId,
        kind: claim.kind,
        subject,
        links: claimHistoryLinks,
      })) return true;
      const finalLinkTransition = Array.isArray(link.statusHistory) ? link.statusHistory.at(-1) : null;
      if (link.status === HealthKitWorkoutLinkStatus.UNLINKED) {
        return finalLinkTransition?.status !== HealthKitWorkoutLinkStatus.UNLINKED ||
          finalLinkTransition.at !== claim.updatedAt;
      }
      return link.status !== HealthKitWorkoutLinkStatus.CANDIDATE;
    }).length,
  });
}

function validInstant(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function exactObject(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expectedKeys = Object.keys(expected).sort();
  return keys.length === expectedKeys.length && keys.every((key, index) =>
    key === expectedKeys[index] && value[key] === expected[key]);
}

function validClaimHistory(claim, expectedFinalStatus, { links = [], ownerUserId, kind, subject } = {}) {
  const history = Array.isArray(claim?.history) ? claim.history : [];
  const linksById = new Map(links.map((link) => [link.id, link]));
  return history.length > 0 && history[0]?.status === ClaimStatus.HELD &&
    history.at(-1)?.status === expectedFinalStatus &&
    claim.createdAt === history[0].at && claim.updatedAt === history.at(-1).at &&
    validInstant(claim.createdAt) && validInstant(claim.updatedAt) &&
    history.every((entry, index) => {
      const holderLink = linksById.get(entry?.holderLinkId);
      if (!exactObjectKeys(entry, ["status", "holderLinkId", "at"]) ||
        ![ClaimStatus.HELD, ClaimStatus.RELEASED].includes(entry?.status) ||
        !String(entry?.holderLinkId ?? "").length || !validInstant(entry?.at)) return false;
      if (!hasDeterministicLinkIdentity(holderLink, { ownerUserId, kind, subject })) return false;
      if (index === 0) return true;
      const previous = history[index - 1];
      return entry.status !== previous.status &&
        Date.parse(entry.at) >= Date.parse(previous.at) &&
        (entry.status !== ClaimStatus.RELEASED || entry.holderLinkId === previous.holderLinkId);
    });
}

function isCanonicalReusableReleasedClaim(claim, { ownerUserId, kind, subject, links = [] } = {}) {
  return claimHasExactShape(claim) && claim?.id === getHealthKitWorkoutLinkClaimId(kind, subject) &&
    claim.schemaVersion === HEALTHKIT_WORKOUT_LINK_CLAIM_SCHEMA_VERSION &&
    claim.userId === ownerUserId && claim.kind === kind && claim.status === ClaimStatus.RELEASED &&
    String(claim.holderLinkId ?? "").length > 0 &&
    exactObject(claim.evidenceEligibility, createHealthKitQuarantinedEligibility()) &&
    validClaimHistory(claim, ClaimStatus.RELEASED, { links, ownerUserId, kind, subject }) &&
    claim.history.at(-1)?.holderLinkId === claim.holderLinkId;
}

function hasDeterministicLinkIdentity(link, { ownerUserId, kind, subject } = {}) {
  return link?.schemaVersion === HEALTHKIT_WORKOUT_LINK_SCHEMA_VERSION &&
    link.userId === ownerUserId &&
    String(link.canonicalWorkoutId ?? "").length > 0 &&
    String(link.loggerSessionCanonicalId ?? "").length > 0 &&
    link.id === getHealthKitWorkoutLinkRecordId(link.canonicalWorkoutId, link.loggerSessionCanonicalId) &&
    (kind === "workout" ? link.canonicalWorkoutId === subject
      : kind === "session" ? link.loggerSessionCanonicalId === subject : false);
}

function exactObjectKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function claimHasExactShape(claim) {
  if (!claim || typeof claim !== "object" || Array.isArray(claim)) return false;
  const actual = Object.keys(claim).filter((key) => key !== "version").sort();
  const expected = [
    "createdAt", "evidenceEligibility", "history", "holderLinkId", "id",
    "kind", "schemaVersion", "status", "updatedAt", "userId",
  ].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]) &&
    (claim.version == null || (Number.isSafeInteger(Number(claim.version)) && Number(claim.version) > 0));
}

function validConfirmedLinkHistory(link) {
  return validLinkHistory(link) && link?.status === HealthKitWorkoutLinkStatus.CONFIRMED;
}

function validLinkRecord(link, ownerUserId) {
  return link?.schemaVersion === HEALTHKIT_WORKOUT_LINK_SCHEMA_VERSION &&
    link.id === getHealthKitWorkoutLinkRecordId(link.canonicalWorkoutId, link.loggerSessionCanonicalId) &&
    String(link.canonicalWorkoutId ?? "").length > 0 && String(link.loggerSessionCanonicalId ?? "").length > 0 &&
    String(ownerUserId ?? "").length > 0 && link.userId === ownerUserId &&
    link.matcherVersion === HEALTHKIT_WORKOUT_MATCHER_VERSION &&
    exactObject(link.contentAuthority, { trainingContent: "workout_logger", telemetry: "healthkit" }) &&
    exactObject(link.evidenceEligibility, createHealthKitQuarantinedEligibility()) && validLinkHistory(link);
}

function validLinkHistory(link) {
  const history = Array.isArray(link?.statusHistory) ? link.statusHistory : [];
  const allowedNext = {
    [HealthKitWorkoutLinkStatus.CANDIDATE]: new Set([HealthKitWorkoutLinkStatus.CONFIRMED, HealthKitWorkoutLinkStatus.UNLINKED]),
    [HealthKitWorkoutLinkStatus.CONFIRMED]: new Set([HealthKitWorkoutLinkStatus.UNLINKED]),
    [HealthKitWorkoutLinkStatus.UNLINKED]: new Set([HealthKitWorkoutLinkStatus.CANDIDATE, HealthKitWorkoutLinkStatus.CONFIRMED]),
  };
  return Object.values(HealthKitWorkoutLinkStatus).includes(link?.status) && history.length >= 1 &&
    history[0]?.status === HealthKitWorkoutLinkStatus.CANDIDATE &&
    history.at(-1)?.status === link.status && link.createdAt === history[0].at &&
    validInstant(link.updatedAt) && Date.parse(link.updatedAt) >= Date.parse(history.at(-1).at) &&
    (link.status === HealthKitWorkoutLinkStatus.CANDIDATE || link.updatedAt === history.at(-1).at) &&
    history.every((entry, index) => {
      if (!validInstant(entry?.at) || !String(entry?.by?.kind ?? "").length || !String(entry?.by?.ref ?? "").length) return false;
      if (index === 0) return true;
      const previous = history[index - 1];
      return allowedNext[previous.status]?.has(entry.status) === true && Date.parse(entry.at) >= Date.parse(previous.at);
    });
}

export function assertHealthKitWorkoutRelationshipIntegrity({ links = [], claims = [], claimHistoryLinks = links } = {}) {
  const violations = findHealthKitWorkoutRelationshipViolations({ links, claims, claimHistoryLinks });
  if (Object.values(violations).some((count) => count !== 0)) {
    throw new HealthKitWorkoutLinkError(
      "LINK_RELATIONSHIP_INTEGRITY_INVALID",
      "Stored workout relationship claims do not exactly match the confirmed links.",
    );
  }
  return violations;
}

async function acquireClaim({ records, ownerUserId, kind, subject, linkId, at, links = [] }) {
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
  if (!isCanonicalReusableReleasedClaim(existing, { ownerUserId, kind, subject, links })) {
    throw new HealthKitWorkoutLinkError(
      "LINK_RELATIONSHIP_INTEGRITY_INVALID",
      "The existing released relationship claim is not canonical and cannot be reused.",
    );
  }
  try {
    await records.put({
      ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION, recordId: id, expectedVersion: existing.version, sourceIdentity: id,
      payload: {
        schemaVersion: HEALTHKIT_WORKOUT_LINK_CLAIM_SCHEMA_VERSION,
        id,
        userId: ownerUserId,
        kind,
        status: ClaimStatus.HELD,
        holderLinkId: linkId,
        history: [
          ...existing.history.map(({ status, holderLinkId, at: historyAt }) => ({ status, holderLinkId, at: historyAt })),
          { status: ClaimStatus.HELD, holderLinkId: linkId, at },
        ],
        evidenceEligibility: createHealthKitQuarantinedEligibility(),
        createdAt: existing.createdAt,
        updatedAt: at,
      },
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
