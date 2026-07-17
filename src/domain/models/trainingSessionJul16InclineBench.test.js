import { describe, expect, it } from "vitest";
import { JUL_16_STRENGTH_NOTE } from "../../fixtures/jul16StrengthEvidenceFixture";
import { parseStrengthTrainingText } from "./trainingSessionEvidence";
import { getCanonicalTrainingExerciseSlug } from "./trainingExerciseIdentity";

describe("Jul 16 typed strength regression",()=>{
  it("preserves exercise order and attaches all four 115 lb sets to Incline Bench Press",()=>{const exercises=parseStrengthTrainingText(JUL_16_STRENGTH_NOTE);expect(exercises.map((item)=>item.name)).toEqual(["Chest Press Machine","Chest Fly Machine","Incline Bench Press","Cable Crunches"]);expect(exercises.map((item)=>getCanonicalTrainingExerciseSlug(item.name))).toEqual(["chest_press_machine","chest_fly_machine","incline_bench_press","cable_crunch"]);expect(exercises[2].sets).toHaveLength(4);expect(exercises[2].sets.map((set)=>({reps:set.reps,weight:set.weight,unit:set.weight_unit}))).toEqual(Array(4).fill({reps:7,weight:115,unit:"lb"}));expect(exercises.map((item)=>item.sets.length)).toEqual([3,4,4,4]);});
});
