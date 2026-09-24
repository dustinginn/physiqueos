import { createHash } from "node:crypto";
import {
  DUPLICATE_CONFIDENCE_THRESHOLD,
  POSSIBLE_DUPLICATE_CONFIDENCE_THRESHOLD,
  TEMPORAL_TOLERANCE_MINUTES,
  assessWorkoutDuplicatePair,
  getWorkoutIdentityFacts,
} from "./WorkoutDuplicateIdentityService.js";
import { createHealthKitQuarantinedEligibility } from "./HealthKitEvidenceEligibilityPolicy.js";
import {
  HealthKitWorkoutFamily,
  getHealthKitCanonicalWorkoutIdForSource,
  normalizeWorkoutTimeToInstant,
} from "./HealthKitWorkoutService.js";
import { isActiveDetailedStrengthSession } from "./HealthKitObservationService.js";

// Strength link candidates between a canonical Apple workout and a Workout
// Logger session. The Logger session stays the sole authority for training
// content; HealthKit is telemetry/source authority. A link is a separate,
// bounded association record. It rewrites nothing, and either side can be
// unlinked later without deleting the other.

export const HEALTHKIT_WORKOUT_LINK_COLLECTION = "healthKitWorkoutLinks";
export const HEALTHKIT_WORKOUT_LINK_ID_PREFIX = "healthkit_workout_link_";
export const HEALTHKIT_WORKOUT_LINK_SCHEMA_VERSION = "healthkit-workout-link-v1";
export const HEALTHKIT_WORKOUT_MATCHER_VERSION = "healthkit-strength-matcher-v5";
// A confident match is only a CANDIDATE. Turning any candidate into a
// confirmed link is a separate, explicit act that must go through the guarded
// relationship service (claims + one-to-one + duplicate-group checks). Link
// creation never confirms, not even for an explicit source identity. The
// constant is asserted false; the activation policy rejects any attempt to set it.
export const HEALTHKIT_STRENGTH_LINK_AUTO_CONFIRM = false;

// Thresholds are the existing product semantics for "same workout", reused
// unchanged from WorkoutDuplicateIdentityService rather than invented here.
export const HEALTHKIT_STRENGTH_MATCH_THRESHOLDS = Object.freeze({
  confident: DUPLICATE_CONFIDENCE_THRESHOLD,
  possible: POSSIBLE_DUPLICATE_CONFIDENCE_THRESHOLD,
  temporalToleranceMinutes: TEMPORAL_TOLERANCE_MINUTES,
});

// A runner-up inside the width of the "possible" band (confident minus
// possible) is not clearly behind the best candidate, so the match is
// ambiguous. Derived from the existing thresholds, not a new arbitrary number.
export const HEALTHKIT_STRENGTH_TIE_MARGIN = DUPLICATE_CONFIDENCE_THRESHOLD - POSSIBLE_DUPLICATE_CONFIDENCE_THRESHOLD;

export const HealthKitStrengthMatchOutcome = Object.freeze({
  CONFIDENT: "confident_match",
  POSSIBLE: "possible_match",
  NONE: "no_match",
  AMBIGUOUS: "ambiguous_multiple",
});

export const HealthKitWorkoutLinkStatus = Object.freeze({
  CANDIDATE: "candidate",
  CONFIRMED: "confirmed",
  UNLINKED: "unlinked",
});

export class HealthKitWorkoutLinkError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HealthKitWorkoutLinkError";
    this.code = code;
  }
}

/**
 * The one deterministic, Server-owned matcher. Pure and read-only.
 *
 *   confident_match   exactly one same-day strength session, duplicate-level
 *                     confidence, real temporal overlap, not linked elsewhere,
 *                     and no same-day session whose time cannot be verified
 *   possible_match    exactly one same-day session below that bar
 *   ambiguous_multiple two or more plausible sessions: never linked
 *   no_match          none (with an explicit reason, including "times unverifiable")
 *
 * Logger and Evidence times are first normalized to absolute instants in the
 * Apple workout's own time zone (offset ISO, naive ISO, bare wall time, and
 * meridiem times all occur in real data). A session whose start cannot be
 * verified is never silently ignored: it is counted, and it prevents a
 * confident match. A bare display filename never establishes identity (that
 * safeguard lives in the shared duplicate-identity service).
 */
