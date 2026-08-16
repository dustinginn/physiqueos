import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { composePhaseAwareActiveGoalPreview } from "./PhaseAwareActiveGoalPreviewService";
import { expectInternalDomainNamesNatural } from "../presentation/proseCapitalization";

const goal={id:"goal-build",userId:"u",title:"Build Lean Mass",type:"build_lean_mass",status:"active",primary:true,target:{type:"numeric_change",metric:"lean_mass",amount:10,unit:"lb",description:"Build 10 lb of lean mass",targetDate:"2026-10-31"},timeline:{startDate:"2026-07-20",targetDate:"2026-10-31"},guardrails:[{text:"Maintain approximately 8–9% body fat.",accepted:true}],phases:[{id:"p1",name:"Establish Maintenance",purpose:"Establish a reliable maintenance baseline.",status:"active",order:0,timingMode:"fixed_duration",startDate:"2026-07-20",duration:{value:4,unit:"weeks"}},{id:"p2",name:"Lean Mass Build",status:"upcoming",order:1,timingMode:"target_date",targetDate:"2026-10-31"}]};
const dexa=[{measuredAt:"2026-07-18",bodyFatPercentage:7.7,leanMass:{value:147.5,unit:"lb"},fatMass:{value:12.8,unit:"lb"},totalMass:{value:167.4,unit:"lb"}}];
const dexaWithPhaseStart=[...dexa,{measuredAt:"2026-08-15",bodyFatPercentage:7.6,leanMass:{value:148.3,unit:"lb"},fatMass:{value:12.8,unit:"lb"},totalMass:{value:168.3,unit:"lb"}}];
const energyProtocol={id:"energy",effectiveStrategy:{phaseId:"p2",caloricIntakeTarget:{value:2500,unit:"kcal/day"},activityExpenditureTarget:{value:800,unit:"kcal/day"},monitoringCadence:"weekly"}};
const terminalGoal={...goal,currentPhaseId:"p2",phases:[{...goal.phases[0],status:"completed"},{...goal.phases[1],status:"active",startDate:"2026-08-15",startedAt:"2026-08-15",strategicReviewCadence:"monthly",strategicReviewAnchor:"dexa_body_composition"}]};

