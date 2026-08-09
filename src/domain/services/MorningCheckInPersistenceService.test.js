import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FounderStoreUnitOfWorkErrorCode,
  createFounderStoreUnitOfWork,
  createNodeFounderStoreFileSystem,
} from "../../data/repositories/FounderStoreUnitOfWork";
import { createWeightEntry } from "../models/weightEntry";
import { createMorningCheckInPersistenceService } from "./MorningCheckInPersistenceService";

const USER_ID = "user_founder_001";
const NOW = new Date("2026-08-09T15:24:17.685Z");
const TODAY = "2026-08-09";
const YESTERDAY = "2026-08-08";
const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("MorningCheckInPersistenceService", () => {
  it("commits weight, check-in, evidence, analysis, and reconciliation once", async () => {
    const fixture = createFixture({ reminders: [reminder("priority_1")] });
    const createCommitId = vi.fn(() => "morning-commit-1");
    const service = createService(fixture, { createCommitId });

    const result = await service.save(command({
      reconciliationSubmissions: [submission("priority_1", "completed")],
    }));
    const persisted = readStore(fixture.filePath);

    expect(result).toEqual({
      status: "saved",
      committed: true,
      analysisId: "analysis_morning_weight_20260809152417685",
      revision: 12,
      commitId: "morning-commit-1",
    });
    expect(createCommitId).toHaveBeenCalledOnce();
    expect(persisted.revision).toBe(12);
    expect(persisted.lastCommitId).toBe("morning-commit-1");
    expect(persisted.weightEntries.filter(todayWeight)).toHaveLength(1);
    expect(persisted.weightEntries.find(todayWeight)).toMatchObject({
      id: "weight_2026_08_09",
      measuredAt: TODAY,
      weight: { value: 165.9, unit: "lb" },
      source: { type: "manual", name: "Morning Check-In" },
      reliability: "high",
    });
    expect(persisted.dailyCheckIns.filter(todayCheckIn)).toHaveLength(1);
    expect(persisted.dailyCheckIns.find(todayCheckIn)).toMatchObject({
      id: "daily_check_in_2026_08_09",
      date: TODAY,
      weightEntryId: "weight_2026_08_09",
      notes: "Slept well",
      source: { type: "manual", name: "Morning Check-In" },
    });
    expect(persisted.canonicalEvidenceObjects).toContainEqual(
      expect.objectContaining({
        canonicalId: `morning_weight|${USER_ID}|${TODAY}`,
        evidence_type: "morning_weight",
        payload: expect.objectContaining({
          observed_at: TODAY,
          provenance: expect.objectContaining({
            daily_check_in_ids: ["daily_check_in_2026_08_09"],
            weight_entry_ids: ["weight_2026_08_09"],
          }),
        }),
      })
    );
    expect(persisted.analyses).toContainEqual(
      expect.objectContaining({
        id: "analysis_morning_weight_20260809152417685",
        evidenceIds: ["weight_2026_08_09"],
        evidenceTypes: ["weight"],
      })
    );
    expect(
      persisted.dailyCheckIns.find((item) => item.date === YESTERDAY)
        .reconciliation
    ).toContainEqual(expect.objectContaining({
      key: `priority_1:${YESTERDAY}`,
      reminderId: "priority_1",
      status: "completed",
    }));
    expect(persisted.reminders[0].completedAt)
      .toBe(`${YESTERDAY}T20:00:00`);
    expect(fixture.liveStore).toEqual(persisted);
  });

  it("rolls back a mid-operation failure and retries without duplicates", async () => {
    const failure = new Error("stop after staged weight");
    const fixture = createFixture();
    const beforeBytes = fs.readFileSync(fixture.filePath);
    const beforeLive = structuredClone(fixture.liveStore);
    const failing = createService(fixture, {
      faults: {
        afterWeightMutation() {
          throw failure;
        },
      },
    });

    await expect(failing.save(command())).rejects.toMatchObject({
      code: FounderStoreUnitOfWorkErrorCode.STAGE_FAILED,
      cause: failure,
      committed: false,
    });
    expect(fs.readFileSync(fixture.filePath)).toEqual(beforeBytes);
    expect(fixture.liveStore).toEqual(beforeLive);

    const retry = await createService(fixture, {
      createCommitId: () => "retry-commit",
    }).save(command());
    const persisted = readStore(fixture.filePath);
    expect(retry).toMatchObject({ committed: true, revision: 12 });
    expect(persisted.weightEntries.filter(todayWeight)).toHaveLength(1);
    expect(persisted.dailyCheckIns.filter(todayCheckIn)).toHaveLength(1);
    expect(persisted.canonicalEvidenceObjects).toHaveLength(1);
    expect(persisted.analyses).toHaveLength(1);
  });

  it("preserves accepted bytes and live state when atomic commit fails", async () => {
    const fixture = createFixture();
    const beforeBytes = fs.readFileSync(fixture.filePath);
    const beforeLive = structuredClone(fixture.liveStore);
    const base = createNodeFounderStoreFileSystem();
    const fileSystem = {
      ...base,
      atomicReplace() {
        throw new Error("injected replace failure");
      },
    };
    const service = createMorningCheckInPersistenceService({
      runtimeStorePath: fixture.filePath,
      liveStore: fixture.liveStore,
      now: () => NOW,
      createUnitOfWork: (options) =>
        createFounderStoreUnitOfWork({ ...options, fileSystem }),
    });

    await expect(service.save(command())).rejects.toMatchObject({
      code: FounderStoreUnitOfWorkErrorCode.ATOMIC_REPLACE_FAILED,
      committed: false,
    });
    expect(fs.readFileSync(fixture.filePath)).toEqual(beforeBytes);
    expect(fixture.liveStore).toEqual(beforeLive);
    expect(
      fs.readdirSync(path.dirname(fixture.filePath))
        .filter((name) => name.endsWith(".tmp"))
    ).toEqual([]);
  });

  it("makes an ordinary successful retry a no-op without new identities", async () => {
    const fixture = createFixture();
    const service = createService(fixture, {
      createCommitId: (() => {
        let sequence = 0;
        return () => `commit-${++sequence}`;
      })(),
    });
    await service.save(command());
    const afterFirst = fs.readFileSync(fixture.filePath);
    const retry = await service.save(command());

    expect(retry).toMatchObject({
      status: "unchanged",
      committed: false,
      revision: 12,
      commitId: "commit-1",
    });
    expect(fs.readFileSync(fixture.filePath)).toEqual(afterFirst);
    expect(fixture.liveStore.weightEntries.filter(todayWeight)).toHaveLength(1);
    expect(fixture.liveStore.dailyCheckIns.filter(todayCheckIn)).toHaveLength(1);
    expect(fixture.liveStore.canonicalEvidenceObjects).toHaveLength(1);
    expect(fixture.liveStore.analyses).toHaveLength(1);
  });

  it("allows one concurrent commit and rejects the stale candidate without partial state", async () => {
    const fixture = createFixture();
    let arrivals = 0;
    let release;
    const barrier = new Promise((resolve) => {
      release = resolve;
    });
    const faults = {
      async afterWeightMutation() {
        arrivals += 1;
        if (arrivals === 2) release();
        await barrier;
      },
    };
    let commitSequence = 0;
    const createUnitOfWork = (options) =>
      createFounderStoreUnitOfWork({
        ...options,
        createCommitId: () => `concurrent-${++commitSequence}`,
      });
    const first = createMorningCheckInPersistenceService({
      runtimeStorePath: fixture.filePath,
      liveStore: fixture.liveStore,
      now: () => NOW,
      createUnitOfWork,
      faults,
    });
    const second = createMorningCheckInPersistenceService({
      runtimeStorePath: fixture.filePath,
      liveStore: fixture.liveStore,
      now: () => NOW,
      createUnitOfWork,
      faults,
    });

    const results = await Promise.allSettled([
      first.save(command({ weightValue: 165.9 })),
      second.save(command({ weightValue: 166.1 })),
    ]);
    const persisted = readStore(fixture.filePath);

    expect(results.map((item) => item.status).sort())
      .toEqual(["fulfilled", "rejected"]);
    expect(results.find((item) => item.status === "rejected").reason)
      .toMatchObject({
        code: FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT,
        committed: false,
      });
    expect(persisted.revision).toBe(12);
    expect(persisted.weightEntries.filter(todayWeight)).toHaveLength(1);
    expect(persisted.dailyCheckIns.filter(todayCheckIn)).toHaveLength(1);
    expect(persisted.canonicalEvidenceObjects).toHaveLength(1);
    expect(persisted.analyses).toHaveLength(1);
    expect(fixture.liveStore).toEqual(persisted);
  });

  it("never overwrites an unrelated Founder commit that wins the revision race", async () => {
    const fixture = createFixture();
    let staged;
    let release;
    const stagedSignal = new Promise((resolve) => {
      staged = resolve;
    });
    const releaseSignal = new Promise((resolve) => {
      release = resolve;
    });
    const service = createService(fixture, {
      faults: {
        async afterWeightMutation() {
          staged();
          await releaseSignal;
        },
      },
    });
    const morningAttempt = service.save(command());
    await stagedSignal;

    const unrelated = createFounderStoreUnitOfWork({
      filePath: fixture.filePath,
      liveStore: fixture.liveStore,
      createCommitId: () => "unrelated-commit",
    });
    await unrelated.execute({
      mutate(candidate) {
        candidate.goals.push({
          id: "unrelated-goal",
          userId: USER_ID,
          status: "active",
        });
      },
    });
    release();

    await expect(morningAttempt).rejects.toMatchObject({
      code: FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT,
      committed: false,
    });
    const persisted = readStore(fixture.filePath);
    expect(persisted).toMatchObject({
      revision: 12,
      lastCommitId: "unrelated-commit",
    });
    expect(persisted.goals).toContainEqual(
      expect.objectContaining({ id: "unrelated-goal" })
    );
    expect(persisted.weightEntries.filter(todayWeight)).toHaveLength(0);
    expect(persisted.dailyCheckIns.filter(todayCheckIn)).toHaveLength(0);
    expect(persisted.canonicalEvidenceObjects).toHaveLength(0);
    expect(persisted.analyses).toHaveLength(0);
    expect(fixture.liveStore).toEqual(persisted);
  });
});

