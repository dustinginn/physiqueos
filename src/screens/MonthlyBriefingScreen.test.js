import fs from "node:fs";
import { describe, expect, it } from "vitest";
const source=fs.readFileSync(new URL("./MonthlyBriefingScreen.jsx",import.meta.url),"utf8");
describe("MonthlyBriefingScreen V2",()=>{
  it("uses the integrated Narrative hero at the canonical mobile width",()=>{for(const value of ["monthly-hero","Monthly Briefing","grid grid-cols-2 gap-2","max-w-[393px]","overflow-x-hidden","pb-32"]){expect(source).toContain(value);}});
  it("alternates narrative with graph, media, verdict, and guidance beats",()=>{for(const value of ["monthly-weight-story","ProgressLineChart","ProgressPhotoGallery","PhotoMoment","Verdict","chapterAhead.guidance"]){expect(source).toContain(value);}expect(source).not.toMatch(/Weight Domain|Training Domain|Nutrition Domain/);});
  it("keeps unsupported cost conditional",()=>{expect(source).toContain("narrative.costOfProgress&&");});
});
