import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source=fs.readFileSync(path.resolve(process.cwd(),"src/screens/GoalEditWizardScreen.jsx"),"utf8");

describe("Goal Phase review ownership and ordering clarity",()=>{
 it("shows goal-level conditions as read-only context across phase surfaces",()=>{
  expect(source).toContain("function GoalConditions");
  expect(source).toContain("draft.workingPlan.guardrails");
  expect(source).toContain("This stays in effect during every phase.");
  expect(source.match(/<GoalConditions/g)?.length).toBeGreaterThanOrEqual(3);
  expect(source).toContain("ownershipNotes:(draft.workingPlan.guardrails??[])");
  expect(source).not.toContain("What should stay protected");
 });
 it("keeps phase protections empty until the user explicitly opens the editor",()=>{
  expect(source).toContain("Add a phase-specific protection");
  expect(source).toContain("Add something that should apply only during this phase.");
  expect(source).toContain("No additional phase-specific protections.");
  expect(source).toContain("useState(phase.guardrails.length>0)");
 });
 it("uses plain ordering language and accessible boundary controls",()=>{
  expect(source).toContain("Move up</button>");
  expect(source).toContain("Move down</button>");
  expect(source).toContain("Move ${phase.name} up");
  expect(source).toContain("Move ${phase.name} down");
  expect(source).toContain("disabled={!index}");
  expect(source).toContain("disabled={index===count-1}");
  expect(source).not.toContain(">Move earlier<");
  expect(source).not.toContain(">Move later<");
 });
 it("labels final-review ownership without duplicating goal conditions per phase",()=>{
  expect(source).toContain("hasPhaseProtections=planned.some");
  expect(source).toContain("<h4 className=\"font-black\">Phase-specific</h4>");
  expect(source).toContain("Phase-specific protections:</b> No additional protections.");
 });
});
