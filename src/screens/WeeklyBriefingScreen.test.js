import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source=fs.readFileSync(new URL("./WeeklyBriefingScreen.jsx",import.meta.url),"utf8");
describe("WeeklyBriefingScreen",()=>{
  it("uses the five-card briefing hierarchy at mobile width on every viewport",()=>{for(const value of ["Weekly Briefing","Snapshot","Progress","Interpretation","Coach"]){expect(source).toContain(value);}expect(source).toContain("max-w-[393px]");expect(source).not.toContain("max-w-[560px]");expect(source).toContain("grid-cols-2");});
  it("links to rather than replaying a Photo Event",()=>{expect(source).toContain("Open Photo Event");expect(source).not.toContain("PhotoEventBriefingScreen");});
  it("renders domain Highlights and Insights as a coaching conversation",()=>{expect(source).toContain("item.highlight");expect(source).toContain("item.insight");expect(source).toContain("coachInsight.celebration");expect(source).toContain("coachInsight.preparation");});
  it("restores rich weekly progress and Hero confidence",()=>{expect(source).toContain("ConfidenceRing");expect(source).toContain("ProgressLineChart");expect(source).toContain("No DEXA this week");expect(source).toContain("WeeklyCompletion");expect(source).toContain("EvidenceImage");});
  it("renders the three supported coaching sections",()=>{for(const value of ["Biggest Win","Keep Doing This","Watch Next Week"])expect(source).toContain(value);});
});
