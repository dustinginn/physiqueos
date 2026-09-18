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

  it("renders canonical V3 sections and Coach's Take without legacy substitution", () => {
    const window=createMidweekEvidenceWindow({now:new Date("2026-07-22T19:00:00Z"),timeZone:"America/Los_Angeles"});
    const source=structuredClone(composeMidweekBriefingPreview({...midweekPreviewFixtures.current,window,generatedAt:"2026-07-22T19:00:00Z"}));
    source.hero={verdict:"Canonical headline.",summary:"Canonical meaning."};
    source.narrativeV3={summary:"Canonical headline.",detail:"Canonical detail.",sections:{
      result:"Shoulder press reached a new best.",
      meaning:"Training is moving in the direction this goal needs.",
      action:"Keep the current setup in place.",
      watch:"Watch whether this progress continues.",
      confidence:"Confidence holds at 79%.",
    },coachTake:"Leg press reached a milestone worth recognizing."};
    source.goalConfidence={score:79,band:"high",priorScore:79,delta:0,
      movementDirection:"held",primaryReason:"Confidence holds at 79%.",
      modelVersion:"canonical_confidence_assessment_v3",piVersion:"confidence_v3"};
    const briefing=prepareMidweekBriefingReviewPresentation({artifact:{
      cadence:"midweek",confidencePublication:{
        schemaVersion:"briefing_confidence_binding_v3"},briefing:source}});
    const html=renderToStaticMarkup(React.createElement(MidweekBriefingScreen,{briefing}));
    for(const text of ["Result","What It Means","What To Do","What To Watch",
      "Confidence","Shoulder press reached a new best.",
      "Training is moving in the direction this goal needs.",
      "Keep the current setup in place.","Watch whether this progress continues.",
      "Confidence holds at 79%.","Leg press reached a milestone worth recognizing."])
      expect(html).toContain(text);
    expect(html).toContain('data-testid="midweek-narrative-v3"');
    expect(html).not.toContain("Calories are moving closer to supporting stronger training.");
    expect(html).not.toContain("Biggest Takeaway");
    expect(html).not.toContain("My Recommendation");
    expect(html).not.toContain("Through Sunday");
    expect(html).not.toContain("Energy Balance");
    expect(html).not.toContain("Weight Context");
    expect(html).not.toContain("Training Response");
    expect(html).not.toContain("Body Composition");
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
  source.narrativeV3={summary:"Canonical headline.",detail:"Canonical detail.",sections:{
    result:"Shoulder press reached a new best.",meaning:"Training is moving in the direction this goal needs.",
    action:"Keep the current setup in place.",watch:"Watch whether this progress continues.",
    confidence:"Confidence holds because the overall outlook did not change.",
  },coachTake:"Leg press reached a milestone worth recognizing."};
  source.goalConfidence=goalConfidence;
  return prepareMidweekBriefingReviewPresentation({artifact:{cadence:"midweek",
    confidencePublication:{schemaVersion:"briefing_confidence_binding_v3"},briefing:source}});
}
