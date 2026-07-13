import { describe, expect, it } from "vitest";
import { composeGalleryInterpretation, semanticDeduplicate } from "./GalleryInterpretationService";

describe("GalleryInterpretationService", () => {
  it("composes persisted pairwise evidence into a concise interpretation", () => {
    const result=composeGalleryInterpretation({label:"Front Relaxed",captureDate:"2026-07-11",conditions:{postWorkout:true,fasted:false},comparison:{previousDate:"2026-07-03",previousConditions:{postWorkout:false,fasted:true},conditionDifferences:["post-workout","fasted"]},structuredFindings:[{change:"Waist appears modestly tighter."},{change:"Upper-body fullness appears stable."}]});
    expect(result.summary).toBe("Waist appears modestly tighter.");
    expect(result.comparisonBullets).toEqual(["Upper-body fullness appears stable."]);
    expect(result.conditionSummary).toMatch(/Jul 11.*after your workout.*after eating.*Jul 3.*while fasted/i);
    expect(result.comparisonBullets).toHaveLength(1);
  });
  it("deduplicates equivalent anatomy and direction while preserving distinct signals",()=>{
    expect(semanticDeduplicate(["Your waist looks a little tighter.","Waist appears modestly tighter.","Your chest and shoulders look maintained."])).toEqual(["Waist appears modestly tighter.","Your chest and shoulders look maintained."]);
    expect(semanticDeduplicate(["Silhouette looks cleaner.","Overall front silhouette looks slightly cleaner."])).toEqual(["Overall front silhouette looks slightly cleaner."]);
  });

  it("uses an honest neutral fallback and removes implementation language", () => {
    const result=composeGalleryInterpretation({label:"Front Relaxed",captureDate:"2026-07-03",conditions:{},comparison:{previousDate:"2026-06-29",previousConditions:{},conditionDifferences:[]},structuredFindings:[{change:"Fallback mode cannot inspect visual change."}]});
    expect(result.summary).toBe("No meaningful visual differences stand out between these photos.");
    expect(result.comparisonBullets).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/fallback mode|repository|interpreter|evidence|storage|claim/i);
  });

  it("supports current-only evidence without inventing a comparison", () => {
    const result=composeGalleryInterpretation({label:"Rear Relaxed",captureDate:"2026-06-13",conditions:{morning:true},structuredFindings:[{change:"Back shape is clearly visible."}]});
    expect(result.summary).toBe("Back shape is clearly visible.");
    expect(result.summary).not.toMatch(/compared/i);
  });
});
