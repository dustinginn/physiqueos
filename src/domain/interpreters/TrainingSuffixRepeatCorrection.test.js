import { describe, expect, it } from "vitest";
import {
  assessTypedStrengthParseCompleteness,
  mergeTypedEvidenceIntoTrainingObjects,
} from "./ScreenshotInterpreterService";
import {
  getStrengthTrainingBlockParseDiagnostics,
  parseStrengthTrainingText,
} from "../models/trainingSessionEvidence";
import { resolveTrainingExerciseIdentity } from "../models/trainingExerciseIdentity";

export const INCIDENT_TYPED_WORKOUT = [
  "Hack squats",
  "4 sets of",
  "135p 10r",
  "",
  "Leg extensions",
  "15r 70p x4",
  "",
  "Sissy squats",
  "15r 45p",
  "12r 45p",
  "15r 45p",
  "12r 45p",
  "",
  "Single-leg leg press",
  "15r 135p",
  "15r 135p",
  "15r 135p",
  "15r 135p",
  "",
  "Seated hip abductions",
  "15r 150 x4",
].join("\n");

const EXPECTED = [
  ["hack_squat", 4],
  ["leg_extension", 4],
  ["sissy_squat", 4],
  ["single_leg_leg_press", 4],
  ["seated_hip_abductions", 4],
];

const EXPLICIT_SETS = INCIDENT_TYPED_WORKOUT
  .replace("15r 70p x4", "15r 70p\n15r 70p\n15r 70p\n15r 70p")
  .replace("15r 150 x4", "15r 150\n15r 150\n15r 150\n15r 150");

function identity(exercise) {
  return resolveTrainingExerciseIdentity(exercise.name).canonicalExerciseId;
}

function signature(exercises) {
  return exercises.map((exercise) => [identity(exercise), exercise.sets.length]);
}

function expectRepeatedSets(exercises, expectedCount, { reps, weight }) {
  expect(exercises).toHaveLength(1);
  expect(exercises[0].sets).toHaveLength(expectedCount);
  expect(exercises[0].sets).toEqual(
    Array.from({ length: expectedCount }, (_, index) =>
      expect.objectContaining({
        provenance_ref: "typed_evidence_0",
        reps,
        set_number: index + 1,
        weight,
        weight_unit: "lb",
      })
    )
  );
}

function screenshotExercises(allFive = false) {
  const parsed = [
    "Hack squats\n4 sets of\n135p 10r",
    "Leg extensions\n15r 70p\n15r 70p\n15r 70p\n15r 70p",
    "Sissy squats\n15r 45p\n12r 45p\n15r 45p\n12r 45p",
    "Single-leg leg press\n15r 135p\n15r 135p\n15r 135p\n15r 135p",
    "Seated hip abductions\n15r 150\n15r 150\n15r 150\n15r 150",
  ].flatMap((block) =>
    parseStrengthTrainingText(block, { provenanceRef: "screenshot_0" })
  );
  return allFive
    ? parsed
    : parsed.filter((exercise) =>
        ["hack_squat", "sissy_squat", "single_leg_leg_press"].includes(
          identity(exercise)
        )
      );
}

function screenshotObject(exercises) {
  return {
    id: "fixture_workout",
    evidence_type: "training",
    metadata: { activity_type: "Traditional Strength Training" },
    source: {
      modality: "screenshot",
      source_artifact_refs: ["screenshot_0"],
    },
    provenance: { source_artifact_refs: ["screenshot_0"] },
    exercises,
  };
}

function mergeWithScreenshot(exercises, typedEvidence = INCIDENT_TYPED_WORKOUT) {
  return mergeTypedEvidenceIntoTrainingObjects({
    evidenceObjects: [screenshotObject(exercises)],
    typedEvidence,
  })[0];
}

