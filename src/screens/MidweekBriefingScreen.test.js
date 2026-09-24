import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createMidweekEvidenceWindow } from "../domain/services/BriefingEvidenceWindowService";
import { composeMidweekBriefingPreview } from "../domain/services/MidweekBriefingPreviewService";
import { prepareMidweekBriefingReviewPresentation } from
  "../domain/services/MidweekBriefingPresentationService";
import { createBriefingGoalConfidenceBlockFromV3 } from
  "../domain/services/BriefingGoalConfidencePresentationService";
import { projectConfidenceExplanationForSurface } from
  "../domain/presentation/confidenceExplanationPresentation";
import { midweekPreviewFixtures } from "../fixtures/midweekBriefingPreview";
import MidweekBriefingScreen from "./MidweekBriefingScreen";

const productionFixture = JSON.parse(fs.readFileSync(new URL(
  "../../agent-handoffs/fixtures/20260924T051615Z-midweek-slice0-production-lineage-parity.json",
  import.meta.url
), "utf8"));

describe("MidweekBriefingScreen", () => {
  it("renders a producer-bound V3 assessment with its canonical explanation identity", () => {
    const assessment={id:"confidence-v3-midweek",schemaVersion:"canonical_confidence_assessment_v3",
      currentPercentage:79,confidenceBand:"moderate",priorPercentage:79,
      confidenceDelta:0,movement:"no_meaningful_change",movementMagnitude:"none",
      narrativeExplanation:{text:"Confidence holds because the overall outlook did not change."},
      narrativeSupportingFactors:[],narrativeLimitingFactors:[],
      remainingUncertainty:{items:[]},goalId:"goal-build",phaseId:"phase-build",
      goalContract:{id:"goal-contract-build"},sourceCutoff:"2026-09-16T06:59:59.999Z",
      publicationTimestamp:"2026-09-16T14:00:00.000Z",publisherType:"midweek_briefing",
      briefingArtifactId:"midweek-v3"};
    const publishedConfidence=createBriefingGoalConfidenceBlockFromV3({assessment});
    const goalConfidence=projectConfidenceExplanationForSurface(
      publishedConfidence,{assessment,surface:"midweek"});
    expect(goalConfidence.explanationModel).toMatchObject({score:79,band:"moderate",
      movement:"no_meaningful_change",sourceAssessmentId:assessment.id});
    const briefing=v3PresentationSource(goalConfidence);
    const html=renderToStaticMarkup(React.createElement(MidweekBriefingScreen,{briefing}));
    expect(html).toContain("Confidence holds because the overall outlook did not change.");
    expect(html).toContain('data-testid="midweek-confidence"');
  });

  it("renders the Server contract with factual modules and no duplicate V3 body", () => {
    const window=createMidweekEvidenceWindow({now:new Date("2026-07-22T19:00:00Z"),timeZone:"America/Los_Angeles"});
    const source=structuredClone(composeMidweekBriefingPreview({...midweekPreviewFixtures.current,window,generatedAt:"2026-07-22T19:00:00Z"}));
    source.hero={verdict:"Canonical headline.",summary:"Canonical meaning."};
    source.narrativeV3={summary:"Shoulder press reached a new best.",detail:"Canonical detail.",sections:{
      result:"Shoulder press reached a new best.",
      meaning:"Training is moving in the direction this goal needs.",
      action:"Keep the current setup in place.",
      watch:"Watch whether this progress continues.",
      confidence:"Confidence holds at 79%.",
    },coachTake:"Leg press reached a milestone worth recognizing.",
    strategicInterpretationId:"interpretation-v3"};
    source.goalConfidence={score:79,band:"high",priorScore:79,delta:0,
      movementDirection:"held",primaryReason:"Confidence holds at 79%.",
      modelVersion:"canonical_confidence_assessment_v3",piVersion:"confidence_v3"};
    const artifact=v3Artifact(source);
    const briefing=prepareMidweekBriefingReviewPresentation({artifact,
      assessment:v3Assessment(artifact)});
    const html=renderToStaticMarkup(React.createElement(MidweekBriefingScreen,{briefing}));
    for(const text of ["What To Do","What To Watch",
      "Shoulder press reached a new best.",
      "Training is moving in the direction this goal needs.",
      "Keep the current setup in place.","Watch whether this progress continues.",
      "Energy Balance","Weight Context","Training Response","Body Composition"])
      expect(html).toContain(text);
    expect(html).toContain('data-testid="midweek-coaching"');
    expect(html).not.toContain("Calories are moving closer to supporting stronger training.");
    expect(html).not.toContain("Canonical detail.");
    expect(html).not.toContain("Result</p>");
    expect(html).not.toContain("Leg press reached a milestone worth recognizing.");
    expect(html).not.toContain("Biggest Takeaway");
    expect(html).not.toContain("My Recommendation");
    expect(html).not.toContain("Through Sunday");
    expect(occurrences(html,"Training is moving in the direction this goal needs."))
      .toBe(1);
    expect(occurrences(html,"Keep the current setup in place.")).toBe(1);
    expect(occurrences(html,"Watch whether this progress continues.")).toBe(1);
  });

  it("renders the Sep 20-22 parity hierarchy with one Confidence surface", () => {
    const fixture=productionFixture;
    const window=createMidweekEvidenceWindow({now:new Date("2026-09-23T10:01:29Z"),timeZone:"America/Los_Angeles"});
    const source=structuredClone(composeMidweekBriefingPreview({...midweekPreviewFixtures.current,window,generatedAt:fixture.artifact.generatedAt}));
    source.activeGoal={id:fixture.artifact.goal.id,name:fixture.artifact.goal.name};
    source.activePhase={id:fixture.artifact.phase.id,name:fixture.artifact.phase.name};
    source.hero={verdict:fixture.claims.machineLateralRaise90Lb.narrativeText,summary:"Training is supporting the current phase."};
    source.narrativeV3={summary:fixture.claims.machineLateralRaise90Lb.narrativeText,detail:"Do not render this concatenated detail.",sections:{
      result:fixture.claims.machineLateralRaise90Lb.narrativeText,
      meaning:"Training is supporting the current phase.",
      action:"Keep the current setup in place.",
      watch:"Treat the Energy estimate as directional until coverage improves.",
      confidence:"Confidence holds at 79%."},
      coachTake:fixture.claims.legExtensions90Lb.narrativeText,
      strategicInterpretationId:fixture.assessment.strategicInterpretationId,
      uncertainty:[]};
    source.goalConfidence={score:79,band:"moderate",priorScore:79,delta:0,
      movementDirection:"held",primaryReason:"Confidence holds at 79%.",
      assessmentId:fixture.assessment.assessmentId,
      modelVersion:"canonical_confidence_assessment_v3",piVersion:"confidence_v3"};
    source.energyBalance.chartPoints=[{date:"2026-09-20",complete:false},{date:"2026-09-21",complete:true,balance:50},{date:"2026-09-22",complete:true,balance:-25}];
    source.weightContext.observations=3;
    source.training.sessionsCompleted=2;
    source.training.highlights=[{
      canonicalExerciseId:fixture.claims.machineLateralRaise90Lb.subjectId,
      exercise:fixture.claims.machineLateralRaise90Lb.subjectLabel,
      exerciseName:fixture.claims.machineLateralRaise90Lb.subjectLabel,
      kind:"Record",label:"90 lb heaviest load",
    },{
      canonicalExerciseId:fixture.claims.legExtensions90Lb.subjectId,
      exercise:fixture.claims.legExtensions90Lb.subjectLabel,
      exerciseName:fixture.claims.legExtensions90Lb.subjectLabel,
      kind:"Record",label:"90 lb heaviest load",
    }];
    const artifact=v3Artifact(source,{id:fixture.artifact.artifactId,
      assessmentId:fixture.assessment.assessmentId,
      windowId:fixture.artifact.evidenceWindow.id,
      goalId:fixture.artifact.goal.id,phaseId:fixture.artifact.phase.id});
    const selected=Object.values(fixture.claims).map((claim)=>({candidateId:claim.candidateId,topicKey:claim.topicKey,subjectId:claim.subjectId,subjectLabel:claim.subjectLabel}));
    const allocations=Object.fromEntries(fixture.allocations.map((item)=>[item.section,{topicKeys:item.topicKeys}]));
    const assessment=v3Assessment(artifact,{id:fixture.assessment.assessmentId,
      structuredInterpretationId:fixture.assessment.strategicInterpretationId,
      narrativeAssessmentId:fixture.assessment.narrativePlanId,
      selected,allocations,uncertaintyTypes:fixture.uncertainty});
    const briefing=prepareMidweekBriefingReviewPresentation({artifact,assessment});
    const html=renderToStaticMarkup(React.createElement(MidweekBriefingScreen,{briefing}));
    expect(occurrences(html,fixture.claims.machineLateralRaise90Lb.narrativeText)).toBe(1);
    expect(html).not.toContain(fixture.claims.legExtensions90Lb.narrativeText);
    expect(html).toContain("Lateral Raises Machine");
    expect(html).toContain("Leg Extensions");
    expect(html).not.toContain("Do not render this concatenated detail.");
    expect(occurrences(html,'data-testid="midweek-confidence"')).toBe(1);
    expect(html).not.toContain("Still Unresolved");
    expect(html.indexOf("Energy Balance")).toBeLessThan(html.indexOf("Weight Context"));
    expect(html.indexOf("Weight Context")).toBeLessThan(html.indexOf("Body Composition"));
    expect(html.indexOf("Body Composition")).toBeLessThan(html.indexOf("Training Response"));
  });

  it("suppresses the Energy chart when the contract has fewer than two paired days", () => {
    const window=createMidweekEvidenceWindow({now:new Date("2026-07-22T19:00:00Z"),timeZone:"America/Los_Angeles"});
    const source=structuredClone(composeMidweekBriefingPreview({...midweekPreviewFixtures.current,window,generatedAt:"2026-07-22T19:00:00Z"}));
    source.narrativeV3={summary:"One clear result.",detail:"Do not render.",sections:{
      result:"One clear result.",meaning:"One goal implication.",
      action:"Keep the plan steady.",watch:"Watch the next complete day.",
      confidence:"Confidence is unchanged."},coachTake:"Another movement.",
      strategicInterpretationId:"interpretation-v3"};
    source.goalConfidence={score:79,band:"moderate",priorScore:79,delta:0,
      movementDirection:"held",primaryReason:"Confidence is unchanged.",
      assessmentId:"confidence-v3-midweek",
      modelVersion:"canonical_confidence_assessment_v3",
      piVersion:"confidence_v3"};
    source.energyBalance.chartPoints=[{date:"2026-07-19",complete:true,
      balance:-40},{date:"2026-07-20",complete:false}];
    const artifact=v3Artifact(source);
    const briefing=prepareMidweekBriefingReviewPresentation({artifact,
      assessment:v3Assessment(artifact)});
    const html=renderToStaticMarkup(React.createElement(MidweekBriefingScreen,
      {briefing}));
    expect(html).toContain("Energy Balance");
    expect(html).not.toContain('data-chart="midweek-energy"');
  });

  it("renders one concise coaching narrative without internal continuity or coverage UI", () => {
    const window=createMidweekEvidenceWindow({now:new Date("2026-07-22T19:00:00Z"),timeZone:"America/Los_Angeles"});
    const briefing=composeMidweekBriefingPreview({...midweekPreviewFixtures.current,window,generatedAt:"2026-07-22T19:00:00Z"});
    const html=renderToStaticMarkup(React.createElement(MidweekBriefingScreen,{briefing}));
    for(const text of ["Midweek Briefing","Energy Balance","Weight Context","Training Response","Body Composition","Current Baseline","Coach&#x27;s Take","💡","Biggest Takeaway","🧠","My Recommendation","🎯","Through Sunday"])expect(html).toContain(text);
    for(const emoji of ["💡","🧠","🎯"])expect(html).toContain(`<span aria-hidden="true">${emoji}</span>`);
    expect(html).toContain('<span class="text-white/70">Biggest Takeaway</span>');
    expect(html.indexOf("Energy Balance")).toBeLessThan(html.indexOf("Weight Context"));
    expect(html.indexOf("Weight Context")).toBeLessThan(html.indexOf("Training Response"));
    expect(html).toContain('data-chart="midweek-energy"');
    for(const text of ["Calories eaten: 2,480 kcal","Estimated expenditure: 2,556 kcal","Energy balance: −76 kcal","group-open:block","group-hover:block"])expect(html).toContain(text);
    expect(html).not.toContain('data-chart="midweek-training"');
    expect(html).not.toContain('data-chart="weight"');
    for(const hidden of ["Phase Progress","Midweek Decision","Questions for Sunday","Evidence coverage","Supporting calculations","Estimate available","Observed movements","confidence","comparable window","directional context","logged days"])expect(html).not.toContain(hidden);
    expect(html).not.toMatch(/Still on track|Trend context updated|Evidence reviewed|Continue monitoring/);
    expect(html).toContain("max-w-[393px]");
    expect(html).toContain("overflow-x-hidden");
    expect(html).toContain("pb-32");
    expect(html).toContain("Calories are moving closer to supporting stronger training.");
    expect(html).toContain("Intake still appears slightly below maintenance");
    expect(html).not.toMatch(/led by (?:Single-Leg|Pull-Up|Row)/);
  });
});

