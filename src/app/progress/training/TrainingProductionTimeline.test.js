import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getTrainingTimelineReport } from "../../../domain/services/TrainingEvidenceContextService";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");
const read = (relativePath) => fs.readFileSync(relativePath, "utf8");

describe("production Training timeline port", () => {
  it("uses the production timeline contract across landing, library, and reporting", () => {
    const landing = read("src/app/progress/training/page.js");
    const library = read("src/app/progress/training/library/[[...path]]/page.js");
    const reporting = read("src/app/progress/training/reporting/[reportId]/page.js");

    [landing, library, reporting].forEach((source) => {
      expect(source).toContain("getTrainingTimelineReport");
    });
    expect(landing).toContain("evidenceContext");
    expect(library).toContain("<TrainingTimelineSelector");
    expect(reporting).toContain("<TrainingTimelineSelector");
    expect(library).toContain("showSourceWorkouts: false");
  });

  it("keeps Workout Detail complete and selector-free with canonical return navigation", () => {
    const session = read("src/app/progress/training/session/[sessionId]/page.js");
    expect(session).toContain("resolveTrainingReturnPath");
    expect(session).not.toContain("pageNavigation");
    expect(session).toContain("correctionNavigation");
    expect(session).toContain("getTrainingRootHref(query?.context)");
    expect(session).not.toContain("TrainingTimelineSelector");
    expect(session).toContain('getPlaceholderReport("training")');
  });

  it(
    "scopes temporal evidence while retaining global movement availability without writes",
    async () => {
      const before = fs.readFileSync(storePath);
      const [build, visible, all] = await Promise.all(
        ["build-lean-mass", "visible-abs", "all"].map((context) =>
          getTrainingTimelineReport({ context })
        )
      );

      expect(build.timeline.contextId).toBe("build-lean-mass");
      expect(
        build.report.trainingDays.every((day) => day.date >= "2026-07-19")
      ).toBe(true);
      expect(
        visible.report.trainingDays.every(
          (day) => day.date >= "2026-05-24" && day.date <= "2026-07-18"
        )
      ).toBe(true);
      expect(all.report.trainingDays.length).toBeGreaterThanOrEqual(
        build.report.trainingDays.length
      );
    expect(build.report.trainingBreakdowns).toEqual(
      expect.objectContaining({
        resistance: expect.any(Array),
      })
    );
    expect(
      build.report.trainingBreakdowns.resistance.flatMap((region) =>
        (region.movementFamilies ?? region.muscleGroups ?? []).flatMap(
          (family) => family.exercises ?? []
        )
      ).map((exercise) => exercise.label)
    ).toEqual(
      all.report.trainingBreakdowns.resistance.flatMap((region) =>
        (region.movementFamilies ?? region.muscleGroups ?? []).flatMap(
          (family) => family.exercises ?? []
        )
      ).map((exercise) => exercise.label)
    );
      expect(visible.report.trainingLibrary).toEqual(all.report.trainingLibrary);
      expect(fs.readFileSync(storePath)).toEqual(before);
    },
    30000
  );
});
