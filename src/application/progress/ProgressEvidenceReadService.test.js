import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import { getActivityTimelineReport } from "../../domain/services/ActivityEvidenceContextService.js";
import { getNutritionTimelineReport } from "../../domain/services/NutritionEvidenceContextService.js";
import { getWeightTimelineReport } from "../../domain/services/WeightEvidenceContextService.js";
import { createPhase5SyntheticRuntime } from "../../platform/migration/phase5SyntheticPackage.js";
import { createRepositoryProgressEvidenceReadStore } from "../../platform/database/PostgresProgressEvidenceReadStore.js";
import { createProgressEvidenceReadService } from "./ProgressEvidenceReadService.js";

describe("provider-native Progress evidence reads", () => {
  it.each(["all", "build-lean-mass", "visible-abs"])(
    "keeps Weight output equivalent for %s",
    async (context) => {
      const currentDate = new Date("2026-08-29T12:00:00-07:00");
      const { narrow, legacy } = services();
      expect(await narrow.getWeight({ context, currentDate })).toEqual(
        await getWeightTimelineReport({ context, currentDate, repositories: legacy })
      );
    }
  );

  it.each(["all", "build-lean-mass", "visible-abs"])(
    "keeps Nutrition output equivalent for %s",
    async (context) => {
      const currentDate = new Date("2026-08-29T12:00:00-07:00");
      const { narrow, legacy } = services();
      expect(await narrow.getNutrition({ context, currentDate })).toEqual(
        await getNutritionTimelineReport({ context, currentDate, repositories: legacy })
      );
    }
  );

  it.each(["all", "build-lean-mass", "visible-abs"])(
    "keeps Activity output equivalent for %s",
    async (context) => {
      const currentDate = new Date("2026-08-29T12:00:00-07:00");
      const { narrow, legacy } = services();
      expect(await narrow.getActivity({ context, currentDate })).toEqual(
        await getActivityTimelineReport({ context, currentDate, repositories: legacy })
      );
    }
  );

  it("keeps requests local and avoids package fallback when canonical evidence exists", async () => {
    const runtime = createPhase5SyntheticRuntime();
    const repositories = createSeedRepositories(structuredClone(runtime), {
      allowStagedMutations: false,
    });
    const baseStore = createRepositoryProgressEvidenceReadStore({ repositories });
    const fallback = vi.fn(baseStore.listEvidencePackages);
    const store = Object.freeze({ ...baseStore, listEvidencePackages: fallback });
    const service = createProgressEvidenceReadService({ store });
    const first = await service.getNutrition({ context: "all" });
    const second = await service.getNutrition({ context: "all" });

    expect(first).not.toBe(second);
    expect(fallback).not.toHaveBeenCalled();
    expect(JSON.stringify(first).length).toBeLessThan(250_000);
  });

  it("routes all three production pages through the narrow composition", () => {
    for (const route of [
      "src/app/progress/weight/page.js",
      "src/app/progress/nutrition/page.js",
      "src/app/progress/activity/page.js",
    ]) {
      const source = fs.readFileSync(route, "utf8");
      expect(source).toContain("getProductionProgressEvidenceReadService");
      expect(source).not.toMatch(/getWeightTimelineReport|getNutritionTimelineReport|getActivityTimelineReport|createProgressReportingService|FounderRepositories/);
    }
  });
});

function services() {
  const runtime = createPhase5SyntheticRuntime();
  runtime.goals[1] = {
    ...runtime.goals[1],
    id: "goal_visible_abs_at_rest",
    status: "completed",
    lifecycleState: "completed",
  };
  const narrowRepositories = createSeedRepositories(structuredClone(runtime), {
    allowStagedMutations: false,
  });
  const legacy = createSeedRepositories(structuredClone(runtime), {
    allowStagedMutations: false,
  });
  return {
    legacy,
    narrow: createProgressEvidenceReadService({
      store: createRepositoryProgressEvidenceReadStore({
        repositories: narrowRepositories,
      }),
    }),
  };
}