function v3PresentationSource(goalConfidence) {
  const window=createMidweekEvidenceWindow({now:new Date("2026-07-22T19:00:00Z"),timeZone:"America/Los_Angeles"});
  const source=structuredClone(composeMidweekBriefingPreview({...midweekPreviewFixtures.current,window,generatedAt:"2026-07-22T19:00:00Z"}));
  source.hero={verdict:"Canonical headline.",summary:"Canonical meaning."};
  source.narrativeV3={summary:"Shoulder press reached a new best.",detail:"Canonical detail.",sections:{
    result:"Shoulder press reached a new best.",meaning:"Training is moving in the direction this goal needs.",
    action:"Keep the current setup in place.",watch:"Watch whether this progress continues.",
    confidence:"Confidence holds because the overall outlook did not change.",
  },coachTake:"Leg press reached a milestone worth recognizing.",
  strategicInterpretationId:"interpretation-v3"};
  source.goalConfidence=goalConfidence;
  const artifact=v3Artifact(source);
  return prepareMidweekBriefingReviewPresentation({artifact,
    assessment:v3Assessment(artifact)});
}

function v3Artifact(briefing,options={}) {
  const id=options.id??"midweek-v3";
  const assessmentId=options.assessmentId??"confidence-v3-midweek";
  briefing.goalConfidence.assessmentId=assessmentId;
  return {id,cadence:"midweek",evidenceWindow:{...briefing.evidenceWindow,
    id:options.windowId??"midweek-window-v3"},goalContext:{
    goalId:options.goalId??briefing.activeGoal?.id??"goal-build",
    phaseId:options.phaseId??briefing.activePhase?.id??"phase-build"},
    confidencePublication:{schemaVersion:"briefing_confidence_binding_v3",
      assessmentId},briefing};
}

