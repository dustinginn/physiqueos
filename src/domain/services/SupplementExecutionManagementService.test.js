import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSupplementExecutionDraftFromFormData, createSupplementExecutionHydrationModel, createSupplementExecutionManagementService, formatSupplementExecutionSummary, validateSupplementExecutionDraft } from "./SupplementExecutionManagementService";

describe("Supplement Execution management", () => {
  it("atomically creates then updates one stable record without changing strategy state", async () => {
    const fixture=setup();
    const strategyBefore=JSON.stringify({protocols:fixture.live.protocols,versions:fixture.live.protocolVersions});
    const created=await fixture.service.save(command());
    expect(created).toMatchObject({outcome:"success",created:true,executionRevision:1});
    expect(fixture.live.executionItems).toHaveLength(1);
    const updated=await fixture.service.save(command({expectedRevision:1,draft:draft({priority:"high"})}));
    expect(updated).toMatchObject({outcome:"success",created:false,executionRevision:2,executionId:created.executionId});
    expect(fixture.live.executionItems).toHaveLength(1);
    expect(JSON.stringify({protocols:fixture.live.protocols,versions:fixture.live.protocolVersions})).toBe(strategyBefore);
  });
  it("rejects unchanged and stale saves without writes", async () => {
    const fixture=setup();await fixture.service.save(command());
    const before=fs.readFileSync(fixture.file,"utf8");
    expect((await fixture.service.save(command({expectedRevision:1}))).outcome).toBe("unchanged");
    expect((await fixture.service.save(command({expectedRevision:0,draft:draft({priority:"high"})}))).outcome).toBe("version_conflict");
    expect(fs.readFileSync(fixture.file,"utf8")).toBe(before);
  });
  it("validates schedules, times, date ranges, and non-overlapping timelines", () => {
    expect(validateSupplementExecutionDraft(draft({preferredSchedule:{daysOfWeek:[],timeOfDay:"25:90",startDate:"2026-08-02",endDate:"2026-08-01"}}))).toEqual(expect.arrayContaining(["Choose a valid local time.","End date must follow start date."]));
    const invalid=draft({timeline:[
      {startDate:"2026-08-01",endDate:"2026-08-10",dose:{amount:"1",unit:"capsule"}},
      {startDate:"2026-08-10",endDate:null,dose:{amount:"2",unit:"capsules"}},
    ]});
    expect(validateSupplementExecutionDraft(invalid)).toContain("Timeline phases cannot overlap.");
  });
  it("formats natural summaries and keeps a fixed schedule timeline-optional", async () => {
    expect(formatSupplementExecutionSummary(null)).toBe("Not configured");
    expect(formatSupplementExecutionSummary(draft())).toBe("Daily · Morning");
    expect(validateSupplementExecutionDraft(draft())).toEqual([]);
  });
  it("supports every other day from a required start-date anchor", async () => {
    const missingStart=draft({cadence:{type:"every_other_day"},preferredSchedule:{daysOfWeek:[],timeOfDay:"morning",startDate:"",endDate:null}});
    expect(validateSupplementExecutionDraft(missingStart)).toContain("Choose a start date for every-other-day scheduling.");
    const everyOtherDay=draft({cadence:{type:"every_other_day"},preferredSchedule:{daysOfWeek:[],timeOfDay:"17:00",startDate:"2026-07-25",endDate:null}});
    expect(validateSupplementExecutionDraft(everyOtherDay)).toEqual([]);
    expect(formatSupplementExecutionSummary(everyOtherDay)).toBe("Every other day · 5:00 PM");
    const fixture=setup();
    expect(await fixture.service.save(command({draft:everyOtherDay}))).toMatchObject({outcome:"success",created:true});
    expect(fixture.live.executionItems[0]).toMatchObject({cadence:{type:"every_other_day"},preferredSchedule:{startDate:"2026-07-25",daysOfWeek:[]}});
  });
  it("updates an existing blank-dose record to every other day using the same identity", async () => {
    const fixture=setup();
    const initial=draft({dose:{amount:"",unit:""},preferredSchedule:{daysOfWeek:[],timeOfDay:"morning",startDate:"",endDate:null}});
    const created=await fixture.service.save(command({draft:initial}));
    const everyOtherDay=draft({dose:{amount:"",unit:""},cadence:{type:"every_other_day"},preferredSchedule:{daysOfWeek:[],timeOfDay:"morning",startDate:"2026-07-25",endDate:null}});
    const updated=await fixture.service.save(command({expectedRevision:created.executionRevision,draft:everyOtherDay}));
    expect(updated).toMatchObject({outcome:"success",created:false,executionId:created.executionId,executionRevision:2});
    expect(fixture.live.executionItems).toHaveLength(1);
    expect(fixture.live.executionItems[0]).toMatchObject({id:created.executionId,cadence:{type:"every_other_day"},dose:{amount:"",unit:""},preferredSchedule:{startDate:"2026-07-25",endDate:null}});
  });
  it("maps the editor value and accepted aliases to one canonical cadence", () => {
    for (const value of ["every_other_day","every-other-day","every other day"]) {
      const form=new FormData();
      Object.entries({cadence:value,timing:"morning",startDate:"2026-07-25",endDate:"",reminderPreference:"none",priority:"normal"}).forEach(([key,item])=>form.set(key,item));
      const mapped=buildSupplementExecutionDraftFromFormData(form);
      expect(mapped).toMatchObject({cadence:{type:"every_other_day"},preferredSchedule:{startDate:"2026-07-25",endDate:null},dose:{amount:"",unit:""}});
      expect(validateSupplementExecutionDraft(mapped)).toEqual([]);
    }
  });
  it.each([
    ["Fadogia Agrestis","existing","every_other_day","morning","2026-07-25"],
    ["Tongkat Ali","existing","every_other_day","morning","2026-07-25"],
    ["Multivitamin","create","daily","morning",""],
    ["Electrolytes","create","daily","with_breakfast",""],
  ])("characterizes the Founder %s %s path", async (name,branch,cadence,timing,startDate) => {
    const fixture=setup();
    fixture.live.protocols[0].name=name;
    if(branch==="existing"){
      fixture.live.executionItems.push(existingExecution({cadence:branch==="existing"&&name.startsWith("Fadogia")?"every_other_day":"daily",startDate:name.startsWith("Fadogia")?"2026-07-25":"",timing:"morning"}));
    }
    fs.writeFileSync(fixture.file,JSON.stringify(fixture.live));
    const strategyBefore=JSON.stringify({protocols:fixture.live.protocols,versions:fixture.live.protocolVersions});
    const saved=await fixture.service.save(command({
      expectedRevision:branch==="existing"?1:null,
      draft:draft({dose:{amount:"",unit:""},cadence:{type:cadence},preferredSchedule:{daysOfWeek:[],timeOfDay:timing,startDate,endDate:null},notes:`${name} schedule`}),
    }));
    expect(saved).toMatchObject({outcome:"success",created:branch==="create",executionId:"execution_supplement_supplement"});
    expect(fixture.live.executionItems).toHaveLength(1);
    expect(fixture.live.executionItems[0]).toMatchObject({cadence:{type:cadence},preferredSchedule:{timeOfDay:timing,startDate},executionRevision:branch==="existing"?2:1});
    expect(JSON.stringify({protocols:fixture.live.protocols,versions:fixture.live.protocolVersions})).toBe(strategyBefore);
  });
  it("keeps Electrolytes root timing as a compatibility hint, not configured Execution", () => {
    const hydration=createSupplementExecutionHydrationModel({
      protocol:{name:"Electrolytes",schedule:{type:"daily",frequency:"daily",timeOfDay:"morning"},frequency:{interval:1,unit:"day"},dose:{value:null,unit:""}},
    });
    expect(hydration).toMatchObject({
      configured:false,source:"unconfigured",executionRevision:null,
      draft:{cadence:{type:"daily"},preferredSchedule:{timeOfDay:"morning",startDate:""},dose:{amount:"",unit:""}},
      legacyHints:{cadence:"daily",timing:"morning"},
    });
  });
  it("makes canonical Execution authoritative over legacy root hints", () => {
    const record=existingExecution({cadence:"every_other_day",timing:"with_breakfast",startDate:"2026-07-25"});
    const hydration=createSupplementExecutionHydrationModel({
      executionItem:record,
      protocol:{schedule:{type:"daily",timeOfDay:"morning"}},
    });
    expect(hydration).toMatchObject({configured:true,source:"canonical_execution",draft:{cadence:{type:"every_other_day"},preferredSchedule:{timeOfDay:"with_breakfast"}}});
    expect(hydration.legacyHints).toBeNull();
  });
  it("normalizes timing and meal-context aliases centrally", () => {
    for(const [input,expected] of [["With breakfast","with_breakfast"],["breakfast","with_breakfast"],["Before bed","before_bed"],["night","before_bed"],["17:00","17:00"]]){
      expect(validateSupplementExecutionDraft(draft({preferredSchedule:{daysOfWeek:[],timeOfDay:input,startDate:"",endDate:null}}))).toEqual([]);
      const form=new FormData();Object.entries({cadence:"daily",timing:input,startDate:"",endDate:"",reminderPreference:"none",priority:"normal"}).forEach(([key,value])=>form.set(key,value));
      expect(buildSupplementExecutionDraftFromFormData(form).preferredSchedule.timeOfDay).toBe(expected);
    }
  });
  it("keeps the supplement cadence picker additive", () => {
    const source=fs.readFileSync(path.join(process.cwd(),"src/screens/SupplementExecutionEditorScreen.jsx"),"utf8");
    ["Daily","Every other day","Specific days","Weekly","As needed","Custom"].forEach((label)=>expect(source).toContain(`\"${label}\"`));
  });
  it("rolls back injected failures exactly", async () => {
    const fixture=setup({faults:{afterWrite(){throw new Error("injected");}}});
    const before=fs.readFileSync(fixture.file,"utf8");
    expect((await fixture.service.save(command())).outcome).toBe("persistence_failure");
    expect(fixture.live.executionItems).toEqual([]);
    expect(fs.readFileSync(fixture.file,"utf8")).toBe(before);
  });
});
function setup({faults={}}={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),"supplement-execution-"));const file=path.join(dir,"runtime.json");const live={version:"test",revision:0,protocols:[{id:"supplement",userId:"founder",category:"supplement",status:"active",currentVersionId:"supplement_v1",currentGoalIds:["goal"],relatedGoalIds:["goal"]}],protocolVersions:[{id:"supplement_v1",protocolId:"supplement",status:"active",endedAt:null}],goals:[{id:"goal",userId:"founder",status:"active"}],executionItems:[]};fs.writeFileSync(file,JSON.stringify(live));return{file,live,service:createSupplementExecutionManagementService({runtimeStorePath:file,liveStore:live,faults,now:()=>new Date("2026-07-25T12:00:00Z")})};}
function command(overrides={}){return{protocolId:"supplement",supplementVersionId:"supplement_v1",userId:"founder",goalId:"goal",expectedRevision:null,author:{type:"user",id:"founder",displayName:"Founder"},draft:draft(),...overrides};}
function draft(overrides={}){return{dose:{amount:"400",unit:"mg"},cadence:{type:"daily"},preferredSchedule:{daysOfWeek:[],timeOfDay:"morning",startDate:"2026-07-25",endDate:null},reminderPreference:"none",priority:"normal",notes:"",timeline:[],...overrides};}
function existingExecution({cadence="daily",timing="morning",startDate=""}={}){return{id:"execution_supplement_supplement",userId:"founder",type:"supplement",title:"Supplement",active:true,protocolRootId:"supplement",supplementVersionId:"supplement_v1",linkedStrategyIds:["supplement"],linkedGoalIds:["goal"],dose:{amount:"",unit:""},cadence:{type:cadence},preferredSchedule:{daysOfWeek:[],timeOfDay:timing,startDate,endDate:null},reminderPreference:"none",priority:"normal",notes:"",timeline:[],executionRevision:1,author:{type:"user",id:"founder",displayName:"Founder"},createdAt:"2026-07-25T00:00:00Z",updatedAt:"2026-07-25T00:00:00Z"};}
