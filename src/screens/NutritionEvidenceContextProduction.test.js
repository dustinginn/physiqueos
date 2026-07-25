import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getNutritionHistoryPresentation,
  NUTRITION_HISTORY_PREVIEW_LIMIT,
} from "./ProgressPlaceholderScreen";

const landing = fs.readFileSync(
  new URL("./ProgressPlaceholderScreen.jsx", import.meta.url),
  "utf8"
);
const detail = fs.readFileSync(
  new URL("./NutritionKnowledgeScreen.jsx", import.meta.url),
  "utf8"
);
const historySheet = fs.readFileSync(
  new URL("../components/nutrition/NutritionHistorySheet.jsx", import.meta.url),
  "utf8"
);
const route = fs.readFileSync(
  new URL("../app/progress/nutrition/page.js", import.meta.url),
  "utf8"
);
const nutritionPresentation = landing.slice(
  landing.indexOf("function NutritionEvidenceReport"),
  landing.indexOf("function TrainingEvidenceReport")
);

describe("production Nutrition Evidence Context presentation", () => {
  it("inserts the shared selector only on the landing page", () => {
    expect(route).toContain("getNutritionTimelineReport");
    expect(landing).toContain('ariaLabel="Nutrition evidence context"');
    expect(landing).toContain('currentPath="/progress/nutrition"');
    expect(detail).not.toContain("TrainingTimelineSelector");
    expect(detail).not.toContain("Evidence Context");
  });

  it("uses a three-record inline preview and passes complete scoped history to the sheet", () => {
    expect(NUTRITION_HISTORY_PREVIEW_LIMIT).toBe(3);
    expect(landing).toContain("<NutritionHistorySheet days={fullHistory}");
    expect(landing).toContain("<NutritionDayHistory days={previewHistory}");
    expect(landing).toContain("showAll ?");
    expect(historySheet).toContain("<FloatingSheet");
    expect(historySheet).toContain("href={day.href}");
    expect(historySheet).toContain("Source: {day.sourceEvidence.join");
    expect(historySheet).toContain("Show All");
  });

  it("shows Show All only when complete history exceeds the preview", () => {
    const history = Array.from({ length: 5 }, (_, index) => ({
      date: `2026-07-${23 - index}`,
      id: `day-${index}`,
    }));
    const long = getNutritionHistoryPresentation(history);
    const exact = getNutritionHistoryPresentation(history.slice(0, 3));
    const empty = getNutritionHistoryPresentation([]);

    expect(long.previewHistory).toEqual(history.slice(0, 3));
    expect(long.fullHistory).toBe(history);
    expect(long.showAll).toBe(true);
    expect(exact.previewHistory).toEqual(history.slice(0, 3));
    expect(exact.showAll).toBe(false);
    expect(empty).toEqual({
      fullHistory: [],
      previewHistory: [],
      showAll: false,
    });
  });

  it("removes Nutrition protocol and Related Goals presentation while preserving required sections", () => {
    expect(landing).toContain('report.id !== "nutrition"');
    expect(landing).toContain('mode="data-sources"');
    expect(nutritionPresentation).not.toContain("Current Nutrition Protocol");
    expect(nutritionPresentation).not.toContain("CurrentNutritionProtocolCard");
    expect(nutritionPresentation).not.toContain("View protocol details");
    expect(nutritionPresentation).not.toContain("User-defined");
    expect(nutritionPresentation).not.toContain("Not set");
    expect(landing).toContain('title="Reporting"');
    expect(landing).toContain('title="Nutrition Areas"');
  });

  it("retains protocol architecture and the independent protocol route", () => {
    const service = fs.readFileSync(
      new URL("../domain/services/ProgressReportingService.js", import.meta.url),
      "utf8"
    );
    const protocolRoute = fs.readFileSync(
      new URL("../app/profile/protocols/page.js", import.meta.url),
      "utf8"
    );

    expect(service).toContain("currentNutritionProtocol:");
    expect(landing).toContain("function CurrentNutritionProtocolCard");
    expect(protocolRoute.length).toBeGreaterThan(0);
  });

  it("preserves mobile shell and safe wrapping primitives", () => {
    expect(landing).toContain("max-w-[393px]");
    expect(historySheet).toContain("min-w-0");
    expect(historySheet).toContain("pb-6");
    expect(landing).not.toMatch(/w-screen|min-w-\[/);
  });
});
