import {
  listCanonicalTrainingExerciseIdentities,
  normalizeExercisePhrase,
  resolveTrainingExerciseIdentity,
} from "../models/trainingExerciseIdentity";
import {
  resolveCanonicalTrainingMuscleGroup,
} from "../models/trainingMuscleGroupIdentity";
import { removeExerciseFromTrainingRelationshipGroups } from "../models/trainingExerciseRelationship";

export function listUnresolvedProvisionalExercises(evidencePackage = {}) {
  return (evidencePackage.evidence_objects ?? []).flatMap((object) =>
    object.evidence_type === "training" && object.removed !== true
      ? (object.exercises ?? []).filter(isUnresolvedProvisionalExercise)
      : []
  );
}

export function isUnresolvedProvisionalExercise(exercise = {}) {
  return exercise.removed !== true &&
    exercise.provisionalExercise?.resolutionStatus === "unresolved";
}

export function createCanonicalExerciseDefinition(input = {}) {
  const name = required(input.canonicalName, "Canonical exercise name");
  const primaryMuscleGroup = requireCanonicalMuscleGroup(
    input.primaryMuscleGroupId ?? input.primaryMuscleGroup
  );
  const movementPattern = optional(input.movementPattern);
  const equipment = optional(input.equipment);
  const laterality = optional(input.laterality);
  const aliases = unique(
    String(input.aliases ?? "")
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean)
  ).filter((alias) => normalizeExercisePhrase(alias) !== normalizeExercisePhrase(name));
  return {
    id: canonicalExerciseId(name),
    name,
    aliases,
    equipment,
    body_region: input.bodyRegion ?? inferBodyRegion(primaryMuscleGroup.label),
    primary_muscle_group_id: primaryMuscleGroup.id,
    primary_muscle_groups: [primaryMuscleGroup.label],
    movement_pattern: movementPattern,
    laterality,
    created_at: input.createdAt ?? null,
    source: "evidence_review_user_confirmed",
  };
}

export function findCanonicalExerciseConflict(definition, existing = []) {
  const candidates = [...listCanonicalTrainingExerciseIdentities(), ...existing];
  const incoming = new Set(
    [definition.name, ...(definition.aliases ?? [])].map(normalizeExercisePhrase)
  );
  return candidates.find((candidate) =>
    [candidate.name, ...(candidate.aliases ?? [])]
      .map(normalizeExercisePhrase)
      .some((value) => incoming.has(value))
  ) ?? null;
}

export function searchCanonicalExerciseOptions(candidates = [], query = "") {
  const normalizedQuery = normalizeExercisePhrase(query);
  if (!normalizedQuery) return [...candidates];
  return candidates
    .map((candidate, index) => {
      const name = normalizeExercisePhrase(candidate.name);
      const aliases = (candidate.aliases ?? []).map(normalizeExercisePhrase);
      const rank = name === normalizedQuery
        ? 0
        : aliases.includes(normalizedQuery)
          ? 1
          : name.startsWith(normalizedQuery)
            ? 2
            : aliases.some((alias) => alias.startsWith(normalizedQuery))
              ? 3
              : name.includes(normalizedQuery)
                ? 4
                : aliases.some((alias) => alias.includes(normalizedQuery))
                  ? 5
                  : null;
      return rank === null ? null : { candidate, index, rank };
    })
    .filter(Boolean)
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ candidate }) => candidate);
}

export function prepareCanonicalExerciseIdentitiesForConfirmation(
  evidencePackage = {}
) {
  return {
    ...evidencePackage,
    evidence_objects: (evidencePackage.evidence_objects ?? []).map((object) => {
      if (object.evidence_type !== "training") return object;
      return {
        ...object,
        exercises: (object.exercises ?? []).map((exercise) => {
          if (
            exercise.resolutionStatus === "resolved_new_canonical" &&
            exercise.provisionalExercise?.confirmedDefinition?.id ===
              exercise.canonicalExerciseId
          ) {
            return exercise;
          }
          const resolved = resolveTrainingExerciseIdentity(exercise.name);
          if (resolved.resolutionStatus !== "resolved_high_confidence") {
            return { ...exercise, canonicalExerciseId: null };
          }
          return {
            ...exercise,
            canonicalExerciseId: resolved.canonicalExerciseId,
            name: resolved.canonicalExerciseName,
            resolutionStatus:
              exercise.resolutionStatus === "resolved_existing_canonical"
                ? exercise.resolutionStatus
                : "resolved",
            provisionalExercise:
              exercise.provisionalExercise?.resolutionStatus === "unresolved"
                ? null
                : exercise.provisionalExercise,
          };
        }),
      };
    }),
  };
}

