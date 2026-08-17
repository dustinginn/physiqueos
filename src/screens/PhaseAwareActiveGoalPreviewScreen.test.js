import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { findGovernanceLanguageLeaks } from "../domain/presentation/coachingLanguageBoundary";

describe("PhaseAwareActiveGoalPreviewScreen",()=>{
  const source=fs.readFileSync("src/screens/PhaseAwareActiveGoalPreviewScreen.jsx","utf8");
  it("uses the canonical mobile shell and safe-area clearance",()=>{expect(source).toMatch(/max-w-\[393px\]/);expect(source).toMatch(/safe-area-inset-bottom/);expect(source).toMatch(/overflow-x-hidden/);});
  it("keeps the preview read-only and links to existing destinations",()=>{expect(source).toMatch(/Review Strategy/);expect(source).toMatch(/Review Protocols/);expect(source).not.toMatch(/<form|action=/);});
  it("places Training Progress after Evidence Anchors without a duplicate training anchor",()=>{expect(source.indexOf('title="Evidence Anchors"')).toBeLessThan(source.indexOf('<TrainingProgress'));expect(source.indexOf('<TrainingProgress')).toBeLessThan(source.indexOf('title="Evidence Turning Points"'));expect(source).not.toMatch(/title="Training progression"/);});
  it("supports waiting, forming, ready, and limited presentations without placeholder charts",()=>{for(const state of ["forming","ready","limited"])expect(source).toContain(state);expect(source).toContain("First four-week review");expect(source).toContain("PhysiqueOS will compare");expect(source).not.toMatch(/<canvas|<svg|placeholder chart/i);});

  // Static JSX copy is a presentation-boundary bypass path: generated-string tests alone
  // don't catch a hardcoded label like "Current decision boundary" baked directly into a
  // screen component. Scan the raw source for the same governance-language denylist used
  // for generated coaching prose.
  it("contains no governance-language leaks anywhere in its static copy", () => {
    expect(findGovernanceLanguageLeaks(source)).toEqual([]);
  });

  it("translates the terminal-phase state into next-checkpoint coaching without graph/lifecycle language, generically", () => {
    expect(source).not.toMatch(/final planned phase/i);
    expect(source).not.toMatch(/terminal phase/i);
    expect(source).not.toMatch(/assumed additional phase/i);
    expect(source).not.toMatch(/Lean Mass Build/);
    expect(source).toMatch(/Goal review comes next/);
    expect(source).toMatch(/starting a new phase, adjusting the current plan, or confirming the goal is complete/);
  });
});
