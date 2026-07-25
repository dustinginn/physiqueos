import { describe, expect, it } from "vitest";
import { CADENCE_RMR_STRATEGIES, createCadenceEnergyAssessment } from "./CadenceEnergyAssessmentService";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { createWeeklyBriefingPIResult } from "./WeeklyBriefingPIService";

const currentWindow={startDate:"2026-07-19",endDate:"2026-07-25",timeZone:"America/Los_Angeles"};
const comparisonWindow={startDate:"2026-07-12",endDate:"2026-07-18",timeZone:"America/Los_Angeles"};
function dates(window){const out=[];for(let value=window.startDate;value<=window.endDate;){out.push(value);const date=new Date(`${value}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+1);value=date.toISOString().slice(0,10);}return out;}
function assessment(window,prefix,intake=2300,partial=false){return createCadenceEnergyAssessment({cadence:"weekly",window,nutritionDays:dates(window).map((date,index)=>({id:`${prefix}-n-${date}`,date,totals:{calories:intake},metadata:{completeness:partial&&index===0?"partial":"complete"}})),activityDays:dates(window).map((date)=>({id:`${prefix}-a-${date}`,date,activeCalories:500,metadata:{completeness:"complete"}})),dexaScans:[{id:"dexa",measuredAt:"2026-07-01",restingMetabolicRate:{value:1800}}],rmrStrategy:CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW});}
function input(partial=false){return{evaluationDate:"2026-07-26",evidenceWindow:currentWindow,comparisonWindow,currentEnergyAssessment:assessment(currentWindow,"c",2400,partial),comparisonEnergyAssessment:assessment(comparisonWindow,"p",2200),weights:[{id:"w1",measuredAt:"2026-07-19",weight:{value:165}},{id:"w2",measuredAt:"2026-07-25",weight:{value:166}},{id:"p1",measuredAt:"2026-07-12",weight:{value:164.5}},{id:"p2",measuredAt:"2026-07-18",weight:{value:165}}],trainingReport:createTrainingPerformanceIntelligenceReport({canonicalObjects:[],now:"2026-07-26T12:00:00Z",generatedAt:"2026-07-26T12:00:00.000Z"}),activeGoal:{id:"g",title:"Build Lean Mass"}};}
describe("WeeklyBriefingPIService",()=>{
  it("activates exact-window Training Energy with complete and partial Energy coverage",()=>{
    for(const partial of [false,true]){
      const value=input(partial);
      const sessions=[training("prior","2026-07-15",100),training("current","2026-07-24",110)];
      value.canonicalTrainingEvidence=sessions;
      value.trainingReport=createTrainingPerformanceIntelligenceReport({canonicalObjects:sessions,now:"2026-07-26T12:00:00Z",generatedAt:"2026-07-26T12:00:00.000Z"});
      const result=createWeeklyBriefingPIResult(value);
      expect(result.trainingEnergyReadiness).toMatchObject({
        authorityReady:true,
        compatibility:{state:"exact_match"},
        energyCompleteness:partial?"partial":"complete",
      });
      expect(result.claims.some((item)=>item.kind==="training_energy_relationship")).toBe(true);
    }
  });
  it("composes exact deterministic repository-free Weekly inputs",()=>{const value=input(),before=structuredClone(value),result=createWeeklyBriefingPIResult(value);expect(result).toMatchObject({schemaVersion:"weekly_briefing_pi_v1",provenance:{repositoryReads:0,runtimeClockReads:0},energyTrend:{semanticScope:"weekly.energy_calibration"}});expect(result.observations.find((item)=>item.kind==="weight_short_window_change").explanationData).toMatchObject({absoluteChange:1,sampleCount:2});expect(value).toEqual(before);expect(createWeeklyBriefingPIResult(value)).toEqual(result);});
  it("preserves exact Energy totals, RMR evidence, IDs, and partial pairing",()=>{const result=createWeeklyBriefingPIResult(input(true));expect(result.energyTrend.explanationData.current).toMatchObject({intake:{total:16800,average:2400},estimatedExpenditure:{total:16100,average:2300},netBalance:{total:700,average:100},coverage:{pairedDayCount:7,completePairedDayCount:6,partialPairedDayCount:1,state:"partial"}});expect(result.energyTrend.explanationData.rmr).toMatchObject({sourceDexaId:"dexa",strategy:"latest_eligible_rmr_for_window"});expect(result.energyTrend.supportingEvidenceIds).toContain("dexa");});
  it("reports exact structured parity without prose comparison",()=>{const value=input();value.legacySemanticSummary={averageIntake:2400,averageExpenditure:2300,averageBalance:100,coverageState:"complete"};expect(createWeeklyBriefingPIResult(value).parityDiagnostics).toMatchObject({intake:"exactly_aligned",expenditure:"exactly_aligned",balance:"exactly_aligned",coverage:"exactly_aligned"});});
  it("integrates explicit structured Photo semantics without reading display prose",()=>{
    const value=input();value.photoSessions=[photoSession({metric:"leanness",direction:"decreased",change:"Display copy intentionally says stable."})];
    const result=createWeeklyBriefingPIResult(value);
    expect(result.observations.find((item)=>item.kind==="photo_leanness_change")).toMatchObject({direction:"falling"});
    expect(result.claims.some((item)=>item.kind==="photo_leanness_weight_relationship")).toBe(true);
  });
  it("keeps legacy Photo prose PI-insufficient",()=>{
    const value=input();value.photoSessions=[photoSession({change:"The waist looks softer and less defined."})];
    const result=createWeeklyBriefingPIResult(value);
    expect(result.observations.some((item)=>item.domain==="photos"&&item.kind!=="photo_comparability")).toBe(false);
    expect(result.claims.some((item)=>item.participatingDomains.includes("photos"))).toBe(false);
  });
  it("adds current-window DEXA authority and retains contradictions",()=>{
    const value=input();value.dexaScans=[
      {id:"dexa-prior",measuredAt:"2026-07-18",totalMass:{value:165,unit:"lb"},bodyFatPercentage:8.2,fatMass:{value:13.5,unit:"lb"},leanMass:{value:147,unit:"lb"},restingMetabolicRate:{value:1780,unit:"kcal/day"}},
      {id:"dexa-current",measuredAt:"2026-07-24",totalMass:{value:166,unit:"lb"},bodyFatPercentage:8.8,fatMass:{value:14.6,unit:"lb"},leanMass:{value:147.4,unit:"lb"},restingMetabolicRate:{value:1790,unit:"kcal/day"}},
    ];
    const result=createWeeklyBriefingPIResult(value);
    expect(result.observations.find((item)=>item.kind==="dexa_body_fat_percentage_change")).toMatchObject({direction:"rising"});
    expect(result.claims.find((item)=>item.kind==="dexa_body_fat_weight_relationship")).toMatchObject({explanationData:{corroborationState:"corroborated",authoritativeObservationId:expect.any(String)}});
  });
});

function training(id,date,weight){return{id,evidence_type:"training",observed_at:`${date}T12:00:00Z`,exercises:[{exercise_id:"seated_cable_rows",name:"Seated Cable Rows",category:"Back",sets:[{set_number:1,weight,reps:10}]}]};}

function photoSession(finding){
  return{id:"photo-current",captureDate:"2026-07-24",views:[{id:"view-current",canonicalViewId:"view-current",poseId:"front-relaxed",pose:{id:"front-relaxed",view:"front",pose:"relaxed"},poseIdentity:{orientation:"front",contractionState:"relaxed"},imageHref:"/current.jpg",previousImageHref:"/prior.jpg",comparisonStatus:"comparable",comparison:{previousSessionId:"photo-prior",previousCanonicalViewId:"view-prior",previousDate:"2026-07-17",previousPose:{id:"front-relaxed",view:"front",pose:"relaxed"},comparisonConfidence:"high"},structuredFindings:[finding],conditionDifferences:[]}]};
}
