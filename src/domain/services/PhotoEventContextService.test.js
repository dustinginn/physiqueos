import { describe, expect, it, vi } from "vitest";
import {
  createPhotoInterpreterGoalContext,
  resolvePhotoEventContext,
  resolvePhotoEventFutureMilestone,
} from "./PhotoEventContextService";

const activeGoal={id:"goal_build_lean_mass",userId:"user",title:"Build Lean Mass",primary:true,status:"active",sourceGoalId:"goal_visible_abs",openingApproach:{value:"calibration",label:"Maintenance calibration"},phases:[{id:"phase_1",name:"Establish Maintenance",status:"active"}]};
const completedGoal={id:"goal_visible_abs",userId:"user",title:"Visible Abs",status:"completed",completedAt:"2026-07-21"};

describe("PhotoEventContextService",()=>{
  it("supplies active goal, phase, operating state, and prior completed goal to ordinary interpretation",async()=>{
    const repositories={
      goals:{getActiveGoal:vi.fn(async()=>activeGoal),listGoals:vi.fn(async()=>[activeGoal,completedGoal])},
      executionItems:{listExecutionItems:vi.fn(async()=>[])},
      dexaScans:{listDEXAScans:vi.fn(async()=>[])},
    };
    const context=await resolvePhotoEventContext({repositories,userId:"user",evidenceDate:"2026-07-25T17:00:00Z"});
    expect(context).toMatchObject({evidenceDate:"2026-07-25",activeGoal:{id:"goal_build_lean_mass"},activePhase:{name:"Establish Maintenance"},operatingState:{value:"calibration"},completedPriorGoal:{id:"goal_visible_abs"}});
    const prompt=createPhotoInterpreterGoalContext(context);
    expect(prompt).toMatch(/Build Lean Mass.*Establish Maintenance.*calibration.*Completed prior goal: Visible Abs.*2026-07-25/);
    expect(prompt).not.toBe("Visible Abs at Rest");
  });

  it("uses explicit neutral context when no active goal exists",()=>{
    const prompt=createPhotoInterpreterGoalContext({evidenceDate:"2026-07-25",activeGoal:null});
    expect(prompt).toMatch(/neutral physique evidence/);
    expect(prompt).toMatch(/do not assume a cut/i);
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
