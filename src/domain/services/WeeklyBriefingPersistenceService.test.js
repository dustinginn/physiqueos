import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeFounderStoreFileSystem } from "../../data/repositories/FounderStoreUnitOfWork";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories";
import { createWeeklyNarrativeService } from "./WeeklyNarrativeService";
import {
  createFounderWeeklyBriefingPersistenceService,
  createWeeklyPreparedCommit,
} from "./WeeklyBriefingPersistenceService";

const directories = [];
afterEach(() => {
  directories.splice(0).forEach((directory) =>
    fs.rmSync(directory, { recursive: true, force: true })
  );
});

function artifact(overrides = {}) {
  return {
    id: "weekly_briefing_2026-07-19_2026-07-25",
    userId: "u",
    artifactType: "scheduled",
    cadence: "weekly",
    generatedAt: "2026-07-26T12:00:00.000Z",
    evidenceWindow: {
      id: "weekly:2026-07-19:2026-07-25:America/Los_Angeles",
      startDate: "2026-07-19",
      endDate: "2026-07-25",
      briefingDate: "2026-07-26",
      timeZone: "America/Los_Angeles",
    },
    lifecycle: { openedAt: null, consumedAt: null },
    briefing: {
      version: "weekly_narrative_v5_2",
      weeklyNarrative: {
        provenance: { version: "weekly_narrative_v5_2" },
        cards: { progress: { activity: { completedDays: 5 } } },
      },
    },
    piMemory: {
      schemaVersion: "pi_briefing_memory_v1",
      cadence: "weekly",
      communicatedClaimIds: ["claim-1"],
    },
    ...overrides,
  };
}

function fixture({ records = [], unitOfWorkOptions = {} } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "weekly-persistence-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const store = {
    version: "test",
    revision: 7,
    lastCommitId: "commit-before",
    updatedAt: "2026-07-26T12:00:00.000Z",
    dailyBriefings: structuredClone(records),
  };
  fs.writeFileSync(filePath, `${JSON.stringify(store)}\n`);
  const liveStore = structuredClone(store);
  const service = createFounderWeeklyBriefingPersistenceService({
    filePath,
    liveStore,
    now: () => new Date("2026-07-26T13:00:00.000Z"),
    unitOfWorkOptions,
  });
  return { directory, filePath, liveStore, service, store };
}

function bytes(filePath) {
  return fs.readFileSync(filePath);
}

