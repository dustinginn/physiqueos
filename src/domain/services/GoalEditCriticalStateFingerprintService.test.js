import { describe,expect,it } from "vitest";
import { captureGoalPlanningBaseline,goalEditPatchMayContinue,GOAL_EDIT_CRITICAL_PROJECTION_VERSION,projectGoalEditCriticalState,reconcileGoalPlanningBaseline,summarizeRuntimeDiff } from "./GoalEditCriticalStateFingerprintService";

function goal(extra={}){return{id:"goal",userId:"user",title:"Build Lean Mass",type:"build_lean_mass",primary:true,status:"active",createdAt:"2026-07-20",updatedAt:"2026-07-21",activatedAt:"2026-07-21",purpose:"Build",primaryOutcome:"Build lean mass",target:{type:"unspecified"},timeline:{mode:"unspecified"},guardrails:[{id:"g1",text:"Stay lean"}],protocolIds:["p1"],evidenceLinks:["e1"],supportingGoalIds:["support"],phases:[{id:"phase-1",goalId:"goal",order:0,status:"active",name:"Establish Maintenance",purpose:"Baseline",timingMode:"completion_criteria",startDate:null,targetDate:null,duration:null,successCriteria:[],guardrails:[],transitionPolicy:"evidence_review",createdAt:"2026-07-21",updatedAt:"2026-07-21"}],...extra}}
function store(){return{version:"test",revision:2,lastCommitId:"commit-2",updatedAt:"2026-07-21",goals:[goal(),{id:"support",userId:"user",title:"Support",primary:false,status:"active"}],protocols:[{id:"p1",name:"Protocol"}],canonicalEvidenceObjects:[{id:"e1",kind:"dexa"}],evidenceReviews:[],analyses:[],dailyBriefings:[],dailyLogs:[]}}
function captured(value=store()){return captureGoalPlanningBaseline(value,{capturedAt:"2026-07-21T00:00:00Z",fullRuntimeHash:"before",fileSize:100,lastModified:"2026-07-21"})}

describe("Goal Edit critical state fingerprint",()=>{
 it("is deterministic, sorted, immutable, and does not mutate input",()=>{const input=store(),before=structuredClone(input),first=projectGoalEditCriticalState(input),second=projectGoalEditCriticalState(structuredClone(input));expect(first).toEqual(second);expect(input).toEqual(before);expect(Object.isFrozen(first)).toBe(true);expect(Object.isFrozen(first.criticalProjection.activeGoal)).toBe(true);expect(first.fingerprintVersion).toBe(GOAL_EDIT_CRITICAL_PROJECTION_VERSION)});
 it("excludes evidence payloads but includes protected references",()=>{const input=store(),first=projectGoalEditCriticalState(input);input.canonicalEvidenceObjects.push({id:"e2",privatePayload:"not projected"});expect(projectGoalEditCriticalState(input).criticalFingerprint).toBe(first.criticalFingerprint);input.goals[0].evidenceLinks.push("e2");expect(projectGoalEditCriticalState(input).criticalFingerprint).not.toBe(first.criticalFingerprint)});
 it.each([
  ["target",g=>{g.target={type:"numeric_change",metric:"lean_mass",direction:"increase",amount:10,unit:"lb"}}],
  ["timeline",g=>{g.timeline={mode:"target_date",targetDate:"2026-10-31"}}],
  ["status",g=>{g.status="paused";g.primary=false}],
  ["phase timing",g=>{g.phases[0].startDate="2026-07-20"}],
  ["phase status",g=>{g.phases[0].status="completed"}],
  ["phase order",g=>{g.phases[0].order=1}],
  ["guardrail",g=>{g.guardrails[0].text="Changed"}],
  ["protocol relationship",g=>{g.protocolIds.push("p2")}],
  ["supporting relationship",g=>{g.supportingGoalIds.push("support-2")}],
 ])("changes for %s",(_,mutate)=>{const input=store(),before=projectGoalEditCriticalState(input).criticalFingerprint;mutate(input.goals[0]);if(input.goals.filter(x=>x.primary&&x.status==="active").length!==1)expect(()=>projectGoalEditCriticalState(input)).toThrow();else expect(projectGoalEditCriticalState(input).criticalFingerprint).not.toBe(before)});
 it("supports explicit empty and legacy absent phase collections deterministically",()=>{const empty=projectGoalEditCriticalState({...store(),goals:[goal({phases:[]})]}),legacy=projectGoalEditCriticalState({...store(),goals:[goal({phases:undefined})]});expect(empty.criticalProjection.phases).toEqual([]);expect(legacy.criticalProjection.phases).toEqual([]);expect(empty.projectionWarnings).toEqual([]);expect(legacy.projectionWarnings.length).toBe(1)});
 it("rejects unsupported versions",()=>{expect(()=>projectGoalEditCriticalState(store(),{projectionVersion:"future"})).toThrowError(expect.objectContaining({code:"GOAL_EDIT_CRITICAL_VERSION_UNSUPPORTED"}))});
});

