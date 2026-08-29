import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import { createProgressReportingService } from "../../domain/services/ProgressReportingService.js";
import { createPhase5SyntheticRuntime } from "../../platform/migration/phase5SyntheticPackage.js";
import { createRepositoryProgressHubReadStore } from "../../platform/database/PostgresProgressHubReadStore.js";
import { createProgressHubReadService } from "./ProgressHubReadService.js";

describe("provider-native Progress hub", () => {
  it("preserves the complete hub stream output from narrow provider-owned inputs", async () => {
    const runtime = createPhase5SyntheticRuntime();
    const narrowRepositories = createSeedRepositories(structuredClone(runtime), {
      allowStagedMutations: false,
    });
    const legacyRepositories = createSeedRepositories(structuredClone(runtime), {
      allowStagedMutations: false,
    });
    const narrow = await createProgressHubReadService({
      store: createRepositoryProgressHubReadStore({
        repositories: narrowRepositories,
      }),
    }).getProgressHub();
    const legacy = await createProgressReportingService({
      repositories: legacyRepositories,
    }).getProgressHub();

    expect(narrow).toEqual(legacy);
  });

  it("loads each narrow input once and skips package fallback when photo evidence exists", async () => {
    const values = {
      userId: "owner-one",
      weights: [],
      dexaScans: [],
      progressPhotos: [{ id: "photo", userId: "owner-one", date: "2026-08-01", status: "available", fileReference: "private/photo.jpg" }],
      protocols: [],
      nutritionContext: null,
      canonicalEvidenceObjects: [],
      analyses: [],
    };
    const store = {
      run: vi.fn((_name, callback) => callback()),
      getOwnerUserId: vi.fn(async () => values.userId),
      listWeightEntries: vi.fn(async () => values.weights),
      listDEXAScans: vi.fn(async () => values.dexaScans),
      listProgressPhotos: vi.fn(async () => values.progressPhotos),
      listProtocols: vi.fn(async () => values.protocols),
      getNutritionContext: vi.fn(async () => values.nutritionContext),
      listProgressHubCanonicalEvidenceObjects: vi.fn(async () => values.canonicalEvidenceObjects),
      listAnalyses: vi.fn(async () => values.analyses),
      listEvidencePackages: vi.fn(async () => []),
    };

    await createProgressHubReadService({ store }).getProgressHub();

    expect(store.run).toHaveBeenCalledWith("progress.hub", expect.any(Function));
    expect(store.listProgressHubCanonicalEvidenceObjects).toHaveBeenCalledOnce();
    expect(store.listEvidencePackages).not.toHaveBeenCalled();
  });

  it("removes compatibility runtime composition from the Progress route", () => {
    const route = fs.readFileSync("src/app/progress/page.js", "utf8");
    expect(route).toContain("getProductionProgressHubReadService");
    expect(route).not.toMatch(
      /FounderRepositories|createProgressReportingService|loadCanonicalRuntime/
    );
  });
});
