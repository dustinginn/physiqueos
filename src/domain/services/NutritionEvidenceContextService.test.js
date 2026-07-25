import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { EVIDENCE_CONTEXT_WINDOWS } from "./EvidenceContextWindows";
import { getNutritionTimelineReport } from "./NutritionEvidenceContextService";
import {
  createProgressReportingService,
  getNutritionReportExtras,
  getNutritionSourceLabels,
} from "./ProgressReportingService";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("Nutrition Evidence Context", () => {
  it("defaults to Build Lean Mass and honors valid explicit contexts", async () => {
    const [fallback, invalid, visible, all] = await Promise.all([
      getNutritionTimelineReport({
        currentDate: new Date("2026-07-23T12:00:00Z"),
      }),
      getNutritionTimelineReport({
        context: "not-a-context",
        currentDate: new Date("2026-07-23T12:00:00Z"),
      }),
      getNutritionTimelineReport({ context: "visible-abs" }),
      getNutritionTimelineReport({ context: "all" }),
    ]);

    expect(fallback.timeline).toMatchObject({
      contextId: "build-lean-mass",
      startDate: EVIDENCE_CONTEXT_WINDOWS["build-lean-mass"].startDate,
      endDate: "2026-07-23",
    });
    expect(invalid.timeline.contextId).toBe("build-lean-mass");
    expect(visible.timeline).toMatchObject({
      contextId: "visible-abs",
      ...EVIDENCE_CONTEXT_WINDOWS["visible-abs"],
    });
    expect(all.timeline).toMatchObject({
      contextId: "all",
      selectedLabel: "All Nutrition",
      startDate: null,
      endDate: null,
    });
    expect(fallback.timeline.options.map((option) => option.label)).toEqual([
      "Build Lean Mass",
      "Visible Abs",
      "All Nutrition",
    ]);
  }, 30000);

  it("uses one inclusive scoped dataset for latest and complete history", async () => {
    const before = fs.readFileSync(storePath);
    const [build, visible, all] = await Promise.all([
      getNutritionTimelineReport({
        context: "build-lean-mass",
        currentDate: new Date("2026-07-23T12:00:00Z"),
      }),
      getNutritionTimelineReport({ context: "visible-abs" }),
      getNutritionTimelineReport({ context: "all" }),
    ]);

    expect(build.report.nutritionDays.every((day) => day.date >= "2026-07-19")).toBe(true);
    expect(visible.report.nutritionDays.every(
      (day) => day.date >= "2026-05-24" && day.date <= "2026-07-18"
    )).toBe(true);
    expect(visible.report.latestNutrition.date).toBe("2026-07-18");
    expect(build.report.latestNutrition.date).toBe("2026-07-23");
    expect(all.report.nutritionDays.length).toBeGreaterThan(build.report.nutritionDays.length);
    expect(all.report.nutritionDays.length).toBeGreaterThan(visible.report.nutritionDays.length);
    expect(build.report.nutritionDays[0]).toEqual(build.report.latestNutrition);
    expect(visible.report.nutritionDays[0]).toEqual(visible.report.latestNutrition);
    expect(build.report.nutritionDays.map((day) => day.date)).toEqual(
      build.report.nutritionDays.map((day) => day.date).slice().sort().reverse()
    );
    expect(fs.readFileSync(storePath)).toEqual(before);
  }, 30000);

  it("does not fall back to complete history or target context when the scope is empty", async () => {
    const report = await createProgressReportingService({
      repositories: FounderRepositories,
    }).getPlaceholderReport("nutrition", undefined, {
      dateWindow: { startDate: "2099-01-01", endDate: "2099-01-02" },
    });

    expect(report.latestNutrition).toBeNull();
    expect(report.nutritionDays).toEqual([]);
  }, 30000);

  it("keeps acquisition provenance separate from recognized applications", () => {
    const screenshot = {
      source: {
        modality: "screenshot",
        application: "Cronometer",
        source_artifact_refs: ["IMG_1616.jpeg"],
      },
    };
    const connector = {
      source: {
        modality: "api",
        application: "Cronometer",
        integration: "cronometer",
      },
    };

    expect(getNutritionSourceLabels(screenshot)).toEqual(["Screenshot"]);
    expect(getNutritionSourceLabels(connector)).toEqual(["Cronometer"]);
    expect(getNutritionSourceLabels({ source: { modality: "manual" } })).toEqual(["Manual"]);
    expect(getNutritionSourceLabels({ source: { modality: "import" } })).toEqual(["Import"]);
    expect(screenshot.source.application).toBe("Cronometer");
  });

  it("keeps scoped empty-state behavior isolated from the canonical unscoped detail report", () => {
    const unscoped = getNutritionReportExtras({
      nutritionContext: { id: "context", estimatedDailyCaloricIntake: null },
      nutritionDays: [],
    });
    const scoped = getNutritionReportExtras({
      nutritionContext: { id: "context", estimatedDailyCaloricIntake: null },
      nutritionDays: [],
      nutritionEvidenceScoped: true,
    });

    expect(unscoped.latestNutrition?.id).toBe("context");
    expect(scoped.latestNutrition).toBeNull();
    expect(scoped.currentNutritionProtocol).toEqual(unscoped.currentNutritionProtocol);
  });
});
