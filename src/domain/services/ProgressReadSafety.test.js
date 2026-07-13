import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories";
import { createProgressReportingService } from "./ProgressReportingService";

function createRepositories() {
  const query = (value) => vi.fn(async () => structuredClone(value));
  return {
    users: { getCurrentUser: query({ id: "founder" }) },
    goals: { listGoals: query([]) },
    weights: { listWeightEntries: query([]) },
    dexaScans: { listDEXAScans: query([]) },
    progressPhotos: { listPhotos: query([]), createPhoto: vi.fn() },
    protocols: { listProtocols: query([]) },
    dailyCheckIns: { listCheckIns: query([]) },
    nutritionContext: { getNutritionContext: query(null) },
    evidencePackages: { listEvidencePackages: query([]) },
    canonicalEvidence: {
      listCanonicalEvidenceObjects: query([]),
      upsertCanonicalEvidenceObjects: vi.fn(),
    },
    analyses: { listAnalyses: query([]), createAnalysis: vi.fn() },
    dailyBriefings: { createDailyBriefing: vi.fn() },
  };
}

describe("Progress query safety", () => {
  it("builds a safe empty view model repeatedly without invoking commands", async () => {
    const repositories = createRepositories();
    const service = createProgressReportingService({ repositories });

    const first = await service.getProgressHub();
    const second = await service.getProgressHub();

    expect(second).toEqual(first);
    expect(first.streams).toHaveLength(9);
    expect(repositories.progressPhotos.createPhoto).not.toHaveBeenCalled();
    expect(repositories.canonicalEvidence.upsertCanonicalEvidenceObjects).not.toHaveBeenCalled();
    expect(repositories.analyses.createAnalysis).not.toHaveBeenCalled();
    expect(repositories.dailyBriefings.createDailyBriefing).not.toHaveBeenCalled();
  });

  it.each([
    ["weight", "getWeightReport"],
    ["dexa", "getDEXAReport"],
    ["activity", "getActivityReport"],
    ["training", "getPlaceholderReport"],
  ])("keeps the %s Progress read non-mutating", async (stream, method) => {
    const repositories = createRepositories();
    const service = createProgressReportingService({ repositories });

    if (method === "getPlaceholderReport") await service[method](stream);
    else await service[method]();

    expect(repositories.progressPhotos.createPhoto).not.toHaveBeenCalled();
    expect(repositories.canonicalEvidence.upsertCanonicalEvidenceObjects).not.toHaveBeenCalled();
    expect(repositories.analyses.createAnalysis).not.toHaveBeenCalled();
    expect(repositories.dailyBriefings.createDailyBriefing).not.toHaveBeenCalled();
  });

  it("leaves an isolated incident-style store byte-identical across repeated reads", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "progress-read-safety-"));
    const filePath = path.join(directory, "runtime-store.json");
    const store = {
      version: 1,
      updatedAt: "2026-07-12T00:00:00.000Z",
      user: { id: "founder" }, goals: [], weightEntries: [], dexaScans: [],
      progressPhotos: [], protocols: [], protocolVersions: [], dailyCheckIns: [],
      dailyBriefings: [], analyses: [], evidenceReviews: [], nutritionContext: null,
      evidencePackages: [{ id: "unreconciled-package", userId: "founder", evidence_objects: [] }],
      canonicalEvidenceObjects: [{ canonicalId: "existing", userId: "founder", evidence_type: "weight" }],
    };
    fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
    const onChange = vi.fn(() => fs.writeFileSync(filePath, "unexpected write"));
    const repositories = createSeedRepositories(store, { onChange });
    const service = createProgressReportingService({ repositories });
    const before = fs.readFileSync(filePath);
    const beforeStat = fs.statSync(filePath);

    await service.getProgressHub("founder");
    await service.getProgressHub("founder");

    const after = fs.readFileSync(filePath);
    const afterStat = fs.statSync(filePath);
    const hash = (value) => createHash("sha256").update(value).digest("hex");
    expect(hash(after)).toBe(hash(before));
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
    expect(JSON.parse(after).updatedAt).toBe(store.updatedAt);
    expect(onChange).not.toHaveBeenCalled();
    fs.rmSync(directory, { recursive: true, force: true });
  });
});
