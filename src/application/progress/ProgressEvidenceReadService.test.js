import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import { getActivityTimelineReport } from "../../domain/services/ActivityEvidenceContextService.js";
import { getNutritionTimelineReport } from "../../domain/services/NutritionEvidenceContextService.js";
import { getWeightTimelineReport } from "../../domain/services/WeightEvidenceContextService.js";
import { getDEXATimelineReport } from "../../domain/services/DEXAEvidenceContextService.js";
import { createProviderEnergyEvidenceReport, getEnergyEvidenceReport } from "../../domain/services/EnergyEvidenceService.js";
import { createPhase5SyntheticRuntime } from "../../platform/migration/phase5SyntheticPackage.js";
import { createRepositoryProgressEvidenceReadStore } from "../../platform/database/PostgresProgressEvidenceReadStore.js";
import { createProgressEvidenceReadService } from "./ProgressEvidenceReadService.js";
import { buildDEXAReport } from "../../domain/services/ProgressReportingService.js";

describe("provider-native Progress evidence reads", () => {
  it.each(["all", "build-lean-mass", "visible-abs"])(
    "keeps DEXA output equivalent for %s",
    async (context) => {
      const currentDate = new Date("2026-08-29T12:00:00-07:00");
      const { narrow, legacy } = services();
      expect(await narrow.getDEXA({ context, currentDate })).toEqual(
        await getDEXATimelineReport({ context, currentDate, repositories: legacy })
      );
    }
  );

  it.each(["all", "build-lean-mass", "visible-abs"])(
    "keeps Energy output equivalent for %s",
    async (context) => {
      const currentDate = new Date("2026-08-29T12:00:00-07:00");
      const { narrow, legacy } = services();
      const input = await narrow.getEnergy({ context, currentDate });
      expect(createProviderEnergyEvidenceReport({
        ...input,
        contextId: input.timeline.contextId,
        currentDate,
        timeline: input.timeline,
      })).toEqual(await getEnergyEvidenceReport({ context, currentDate, repositories: legacy }));
    }
  );

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

  it("routes production Evidence pages and nested Nutrition surfaces through the narrow composition", () => {
    for (const route of [
      "src/app/progress/dexa/page.js",
      "src/app/progress/weight/page.js",
      "src/app/progress/nutrition/page.js",
      "src/app/progress/activity/page.js",
      "src/app/progress/energy/page.js",
      "src/app/progress/nutrition/reporting/[reportId]/page.js",
      "src/app/progress/nutrition/library/[[...path]]/page.js",
      "src/app/progress/nutrition/day/[dayId]/page.js",
    ]) {
      const source = fs.readFileSync(route, "utf8");
      expect(source).toContain("getProductionProgressEvidenceReadService");
      expect(source).not.toMatch(/getDEXATimelineReport|getWeightTimelineReport|getNutritionTimelineReport|getActivityTimelineReport|getEnergyEvidenceReport|createProgressReportingService|FounderRepositories/);
    }
  });

  it("does not present a false DEXA delta against a partial historical scan", () => {
    const partial = { id: "partial", measuredAt: "2026-06-10", bodyFatPercentage: null, fatMass: null, leanMass: null };
    const complete = {
      id: "complete",
      measuredAt: "2026-07-18",
      bodyFatPercentage: 7.7,
      fatMass: { value: 12.8 },
      leanMass: { value: 147.5 },
    };

    expect(buildDEXAReport({ dexaScans: [partial, complete], goals: [] }).delta).toBeNull();
  });

  it("ranks Aug 15 latest, excludes superseded revisions, and emits private opaque PDF links", async () => {
    const mediaId = "media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57";
    const scan = (overrides = {}) => ({
      id: "july",
      measuredAt: "2026-07-18",
      totalMass: { value: 167.4, unit: "lb" },
      bodyFatPercentage: 7.7,
      fatMass: { value: 12.8, unit: "lb" },
      leanMass: { value: 147.5, unit: "lb" },
      boneMineralContent: { value: 7.1, unit: "lb" },
      restingMetabolicRate: { value: 1794, unit: "kcal/day" },
      sourceFileId: "july.pdf",
      ...overrides,
    });
    const store = {
      run: (_name, callback) => callback(),
      getUser: vi.fn(async () => ({ id: "user_founder_001" })),
      listGoals: vi.fn(async () => []),
      listDEXAScans: vi.fn(async () => [
        scan({ id: "august", measuredAt: "2026-08-15", sourceFileId: "august.pdf" }),
        scan(),
        scan({ id: "partial", measuredAt: "2026-06-20", canonicalLifecycleStatus: "superseded" }),
      ]),
      listDEXAMediaObjects: vi.fn(async () => [{
        id: mediaId,
        evidence_record_id: "august",
        original_filename: "august.pdf",
        provenance: { sourceRelativePath: "dexa/uploads/august.pdf" },
        sha256: "a".repeat(64),
        state: "verified",
      }]),
    };
    const result = await createProgressEvidenceReadService({ store }).getDEXA({ context: "all" });

    expect(result.report.latestScan).toMatchObject({
      date: "2026-08-15",
      sourceHref: `/api/private-evidence/media/${mediaId}`,
    });
    expect(result.report.history.map((item) => item.date)).toEqual(["2026-08-15", "2026-07-18"]);
    expect(result.report.history[1].sourceHref).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/\/api\/private-evidence\/founder\/dexa/);
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
