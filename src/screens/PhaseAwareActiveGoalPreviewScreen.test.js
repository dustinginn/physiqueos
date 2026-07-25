import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("PhaseAwareActiveGoalPreviewScreen",()=>{
  const source=fs.readFileSync("src/screens/PhaseAwareActiveGoalPreviewScreen.jsx","utf8");
  it("uses the canonical mobile shell and safe-area clearance",()=>{expect(source).toMatch(/max-w-\[393px\]/);expect(source).toMatch(/safe-area-inset-bottom/);expect(source).toMatch(/overflow-x-hidden/);});
  it("keeps the preview read-only and links to existing destinations",()=>{expect(source).toMatch(/Review Strategy/);expect(source).toMatch(/Review Protocols/);expect(source).not.toMatch(/<form|action=/);});
  it("places Training Progress after Evidence Anchors without a duplicate training anchor",()=>{expect(source.indexOf('title="Evidence Anchors"')).toBeLessThan(source.indexOf('<TrainingProgress'));expect(source.indexOf('<TrainingProgress')).toBeLessThan(source.indexOf('title="Evidence Turning Points"'));expect(source).not.toMatch(/title="Training progression"/);});
  it("supports waiting, forming, ready, and limited presentations without placeholder charts",()=>{for(const state of ["forming","ready","limited"])expect(source).toContain(state);expect(source).toContain("First four-week review");expect(source).toContain("PhysiqueOS will compare");expect(source).not.toMatch(/<canvas|<svg|placeholder chart/i);});
});
