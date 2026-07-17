import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source=fs.readFileSync(new URL("./WeeklyBriefingScreen.jsx",import.meta.url),"utf8");
describe("WeeklyBriefingScreen V5.1",()=>{
  it("uses the five-card hierarchy at mobile width on every viewport",()=>{for(const value of ["Weekly Briefing","Snapshot","Progress","Interpretation","Coach"]){expect(source).toContain(value);}expect(source).toContain("max-w-[393px]");expect(source).not.toContain("max-w-[560px]");});
  it("protects the mobile composition from overflow and fixed navigation",()=>{expect(source).toContain("overflow-x-hidden");expect(source).toContain("pb-32 pt-10");});
  it("removes the meaningless Weekly Read ring",()=>{expect(source).not.toMatch(/ConfidenceRing|Weekly read|hero\.confidence/);expect(source).toContain("ProgressLineChart");});
  it("renames the progress surface without replaying the Photo Event",()=>{expect(source).toContain("Weekly Progress Photos");expect(source).toContain("Open Photo Event");expect(source).not.toContain("PhotoEventBriefingScreen");});
  it("renders domain labels, Highlights, Insights, synthesis, and signature Coach sections",()=>{for(const value of ["item.highlight","item.insight","interpretation.synthesis","🎉 Biggest Win","💪 Keep Building","👀 Watch Next Week"]){expect(source).toContain(value);}});
  it("presents one integrated framed hero with a compact two-column highlight grid",()=>{for(const value of ["data-testid=\"weekly-hero\"","rounded-[28px]","grid grid-cols-2 gap-2","WeeklyHeroTile"]){expect(source).toContain(value);}expect(source).not.toContain('<ul className="space-y-2">');});
  it("gives supported domains restrained semantic treatments",()=>{for(const value of ["Visual Progress","Weight Trend","Performance","Activity","bg-violet-100/55","bg-orange-100/55","bg-indigo-100/55","bg-sky-100/55"]){expect(source).toContain(value);}});
  it("maps persisted highlight strings through structured domains without parsing prose",()=>{expect(source).toContain("normalizeWeeklyHeroHighlights");expect(source).toContain("cards.interpretation?.domains");expect(source).toContain("cards.hero.highlights??[]");expect(source).not.toMatch(/split\(|match\(|includes\(value/);});
  it("keeps odd tile counts balanced and derives legacy milestones from structured progress",()=>{expect(source).toContain("heroHighlights.length%2===1");expect(source).toContain("col-span-2");expect(source).toContain("deriveWeeklyHeroMilestone");expect(source).toContain("progress.activity?.completedDays===7");});
});
