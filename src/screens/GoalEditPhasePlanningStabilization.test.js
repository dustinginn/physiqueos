import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source=fs.readFileSync(path.resolve(process.cwd(),"src/screens/GoalEditWizardScreen.jsx"),"utf8");
describe("Goal Edit phase-planning stabilization",()=>{
 it("uses the canonical centered mobile shell and safe bottom-nav clearance",()=>{expect(source).toContain("max-w-[393px]");expect(source).toContain("w-full");expect(source).toContain("pb-[calc(8rem+env(safe-area-inset-bottom))]");expect(source).not.toContain("max-w-[620px]");expect(source).toContain("overflow-x-hidden")});
 it("renders incomplete interpretations conversationally without raw metadata",()=>{expect(source).toContain("I need a little more detail");expect(source).toContain("Type your plan in your own words");expect(source).not.toContain("Signals: No strong signals");expect(source).not.toContain("r.recommendation")});
 it("routes every empty fallback through the canonical intent transition",()=>{expect(source).toContain("Describe different phases");expect(source).toContain("resolvePhasePlanningEntry");expect(source).toContain('return availability.available?<CanonicalSuggestionReview');expect(source).toContain('<PlanIntentEntry draft={draft} apply={apply} incomplete/>')});
 it("removes unresolved Continue",()=>{expect(source).toContain('step==="phases"&&!isPhaseSectionResolved(draft)')});
});
