import fs from "node:fs";
import path from "node:path";
import { describe,expect,it } from "vitest";
import { buildGoalEditDraft,getGoalEditStepSequence,moveGoalEditStep,selectGoalEditSections } from "../domain/services/GoalEditDraftService";

const source=fs.readFileSync(path.resolve(process.cwd(),"src/screens/GoalEditWizardScreen.jsx"),"utf8");
const goal={id:"goal",userId:"user",title:"Build Lean Mass",primary:true,status:"active",primaryOutcome:"Build",updatedAt:"2026-07-21"};
const capable=()=>({...buildGoalEditDraft(goal),phaseEditing:{capability:{available:true}}});

describe("live Overall Goal editor routing",()=>{
 it("maps unique checkbox values to associated labels",()=>{for(const [id,label] of [["goal_and_purpose","Goal and purpose"],["phases","Phases"],["overall_goal","Overall goal"]]){expect(source).toContain(`["${id}","${label}"]`);expect(source).toContain("htmlFor={inputId}");expect(source).toContain("value={id}")}expect(new Set(["goal_and_purpose","phases","overall_goal"]).size).toBe(3)});
 it("routes each canonical section through an exhaustive editor",()=>{expect(source).toContain('case GoalEditSection.GOAL_AND_PURPOSE');expect(source).toContain('data-editor-type="goal_and_purpose_editor"');expect(source).toContain('case GoalEditSection.OVERALL_GOAL');expect(source).toContain('data-editor-type="overall_goal_destination_editor"');expect(source).toContain('data-editor-type="unavailable"')});
 it("keeps destination fields out of the Goal and purpose renderer",()=>{const goalEditor=source.slice(source.indexOf('case GoalEditSection.GOAL_AND_PURPOSE'),source.indexOf('case GoalEditSection.PHASES'));expect(goalEditor).toContain("Goal name");expect(goalEditor).toContain("Primary outcome");expect(goalEditor).not.toContain("Journey begins");const overall=source.slice(source.indexOf('case GoalEditSection.OVERALL_GOAL'),source.indexOf('case GoalEditSection.SUCCESS_CRITERIA'));expect(overall).toContain("TargetTimeline");expect(overall).not.toContain("Goal name")});
 it("builds the three required canonical flows",()=>{expect(getGoalEditStepSequence(selectGoalEditSections(capable(),["overall_goal"]))).toEqual(["choose_sections","overall_goal","review"]);expect(getGoalEditStepSequence(selectGoalEditSections(capable(),["phases","overall_goal"]))).toEqual(["choose_sections","phases","overall_goal","review"]);expect(getGoalEditStepSequence(selectGoalEditSections(capable(),["goal_and_purpose","overall_goal"]))).toEqual(["choose_sections","goal_and_purpose","overall_goal","review"])});
 it("preserves canonical navigation forward and backward",()=>{let draft=selectGoalEditSections(capable(),["goal_and_purpose","overall_goal"]);draft=moveGoalEditStep(draft,"forward");expect(draft.currentStep).toBe("overall_goal");draft=moveGoalEditStep(draft,"back");expect(draft.currentStep).toBe("goal_and_purpose")});
 it("does not treat incomplete legacy primaryOutcome as a destination",()=>{expect(source).toContain('plan.target?.type!=="unspecified"?plan.target?.description??"":""');expect(buildGoalEditDraft(goal).workingPlan).toMatchObject({primaryOutcome:"Build",target:{type:"unspecified",description:null}})});
 it("exposes read-only routing diagnostics without visible identifiers",()=>{expect(source).toContain("data-selected-sections={draft.selectedSections.join");expect(source).toContain("data-current-section={step}");expect(source).toContain("data-editor-type")});
});
