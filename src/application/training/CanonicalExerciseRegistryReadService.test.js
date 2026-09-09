import { afterEach, describe, expect, it } from "vitest";
import {
  listCanonicalTrainingExerciseIdentities,
  registerRuntimeTrainingExercises,
  resolveTrainingExerciseIdentity,
} from "../../domain/models/trainingExerciseIdentity.js";
import {
  hydrateCanonicalTrainingExerciseRegistry,
  readCurrentCanonicalTrainingExerciseRegistry,
} from "./CanonicalExerciseRegistryReadService.js";

const bicepCurlMachine = Object.freeze({
  id: "bicep_curl_machine",
  name: "Bicep Curl Machine",
  aliases: ["Machine Bicep Curl", "Biceps Curl Machine"],
  equipment: "Machine",
  body_region: "upper_body",
  movement_pattern: "Elbow Flexion",
  primary_muscle_groups: ["Biceps"],
  primary_muscle_group_id: "biceps",
});

describe("canonical Training exercise registry read projection", () => {
  afterEach(() => registerRuntimeTrainingExercises([]));

  it("makes a Founder-created identity and its aliases resolvable on the first hydration", () => {
    registerRuntimeTrainingExercises([]);

    const registry = hydrateCanonicalTrainingExerciseRegistry([bicepCurlMachine]);

    expect(registry).toContainEqual(expect.objectContaining({
      id: "bicep_curl_machine",
      name: "Bicep Curl Machine",
    }));
    expect(resolveTrainingExerciseIdentity("Bicep Curl Machine")).toMatchObject({
      canonicalExerciseId: "bicep_curl_machine",
      resolutionStatus: "resolved_high_confidence",
    });
    expect(resolveTrainingExerciseIdentity("Machine Bicep Curl")).toMatchObject({
      canonicalExerciseId: "bicep_curl_machine",
      resolutionStatus: "resolved_high_confidence",
    });
  });

  it("returns a frozen snapshot without creating a second registry authority", () => {
    const hydrated = hydrateCanonicalTrainingExerciseRegistry([bicepCurlMachine]);
    const current = readCurrentCanonicalTrainingExerciseRegistry();

    expect(Object.isFrozen(hydrated)).toBe(true);
    expect(Object.isFrozen(current)).toBe(true);
    expect(current).toEqual(listCanonicalTrainingExerciseIdentities());
  });

  it("rejects a duplicate runtime identity before publishing it", () => {
    expect(() => hydrateCanonicalTrainingExerciseRegistry([
      bicepCurlMachine,
      { ...bicepCurlMachine, name: "Duplicate Machine Curl" },
    ])).toThrow(/duplicated/i);
  });
});
