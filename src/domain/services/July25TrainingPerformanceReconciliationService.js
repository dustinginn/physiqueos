import {
  haveSameTrainingPerformanceEventSemantics,
  TRAINING_PERFORMANCE_EVENT_TYPES,
} from "../models/trainingPerformanceEvent";
import { produceTrainingPerformanceEvents } from "./TrainingPerformanceEventProducer";
import {
  TrainingPerformanceEventPersistenceOutcome,
} from "./TrainingPerformanceEventPersistenceService";

export const JULY_25_TRAINING_RECONCILIATION_VERSION =
  "july_25_training_performance_reconciliation_v1";

export const JULY_25_TRAINING_RECONCILIATION_TARGET = Object.freeze({
  reviewId: "evidence_review_20260726021515848",
  evidencePackageId: "evidence_submission_20260726021441961_images",
  canonicalTrainingId:
    "training|2026-07-25|traditional strength training|||6108||527",
  sessionId: "training_2026-07-25_traditional_strength_training_1",
  analysisId:
    "analysis_training_evidence_submission_20260726021441961_images",
  workoutDate: "2026-07-25",
  confirmationTimestamp: "2026-07-26T02:31:00.342Z",
});

const EXPECTED_EVENTS = Object.freeze([
  expectation("ez_bar_curl", "session_volume_pr", 3700, 3380),
  expectation("ez_bar_curl", "reps_at_load_pr", 15, 13, 65),
  expectation("cable_pushdown", "session_volume_pr", 6160, 5830),
  expectation("straight_bar_cable_pushdown", "session_volume_pr", 6720, 6240),
  expectation("straight_bar_cable_pushdown", "reps_at_load_pr", 14, 13, 120),
  expectation("forearm_curl", "session_volume_pr", 8720, 7680),
]);

export function createJuly25TrainingPerformanceReconciliationService({
  liveStore,
  persistenceService,
  now = () => new Date(),
} = {}) {
  if (!liveStore || !persistenceService) {
    throw new Error("July 25 reconciliation requires a bound Founder store.");
  }

  return {
    prepare(target = JULY_25_TRAINING_RECONCILIATION_TARGET) {
      assertExactTarget(target);
      const sources = resolveSources(liveStore, target);
      validateSources(sources, target);
      const events = produceTrainingPerformanceEvents({
        canonicalTrainingSession: sources.canonicalSession,
        trainingAnalysis: sources.analysis,
        sourceReviewId: target.reviewId,
        sourceEvidencePackageId: target.evidencePackageId,
        now: () => new Date(target.confirmationTimestamp),
      });
      validateExpectedEvents(events, target);
      return { events, sources, target };
    },

    async reconcile(target = JULY_25_TRAINING_RECONCILIATION_TARGET) {
      const preparation = this.prepare(target);
      const existingMarker = findMarker(liveStore, target.reviewId);
      if (existingMarker) {
        validateMarker(existingMarker, preparation.events, target);
      }

      const reconciledAt = now().toISOString();
      const result = await persistenceService.persistEventBatch(
        preparation.events,
        {
          mutateCandidate(store, { newEvents, existingEvents }) {
            if (existingMarker) {
              throw new Error("A reconciliation marker cannot accompany a new event batch.");
            }
            const review = findOne(store.evidenceReviews, "id", target.reviewId, "review");
            const marker = createMarker({
              target,
              events: newEvents,
              reconciledAt,
            });
            store.migrationMarkers ??= [];
            store.migrationMarkers.push(marker);
            review.commitProgress ??= {};
            review.commitProgress.training_performance_events = {
              status: "completed",
              attempts: 1,
              completedAt: reconciledAt,
              result: {
                outcome: TrainingPerformanceEventPersistenceOutcome.CREATED,
                newlyCreatedEvents: structuredClone(newEvents),
                existingEvents: structuredClone(existingEvents),
              },
              reconciliation: structuredClone(marker),
            };
          },
          validateFinalized(store, { newEvents }) {
            const review = findOne(store.evidenceReviews, "id", target.reviewId, "review");
            const markers = (store.migrationMarkers ?? [])
              .filter((marker) => marker.sourceReviewId === target.reviewId);
            return (
              markers.length === 1 &&
              newEvents.length === 6 &&
              review.confirmation?.confirmedAt === target.confirmationTimestamp &&
              review.commitProgress?.training_performance_events?.result
                ?.newlyCreatedEvents?.length === 6
            );
          },
        }
      );

      if (result.outcome === TrainingPerformanceEventPersistenceOutcome.MATCHED) {
        if (!existingMarker) {
          throw new Error("Matched events exist without an authoritative reconciliation marker.");
        }
        validatePersistedReceipt(liveStore, preparation.events, target);
        return {
          ...result,
          idempotent: true,
          receiptPreserved: true,
          marker: structuredClone(existingMarker),
        };
      }
      if (result.outcome !== TrainingPerformanceEventPersistenceOutcome.CREATED) {
        return { ...result, idempotent: false, receiptPreserved: false };
      }
      return {
        ...result,
        idempotent: false,
        receiptPreserved: true,
        marker: findMarker(liveStore, target.reviewId),
      };
    },
  };
}

