import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AUGUST_10_FALSE_TRAINING_CANONICAL_ID,
  classifyAugust10FalseTrainingRetraction,
  createAugust10FalseTrainingRetractionService,
} from "./August10FalseTrainingRetractionService.js";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService.js";

const temporaryDirectories = [];
afterEach(() => temporaryDirectories.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true })));

describe("August 10 false TrainingSession retraction", () => {
  it("proves the exact target and preserves the legitimate quad and walking records", () => {
    const classification = classifyAugust10FalseTrainingRetraction(fixture());
    expect(classification.state).toBe("eligible");
    expect(classification.target).toMatchObject({
      canonicalId: AUGUST_10_FALSE_TRAINING_CANONICAL_ID,
      exercises: ["Spider Curls", "Cable Rope Pushdowns", "Bicep Curl Machine"],
      setCount: 11,
      volume: 5580,
    });
    expect(classification.relationship).toMatchObject({ type: "superset" });
    expect(classification.retainedSessions.map((session) => session.payloadId))
      .toEqual(["training_20260810_0721_traditional_strength_training", "walk-one", "walk-two"]);
  });

  it("atomically makes the record inactive while preserving provenance and unrelated state", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-aug10-retraction-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "runtime-store.json");
    const liveStore = fixture();
    fs.writeFileSync(filePath, `${JSON.stringify(liveStore)}\n`);
    const service = createAugust10FalseTrainingRetractionService({
      runtimeStorePath: filePath,
      liveStore,
      now: () => new Date("2026-08-12T15:00:00Z"),
    });
    const prepared = service.prepare();
    const result = await service.execute({
      acceptProductionMutation: true,
      stopOnConflict: true,
      expectedFileHash: prepared.baseline.fileHash,
      expectedRevision: prepared.baseline.revision,
      expectedLastCommitId: prepared.baseline.lastCommitId,
      preparationFingerprint: prepared.fingerprint,
      retractedAt: prepared.plan.retractedAt,
    });
    const after = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const target = after.canonicalEvidenceObjects.find((record) => record.canonicalId === AUGUST_10_FALSE_TRAINING_CANONICAL_ID);

    expect(result).toMatchObject({ outcome: "retracted", committed: true, revision: 117 });
    expect(target.quality).toMatchObject({ status: "superseded", disposition: "retracted_false_proving_evidence" });
    expect(target.provenance.evidence_review_ids).toEqual(["evidence_review_20260810185111699"]);
    expect(after.canonicalEvidenceObjects.find((record) => record.payload.id === "training_20260810_0721_traditional_strength_training").quality.status)
      .toBe("active");
    expect(after.confidenceMarker).toBe("unchanged");
    const report = createTrainingPerformanceIntelligenceReport({ canonicalObjects: after.canonicalEvidenceObjects, now: "2026-08-12T15:00:00Z" });
    expect(report.exerciseObservations.map((observation) => observation.exercise.name))
      .not.toEqual(expect.arrayContaining(["Spider Curls", "Cable Rope Pushdowns", "Bicep Curl Machine"]));
  });
});

function fixture() {
  const sets = (count, reps, weight) => Array.from({ length: count }, (_, index) => ({
    set_number: index + 1, reps, weight, weight_unit: "lb", volume: reps * weight,
  }));
  const canonicalEvidenceObjects = [
    {
      canonicalId: AUGUST_10_FALSE_TRAINING_CANONICAL_ID,
      evidence_type: "training",
      firstObservedAt: "2026-08-10",
      lastObservedAt: "2026-08-10",
      quality: { status: "active" },
      provenance: {
        evidence_package_ids: ["evidence_submission_20260810185111239_typed"],
        evidence_review_ids: ["evidence_review_20260810185111699"],
      },
      payload: {
        id: "evidence_submission_20260810185111239_training_session",
        evidence_type: "training",
        observed_at: "2026-08-10",
        metadata: { activity_type: "Traditional Strength Training" },
        exercises: [
          { id: "exercise_occurrence_61bbe8e6", name: "Spider Curls", executionVariant: { label: "Static Hold" }, sets: sets(4, 12, 35) },
          { id: "exercise_occurrence_de4a3149", name: "Cable Rope Pushdowns", sets: sets(4, 15, 50) },
          { id: "exercise_occurrence_1501fc1d", name: "Bicep Curl Machine", sets: sets(3, 10, 30) },
        ],
        exerciseRelationshipGroups: [{ id: "exercise_relationship_56b631eb", relationshipType: "superset", memberExerciseIds: ["exercise_occurrence_61bbe8e6", "exercise_occurrence_de4a3149"] }],
      },
    },
    training("training|authoritative|IMG_1847.png", "training_20260810_0721_traditional_strength_training",
      ["Seated Hip Abductions", "Hack Squats", "Leg Press (Sumo Stance)", "Single-Leg Leg Press"]),
    training("training|authoritative|IMG_1848.png", "walk-one", []),
    training("training|authoritative|IMG_1846.png", "walk-two", []),
  ];
  return { version: "founder-seed-v2", revision: 116, lastCommitId: "before", updatedAt: "2026-08-12T13:07:01.163Z",
    canonicalEvidenceObjects, confidenceMarker: "unchanged" };
}

function training(canonicalId, id, exerciseNames) {
  return { canonicalId, evidence_type: "training", quality: { status: "active" },
    payload: { id, evidence_type: "training", observed_at: "2026-08-10",
      metadata: { activity_type: exerciseNames.length ? "Traditional Strength Training" : "Outdoor Walk" },
      exercises: exerciseNames.map((name) => ({ name, sets: [] })) }, provenance: {} };
}
