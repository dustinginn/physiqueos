import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { reconcileDailyBriefingAction } from "./HomeBriefingService";

const homeSource = fs.readFileSync(
  new URL("./HomeBriefingService.js", import.meta.url),
  "utf8"
);
const dailyRoute = fs.readFileSync(
  new URL("../../app/briefing/daily/page.js", import.meta.url),
  "utf8"
);
const reviewRoute = fs.readFileSync(
  new URL("../../app/briefings/review/[artifactId]/page.js", import.meta.url),
  "utf8"
);

describe("Home briefing availability", () => {
  it("suppresses the time-derived Daily CTA when the exact previous-day artifact is missing", () => {
    expect(reconcileDailyBriefingAction(actionPlan(), null)).toMatchObject({
      currentAction: null,
    });
  });

  it("routes a valid Daily CTA to the exact artifact", () => {
    expect(reconcileDailyBriefingAction(actionPlan(), {
      id: "daily_briefing_20260723",
    })).toMatchObject({
      currentAction: {
        label: "Open Daily Briefing",
        href: "/briefings/review/daily_briefing_20260723",
      },
    });
  });

  it("does not alter unrelated current actions", () => {
    const plan = {
      ...actionPlan(),
      currentAction: { id: "weight", label: "Morning Weight", href: "/check-in/morning" },
    };
    expect(reconcileDailyBriefingAction(plan, null)).toBe(plan);
  });

  it("keeps Home rendering read-only and checks the exact previous-day window", () => {
    expect(homeSource).toContain("createPreviousDayEvidenceWindow");
    expect(homeSource).toContain("getBriefingByEvidenceWindow");
    expect(homeSource).not.toContain("createMidweekBriefingService");
    expect(homeSource).not.toContain("generateForCurrentWindow");
  });

  it("keeps briefing GET routes read-only and exact artifact review type-safe", () => {
    expect(dailyRoute).not.toMatch(/\.createDailyBriefing\(|generateForCurrentWindow|\.publish\(|backfill/i);
    expect(reviewRoute).toContain("resolveBriefingReviewArtifact");
    expect(reviewRoute).toContain('artifact.cadence === "midweek"');
    expect(reviewRoute).not.toMatch(/\.createDailyBriefing\(|generateForCurrentWindow|\.publish\(/i);
  });
});

function actionPlan() {
  return {
    currentAction: {
      id: "daily-briefing",
      label: "Open Daily Briefing",
      href: "/briefing/daily",
    },
    upcomingActions: [],
    deferredActions: [],
    expiredActions: [],
  };
}