function validateSources({ review, evidencePackage, canonicalSession, analysis }, target) {
  if (review.status !== "confirmed" || review.confirmation?.confirmedAt !== target.confirmationTimestamp) {
    throw new Error("The target review is not the characterized confirmed review.");
  }
  if (review.interpretedEvidence?.package_id !== target.evidencePackageId) {
    throw new Error("The target review/evidence-package link is invalid.");
  }
  if (evidencePackage.package_id !== target.evidencePackageId) {
    throw new Error("The target evidence package is invalid.");
  }
  if (canonicalSession.canonicalId !== target.canonicalTrainingId ||
      canonicalSession.payload?.id !== target.sessionId ||
      canonicalSession.payload?.observed_at !== target.workoutDate) {
    throw new Error("The target canonical Training session link is invalid.");
  }
  if (!sourceContainsPackage(canonicalSession, target.evidencePackageId)) {
    throw new Error("The canonical Training session does not belong to the target package.");
  }
  if (analysis.id !== target.analysisId ||
      !analysis.evidenceIds?.includes(target.canonicalTrainingId)) {
    throw new Error("The persisted Training analysis does not include the target session.");
  }
  if (!target.analysisId.endsWith(target.evidencePackageId)) {
    throw new Error("The Training analysis/package identity is invalid.");
  }
  const exercises = canonicalSession.payload?.exercises ?? [];
  if (exercises.length !== 5 ||
      exercises.flatMap((exercise) => exercise.sets ?? []).length !== 20) {
    throw new Error("The target workout no longer contains five exercises and twenty sets.");
  }
}

function validateExpectedEvents(events, target) {
  if (events.length !== 6 ||
      events.filter((event) => event.eventType === TRAINING_PERFORMANCE_EVENT_TYPES.SESSION_VOLUME_PR).length !== 4 ||
      events.filter((event) => event.eventType === TRAINING_PERFORMANCE_EVENT_TYPES.REPS_AT_LOAD_PR).length !== 2 ||
      new Set(events.map((event) => event.id)).size !== 6 ||
      events.some((event) => event.canonicalExerciseId === "spider_curl")) {
    throw new Error("The produced July 25 event set differs from the verified six-event contract.");
  }
  for (const expected of EXPECTED_EVENTS) {
    const event = events.find((candidate) =>
      candidate.canonicalExerciseId === expected.canonicalExerciseId &&
      candidate.eventType === expected.eventType
    );
    if (!event || !matchesExpectation(event, expected, target)) {
      throw new Error(`The produced event differs from the verified contract: ${expected.canonicalExerciseId}/${expected.eventType}.`);
    }
  }
}