function createFixture({ reminders = [] } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "morning-uow-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const liveStore = {
    version: "morning-check-in-test",
    revision: 11,
    lastCommitId: "accepted-before",
    updatedAt: "2026-08-08T15:00:00.000Z",
    user: user(),
    goals: [],
    goalTransitionDrafts: [],
    goalProtocolTransitionDrafts: [],
    weightEntries: [priorWeight()],
    dexaScans: [],
    protocols: [],
    protocolVersions: [],
    energyStrategyLinks: [],
    executionItems: [],
    reminders,
    nutritionContext: null,
    operatingPlan: null,
    operatingRhythm: null,
    adaptiveTrustProfile: null,
    milestones: [],
    progressPhotos: [],
    dailyCheckIns: [],
    dailyBriefings: [],
    analyses: [],
    evidencePackages: [],
    evidenceReviews: [],
    trainingPerformanceEvents: [],
    goalConfidenceSnapshots: [],
    goalConfidenceHistory: [],
    goalConfidenceContinuitySeeds: [],
    canonicalEvidenceObjects: [],
  };
  fs.writeFileSync(filePath, `${JSON.stringify(liveStore)}\n`);
  return { directory, filePath, liveStore };
}

function createService(fixture, { createCommitId, faults = {} } = {}) {
  return createMorningCheckInPersistenceService({
    runtimeStorePath: fixture.filePath,
    liveStore: fixture.liveStore,
    now: () => NOW,
    createUnitOfWork: (options) =>
      createFounderStoreUnitOfWork({
        ...options,
        ...(createCommitId ? { createCommitId } : {}),
      }),
    faults,
  });
}

