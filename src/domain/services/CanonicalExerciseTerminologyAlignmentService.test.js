import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";
import { mergeTypedEvidenceIntoTrainingObjects } from "../interpreters/ScreenshotInterpreterService";
import {
  createTrainingSessionEvidenceFromText,
} from "../models/trainingSessionEvidence";
import {
  listCanonicalTrainingExerciseIdentities,
  registerRuntimeTrainingExercises,
  resolveTrainingExerciseIdentity,
} from "../models/trainingExerciseIdentity";
import {
  searchCanonicalExerciseOptions,
} from "./CanonicalExerciseLibraryService";
import {
  CANONICAL_EXERCISE_TERMINOLOGY_ALIGNMENT_VERSION,
  CANONICAL_EXERCISE_TERMINOLOGY_DEFINITIONS,
  createCanonicalExerciseTerminologyAlignmentService,
  prepareCanonicalExerciseTerminologyAlignment,
} from "./CanonicalExerciseTerminologyAlignmentService";
import { getResistanceBreakdown } from "./ProgressReportingService";
import {
  createTrainingPerformanceIntelligenceReport,
} from "./TrainingPerformanceIntelligenceService";
import { produceTrainingPerformanceEvents } from "./TrainingPerformanceEventProducer";

const directories = [];
const INCIDENT = `Seated hip adductions
15r 80p
15r 90p
15r 100p
15r 100p

Sumo squat machine
12r 135p
180p 12r
225p 10r
225p 15r

Smith machine hip thrusts
15r 90p
12r 140p
15r 160p
12r 160p
12r 90p

Leg press high and narrow feet
180p 15r
225p 12r
270p 10r
270 10r

Lying leg curls
4 sets of
12r 75p`;

afterEach(() => {
  registerRuntimeTrainingExercises([]);
  directories.splice(0).forEach((directory) =>
    fs.rmSync(directory, { recursive: true, force: true })
  );
});