export function assessHealthKitStrengthLinkCandidates({
  canonicalWorkout,
  canonicalObjects = [],
  existingLinks = [],
  // Required for the deterministic Logger rule: without the complete
  // same-day workout universe, uniqueness is unproven and the rule stays off.
  canonicalWorkouts = [],
  // Optional immutable Server storage facts, supplied only by guarded
  // reassessment. A missing or invalid commit timestamp never becomes an end.
  loggerSessionServerCommitTimestamps = new Map(),
} = {}) {
  const base = { matcherVersion: HEALTHKIT_WORKOUT_MATCHER_VERSION, thresholds: HEALTHKIT_STRENGTH_MATCH_THRESHOLDS };
  const current = canonicalWorkout?.current;
  if (!current || current.family !== HealthKitWorkoutFamily.STRENGTH) {
    return Object.freeze({ ...base, outcome: HealthKitStrengthMatchOutcome.NONE, reason: "not_a_strength_workout", unverifiableSessionCount: 0, candidates: Object.freeze([]) });
  }
  const hkCandidate = workoutAsEvidence(canonicalWorkout);
  const confirmedElsewhere = new Set(existingLinks
    .filter((link) => link.status === HealthKitWorkoutLinkStatus.CONFIRMED && link.canonicalWorkoutId !== canonicalWorkout.id)
    .map((link) => link.loggerSessionCanonicalId));
  const sameDayNativeLoggerSessions = canonicalObjects.filter((record) => {
    const payload = record.payload ?? record;
    return isActiveDetailedStrengthSession(record) && dateOf(payload) === current.localDate && isTrustedNativeLiveLoggerSession(payload);
  });
  const sameDayStrengthWorkouts = canonicalWorkouts.filter((workout) =>
    workout?.current?.family === HealthKitWorkoutFamily.STRENGTH && workout.localDate === current.localDate);
  const deterministicLoggerRuleAvailable = sameDayNativeLoggerSessions.length === 1 && sameDayStrengthWorkouts.length === 1;

  let unverifiable = 0;
  const assessed = [];
  for (const record of canonicalObjects.filter((item) =>
    isActiveDetailedStrengthSession(item) && isTrustedNativeLiveLoggerSession(item.payload ?? item))) {
    const payload = record.payload ?? record;
    if (dateOf(payload) !== current.localDate) continue;
    const explicit = getWorkoutIdentityFacts(payload).authoritativeIds.some((sourceId) =>
      getHealthKitCanonicalWorkoutIdForSource({
        bundleIdentifier: current.source.bundleIdentifier,
        externalId: sourceId,
      }) === canonicalWorkout.id);
    const canonicalId = record.canonicalId ?? payload.id;
    const trustedLoggerProvenance = true;
    const normalized = normalizeSessionTimes(payload, current.timeZone, {
      serverCommitTimestamp: lookupCommitTimestamp(loggerSessionServerCommitTimestamps, canonicalId),
    });
    if (!explicit && !normalized.usable) {
      unverifiable += 1;
      continue;
    }
    const assessment = assessWorkoutDuplicatePair(hkCandidate, normalized.payload);
    // Identity may establish which records are being compared, but it never
    // establishes that they describe the same physical workout. Preserve an
    // explicit identity as a review candidate when timing is unusable while
    // carrying independently verified temporal facts whenever they exist.
    const facts = normalized.usable ? boundaryFacts(current, normalized.payload.metadata) : null;
    const deterministicLoggerWindow = !explicit && deterministicLoggerRuleAvailable &&
      canonicalId === (sameDayNativeLoggerSessions[0].canonicalId ?? sameDayNativeLoggerSessions[0].payload?.id) &&
      facts.startInsideWorkoutWindow;
    // Adjacent is not the same workout: a session whose window merely touches or
    // sits beside the Apple workout has no real overlap and is not a candidate,
    // whatever its duration or calories say. (The shared duplicate service counts
    // a touching boundary as overlap; that stays untouched for its other callers.)
    if (!explicit && !facts.substantiveOverlap && !deterministicLoggerWindow) continue;
    // An explicit binding: the Logger session already names this exact Apple
    // workout. The canonical record never stores the private HealthKit id, so
    // the session's source ids are hashed the same way the record id is.
    assessed.push({
      canonicalId,
      outcome: explicit ? "duplicate" : deterministicLoggerWindow
        ? (facts.endAligned ? "duplicate" : "possible_duplicate") : assessment.outcome,
      confidence: explicit ? 100 : deterministicLoggerWindow
        ? (facts.endAligned ? 95 : Math.max(POSSIBLE_DUPLICATE_CONFIDENCE_THRESHOLD, assessment.confidence))
        : assessment.confidence,
      reasons: explicit ? ["The Logger session already names this exact Apple workout"]
        : deterministicLoggerWindow
          ? [
              "The only same-day live Logger strength session starts inside the Apple workout window",
              facts.endAligned
                ? "The Logger completion aligns with the Apple workout end"
                : "The Logger completion does not yet align with the Apple workout end",
            ]
          : assessment.reasons,
      // Confident needs a real overlap AND at least one boundary that agrees
      // within the existing tolerance (start with start, or end with end).
      qualified: explicit || (deterministicLoggerWindow
        ? facts.endAligned
        : assessment.outcome === "duplicate" && facts.substantiveOverlap && (facts.startAligned || facts.endAligned)),
      substantiveOverlap: facts?.substantiveOverlap ?? false,
      trustedLoggerProvenance,
      overlapSeconds: facts ? Math.round(facts.overlapMs / 1000) : null,
      startAligned: facts?.startAligned ?? null,
      endAligned: facts?.endAligned ?? null,
      explicit,
      basis: explicit ? "explicit_source_identity"
        : deterministicLoggerWindow ? "logger_session_window" : "temporal_and_telemetry",
    });
  }
  const candidates = assessed
    .filter((candidate) => candidate.outcome !== "not_duplicate")
    .sort((left, right) => right.confidence - left.confidence || String(left.canonicalId).localeCompare(String(right.canonicalId)));

  const eligible = candidates.filter((candidate) => !confirmedElsewhere.has(candidate.canonicalId));
  const summarize = (list) => Object.freeze(list.map((candidate) => Object.freeze({
    loggerSessionCanonicalId: candidate.canonicalId,
    confidence: candidate.confidence,
    reasons: Object.freeze([...candidate.reasons]),
    basis: candidate.basis,
    substantiveOverlap: candidate.substantiveOverlap,
    trustedLoggerProvenance: candidate.trustedLoggerProvenance,
    overlapSeconds: candidate.overlapSeconds,
    startAligned: candidate.startAligned,
    endAligned: candidate.endAligned,
  })));

  if (eligible.length === 0) {
    return Object.freeze({
      ...base,
      outcome: HealthKitStrengthMatchOutcome.NONE,
      reason: candidates.length > 0
        ? "only_candidates_already_linked_elsewhere"
        : unverifiable > 0 ? "logger_session_times_unverifiable" : "no_plausible_logger_session",
      unverifiableSessionCount: unverifiable,
      candidates: Object.freeze([]),
    });
  }
  const [best, second] = eligible;
  // The result depends only on the candidates' scores and facts, never on the
  // order they were supplied in: equal scores can never produce a winner.
  const clearlyAhead = !second || best.confidence - second.confidence >= HEALTHKIT_STRENGTH_TIE_MARGIN;
  if (!clearlyAhead) {
    return Object.freeze({
      ...base,
      outcome: HealthKitStrengthMatchOutcome.AMBIGUOUS,
      reason: "multiple_plausible_logger_sessions",
      unverifiableSessionCount: unverifiable,
      candidates: summarize(eligible),
    });
  }
  const confident = best.explicit || (best.qualified && unverifiable === 0);
  return Object.freeze({
    ...base,
    outcome: confident ? HealthKitStrengthMatchOutcome.CONFIDENT : HealthKitStrengthMatchOutcome.POSSIBLE,
    reason: best.explicit
      ? "explicit_source_identity"
      : confident
        ? (second ? "single_clearly_dominant_session" : "single_overlapping_session")
        : best.qualified && unverifiable > 0
          ? "unverifiable_same_day_session_present"
          : "single_session_below_confident_threshold",
    unverifiableSessionCount: unverifiable,
    candidates: summarize(eligible),
  });
}

