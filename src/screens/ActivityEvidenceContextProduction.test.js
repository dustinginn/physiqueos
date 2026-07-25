import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_HISTORY_PREVIEW_LIMIT,
  getActivityHistoryPresentation,
} from "./ProgressPlaceholderScreen";

const landing = fs.readFileSync(
  new URL("./ProgressPlaceholderScreen.jsx", import.meta.url),
  "utf8"
);
const sheet = fs.readFileSync(
  new URL("../components/activity/ActivityHistorySheet.jsx", import.meta.url),
  "utf8"
);
const route = fs.readFileSync(
  new URL("../app/progress/activity/page.js", import.meta.url),
  "utf8"
);
const activityPresentation = landing.slice(
  landing.indexOf("function ActivityEvidenceReport"),
  landing.indexOf("function LatestActivityDayCard")
);
const relatedGoalsPresentation = landing.slice(
  landing.lastIndexOf('{report.id !== "training"', landing.indexOf('mode="related-goals"')),
  landing.indexOf('mode="data-sources"')
);

describe("production Activity Evidence Context presentation", () => {
  it("inserts the canonical selector on the Activity landing page", () => {
    expect(route).toContain("getActivityTimelineReport");
    expect(landing).toContain('ariaLabel="Activity evidence context"');
    expect(landing).toContain('currentPath="/progress/activity"');
  });

  it("uses a three-record preview and passes complete scoped history to the sheet", () => {
    const days = Array.from({ length: 5 }, (_, index) => ({ id: `day-${index}` }));
    const result = getActivityHistoryPresentation(days);

    expect(ACTIVITY_HISTORY_PREVIEW_LIMIT).toBe(3);
    expect(result.previewHistory).toEqual(days.slice(0, 3));
    expect(result.fullHistory).toBe(days);
    expect(result.showAll).toBe(true);
    expect(getActivityHistoryPresentation(days.slice(0, 3)).showAll).toBe(false);
    expect(getActivityHistoryPresentation([]).showAll).toBe(false);
    expect(activityPresentation).toContain("<ActivityHistorySheet days={fullHistory}");
    expect(activityPresentation).toContain("<ActivityDayHistory days={previewHistory}");
    expect(sheet).toContain("<FloatingSheet");
    expect(sheet).toContain("Show All");
    expect(sheet).toContain("day.protocolStatus");
  });

  it("removes only Activity protocol and Related Goals presentation", () => {
    expect(activityPresentation).not.toContain("Current Activity Protocol");
    expect(activityPresentation).not.toContain("CurrentActivityProtocolCard");
    for (const reportId of ["photos", "training", "nutrition", "activity"]) {
      expect(relatedGoalsPresentation).toContain(`report.id !== "${reportId}"`);
    }
    expect(relatedGoalsPresentation).not.toContain('report.id !== "weight"');
    expect(landing).toContain('mode="data-sources"');
  });

  it("preserves Activity Areas and linked Training presentation", () => {
    expect(activityPresentation).toContain('title="Activity Areas"');
    expect(activityPresentation).toContain('title="Linked Training Context"');
    expect(activityPresentation).toContain("report.linkedTrainingContext");
    expect(activityPresentation).toContain('title="Recent Activity History"');
  });

  it("preserves the centered mobile shell and bottom-safe sheet", () => {
    expect(landing).toContain("max-w-[393px]");
    expect(sheet).toContain("min-w-0");
    expect(sheet).toContain("pb-6");
    expect(landing).not.toMatch(/w-screen|min-w-\[/);
  });
});
