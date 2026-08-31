import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { createProductionRepositoryFacade } from "./founderRepositories.js";

describe("production repository facade", () => {
  it("routes every existing repository consumer through the selected composition", async () => {
    const legacy = { weights: { listWeightEntries: vi.fn(async () => "legacy") } };
    const provider = { weights: { listWeightEntries: vi.fn(async () => "postgres") } };
    let selected = legacy;
    const facade = createProductionRepositoryFacade({
      legacyRepositories: legacy,
      resolveComposition: async () => ({ repositories: selected }),
    });

    await expect(facade.weights.listWeightEntries("owner")).resolves.toBe("legacy");
    selected = provider;
    await expect(facade.weights.listWeightEntries("owner")).resolves.toBe("postgres");
    expect(legacy.weights.listWeightEntries).toHaveBeenCalledTimes(1);
    expect(provider.weights.listWeightEntries).toHaveBeenCalledTimes(1);
  });

  it("fails closed on uncomposed direct PostgreSQL writes instead of mutating a snapshot repository", async () => {
    const providerWrite = vi.fn(async () => "in-memory-only");
    const facade = createProductionRepositoryFacade({
      legacyRepositories: { weights: { addWeightEntry: vi.fn() } },
      resolveComposition: async () => ({
        canonicalStoreEpoch: "postgres-canonical",
        repositories: { weights: { addWeightEntry: providerWrite } },
      }),
    });

    await expect(facade.weights.addWeightEntry({ id: "one" })).rejects.toMatchObject({
      code: "DIRECT_POSTGRES_REPOSITORY_WRITE_UNAVAILABLE",
    });
    expect(providerWrite).not.toHaveBeenCalled();
  });

  it("fails closed instead of falling back to legacy when the selected provider lacks a method", async () => {
    const legacyWrite = vi.fn(async () => "legacy");
    const facade = createProductionRepositoryFacade({
      legacyRepositories: { weights: { addWeightEntry: legacyWrite } },
      resolveComposition: async () => ({ repositories: { weights: {} } }),
    });

    await expect(facade.weights.addWeightEntry({ id: "one" })).rejects.toThrow(/does not provide weights\.addWeightEntry/);
    expect(legacyWrite).not.toHaveBeenCalled();
  });

  it("exposes the source-owned request scope without adding it to repository enumeration", async () => {
    const runInReadScope = vi.fn(async (callback, metadata) => callback(metadata));
    const facade = createProductionRepositoryFacade({
      legacyRepositories: { weights: { listWeightEntries: vi.fn() } },
      resolveComposition: vi.fn(),
      runInReadScope,
    });

    await expect(facade.runInReadScope((metadata) => metadata.readModel, { readModel: "progress.getProgressHub" }))
      .resolves.toBe("progress.getProgressHub");
    expect(Object.keys(facade)).toEqual(["weights"]);
    expect(runInReadScope).toHaveBeenCalledTimes(1);
  });

  it.each([
    "../../app/briefings/weekly/page.js",
    "../../app/check-in/morning/page.js",
    "../../app/goals/[goalId]/edit/page.js",
    "../../app/log/training/page.js",
    "../../app/profile/operating-plan/execution/[executionId]/page.js",
    "../../app/profile/operating-plan/execution/dexa/page.js",
    "../../app/profile/operating-plan/execution/peptides/[protocolId]/page.js",
    "../../app/profile/operating-plan/execution/supplements/[protocolId]/page.js",
    "../../app/profile/operating-plan/strategy/[strategyType]/[strategyId]/edit/page.js",
    "../../app/profile/operating-plan/supplements/[protocolId]/edit/page.js",
    "../../app/profile/operating-plan/supplements/new/page.js",
    "../../app/profile/operating-plan/tracking/morning-weigh-in/page.js",
    "../../app/profile/operating-plan/tracking/page.js",
    "../../app/profile/protocols/[protocolId]/page.js",
  ])("enters the common read scope for audited direct composite page %s", (relativePath) => {
    const source = fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
    expect(source).toContain("FounderRepositories.runInReadScope");
  });

  it.each([
    "../../app/briefings/monthly/[artifactId]/page.js",
    "../../app/briefings/review/[artifactId]/page.js",
    "../../app/briefings/review/page.js",
  ])("routes audited Briefing page %s through the provider-native navigation read model", (relativePath) => {
    const source = fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
    expect(source).toContain("getProductionBriefingNavigationReadService");
    expect(source).not.toMatch(/FounderRepositories\.runInReadScope|loadCanonicalRuntime/);
  });

  it("routes Photo Event Briefing detail through its narrow provider-native read model", () => {
    const source = fs.readFileSync(
      new URL("../../app/briefings/photo/[sessionId]/page.js", import.meta.url),
      "utf8",
    );
    expect(source).toContain("getProductionPhotoEventBriefingReadService().getPhotoEvent");
    expect(source).not.toMatch(/FounderRepositories\.runInReadScope|loadCanonicalRuntime/);
  });

  it("routes Evidence Review detail through its narrow provider-native read model", () => {
    const source = fs.readFileSync(
      new URL("../../app/evidence/review/[reviewId]/page.js", import.meta.url),
      "utf8",
    );
    expect(source).toContain("getProductionEvidenceReviewReadService().getReview(reviewId)");
    expect(source).not.toContain("FounderRepositories.runInReadScope");
    expect(source).not.toContain("listCanonicalEvidenceObjects");
  });
});
