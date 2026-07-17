import fs from "node:fs";
import { describe, expect, it } from "vitest";
const source=fs.readFileSync(new URL("./NarrativeGoalPreviewScreen.jsx",import.meta.url),"utf8");

describe("NarrativeGoalPreviewScreen",()=>{
  it("renders the approved journey architecture in order",()=>{const sections=["journey-hero","journey-map","Ground covered","Road ahead","completion-criteria","Current strategy","evidence-turning-points","Supporting protocols","narrative.transition&&"];let cursor=-1;for(const value of sections){const next=source.indexOf(value);expect(next).toBeGreaterThan(cursor);cursor=next;}});
  it("keeps the canonical mobile reading column without horizontal overflow",()=>{expect(source).toContain("max-w-[393px]");expect(source).toContain("overflow-x-hidden");expect(source).not.toMatch(/min-w-\[|w-screen|grid-cols-3/);});
  it("keeps qualitative objective maps free of fabricated progress bars",()=>{expect(source).toContain("Number.isFinite(narrative.journeyMap.progress)");});
  it("does not expose engine language or unrelated completion criteria",()=>{expect(source).not.toMatch(/canonical|eligible|reconciliation|calibration|governing constraint|evidence gap|Lean mass preserved|Maintain training performance/i);});
  it("uses the concise Home-style label in both confidence wheels",()=>{expect(source).toContain('<ConfidenceRing label="Confidence" size={82} value={narrative.hero.confidence}/>');expect(source).toContain('<ConfidenceRing label="Confidence" size={88} value={narrative.confidence.value}/>');expect(source).not.toContain('label="Goal confidence"');});
  it("returns canonical Goal pages to the Goals hub",()=>{expect(source).toContain('href="/goals"');});
});
