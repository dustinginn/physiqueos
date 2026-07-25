import { describe,expect,it } from "vitest";
import { assessOverallGoalCompleteness,interpretGoalOutcome } from "./GoalOutcomeInterpretationService";

describe("deterministic overall-goal interpretation",()=>{
 it.each(["Build 10 lb of lean mass","Gain ten pounds of lean mass"])("normalizes %s",value=>{expect(interpretGoalOutcome(value)).toMatchObject({status:"interpreted",target:{type:"numeric_change",metric:"lean_mass",direction:"increase",amount:10,unit:"lb",description:value}})});
 it.each([
  ["Build lean mass","amount"],
  ["Build 10 lb","metric"],
  ["Build 10 of lean mass","unit"],
  ["Feel better","metric"],
 ])("requires clarification for %s",(value,missing)=>{const result=interpretGoalOutcome(value);expect(result.status).toBe("clarification_required");expect(result.missingFields).toContain(missing);expect(result.target).toBeNull()});
 it("requires a coherent target and both explicit dates",()=>{const plan={target:{type:"numeric_change",metric:"lean_mass",direction:"increase",amount:10,unit:"lb",description:"Build 10 lb of lean mass",targetDate:"2026-10-31"},timeline:{mode:"target_date",startDate:"2026-07-20",targetDate:"2026-10-31"}};expect(assessOverallGoalCompleteness(plan)).toEqual({complete:true,missingFields:[],message:null});expect(assessOverallGoalCompleteness({...plan,timeline:{...plan.timeline,startDate:null}})).toMatchObject({complete:false,missingFields:["timeline.startDate"]})});
});
