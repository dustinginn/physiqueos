import fs from "node:fs";
import path from "node:path";
import { describe,expect,it } from "vitest";

const source=fs.readFileSync(path.resolve(process.cwd(),"src/screens/GoalEditWizardScreen.jsx"),"utf8");
describe("Overall Goal destination presentation",()=>{
 it("uses natural authoring fields without implementation selectors",()=>{for(const copy of ["Goal outcome","Journey begins","Target date","Where would you like this journey to end?"])expect(source).toContain(copy);for(const copy of ["target type","timeline mode","flexibility selector","ambition selector"])expect(source.toLowerCase()).not.toContain(copy)});
 it("renders destination before protections from canonical plan data",()=>{expect(source).toContain("function overallDestination(plan)");expect(source.indexOf("{destination&&")).toBeLessThan(source.indexOf("Still protecting"));expect(source).toContain("plan.timeline?.startDate");expect(source).not.toContain("Build 10 lb of lean mass by October 31")});
 it("shows retained phases during a goal-only review",()=>{expect(source).toContain("Planned journey — retained");expect(source).toContain("This destination will be updated through the Goal Plan save.")});
});