export const HealthKitCardioCoexistenceState = Object.freeze({
  NO_OTHER_SOURCE: "no_other_source",
  MATCHES_EXISTING_WORKOUT: "matches_existing_evidence_workout",
  POSSIBLE_MATCH: "possible_match_existing_evidence_workout",
  AMBIGUOUS: "ambiguous_existing_evidence_workouts",
  UNVERIFIABLE: "unverifiable_existing_evidence_workouts",
});

/**
 * Cardio has no Logger session. The duplicate risk is an existing Evidence
 * workout for the same physical workout (for example an Apple Fitness
 * screenshot walk). Read-only, deterministic, and it never merges or
 * overwrites: it only records how the two relate so nothing is counted twice.
 * An existing same-day workout whose time cannot be verified is reported as
 * such, never as "no other source".
 */
export function assessHealthKitCardioCoexistence({ canonicalWorkout, canonicalObjects = [] } = {}) {
  const current = canonicalWorkout?.current;
  if (!current || current.family !== HealthKitWorkoutFamily.CARDIO) {
    return Object.freeze({ state: HealthKitCardioCoexistenceState.NO_OTHER_SOURCE, reason: "not_a_cardio_workout", unverifiableCount: 0, candidates: Object.freeze([]) });
  }
  const hkCandidate = workoutAsEvidence(canonicalWorkout);
  let unverifiable = 0;
  const related = [];
  for (const record of canonicalObjects) {
    const payload = record.payload ?? record;
    if (payload?.evidence_type !== "training" ||
      record?.quality?.status === "superseded" || payload?.quality?.status === "superseded" ||
      (Array.isArray(payload.exercises) && payload.exercises.length > 0) ||
      dateOf(payload) !== current.localDate) continue;
    const normalized = normalizeSessionTimes(payload, current.timeZone);
    if (!normalized.usable) {
      unverifiable += 1;
      continue;
    }
    const assessment = assessWorkoutDuplicatePair(hkCandidate, normalized.payload);
    if (assessment.outcome === "not_duplicate") continue;
    related.push({ canonicalId: record.canonicalId ?? payload.id, outcome: assessment.outcome, confidence: assessment.confidence, reasons: assessment.reasons });
  }
  related.sort((left, right) => right.confidence - left.confidence || String(left.canonicalId).localeCompare(String(right.canonicalId)));
  const candidates = Object.freeze(related.map((item) => Object.freeze({ ...item, reasons: Object.freeze([...item.reasons]) })));
  if (related.length === 0) {
    return Object.freeze({
      state: unverifiable > 0 ? HealthKitCardioCoexistenceState.UNVERIFIABLE : HealthKitCardioCoexistenceState.NO_OTHER_SOURCE,
      unverifiableCount: unverifiable,
      candidates,
    });
  }
  if (related.length > 1) return Object.freeze({ state: HealthKitCardioCoexistenceState.AMBIGUOUS, unverifiableCount: unverifiable, candidates });
  return Object.freeze({
    state: related[0].outcome === "duplicate"
      ? HealthKitCardioCoexistenceState.MATCHES_EXISTING_WORKOUT
      : HealthKitCardioCoexistenceState.POSSIBLE_MATCH,
    unverifiableCount: unverifiable,
    candidates,
  });
}

