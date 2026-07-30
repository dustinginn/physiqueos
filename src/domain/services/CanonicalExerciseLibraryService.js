import {
  listCanonicalTrainingExerciseIdentities,
  normalizeExercisePhrase,
} from "../models/trainingExerciseIdentity";

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
  const primaryMuscleGroup = required(input.primaryMuscleGroup, "Primary muscle group");
  const movementPattern = required(input.movementPattern, "Movement pattern");
  const equipment = required(input.equipment, "Equipment type");
  const laterality = required(input.laterality, "Laterality");
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
    body_region: input.bodyRegion ?? inferBodyRegion(primaryMuscleGroup),
    primary_muscle_groups: [primaryMuscleGroup],
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

export function resolveProvisionalExerciseInPackage(
  evidencePackage,
  provisionalExerciseId,
  resolution
) {
  let matches = 0;
  const evidence_objects = (evidencePackage.evidence_objects ?? []).map((object) => {
    if (object.evidence_type !== "training") return object;
    return {
      ...object,
      exercises: (object.exercises ?? []).map((exercise) => {
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
          id: canonical.id,
          name: canonical.name,
          canonicalExerciseId: canonical.id,
          equipment: canonical.equipment,
          body_region: canonical.body_region,
          primary_muscle_groups: canonical.primary_muscle_groups,
          movement_pattern: canonical.movement_pattern,
          laterality: canonical.laterality,
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
      }),
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
        byId.set(provisional.confirmedDefinition.id, provisional.confirmedDefinition);
      }
    }
  }
  return [...byId.values()];
}

export function assertNoUnresolvedProvisionalExercises(evidencePackage) {
  const unresolved = listUnresolvedProvisionalExercises(evidencePackage);
  if (unresolved.length) {
    throw exerciseError(
      "UNRESOLVED_PROVISIONAL_EXERCISE",
      `${unresolved.length} new exercise${unresolved.length === 1 ? "" : "s"} need${unresolved.length === 1 ? "s" : ""} details before this workout can be saved.`
    );
  }
}

function canonicalExerciseId(name) {
  return normalizeExercisePhrase(name).replace(/\s+/g, "_");
}
function required(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw exerciseError("CANONICAL_EXERCISE_FIELD_REQUIRED", `${label} is required.`);
  return normalized;
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
