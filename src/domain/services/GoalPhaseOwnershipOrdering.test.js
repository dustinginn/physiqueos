import { describe, expect, it } from "vitest";
import { buildGoalEditDraft } from "./GoalEditDraftService";
import { extendGoalEditDraftWithPhases, moveAuthoredPhase, updateAuthoredPhase, validatePhaseEditingDraft } from "./GoalEditPhaseDraftService";

const phases=[
 {id:"p1",goalId:"goal",name:"Establish Maintenance",purpose:"Baseline",status:"active",order:0,startDate:null,targetDate:null,duration:null,timingMode:"completion_criteria",successCriteria:[{key:"stable",label:"Stable performance"}],guardrails:[],transitionPolicy:"evidence_review"},
 {id:"p2",goalId:"goal",name:"Lean Mass Build",purpose:"Build",status:"upcoming",order:1,startDate:null,targetDate:"2026-10-31",duration:null,timingMode:"target_date",successCriteria:[],guardrails:[],transitionPolicy:"manual_review"},
];
const goal={id:"goal",userId:"user",status:"active",primary:true,title:"Build Lean Mass",guardrails:["Stay within 8–9% body fat"],phases};
const fresh=()=>extendGoalEditDraftWithPhases(buildGoalEditDraft(goal),{goal,capability:{available:true,blockingReasons:[]},now:new Date("2026-07-21")});

describe("Goal Phase ownership and ordering behavior",()=>{
 it("keeps goal guardrails separate when a phase protection is authored",()=>{
  const draft=fresh(),goalGuardrails=structuredClone(draft.workingPlan.guardrails);
  const updated=updateAuthoredPhase(draft,"p1",{guardrails:[{key:"phase_only",label:"Protect recovery in this phase"}]});
  expect(updated.workingPlan.guardrails).toEqual(goalGuardrails);
  expect(updated.phaseEditing.workingAuthoredPhases[0].guardrails).toEqual([{key:"phase_only",label:"Protect recovery in this phase"}]);
  expect(updated.phaseEditing.workingAuthoredPhases[1].guardrails).toEqual([]);
 });
 it("reorders only phase order and preserves identity, timing, and lifecycle",()=>{
  const draft=fresh(),before=draft.phaseEditing.workingAuthoredPhases.map(({id,status,timingMode,startDate,targetDate,duration})=>({id,status,timingMode,startDate,targetDate,duration}));
  const moved=moveAuthoredPhase(draft,"p2","earlier");
  expect(moved.phaseEditing.workingAuthoredPhases.map(x=>x.id)).toEqual(["p2","p1"]);
  expect(moved.phaseEditing.workingAuthoredPhases.map(({id,status,timingMode,startDate,targetDate,duration})=>({id,status,timingMode,startDate,targetDate,duration}))).toEqual([before[1],before[0]]);
  expect(validatePhaseEditingDraft(moved).valid).toBe(false);
 });
 it("treats a boundary move as a no-op",()=>{
  const draft=fresh();
  expect(moveAuthoredPhase(draft,"p1","earlier")).toBe(draft);
  expect(moveAuthoredPhase(draft,"p2","later")).toBe(draft);
 });
});