/**
 * Other canonical Apple workouts that may be the SAME physical workout: a
 * re-created HealthKit workout (a new UUID after a delete) or one workout
 * recorded by two sources. Same family and type, and overlapping or closely
 * aligned windows. Read-only; it only reports, and reassessment uses it to
 * avoid two candidate links to one Logger session.
 */
export function findPossibleDuplicateCanonicalWorkouts(canonicalWorkout, allWorkouts = []) {
  const a = canonicalWorkout?.current;
  if (!a) return Object.freeze([]);
  const tolerance = TEMPORAL_TOLERANCE_MINUTES * 60000;
  const window = (current) => {
    const start = Date.parse(current.startedAt);
    const end = current.endedAt ? Date.parse(current.endedAt)
      : Number.isFinite(current.telemetry?.durationSeconds) ? start + current.telemetry.durationSeconds * 1000 : start;
    return { start, end };
  };
  const wa = window(a);
  return Object.freeze(allWorkouts
    .filter((other) => other.id !== canonicalWorkout.id && other.current &&
      other.current.family === a.family && other.current.canonicalType === a.canonicalType &&
      other.localDate === canonicalWorkout.localDate)
    .filter((other) => {
      const wb = window(other.current);
      if (![wa.start, wa.end, wb.start, wb.end].every(Number.isFinite)) return false;
      // The same physical workout overlaps for real AND has an aligned boundary.
      // Back-to-back workouts that only touch, or overlap without any aligned
      // boundary, are different workouts.
      const overlap = Math.min(wa.end, wb.end) - Math.max(wa.start, wb.start);
      return overlap > tolerance && (Math.abs(wa.start - wb.start) <= tolerance || Math.abs(wa.end - wb.end) <= tolerance);
    })
    .map((other) => other.id)
    .sort());
}

