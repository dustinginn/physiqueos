import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe,expect,it } from "vitest";
import { applyPreparedPeptideExecutionTransition,buildPeptideExecutionDraftFromFormData,buildPeptideSupportDraft,classifyPeptideExecutionState,createPeptideExecutionHydrationModel,createPeptideExecutionManagementService,createPeptideSupportHydrationModel,formatPeptideExecutionSummary,PEPTIDE_TIMELINE_HISTORY_LIMIT,PeptideExecutionOutcome,PeptideExecutionRejectionCode,PeptideExecutionState,preparePeptideExecutionTransition,preparePeptideLifecycleTransition,resolvePeptideDose,resolvePeptideLifecycleState,validatePeptideExecutionDraft,verifyPreparedPeptideExecutionTransition } from "./PeptideExecutionManagementService";
import { composeTimelineWithStrategy,generatePeptideDosingTimeline,hydratePeptideDosingStrategy } from "../models/PeptideDosingStrategyModel";

describe("shared peptide Execution",()=>{
  it("keeps Web's transaction behavior identical to the extracted pure transition",async()=>{const fixture=setup("Retatrutide",["thursday"],true);const requested=command(fixture,{expectedRevision:1,draft:draft(["thursday"],{priority:"high"})});const candidate=structuredClone(fixture.live);const prepared=preparePeptideExecutionTransition(candidate,requested,new Date("2026-07-25T12:00:00Z"));expect(prepared.ok).toBe(true);const direct=applyPreparedPeptideExecutionTransition(candidate,prepared);expect(verifyPreparedPeptideExecutionTransition(candidate,prepared)).toBe(true);const web=await fixture.service.save(requested);expect(web).toMatchObject({outcome:"success",...direct});expect(fixture.live.executionItems).toEqual(candidate.executionItems);});
  it.each([["Retatrutide",["thursday"]],["Tesamorelin",["sunday","monday","tuesday","wednesday","thursday"]]])("uses one service for %s and preserves the stable legacy record on a schedule-only save",async(name,days)=>{const fixture=setup(name,days,true);const result=await fixture.service.save(command(fixture,{expectedRevision:1,draft:draft(days,{timeline:[]})}));expect(result).toMatchObject({outcome:"success",created:false,executionId:`execution_${name.toLowerCase()}`});expect(fixture.live.executionItems).toHaveLength(1);expect(fixture.live.executionItems[0]).toMatchObject({type:"peptide",protocolRootId:"peptide",executionRevision:2,timeline:[]});});
  it("creates then updates one protocol-root-owned record",async()=>{const fixture=setup("Retatrutide",["thursday"]);const created=await fixture.service.save(command(fixture));const updated=await fixture.service.save(command(fixture,{expectedRevision:1,draft:draft(["thursday"],{priority:"high"})}));expect(created).toMatchObject({outcome:"success",created:true});expect(updated).toMatchObject({outcome:"success",created:false,executionId:created.executionId});expect(fixture.live.executionItems).toHaveLength(1);});
  it("accepts an empty timeline but rejects invalid configured phases",()=>{expect(validatePeptideExecutionDraft(draft(["thursday"],{timeline:[]}))).toEqual([]);expect(validatePeptideExecutionDraft(draft(["thursday"],{timeline:[phase("2026-07-01",null),phase("2026-07-08",null)]}))).toContain("Only the final dosing phase can continue until changed.");expect(validatePeptideExecutionDraft(draft(["thursday"],{timeline:[phase("2026-07-01","2026-07-10"),phase("2026-07-10",null)]}))).toContain("Dosing phases cannot overlap.");});
  it("resolves current and next doses using an explicit local date",()=>{const item=draft(["thursday"],{timeline:[phase("2026-07-01","2026-07-25","2"),phase("2026-07-26",null,"1.5")]});expect(resolvePeptideDose(item,"2026-07-25")).toMatchObject({current:{dose:{amount:"2"}},next:{dose:{amount:"1.5"}}});expect(formatPeptideExecutionSummary(item,"2026-07-25")).toBe("Thu · 9:45 PM · 2 mg");});
  it("normalizes a legacy leading-decimal amount in user-facing summaries",()=>{expect(formatPeptideExecutionSummary(draft(["thursday"],{timeline:[phase("2026-07-01",null,".5")]}),"2026-07-25")).toBe("Thu · 9:45 PM · 0.5 mg");});
  it("hydrates authoritative schedules but does not manufacture a timeline",()=>{const model=createPeptideExecutionHydrationModel({protocol:{startDate:"2026-05-24",schedule:{type:"weekly_days",daysOfWeek:["sunday","monday"],timeOfDay:"night",timingContext:"fasted_before_bed"}}});expect(model).toMatchObject({configured:false,draft:{cadence:{type:"specific_days"},preferredSchedule:{daysOfWeek:["sunday","monday"],timeOfDay:"before_bed"},timingContext:"fasted_before_bed",timeline:[]}});});
  it.each([
    ["Retatrutide","weekly",["thursday"],"2026-05-21"],
    ["Tesamorelin","specific_days",["sunday","monday","tuesday","wednesday","thursday"],"2026-05-24"],
  ])("hydrates the compatible legacy %s record with protocol context",(name,cadence,days,startDate)=>{const protocol={name,startDate,schedule:{type:name==="Retatrutide"?"weekly":"weekly_days",daysOfWeek:days,timeOfDay:"night",timingContext:"fasted_before_bed"}};const executionItem={id:`execution_${name.toLowerCase()}`,type:"protocol",title:name,cadence:{type:name==="Retatrutide"?"weekly":"specific_weekdays"},preferredSchedule:{daysOfWeek:days,timeOfDay:"21:45"},reminderPreference:"in_app",notes:"",timeline:[]};expect(createPeptideExecutionHydrationModel({executionItem,protocol})).toMatchObject({configured:false,executionRevision:1,draft:{cadence:{type:cadence},preferredSchedule:{daysOfWeek:days,timeOfDay:"21:45",startDate},timingContext:"fasted_before_bed",timeline:[]}});});
  it("rejects unchanged and stale commands without writes",async()=>{const fixture=setup("Retatrutide",["thursday"]);await fixture.service.save(command(fixture));const before=fs.readFileSync(fixture.file,"utf8");expect((await fixture.service.save(command(fixture,{expectedRevision:1}))).outcome).toBe("unchanged");expect((await fixture.service.save(command(fixture,{expectedRevision:0,draft:draft(["thursday"],{priority:"high"})}))).outcome).toBe("version_conflict");expect(fs.readFileSync(fixture.file,"utf8")).toBe(before);});
  it("rolls back an injected persistence failure exactly",async()=>{const fixture=setup("Retatrutide",["thursday"],false,{afterWrite(){throw new Error("fail");}});const before=fs.readFileSync(fixture.file,"utf8");expect((await fixture.service.save(command(fixture))).outcome).toBe("persistence_failure");expect(fs.readFileSync(fixture.file,"utf8")).toBe(before);expect(fixture.live.executionItems).toEqual([]);});
  it.each(["Retatrutide","Tesamorelin"])("round-trips configured %s phases through one JSON parser",async(name)=>{const days=name==="Retatrutide"?["thursday"]:["sunday","monday","tuesday","wednesday","thursday"];const fixture=setup(name,days,true);const phases=[phase("2026-07-01","2026-07-07","0.5"),phase("2026-07-08",null,"1")];const form=formData(days,phases);const parsed=buildPeptideExecutionDraftFromFormData(form);expect(parsed.timeline).toEqual(phases);expect(validatePeptideExecutionDraft(parsed)).toEqual([]);const result=await fixture.service.save(command(fixture,{expectedRevision:1,draft:parsed}));expect(result).toMatchObject({outcome:"success",executionId:`execution_${name.toLowerCase()}`});expect(fixture.live.executionItems[0].timeline).toEqual(phases);const hydrated=createPeptideExecutionHydrationModel({executionItem:fixture.live.executionItems[0],protocol:fixture.live.protocols[0]});expect(hydrated.draft.timeline).toEqual(phases);});
  it("distinguishes omitted, explicit empty, and configured replacement timelines",async()=>{const fixture=setup("Retatrutide",["thursday"],true);const original=fixture.live.executionItems[0].timeline;const preserved=await fixture.service.save(command(fixture,{expectedRevision:1,draft:draft(["thursday"],{timelineOperation:"preserve",timeline:[],priority:"high"})}));expect(preserved.outcome).toBe("success");expect(fixture.live.executionItems[0].timeline).toEqual(original);const replacedPhases=[phase("2026-08-01",null,"1.5")];const replaced=await fixture.service.save(command(fixture,{expectedRevision:2,draft:draft(["thursday"],{timelineOperation:"replace",timeline:replacedPhases})}));expect(replaced.outcome).toBe("success");expect(fixture.live.executionItems[0].timeline).toEqual(replacedPhases);const cleared=await fixture.service.save(command(fixture,{expectedRevision:3,draft:draft(["thursday"],{timelineOperation:"replace",timeline:[]})}));expect(cleared.outcome).toBe("success");expect(fixture.live.executionItems[0].timeline).toEqual([]);});
  it.each([
    ["one closed",[phase("2026-07-01","2026-07-07")],[]],
    ["one open",[phase("2026-07-01",null)],[]],
    ["multiple closed",[phase("2026-07-01","2026-07-07"),phase("2026-07-08","2026-07-14")],[]],
    ["last open",[phase("2026-07-01","2026-07-07"),phase("2026-07-08",null)],[]],
    ["shared boundary overlap",[phase("2026-07-01","2026-07-08"),phase("2026-07-08",null)],["Dosing phases cannot overlap."]],
    ["after open",[phase("2026-07-01",null),phase("2026-07-08",null)],["Only the final dosing phase can continue until changed.","Dosing phases cannot overlap."]],
    ["missing dose",[{...phase("2026-07-01",null),dose:{amount:"",unit:"mg"}}],["Add a dose and unit for every phase."]],
    ["missing unit",[{...phase("2026-07-01",null),dose:{amount:"1",unit:""}}],["Add a dose and unit for every phase."]],
    ["invalid start",[phase("2026-02-30",null)],["Review each dosing phase and try again."]],
    ["invalid end",[phase("2026-07-10","2026-07-09")],["Check the start and end dates for each phase."]],
    ["invalid order",[phase("2026-07-08","2026-07-14"),phase("2026-07-01","2026-07-07")],["Arrange dosing phases in chronological order."]],
    ["duplicate",[phase("2026-07-01","2026-07-07"),phase("2026-07-01","2026-07-07")],["Review each dosing phase and try again."]],
  ])("validates the %s timeline case",(_label,timeline,expected)=>{const errors=validatePeptideExecutionDraft(draft(["thursday"],{timelineOperation:"replace",timeline}));expected.forEach((message)=>expect(errors).toContain(message));if(!expected.length)expect(errors).toEqual([]);});
  it("preserves date-only strings at timezone boundaries",()=>{const phases=[phase("2026-03-08","2026-03-14"),phase("2026-11-01",null)];const parsed=buildPeptideExecutionDraftFromFormData(formData(["thursday"],phases));expect(parsed.timeline.map((item)=>[item.startDate,item.endDate])).toEqual([["2026-03-08","2026-03-14"],["2026-11-01",null]]);});
  it("rejects malformed JSON as a typed validation result",async()=>{const fixture=setup("Retatrutide",["thursday"],true);const form=formData(["thursday"],[]);form.set("timelineJson","{bad");const result=await fixture.service.save(command(fixture,{expectedRevision:1,draft:buildPeptideExecutionDraftFromFormData(form)}));expect(result).toMatchObject({outcome:"invalid",committed:false,reason:"Review each dosing phase and try again."});});
  it.each(["Retatrutide","Tesamorelin"])("supports sequential %s timeline replacements using each authoritative revision",async(name)=>{const days=name==="Retatrutide"?["thursday"]:["sunday","monday","tuesday","wednesday","thursday"];const fixture=setup(name,days,true);fixture.live.executionItems[0].timeline=[];fs.writeFileSync(fixture.file,JSON.stringify(fixture.live));const stableId=fixture.live.executionItems[0].id;let revision=1;for(const timeline of [[phase("2026-07-01","2026-07-07")],[phase("2026-07-01","2026-07-07"),phase("2026-07-08","2026-07-14")],[phase("2026-07-01","2026-07-07"),phase("2026-07-08","2026-07-14"),phase("2026-07-15",null)]]){const parsed=buildPeptideExecutionDraftFromFormData(formData(days,timeline));const saved=await fixture.service.save(command(fixture,{expectedRevision:revision,draft:parsed}));revision+=1;expect(saved).toMatchObject({outcome:"success",executionId:stableId,executionRevision:revision});const authoritative=fixture.live.executionItems[0];expect(authoritative.timeline).toEqual(timeline);expect(createPeptideExecutionHydrationModel({executionItem:authoritative,protocol:fixture.live.protocols[0]}).draft.timeline).toEqual(timeline);}expect(fixture.live.executionItems).toHaveLength(1);});
  it("rejects a phase after Until changed, then succeeds after closing the previous phase",async()=>{const fixture=setup("Retatrutide",["thursday"],true);fixture.live.executionItems[0].timeline=[phase("2026-07-01",null)];fs.writeFileSync(fixture.file,JSON.stringify(fixture.live));const invalid=[phase("2026-07-01",null),phase("2026-07-08",null)];const rejected=await fixture.service.save(command(fixture,{expectedRevision:1,draft:draft(["thursday"],{timeline:invalid})}));expect(rejected).toMatchObject({outcome:"invalid",committed:false,reason:"Only the final dosing phase can continue until changed."});expect(fixture.live.executionItems[0].executionRevision).toBe(1);const valid=[phase("2026-07-01","2026-07-07"),phase("2026-07-08",null)];const saved=await fixture.service.save(command(fixture,{expectedRevision:1,draft:draft(["thursday"],{timeline:valid})}));expect(saved).toMatchObject({outcome:"success",executionRevision:2});expect(fixture.live.executionItems[0].timeline).toEqual(valid);});
  it("classifies unconfigured, legacy-compatible, canonical, and ambiguous states",()=>{const protocol={id:"peptide",userId:"founder",name:"Shared Peptide",category:"peptide"};expect(classifyPeptideExecutionState({protocol,executionItems:[]}).state).toBe(PeptideExecutionState.UNCONFIGURED);const legacy={id:"legacy",userId:"founder",type:"protocol",title:"Shared Peptide"};expect(classifyPeptideExecutionState({protocol,executionItems:[legacy]})).toMatchObject({state:PeptideExecutionState.LEGACY_COMPATIBLE,record:legacy});const canonical={...legacy,type:"peptide",protocolRootId:"peptide",executionRevision:1,cadence:{type:"weekly"},preferredSchedule:{},timeline:[]};expect(classifyPeptideExecutionState({protocol,executionItems:[canonical]}).state).toBe(PeptideExecutionState.CANONICAL);expect(classifyPeptideExecutionState({protocol,executionItems:[legacy,canonical]}).state).toBe(PeptideExecutionState.INVALID);});
  it("canonicalizes a Tesamorelin-shaped legacy record with one open-ended phase, then detects no changes",async()=>{const fixture=setup("Tesamorelin",["sunday","monday","tuesday","wednesday","thursday"],true);fixture.live.protocols[0].startDate="2026-05-24";fixture.live.protocols[0].schedule={type:"weekly_days",daysOfWeek:fixture.days,timeOfDay:"night",timingContext:"fasted_before_bed"};fixture.live.executionItems[0].timeline=undefined;delete fixture.live.executionItems[0].executionRevision;fs.writeFileSync(fixture.file,JSON.stringify(fixture.live));const hydration=createPeptideExecutionHydrationModel({executionItem:fixture.live.executionItems[0],protocol:fixture.live.protocols[0]});const timeline=[phase("2026-05-24",null)];const requested={...hydration.draft,timelineOperation:"replace",timeline};const saved=await fixture.service.save(command(fixture,{expectedRevision:1,draft:requested}));expect(saved).toMatchObject({outcome:"success",created:false,executionId:"execution_tesamorelin",executionRevision:1});expect(fixture.live.executionItems).toHaveLength(1);expect(fixture.live.executionItems[0]).toMatchObject({id:"execution_tesamorelin",type:"peptide",protocolRootId:"peptide",executionRevision:1,preferredSchedule:{startDate:"2026-05-24",timeOfDay:"21:45"},timingContext:"fasted_before_bed",timeline});expect(classifyPeptideExecutionState({protocol:fixture.live.protocols[0],executionItems:fixture.live.executionItems}).state).toBe(PeptideExecutionState.CANONICAL);const unchanged=await fixture.service.save(command(fixture,{expectedRevision:1,draft:requested}));expect(unchanged).toMatchObject({outcome:"unchanged",committed:false});});
});
function setup(name,days,legacy=false,faults={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),"peptide-execution-"));const file=path.join(dir,"runtime.json");const live={version:"test",revision:0,protocols:[{id:"peptide",userId:"founder",name,category:"peptide",status:"active",currentGoalIds:["goal"]}],executionItems:legacy?[{id:`execution_${name.toLowerCase()}`,userId:"founder",type:"protocol",title:name,cadence:{type:"specific_weekdays"},preferredSchedule:{daysOfWeek:days,timeOfDay:"21:45"},reminderPreference:"in_app",notes:"legacy",timeline:[phase("2026-05-01",null)],executionRevision:1}]:[]};fs.writeFileSync(file,JSON.stringify(live));return{file,live,days,service:createPeptideExecutionManagementService({runtimeStorePath:file,liveStore:live,faults,now:()=>new Date("2026-07-25T12:00:00Z")})};}
function command(fixture,overrides={}){return{protocolId:"peptide",userId:"founder",expectedRevision:null,draft:draft(fixture.days),author:{type:"user",id:"founder"},...overrides};}
function draft(days,overrides={}){return{cadence:{type:days.length===1?"weekly":"specific_days"},preferredSchedule:{daysOfWeek:days,timeOfDay:"21:45",startDate:"2026-05-01",endDate:null},timingContext:"fasted_before_bed",reminderPreference:"remind",priority:"normal",notes:"legacy",timeline:[phase("2026-05-01",null)],...overrides};}
function phase(startDate,endDate,amount="0.5"){return{startDate,endDate,dose:{amount,unit:"mg"},notes:""};}
function formData(days,timeline){const form=new FormData();Object.entries({cadence:days.length===1?"weekly":"specific_days",days:days.join(","),timing:"specific",specificTime:"21:45",startDate:"2026-05-01",endDate:"",timingContext:"fasted_before_bed",reminderPreference:"remind",priority:"normal",notes:"",timelineOperation:"replace",timelineJson:JSON.stringify(timeline)}).forEach(([key,value])=>form.set(key,value));return form;}

