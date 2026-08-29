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
      photoInputs: {
        canonicalPhotoSessionObjects: [],
        progressPhotos: [{ id: "photo", userId: "owner-one", date: "2026-08-01", status: "available", fileReference: "private/photo.jpg" }],
      },
      protocols: [],
      nutritionContext: null,
      canonicalEvidenceObjects: [],
    };
    const store = {
      run: vi.fn((_name, callback) => callback()),
      getOwnerUserId: vi.fn(async () => values.userId),
      listWeightEntries: vi.fn(async () => values.weights),
      listDEXAScans: vi.fn(async () => values.dexaScans),
      getProgressHubPhotoInputs: vi.fn(async () => values.photoInputs),
      listProtocols: vi.fn(async () => values.protocols),
      getNutritionContext: vi.fn(async () => values.nutritionContext),
      listProgressHubCanonicalEvidenceObjects: vi.fn(async () => values.canonicalEvidenceObjects),
      listEvidencePackages: vi.fn(async () => []),
    };

    await createProgressHubReadService({ store }).getProgressHub();

    expect(store.run).toHaveBeenCalledWith("progress.hub", expect.any(Function));
    expect(store.listProgressHubCanonicalEvidenceObjects).toHaveBeenCalledOnce();
    expect(store.getProgressHubPhotoInputs).toHaveBeenCalledOnce();
    expect(store.listEvidencePackages).not.toHaveBeenCalled();
  });

  it("does not hydrate analyses or detailed photo comparisons for the landing screen", () => {
    const service = fs.readFileSync("src/application/progress/ProgressHubReadService.js", "utf8");
    const reporting = fs.readFileSync("src/domain/services/ProgressReportingService.js", "utf8");
    const providerHub = reporting.slice(
      reporting.indexOf("export function createProviderProgressHubReport"),
      reporting.indexOf("function buildWeightReport")
    );

    expect(service).not.toMatch(/listAnalyses|createPhotoSessionReadModels/);
    expect(providerHub).toContain("createPhotoSessionLandingSummary");
    expect(providerHub).not.toContain("createPhotoSessionReadModels");
  });

  it("removes compatibility runtime composition from the Progress route", () => {
    const route = fs.readFileSync("src/app/progress/page.js", "utf8");
    expect(route).toContain("getProductionProgressHubReadService");
    expect(route).not.toMatch(
      /FounderRepositories|createProgressReportingService|loadCanonicalRuntime/
    );
  });
});