export function getHealthKitWorkoutLinkRecordId(canonicalWorkoutId, loggerSessionCanonicalId) {
  const digest = createHash("sha256")
    .update([canonicalWorkoutId, loggerSessionCanonicalId].join("\u0000"))
    .digest("hex")
    .slice(0, 40);
  return `${HEALTHKIT_WORKOUT_LINK_ID_PREFIX}${digest}`;
}

/**
 * A link candidate record for a confident or possible single match. An
 * ambiguous or absent match never produces a record. Every relationship,
 * including one supported by explicit source identity, remains a candidate
 * until it passes the separate guarded confirmation path.
 */
export function createHealthKitWorkoutLinkCandidate({ canonicalWorkout, assessment, ownerUserId, now } = {}) {
  const outcome = assessment?.outcome;
  if (![HealthKitStrengthMatchOutcome.CONFIDENT, HealthKitStrengthMatchOutcome.POSSIBLE].includes(outcome)) {
    throw new HealthKitWorkoutLinkError("LINK_CANDIDATE_NOT_ELIGIBLE", `A ${outcome} match never produces a link record.`);
  }
  const [candidate] = assessment.candidates;
  const at = new Date(now).toISOString();
  // Creation never confirms, not even for an explicit source identity: every
  // confirmation goes through the guarded relationship service.
  const createdBy = { kind: "system_matcher", ref: HEALTHKIT_WORKOUT_MATCHER_VERSION };
  return Object.freeze({
    schemaVersion: HEALTHKIT_WORKOUT_LINK_SCHEMA_VERSION,
    id: getHealthKitWorkoutLinkRecordId(canonicalWorkout.id, candidate.loggerSessionCanonicalId),
    userId: ownerUserId,
    localDate: canonicalWorkout.localDate,
    canonicalWorkoutId: canonicalWorkout.id,
    loggerSessionCanonicalId: candidate.loggerSessionCanonicalId,
    status: HealthKitWorkoutLinkStatus.CANDIDATE,
    matchOutcome: outcome,
    matchBasis: candidate.basis,
    confidence: candidate.confidence,
    reasons: [...candidate.reasons],
    matcherVersion: assessment.matcherVersion,
    // Links describe an association; they never move authority.
    contentAuthority: { trainingContent: "workout_logger", telemetry: "healthkit" },
    createdBy,
    statusHistory: [{ status: HealthKitWorkoutLinkStatus.CANDIDATE, at, by: createdBy }],
    evidenceEligibility: createHealthKitQuarantinedEligibility(),
    createdAt: at,
    updatedAt: at,
  });
}

