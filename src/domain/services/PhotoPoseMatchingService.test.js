import { describe, expect, it } from "vitest";
import { selectPoseAwareComparisons } from "./PhotoPoseMatchingService";

const view=(id,date,identity,extra={})=>({id,canonicalViewId:id,captureDate:date,imageHref:`/${id}.jpg`,poseIdentity:identity,...extra});
const session=(id,date,views)=>({id,captureDate:date,views});

describe("pose-aware photo matching", () => {
  it("selects earliest and recent exact matches without using array order", () => {
    const identity={orientation:"front",contractionState:"relaxed",poseVariant:"standard"};
    const result=selectPoseAwareComparisons({currentView:view("now","2026-07-18",identity),currentSessionId:"now-session",sessions:[
      session("recent","2026-07-11",[view("recent-view","2026-07-11",identity)]),
      session("first","2026-05-21",[view("first-view","2026-05-21",identity)]),
    ]});
    expect(result).toMatchObject({priorViewId:"recent-view",earliestViewId:"first-view",comparisonMode:"journey_comparison"});
  });

  it.each([
    ["front flexed",{orientation:"front",contractionState:"flexed",poseVariant:"standard"}],
    ["rear relaxed",{orientation:"rear",contractionState:"relaxed",poseVariant:"standard"}],
    ["side relaxed",{orientation:"side_unspecified",contractionState:"relaxed",poseVariant:"standard"}],
  ])("does not manufacture a %s fallback",(_label,other)=>{
    const current={orientation:"front",contractionState:"relaxed",poseVariant:"standard"};
    const result=selectPoseAwareComparisons({currentView:view("now","2026-07-18",current),currentSessionId:"now",sessions:[session("old","2026-07-01",[view("other","2026-07-01",other)])]});
    expect(result).toMatchObject({priorMatchFound:false,comparisonMode:"new_pose_baseline",establishesBaseline:true});
  });

  it("excludes hidden and inactive candidates",()=>{
    const identity={orientation:"front",contractionState:"relaxed",poseVariant:"standard"};
    const result=selectPoseAwareComparisons({currentView:view("now","2026-07-18",identity),currentSessionId:"now",sessions:[session("old","2026-07-01",[view("hidden","2026-07-01",identity,{status:"hidden"})])]});
    expect(result.priorMatchFound).toBe(false);
  });
});