describe("controlled canonical exercise terminology alignment", () => {
  it("prepares exactly the two precise app-wide records without broad aliases", () => {
    const preparation = prepareCanonicalExerciseTerminologyAlignment(store());
    expect(preparation.outcome).toBe("ready");
    expect(preparation.definitionsToCreate).toEqual([
      expect.objectContaining({
        id: "sumo_squat_machine",
        name: "Sumo Squat Machine",
        aliases: [],
      }),
      expect.objectContaining({
        id: "leg_press_high_narrow",
        name: "Leg Press High And Narrow Feet",
        aliases: ["Leg Press, High And Narrow Feet"],
      }),
    ]);
  });

  it("commits one record each and a marker while preserving every other collection", async () => {
    const fixture = isolatedStore();
    const beforeReview = structuredClone(fixture.liveStore.evidenceReviews);
    const beforeHistory = structuredClone(fixture.liveStore.canonicalEvidenceObjects);
    const service = serviceFor(fixture);
    const result = await service.apply();
    const persisted = JSON.parse(fs.readFileSync(fixture.filePath, "utf8"));

    expect(result).toMatchObject({
      committed: true,
      idempotent: false,
      outcome: "created",
      revision: 42,
    });
    expect(persisted.canonicalExerciseLibrary).toHaveLength(3);
    expect(
      persisted.canonicalExerciseLibrary.filter((exercise) =>
        ["sumo_squat_machine", "leg_press_high_narrow"].includes(exercise.id)
      )
    ).toEqual([
      expect.objectContaining({
        id: "sumo_squat_machine",
        name: "Sumo Squat Machine",
        aliases: [],
      }),
      expect.objectContaining({
        id: "leg_press_high_narrow",
        name: "Leg Press High And Narrow Feet",
        aliases: ["Leg Press, High And Narrow Feet"],
      }),
    ]);
    expect(
      persisted.migrationMarkers.filter(
        (marker) =>
          marker.id === CANONICAL_EXERCISE_TERMINOLOGY_ALIGNMENT_VERSION
      )
    ).toHaveLength(1);
    expect(persisted.evidenceReviews).toEqual(beforeReview);
    expect(persisted.canonicalEvidenceObjects).toEqual(beforeHistory);
  });

  it("is idempotent and does not advance the store a second time", async () => {
    const fixture = isolatedStore();
    const service = serviceFor(fixture);
    await service.apply();
    const before = fs.readFileSync(fixture.filePath);
    const result = await service.apply();
    expect(result).toMatchObject({
      committed: false,
      idempotent: true,
      outcome: "already_applied",
    });
    expect(fs.readFileSync(fixture.filePath)).toEqual(before);
  });

  it("reuses an exact controlled record under an existing canonical ID", () => {
    const liveStore = store({
      canonicalExerciseLibrary: [
        existingBicep(),
        {
          ...structuredClone(CANONICAL_EXERCISE_TERMINOLOGY_DEFINITIONS[0]),
          id: "approved_sumo_machine",
        },
      ],
    });
    const preparation =
      prepareCanonicalExerciseTerminologyAlignment(liveStore);
    expect(preparation.resolutions[0]).toMatchObject({
      action: "reuse",
      canonicalExerciseId: "approved_sumo_machine",
      canonicalExerciseName: "Sumo Squat Machine",
    });
    expect(preparation.definitionsToCreate).toEqual([
      expect.objectContaining({ id: "leg_press_high_narrow" }),
    ]);
  });

  it("fails safely when exact terminology maps to multiple canonical IDs", () => {
    const liveStore = store({
      canonicalExerciseLibrary: [
        existingBicep(),
        {
          id: "sumo_one",
          name: "Sumo Squat Machine",
          aliases: [],
        },
        {
          id: "sumo_two",
          name: "Unrelated Machine",
          aliases: ["Sumo Squat Machine"],
        },
      ],
    });
    expect(() =>
      prepareCanonicalExerciseTerminologyAlignment(liveStore)
    ).toThrow(/more than one canonical exercise/i);
  });

  it("fails safely when a marker exists without both canonical records", () => {
    const liveStore = store({
      migrationMarkers: [{
        id: CANONICAL_EXERCISE_TERMINOLOGY_ALIGNMENT_VERSION,
        schemaVersion: CANONICAL_EXERCISE_TERMINOLOGY_ALIGNMENT_VERSION,
        appliedAt: "2026-07-30T18:00:00.000Z",
        exerciseIdentities: [],
      }],
    });
    expect(() =>
      prepareCanonicalExerciseTerminologyAlignment(liveStore)
    ).toThrow(/marker exists without every required canonical exercise/i);
  });
});