/**
 * Bring an existing SYSTEM-owned candidate up to date with the latest
 * assessment (outcome, confidence, reasons) without changing its status, and
 * restore a link the system itself released as "assessment_changed" when the
 * matcher supports it again. Founder-owned states are never touched.
 */
export function refreshHealthKitWorkoutLinkCandidate(link, { assessment, now, existingLinks = [] } = {}) {
  const [candidate] = assessment.candidates;
  const at = new Date(now).toISOString();
  const lastEntry = link.statusHistory.at(-1);
  if (link.status === HealthKitWorkoutLinkStatus.UNLINKED &&
    lastEntry?.reason === "assessment_changed" && lastEntry?.by?.kind === "system_matcher") {
    // A restore that would collide with an established confirmed link simply
    // stays released; it must never throw and fail an ingest batch.
    if (existingLinks.some((other) => other.id !== link.id && other.status === HealthKitWorkoutLinkStatus.CONFIRMED &&
      (other.canonicalWorkoutId === link.canonicalWorkoutId || other.loggerSessionCanonicalId === link.loggerSessionCanonicalId))) {
      return link;
    }
    return transition({ ...link, matchOutcome: assessment.outcome, confidence: candidate.confidence, reasons: [...candidate.reasons], matcherVersion: assessment.matcherVersion },
      HealthKitWorkoutLinkStatus.CANDIDATE, { by: { kind: "system_matcher", ref: assessment.matcherVersion }, now: at, reason: "assessment_restored" });
  }
  if (link.status !== HealthKitWorkoutLinkStatus.CANDIDATE) return link;
  const changed = link.matchOutcome !== assessment.outcome || link.confidence !== candidate.confidence ||
    link.matcherVersion !== assessment.matcherVersion || JSON.stringify(link.reasons) !== JSON.stringify(candidate.reasons);
  if (!changed) return link;
  return Object.freeze({
    ...link,
    matchOutcome: assessment.outcome,
    confidence: candidate.confidence,
    reasons: [...candidate.reasons],
    matcherVersion: assessment.matcherVersion,
    updatedAt: at,
  });
}

/**
 * Pure state transition for a confirmation. It FAILS CLOSED: the full
 * relationship context (every existing link and every canonical workout) is
 * required, so a caller can no longer bypass the one-to-one rules by leaving it
 * out. Durable, race-safe confirmation is `confirmHealthKitWorkoutRelationship`
 * in HealthKitWorkoutRelationshipService, which adds atomic claim rows.
 */
export function confirmHealthKitWorkoutLink(link, { by, now, existingLinks, canonicalWorkouts } = {}) {
  if (link.status === HealthKitWorkoutLinkStatus.CONFIRMED) return link;
  assertHealthKitWorkoutLinkAllowed(link, { existingLinks, canonicalWorkouts });
  return transition(link, HealthKitWorkoutLinkStatus.CONFIRMED, { by, now });
}

/** Unlink keeps the record and both underlying records. Relink is confirm again. */
export function unlinkHealthKitWorkoutLink(link, { by, now, reason = null } = {}) {
  if (link.status === HealthKitWorkoutLinkStatus.UNLINKED) return link;
  return transition(link, HealthKitWorkoutLinkStatus.UNLINKED, { by, now, reason });
}

/**
 * The relationship invariant for a link about to become active (confirmed):
 *   - one Apple workout has at most one confirmed Logger session;
 *   - one Logger session has at most one confirmed Apple workout;
 *   - one PHYSICAL workout (a re-created HealthKit UUID or a second source,
 *     found by the duplicate rule) has at most one confirmed session.
 * It never overwrites an established link: a conflicting second relationship is
 * refused. Candidates may mention alternatives; only confirmed links are checked.
 */
