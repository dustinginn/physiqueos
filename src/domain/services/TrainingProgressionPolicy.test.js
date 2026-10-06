import { describe, expect, it } from "vitest";
import {
  createDefaultTrainingProgressionRule,
  resolveExecutableTrainingProgressionPolicy,
} from "./TrainingProgressionPolicy.js";

describe("TrainingProgressionPolicy", () => {
  it("builds the Founder-locked default as explicit executable strategy data", () => {
    expect(createDefaultTrainingProgressionRule()).toEqual({
      type: "double_progression_confirmed_sessions",
      condition: "reach_top_of_rep_range",
      action: "increase_load",
      successfulSessionsRequired: 2,
      minimumExposureDays: 14,
    });
  });

  it("uses the locked 14-day compatibility default for an existing supported strategy", () => {
    expect(resolveExecutableTrainingProgressionPolicy({
      canonicalExerciseId: "cable_machine_front_raise",
      trainingStrategy: {
        progression: {
          defaultRule: {
            type: "double_progression_confirmed_sessions",
            condition: "reach_top_of_rep_range",
            action: "increase_load",
            successfulSessionsRequired: 2,
          },
        },
      },
    })).toMatchObject({
      executable: true,
      minimumExposureDays: 14,
      minimumExposureSource: "founder_locked_legacy_compatibility_default",
    });
  });

  it("applies a single exact exercise override without leaking it to other identities", () => {
    const trainingStrategy = {
      progression: {
        defaultRule: {
          type: "double_progression_confirmed_sessions",
          condition: "reach_top_of_rep_range",
          action: "increase_load",
          successfulSessionsRequired: 2,
          minimumExposureDays: 14,
        },
        exerciseOverrides: [{
          canonicalExerciseId: "cable_machine_front_raise",
          rule: { successfulSessionsRequired: 3 },
        }],
      },
    };
    expect(resolveExecutableTrainingProgressionPolicy({
      canonicalExerciseId: "cable_machine_front_raise", trainingStrategy,
    })).toMatchObject({
      executable: true,
      source: "active_training_strategy_exercise_override",
      successfulSessionsRequired: 3,
    });
    expect(resolveExecutableTrainingProgressionPolicy({
      canonicalExerciseId: "front_raise", trainingStrategy,
    })).toMatchObject({
      executable: true,
      source: "active_training_strategy_default_rule",
      successfulSessionsRequired: 2,
    });
  });

  it("fails closed for ambiguous overrides and invalid policy values", () => {
    const baseRule = createDefaultTrainingProgressionRule();
    expect(resolveExecutableTrainingProgressionPolicy({
      canonicalExerciseId: "cable_machine_front_raise",
      trainingStrategy: {
        progression: {
          defaultRule: baseRule,
          exerciseOverrides: [
            { canonicalExerciseId: "cable_machine_front_raise", rule: {} },
            { exerciseId: "cable_machine_front_raise", rule: {} },
          ],
        },
      },
    })).toMatchObject({ executable: false, reasonCode: "ambiguous_exercise_progression_override" });
    expect(resolveExecutableTrainingProgressionPolicy({
      canonicalExerciseId: "cable_machine_front_raise",
      trainingStrategy: {
        progression: {
          defaultRule: { ...baseRule, minimumExposureDays: -1 },
        },
      },
    })).toMatchObject({ executable: false, reasonCode: "invalid_minimum_exposure_days" });
    expect(resolveExecutableTrainingProgressionPolicy({
      canonicalExerciseId: "cable_machine_front_raise",
      trainingStrategy: {
        progression: {
          defaultRule: { ...baseRule, minimumExposureDays: 13 },
        },
      },
    })).toMatchObject({ executable: false, reasonCode: "minimum_exposure_below_founder_floor" });
    expect(resolveExecutableTrainingProgressionPolicy({
      canonicalExerciseId: "cable_machine_front_raise",
      trainingStrategy: {
        progression: {
          defaultRule: { ...baseRule, successfulSessionsRequired: 1 },
        },
      },
    })).toMatchObject({ executable: false, reasonCode: "successful_sessions_below_founder_floor" });
  });
});
