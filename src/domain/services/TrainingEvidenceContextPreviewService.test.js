import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getTrainingEvidenceContextPreview } from "./TrainingEvidenceContextPreviewService";
import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { createProgressReportingService } from "./ProgressReportingService";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("Training Evidence Context preview", () => {
  it("adds current-goal interpretation without writing runtime state", async () => {
    const before = fs.readFileSync(storePath, "utf8");
    const result = await getTrainingEvidenceContextPreview({
      currentDate: new Date("2026-07-23T12:00:00Z"),
    });
    expect(result).toMatchObject({
      contextId: "all",
      selectedLabel: "All Training",
      startDate: null,
      endDate: null,
      goalScoped: false,
      type: "all_history",
    });
    expect(result.options.map((item) => item.label)).toEqual([
      "Build Lean Mass",
      "Visible Abs",
      "All Training",
    ]);
    expect(fs.readFileSync(storePath, "utf8")).toBe(before);
  });

  it("resolves completed and all-history lifecycle windows", async () => {
    const [goal, historical, all] = await Promise.all([
      getTrainingEvidenceContextPreview({ context: "build-lean-mass" }),
      getTrainingEvidenceContextPreview({ context: "visible-abs" }),
      getTrainingEvidenceContextPreview({ context: "all" }),
    ]);
    expect(goal.startDate).toBe("2026-07-19");
    expect(historical).toMatchObject({
      startDate: "2026-05-24",
      endDate: "2026-07-18",
      type: "completed_goal",
    });
    expect(all).toMatchObject({
      startDate: null,
      endDate: null,
      goalScoped: false,
      type: "all_history",
    });
  });

  it("keeps the production route and repositories free of preview coupling", () => {
    const production = fs.readFileSync("src/app/progress/training/page.js", "utf8");
    const preview = fs.readFileSync("src/app/evidence/training/preview/page.js", "utf8");
    expect(production).not.toContain("TrainingEvidenceContextPreview");
    expect(preview).not.toMatch(/save|persist|complete|delete/);
  });

  it("scopes latest day and recent history while retaining the global movement library", async () => {
    const service = createProgressReportingService({ repositories: FounderRepositories });
    const [all, build, visible] = await Promise.all([
      service.getPlaceholderReport("training"),
      service.getPlaceholderReport("training", undefined, {
        dateWindow: { startDate: "2026-07-19", endDate: "2026-07-23" },
      }),
      service.getPlaceholderReport("training", undefined, {
        dateWindow: { startDate: "2026-05-24", endDate: "2026-07-18" },
      }),
    ]);
    expect(build.trainingDays.every((day) => day.date >= "2026-07-19" && day.date <= "2026-07-23")).toBe(true);
    expect(visible.trainingDays.every((day) => day.date >= "2026-05-24" && day.date <= "2026-07-18")).toBe(true);
    expect(build.trainingDays.length).toBeLessThanOrEqual(all.trainingDays.length);
    expect(visible.trainingDays.length).toBeLessThanOrEqual(all.trainingDays.length);
    expect(build.trainingLibrary).toEqual(all.trainingLibrary);
    expect(visible.trainingLibrary).toEqual(all.trainingLibrary);
    expect(build.latestTrainingDay?.date ?? null).toBe(build.trainingDays[0]?.date ?? null);
  });
});