export function assertHealthKitWorkoutLinkAllowed(link, { existingLinks, canonicalWorkouts } = {}) {
  if (!Array.isArray(existingLinks) || !Array.isArray(canonicalWorkouts)) {
    throw new HealthKitWorkoutLinkError("LINK_CONTEXT_REQUIRED", "A confirmation needs the full relationship context (existing links and canonical workouts).");
  }
  const confirmed = existingLinks.filter((other) => other.id !== link.id && other.status === HealthKitWorkoutLinkStatus.CONFIRMED);
  if (confirmed.some((other) => other.canonicalWorkoutId === link.canonicalWorkoutId || other.loggerSessionCanonicalId === link.loggerSessionCanonicalId)) {
    throw new HealthKitWorkoutLinkError("LINK_ONE_TO_ONE_VIOLATION", "An Apple workout and a Logger session can each have only one confirmed link.");
  }
  const workout = canonicalWorkouts.find((candidate) => candidate.id === link.canonicalWorkoutId);
  if (!workout) {
    throw new HealthKitWorkoutLinkError("LINK_WORKOUT_UNAVAILABLE", "The canonical Apple workout for this link is no longer available.");
  }
  const group = new Set(findPossibleDuplicateCanonicalWorkouts(workout, canonicalWorkouts));
  if (confirmed.some((other) => group.has(other.canonicalWorkoutId))) {
    throw new HealthKitWorkoutLinkError("LINK_DUPLICATE_GROUP_CONFLICT", "This Apple workout duplicates one that already has a confirmed link.");
  }
}

function transition(link, status, { by, now, reason = null }) {
  const at = new Date(now).toISOString();
  return Object.freeze({
    ...link,
    status,
    updatedAt: at,
    statusHistory: [...link.statusHistory, { status, at, by, ...(reason ? { reason } : {}) }],
  });
}

// How the Logger session's window sits against the Apple workout's window, in
// absolute instants: real overlap, and whether either boundary agrees within the
// existing five-minute tolerance. A missing session end is treated as a start-only
// window that must begin inside the workout (or within tolerance before it).
function boundaryFacts(current, sessionMetadata) {
  const tolerance = TEMPORAL_TOLERANCE_MINUTES * 60000;
  const hkStart = Date.parse(current.startedAt);
  const hkEnd = current.endedAt ? Date.parse(current.endedAt)
    : Number.isFinite(current.telemetry?.durationSeconds) ? hkStart + current.telemetry.durationSeconds * 1000 : hkStart;
  const sStart = Date.parse(sessionMetadata.start_time);
  const sEnd = sessionMetadata.end_time ? Date.parse(sessionMetadata.end_time) : null;
  const overlapMs = sEnd !== null
    ? Math.min(hkEnd, sEnd) - Math.max(hkStart, sStart)
    : (sStart >= hkStart - tolerance && sStart < hkEnd ? hkEnd - Math.max(sStart, hkStart) : 0);
  const overlap = Number.isFinite(overlapMs) ? Math.max(0, overlapMs) : 0;
  const shorter = Math.min(hkEnd - hkStart, sEnd !== null ? sEnd - sStart : Infinity);
  return {
    overlapMs: overlap,
    // Overlap within the existing temporal tolerance is clock skew at a shared
    // boundary, not the same workout. (Only a window shorter than the tolerance
    // itself can be substantive by covering its whole length.)
    substantiveOverlap: overlap > 0 && overlap >= Math.min(tolerance + 1, Math.max(shorter, 1)),
    startAligned: Math.abs(hkStart - sStart) <= tolerance,
    endAligned: sEnd !== null && Math.abs(hkEnd - sEnd) <= tolerance,
    startInsideWorkoutWindow: Number.isFinite(sStart) && sStart >= hkStart - tolerance && sStart < hkEnd,
  };
}

function dateOf(payload) {
  return String(payload?.observed_at ?? payload?.date ?? "").slice(0, 10);
}

