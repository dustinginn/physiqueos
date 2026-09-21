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
export const HEALTHKIT_WORKOUT_MATCHER_VERSION = "healthkit-strength-matcher-v2";
// A confident match is only a CANDIDATE. Turning any candidate into a
// confirmed link is a separate, explicit act. This is a reviewed constant, not
// a policy option (the activation policy rejects any attempt to set it).
export const HEALTHKIT_STRENGTH_LINK_AUTO_CONFIRM = false;

// Thresholds are the existing product semantics for "same workout", reused
// unchanged from WorkoutDuplicateIdentityService rather than invented here.
export const HEALTHKIT_STRENGTH_MATCH_THRESHOLDS = Object.freeze({
  confident: DUPLICATE_CONFIDENCE_THRESHOLD,
  possible: POSSIBLE_DUPLICATE_CONFIDENCE_THRESHOLD,
  temporalToleranceMinutes: TEMPORAL_TOLERANCE_MINUTES,
});

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

  let unverifiable = 0;
  const assessed = [];
  for (const record of canonicalObjects.filter(isActiveDetailedStrengthSession)) {
    const payload = record.payload ?? record;
    if (dateOf(payload) !== current.localDate) continue;
    const explicit = getWorkoutIdentityFacts(payload).authoritativeIds.some((sourceId) =>
      getHealthKitCanonicalWorkoutIdForSource({
        bundleIdentifier: current.source.bundleIdentifier,
        externalId: sourceId,
      }) === canonicalWorkout.id);
    const normalized = normalizeSessionTimes(payload, current.timeZone);
    if (!explicit && !normalized.usable) {
      unverifiable += 1;
      continue;
    }
    const assessment = assessWorkoutDuplicatePair(hkCandidate, normalized.payload);
    // An explicit binding: the Logger session already names this exact Apple
    // workout. The canonical record never stores the private HealthKit id, so
    // the session's source ids are hashed the same way the record id is.
    assessed.push({
      canonicalId: record.canonicalId ?? payload.id,
      outcome: explicit ? "duplicate" : assessment.outcome,
      confidence: explicit ? 100 : assessment.confidence,
      reasons: explicit ? ["The Logger session already names this exact Apple workout"] : assessment.reasons,
      overlapping: explicit || assessment.signals?.temporal?.overlapping === true,
      explicit,
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
    basis: candidate.explicit ? "explicit_source_identity" : "temporal_and_telemetry",
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
  if (eligible.length > 1) {
    return Object.freeze({
      ...base,
      outcome: HealthKitStrengthMatchOutcome.AMBIGUOUS,
      reason: "multiple_plausible_logger_sessions",
      unverifiableSessionCount: unverifiable,
      candidates: summarize(eligible),
    });
  }
  const [only] = eligible;
  const confident = only.explicit || (only.outcome === "duplicate" && only.overlapping && unverifiable === 0);
  return Object.freeze({
    ...base,
    outcome: confident ? HealthKitStrengthMatchOutcome.CONFIDENT : HealthKitStrengthMatchOutcome.POSSIBLE,
    reason: only.explicit
      ? "explicit_source_identity"
      : confident
        ? "single_overlapping_session"
        : only.outcome === "duplicate" && only.overlapping && unverifiable > 0
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
  const startA = Date.parse(a.startedAt);
  const endA = Date.parse(a.endedAt ?? a.startedAt);
  const tolerance = TEMPORAL_TOLERANCE_MINUTES * 60000;
  return Object.freeze(allWorkouts
    .filter((other) => other.id !== canonicalWorkout.id && other.current &&
      other.current.family === a.family && other.current.canonicalType === a.canonicalType &&
      other.localDate === canonicalWorkout.localDate)
    .filter((other) => {
      const startB = Date.parse(other.current.startedAt);
      const endB = Date.parse(other.current.endedAt ?? other.current.startedAt);
      if (![startA, endA, startB, endB].every(Number.isFinite)) return false;
      return (startA <= endB && startB <= endA) || Math.abs(startA - startB) <= tolerance;
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
 * ambiguous or absent match never produces a record. An explicit source
 * identity shared by both sides is the only thing that creates a link already
 * confirmed, and only when it would not break the one-to-one rule; everything
 * else needs a separate explicit confirmation.
 */
export function createHealthKitWorkoutLinkCandidate({ canonicalWorkout, assessment, ownerUserId, now, existingLinks = [] } = {}) {
  const outcome = assessment?.outcome;
  if (![HealthKitStrengthMatchOutcome.CONFIDENT, HealthKitStrengthMatchOutcome.POSSIBLE].includes(outcome)) {
    throw new HealthKitWorkoutLinkError("LINK_CANDIDATE_NOT_ELIGIBLE", `A ${outcome} match never produces a link record.`);
  }
  const [candidate] = assessment.candidates;
  const at = new Date(now).toISOString();
  const explicit = candidate.basis === "explicit_source_identity";
  const id = getHealthKitWorkoutLinkRecordId(canonicalWorkout.id, candidate.loggerSessionCanonicalId);
  const oneToOneClash = existingLinks.some((other) =>
    other.id !== id && other.status === HealthKitWorkoutLinkStatus.CONFIRMED &&
    (other.canonicalWorkoutId === canonicalWorkout.id || other.loggerSessionCanonicalId === candidate.loggerSessionCanonicalId));
  const status = (explicit && !oneToOneClash) || HEALTHKIT_STRENGTH_LINK_AUTO_CONFIRM
    ? HealthKitWorkoutLinkStatus.CONFIRMED
    : HealthKitWorkoutLinkStatus.CANDIDATE;
  const createdBy = explicit && status === HealthKitWorkoutLinkStatus.CONFIRMED
    ? { kind: "explicit_source_identity", ref: HEALTHKIT_WORKOUT_MATCHER_VERSION }
    : { kind: "system_matcher", ref: HEALTHKIT_WORKOUT_MATCHER_VERSION };
  return Object.freeze({
    schemaVersion: HEALTHKIT_WORKOUT_LINK_SCHEMA_VERSION,
    id,
    userId: ownerUserId,
    localDate: canonicalWorkout.localDate,
    canonicalWorkoutId: canonicalWorkout.id,
    loggerSessionCanonicalId: candidate.loggerSessionCanonicalId,
    status,
    matchOutcome: outcome,
    confidence: candidate.confidence,
    reasons: [...candidate.reasons],
    matcherVersion: assessment.matcherVersion,
    // Links describe an association; they never move authority.
    contentAuthority: { trainingContent: "workout_logger", telemetry: "healthkit" },
    createdBy,
    statusHistory: [{ status, at, by: createdBy }],
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
    assertOneToOne(link, existingLinks);
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

export function confirmHealthKitWorkoutLink(link, { by, now, existingLinks = [] } = {}) {
  if (link.status === HealthKitWorkoutLinkStatus.CONFIRMED) return link;
  assertOneToOne(link, existingLinks);
  return transition(link, HealthKitWorkoutLinkStatus.CONFIRMED, { by, now });
}

/** Unlink keeps the record and both underlying records. Relink is confirm again. */
export function unlinkHealthKitWorkoutLink(link, { by, now, reason = null } = {}) {
  if (link.status === HealthKitWorkoutLinkStatus.UNLINKED) return link;
  return transition(link, HealthKitWorkoutLinkStatus.UNLINKED, { by, now, reason });
}

/** At most one confirmed link per Apple workout and per Logger session. */
export function assertOneToOne(link, existingLinks = []) {
  const clash = existingLinks.find((other) =>
    other.id !== link.id &&
    other.status === HealthKitWorkoutLinkStatus.CONFIRMED &&
    (other.canonicalWorkoutId === link.canonicalWorkoutId || other.loggerSessionCanonicalId === link.loggerSessionCanonicalId));
  if (clash) {
    throw new HealthKitWorkoutLinkError("LINK_ONE_TO_ONE_VIOLATION", "An Apple workout and a Logger session can each have only one confirmed link.");
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

function dateOf(payload) {
  return String(payload?.observed_at ?? payload?.date ?? "").slice(0, 10);
}

// Logger and Evidence workouts, re-expressed with absolute-instant start and
// end so the shared duplicate service compares like with like. Nothing is
// mutated. `usable` is false when no start can be established.
function normalizeSessionTimes(payload, timeZone) {
  const metadata = payload.metadata ?? {};
  const dateKey = dateOf(payload);
  const rawStart = metadata.start_time ?? metadata.started_at ?? metadata.start ?? null;
  const rawEnd = metadata.end_time ?? metadata.ended_at ?? metadata.end ?? null;
  const start = normalizeWorkoutTimeToInstant(rawStart, { dateKey, timeZone });
  let end = normalizeWorkoutTimeToInstant(rawEnd, { dateKey, timeZone });
  // A bare or naive wall-clock end before its start crossed midnight.
  if (start && end && Date.parse(end) < Date.parse(start)) end = new Date(Date.parse(end) + 86400000).toISOString();
  return {
    usable: start !== null,
    payload: {
      ...payload,
      metadata: {
        ...metadata,
        start_time: start ?? undefined, started_at: undefined, start: undefined,
        end_time: end ?? undefined, ended_at: undefined, end: undefined,
      },
    },
  };
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
