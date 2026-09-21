import { createCommittedTrainingPerformanceAnalysis } from "../../application/training/TrainingPerformanceEventReconciliation.js";
import { produceTrainingPerformanceEvents } from "./TrainingPerformanceEventProducer.js";
import { resolveTrainingPerformanceEventLiveness } from "./TrainingPerformanceEventLiveness.js";

// Plans the durable performance events that were never derived for sessions
// whose confirmation bypassed the event step (the Logger command path, or a
// stalled review). Each session is evaluated exactly as its own confirmation
// would have been: against the active canonical Training as of that session's
// date, so the last exposure is the session itself and every baseline is the
// prior all-time best. Event ids are deterministic (canonical id, session,
// exercise, type and achievement values), so a session that already has live
// durable events is skipped instead of being duplicated under a new source id.
// Planning writes nothing.
export const TRAINING_RETROACTIVE_EVENT_SOURCE = "training_event_reconciliation_v1";

export function planRetroactiveTrainingPerformanceEvents({
  canonicalObjects = [],
  existingEvents = [],
  fromDate = "2026-09-13",
  now = () => new Date(),
} = {}) {
  const isActive = (object) => (object.quality?.status ?? "active") !== "superseded";
  const dateOf = (object) => String((object.payload ?? object).observed_at).slice(0, 10);
  const existingIds = new Set(existingEvents.map((event) => event.id));
  const liveness = resolveTrainingPerformanceEventLiveness({ events: existingEvents, canonicalObjects });
  const sessionsWithLiveEvents = new Set(existingEvents
    .filter((event) => liveness.get(event.id)?.state === "live")
    .map((event) => `${event.sourceSessionId}|${event.workoutDate}`));

  const sessions = canonicalObjects
    .filter((object) => isActive(object) && (object.payload?.exercises ?? []).length > 0 && dateOf(object) >= fromDate)
    .sort((left, right) => dateOf(left).localeCompare(dateOf(right)) || left.canonicalId.localeCompare(right.canonicalId));
  const proposed = [];
  const skipped = [];
  for (const session of sessions) {
    const key = `${session.payload.id}|${dateOf(session)}`;
    const activeAsOf = canonicalObjects.filter((object) => isActive(object) && dateOf(object) <= dateOf(session));
    const packageId = `${TRAINING_RETROACTIVE_EVENT_SOURCE}|${session.canonicalId}`;
    const events = produceTrainingPerformanceEvents({
      canonicalTrainingSession: session,
      trainingAnalysis: createCommittedTrainingPerformanceAnalysis({
        canonicalObjects: activeAsOf,
        packageId,
        capturedAt: `${dateOf(session)}T23:59:59.999Z`,
      }),
      sourceReviewId: TRAINING_RETROACTIVE_EVENT_SOURCE,
      sourceEvidencePackageId: packageId,
      now,
    });
    if (sessionsWithLiveEvents.has(key)) {
      skipped.push({ date: dateOf(session), sessionId: session.payload.id, reason: "live_durable_events_already_resolve_to_session", wouldDuplicate: events.length });
      continue;
    }
    for (const event of events) if (!existingIds.has(event.id)) proposed.push(event);
  }
  proposed.sort((left, right) =>
    left.workoutDate.localeCompare(right.workoutDate) ||
    left.canonicalExerciseId.localeCompare(right.canonicalExerciseId) ||
    left.eventType.localeCompare(right.eventType) ||
    left.id.localeCompare(right.id));
  return Object.freeze({ proposed, skipped });
}
