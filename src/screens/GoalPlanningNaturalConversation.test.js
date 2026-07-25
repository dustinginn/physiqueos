import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const screen=fs.readFileSync(path.resolve(process.cwd(),"src/screens/GoalEditWizardScreen.jsx"),"utf8");
const interpreter=fs.readFileSync(path.resolve(process.cwd(),"src/domain/services/GoalPhaseIntentInterpretationService.js"),"utf8");

describe("Goal Planning natural conversation",()=>{
 it("keeps implementation terminology and confidence badges out of the UI",()=>{for(const term of ["Completion readiness","Timing mode","Target type","Flexibility","Ambition","LOW CONFIDENCE","HIGH CONFIDENCE","Signals:","no strict signal was invented","Shared goal conditions that remain in effect","Transition approach","Focused Progress"])expect(screen).not.toContain(term);expect(screen).not.toContain("result.confidence");expect(screen).not.toContain("r.confidence")});
 it("presents the overall destination as three natural fields",()=>{expect(screen).toContain("Where would you like this journey to end?");expect(screen).toContain(">Goal outcome<textarea");expect(screen).toContain(">Journey begins<input");expect(screen).toContain(">Target date<input");expect(screen).toContain("Individual phase timing may change as evidence comes in")});
 it("captures phase timing conversationally and keeps implementation terms out of labels",()=>{expect(screen).toContain("When should this phase begin?");expect(screen).toContain("Planned duration");expect(screen).toContain("Expected phase review:");expect(screen).not.toContain(">Timing<select")});
 it("uses coaching language in interpretation and review",()=>{expect(screen).toContain("Here’s what I understood");expect(screen).toContain("What success looks like");expect(screen).toContain("What happens next:");expect(screen).toContain("I need a little more detail")});
 it("avoids generic phase names and parser-like purpose copy",()=>{expect(interpreter).not.toContain('return "Focused Progress"');expect(interpreter).not.toContain("Make focused progress on the stated intent");expect(interpreter).toContain('return "Working title"');expect(interpreter).toContain('return "Lean Mass Build"')});
});
