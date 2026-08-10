import { describe, expect, it } from "vitest";
import {
  parseStrengthTrainingSessionText,
} from "./trainingSessionEvidence";
import {
  normalizeTrainingExerciseRelationshipGroups,
  removeExerciseFromTrainingRelationshipGroups,
  validateTrainingExerciseRelationshipGroups,
} from "./trainingExerciseRelationship";

describe("TrainingSession exercise relationships", () => {
  it("parses one ordered Superset and keeps standalone exercises ungrouped", () => {
    const result = parseStrengthTrainingSessionText([
      "Superset:",
      "Incline Bench Press",
      "Variant: Static Hold",
      "8r 115p",
      "Spider Curls",
      "10r 35p",
      "End Superset",
      "Leg Extensions",
      "12r 70p",
    ].join("\n"), { provenanceRef: "typed_evidence_0" });

    expect(result.structuralReviewIssues).toEqual([]);
    expect(result.exercises).toHaveLength(3);
    expect(new Set(result.exercises.map((exercise) => exercise.id)).size).toBe(3);
    expect(result.exercises[0].executionVariant).toMatchObject({
      key: "static_hold",
      label: "Static Hold",
    });
    expect(result.exerciseRelationshipGroups).toEqual([
      expect.objectContaining({
        relationshipType: "superset",
        memberExerciseIds: [result.exercises[0].id, result.exercises[1].id],
        provenance_ref: "typed_evidence_0",
        provenance: { source_artifact_refs: ["typed_evidence_0"] },
      }),
    ]);
  });

  it("accepts EOF as an explicit Superset terminator and produces stable ids", () => {
    const text = [
      "Superset:",
      "Chest Press Machine",
      "8r 100p",
      "Chest Fly Machine",
      "10r 80p",
    ].join("\n");
    const first = parseStrengthTrainingSessionText(text);
    const second = parseStrengthTrainingSessionText(text);

    expect(first.structuralReviewIssues).toEqual([]);
    expect(first.exerciseRelationshipGroups).toHaveLength(1);
    expect(first.exercises.map((exercise) => exercise.id)).toEqual(
      second.exercises.map((exercise) => exercise.id)
    );
  });

  it("represents repeated same-movement and same-variant occurrences independently", () => {
    const result = parseStrengthTrainingSessionText([
      "Superset:",
      "Leg Extensions",
      "Variant: Partial Reps",
      "12r 60p",
      "Leg Extensions",
      "Variant: Partial Reps",
      "15r 45p",
      "End Superset",
    ].join("\n"));

    expect(result.structuralReviewIssues).toEqual([]);
    expect(result.exercises).toHaveLength(2);
    expect(result.exercises[0].id).not.toBe(result.exercises[1].id);
    expect(result.exerciseRelationshipGroups[0].memberExerciseIds).toEqual(
      result.exercises.map((exercise) => exercise.id)
    );
  });

  it("routes malformed and ambiguous structure to review without inventing a group", () => {
    const incomplete = parseStrengthTrainingSessionText([
      "Superset:",
      "Leg Extensions",
      "12r 70p",
      "End Superset",
    ].join("\n"));
    const ambiguous = parseStrengthTrainingSessionText([
      "Leg Extensions",
      "12r 70p",
      "Leg Extensions (Partial Reps)",
      "10r 65p",
      "Leg Extensions superset with Hack Squats",
      "Hack Squats",
      "8r 135p",
    ].join("\n"));

    expect(incomplete.exerciseRelationshipGroups).toEqual([]);
    expect(incomplete.structuralReviewIssues).toEqual([
      expect.objectContaining({ code: "INCOMPLETE_SUPERSET" }),
    ]);
    expect(ambiguous.exerciseRelationshipGroups).toEqual([]);
    expect(ambiguous.structuralReviewIssues).toEqual([
      expect.objectContaining({ code: "AMBIGUOUS_NATURAL_SUPERSET" }),
    ]);
  });

  it("dissolves a two-member Superset when one occurrence is removed", () => {
    const groups = [{
      id: "superset_1",
      relationshipType: "superset",
      memberExerciseIds: ["exercise_1", "exercise_2"],
    }];
    expect(removeExerciseFromTrainingRelationshipGroups(groups, "exercise_1"))
      .toEqual([]);
  });

  it("rejects dangling, duplicate, and overlapping occurrence references", () => {
    const exercises = [{ id: "one" }, { id: "two" }, { id: "three" }];
    const groups = [
      { id: "a", relationshipType: "superset", memberExerciseIds: ["one", "two"] },
      { id: "b", relationshipType: "superset", memberExerciseIds: ["two", "missing"] },
    ];
    expect(validateTrainingExerciseRelationshipGroups({ exercises, groups }).map((issue) => issue.code))
      .toEqual(expect.arrayContaining([
        "OVERLAPPING_EXERCISE_RELATIONSHIP_MEMBERSHIP",
        "DANGLING_EXERCISE_RELATIONSHIP_MEMBER",
      ]));
    expect(() => normalizeTrainingExerciseRelationshipGroups(groups, {
      exercises,
      strict: true,
    })).toThrow();
  });

  it("keeps relationship-free legacy input relationship-free", () => {
    const result = parseStrengthTrainingSessionText([
      "Chest Press Machine",
      "8r 100p",
      "Chest Fly Machine",
      "10r 80p",
    ].join("\n"));
    expect(result.exercises).toHaveLength(2);
    expect(result.exerciseRelationshipGroups).toEqual([]);
    expect(result.relationshipSyntaxPresent).toBe(false);
  });

  it("supports Variant before sets outside a group and flags invalid ordering", () => {
    const valid = parseStrengthTrainingSessionText([
      "Spider Curls",
      "Variant: Static Hold",
      "10r 35p",
    ].join("\n"));
    const invalid = parseStrengthTrainingSessionText([
      "Spider Curls",
      "10r 35p",
      "Variant: Static Hold",
    ].join("\n"));

    expect(valid.exercises[0].executionVariant).toMatchObject({ key: "static_hold" });
    expect(valid.structuralReviewIssues).toEqual([]);
    expect(invalid.structuralReviewIssues).toEqual([
      expect.objectContaining({ code: "VARIANT_AFTER_SETS" }),
    ]);
  });
});