describe("runtime reconciliation",()=>{
 it("classifies unchanged state",()=>{const current=store(),result=reconcileGoalPlanningBaseline(captured(current),current,{currentFullRuntimeHash:"before"});expect(result).toMatchObject({classification:"unchanged",mayContinue:true,criticalFingerprintChanged:false})});
 it.each([
  ["evidence upload",s=>s.canonicalEvidenceObjects.push({id:"e2"}),["evidence uploaded"]],
  ["analysis",s=>s.analyses.push({id:"a1"}),[]],
  ["briefing",s=>s.dailyBriefings.push({id:"b1"}),["briefing generated"]],
  ["logging",s=>s.dailyLogs.push({id:"l1"}),["daily logging occurred"]],
 ])("classifies %s as normal runtime drift",(_,mutate,attribution)=>{const current=store(),baseline=captured(current);mutate(current);const result=reconcileGoalPlanningBaseline(baseline,current,{currentFullRuntimeHash:"after",attribution});expect(result).toMatchObject({classification:"normal_runtime_drift",mayContinue:true,criticalFingerprintChanged:false});expect(goalEditPatchMayContinue(result)).toBe(true);if(attribution.length)expect(result.attributionVerified[0].verified).toBe(true)});
 it("blocks evidence plus phase drift and identifies both",()=>{const current=store(),baseline=captured(current);current.canonicalEvidenceObjects.push({id:"e2"});current.goals[0].phases[0].startDate="2026-07-20";const result=reconcileGoalPlanningBaseline(baseline,current,{currentFullRuntimeHash:"after",attribution:["evidence uploaded"]});expect(result.classification).toBe("goal_edit_critical_drift");expect(result.pathSummary.changedTopLevelKeys).toEqual(["canonicalEvidenceObjects","goals"]);expect(result.criticalChangedPaths.some(x=>x.includes("startDate"))).toBe(true);expect(goalEditPatchMayContinue(result,{phaseWork:true})).toBe(false)});
 it("blocks evidence plus target drift",()=>{const current=store(),baseline=captured(current);current.evidenceReviews.push({id:"r1"});current.goals[0].target={type:"qualitative",description:"Changed"};const result=reconcileGoalPlanningBaseline(baseline,current,{currentFullRuntimeHash:"after"});expect(result.classification).toBe("goal_edit_critical_drift");expect(result.criticalChangedPaths.some(x=>x.includes("target"))).toBe(true)});
 it("requires review for an unknown runtime collection",()=>{const current=store(),baseline=captured(current);current.experimentalRuntime=[{id:"x"}];expect(reconcileGoalPlanningBaseline(baseline,current,{currentFullRuntimeHash:"after"})).toMatchObject({classification:"unknown_drift",mayContinue:false})});
 it("reports founder revision-only drift separately without changing semantics",()=>{const current=store(),baseline=captured(current);current.revision=3;current.lastCommitId="commit-3";const result=reconcileGoalPlanningBaseline(baseline,current,{currentFullRuntimeHash:"after"});expect(result).toMatchObject({classification:"normal_runtime_drift",mayContinue:true,founderRevisionChanged:true,criticalFingerprintChanged:false})});
 it("does not let attribution hide critical drift",()=>{const current=store(),baseline=captured(current);current.goals[0].guardrails[0].text="Changed";const result=reconcileGoalPlanningBaseline(baseline,current,{currentFullRuntimeHash:"after",attribution:["evidence uploaded"]});expect(result.classification).toBe("goal_edit_critical_drift");expect(result.attributionVerified[0].verified).toBe(false)});
 it("rejects malformed baselines",()=>{expect(reconcileGoalPlanningBaseline({},store())).toMatchObject({classification:"invalid_baseline",mayContinue:false})});
 it("summarizes added, removed, and modified records without payloads",()=>{const before={evidenceReviews:{kind:"collection",count:2,records:{a:"1",b:"2"}}},after={evidenceReviews:{kind:"collection",count:2,records:{b:"3",c:"4"}}};expect(summarizeRuntimeDiff(before,after).areas.evidenceReviews).toEqual({classification:"normal-runtime",added:1,removed:1,modified:1,changedRecordIds:["a","b","c"]})});
});