describe("suffix-repeat typed training evidence production correction", () => {
  it("Cases A and I: parses the exact incident as five complete exercises and twenty explicit sets", () => {
    const parsed = parseStrengthTrainingText(INCIDENT_TYPED_WORKOUT);
    const diagnostics = getStrengthTrainingBlockParseDiagnostics(
      INCIDENT_TYPED_WORKOUT
    );
    const completeness = assessTypedStrengthParseCompleteness({
      parsedExercises: parsed,
      typedEvidence: INCIDENT_TYPED_WORKOUT,
    });

    expect(diagnostics.recognizedExerciseMentions).toEqual([
      "Hack Squats",
      "Leg Extensions",
      "Sissy Squats",
      "Single-Leg Leg Press",
      "Seated Hip Abductions",
    ]);
    expect(signature(parsed)).toEqual(EXPECTED);
    expect(parsed.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: "hack_squats", name: "Hack Squats" },
      { id: "leg_extensions", name: "Leg Extensions" },
      { id: "sissy_squats", name: "Sissy Squats" },
      {
        id: "single_leg_leg_press",
        name: "Single-Leg Leg Press",
      },
      {
        id: "seated_hip_abductions",
        name: "Seated Hip Abductions",
      },
    ]);
    expect(parsed.flatMap((exercise) => exercise.sets)).toHaveLength(20);
    expect(
      parsed.flatMap((exercise) =>
        exercise.sets.map((set) => set.provenance_ref)
      )
    ).toEqual(Array(20).fill("typed_evidence_0"));
    expect(parsed.map((exercise) =>
      exercise.sets.map(({ reps, weight, weight_unit: unit }) => ({
        reps,
        unit,
        weight,
      }))
    )).toEqual([
      Array(4).fill({ reps: 10, unit: "lb", weight: 135 }),
      Array(4).fill({ reps: 15, unit: "lb", weight: 70 }),
      [15, 12, 15, 12].map((reps) => ({ reps, unit: "lb", weight: 45 })),
      Array(4).fill({ reps: 15, unit: "lb", weight: 135 }),
      Array(4).fill({ reps: 15, unit: "lb", weight: 150 }),
    ]);
    expect(completeness).toMatchObject({
      complete: true,
      missingIdentities: [],
      status: "complete",
    });
  });

  it.each([
    ["Case B: Leg Extensions", "Leg extensions", "15r 70p x4", 70],
    [
      "Case C: Seated Hip Abductions",
      "Seated hip abductions",
      "15r 150 x4",
      150,
    ],
  ])("%s expands exactly four sourced sets", (_label, name, setLine, weight) => {
    expectRepeatedSets(parseStrengthTrainingText(`${name}\n${setLine}`), 4, {
      reps: 15,
      weight,
    });
  });

  it.each([
    "15r 70p x4",
    "15r 70p x 4",
    "15r 70p \u00d74",
    "15r 70p \u00d7 4",
  ])("Case D: accepts suffix variant %s", (setLine) => {
    expectRepeatedSets(
      parseStrengthTrainingText(`Leg extensions\n${setLine}`),
      4,
      { reps: 15, weight: 70 }
    );
  });

  it.each([
    "4x 15r 70p",
    "4 x 15r 70p",
    "4 sets of 15r 70p",
  ])("Case E: preserves prefix form %s", (setLine) => {
    expectRepeatedSets(
      parseStrengthTrainingText(`Leg extensions\n${setLine}`),
      4,
      { reps: 15, weight: 70 }
    );
  });

  it.each([
    ["x1", 1],
    ["x50", 50],
  ])("Case F: accepts bounded repeat %s", (suffix, count) => {
    expectRepeatedSets(
      parseStrengthTrainingText(`Leg extensions\n15r 70p ${suffix}`),
      count,
      { reps: 15, weight: 70 }
    );
  });

  it.each(["x0", "x51", "x-4", "x4.5", "xabc"])(
    "Case F: rejects malformed or out-of-range repeat %s without a one-set fallback",
    (suffix) => {
      expect(
        parseStrengthTrainingText(`Leg extensions\n15r 70p ${suffix}`)
      ).toEqual([]);
    }
  );

  it("Case G: parses all five suffix-repeat exercises into twenty sets", () => {
    const parsed = parseStrengthTrainingText(
      [
        "Hack squats",
        "10r 135p x4",
        "",
        "Leg extensions",
        "15r 70p x4",
        "",
        "Sissy squats",
        "15r 45p x4",
        "",
        "Single-leg leg press",
        "15r 135p x4",
        "",
        "Seated hip abductions",
        "15r 150p x4",
      ].join("\n")
    );
    expect(signature(parsed)).toEqual(EXPECTED);
    expect(parsed.flatMap((exercise) => exercise.sets)).toHaveLength(20);
  });

  it.each(["first", "middle", "last"])(
    "Case H: parses a suffix-repeat exercise in the %s position",
    (position) => {
      const suffixBlock = "Leg extensions\n15r 70p x4";
      const explicitBlocks = [
        "Sissy squats\n15r 45p",
        "Single-leg leg press\n15r 135p",
      ];
      const blocks =
        position === "first"
          ? [suffixBlock, ...explicitBlocks]
          : position === "middle"
            ? [explicitBlocks[0], suffixBlock, explicitBlocks[1]]
            : [...explicitBlocks, suffixBlock];
      const parsed = parseStrengthTrainingText(blocks.join("\n\n"));
      expect(parsed.find((exercise) => identity(exercise) === "leg_extension")?.sets)
        .toHaveLength(4);
    }
  );

  it("Case J: merges a three-exercise screenshot with typed evidence into five exercises without duplicate sets", () => {
    const result = mergeWithScreenshot(screenshotExercises(false));
    expect(new Map(signature(result.exercises))).toEqual(new Map(EXPECTED));
    expect(result.exercises).toHaveLength(5);
    expect(result.exercises.flatMap((exercise) => exercise.sets)).toHaveLength(20);
    expect(result.reconciliation.matched_sources).toContain("typed_evidence_0");
  });

  it("Case K: reconciles two complete five-exercise representations without duplicate exercises or sets", () => {
    const result = mergeWithScreenshot(screenshotExercises(true));
    expect(signature(result.exercises)).toEqual(EXPECTED);
    expect(new Set(result.exercises.map(identity)).size).toBe(5);
    expect(result.exercises.flatMap((exercise) => exercise.sets)).toHaveLength(20);
  });

  it("Case L: reports incomplete when one of five recognized identities lacks structured sets", () => {
    const malformed = INCIDENT_TYPED_WORKOUT.replace(
      "15r 150 x4",
      "15r x4"
    );
    const parsed = parseStrengthTrainingText(malformed);
    const completeness = assessTypedStrengthParseCompleteness({
      parsedExercises: parsed,
      typedEvidence: malformed,
    });
    expect(signature(parsed)).toEqual(EXPECTED.slice(0, 4));
    expect(completeness).toMatchObject({
      complete: false,
      missingIdentities: ["seated_hip_abductions"],
      status: "incomplete_preserved_existing",
    });
    expect(completeness.reason).not.toContain("Every recognized");
  });

  it("Case M: preserves the explicit four-line exercise blocks", () => {
    const parsed = parseStrengthTrainingText(EXPLICIT_SETS);
    expect(
      signature(
        parsed.filter((exercise) =>
          ["sissy_squat", "single_leg_leg_press"].includes(identity(exercise))
        )
      )
    ).toEqual([
      ["sissy_squat", 4],
      ["single_leg_leg_press", 4],
    ]);
  });

  it("Case N: preserves a separated '4 sets of' declaration", () => {
    expectRepeatedSets(
      parseStrengthTrainingText("Hack squats\n4 sets of\n135p 10r"),
      4,
      { reps: 10, weight: 135 }
    );
  });
});