export function resolveProvisionalExerciseInPackage(
  evidencePackage,
  provisionalExerciseId,
  resolution
) {
  let matches = 0;
  const evidence_objects = (evidencePackage.evidence_objects ?? []).map((object) => {
    if (object.evidence_type !== "training") return object;
    const exercises = (object.exercises ?? []).map((exercise) => {
      if (exercise.provisionalExercise?.provisionalExerciseId !== provisionalExerciseId) {
        return exercise;
      }
      matches += 1;
      if (resolution.mode === "remove") {
        return {
          ...exercise,
          removed: true,
          resolutionStatus: "removed_by_user",
          provisionalExercise: {
            ...exercise.provisionalExercise,
            resolutionStatus: "removed_by_user",
            disposition: "explicitly_removed_from_workout",
          },
        };
      }
      const canonical = resolution.canonical;
      return {
        ...exercise,
        id: exercise.id ?? canonical.id,
        name: canonical.name,
        canonicalExerciseId: canonical.id,
        equipment: canonical.equipment,
        body_region: canonical.body_region,
        primary_muscle_group_id:
          canonical.primary_muscle_group_id ?? null,
        primary_muscle_groups: canonical.primary_muscle_groups,
        movement_pattern: canonical.movement_pattern,
        laterality: canonical.laterality ?? null,
        resolutionStatus: resolution.mode === "new"
          ? "resolved_new_canonical"
          : "resolved_existing_canonical",
        provisionalExercise: {
          ...exercise.provisionalExercise,
          resolutionStatus: resolution.mode === "new"
            ? "resolved_new_canonical"
            : "resolved_existing_canonical",
          resolutionMode: resolution.mode,
          resolvedCanonicalExerciseId: canonical.id,
          confirmedDefinition: resolution.mode === "new" ? canonical : null,
        },
      };
    });
    const removedExerciseIds = exercises
      .filter((exercise) => exercise.removed && exercise.id)
      .map((exercise) => exercise.id);
    const exerciseRelationshipGroups = removedExerciseIds.reduce(
      (groups, exerciseId) =>
        removeExerciseFromTrainingRelationshipGroups(groups, exerciseId),
      object.exerciseRelationshipGroups ?? []
    );
    return {
      ...object,
      exercises,
      ...(object.exerciseRelationshipGroups
        ? { exerciseRelationshipGroups }
        : {}),
    };
  });
  if (matches !== 1) {
    throw exerciseError(
      "PROVISIONAL_EXERCISE_UNAVAILABLE",
      "The new exercise is no longer available in this review."
    );
  }
  return { ...evidencePackage, evidence_objects };
}

export function canonicalDefinitionsPendingCreation(evidencePackage = {}) {
  const byId = new Map();
  for (const object of evidencePackage.evidence_objects ?? []) {
    if (object.removed || object.evidence_type !== "training") continue;
    for (const exercise of object.exercises ?? []) {
      const provisional = exercise.provisionalExercise;
      if (
        exercise.resolutionStatus === "resolved_new_canonical" &&
        provisional?.confirmedDefinition
      ) {
        assertCanonicalExerciseDefinition(provisional.confirmedDefinition);
        byId.set(provisional.confirmedDefinition.id, provisional.confirmedDefinition);
      }
    }
  }
  return [...byId.values()];
}

export function assertNoUnresolvedProvisionalExercises(evidencePackage) {
  const unresolved = listExercisesWithoutCanonicalIdentity(evidencePackage);
  if (unresolved.length) {
    throw exerciseError(
      "UNRESOLVED_PROVISIONAL_EXERCISE",
      `${unresolved.length} exercise ${unresolved.length === 1 ? "identity needs" : "identities need"} details before this workout can be saved.`
    );
  }
}

export function listExercisesWithoutCanonicalIdentity(
  evidencePackage = {},
  { canonicalExercises = listCanonicalTrainingExerciseIdentities() } = {}
) {
  const canonical = new Map(
    canonicalExercises.map((exercise) => [exercise.id, exercise])
  );
  return (evidencePackage.evidence_objects ?? []).flatMap((object) =>
    object.evidence_type === "training" && object.removed !== true
      ? (object.exercises ?? []).filter((exercise) => {
          if (exercise.removed === true) return false;
          if (isUnresolvedProvisionalExercise(exercise)) return true;
          const canonicalExerciseId = exercise.canonicalExerciseId;
          if (!canonicalExerciseId) return true;
          if (canonical.has(canonicalExerciseId)) return false;
          return !(
            exercise.resolutionStatus === "resolved_new_canonical" &&
            exercise.provisionalExercise?.confirmedDefinition?.id ===
              canonicalExerciseId &&
            isCanonicalExerciseDefinitionValid(
              exercise.provisionalExercise.confirmedDefinition
            )
          );
        })
      : []
  );
}

function canonicalExerciseId(name) {
  return normalizeExercisePhrase(name).replace(/\s+/g, "_");
}
function required(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw exerciseError("CANONICAL_EXERCISE_FIELD_REQUIRED", `${label} is required.`);
  return normalized;
}
function optional(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
export function isCanonicalExerciseDefinitionValid(definition = {}) {
  const muscleGroup = resolveCanonicalTrainingMuscleGroup(
    definition.primary_muscle_group_id
  );
  return Boolean(
    definition.id &&
    String(definition.name ?? "").trim() &&
    muscleGroup &&
    definition.primary_muscle_groups?.length === 1 &&
    definition.primary_muscle_groups[0] === muscleGroup.label
  );
}
export function assertCanonicalExerciseDefinition(definition = {}) {
  if (!isCanonicalExerciseDefinitionValid(definition)) {
    throw exerciseError(
      "CANONICAL_EXERCISE_MUSCLE_GROUP_INVALID",
      "Choose a valid primary muscle group."
    );
  }
  return definition;
}
function requireCanonicalMuscleGroup(value) {
  const muscleGroup = resolveCanonicalTrainingMuscleGroup(value);
  if (!muscleGroup) {
    throw exerciseError(
      "CANONICAL_EXERCISE_MUSCLE_GROUP_INVALID",
      "Choose a valid primary muscle group."
    );
  }
  return muscleGroup;
}
function unique(values) { return [...new Set(values)]; }
function inferBodyRegion(group) {
  return /bicep|tricep|shoulder|chest|back/i.test(group) ? "upper_body" : "full_body";
}
function exerciseError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
