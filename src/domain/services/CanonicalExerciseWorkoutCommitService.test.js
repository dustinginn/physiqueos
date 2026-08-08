import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";
import {
  registerRuntimeTrainingExercises,
  resolveTrainingExerciseIdentity,
} from "../models/trainingExerciseIdentity";
import { createCanonicalExerciseWorkoutCommitService } from "./CanonicalExerciseWorkoutCommitService";

const directories = [];
afterEach(() => {
  registerRuntimeTrainingExercises([]);
  directories.splice(0).forEach((directory) =>
    fs.rmSync(directory, { recursive: true, force: true })
  );
});

describe("atomic canonical exercise and workout commit", () => {
  it("creates one exercise and its workout in one transaction, then recognizes aliases", async () => {
    const { filePath, liveStore } = isolatedStore();
    const result = await createCanonicalExerciseWorkoutCommitService({
      runtimeStorePath: filePath,
      liveStore,
      now: () => new Date("2026-07-29T20:00:00.000Z"),
      createUnitOfWork: (options) => createFounderStoreUnitOfWork({
        ...options,
        createCommitId: () => "commit_1",
        createTransactionId: () => "transaction_1",
      }),
    }).commit(packageFixture(), "founder");
    expect(result.committed).toBe(true);
    expect(liveStore.canonicalExerciseLibrary).toHaveLength(1);
    expect(liveStore.canonicalEvidenceObjects).toHaveLength(1);
    expect(liveStore.canonicalEvidenceObjects[0].payload.exercises[0])
      .toMatchObject({ canonicalExerciseId: "bicep_curl_machine" });
    expect(resolveTrainingExerciseIdentity("Machine Bicep Curl"))
      .toMatchObject({
        resolutionStatus: "resolved_high_confidence",
        exercise: { id: "bicep_curl_machine" },
      });
  });

  it("leaves neither record when the atomic commit fails", async () => {
    const { filePath, liveStore } = isolatedStore();
    const before = structuredClone(liveStore);
    const realFactory = (options) => {
      const transaction = createFounderStoreUnitOfWork(options).begin();
      return {
        begin: () => ({
          ...transaction,
          commit: vi.fn(async () => { throw new Error("simulated atomic failure"); }),
        }),
      };
    };
    await expect(createCanonicalExerciseWorkoutCommitService({
      runtimeStorePath: filePath,
      liveStore,
      createUnitOfWork: realFactory,
    }).commit(packageFixture(), "founder")).rejects.toThrow();
    expect(liveStore).toEqual(before);
    expect(JSON.parse(fs.readFileSync(filePath, "utf8"))).toEqual(before);
  });

  it("writes neither exercise nor workout when the canonical muscle-group ID is invalid", async () => {
    const { filePath, liveStore } = isolatedStore();
    const before = structuredClone(liveStore);
    const evidencePackage = packageFixture();
    evidencePackage.evidence_objects[0].exercises[0]
      .provisionalExercise.confirmedDefinition.primary_muscle_group_id =
        "removed_group";
    await expect(createCanonicalExerciseWorkoutCommitService({
      runtimeStorePath: filePath,
      liveStore,
    }).commit(evidencePackage, "founder")).rejects.toMatchObject({
      code: "CANONICAL_EXERCISE_MUSCLE_GROUP_INVALID",
    });
    expect(liveStore).toEqual(before);
    expect(JSON.parse(fs.readFileSync(filePath, "utf8"))).toEqual(before);
  });
});

function isolatedStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "canonical-exercise-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const liveStore = {
    revision: 0,
    lastCommitId: null,
    canonicalExerciseLibrary: [],
    canonicalEvidenceObjects: [],
  };
  fs.writeFileSync(filePath, JSON.stringify(liveStore));
  return { filePath, liveStore };
}

function packageFixture() {
  const canonical = {
    id: "bicep_curl_machine",
    name: "Bicep Curl Machine",
    aliases: ["Machine Bicep Curl", "Biceps Curl Machine"],
    equipment: "Machine",
    body_region: "upper_body",
    primary_muscle_group_id: "biceps",
    primary_muscle_groups: ["Biceps"],
    movement_pattern: "Elbow Flexion",
    laterality: "Bilateral",
    source: "evidence_review_user_confirmed",
  };
  return {
    package_id: "package_fixture",
    evidence_objects: [{
      id: "training_fixture",
      evidence_type: "training",
      observed_at: "2026-07-29T12:00:00.000Z",
      source: { source_artifact_refs: ["typed_fixture"] },
      provenance: { source_artifact_refs: ["typed_fixture"] },
      metadata: { activity_type: "Traditional Strength Training" },
      exercises: [{
        id: canonical.id,
        name: canonical.name,
        canonicalExerciseId: canonical.id,
        resolutionStatus: "resolved_new_canonical",
        sets: Array.from({ length: 4 }, (_, index) => ({
          set_number: index + 1,
          reps: 18,
          weight: 75,
          weight_unit: "lb",
          provenance_ref: "typed_fixture",
        })),
        provisionalExercise: {
          provisionalExerciseId: "provisional_1",
          resolutionStatus: "resolved_new_canonical",
          confirmedDefinition: canonical,
        },
      }],
    }],
  };
}