describe("WeeklyBriefingPersistenceService", () => {
  it("commits artifact and embedded PI memory atomically with one revision", async () => {
    const f = fixture();
    const before = f.service.captureBaseline();
    const prepared = createWeeklyPreparedCommit({
      operation: "normal_generation",
      artifact: artifact(),
      baseline: before,
      reason: "scheduled",
    });
    const result = await f.service.commit(prepared);
    const persisted = JSON.parse(fs.readFileSync(f.filePath, "utf8"));
    expect(result).toMatchObject({
      status: "created",
      committed: true,
      revision: 8,
    });
    expect(result.commitId).not.toBe("commit-before");
    expect(persisted).toMatchObject({
      revision: 8,
      lastCommitId: result.commitId,
      updatedAt: "2026-07-26T13:00:00.000Z",
      dailyBriefings: [{ id: prepared.artifact.id, piMemory: prepared.artifact.piMemory }],
    });
    expect(f.liveStore).toEqual(persisted);
    expect(f.service.captureBaseline().fileHash).not.toBe(before.fileHash);
  });

  it("returns matched before opening a transaction and preserves bytes and metadata", async () => {
    const current = artifact();
    const f = fixture({ records: [current] });
    const beforeBytes = bytes(f.filePath);
    const before = f.service.captureBaseline();
    const result = await f.service.commit(createWeeklyPreparedCommit({
      operation: "catch_up",
      artifact: { ...current, generatedAt: "later" },
      baseline: before,
      reason: "catch-up",
    }));
    expect(result).toMatchObject({ status: "matched", committed: false });
    expect(bytes(f.filePath)).toEqual(beforeBytes);
    expect(f.service.captureBaseline()).toMatchObject({
      revision: before.revision,
      lastCommitId: before.lastCommitId,
      updatedAt: before.updatedAt,
      fileHash: before.fileHash,
    });
  });

  it("rejects semantic identity conflicts without writing", async () => {
    const conflicting = artifact({ id: "other-weekly" });
    const f = fixture({ records: [conflicting] });
    const before = bytes(f.filePath);
    const result = await f.service.commit(createWeeklyPreparedCommit({
      operation: "catch_up",
      artifact: artifact(),
      baseline: f.service.captureBaseline(),
      reason: "catch-up",
    }));
    expect(result.status).toBe("semantic_conflict");
    expect(bytes(f.filePath)).toEqual(before);
  });

  it("rejects same-revision runtime drift through the stronger digest guard", async () => {
    const f = fixture();
    const baseline = f.service.captureBaseline();
    const changed = JSON.parse(fs.readFileSync(f.filePath, "utf8"));
    changed.unrelatedLegacyWrite = true;
    fs.writeFileSync(f.filePath, `${JSON.stringify(changed)}\n`);
    const before = bytes(f.filePath);
    const result = await f.service.commit(createWeeklyPreparedCommit({
      operation: "normal_generation",
      artifact: artifact(),
      baseline,
      reason: "scheduled",
    }));
    expect(result.status).toBe("baseline_conflict");
    expect(bytes(f.filePath)).toEqual(before);
    expect(JSON.parse(before).revision).toBe(7);
  });

  it("rechecks the semantic baseline immediately before atomic replacement", async () => {
    const base = createNodeFounderStoreFileSystem();
    let reads = 0;
    const fileSystem = {
      ...base,
      read(filePath) {
        reads += 1;
        if (reads === 3) {
          const current = JSON.parse(fs.readFileSync(filePath, "utf8"));
          current.concurrentLegacyWrite = { preservedRevision: true };
          fs.writeFileSync(filePath, `${JSON.stringify(current)}\n`);
        }
        return base.read(filePath);
      },
    };
    const f = fixture({ unitOfWorkOptions: { fileSystem } });
    const result = await f.service.commit(createWeeklyPreparedCommit({
      operation: "normal_generation",
      artifact: artifact(),
      baseline: f.service.captureBaseline(),
      reason: "scheduled",
    }));
    const persisted = JSON.parse(fs.readFileSync(f.filePath, "utf8"));
    expect(result.status).toBe("baseline_conflict");
    expect(persisted).toMatchObject({
      revision: 7,
      concurrentLegacyWrite: { preservedRevision: true },
      dailyBriefings: [],
    });
    expect(f.liveStore.dailyBriefings).toEqual([]);
  });

  it("allows one concurrent commit and rejects or matches the loser", async () => {
    const f = fixture();
    const baseline = f.service.captureBaseline();
    const prepared = createWeeklyPreparedCommit({
      operation: "catch_up",
      artifact: artifact(),
      baseline,
      reason: "catch-up",
    });
    const results = await Promise.all([f.service.commit(prepared), f.service.commit(prepared)]);
    expect(results.filter((item) => item.status === "created")).toHaveLength(1);
    expect(results.filter((item) => ["baseline_conflict", "matched"].includes(item.status))).toHaveLength(1);
    const persisted = JSON.parse(fs.readFileSync(f.filePath, "utf8"));
    expect(persisted.revision).toBe(8);
    expect(persisted.dailyBriefings).toHaveLength(1);
  });

  it.each(["write", "atomicReplace"])(
    "leaves disk and live state unchanged on %s failure",
    async (failedMethod) => {
      const base = createNodeFounderStoreFileSystem();
      const fileSystem = {
        ...base,
        [failedMethod]: (...args) => {
          throw new Error(`injected ${failedMethod}`);
        },
      };
      const f = fixture({ unitOfWorkOptions: { fileSystem } });
      const beforeBytes = bytes(f.filePath);
      const beforeLive = structuredClone(f.liveStore);
      const result = await f.service.commit(createWeeklyPreparedCommit({
        operation: "normal_generation",
        artifact: artifact(),
        baseline: f.service.captureBaseline(),
        reason: "scheduled",
      }));
      expect(result.status).toBe("persistence_failure");
      expect(bytes(f.filePath)).toEqual(beforeBytes);
      expect(f.liveStore).toEqual(beforeLive);
    }
  );

  it("regenerates one occurrence with replacement history and embedded PI memory", async () => {
    const previous = artifact();
    const f = fixture({ records: [previous] });
    const replacement = artifact({
      generatedAt: "2026-07-26T14:00:00.000Z",
      briefing: {
        ...previous.briefing,
        weeklyNarrative: {
          ...previous.briefing.weeklyNarrative,
          cards: { progress: { activity: { completedDays: 6 } } },
        },
      },
      piMemory: { ...previous.piMemory, communicatedClaimIds: ["claim-2"] },
    });
    const result = await f.service.commit(createWeeklyPreparedCommit({
      operation: "regeneration",
      artifact: replacement,
      baseline: f.service.captureBaseline(),
      expectedExistingArtifact: previous,
      reason: "authorized late evidence correction",
    }));
    const persisted = JSON.parse(fs.readFileSync(f.filePath, "utf8"));
    expect(result.status).toBe("regenerated");
    expect(persisted.revision).toBe(8);
    expect(persisted.dailyBriefings).toHaveLength(1);
    expect(persisted.dailyBriefings[0]).toMatchObject({
      id: previous.id,
      piMemory: replacement.piMemory,
      briefing: { weeklyNarrative: { cards: { progress: { activity: { completedDays: 6 } } } } },
    });
    expect(persisted.dailyBriefings[0].replacedBriefingHistory).toHaveLength(1);
  });

  it("replays the accepted July 19-25 artifact without recomposing its six paired days", async () => {
    const sourcePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");
    const source = fs.readFileSync(sourcePath);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "weekly-founder-replay-"));
    directories.push(directory);
    const filePath = path.join(directory, "runtime-store.json");
    fs.writeFileSync(filePath, source);
    const liveStore = JSON.parse(source);
    const repositories = createSeedRepositories(liveStore);
    const persistence = createFounderWeeklyBriefingPersistenceService({ filePath, liveStore });
    const service = createWeeklyNarrativeService({
      repositories,
      weeklyPersistence: persistence,
      now: () => new Date("2026-07-26T15:00:00.000Z"),
    });
    const before = persistence.captureBaseline();
    const result = await service.catchUpClosedWindow({
      userId: "user_founder_001",
      windowContract: {
        cadence: "weekly",
        startDate: "2026-07-19",
        endDate: "2026-07-25",
        briefingDate: "2026-07-26",
        timeZone: "America/Los_Angeles",
        expectedArtifactId: "weekly_briefing_2026-07-19_2026-07-25",
        reason: "isolated_replay",
      },
    });
    expect(result.status).toBe("matched");
    expect(result.artifact.briefing.weeklyNarrative.cards.progress.activity.completedDays).toBe(6);
    expect(persistence.captureBaseline()).toMatchObject({
      revision: before.revision,
      lastCommitId: before.lastCommitId,
      fileHash: before.fileHash,
    });
  });

  it("regenerates the accepted artifact only in an isolated clone with six paired days", async () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "private/founder/runtime-store.json")
    );
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "weekly-founder-regeneration-"));
    directories.push(directory);
    const filePath = path.join(directory, "runtime-store.json");
    fs.writeFileSync(filePath, source);
    const liveStore = JSON.parse(source);
    const repositories = createSeedRepositories(liveStore);
    const persistence = createFounderWeeklyBriefingPersistenceService({
      filePath,
      liveStore,
      now: () => new Date("2026-07-26T15:00:00.000Z"),
    });
    const service = createWeeklyNarrativeService({
      repositories,
      weeklyPersistence: persistence,
      now: () => new Date("2026-07-26T15:00:00.000Z"),
    });
    const before = persistence.captureBaseline();
    const regenerated = await service.regenerate({
      userId: "user_founder_001",
      reason: "isolated late Activity verification",
    });
    const after = persistence.captureBaseline();
    const narrative = regenerated.briefing.weeklyNarrative;
    expect(regenerated.id).toBe("weekly_briefing_2026-07-19_2026-07-25");
    expect(narrative.provenance.version).toBe("weekly_narrative_v5_2");
    expect(narrative.cards.progress.activity.completedDays).toBe(6);
    expect(
      narrative.cards.interpretation.domains.find((item) => item.domain === "estimated_energy")
        .highlight
    ).toMatch(/across 6 paired days/);
    expect(narrative.context).toMatchObject({
      activeGoalSummary: { title: "Build Lean Mass" },
      activePhase: { name: "Establish Maintenance" },
      operatingState: { value: "calibration" },
    });
    expect(after.revision).toBe(before.revision + 1);
    expect(after.lastCommitId).not.toBe(before.lastCommitId);
    const persisted = JSON.parse(fs.readFileSync(filePath, "utf8"));
    expect(persisted.dailyBriefings.find((item) => item.id === regenerated.id)
      .replacedBriefingHistory.length).toBeGreaterThan(0);
  });
});
