import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";
import {
  addProvisionalTrainingExercise,
  createTrainingLoggerProductionDraft,
  listPerformedTrainingLoggerExerciseIds,
  listTrainingLoggerExercises,
  updateTrainingSet,
} from "../../app/preview/training-logger/TrainingLoggerPreviewState";
import { registerRuntimeTrainingExercises } from "../models/trainingExerciseIdentity";
import { reconcileEvidencePackageIntoCanonicalHistory } from "./CanonicalEvidenceService";
import {
  createCanonicalExerciseDefinition,
  resolveProvisionalExerciseInPackage,
} from "./CanonicalExerciseLibraryService";
import { createCanonicalExerciseWorkoutCommitService } from "./CanonicalExerciseWorkoutCommitService";
import { buildTrainingLoggerEvidencePackage } from "./TrainingLoggerAppleHealthService";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { adaptTrainingPerformanceReportToPIObservations } from "./TrainingPIObservationAdapter";

const directories = [];
afterEach(() => {
  registerRuntimeTrainingExercises([]);
  directories.splice(0).forEach((directory) =>
    fs.rmSync(directory, { recursive: true, force: true })
  );
});

describe("Training Logger canonical pipeline continuity", () => {
  it("enters canonical Training history and downstream Training PI without a Logger-specific universe", () => {
    const evidencePackage = buildTrainingLoggerEvidencePackage({
      draft: {
        draftId: "pipeline_draft",
        mode: "retrospective",
        workoutDate: "2026-08-10",
        reconciliation: {
          normalizedEvidence: [],
          selectedStrengthSourceId: null,
          continueWithoutStrength: true,
          additionalEvidenceActions: [],
          finalized: true,
        },
        exercises: [
          {
            id: "occ_spider",
            canonicalExerciseId: "spider_curl",
            name: "Spider Curls",
            bodyRegion: "Arms",
            equipment: "dumbbell",
            executionVariant: { key: "static_hold", label: "Static Hold", rawLabel: "Static Hold" },
            sets: [{ id: "set_1", reps: 12, load: 35, unit: "lb", confirmed: true }],
          },
          {
            id: "occ_pushdown",
            canonicalExerciseId: "cable_pushdown",
            name: "Cable Rope Pushdowns",
            bodyRegion: "Arms",
            equipment: "cable",
            sets: [{ id: "set_2", reps: 12, load: 50, unit: "lb", confirmed: true }],
          },
        ],
        exerciseRelationshipGroups: [{
          id: "superset_1",
          relationshipType: "superset",
          memberExerciseIds: ["occ_spider", "occ_pushdown"],
          provenance_ref: "training_logger_draft_pipeline",
        }],
      },
      userId: "user_1",
    });
    const canonical = reconcileEvidencePackageIntoCanonicalHistory({
      evidencePackage,
      existingCanonicalObjects: [],
      userId: "user_1",
    });
    expect(canonical).toHaveLength(1);
    expect(canonical[0].payload).toMatchObject({
      evidence_type: "training",
      metadata: { logger_origin: "training_logger" },
      exercises: [
        expect.objectContaining({ canonicalExerciseId: "spider_curl" }),
        expect.objectContaining({ canonicalExerciseId: "cable_pushdown" }),
      ],
      exerciseRelationshipGroups: [expect.objectContaining({ relationshipType: "superset" })],
    });
    expect(canonical[0].payload.exercises[0].executionVariant.label).toBe("Static Hold");

    const report = createTrainingPerformanceIntelligenceReport({
      canonicalObjects: canonical,
      now: new Date("2026-08-11T12:00:00Z"),
    });
    expect(report.exerciseObservations.map((item) => item.exercise.key)).toEqual(
      expect.arrayContaining(["spider_curl", "cable_pushdown"])
    );
    const piObservations = adaptTrainingPerformanceReportToPIObservations(report);
    expect(piObservations.every((item) => item.domain === "training")).toBe(true);
    expect(piObservations.some((item) => item.provenance.sourceEvidenceIds.length > 0)).toBe(true);
  });

  it("creates a Logger-proposed exercise only at final review commit, then exposes its real history", async () => {
    let draft = createTrainingLoggerProductionDraft({
      mode: "retrospective",
      workoutDate: "2026-08-10",
    });
    draft = addProvisionalTrainingExercise(draft, {
      category: "Biceps",
      name: "Founder Cable Arc Curl",
    });
    const occurrence = draft.exercises[0];
    occurrence.sets.forEach((set, index) => {
      draft = updateTrainingSet(draft, occurrence.id, set.id, {
        load: 20 + index * 2.5,
        reps: 14 - index,
      });
    });
    draft = {
      ...draft,
      reconciliation: {
        normalizedEvidence: [],
        selectedStrengthSourceId: null,
        continueWithoutStrength: true,
        additionalEvidenceActions: [],
        finalized: true,
      },
    };
    const proposal = buildTrainingLoggerEvidencePackage({ draft, userId: "founder" });
    expect(proposal.evidence_objects[0].exercises[0]).toMatchObject({
      canonicalExerciseId: null,
      resolutionStatus: "unresolved_provisional",
    });

    const provisionalId = proposal.evidence_objects[0].exercises[0]
      .provisionalExercise.provisionalExerciseId;
    const definition = createCanonicalExerciseDefinition({
      canonicalName: "Founder Cable Arc Curl",
      primaryMuscleGroupId: "biceps",
    });
    const reviewed = resolveProvisionalExerciseInPackage(proposal, provisionalId, {
      canonical: definition,
      mode: "new",
    });
    expect(reviewed.evidence_objects[0].exercises[0]).toMatchObject({
      canonicalExerciseId: definition.id,
      resolutionStatus: "resolved_new_canonical",
    });

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "logger-v12-pipeline-"));
    directories.push(directory);
    const runtimeStorePath = path.join(directory, "runtime-store.json");
    const liveStore = {
      revision: 0,
      lastCommitId: null,
      canonicalExerciseLibrary: [],
      canonicalEvidenceObjects: [],
    };
    fs.writeFileSync(runtimeStorePath, JSON.stringify(liveStore));
    const result = await createCanonicalExerciseWorkoutCommitService({
      runtimeStorePath,
      liveStore,
      now: () => new Date("2026-08-11T12:00:00.000Z"),
      createUnitOfWork: (options) => createFounderStoreUnitOfWork(options),
    }).commit(reviewed, "founder");

    expect(result.committed).toBe(true);
    expect(liveStore.canonicalExerciseLibrary).toEqual([
      expect.objectContaining({ id: definition.id, name: "Founder Cable Arc Curl" }),
    ]);
    expect(liveStore.canonicalEvidenceObjects[0].payload.exercises[0])
      .toMatchObject({ canonicalExerciseId: definition.id });
    const performedIds = listPerformedTrainingLoggerExerciseIds(
      liveStore.canonicalEvidenceObjects
    );
    expect(performedIds).toContain(definition.id);
    expect(listTrainingLoggerExercises({
      categories: ["Biceps"],
      exerciseLibrary: liveStore.canonicalExerciseLibrary,
      performedExerciseIds: performedIds,
      scope: "performed_history",
    })).toEqual([expect.objectContaining({ id: definition.id })]);
  });
});