function command(overrides = {}) {
  return {
    user: user(),
    weightValue: 165.9,
    today: TODAY,
    createdAt: NOW.toISOString(),
    at: NOW,
    timeZone: "America/Los_Angeles",
    notes: "Slept well",
    protocolChangeNote: null,
    estimatedCalories: 2200,
    estimatedCaloriesBurned: 300,
    proteinTarget: 165,
    proteinAchieved: 170,
    weighInContext: {
      timing: "morning",
      nutritionState: "fasted",
      intakeState: "before_food_water",
      scale: "normal_home_scale",
      confidence: "high",
      conditions: [],
      notes: null,
      isDefault: true,
    },
    reconciliationSubmissions: [],
    ...overrides,
  };
}

function user() {
  return {
    id: USER_ID,
    timezone: "America/Los_Angeles",
    preferences: { weightUnit: "lb" },
  };
}

function priorWeight() {
  return createWeightEntry({
    id: "weight_2026_08_08",
    userId: USER_ID,
    measuredAt: YESTERDAY,
    weight: { value: 167.5, unit: "lb" },
    source: { type: "manual", name: "Fixture" },
    createdAt: "2026-08-08T15:00:00.000Z",
    updatedAt: "2026-08-08T15:00:00.000Z",
  });
}

function reminder(id) {
  return {
    id,
    userId: USER_ID,
    title: id,
    type: "protocol_reminder",
    active: true,
    schedule: { cadence: "daily", type: "daily", timeOfDay: "morning" },
  };
}

function submission(id, disposition) {
  return {
    occurrenceKey: `${id}:${YESTERDAY}`,
    priorityId: id,
    occurrenceDate: YESTERDAY,
    disposition,
    note: null,
  };
}

function readStore(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function todayWeight(item) {
  return item.userId === USER_ID && item.measuredAt === TODAY;
}

function todayCheckIn(item) {
  return item.userId === USER_ID && item.date === TODAY;
}
