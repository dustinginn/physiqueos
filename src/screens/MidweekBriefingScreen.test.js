import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createMidweekEvidenceWindow } from "../domain/services/BriefingEvidenceWindowService";
import { composeMidweekBriefingPreview } from "../domain/services/MidweekBriefingPreviewService";
import { midweekPreviewFixtures } from "../fixtures/midweekBriefingPreview";
import MidweekBriefingScreen from "./MidweekBriefingScreen";

describe("MidweekBriefingScreen", () => {
  it("renders one concise coaching narrative without internal continuity or coverage UI", () => {
    const window=createMidweekEvidenceWindow({now:new Date("2026-07-22T19:00:00Z"),timeZone:"America/Los_Angeles"});
    const briefing=composeMidweekBriefingPreview({...midweekPreviewFixtures.current,window,generatedAt:"2026-07-22T19:00:00Z"});
    const html=renderToStaticMarkup(React.createElement(MidweekBriefingScreen,{briefing}));
    for(const text of ["Midweek Briefing","Energy Balance","Weight Context","Training Response","Body Composition","Current Baseline","Coach&#x27;s Take","💡","Biggest Takeaway","🧠","My Recommendation","🎯","Through Sunday"])expect(html).toContain(text);
    for(const emoji of ["💡","🧠","🎯"])expect(html).toContain(`<span aria-hidden="true">${emoji}</span>`);
    expect(html).toContain('<span class="text-white/70">Biggest Takeaway</span>');
    expect(html.indexOf("Energy Balance")).toBeLessThan(html.indexOf("Weight Context"));
    expect(html.indexOf("Weight Context")).toBeLessThan(html.indexOf("Training Response"));
    expect(html).toContain('data-chart="midweek-energy"');
    for(const text of ["Calories eaten: 2,480 kcal","Estimated expenditure: 2,556 kcal","Energy balance: −76 kcal","group-open:block","group-hover:block"])expect(html).toContain(text);
    expect(html).not.toContain('data-chart="midweek-training"');
    expect(html).not.toContain('data-chart="weight"');
    for(const hidden of ["Phase Progress","Midweek Decision","Questions for Sunday","Evidence coverage","Supporting calculations","Estimate available","Observed movements","confidence","comparable window","directional context","logged days"])expect(html).not.toContain(hidden);
    expect(html).not.toMatch(/Still on track|Trend context updated|Evidence reviewed|Continue monitoring/);
    expect(html).toContain("max-w-[393px]");
    expect(html).toContain("overflow-x-hidden");
    expect(html).toContain("pb-32");
  });
});