describe("phase-aware active goal preview",()=>{
  it("projects the canonical goal, phases, and baseline without raw lifecycle language",()=>{const result=composePhaseAwareActiveGoalPreview({user:{timeZone:"America/Los_Angeles"},goal,dexaScans:dexa,currentDate:new Date("2026-07-22T12:00:00Z")});expect(result.hero).toMatchObject({title:"Build Lean Mass",status:"Active Goal",destination:"Build 10 lb of lean mass by October 31, 2026"});expect(result.journey.map(x=>[x.name,x.status,x.color])).toEqual([["Establish Maintenance","Active","orange"],["Lean Mass Build","Planned","green"]]);expect(result.journey[0].progress).toBe("Week 1 of 4");expect(result.journey[1]).toMatchObject({progress:"0 of 10 lb measured",support:"Awaiting next DEXA"});expect(result.evidence.goalBaseline).toMatchObject({bodyFat:"7.7%",leanMass:"147.5 lb"});expect(result.evidence.phaseStart).toBeNull();expect(JSON.stringify(result.readiness)).not.toMatch(/transitionPolicy|timingMode|lifecycle/);});
  it("rejects a non-active or different goal",()=>{expect(()=>composePhaseAwareActiveGoalPreview({user:{},goal:{...goal,status:"completed"},dexaScans:dexa})).toThrow(/unavailable/);});
  it("renders a terminal active phase without losing history, marking completed Phase 1 gold",()=>{const result=composePhaseAwareActiveGoalPreview({user:{timeZone:"America/Los_Angeles"},goal:terminalGoal,dexaScans:dexaWithPhaseStart,protocols:[energyProtocol],currentDate:new Date("2026-08-20T12:00:00Z")});expect(result.next).toBeNull();expect(result.journey).toHaveLength(2);expect(result.journey.map(item=>[item.number,item.name,item.status])).toEqual([[1,"Establish Maintenance","Completed"],[2,"Lean Mass Build","Active"]]);expect(result.journey[0]).toMatchObject({color:"gold"});expect(result.journey[1]).toMatchObject({color:"green"});expect(result.readiness).toEqual([]);expect(result.trainingProgress).toBeNull();expect(result.turningPoints.at(-1).date).toBe("2026-10-31");});

  it("distinguishes the Goal baseline DEXA from the Phase starting DEXA when they differ", () => {
    const result = composePhaseAwareActiveGoalPreview({ user: { timeZone: "America/Los_Angeles" },
      goal: terminalGoal, dexaScans: dexaWithPhaseStart, protocols: [energyProtocol], currentDate: new Date("2026-08-20T12:00:00Z") });
    expect(result.evidence.goalBaseline).toMatchObject({ date: "2026-07-18", leanMass: "147.5 lb", bodyFat: "7.7%" });
    expect(result.evidence.phaseStart).toMatchObject({ date: "2026-08-15", leanMass: "148.3 lb", bodyFat: "7.6%" });
    expect(result.evidence.progress).toMatchObject({ changeLabel: "+0.8 lb", targetLabel: "10 lb", remainingLabel: "9.2 lb remaining" });
  });

  it("never calls the phase-starting DEXA the goal starting point", () => {
    const result = composePhaseAwareActiveGoalPreview({ user: { timeZone: "America/Los_Angeles" },
      goal: terminalGoal, dexaScans: dexaWithPhaseStart, protocols: [energyProtocol], currentDate: new Date("2026-08-20T12:00:00Z") });
    expect(result.evidence.goalBaseline.date).toBe("2026-07-18");
    expect(result.evidence.phaseStart.date).not.toBe(result.evidence.goalBaseline.date);
  });

  it("reports the observed body fat against the Guardrail without claiming it is inside the range", () => {
    const result = composePhaseAwareActiveGoalPreview({ user: { timeZone: "America/Los_Angeles" },
      goal: terminalGoal, dexaScans: dexaWithPhaseStart, protocols: [energyProtocol], currentDate: new Date("2026-08-20T12:00:00Z") });
    expect(result.guardrail.title).toBe("Maintain approximately 8–9% body fat");
    expect(result.guardrail.observation).toMatchObject({ relation: "below" });
    expect(result.guardrail.observation.label).toMatch(/7\.6%/);
    expect(result.guardrail.observation.label).not.toMatch(/within the 8/);
  });

  it("includes a meaningful phase-transition turning point and fabricates no future milestone", () => {
    const result = composePhaseAwareActiveGoalPreview({ user: { timeZone: "America/Los_Angeles" },
      goal: terminalGoal, dexaScans: dexaWithPhaseStart, protocols: [energyProtocol], currentDate: new Date("2026-08-20T12:00:00Z") });
    const transition = result.turningPoints.find((item) => item.date === "2026-08-15");
    expect(transition).toBeDefined();
    expect(transition.body).toMatch(/Establish Maintenance was completed/);
    expect(transition.body).toMatch(/did not conclusively prove maintenance/);
    expect(transition.body).toMatch(/sufficiently bounded/);
    expect(transition.body).toMatch(/authorized Lean Mass Build/);
    expect(transition.body).toMatch(/2,500 kcal\/day intake and 800 kcal\/day activity/);
    expect(transition.body).toMatch(/monthly.*DEXA\/body-composition aligned/);
    // No planned-review/destination entry may claim a date beyond currently known evidence.
    const knownDates = new Set(["2026-07-18", "2026-07-20", "2026-08-15", "2026-10-31"]);
    for (const point of result.turningPoints) expect(knownDates.has(point.date)).toBe(true);
    expectInternalDomainNamesNatural([transition.body]);
  });

  it("summarizes the current active Energy strategy from canonical Strategy/Operating Plan data", () => {
    const result = composePhaseAwareActiveGoalPreview({ user: { timeZone: "America/Los_Angeles" },
      goal: terminalGoal, dexaScans: dexaWithPhaseStart, protocols: [energyProtocol], currentDate: new Date("2026-08-20T12:00:00Z") });
    const energy = result.strategy.find((item) => item.label === "Energy");
    expect(energy.summary).toMatch(/2,500 kcal\/day intake/);
    expect(energy.summary).toMatch(/800 kcal\/day activity/);
    expect(energy.summary).toMatch(/weekly evidence monitoring/);
    expect(energy.summary).toMatch(/monthly.*DEXA aligned/);
    expect(energy.summary).toMatch(/user-authorized/);
    const nutrition = result.strategy.find((item) => item.label === "Nutrition");
    expect(nutrition.summary).toBeNull();
  });

  it("does not hardcode a real production Founder/DEXA identity or a universal August 15 date", () => {
    const source = fs.readFileSync(new URL("./PhaseAwareActiveGoalPreviewService.js", import.meta.url), "utf8");
    for (const fragment of ["6353e12e1ef8fbc3", "objective_lean_mass", "dexa_submission_20260815", "\"2026-08-15\"", "'2026-08-15'"]) {
      expect(source).not.toContain(fragment);
    }
  });
});
