import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getTrainingRepresentativePathPreview } from "./TrainingRepresentativePathPreviewService";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("representative Training preview path", () => {
  it.each(["build-lean-mass", "visible-abs", "all"])(
    "propagates %s through canonical Training, Arms, and Spider Curl navigation",
    async (context) => {
      const model = await getTrainingRepresentativePathPreview({ context });
      expect(model.links.training).toContain(`context=${context}`);
      expect(model.links.arms).toContain(`context=${context}`);
      expect(model.links.spiderCurl).toContain(`context=${context}`);
      expect(model.navigation.arms.breadcrumbs[0].href).toBe(model.links.training);
      expect(model.navigation.spider.parentRoute).toBe(model.links.arms);
    }
  );

  it("uses the selected timeline strictly as the canonical report date window", async () => {
    const [build, visible, all] = await Promise.all(
      ["build-lean-mass", "visible-abs", "all"].map((context) =>
        getTrainingRepresentativePathPreview({ context })
      )
    );
    expect(build.report.trainingDays.every((day) => day.date >= "2026-07-19")).toBe(true);
    expect(
      visible.report.trainingDays.every(
        (day) => day.date >= "2026-05-24" && day.date <= "2026-07-18"
      )
    ).toBe(true);
    expect(all.report.trainingDays.length).toBeGreaterThan(build.report.trainingDays.length);
    const movementLabels = (model) =>
      model.report.trainingBreakdowns.resistance.flatMap((region) =>
        (region.movementFamilies ?? region.muscleGroups ?? []).flatMap(
          (family) => (family.exercises ?? []).map((exercise) => exercise.label)
        )
      );
    expect(movementLabels(build)).toEqual(movementLabels(all));
    expect(movementLabels(visible)).toEqual(movementLabels(all));
  });

  it("reuses global movement availability without writing runtime state", async () => {
    const before = fs.readFileSync(storePath, "utf8");
    const model = await getTrainingRepresentativePathPreview({ context: "build-lean-mass" });
    expect(model.slug.arms).toEqual(["resistance", "upper-body", "arms"]);
    expect(model.slug.spider).toEqual([
      "resistance", "upper-body", "arms", "curl", "spider-curls",
    ]);
    expect(fs.readFileSync(storePath, "utf8")).toBe(before);
  });

  it.each(["build-lean-mass", "visible-abs", "all"])(
    "retains workout provenance in the %s read model",
    async (context) => {
      const model = await getTrainingRepresentativePathPreview({ context });
      const sourceRelationships = model.report.trainingDays.flatMap((day) =>
        (day.sessions ?? []).map((session) => ({
          id: session.id,
          sourceEvidence: session.sourceEvidence,
        }))
      );

      expect(sourceRelationships.length).toBeGreaterThan(0);
      expect(sourceRelationships.some((source) => source.id)).toBe(true);
      expect(sourceRelationships.some((source) => source.sourceEvidence?.length)).toBe(true);
    }
  );
});
