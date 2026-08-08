import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";
import {
  FOUNDER_ALPHA_TRAINING_EXERCISES,
  normalizeExercisePhrase,
  registerRuntimeTrainingExercises,
} from "../models/trainingExerciseIdentity";

export const CANONICAL_EXERCISE_TERMINOLOGY_ALIGNMENT_VERSION =
  "canonical_exercise_terminology_alignment_v1";

export const CANONICAL_EXERCISE_TERMINOLOGY_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "sumo_squat_machine",
    name: "Sumo Squat Machine",
    aliases: Object.freeze([]),
    equipment: "machine",
    body_region: "Lower Body",
    primary_muscle_groups: Object.freeze(["Glutes", "Quads"]),
    secondary_muscle_groups: Object.freeze([]),
    movement_pattern: "Squat",
    laterality: null,
    modifiers: Object.freeze(["stance_width"]),
    source: "controlled_canonical_terminology_alignment",
  }),
  Object.freeze({
    id: "leg_press_high_narrow",
    name: "Leg Press High And Narrow Feet",
    aliases: Object.freeze(["Leg Press, High And Narrow Feet"]),
    equipment: "leg_press_machine",
    body_region: "Lower Body",
    primary_muscle_groups: Object.freeze(["Hamstrings", "Glutes", "Quads"]),
    secondary_muscle_groups: Object.freeze([]),
    movement_pattern: "Squat / Press",
    laterality: null,
    modifiers: Object.freeze(["foot_position", "stance_width", "stance_height"]),
    source: "controlled_canonical_terminology_alignment",
  }),
]);

const MUTABLE_TOP_LEVEL_KEYS = new Set([
  "canonicalExerciseLibrary",
  "lastCommitId",
  "migrationMarkers",
  "revision",
  "updatedAt",
]);

export function prepareCanonicalExerciseTerminologyAlignment(
  runtimeStore = {},
  {
    definitions = CANONICAL_EXERCISE_TERMINOLOGY_DEFINITIONS,
    staticCanonicalExercises = FOUNDER_ALPHA_TRAINING_EXERCISES,
  } = {}
) {
  const library = runtimeStore.canonicalExerciseLibrary ?? [];
  const markers = (runtimeStore.migrationMarkers ?? []).filter(
    (marker) =>
      marker.id === CANONICAL_EXERCISE_TERMINOLOGY_ALIGNMENT_VERSION
  );
  if (markers.length > 1) {
    throw alignmentError(
      "CANONICAL_TERMINOLOGY_MARKER_DUPLICATE",
      "The canonical terminology alignment marker is duplicated."
    );
  }

  const sources = dedupeCanonicalSources([
    ...staticCanonicalExercises,
    ...library,
  ]);
  const resolutions = definitions.map((definition) =>
    resolveControlledDefinition(definition, sources)
  );
  const marker = markers[0] ?? null;

  if (marker) {
    if (resolutions.some((resolution) => resolution.action === "create")) {
      throw alignmentError(
        "CANONICAL_TERMINOLOGY_MARKER_CONFLICT",
        "The canonical terminology marker exists without every required canonical exercise."
      );
    }
    validateMarker(marker, resolutions);
  }

  return {
    outcome: marker ? "already_applied" : "ready",
    marker,
    definitionsToCreate: resolutions
      .filter((resolution) => resolution.action === "create")
      .map((resolution) => structuredClone(resolution.definition)),
    resolutions: resolutions.map(({ definition: _definition, ...resolution }) =>
      structuredClone(resolution)
    ),
  };
}

export function createCanonicalExerciseTerminologyAlignmentService({
  runtimeStorePath,
  liveStore,
  now = () => new Date(),
  createUnitOfWork = createFounderStoreUnitOfWork,
  staticCanonicalExercises = FOUNDER_ALPHA_TRAINING_EXERCISES,
} = {}) {
  if (!runtimeStorePath || !liveStore) {
    throw new Error(
      "Canonical terminology alignment requires a bound Founder store."
    );
  }

  return {
    prepare() {
      return prepareCanonicalExerciseTerminologyAlignment(liveStore, {
        staticCanonicalExercises,
      });
    },

    async apply() {
      const initial = this.prepare();
      if (initial.outcome === "already_applied") {
        registerRuntimeTrainingExercises(
          liveStore.canonicalExerciseLibrary ?? []
        );
        return {
          committed: false,
          idempotent: true,
          outcome: "already_applied",
          marker: structuredClone(initial.marker),
          resolutions: initial.resolutions,
        };
      }

      const baseline = JSON.stringify(liveStore);
      const protectedBaseline = protectedFounderSnapshot(liveStore);
      const appliedAt = now().toISOString();
      let stagedPlan;
      let stagedMarker;
      const transaction = createUnitOfWork({
        filePath: runtimeStorePath,
        liveStore,
        stageFrom: liveStore,
        now,
        validatePersistedBaseline(candidate) {
          return JSON.stringify(candidate) === baseline;
        },
      }).begin();

      await transaction.mutate((candidate) => {
        stagedPlan = prepareCanonicalExerciseTerminologyAlignment(candidate, {
          staticCanonicalExercises,
        });
        if (stagedPlan.outcome !== "ready") {
          throw alignmentError(
            "CANONICAL_TERMINOLOGY_CONCURRENT_APPLICATION",
            "The canonical terminology alignment was applied concurrently."
          );
        }

        candidate.canonicalExerciseLibrary ??= [];
        for (const definition of stagedPlan.definitionsToCreate) {
          candidate.canonicalExerciseLibrary.push({
            ...definition,
            created_at: appliedAt,
            created_by: "system:canonical-terminology-alignment-v1",
          });
        }

        stagedMarker = createMarker(stagedPlan.resolutions, appliedAt);
        candidate.migrationMarkers ??= [];
        candidate.migrationMarkers.push(stagedMarker);
      });

      const committed = await transaction.commit({
        validateFinalized(candidate) {
          const finalized = prepareCanonicalExerciseTerminologyAlignment(
            candidate,
            { staticCanonicalExercises }
          );
          return (
            finalized.outcome === "already_applied" &&
            JSON.stringify(protectedFounderSnapshot(candidate)) ===
              JSON.stringify(protectedBaseline) &&
            finalized.resolutions.every((resolution) =>
              hasExactlyOneCanonicalIdentity(
                resolution.canonicalExerciseId,
                [
                  ...staticCanonicalExercises,
                  ...(candidate.canonicalExerciseLibrary ?? []),
                ]
              )
            )
          );
        },
      });

      registerRuntimeTrainingExercises(liveStore.canonicalExerciseLibrary ?? []);
      return {
        committed: true,
        commitId: committed.commitId,
        idempotent: false,
        marker: structuredClone(stagedMarker),
        outcome: "created",
        resolutions: stagedPlan.resolutions,
        revision: committed.revision,
      };
    },
  };
}