// Logger and Evidence workouts, re-expressed with absolute-instant start and
// end so the shared duplicate service compares like with like. Nothing is
// mutated. `usable` is false when no start can be established.
function normalizeSessionTimes(payload, timeZone, { serverCommitTimestamp = null } = {}) {
  const metadata = payload.metadata ?? {};
  const dateKey = dateOf(payload);
  const rawStart = metadata.start_time ?? metadata.started_at ?? metadata.start ?? null;
  const explicitEnd = metadata.end_time ?? metadata.ended_at ?? metadata.end ?? null;
  const start = normalizeWorkoutTimeToInstant(rawStart, { dateKey, timeZone });
  const syntheticNoonCapture = isSyntheticNoonCapture(payload.captured_at, dateKey);
  const serverCommitEnd = explicitEnd === null && isTrustedNativeLiveLoggerSession(payload) &&
    syntheticNoonCapture && validInstant(serverCommitTimestamp)
    ? new Date(serverCommitTimestamp).toISOString()
    : null;
  const capturedEnd = isTrustedNativeLiveLoggerSession(payload) && !syntheticNoonCapture
    ? payload.captured_at ?? null
    : null;
  const rawEnd = explicitEnd ?? serverCommitEnd ??
    capturedEnd;
  let end = normalizeWorkoutTimeToInstant(rawEnd, { dateKey, timeZone });
  // A Server commit is an absolute instant, not a wall-clock value. If it
  // predates the session start, reject it instead of manufacturing a next-day
  // end through the general midnight normalization below.
  if (serverCommitEnd && start && end && Date.parse(end) < Date.parse(start)) end = null;
  // A bare or naive wall-clock end before its start crossed midnight.
  if (!serverCommitEnd && start && end && Date.parse(end) < Date.parse(start)) end = new Date(Date.parse(end) + 86400000).toISOString();
  const durationSeconds = metadata.duration_seconds ??
    (start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 1000) : null);
  return {
    usable: start !== null,
    payload: {
      ...payload,
      metadata: {
        ...metadata,
        start_time: start ?? undefined, started_at: undefined, start: undefined,
        end_time: end ?? undefined, ended_at: undefined, end: undefined,
        duration_seconds: durationSeconds ?? undefined,
      },
    },
  };
}

function lookupCommitTimestamp(timestamps, canonicalId) {
  if (!canonicalId) return null;
  if (timestamps instanceof Map) return timestamps.get(canonicalId) ?? null;
  return timestamps?.[canonicalId] ?? null;
}

function isSyntheticNoonCapture(value, dateKey) {
  if (!validInstant(value) || !dateKey) return false;
  return new Date(value).toISOString() === `${dateKey}T12:00:00.000Z`;
}

function validInstant(value) {
  return value != null && !Number.isNaN(Date.parse(value));
}

export function isTrustedNativeLiveLoggerSession(payload) {
  return payload?.metadata?.logger_origin === "training_logger" && payload?.metadata?.logger_mode === "live";
}

// The canonical Apple workout expressed in the shape the shared duplicate
// service understands. It carries telemetry only and never any exercises.
function workoutAsEvidence(canonicalWorkout) {
  const c = canonicalWorkout.current;
  const compact = (value) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined));
  return {
    id: canonicalWorkout.id,
    evidence_type: "training",
    observed_at: c.localDate,
    source: { application: "Apple Health", integration: "HealthKit", modality: "direct" },
    metadata: compact({
      activity_type: c.canonicalType,
      start_time: new Date(Date.parse(c.startedAt)).toISOString(),
      end_time: c.endedAt ? new Date(Date.parse(c.endedAt)).toISOString() : null,
      duration_seconds: c.telemetry.durationSeconds,
      active_calories: c.telemetry.activeCalories,
      total_calories: c.telemetry.totalCalories,
      distance: c.telemetry.distance,
      average_heart_rate: c.telemetry.averageHeartRate,
    }),
    exercises: [],
  };
}