describe("precise app-wide terminology behavior", () => {
  it("resolves the exact incident to five exercises, twenty-one sets, and only Smith provisional", () => {
    registerAlignedDefinitions();
    const exercises = parse(INCIDENT);
    expect(exercises).toHaveLength(5);
    expect(exercises.flatMap((exercise) => exercise.sets)).toHaveLength(21);
    expect(
      exercises.map((exercise) => [
        exercise.name,
        exercise.canonicalExerciseId,
        Boolean(exercise.provisionalExercise),
      ])
    ).toEqual([
      ["Seated Hip Adductions", "seated_hip_adductions", false],
      ["Sumo Squat Machine", "sumo_squat_machine", false],
      ["Smith Machine Hip Thrusts", null, true],
      ["Leg Press High And Narrow Feet", "leg_press_high_narrow", false],
      ["Lying Leg Curls", "lying_leg_curl", false],
    ]);
    expect(exercises[3].sets[3]).toMatchObject({
      reps: 10,
      weight: 270,
      weight_unit: "lb",
      unit_inference: { code: "contextual_pound_unit" },
    });
    expect(exercises[2].provisionalExercise).toMatchObject({
      suggestedPrimaryMuscleGroup: "Glutes",
      suggestedPrimaryMuscleGroupId: "glutes",
      suggestedPrimaryMuscleGroupConfidence: "high",
    });
  });

  it("keeps both identities distinct from every related generic movement", () => {
    registerAlignedDefinitions();
    expect(resolveTrainingExerciseIdentity("Sumo squat machine")).toMatchObject({
      canonicalExerciseId: "sumo_squat_machine",
      canonicalExerciseName: "Sumo Squat Machine",
    });
    expect(resolveTrainingExerciseIdentity("Leg press high and narrow feet"))
      .toMatchObject({
        canonicalExerciseId: "leg_press_high_narrow",
        canonicalExerciseName: "Leg Press High And Narrow Feet",
      });
    expect(resolveTrainingExerciseIdentity("Squat").canonicalExerciseId)
      .toBe("squat");
    expect(resolveTrainingExerciseIdentity("Hack Squats").canonicalExerciseId)
      .toBe("hack_squat");
    expect(resolveTrainingExerciseIdentity("Pendulum Squat Machine").canonicalExerciseId)
      .toBe("pendulum_squat_machine");
    expect(resolveTrainingExerciseIdentity("Leg Press").canonicalExerciseId)
      .toBe("leg_press");
    expect(resolveTrainingExerciseIdentity("Leg Press (Feet High)").canonicalExerciseId)
      .toBe("leg_press_feet_high");
  });

  it("makes both records available to independent resolution and picker calls", () => {
    registerAlignedDefinitions();
    const firstUpload = resolveTrainingExerciseIdentity("Sumo squat machine");
    const secondUserUpload = resolveTrainingExerciseIdentity(
      "Leg press high and narrow feet"
    );
    const options = listCanonicalTrainingExerciseIdentities();
    expect(firstUpload.canonicalExerciseId).toBe("sumo_squat_machine");
    expect(secondUserUpload.canonicalExerciseId).toBe("leg_press_high_narrow");
    expect(searchCanonicalExerciseOptions(options, "Sumo Squat Machine")[0])
      .toMatchObject({
        id: "sumo_squat_machine",
        name: "Sumo Squat Machine",
      });
    expect(
      searchCanonicalExerciseOptions(
        options,
        "Leg Press High And Narrow Feet"
      )[0]
    ).toMatchObject({
      id: "leg_press_high_narrow",
      name: "Leg Press High And Narrow Feet",
    });
  });

  it("aligns Training Library identity while retaining historical-only labels as noncanonical", () => {
    registerAlignedDefinitions();
    const breakdown = getResistanceBreakdown([{
      exercises: [
        exercise("Sumo Squat Machine", 135),
        exercise("Leg Press High And Narrow Feet", 270),
        exercise("Unknown Historical Press", 100),
      ],
    }]);
    const exercises = breakdown.flatMap((region) =>
      region.movementFamilies.flatMap((family) => family.exercises)
    );
    expect(exercises).toEqual(expect.arrayContaining([
      expect.objectContaining({
        canonicalExerciseId: "sumo_squat_machine",
        canonicalIdentityStatus: "canonical",
        label: "Sumo Squat Machine",
      }),
      expect.objectContaining({
        canonicalExerciseId: "leg_press_high_narrow",
        canonicalIdentityStatus: "canonical",
        label: "Leg Press High And Narrow Feet",
      }),
      expect.objectContaining({
        canonicalExerciseId: null,
        canonicalIdentityStatus: "historical_only",
        label: "Unknown Historical Press",
      }),
    ]));
  });

  it.each([
    ["Leg Press High And Narrow Feet", "Leg Press", "leg_press"],
    ["Sumo Squat Machine", "Squat", "squat"],
  ])("does not collapse typed %s into screenshot %s", (precise, generic, genericId) => {
    registerAlignedDefinitions();
    const [merged] = mergeTypedEvidenceIntoTrainingObjects({
      typedEvidence: `${precise}\n10r 100p`,
      evidenceObjects: [{
        id: "screenshot_training",
        evidence_type: "training",
        metadata: { activity_type: "Traditional Strength Training" },
        source: { modality: "screenshot", source_artifact_refs: ["image.png"] },
        provenance: { source_artifact_refs: ["image.png"] },
        exercises: [{
          id: genericId,
          name: generic,
          canonicalExerciseId: genericId,
          sets: [{ reps: 10, weight: 100, weight_unit: "lb" }],
        }],
      }],
    });
    expect(merged.exercises).toHaveLength(2);
    expect(
      merged.exercises.find((item) => item.name === precise)
        ?.canonicalExerciseId
    ).toBe(
      precise === "Sumo Squat Machine"
        ? "sumo_squat_machine"
        : "leg_press_high_narrow"
    );
    expect(
      merged.exercises.find((item) => item.name === generic)
        ?.canonicalExerciseId
    ).toBe(genericId);
  });

  it("preserves precise IDs through volume intelligence and PR-event preparation", () => {
    registerAlignedDefinitions();
    const sessions = [
      session("one", "2026-07-10", 100),
      session("two", "2026-07-24", 120),
    ];
    const report = createTrainingPerformanceIntelligenceReport({
      trainingSessions: sessions,
      now: new Date("2026-07-30T12:00:00.000Z"),
    });
    const observation = report.exerciseObservations.find(
      (item) => item.exercise.key === "sumo_squat_machine"
    );
    expect(observation).toMatchObject({
      exercise: {
        key: "sumo_squat_machine",
        name: "Sumo Squat Machine",
      },
      explanation_data: {
        last_session: { total_volume: 1200 },
        previous_comparable_session: { total_volume: 1000 },
      },
    });

    const events = produceTrainingPerformanceEvents({
      canonicalTrainingSession: {
        canonicalId: "canonical_training_two",
        payload: sessions[1],
      },
      trainingAnalysis: {
        id: "analysis_two",
        metadata: {
          trainingPerformance: {
            exerciseObservations: [observation],
          },
        },
      },
      sourceReviewId: "review_two",
      sourceEvidencePackageId: "package_two",
      now: () => new Date("2026-07-30T12:00:00.000Z"),
    });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        canonicalExerciseId: "sumo_squat_machine",
        canonicalExerciseName: "Sumo Squat Machine",
      }),
    ]));
  });
});