function matchesExpectation(event, expected, target) {
  return (
    event.currentValue === expected.currentValue &&
    event.previousBaselineValue === expected.previousBaselineValue &&
    event.improvement === expected.currentValue - expected.previousBaselineValue &&
    event.load === expected.load &&
    event.reps === (expected.eventType === "reps_at_load_pr" ? expected.currentValue : null) &&
    event.sessionVolume === (expected.eventType === "session_volume_pr" ? expected.currentValue : null) &&
    event.sourceReviewId === target.reviewId &&
    event.sourceEvidencePackageId === target.evidencePackageId &&
    event.sourceCanonicalTrainingId === target.canonicalTrainingId &&
    event.sourceSessionId === target.sessionId &&
    event.sourceAnalysisId === target.analysisId &&
    event.workoutDate === target.workoutDate
  );
}

function resolveSources(store, target) {
  return {
    review: findOne(store.evidenceReviews, "id", target.reviewId, "review"),
    evidencePackage: findOne(store.evidencePackages, "package_id", target.evidencePackageId, "evidence package"),
    canonicalSession: findOne(store.canonicalEvidenceObjects, "canonicalId", target.canonicalTrainingId, "canonical Training session"),
    analysis: findOne(store.analyses, "id", target.analysisId, "Training analysis"),
  };
}

function findOne(items = [], key, value, label) {
  const matches = items.filter((item) => item?.[key] === value);
  if (matches.length !== 1) throw new Error(`Expected exactly one target ${label}.`);
  return matches[0];
}

function sourceContainsPackage(canonicalSession, packageId) {
  return JSON.stringify(canonicalSession).includes(packageId);
}

function assertExactTarget(target) {
  for (const [key, value] of Object.entries(JULY_25_TRAINING_RECONCILIATION_TARGET)) {
    if (target?.[key] !== value) {
      throw new Error(`The bounded reconciliation target differs at ${key}.`);
    }
  }
  if (Object.keys(target).length !== Object.keys(JULY_25_TRAINING_RECONCILIATION_TARGET).length) {
    throw new Error("The bounded reconciliation target contains unsupported scope.");
  }
}

function expectation(canonicalExerciseId, eventType, currentValue, previousBaselineValue, load = null) {
  return Object.freeze({ canonicalExerciseId, eventType, currentValue, previousBaselineValue, load });
}

function createMarker({ target, events, reconciledAt }) {
  return {
    schemaVersion: JULY_25_TRAINING_RECONCILIATION_VERSION,
    sourceReviewId: target.reviewId,
    sourceEvidencePackageId: target.evidencePackageId,
    sourceCanonicalTrainingId: target.canonicalTrainingId,
    sourceSessionId: target.sessionId,
    sourceAnalysisId: target.analysisId,
    reconciledEventIds: events.map((event) => event.id).sort(),
    reconciledAt,
  };
}

function findMarker(store, reviewId) {
  const markers = (store.migrationMarkers ?? [])
    .filter((marker) =>
      marker.schemaVersion === JULY_25_TRAINING_RECONCILIATION_VERSION &&
      marker.sourceReviewId === reviewId
    );
  if (markers.length > 1) throw new Error("The target reconciliation marker is ambiguous.");
  return markers[0] ?? null;
}

function validateMarker(marker, events, target) {
  if (
    marker.schemaVersion !== JULY_25_TRAINING_RECONCILIATION_VERSION ||
    marker.sourceCanonicalTrainingId !== target.canonicalTrainingId ||
    marker.sourceAnalysisId !== target.analysisId ||
    JSON.stringify(marker.reconciledEventIds) !==
      JSON.stringify(events.map((event) => event.id).sort())
  ) {
    throw new Error("The persisted reconciliation marker differs from the target.");
  }
}

function validatePersistedReceipt(store, events, target) {
  const review = findOne(store.evidenceReviews, "id", target.reviewId, "review");
  const persisted = review.commitProgress?.training_performance_events?.result
    ?.newlyCreatedEvents;
  if (persisted?.length !== 6 ||
      !events.every((event) => persisted.some((candidate) =>
        candidate.id === event.id &&
        haveSameTrainingPerformanceEventSemantics(candidate, event)))) {
    throw new Error("The original authoritative reconciliation receipt is missing or invalid.");
  }
}
