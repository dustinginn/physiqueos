import fs from "node:fs";
import { describe, expect, it } from "vitest";

const screen = fs.readFileSync(
  new URL("./EnergyEvidenceScreen.jsx", import.meta.url),
  "utf8"
);
const previewRoute = fs.readFileSync(
  new URL("../app/preview/progress/energy/page.js", import.meta.url),
  "utf8"
);
const productionRoute = fs.readFileSync(
  new URL("../app/progress/energy/page.js", import.meta.url),
  "utf8"
);

describe("Energy Evidence production safety", () => {
  it("keeps the preview isolated and renders the approved factual sections", () => {
    expect(productionRoute).toContain("getEnergyEvidenceReport");
    expect(previewRoute).toContain("getEnergyEvidenceReport");
    expect(productionRoute).toContain("<EnergyEvidenceScreen");
    expect(previewRoute).toContain("<EnergyEvidenceScreen");
    for (const section of [
      "Period Summary",
      "Energy Over Time",
      "Weekly Energy Balance",
      "Weekly History",
      "Recent Daily Energy",
      "data-sources",
    ]) {
      expect(screen).toContain(section);
    }
    expect(screen.indexOf("Energy Over Time")).toBeLessThan(
      screen.indexOf("Weekly Energy Balance")
    );
  });

  it("does not add protocols, Related Goals, or interpretation", () => {
    expect(screen).not.toMatch(
      /Current Energy Strategy|Maintenance Calibration|Related Goals|View Strategy|on track|increase calories|reduce activity/i
    );
  });

  it("labels the corrected model as estimated and never renders Apple totals", () => {
    expect(screen).toContain("Estimated expenditure");
    expect(screen).not.toMatch(/Total expenditure|totalCalories/);
  });

  it("applies shared semantic metric styles to summaries and reusable history rows", () => {
    expect(screen).toContain("getEnergyMetricValueClass");
    expect(screen).toContain('metric="intake"');
    expect(screen).toContain('metric="expenditure"');
    expect(screen).toContain('metric="balance"');
    expect(screen).toContain("<WeeklyRows weeks={preview.weeks}");
    expect(screen).toContain("<DailyRows days={preview.days}");
    expect(screen).not.toMatch(/energyBalance\s*[<>]=?|text-red|text-emerald/);
  });

  it("only exposes Show All when a scoped collection exceeds the preview limit", () => {
    expect(screen).toContain(
      "preview.weeks.length > ENERGY_HISTORY_PREVIEW_LIMIT"
    );
    expect(screen).toContain(
      "preview.days.length > ENERGY_HISTORY_PREVIEW_LIMIT"
    );
    expect(screen).toContain("<FloatingSheet");
  });

  it("keeps the line range isolated from recent bars, history, summary, and days", () => {
    expect(screen).toContain("weeks={preview.weeks}");
    expect(screen).toContain("weeks={preview.recentFourWeeks}");
    expect(screen).toContain(
      "preview.weeks.slice(0, ENERGY_HISTORY_PREVIEW_LIMIT)"
    );
    expect(screen).toContain(
      "preview.days.slice(0, ENERGY_HISTORY_PREVIEW_LIMIT)"
    );
  });
});
