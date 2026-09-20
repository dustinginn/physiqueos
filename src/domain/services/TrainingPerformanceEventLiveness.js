import { resolveTrainingExerciseOccurrenceIdentity } from "../models/trainingExerciseIdentity";

// A durable Training performance event is an immutable derived fact. It never
// becomes Training truth: the active canonical Training session that produced
// it is. Current-state consumers (Performance Records, Weekly and Monthly
// highlights) must therefore ask whether the event's source session is still
// authoritative before presenting it as a current achievement. Nothing here
// deletes or rewrites an event; a superseded source only removes it from
// current presentation until an active session resolves it again.
export const TrainingPerformanceEventLiveness = Object.freeze({
  // An active canonical session with the event's session identity, workout
  // date and exercise still exists.
  LIVE: "live",
  // The source canonical object exists but is superseded and no active
  // canonical session carries the same session identity and workout date.
  SUPERSEDED: "superseded",
  // No canonical Training object matches the event at all.
  ORPHANED: "orphaned",
});

export function resolveTrainingPerformanceEventLiveness({
  events = [],
  canonicalObjects = [],
} = {}) {
  if (!Array.isArray(events) || !Array.isArray(canonicalObjects)) {
    throw new TypeError("Event liveness requires event and canonical object lists.");
  }
  const sessions = canonicalObjects.map(toSession).filter(Boolean);
  const byCanonicalId = new Map(sessions.map((session) => [session.canonicalId, session]));
  const activeBySessionKey = new Map();
  for (const session of sessions.filter((item) => item.active)) {
    const key = sessionKey(session.sessionId, session.date);
    activeBySessionKey.set(key, [...(activeBySessionKey.get(key) ?? []), session]);
  }

  const resolutions = new Map();
  for (const event of events) {
    if (!event?.id) continue;
    const workoutDate = dateKey(event.workoutDate);
    const exact = byCanonicalId.get(String(event.sourceCanonicalTrainingId ?? ""));
    // The canonical id is the direct link. The session identity (payload id) and
    // workout date is the lineage link: a canonical correction revision keeps
    // the original session identity and date, so the achievements it earned
    // resolve to the corrected session. A supersession chain is deliberately
    // NOT followed: a false chain can end on a different workout date.
    const candidates = [
      ...(exact?.active ? [exact] : []),
      ...(activeBySessionKey.get(sessionKey(event.sourceSessionId, workoutDate)) ?? []),
    ];
    const live = candidates.find((session) =>
      session.date === workoutDate && session.exerciseIds.has(String(event.canonicalExerciseId ?? ""))
    );
    if (live) {
      resolutions.set(event.id, {
        state: TrainingPerformanceEventLiveness.LIVE,
        activeCanonicalId: live.canonicalId,
      });
      continue;
    }
    resolutions.set(event.id, {
      state: exact ? TrainingPerformanceEventLiveness.SUPERSEDED : TrainingPerformanceEventLiveness.ORPHANED,
      activeCanonicalId: null,
    });
  }
  return resolutions;
}

export function selectLiveTrainingPerformanceEvents(events = [], canonicalObjects = []) {
  const resolutions = resolveTrainingPerformanceEventLiveness({ events, canonicalObjects });
  return (events ?? []).filter((event) =>
    resolutions.get(event?.id)?.state === TrainingPerformanceEventLiveness.LIVE
  );
}

function toSession(object) {
  const payload = object?.payload ?? object;
  if (!payload || payload.evidence_type !== "training") return null;
  const canonicalId = String(object?.canonicalId ?? payload.canonicalId ?? "");
  const status = object?.quality?.status ?? payload.quality?.status;
  return {
    canonicalId,
    sessionId: String(payload.id ?? ""),
    date: dateKey(payload.observed_at ?? object?.lastObservedAt),
    active: status !== "superseded" && !object?.quality?.supersededBy && !payload.quality?.supersededBy,
    exerciseIds: new Set((payload.exercises ?? []).map((exercise) =>
      String(resolveTrainingExerciseOccurrenceIdentity(exercise).canonicalExerciseId ?? exercise?.canonicalExerciseId ?? "")
    )),
  };
}

function sessionKey(sessionId, date) {
  return `${String(sessionId ?? "")}|${date}`;
}

function dateKey(value) {
  return String(value ?? "").slice(0, 10);
}