function isolatedStore() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "canonical-terminology-")
  );
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const liveStore = store();
  fs.writeFileSync(filePath, JSON.stringify(liveStore));
  return { filePath, liveStore };
}

function serviceFor({ filePath, liveStore }) {
  return createCanonicalExerciseTerminologyAlignmentService({
    runtimeStorePath: filePath,
    liveStore,
    now: () => new Date("2026-07-30T18:00:00.000Z"),
    createUnitOfWork: (options) =>
      createFounderStoreUnitOfWork({
        ...options,
        createCommitId: () => "canonical_terminology_commit",
        createTransactionId: () => "canonical_terminology_transaction",
      }),
  });
}

function store(overrides = {}) {
  return {
    revision: 41,
    lastCommitId: "existing_commit",
    updatedAt: "2026-07-30T16:55:03.782Z",
    canonicalExerciseLibrary: [existingBicep()],
    canonicalEvidenceObjects: [{
      canonicalId: "historical_workout",
      evidence_type: "training",
      payload: {
        exercises: [{ name: "Sumo Squat Machine" }],
      },
    }],
    evidenceReviews: [{
      id: "pending_review",
      status: "pending",
      interpretedEvidence: {
        evidence_objects: [{
          evidence_type: "training",
          exercises: [{
            name: "Sumo Squat Machine",
            canonicalExerciseId: null,
          }],
        }],
      },
    }],
    migrationMarkers: [],
    trainingPerformanceEvents: [],
    ...overrides,
  };
}

function existingBicep() {
  return {
    id: "bicep_curl_machine",
    name: "Bicep Curl Machine",
    aliases: ["Machine Bicep Curl"],
  };
}

function registerAlignedDefinitions() {
  registerRuntimeTrainingExercises(
    CANONICAL_EXERCISE_TERMINOLOGY_DEFINITIONS.map((definition) =>
      structuredClone(definition)
    )
  );
}

function parse(text) {
  return createTrainingSessionEvidenceFromText({
    id: "training_fixture",
    observedAt: "2026-07-30T06:47:00-07:00",
    provenanceRef: "typed_fixture",
    text,
  }).exercises;
}

function exercise(name, weight) {
  return {
    name,
    body_region: "Lower Body",
    movement_pattern: "Squat",
    sets: [{ reps: 10, weight, weight_unit: "lb" }],
  };
}

function session(id, date, weight) {
  return {
    id,
    evidence_type: "training",
    observed_at: date,
    metadata: { activity_type: "Traditional Strength Training" },
    exercises: [exercise("Sumo Squat Machine", weight)],
  };
}
