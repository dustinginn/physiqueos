import fs from "node:fs";
import path from "node:path";
import { describe,expect,it } from "vitest";

const source=fs.readFileSync(path.resolve(process.cwd(),"src/screens/GoalEditWizardScreen.jsx"),"utf8");

describe("multi-phase intent review presentation",()=>{
 it("summarizes the whole interpreted structure before individual review",()=>{expect(source).toContain("Here’s the phase structure I understood");expect(source).toContain("Review Phase {index+1}");expect(source).toContain("Revise the whole plan")});
 it("supports one-at-a-time acceptance and explicit skipping",()=>{expect(source).toContain("Accept this phase");expect(source).toContain("skipInterpretedPhaseProposal");expect(source).toContain("Skip this phase")});
 it("requires confirmation before discarding pending interpretations",()=>{expect(source).toContain("Discard the remaining unaccepted phases and start over?");expect(source).toContain("discardPendingPhaseProposals")});
 it("keeps unresolved proposal modes behind the phase-section gate",()=>{expect(source).toContain('step==="phases"&&!isPhaseSectionResolved(draft)')});
});
