import {
  createTrainingPerformanceEvent,
  haveSameTrainingPerformanceEventSemantics,
  TRAINING_PERFORMANCE_EVENT_TYPES,
} from "../models/trainingPerformanceEvent";
import { resolveTrainingExerciseIdentity } from "../models/trainingExerciseIdentity";
import {
  getTrainingExecutionVariantKey,
  normalizeTrainingExecutionVariant,
} from "../models/trainingExecutionVariant";
import {
  deriveTrainingExerciseRelationshipContext,
  getTrainingExerciseRelationshipComparisonKey,
} from "../models/trainingExerciseRelationship";

export function produceTrainingPerformanceEvents({
  canonicalTrainingSession,
  trainingAnalysis,
  sourceReviewId,
  sourceEvidencePackageId,
  now = () => new Date(),
} = {}) {
  const session = canonicalTrainingSession?.payload ?? canonicalTrainingSession;
  const sourceCanonicalTrainingId =
    canonicalTrainingSession?.canonicalId ?? session?.canonicalId ?? session?.id;
  const report =
    trainingAnalysis?.metadata?.trainingPerformance ??
    trainingAnalysis?.trainingPerformance ??
    trainingAnalysis;
  if (
    !session?.id ||
    session.evidence_type !== "training" ||
    !sourceCanonicalTrainingId ||
    !trainingAnalysis?.id ||
    !Array.isArray(report?.exerciseObservations)
  ) {
    throw new Error("Current-session Training performance-event inputs are incomplete.");
  }

  const workoutDate = String(session.observed_at ?? "").slice(0, 10);
  const exercises = new Map();
  for (const exercise of session.exercises ?? []) {
    const identity = resolveTrainingExerciseIdentity(exercise.name);
    const canonicalExerciseId = exercise.canonicalExerciseId ??
      identity.canonicalExerciseId;
    if (!canonicalExerciseId) continue;
    const executionVariant = normalizeTrainingExecutionVariant(
      exercise.executionVariant
    );
    const relationshipContext = deriveTrainingExerciseRelationshipContext({
      exercise,
      session,
    });
    const key = performanceContextKey({
      canonicalExerciseId,
      executionVariant,
      relationshipContext,
    });
    exercises.set(key, [
      ...(exercises.get(key) ?? []),
      { exercise, executionVariant, identity, relationshipContext },
    ]);
  }
  const events = new Map();

  for (const observation of report.exerciseObservations) {
    const lastSession = observation?.explanation_data?.last_session;
    if (
      lastSession?.session_id !== session.id ||
      lastSession?.date !== workoutDate
    ) {
      continue;
    }
    const canonicalExerciseId =
      observation?.exercise?.key ??
      resolveTrainingExerciseIdentity(observation?.exercise?.name)
        .canonicalExerciseId;
    const currentExercises = exercises.get(performanceContextKey({
      canonicalExerciseId,
      executionVariant: lastSession?.execution_variant,
      relationshipContext: lastSession?.relationship_context,
    })) ?? [];
    if (currentExercises.length !== 1) continue;
    const currentExercise = currentExercises[0];

    for (const descriptor of observation?.explanation_data?.pr_detection?.prs ?? []) {
      const event = createEventFromDescriptor({
        canonicalExerciseId,
        canonicalExerciseName:
          currentExercise.identity.canonicalExerciseName ??
          currentExercise.exercise.name,
        canonicalTrainingSession,
        descriptor,
        lastSession,
        sourceAnalysisId: trainingAnalysis.id,
        sourceCanonicalTrainingId,
        sourceEvidencePackageId,
        sourceReviewId,
        sourceSessionId: session.id,
        workoutDate,
        createdAt: now().toISOString(),
        executionVariant: currentExercise.executionVariant,
        exercise: currentExercise.exercise,
        relationshipContext: currentExercise.relationshipContext,
      });
      if (!event) continue;
      const existing = events.get(event.id);
      if (existing && !haveSameTrainingPerformanceEventSemantics(existing, event)) {
        throw new Error("Conflicting Training PR descriptors resolved to one event identity.");
      }
      events.set(event.id, event);
    }
  }

  return [...events.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function performanceContextKey({
  canonicalExerciseId,
  executionVariant,
  relationshipContext,
}) {
  return [
    canonicalExerciseId,
    `variant:${getTrainingExecutionVariantKey(executionVariant)}`,
    `relationship:${getTrainingExerciseRelationshipComparisonKey(relationshipContext)}`,
  ].join("|");
}

function createEventFromDescriptor({
  canonicalExerciseId,
  canonicalExerciseName,
  descriptor,
  exercise,
  lastSession,
  ...source
}) {
  if (
    descriptor?.type === "session_volume" &&
    Number.isFinite(descriptor.value) &&
    Number.isFinite(descriptor.previous_best) &&
    descriptor.value > descriptor.previous_best &&
    descriptor.value === lastSession.total_volume
  ) {
    return createTrainingPerformanceEvent({
      ...source,
      canonicalExerciseId,
      canonicalExerciseName,
      eventType: TRAINING_PERFORMANCE_EVENT_TYPES.SESSION_VOLUME_PR,
      currentValue: descriptor.value,
      previousBaselineValue: descriptor.previous_best,
      sessionVolume: descriptor.value,
      unit: descriptor.unit ?? "lb",
    });
  }
  if (
    descriptor?.type === "reps_at_load" &&
    Number.isFinite(descriptor.value) &&
    Number.isFinite(descriptor.previous_best) &&
    Number.isFinite(descriptor.load) &&
    descriptor.value > descriptor.previous_best &&
    (exercise.sets ?? []).some(
      (set) =>
        Number(set.reps) === descriptor.value &&
        Number(set.weight) === descriptor.load
    )
  ) {
    return createTrainingPerformanceEvent({
      ...source,
      canonicalExerciseId,
      canonicalExerciseName,
      eventType: TRAINING_PERFORMANCE_EVENT_TYPES.REPS_AT_LOAD_PR,
      currentValue: descriptor.value,
      previousBaselineValue: descriptor.previous_best,
      load: descriptor.load,
      loadUnit: descriptor.load_unit ?? "lb",
      reps: descriptor.value,
      unit: "reps",
    });
  }
  return null;
}
