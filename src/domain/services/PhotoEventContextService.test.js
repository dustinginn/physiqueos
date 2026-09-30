import { describe, expect, it, vi } from "vitest";
import {
  createPhotoInterpreterGoalContext,
  resolvePhotoEventContext,
  resolvePhotoEventFutureMilestone,
} from "./PhotoEventContextService";

const activeGoal={id:"goal_build_lean_mass",userId:"user",title:"Build Lean Mass",type:"build_lean_mass",primary:true,status:"active",sourceGoalId:"goal_visible_abs",target:{type:"numeric_change",metric:"lean_mass",direction:"increase",amount:10,unit:"lb"},guardrails:[{id:"body-fat",metric:"body_fat_percentage",min:8,max:9,unit:"%",text:"Maintain approximately 8–9% body fat.",accepted:true}],progressMeasurement:{outcomeMeasures:[{id:"lean-mass",evidenceType:"dexa_lean_mass",accepted:true}]},openingApproach:{value:"calibration",label:"Maintenance calibration"},phases:[{id:"phase_1",name:"Establish Maintenance",status:"active",purpose:"Establish the operating baseline.",guardrails:[{id:"phase-rate",text:"Advance deliberately.",accepted:true}]}]};
const completedGoal={id:"goal_visible_abs",userId:"user",title:"Visible Abs",type:"fat_loss",status:"completed",completedAt:"2026-07-21",target:{metric:"body_fat",direction:"decrease"},guardrails:[{id:"lean-mass",text:"Preserve lean mass.",accepted:true}]};

describe("PhotoEventContextService",()=>{
  it("supplies active goal, phase, operating state, and prior completed goal to ordinary interpretation",async()=>{
    const repositories={
      goals:{getActiveGoal:vi.fn(async()=>activeGoal),listGoals:vi.fn(async()=>[activeGoal,completedGoal])},
      executionItems:{listExecutionItems:vi.fn(async()=>[])},
      dexaScans:{listDEXAScans:vi.fn(async()=>[])},
    };
    const context=await resolvePhotoEventContext({repositories,userId:"user",evidenceDate:"2026-07-25T17:00:00Z"});
    expect(context).toMatchObject({evidenceDate:"2026-07-25",activeGoal:{id:"goal_build_lean_mass"},activePhase:{name:"Establish Maintenance"},operatingState:{value:"calibration"},completedPriorGoal:{id:"goal_visible_abs"}});
    expect(context.activeGoal).toMatchObject({
      type:"build_lean_mass",
      target:{metric:"lean_mass",direction:"increase",amount:10,unit:"lb"},
      guardrails:[{id:"body-fat",metric:"body_fat_percentage",min:8,max:9,unit:"%",accepted:true}],
      progressMeasurement:{outcomeMeasures:[{evidenceType:"dexa_lean_mass"}]},
    });
    expect(context.activePhase).toMatchObject({
      purpose:"Establish the operating baseline.",
      guardrails:[{id:"phase-rate"}],
    });
    expect(context.completedPriorGoal).toMatchObject({
      target:{metric:"body_fat"},guardrails:[{id:"lean-mass"}],
    });
    const prompt=createPhotoInterpreterGoalContext(context);
    expect(prompt).toMatch(/Build Lean Mass.*Establish Maintenance.*calibration.*Completed prior goal: Visible Abs.*2026-07-25/);
    expect(prompt).not.toBe("Visible Abs at Rest");
  });

  it("uses explicit neutral context when no active goal exists",()=>{
    const prompt=createPhotoInterpreterGoalContext({evidenceDate:"2026-07-25",activeGoal:null});
    expect(prompt).toMatch(/neutral physique evidence/);
    expect(prompt).toMatch(/do not assume a cut/i);
  });

  it("uses persisted Photo Session Goal/Phase attribution instead of today's active Goal", async () => {
    const historicalGoal={...completedGoal,phases:[{id:"visible-phase",goalId:completedGoal.id,name:"Final Cut",purpose:"Finish",order:0,status:"completed",startDate:"2026-06-01",startedAt:"2026-06-01",completedAt:"2026-07-21",timingMode:"completion_criteria",transitionPolicy:"manual_review"}]};
    const repositories={
      goals:{getActiveGoal:vi.fn(async()=>activeGoal),listGoals:vi.fn(async()=>[activeGoal,historicalGoal])},
      executionItems:{listExecutionItems:vi.fn(async()=>[])},
      dexaScans:{listDEXAScans:vi.fn(async()=>[])},
    };
    const context=await resolvePhotoEventContext({
      repositories,
      userId:"user",
      evidenceDate:"2026-07-18",
      evidenceAttribution:{goalId:historicalGoal.id,phaseId:"visible-phase"},
    });
    expect(context).toMatchObject({
      activeGoal:{id:historicalGoal.id,target:{metric:"body_fat"},guardrails:[{id:"lean-mass"}]},
      activePhase:{id:"visible-phase"},
    });
  });

  it("preserves missing and multiple guardrails without inventing defaults", async () => {
    const noGuardrail={...activeGoal,id:"none",guardrails:undefined};
    const several={...activeGoal,id:"several",guardrails:[
      {id:"one",text:"First.",accepted:true},
      {id:"two",text:"Second.",accepted:false},
    ]};
    const repositories={
      goals:{getActiveGoal:vi.fn(async()=>noGuardrail),listGoals:vi.fn(async()=>[noGuardrail])},
      executionItems:{listExecutionItems:vi.fn(async()=>[])},
      dexaScans:{listDEXAScans:vi.fn(async()=>[])},
    };
    const missing=await resolvePhotoEventContext({repositories,userId:"user",evidenceDate:"2026-09-19"});
    expect(missing.activeGoal.guardrails).toEqual([]);
    repositories.goals.getActiveGoal.mockResolvedValue(several);
    repositories.goals.listGoals.mockResolvedValue([several]);
    const multiple=await resolvePhotoEventContext({repositories,userId:"user",evidenceDate:"2026-09-19"});
    expect(multiple.activeGoal.guardrails).toEqual(several.guardrails);
    multiple.activeGoal.guardrails[0].text="Changed snapshot";
    expect(several.guardrails[0].text).toBe("First.");
  });

  it("preserves completion-specific interpreter instructions",()=>{
    expect(createPhotoInterpreterGoalContext({}, {confirmationPurpose:"visible_abs_completion"})).toMatch(/Visible Abs completion evaluation/);
  });

  it("selects only the earliest active future DEXA and excludes past or completed dates",()=>{
    const scheduled=(id,date,status="scheduled")=>({id,type:"dexa_appointment",active:true,status,preferredSchedule:{date},linkedGoalIds:["goal_build_lean_mass"]});
    const result=resolvePhotoEventFutureMilestone({
      evidenceDate:"2026-07-25",
      activeGoal,
      completedDexaHistory:[{measuredAt:"2026-07-18"},{measuredAt:"2026-08-01"}],
      scheduledMeasurements:[scheduled("past","2026-07-18"),scheduled("same","2026-07-25"),scheduled("completed","2026-08-01"),scheduled("later","2026-09-01"),scheduled("next","2026-08-15")],
    });
    expect(result).toMatchObject({id:"next",date:"2026-08-15",source:"execution_item"});
    expect(result.label).toMatch(/DEXA on Saturday, Aug 15/);
  });

  it("returns no milestone when none is valid",()=>{
    expect(resolvePhotoEventFutureMilestone({evidenceDate:"2026-07-25",scheduledMeasurements:[]})).toBeNull();
  });
});
