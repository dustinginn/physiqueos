import fs from "node:fs";
import path from "node:path";
import { describe,expect,it } from "vitest";
import { buildPeptideExecutionDraftFromFormData,createPeptideExecutionHydrationModel,validatePeptideExecutionDraft } from "../domain/services/PeptideExecutionManagementService";

describe("peptide Execution save and hydration boundary",()=>{
  it("maps schedule-only FormData into the canonical shared shape",()=>{
    const form=new FormData();
    Object.entries({cadence:"specific_days",days:"sunday,monday,tuesday,wednesday,thursday",timing:"specific",specificTime:"21:45",startDate:"2026-05-24",endDate:"",timingContext:"fasted_before_bed",reminderPreference:"remind",priority:"normal",notes:"",timelineOperation:"replace",timelineJson:"[]"}).forEach(([key,value])=>form.set(key,value));
    const draft=buildPeptideExecutionDraftFromFormData(form);
    expect(draft).toEqual({cadence:{type:"specific_days"},preferredSchedule:{daysOfWeek:["sunday","monday","tuesday","wednesday","thursday"],timeOfDay:"21:45",startDate:"2026-05-24",endDate:null},timingContext:"fasted_before_bed",reminderPreference:"remind",priority:"normal",notes:"",timelineOperation:"replace",timeline:[]});
    expect(validatePeptideExecutionDraft(draft)).toEqual([]);
  });
  it("hydrates a committed canonical record without resetting optional values",()=>{
    const item={executionRevision:4,cadence:{type:"weekly"},preferredSchedule:{daysOfWeek:["thursday"],timeOfDay:"21:45",startDate:"2026-05-21",endDate:null},timingContext:"fasted_before_bed",reminderPreference:"none",priority:"low",notes:"Saved note",timeline:[]};
    expect(createPeptideExecutionHydrationModel({executionItem:item,protocol:{}})).toMatchObject({configured:false,executionRevision:4,draft:{cadence:item.cadence,preferredSchedule:item.preferredSchedule,timingContext:item.timingContext,reminderPreference:"none",priority:"low",notes:"Saved note",timeline:[]}});
  });
  it("preserves drafts on failures and performs one success redirect",()=>{
    const action=fs.readFileSync(path.join(process.cwd(),"src/app/profile/operating-plan/execution/peptides/[protocolId]/actions.js"),"utf8");
    expect(action).toMatch(/values:\s*draft/);
    expect(action.match(/redirect\(path\)/g)).toHaveLength(1);
    expect(action).toContain('revalidatePath("/profile/operating-plan", "page")');
    expect(action).toContain('revalidatePath("/", "page")');
    expect(action).toContain("/priorities/${encodeURIComponent(reminder.id)}");
    expect(action).not.toMatch(/router\.(push|replace|refresh)/);
  });
  it("contains no peptide-name or protocol-ID save branches",()=>{
    const service=fs.readFileSync(path.join(process.cwd(),"src/domain/services/PeptideExecutionManagementService.js"),"utf8");
    expect(service).not.toMatch(/Retatrutide|Tesamorelin|protocol_retatrutide|protocol_tesamorelin/);
  });
  it("maps an open-ended predecessor to actionable viewer copy",()=>{
    const action=fs.readFileSync(path.join(process.cwd(),"src/app/profile/operating-plan/execution/peptides/[protocolId]/actions.js"),"utf8");
    expect(action).toContain("Add an end date to the previous phase before adding another phase.");
  });
});
