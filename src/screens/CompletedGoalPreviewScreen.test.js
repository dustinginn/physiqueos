import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CompletedGoalPreviewScreen from "./CompletedGoalPreviewScreen";
import fs from "node:fs";
import path from "node:path";

const journey = {
  hero: { title: "Visible Abs at Rest", status: "Completed", dates: "May 24 → Jul 18", achievement: "7.7% Body Fat" },
  recap: "A completed journey.",
  highlights: [{ date: "2026-07-18", title: "Visible abs achieved", body: "The finish line aligned." }],
  photos: { beginning: { date: "2026-05-21", href: "/api/private-evidence/founder/photos/first.jpeg" }, completion: { date: "2026-07-18", href: "/api/private-evidence/founder/photos/final.jpeg" }, historyHref: "/progress/photos" },
  finalComposition: { date: "2026-07-18", bodyFat: "7.7%", leanMass: "147.5 lb", fatMass: "12.8 lb", weight: "167.4 lb", narrative: "The scan closed the journey.", briefingHref: "/briefings/dexa/final" },
  achievedBy: ["Lean mass largely preserved."],
  unlocked: { title: "Build Lean Mass", href: "/goals/build-lean-mass", body: "The next journey." },
};

describe("CompletedGoalPreviewScreen", () => {
  it("renders the permanent-story rhythm and canonical navigation", () => {
    const html = renderToStaticMarkup(React.createElement(CompletedGoalPreviewScreen, { journey }));
    for (const text of ["Completed goal", "Journey Recap", "Journey Highlights", "Beginning", "Completion", "Final body composition", "View Final Goal Briefing", "How This Goal Was Achieved", "What this unlocked"]) expect(html).toContain(text);
    expect(html).toContain('href="/briefings/dexa/final"');
    expect(html).toContain('href="/goals/build-lean-mass"');
    expect(html).not.toMatch(/Supporting Goal|Maintain 8-9% Body Fat/);
  });

  it("preserves the return destination when opened from You", () => {
    const html = renderToStaticMarkup(React.createElement(CompletedGoalPreviewScreen, { from: "you", journey }));
    expect(html).toContain('href="/profile"');
    expect(html).toContain(">You<");
  });

  it("uses the canonical centered mobile shell with bottom-navigation clearance", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/screens/CompletedGoalPreviewScreen.jsx"), "utf8");
    expect(source).toContain("mx-auto min-h-screen w-full max-w-[393px] overflow-x-hidden");
    expect(source).toContain("pb-[calc(8rem+env(safe-area-inset-bottom))]");
    expect(source).toContain("grid grid-cols-1");
    expect(source).toContain('sizes="361px"');
    expect(source).not.toMatch(/max-w-\[720px\]|sm:px-|sm:p-|w-screen|grid-cols-\[1fr_28px_1fr\]/);
  });

  it("relies on the root-owned navigation and does not mount a duplicate", () => {
    const screen = fs.readFileSync(path.resolve(process.cwd(), "src/screens/CompletedGoalPreviewScreen.jsx"), "utf8");
    const layout = fs.readFileSync(path.resolve(process.cwd(), "src/app/layout.js"), "utf8");
    expect(layout).toContain("<FloatingBottomNavigation />");
    expect(screen).not.toMatch(/FloatingBottomNavigation|<BottomNavigation|<BottomNav/);
  });

  it("documents the mandatory mobile-first and preview-shell rules once", () => {
    const guide = fs.readFileSync(path.resolve(process.cwd(), "docs/CODEX.md"), "utf8");
    expect(guide.match(/Mandatory Mobile-First Product Rule/g)).toHaveLength(1);
    expect(guide).toContain("design for 393 px first");
    expect(guide).toContain("Verify graceful behavior at 360 px");
    expect(guide).toContain("Desktop must center and preserve the mobile shell");
    expect(guide).toContain("Preview routes must use the same canonical mobile shell");
    expect(guide).toContain("never claim mobile verification without actual inspection");
  });
});