function resolveControlledDefinition(definition, sources) {
  const idMatches = sources.filter((candidate) => candidate.id === definition.id);
  if (
    idMatches.some(
      (candidate) =>
        normalizeExercisePhrase(candidate.name) !==
        normalizeExercisePhrase(definition.name)
    )
  ) {
    throw alignmentError(
      "CANONICAL_TERMINOLOGY_ID_CONFLICT",
      `Canonical ID "${definition.id}" already belongs to another exercise.`
    );
  }

  const equivalent = sources.filter((candidate) =>
    definitionsShareExactTerm(definition, candidate)
  );
  const uniqueEquivalentIds = [...new Set(equivalent.map((item) => item.id))];
  if (uniqueEquivalentIds.length > 1) {
    throw alignmentError(
      "CANONICAL_TERMINOLOGY_AMBIGUOUS_DUPLICATE",
      `"${definition.name}" matches more than one canonical exercise.`
    );
  }

  const existing = equivalent[0] ?? idMatches[0] ?? null;
  return {
    action: existing ? "reuse" : "create",
    canonicalExerciseId: existing?.id ?? definition.id,
    canonicalExerciseName: existing?.name ?? definition.name,
    definition,
    targetName: definition.name,
  };
}

function definitionsShareExactTerm(left, right) {
  const leftTerms = new Set(
    [left.name, ...(left.aliases ?? [])].map(normalizeExercisePhrase)
  );
  return [right.name, ...(right.aliases ?? [])]
    .map(normalizeExercisePhrase)
    .some((term) => leftTerms.has(term));
}

function dedupeCanonicalSources(sources) {
  const byId = new Map();
  for (const source of sources) {
    if (!source?.id || !source?.name) continue;
    const existing = byId.get(source.id);
    if (
      existing &&
      normalizeExercisePhrase(existing.name) !==
        normalizeExercisePhrase(source.name)
    ) {
      throw alignmentError(
        "CANONICAL_TERMINOLOGY_ID_CONFLICT",
        `Canonical ID "${source.id}" has conflicting display names.`
      );
    }
    if (!existing) byId.set(source.id, source);
  }
  return [...byId.values()];
}

function hasExactlyOneCanonicalIdentity(id, sources) {
  return dedupeCanonicalSources(sources).filter((candidate) => candidate.id === id)
    .length === 1;
}

function createMarker(resolutions, appliedAt) {
  return {
    id: CANONICAL_EXERCISE_TERMINOLOGY_ALIGNMENT_VERSION,
    schemaVersion: CANONICAL_EXERCISE_TERMINOLOGY_ALIGNMENT_VERSION,
    appliedAt,
    exerciseIdentities: resolutions.map((resolution) => ({
      canonicalExerciseId: resolution.canonicalExerciseId,
      canonicalExerciseName: resolution.canonicalExerciseName,
      targetName: resolution.targetName,
    })),
  };
}

function validateMarker(marker, resolutions) {
  const expected = createMarker(resolutions, marker.appliedAt);
  if (
    marker.schemaVersion !==
      CANONICAL_EXERCISE_TERMINOLOGY_ALIGNMENT_VERSION ||
    JSON.stringify(marker.exerciseIdentities) !==
      JSON.stringify(expected.exerciseIdentities)
  ) {
    throw alignmentError(
      "CANONICAL_TERMINOLOGY_MARKER_CONFLICT",
      "The canonical terminology alignment marker does not match the canonical library."
    );
  }
}

function protectedFounderSnapshot(store) {
  return Object.fromEntries(
    Object.entries(store).filter(([key]) => !MUTABLE_TOP_LEVEL_KEYS.has(key))
  );
}

function alignmentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