describe("history-preserving peptide saves (S1/S2)",()=>{
  it("changes the dose from today: frozen prefix byte-identical, one archive, revision bumped",()=>{
    const store=structuredStore();const before=structuredClone(store.executionItems[0].timeline);
    const prepared=prepare(store,{expectedRevision:1,today:TODAY,draft:supportDraft({dosingStrategy:stay("1.5",TODAY)})});
    expect(prepared.ok).toBe(true);
    const item=commit(store,prepared);
    expect(item.timeline.slice(0,4)).toEqual(before.slice(0,4));
    expect(item.timeline[4]).toEqual({...before[4],endDate:"2026-07-24"});
    expect(item.timeline[5]).toEqual({startDate:TODAY,endDate:null,dose:{amount:"1.5",unit:"mg"},notes:""});
    expect(item.timeline).toHaveLength(6);
    expect(item.timelineHistory).toEqual([{archivedAt:"2026-07-25T12:00:00.000Z",executionRevision:1,timeline:before}]);
    expect(item.executionRevision).toBe(2);
    expect(item.dosingStrategy).toMatchObject({pattern:"stay",startDate:TODAY,startingDose:{amount:"1.5",unit:"mg"}});
    expect(hydratePeptideDosingStrategy(item)).toMatchObject({mode:"structured",generated:[item.timeline[5]]});
    expect(createPeptideSupportHydrationModel({executionItem:item,protocol:store.protocols[0]})).toMatchObject({dosingMode:"structured",lifecycle:{state:"active",since:null,history:[]},scheduleSuspensions:[]});
  });
  it("changes the dose from a future date, keeping every phase that started before it",()=>{
    const store=structuredStore();const before=structuredClone(store.executionItems[0].timeline);
    const item=commit(store,prepare(store,{expectedRevision:1,today:TODAY,draft:supportDraft({dosingStrategy:stay("1.5","2026-08-13")})}));
    expect(item.timeline.slice(0,6)).toEqual(before.slice(0,6));
    expect(item.timeline[6]).toEqual({...before[6],endDate:"2026-08-12"});
    expect(item.timeline[7]).toMatchObject({startDate:"2026-08-13",endDate:null,dose:{amount:"1.5",unit:"mg"}});
    expect(validatePeptideExecutionDraft({...supportDraft(),timeline:item.timeline})).toEqual([]);
  });
  it("changes the dose on a phase-transition day without a malformed frozen phase",()=>{
    const store=structuredStore();const before=structuredClone(store.executionItems[0].timeline);
    const item=commit(store,prepare(store,{expectedRevision:1,today:TODAY,draft:supportDraft({dosingStrategy:stay("1.5","2026-07-30")})}));
    expect(item.timeline.slice(0,5)).toEqual(before.slice(0,5));
    expect(item.timeline[5]).toMatchObject({startDate:"2026-07-30",endDate:null,dose:{amount:"1.5",unit:"mg"}});
    expect(item.timeline).toHaveLength(6);
    expect(item.timeline.every((phase)=>!phase.endDate||phase.endDate>=phase.startDate)).toBe(true);
  });
  it("is idempotent twice in one day and replaces only the tail on a second different dose",()=>{
    const store=structuredStore();
    commit(store,prepare(store,{expectedRevision:1,today:TODAY,draft:supportDraft({dosingStrategy:stay("1.5",TODAY)})}));
    const repeated=prepare(store,{expectedRevision:2,today:TODAY,draft:supportDraft({dosingStrategy:stay("1.5",TODAY)})});
    expect(repeated).toMatchObject({ok:false,outcome:PeptideExecutionOutcome.UNCHANGED});
    const first=structuredClone(store.executionItems[0].timeline);
    const item=commit(store,prepare(store,{expectedRevision:2,today:TODAY,draft:supportDraft({dosingStrategy:stay("1.75",TODAY)})}));
    expect(item.timeline.slice(0,5)).toEqual(first.slice(0,5));
    expect(item.timeline[5]).toMatchObject({startDate:TODAY,dose:{amount:"1.75"}});
    expect(item.timeline).toHaveLength(6);
    expect(item.timelineHistory).toHaveLength(2);
    expect(item.executionRevision).toBe(3);
  });
  it("refuses a backdated plan that changes a phase already taken unless the draft rewrites history explicitly",()=>{
    const store=structuredStore();
    const backdated=supportDraft({dosingStrategy:{...PLAN,stepAmount:"0.5"}});
    const refused=prepare(store,{expectedRevision:1,today:TODAY,draft:backdated});
    expect(refused).toMatchObject({ok:false,outcome:PeptideExecutionOutcome.INVALID,code:PeptideExecutionRejectionCode.PLAN_REWRITES_HISTORY});
    expect(store.executionItems[0].executionRevision).toBe(1);
    const item=commit(store,prepare(store,{expectedRevision:1,today:TODAY,draft:{...backdated,rewriteHistory:true}}));
    expect(item.timeline[1]).toMatchObject({startDate:"2026-05-28",dose:{amount:"0.75"}});
    expect(item.timelineHistory).toHaveLength(1);
  });
  it("accepts a future-only change to a past-dated plan (landing dose) without rewriteHistory and archives one entry",()=>{
    const store=structuredStore();const before=structuredClone(store.executionItems[0].timeline);
    const prepared=prepare(store,{expectedRevision:1,today:TODAY,draft:supportDraft({dosingStrategy:{...PLAN,landingDose:"0.5"}})});
    expect(prepared.ok).toBe(true);
    const item=commit(store,prepared);
    expect(item.timeline.slice(0,5)).toEqual(before.slice(0,5));
    expect(item.timeline.at(-1)).toMatchObject({startDate:"2026-07-30",endDate:null,dose:{amount:"0.5"}});
    expect(item.timeline).toHaveLength(6);
    expect(item.timelineHistory).toHaveLength(1);
    expect(hydratePeptideDosingStrategy(item).mode).toBe("structured");
  });
  it("accepts an end-date-only change on a past-dated plan without rewriteHistory and archives one entry",()=>{
    const store=structuredStore();const before=structuredClone(store.executionItems[0].timeline);
    const prepared=prepare(store,{expectedRevision:1,today:TODAY,draft:supportDraft({dosingStrategy:{...PLAN,endDate:"2026-12-31"}})});
    expect(prepared.ok).toBe(true);
    const item=commit(store,prepared);
    expect(item.timeline.slice(0,-1)).toEqual(before.slice(0,-1));
    expect(item.timeline.at(-1)).toEqual({...before.at(-1),endDate:"2026-12-31"});
    expect(item.timelineHistory).toHaveLength(1);
    expect(hydratePeptideDosingStrategy(item).mode).toBe("structured");
  });
  it("accepts a first-time configuration with a past start date",()=>{
    const store=structuredStore();store.executionItems=[];
    const prepared=prepare(store,{expectedRevision:null,today:TODAY,draft:supportDraft()});
    expect(prepared).toMatchObject({ok:true,created:true});
    const item=commit(store,prepared);
    expect(item.timeline).toEqual(generatePeptideDosingTimeline(PLAN));
    expect(item.timelineHistory).toBeUndefined();
  });
  it("refuses a backdated stay that changes a past phase, and accepts it with rewriteHistory",()=>{
    const store=structuredStore();
    const backdated=supportDraft({dosingStrategy:stay("1.5","2026-07-01")});
    expect(prepare(store,{expectedRevision:1,today:TODAY,draft:backdated})).toMatchObject({ok:false,outcome:PeptideExecutionOutcome.INVALID,code:PeptideExecutionRejectionCode.PLAN_REWRITES_HISTORY});
    expect(store.executionItems[0].executionRevision).toBe(1);
    const item=commit(store,prepare(store,{expectedRevision:1,today:TODAY,draft:{...backdated,rewriteHistory:true}}));
    expect(item.timeline.at(-1)).toEqual({startDate:"2026-07-01",endDate:null,dose:{amount:"1.5",unit:"mg"},notes:""});
    expect(item.timeline.at(-2).endDate).toBe("2026-06-30");
    expect(item.timelineHistory).toHaveLength(1);
  });
  it("re-saves a single-phase record with amount 2.0 and no dosingStrategy (synthesized stay) as a notes-only edit that stays structured",()=>{
    const store=structuredStore();
    const record=store.executionItems[0];delete record.dosingStrategy;
    record.timeline=[{startDate:"2026-05-21",endDate:null,dose:{amount:"2.0",unit:"mg"},notes:""}];
    const hydration=createPeptideSupportHydrationModel({executionItem:record,protocol:store.protocols[0],reminder:store.reminders[0]});
    expect(hydration.dosingMode).toBe("structured");
    expect(hydration.dosingStrategy).toMatchObject({pattern:"stay",startingDose:{amount:"2",unit:"mg"},startDate:"2026-05-21"});
    const prepared=prepare(store,{expectedRevision:1,today:TODAY,draft:supportDraft({dosingStrategy:hydration.dosingStrategy,notes:"Rotate injection sites"})});
    expect(prepared.ok).toBe(true);
    const item=commit(store,prepared);
    expect(item.notes).toBe("Rotate injection sites");
    expect(item.timeline).toEqual([{startDate:"2026-05-21",endDate:null,dose:{amount:"2",unit:"mg"},notes:""}]);
    expect(hydratePeptideDosingStrategy(item).mode).toBe("structured");
    expect(createPeptideSupportHydrationModel({executionItem:item,protocol:store.protocols[0],reminder:store.reminders[0]}).dosingMode).toBe("structured");
  });
  it("accepts a full save whose past-dated strategy reproduces the stored plan (notes-only edit)",()=>{
    const store=structuredStore();const before=structuredClone(store.executionItems[0].timeline);
    const item=commit(store,prepare(store,{expectedRevision:1,today:TODAY,draft:supportDraft({notes:"Rotate injection sites"})}));
    expect(item.timeline).toEqual(before);
    expect(item.notes).toBe("Rotate injection sites");
    expect(item.timelineHistory).toBeUndefined();
    expect(prepare(store,{expectedRevision:2,today:TODAY,draft:supportDraft({notes:"Rotate injection sites"})})).toMatchObject({ok:false,outcome:PeptideExecutionOutcome.UNCHANGED});
  });
  it.each([
    ["day-of-week",{supportSchedule:{daysOfWeek:["friday"]}}],
    ["time",{supportSchedule:{specificTime:"20:30"}}],
    ["reminder off",{reminderPreference:"none"}],
    ["notes",{notes:"Different note"}],
  ])("keeps the timeline and reminder history on a %s change",(_label,overrides)=>{
    const store=structuredStore();const before=structuredClone(store.executionItems[0].timeline);const history=structuredClone(store.reminders[0].completionHistory);
    const prepared=prepare(store,{expectedRevision:1,today:TODAY,draft:supportDraft(overrides)});
    expect(prepared.ok).toBe(true);
    const item=commit(store,prepared);
    expect(item.timeline).toEqual(before);
    expect(item.timelineHistory).toBeUndefined();
    expect(store.reminders[0].completionHistory).toEqual(history);
    expect(store.reminders[0].completedAt).toBe("2026-07-23T21:50:00.000Z");
    if(overrides.reminderPreference==="none"){expect(store.reminders[0].active).toBe(false);
      const on=commit(store,prepare(store,{expectedRevision:2,today:TODAY,draft:supportDraft()}));
      expect(on.timeline).toEqual(before);expect(store.reminders[0].active).toBe(true);expect(store.reminders[0].completionHistory).toEqual(history);}
  });
  it("supports an explicit end date and an open end on a stay strategy",()=>{
    const store=structuredStore();
    const ended=commit(store,prepare(store,{expectedRevision:1,today:TODAY,draft:supportDraft({dosingStrategy:{...stay("1.5",TODAY),endDate:"2026-09-30"}})}));
    expect(ended.timeline.at(-1)).toEqual({startDate:TODAY,endDate:"2026-09-30",dose:{amount:"1.5",unit:"mg"},notes:""});
    expect(hydratePeptideDosingStrategy(ended).mode).toBe("structured");
    const open=commit(store,prepare(store,{expectedRevision:2,today:TODAY,draft:supportDraft({dosingStrategy:stay("1.5",TODAY)})}));
    expect(open.timeline.at(-1)).toEqual({startDate:TODAY,endDate:null,dose:{amount:"1.5",unit:"mg"},notes:""});
    expect(open.timeline.slice(0,5)).toEqual(ended.timeline.slice(0,5));
  });
  it("preserves a historical titration after a stable change and resolves doses from the full timeline",()=>{
    const store=structuredStore();
    const item=commit(store,prepare(store,{expectedRevision:1,today:TODAY,draft:supportDraft({dosingStrategy:stay("1.5",TODAY)})}));
    expect(resolvePeptideDose(item,"2026-06-15").current.dose.amount).toBe("1");
    expect(resolvePeptideDose(item,"2026-07-23").current.dose.amount).toBe("0.75");
    expect(resolvePeptideDose(item,TODAY).current.dose.amount).toBe("1.5");
    expect(hydratePeptideDosingStrategy(item).timeline).toHaveLength(6);
  });
  it("keeps raw timeline replace drafts on the full-replace path",()=>{
    const store=structuredStore();const replaced=[phase("2026-08-01",null,"1.25")];
    const item=commit(store,prepare(store,{expectedRevision:1,today:TODAY,draft:draft(["thursday"],{timelineOperation:"replace",timeline:replaced})}));
    expect(item.timeline).toEqual(replaced);
  });
  it("bounds timelineHistory to the newest archived entries",()=>{
    const store=structuredStore();
    store.executionItems[0].timelineHistory=Array.from({length:PEPTIDE_TIMELINE_HISTORY_LIMIT},(_,index)=>({archivedAt:`2026-01-${String(index+1).padStart(2,"0")}T00:00:00.000Z`,executionRevision:index+1,timeline:[]}));
    const item=commit(store,prepare(store,{expectedRevision:1,today:TODAY,draft:supportDraft({dosingStrategy:stay("1.5",TODAY)})}));
    expect(item.timelineHistory).toHaveLength(PEPTIDE_TIMELINE_HISTORY_LIMIT);
    expect(item.timelineHistory[0].archivedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(item.timelineHistory.at(-1).executionRevision).toBe(1);
  });
  it("saves through the transaction service with the same composition and surfaces the rejection code",async()=>{
    const fixture=setup("Retatrutide",["thursday"],true);
    Object.assign(fixture.live.executionItems[0],structuredStore().executionItems[0]);fs.writeFileSync(fixture.file,JSON.stringify(fixture.live));
    const refused=await fixture.service.save(command(fixture,{expectedRevision:1,today:TODAY,preserveTimelineHistory:true,draft:supportDraft({dosingStrategy:{...PLAN,stepAmount:"0.5"}})}));
    expect(refused).toMatchObject({outcome:"invalid",committed:false,code:PeptideExecutionRejectionCode.PLAN_REWRITES_HISTORY});
    const saved=await fixture.service.save(command(fixture,{expectedRevision:1,today:TODAY,preserveTimelineHistory:true,draft:supportDraft({dosingStrategy:stay("1.5",TODAY)})}));
    expect(saved).toMatchObject({outcome:"success",executionRevision:2});
    expect(fixture.live.executionItems[0].timeline).toHaveLength(6);
    expect(fixture.live.executionItems[0].timelineHistory).toHaveLength(1);
  });
});

describe("peptide pause and resume lifecycle (S3)",()=>{
  it("pauses from an effective date, bumps the revision and leaves everything else untouched",()=>{
    const store=structuredStore();const before=structuredClone(store.executionItems[0]);const reminder=structuredClone(store.reminders[0]);
    const prepared=lifecycle(store,{operation:"pause",effectiveDate:"2026-07-01",expectedRevision:1,reason:"Travel"});
    expect(prepared).toMatchObject({ok:true,operation:"pause",timelineChanged:false,lifecycle:{state:"paused",since:"2026-07-01"}});
    const item=commit(store,prepared);
    expect(item.scheduleSuspensions).toEqual([{pausedFrom:"2026-07-01",resumedOn:null,pausedAt:"2026-07-01T12:00:00.000Z",resumedAt:null,reason:"Travel",pausedExecutionRevision:1,resumedExecutionRevision:null}]);
    expect(item.executionRevision).toBe(2);
    const {scheduleSuspensions,executionRevision,updatedAt,...rest}=item;const {executionRevision:_r,updatedAt:_u,...expected}=before;
    expect(rest).toEqual(expected);
    expect(store.reminders[0]).toEqual(reminder);
    expect(resolvePeptideLifecycleState(item)).toEqual({state:"paused",since:"2026-07-01",history:[{state:"paused",effectiveDate:"2026-07-01",at:"2026-07-01T12:00:00.000Z",reason:"Travel"}]});
  });
  it("rejects a repeated pause as NOT_ACTIVE and a resume while active as NOT_PAUSED",()=>{
    const store=structuredStore();
    expect(lifecycle(store,{operation:"resume",effectiveDate:"2026-07-01",expectedRevision:1})).toMatchObject({ok:false,outcome:PeptideExecutionOutcome.NOT_PAUSED,code:PeptideExecutionRejectionCode.LIFECYCLE_NOT_PAUSED});
    commit(store,lifecycle(store,{operation:"pause",effectiveDate:"2026-07-01",expectedRevision:1}));
    expect(lifecycle(store,{operation:"pause",effectiveDate:"2026-07-02",expectedRevision:2})).toMatchObject({ok:false,outcome:PeptideExecutionOutcome.NOT_ACTIVE,code:PeptideExecutionRejectionCode.LIFECYCLE_NOT_ACTIVE});
    expect(lifecycle(store,{operation:"resume",effectiveDate:"2026-07-10",expectedRevision:1})).toMatchObject({ok:false,outcome:PeptideExecutionOutcome.VERSION_CONFLICT});
    expect(lifecycle(store,{operation:"resume",effectiveDate:"bad",expectedRevision:2})).toMatchObject({ok:false,outcome:PeptideExecutionOutcome.INVALID});
    expect(preparePeptideLifecycleTransition({protocol:store.protocols[0],executionItem:null,operation:"pause",effectiveDate:"2026-07-01",expectedRevision:1})).toMatchObject({ok:false,outcome:PeptideExecutionOutcome.NOT_FOUND});
    expect(preparePeptideLifecycleTransition({protocol:{...store.protocols[0],status:"paused"},executionItem:store.executionItems[0],operation:"pause",effectiveDate:"2026-07-01",expectedRevision:2})).toMatchObject({ok:false,outcome:PeptideExecutionOutcome.NOT_FOUND});
  });
  it("pause, edit, resume archives exactly two entries and shifts the plan per the generator",()=>{
    const store=structuredStore();
    commit(store,lifecycle(store,{operation:"pause",effectiveDate:"2026-07-01",expectedRevision:1,now:"2026-07-01T12:00:00.000Z"}));
    const edited=commit(store,prepare(store,{expectedRevision:2,today:"2026-07-03",draft:supportDraft({dosingStrategy:{...PLAN,landingDose:"0.5"},rewriteHistory:true})}));
    expect(edited.timelineHistory).toHaveLength(1);
    expect(edited.scheduleSuspensions).toHaveLength(1);
    const beforeResume=structuredClone(edited.timeline);
    const prepared=lifecycle(store,{operation:"resume",effectiveDate:"2026-07-10",expectedRevision:3,now:"2026-07-10T12:00:00.000Z"});
    expect(prepared).toMatchObject({ok:true,operation:"resume",timelineChanged:true,lifecycle:{state:"active",since:"2026-07-10"}});
    const item=commit(store,prepared);
    const closed=[{pausedFrom:"2026-07-01",resumedOn:"2026-07-10"}];
    expect(item.timeline).toEqual(composeTimelineWithStrategy({existingTimeline:beforeResume,strategy:item.dosingStrategy,generated:generatePeptideDosingTimeline(item.dosingStrategy,{suspensions:closed})}));
    expect(item.timeline.map((entry)=>entry.startDate)).toEqual(["2026-05-21","2026-05-28","2026-06-04","2026-06-11","2026-08-01","2026-08-08"]);
    expect(item.timeline[3].endDate).toBe("2026-07-31");
    expect(item.timelineHistory).toHaveLength(2);
    expect(item.timelineHistory[1].timeline).toEqual(beforeResume);
    expect(item.scheduleSuspensions).toEqual([{pausedFrom:"2026-07-01",resumedOn:"2026-07-10",pausedAt:"2026-07-01T12:00:00.000Z",resumedAt:"2026-07-10T12:00:00.000Z",reason:null,pausedExecutionRevision:1,resumedExecutionRevision:3}]);
    expect(item.executionRevision).toBe(4);
    expect(hydratePeptideDosingStrategy(item).mode).toBe("structured");
    expect(prepare(store,{expectedRevision:4,today:"2026-07-10",draft:supportDraft({dosingStrategy:{...PLAN,landingDose:"0.5"}})})).toMatchObject({ok:false,outcome:PeptideExecutionOutcome.UNCHANGED});
    const notes=commit(store,prepare(store,{expectedRevision:4,today:"2026-07-10",draft:supportDraft({dosingStrategy:{...PLAN,landingDose:"0.5"},notes:"After the trip"})}));
    expect(notes.timeline).toEqual(item.timeline);expect(notes.scheduleSuspensions).toEqual(item.scheduleSuspensions);expect(notes.timelineHistory).toHaveLength(2);
    expect(createPeptideSupportHydrationModel({executionItem:notes,protocol:store.protocols[0]}).dosingMode).toBe("structured");
  });
  it("resume with a stay plan leaves the timeline unchanged; an empty window follows a pause starting tomorrow",()=>{
    const store=structuredStore();
    commit(store,prepare(store,{expectedRevision:1,today:TODAY,draft:supportDraft({dosingStrategy:stay("1.5",TODAY)})}));
    const before=structuredClone(store.executionItems[0].timeline);
    commit(store,lifecycle(store,{operation:"pause",effectiveDate:"2026-08-01",expectedRevision:2}));
    const resumed=commit(store,lifecycle(store,{operation:"resume",effectiveDate:"2026-08-11",expectedRevision:3}));
    expect(resumed.timeline).toEqual(before);
    expect(resumed.timelineHistory).toHaveLength(1);
    expect(resumed.scheduleSuspensions[0]).toMatchObject({pausedFrom:"2026-08-01",resumedOn:"2026-08-11"});
    expect(resumed.executionRevision).toBe(4);
    commit(store,lifecycle(store,{operation:"pause",effectiveDate:"2026-08-21",expectedRevision:4}));
    const early=commit(store,lifecycle(store,{operation:"resume",effectiveDate:"2026-08-20",expectedRevision:5}));
    expect(early.scheduleSuspensions[1]).toMatchObject({pausedFrom:"2026-08-21",resumedOn:"2026-08-21"});
    expect(resolvePeptideLifecycleState(early)).toMatchObject({state:"active",since:"2026-08-21"});
    expect(lifecycle(store,{operation:"pause",effectiveDate:"2026-08-20",expectedRevision:6})).toMatchObject({ok:false,outcome:PeptideExecutionOutcome.INVALID});
  });
  it("treats an absent scheduleSuspensions as [] and preserves stored windows through an old-shape save",()=>{
    const store=structuredStore();
    expect(resolvePeptideLifecycleState(store.executionItems[0])).toEqual({state:"active",since:null,history:[]});
    expect(resolvePeptideLifecycleState({scheduleSuspensions:null})).toEqual({state:"active",since:null,history:[]});
    commit(store,lifecycle(store,{operation:"pause",effectiveDate:"2026-07-01",expectedRevision:1}));
    const windows=structuredClone(store.executionItems[0].scheduleSuspensions);
    const oldShape=prepare(store,{expectedRevision:2,draft:draft(["thursday"],{timelineOperation:"preserve",timeline:[],notes:"old client"})});
    expect(oldShape.ok).toBe(true);
    expect(oldShape.executionCandidate.scheduleSuspensions).toEqual(windows);
    const item=commit(store,oldShape);
    expect(item.scheduleSuspensions).toEqual(windows);
    expect(resolvePeptideLifecycleState(item).state).toBe("paused");
    const lost=structuredClone(store);delete lost.executionItems[0].scheduleSuspensions;
    expect(verifyPreparedPeptideExecutionTransition(lost,oldShape)).toBe(false);
    const paused=commit(store,prepare(store,{expectedRevision:3,today:"2026-07-03",draft:supportDraft({supportSchedule:{specificTime:"20:00"}})}));
    expect(paused.scheduleSuspensions).toEqual(windows);expect(paused.preferredSchedule.timeOfDay).toBe("20:00");
  });
  it("leaves UNCHANGED detection intact when the field is absent on both sides",()=>{
    const store=structuredStore();
    expect(prepare(store,{expectedRevision:1,today:TODAY,draft:supportDraft()})).toMatchObject({ok:false,outcome:PeptideExecutionOutcome.UNCHANGED});
    store.executionItems[0].scheduleSuspensions=[];
    expect(prepare(store,{expectedRevision:1,today:TODAY,draft:supportDraft()})).toMatchObject({ok:false,outcome:PeptideExecutionOutcome.UNCHANGED});
  });
});

const TODAY="2026-07-25";
const PLAN={pattern:"up_hold_down",startingDose:{amount:"0.25",unit:"mg"},startDate:"2026-05-21",stepAmount:"0.25",stepInterval:1,stepUnit:"weeks",targetDose:"1",holdDuration:6,holdUnit:"weeks",decreaseAmount:"0.25",decreaseInterval:1,decreaseUnit:"weeks",landingDose:"0.25",endDate:null};
const SCHEDULE={frequency:"weekly",daysOfWeek:["thursday"],intervalDays:1,timing:"specific",specificTime:"21:45",startDate:"2026-05-21",endDate:null};
function stay(amount,startDate){return{pattern:"stay",startingDose:{amount,unit:"mg"},startDate,endDate:null};}
function structuredStore(){const timeline=generatePeptideDosingTimeline(PLAN);return{protocols:[{id:"peptide",userId:"founder",name:"Retatrutide",category:"peptide",status:"active",currentGoalIds:["goal"],relatedGoalIds:[]}],executionItems:[{id:"execution_retatrutide",userId:"founder",type:"peptide",title:"Retatrutide",description:"Peptide Execution",active:true,protocolRootId:"peptide",linkedStrategyIds:["peptide"],linkedGoalIds:["goal"],linkedEvidenceTypes:[],cadence:{type:"weekly"},preferredSchedule:{daysOfWeek:["thursday"],timeOfDay:"21:45",startDate:"2026-05-21",endDate:null},timingContext:"fasted_before_bed",reminderPreference:"remind",priority:"normal",notes:"Fasted before bed",completionHistory:[],dosingStrategy:PLAN,timeline,executionRevision:1,author:{type:"user",id:"founder"},createdAt:"2026-05-21T12:00:00.000Z",updatedAt:"2026-05-21T12:00:00.000Z"}],reminders:[{id:"reminder_peptide",userId:"founder",title:"Retatrutide",type:"protocol_reminder",linkedEntityType:"protocol",linkedEntityId:"peptide",relatedGoalIds:["goal"],active:true,schedule:{type:"weekly",cadence:"weekly",interval:1,unit:"week",daysOfWeek:["thursday"],dayOfWeek:"thursday",timeOfDay:"21:45",startDate:"2026-05-21",endDate:null,timingContext:"fasted_before_bed",timezone:"America/Los_Angeles"},completedAt:"2026-07-23T21:50:00.000Z",completionHistory:[{id:"prior",evidenceDate:"2026-07-23",dose:{amount:"0.75",unit:"mg"}}]}]};}
function supportDraft(overrides={}){return buildPeptideSupportDraft({supportSchedule:{...SCHEDULE,...(overrides.supportSchedule??{})},dosingStrategy:overrides.dosingStrategy??PLAN,timingContext:"fasted_before_bed",reminderPreference:overrides.reminderPreference??"remind",notes:overrides.notes??"Fasted before bed",rewriteHistory:overrides.rewriteHistory===true});}
function prepare(store,overrides={}){return preparePeptideExecutionTransition(store,{protocolId:"peptide",userId:"founder",author:{type:"user",id:"founder"},synchronizeReminder:true,preservePriority:true,preserveTimelineHistory:true,...overrides},new Date(`${overrides.today??TODAY}T12:00:00.000Z`));}
function lifecycle(store,{now,...overrides}){return preparePeptideLifecycleTransition({protocol:store.protocols[0],executionItems:store.executionItems,reminder:store.reminders[0],now:new Date(now??`${overrides.effectiveDate}T12:00:00.000Z`),...overrides});}
function commit(store,prepared){expect(prepared.ok).toBe(true);applyPreparedPeptideExecutionTransition(store,prepared);expect(verifyPreparedPeptideExecutionTransition(store,prepared)).toBe(true);return store.executionItems[0];}
