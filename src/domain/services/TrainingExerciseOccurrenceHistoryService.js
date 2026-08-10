import {
  getCanonicalTrainingExerciseSlug,
} from "../models/trainingExerciseIdentity";
import {
  getTrainingExecutionVariantKey,
  normalizeTrainingExecutionVariant,
  ORDINARY_EXECUTION_VARIANT_KEY,
} from "../models/trainingExecutionVariant";
import {
  deriveTrainingExerciseRelationshipContext,
  getTrainingExerciseRelationshipComparisonKey,
} from "../models/trainingExerciseRelationship";

export function resolvePreviousExerciseOccurrence({
  before = null,
  canonicalExerciseId,
  relationshipContext = null,
  sessions = [],
  variantKey = null,
} = {}) {
  const requestedVariantKey = normalizeTrainingExecutionVariant(variantKey)?.key ??
    ORDINARY_EXECUTION_VARIANT_KEY;
  const occurrences = listExerciseOccurrences({
    before,
    canonicalExerciseId,
    sessions,
  });
  const requestedRelationshipKey = getTrainingExerciseRelationshipComparisonKey(
    relationshipContext
  );
  const exactVariantOccurrence = occurrences.find(
    (occurrence) =>
      getTrainingExecutionVariantKey(occurrence.exercise) === requestedVariantKey &&
      getTrainingExerciseRelationshipComparisonKey(occurrence.relationshipContext) ===
        requestedRelationshipKey
  ) ?? null;
  const canonicalFallbackOccurrence = occurrences.find(
    (occurrence) =>
      getTrainingExecutionVariantKey(occurrence.exercise) !== requestedVariantKey ||
      getTrainingExerciseRelationshipComparisonKey(occurrence.relationshipContext) !==
        requestedRelationshipKey
  ) ?? null;

  return {
    exactVariantOccurrence,
    canonicalFallbackOccurrence,
    comparisonContext: {
      relationshipKey: requestedRelationshipKey,
      variantKey: requestedVariantKey,
    },
    matchKind: exactVariantOccurrence
      ? "exact_variant"
      : occurrences.length
        ? "canonical_only"
        : "none",
  };
}

export function listPreviouslyUsedExecutionVariants({
  canonicalExerciseId,
  sessions = [],
} = {}) {
  const variants = new Map();
  listExerciseOccurrences({ canonicalExerciseId, sessions }).forEach(({ exercise }) => {
    const variant = normalizeTrainingExecutionVariant(exercise.executionVariant);
    if (variant && !variants.has(variant.key)) variants.set(variant.key, variant);
  });
  return [...variants.values()];
}

function listExerciseOccurrences({ before, canonicalExerciseId, sessions }) {
  const parsedBeforeTimestamp = before ? Date.parse(before) : Number.POSITIVE_INFINITY;
  const beforeTimestamp = Number.isFinite(parsedBeforeTimestamp)
    ? parsedBeforeTimestamp
    : Number.POSITIVE_INFINITY;
  return sessions
    .map((candidate) => candidate?.payload ?? candidate)
    .flatMap((session) => (session?.exercises ?? []).map((exercise) => ({
      exercise,
      relationshipContext: deriveTrainingExerciseRelationshipContext({
        exercise,
        session,
      }),
      session,
    })))
    .filter(({ exercise }) =>
      (exercise.canonicalExerciseId ?? getCanonicalTrainingExerciseSlug(exercise.name)) ===
      canonicalExerciseId
    )
    .filter(({ session }) => {
      const timestamp = Date.parse(session.observed_at ?? session.date ?? "");
      return Number.isFinite(timestamp) && timestamp < beforeTimestamp;
    })
    .sort((left, right) =>
      Date.parse(right.session.observed_at ?? right.session.date) -
      Date.parse(left.session.observed_at ?? left.session.date)
    );
}