function v3Assessment(artifact,options={}) {
  const interpretationId=options.structuredInterpretationId??"interpretation-v3";
  const narrativePlanId=options.narrativeAssessmentId??"narrative-plan-v3";
  const selected=options.selected??[{candidateId:"candidate-result",topicKey:"training|press|heaviest_load",subjectId:"press",subjectLabel:"Press"},{candidateId:"candidate-coach",topicKey:"training|row|heaviest_load",subjectId:"row",subjectLabel:"Row"}];
  const allocations=options.allocations??{result:{topicKeys:[selected[0]?.topicKey??"result"]},meaning:{topicKeys:["goal_implication"]},action:{topicKeys:["recommendation"]},watch:{topicKeys:["energy_ambiguity"]},confidence:{topicKeys:["confidence_movement"]},coachTake:{topicKeys:[selected[1]?.topicKey??"coach_emphasis"]}};
  return {id:options.id??artifact.confidencePublication.assessmentId,
    assessmentId:options.id??artifact.confidencePublication.assessmentId,
    schemaVersion:"canonical_confidence_assessment_v3",
    briefingArtifactId:artifact.id,evidenceWindowId:artifact.evidenceWindow.id,
    goalId:artifact.goalContext.goalId,phaseId:artifact.goalContext.phaseId,
    currentPercentage:79,confidenceBand:"moderate",movement:"no_meaningful_change",
    narrativeExplanation:{text:"Confidence holds because the overall outlook did not change."},
    structuredInterpretationId:interpretationId,narrativeAssessmentId:narrativePlanId,
    strategicInterpretation:{id:interpretationId,coachingObservationSelection:{selected}},
    narrativePlan:{id:narrativePlanId,strategicInterpretationId:interpretationId,
      uncertaintyTypes:options.uncertaintyTypes??[],composition:{sectionAllocations:allocations}}};
}

function occurrences(value,search) { return value.split(search).length-1; }
