import { resolveTrainingExerciseOccurrenceIdentity } from "./trainingExerciseIdentity";

// One Server-owned interpretation of a canonical set's load. It is a READ-TIME
// classification: it never rewrites stored history, so historical numeric
// `0 lb external_load` bodyweight sets stay exactly as recorded and are simply
// read the same way as null-load bodyweight sets.
//
//   bodyweight-default exercise (Pull-Ups, Hanging Leg Raises, Planks, ...)
//     null load                     -> bodyweight
//     numeric zero load             -> bodyweight   (an input normalization, not
//                                                    a distinct "zero external load")
//     positive external load        -> weighted_bodyweight (load = added weight)
//   any other exercise
//     numeric load (including 0)    -> external_load  (a machine or free-weight
//                                                      zero is never bodyweight)
//     missing load                  -> unknown
//   an explicit bodyweight marker on the set is honoured when it carries no load.
// Anything contradictory or unsupported is `unknown`, never a guess. Assistance
// is not represented in the canonical model.
export const TRAINING_SET_LOAD_SEMANTICS = Object.freeze({
  BODYWEIGHT: "bodyweight",
  WEIGHTED_BODYWEIGHT: "weighted_bodyweight",
  EXTERNAL_LOAD: "external_load",
  UNKNOWN: "unknown",
});

export function resolveExerciseDefaultLoadType(exercise = {}) {
  const identity = resolveTrainingExerciseOccurrenceIdentity(exercise);
  return identity?.exercise?.default_load_type ?? null;
}

export function classifyTrainingSetLoad(set = {}, { defaultLoadType = null } = {}) {
  const rawLoad = set?.weight ?? set?.load;
  const load = rawLoad === null || rawLoad === undefined || rawLoad === "" ? null : Number(rawLoad);
  const explicitBodyweight = set?.load_type === "bodyweight" || set?.loadType === "bodyweight" ||
    set?.weight_unit === "bodyweight" || set?.unit === "bodyweight" ||
    set?.set_type === "bodyweight_reps" || set?.measurement_type === "bodyweight_reps";
  const bodyweightDefault = defaultLoadType === "bodyweight";

  if (load !== null && (!Number.isFinite(load) || load < 0)) return result(TRAINING_SET_LOAD_SEMANTICS.UNKNOWN, null, "unsupported_load");

  if (explicitBodyweight) {
    // A bodyweight marker that also carries a positive load contradicts itself.
    if (load !== null && load > 0) return result(TRAINING_SET_LOAD_SEMANTICS.UNKNOWN, load, "bodyweight_marker_with_load");
    return result(TRAINING_SET_LOAD_SEMANTICS.BODYWEIGHT, null, "explicit_bodyweight");
  }
  if (bodyweightDefault) {
    if (load === null || load === 0) return result(TRAINING_SET_LOAD_SEMANTICS.BODYWEIGHT, null, load === 0 ? "bodyweight_default_zero_load" : "bodyweight_default_no_load");
    return result(TRAINING_SET_LOAD_SEMANTICS.WEIGHTED_BODYWEIGHT, load, "bodyweight_default_added_load");
  }
  if (load === null) return result(TRAINING_SET_LOAD_SEMANTICS.UNKNOWN, null, "missing_load");
  return result(TRAINING_SET_LOAD_SEMANTICS.EXTERNAL_LOAD, load, "external_load");
}

// The load a set is compared at when detecting "reps at load": bodyweight is
// the zero baseline whatever its stored encoding (null, or a numeric 0 lb),
// weighted bodyweight and external loads compare at their own load, and an
// unclassifiable set has no comparable load.
export function getComparisonLoad(set, options) {
  const semantics = classifyTrainingSetLoad(set, options);
  if (semantics.semantics === TRAINING_SET_LOAD_SEMANTICS.BODYWEIGHT) return 0;
  if (semantics.semantics === TRAINING_SET_LOAD_SEMANTICS.UNKNOWN) return null;
  return semantics.load;
}

function result(semantics, load, basis) {
  return Object.freeze({ semantics, load, basis });
}
