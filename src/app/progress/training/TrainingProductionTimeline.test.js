import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getTrainingTimelineReport } from "../../../domain/services/TrainingEvidenceContextService";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");
const read = (relativePath) => fs.readFileSync(relativePath, "utf8");

describe("production Training timeline port", () => {
  it("uses a provider-native landing read while retaining the timeline contract elsewhere", () => {
    const landing = read("src/app/progress/training/page.js");
    const library = read("src/app/progress/training/library/[[...path]]/page.js");
    const reporting = read("src/app/progress/training/reporting/[reportId]/page.js");

    [library, reporting].forEach((source) => {
      expect(source).toContain("getTrainingTimelineReport");
    });
    expect(landing).toContain("getProductionTrainingNavigationReadService().getLanding");
    expect(landing).not.toContain("getTrainingTimelineReport");
    expect(landing).not.toContain("loadCanonicalRuntime");
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
    expect(session).toContain("getProductionTrainingNavigationReadService");
    expect(session).not.toContain("getPlaceholderReport");
  });

  it(
    "scopes temporal evidence while retaining global movement availability without writes",
    async () => {
      const before = hash(fs.readFileSync(storePath));
      let build = await getTrainingTimelineReport({ context: "build-lean-mass" });

      expect(build.timeline.contextId).toBe("build-lean-mass");
      expect(
        build.report.trainingDays.every((day) => day.date >= "2026-07-19")
      ).toBe(true);
      const buildTrainingDayCount = build.report.trainingDays.length;
      expect(Array.isArray(build.report.trainingBreakdowns.resistance)).toBe(true);
      const buildExerciseLabelHash = hashExerciseLabels(
        build.report.trainingBreakdowns
      );
      build = null;

      let visible = await getTrainingTimelineReport({ context: "visible-abs" });
      expect(
        visible.report.trainingDays.every(
          (day) => day.date >= "2026-05-24" && day.date <= "2026-07-18"
        )
      ).toBe(true);
      const visibleLibraryHash = hash(visible.report.trainingLibrary);
      visible = null;

      const all = await getTrainingTimelineReport({ context: "all" });
      expect(all.report.trainingDays.length).toBeGreaterThanOrEqual(
        buildTrainingDayCount
      );
      expect(buildExerciseLabelHash).toBe(
        hashExerciseLabels(all.report.trainingBreakdowns)
      );
      expect(visibleLibraryHash).toBe(hash(all.report.trainingLibrary));
      expect(hash(fs.readFileSync(storePath))).toBe(before);
    },
    30000
  );
});

function hash(value) {
  const input = Buffer.isBuffer(value) ? value : JSON.stringify(value);
  return createHash("sha256").update(input).digest("hex");
}

function hashExerciseLabels(breakdowns) {
  const digest = createHash("sha256");
  for (const region of breakdowns.resistance ?? []) {
    for (const family of region.movementFamilies ?? region.muscleGroups ?? []) {
      for (const exercise of family.exercises ?? []) {
        digest.update(`${exercise.label}\n`);
      }
    }
  }
  return digest.digest("hex");
}
