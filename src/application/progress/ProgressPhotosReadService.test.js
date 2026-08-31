import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import { getPhotosTimelineReport } from "../../domain/services/PhotosEvidenceContextService.js";
import { createPhase5SyntheticRuntime } from "../../platform/migration/phase5SyntheticPackage.js";
import { createRepositoryProgressPhotosReadStore } from "../../platform/database/PostgresProgressPhotosReadStore.js";
import { createProgressPhotosReadService } from "./ProgressPhotosReadService.js";

describe("provider-native Progress Photos reads", () => {
  it("preserves the legacy report and timeline presentation from narrow inputs", async () => {
    const runtime = createPhase5SyntheticRuntime();
    const narrowRepositories = createSeedRepositories(structuredClone(runtime), { allowStagedMutations: false });
    const legacyRepositories = createSeedRepositories(structuredClone(runtime), { allowStagedMutations: false });
    const options = { context: "all", currentDate: new Date("2026-08-30T12:00:00Z") };
    const narrow = await createProgressPhotosReadService({
      store: createRepositoryProgressPhotosReadStore({ repositories: narrowRepositories }),
    }).getPhotosTimeline(options);
    const legacy = await getPhotosTimelineReport({ ...options, repositories: legacyRepositories });
    expect(narrow).toEqual(legacy);
  });

  it("uses each narrow source once", async () => {
    const store = {
      run: vi.fn((_name, callback) => callback()),
      getUser: vi.fn(async () => ({ id: "u", timezone: "America/Los_Angeles" })),
      listGoals: vi.fn(async () => []),
      listWeightEntries: vi.fn(async () => []),
      getPhotoInputs: vi.fn(async () => ({ canonicalEvidenceObjects: [], progressPhotos: [] })),
      listPhotoAnalyses: vi.fn(async () => []),
      listPhotoBriefings: vi.fn(async () => []),
      listMediaObjects: vi.fn(async () => []),
    };
    await createProgressPhotosReadService({ store }).getPhotosTimeline({ context: "all" });
    expect(store.run).toHaveBeenCalledWith("progress.photos", expect.any(Function));
    expect(store.getPhotoInputs).toHaveBeenCalledOnce();
    expect(store.listMediaObjects).toHaveBeenCalledOnce();
  });

  it("removes compatibility runtime composition from the route", () => {
    const route = fs.readFileSync("src/app/progress/photos/page.js", "utf8");
    expect(route).toContain("getProductionProgressPhotosReadService");
    expect(route).not.toMatch(/getPhotosTimelineReport|FounderRepositories|loadCanonicalRuntime/);
  });
});
