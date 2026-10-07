import {
  getCanonicalTrainingExerciseSlug,
  resolveTrainingExerciseOccurrenceIdentity,
} from "../models/trainingExerciseIdentity";
import { normalizeTrainingExecutionVariant } from "../models/trainingExecutionVariant";
import { EMPTY_TRAINING_EXECUTION_VARIANT_RESOLVER } from "../models/trainingExecutionVariantDefinition.js";
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
  // Build 92: `variantKey` may also be a canonical selection carrying
  // `variantId`; matching uses the stable definition identity when one exists.
  variantResolver = EMPTY_TRAINING_EXECUTION_VARIANT_RESOLVER,
} = {}) {
  const requestedVariantKey = variantResolver.identity(variantKey, canonicalExerciseId);
  const occurrences = listExerciseOccurrences({
    before,
    canonicalExerciseId,
    sessions,
  });
  const requestedRelationshipKey = getTrainingExerciseRelationshipComparisonKey(
    relationshipContext
  );
  const occurrenceVariantKey = (occurrence) =>
    variantResolver.identity(occurrence.exercise?.executionVariant, canonicalExerciseId);
  const exactVariantOccurrence = occurrences.find(
    (occurrence) =>
      occurrenceVariantKey(occurrence) === requestedVariantKey &&
      getTrainingExerciseRelationshipComparisonKey(occurrence.relationshipContext) ===
        requestedRelationshipKey
  ) ?? null;
  const canonicalFallbackOccurrence = occurrences.find(
    (occurrence) =>
      occurrenceVariantKey(occurrence) !== requestedVariantKey ||
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

/// Historical, read-only: the distinct freeform variants recorded on one
/// exercise. This is NOT a choice authority: Logger choices come only from
/// canonical `trainingExecutionVariants` definitions
/// (`projectTrainingExecutionVariantChoices`), so misfiled history such as the
/// legacy "Super Set" variant can never become selectable.
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
      (resolveTrainingExerciseOccurrenceIdentity(exercise).canonicalExerciseId ??
        getCanonicalTrainingExerciseSlug(exercise.name)) ===
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
