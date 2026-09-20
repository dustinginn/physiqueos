import { describe, expect, it } from "vitest";
import {
  classifyTrainingSetLoad,
  getComparisonLoad,
  resolveExerciseDefaultLoadType,
  TRAINING_SET_LOAD_SEMANTICS as SEMANTICS,
} from "./trainingSetLoadSemantics";

const bodyweightDefault = { defaultLoadType: "bodyweight" };
const semanticsOf = (set, options) => classifyTrainingSetLoad(set, options).semantics;

describe("Training set load semantics", () => {
  it("resolves the default load type from the canonical exercise identity", () => {
    expect(resolveExerciseDefaultLoadType({ canonicalExerciseId: "pull_up" })).toBe("bodyweight");
    expect(resolveExerciseDefaultLoadType({ canonicalExerciseId: "hanging_leg_raise" })).toBe("bodyweight");
    expect(resolveExerciseDefaultLoadType({ canonicalExerciseId: "iso_lateral_high_row" })).toBeNull();
    expect(resolveExerciseDefaultLoadType({ name: "Pull-Ups" })).toBe("bodyweight");
  });

  it("reads Pull-Ups with no load as bodyweight and Pull-Ups with added load as weighted bodyweight", () => {
    expect(classifyTrainingSetLoad({ reps: 8, weight: null, weight_unit: "bodyweight", load_type: "bodyweight" }, bodyweightDefault))
      .toMatchObject({ semantics: SEMANTICS.BODYWEIGHT, load: null });
    expect(classifyTrainingSetLoad({ reps: 7, weight: 25, weight_unit: "lb", load_type: "external_load", set_type: "weighted_reps" }, bodyweightDefault))
      .toEqual({ semantics: SEMANTICS.WEIGHTED_BODYWEIGHT, load: 25, basis: "bodyweight_default_added_load" });
  });

  it("reads a Hanging Leg Raise null load and a numeric 0 lb external load as the same bodyweight performance", () => {
    const nullLoad = { reps: 18, weight: null, weight_unit: "bodyweight", load_type: "bodyweight" };
    const zeroExternal = { reps: 20, weight: 0, weight_unit: "lb", load_type: "external_load", set_type: "weighted_reps" };
    const zeroBodyweightUnit = { reps: 18, weight: 0, weight_unit: "bodyweight", load_type: "bodyweight" };
    expect(semanticsOf(nullLoad, bodyweightDefault)).toBe(SEMANTICS.BODYWEIGHT);
    expect(semanticsOf(zeroExternal, bodyweightDefault)).toBe(SEMANTICS.BODYWEIGHT);
    expect(semanticsOf(zeroBodyweightUnit, bodyweightDefault)).toBe(SEMANTICS.BODYWEIGHT);
    expect([nullLoad, zeroExternal, zeroBodyweightUnit].map((set) => getComparisonLoad(set, bodyweightDefault))).toEqual([0, 0, 0]);
  });

  it("never turns a legitimate machine or free-weight zero into bodyweight", () => {
    const machineZero = { reps: 12, weight: 0, weight_unit: "lb", load_type: "external_load" };
    expect(classifyTrainingSetLoad(machineZero, { defaultLoadType: null })).toEqual({
      semantics: SEMANTICS.EXTERNAL_LOAD, load: 0, basis: "external_load",
    });
    expect(getComparisonLoad(machineZero, { defaultLoadType: null })).toBe(0);
    expect(classifyTrainingSetLoad({ reps: 10, weight: 180, weight_unit: "lb", load_type: "external_load" }, { defaultLoadType: null }))
      .toMatchObject({ semantics: SEMANTICS.EXTERNAL_LOAD, load: 180 });
  });

  it("keeps a missing load, an unsupported load and a self-contradicting set distinguishable instead of guessing", () => {
    expect(classifyTrainingSetLoad({ reps: 10 }, { defaultLoadType: null })).toMatchObject({ semantics: SEMANTICS.UNKNOWN, basis: "missing_load" });
    expect(classifyTrainingSetLoad({ reps: 10, weight: -5 }, bodyweightDefault)).toMatchObject({ semantics: SEMANTICS.UNKNOWN, basis: "unsupported_load" });
    expect(classifyTrainingSetLoad({ reps: 10, weight: "heavy" }, bodyweightDefault)).toMatchObject({ semantics: SEMANTICS.UNKNOWN });
    expect(classifyTrainingSetLoad({ reps: 10, weight: 25, weight_unit: "bodyweight", load_type: "bodyweight" }, bodyweightDefault))
      .toMatchObject({ semantics: SEMANTICS.UNKNOWN, basis: "bodyweight_marker_with_load" });
    expect(getComparisonLoad({ reps: 10 }, { defaultLoadType: null })).toBeNull();
  });

  it("honours an explicit bodyweight marker on an exercise that is not bodyweight by default", () => {
    expect(semanticsOf({ reps: 30, weight: null, weight_unit: "bodyweight", load_type: "bodyweight" }, { defaultLoadType: null })).toBe(SEMANTICS.BODYWEIGHT);
  });

  it("classifies every historical encoding found in the Founder's Training history consistently", () => {
    const encodings = [
      { weight: null, weight_unit: "bodyweight", load_type: "bodyweight", set_type: "bodyweight_reps" },
      { weight: null, weight_unit: "bodyweight" },
      { weight: 0, weight_unit: "bodyweight", load_type: "bodyweight", set_type: "bodyweight_reps" },
      { weight: null, load_type: "bodyweight", set_type: "bodyweight_reps" },
      { weight: 0, weight_unit: "lb", load_type: "external_load", set_type: "weighted_reps" },
      { weight: null },
    ];
    expect(encodings.map((set) => semanticsOf({ reps: 12, ...set }, bodyweightDefault)))
      .toEqual(Array(encodings.length).fill(SEMANTICS.BODYWEIGHT));
    // The same numeric-zero encoding on a machine stays an external load.
    expect(semanticsOf({ reps: 12, weight: 0, weight_unit: "lb", load_type: "external_load" }, { defaultLoadType: null })).toBe(SEMANTICS.EXTERNAL_LOAD);
  });
});
