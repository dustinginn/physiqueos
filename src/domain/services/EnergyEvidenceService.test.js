import { describe, expect, it } from "vitest";
import { getEnergyEvidenceReport } from "./EnergyEvidenceService";

describe("EnergyEvidenceService", () => {
  it("defaults to Build Lean Mass and honors every explicit context", async () => {
    const currentDate = new Date("2026-07-24T12:00:00-07:00");
    const build = await getEnergyEvidenceReport({ currentDate });
    const visible = await getEnergyEvidenceReport({
      context: "visible-abs",
      currentDate,
    });
    const all = await getEnergyEvidenceReport({ context: "all", currentDate });

    expect(build.timeline.contextId).toBe("build-lean-mass");
    expect(build.days.every((day) => day.date >= "2026-07-19")).toBe(true);
    expect(
      visible.days.every(
        (day) => day.date >= "2026-05-24" && day.date <= "2026-07-18"
      )
    ).toBe(true);
    expect(all.timeline.selectedLabel).toBe("All Energy");
    expect(all.days.length).toBeGreaterThanOrEqual(build.days.length);
    expect(all.days.length).toBeGreaterThanOrEqual(visible.days.length);
  });

  it("falls back safely for invalid contexts and uses the production path", async () => {
    const report = await getEnergyEvidenceReport({
      context: "not-a-context",
      currentDate: new Date("2026-07-24T12:00:00-07:00"),
    });
    expect(report.timeline.contextId).toBe("build-lean-mass");
    expect(report.timeline.currentPath).toBe("/progress/energy");
  });

  it("drives summary, graph, histories, and drawers from scoped collections", async () => {
    const preview = await getEnergyEvidenceReport({
      context: "all",
      currentDate: new Date("2026-07-24T12:00:00-07:00"),
    });
    const complete = preview.days.filter((day) => day.energyBalance != null);

    expect(preview.summary.completeDays).toBe(complete.length);
    expect(preview.days.every((day) => !("totalExpenditure" in day))).toBe(true);
    expect(preview.weeks.flatMap((week) => week.evidenceDayCount).length).toBe(
      preview.weeks.length
    );
    expect(preview.dataSources.map((source) => source.name)).toEqual([
      "Nutrition",
      "Activity",
      "DEXA",
      "Apple Health",
    ]);
    expect(preview.recentFourWeeks).toEqual(preview.weeks.slice(0, 4));
    expect(preview.latestEvidenceDate).toBe(preview.days[0].date);
  });

  it("uses July 18 RMR for the five complete Build Lean Mass days", async () => {
    const preview = await getEnergyEvidenceReport({
      currentDate: new Date("2026-07-24T12:00:00-07:00"),
    });
    const complete = preview.days.filter(
      (day) => day.completeness === "complete"
    );

    expect(complete.map((day) => day.date)).toEqual([
      "2026-07-24",
      "2026-07-23",
      "2026-07-22",
      "2026-07-21",
      "2026-07-19",
    ]);
    expect(complete.every((day) => day.rmr === 1794)).toBe(true);
    expect(complete.every((day) => day.rmrScanDate === "2026-07-18")).toBe(true);
    expect(preview.summary.completeDays).toBe(5);
    expect(preview.summary.evidenceDays).toBe(6);
    expect(
      preview.days.find((day) => day.date === "2026-07-20")?.completeness
    ).toBe("no-paired-evidence");
    expect(
      preview.days.find((day) => day.date === "2026-07-24")?.completeness
    ).toBe("complete");
  });
});
