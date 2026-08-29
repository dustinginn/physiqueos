import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUserRepository } from "../../data/repositories/UserRepository";
import { createWeightRepository } from "../../data/repositories/WeightRepository";
import { createWeightEntry } from "../../domain/models/weightEntry";
import { isMorningWeighInSatisfied } from "../../domain/services/TrackingSupportService";
import { getWeeklyAverages } from "../../domain/services/ProgressReportingService";

const actionHarness = vi.hoisted(() => ({
  repositories: null,
  revalidatePath: vi.fn(),
  liveStore: null,
  runtimeStorePath: null,
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args) => actionHarness.revalidatePath(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("../../data/repositories/founderRepositories", () => ({
  FounderRepositories: new Proxy({}, {
    get(_target, property) {
      return actionHarness.repositories?.[property];
    },
  }),
}));

vi.mock("../../data/repositories/founderRuntimeStore", () => ({
  getFounderRuntimeStore: () => actionHarness.liveStore,
  resolveFounderRuntimeStorePath: () => actionHarness.runtimeStorePath,
}));

import { saveDirectWeighIn } from "./actions";

const NOW = new Date("2026-08-29T15:24:17.685Z");
const TODAY = "2026-08-29";
const HISTORICAL_DATE = "2026-08-20";
const USER_ID = "user_founder_001";
const directories = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  actionHarness.revalidatePath.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("Log direct weigh-in executable action", () => {
  it("persists a historical date with current audit timestamps and chronological reporting", async () => {
    const fixture = createFixture();

    const result = await saveDirectWeighIn(weightForm("168.4", HISTORICAL_DATE));

    expect(result).toEqual({
      ok: true,
      status: "saved",
      date: HISTORICAL_DATE,
      message: "Weigh-in logged for Aug 20.",
    });
    const historical = fixture.liveStore.weightEntries.find(
      (entry) => entry.measuredAt === HISTORICAL_DATE
    );
    expect(historical).toMatchObject({
      id: "weight_2026_08_20",
      measuredAt: HISTORICAL_DATE,
      weight: { value: 168.4, unit: "lb" },
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect(fixture.liveStore.dailyCheckIns).toContainEqual(
      expect.objectContaining({
        id: "daily_check_in_2026_08_20",
        date: HISTORICAL_DATE,
        weightEntryId: historical.id,
      })
    );
    expect(fixture.liveStore.canonicalEvidenceObjects).toContainEqual(
      expect.objectContaining({
        canonicalId: `morning_weight|${USER_ID}|${HISTORICAL_DATE}`,
        createdAt: NOW.toISOString(),
        payload: expect.objectContaining({
          measuredAt: HISTORICAL_DATE,
          observed_at: HISTORICAL_DATE,
        }),
      })
    );

    const latest = await createWeightRepository(
      fixture.liveStore.weightEntries
    ).getLatestWeightEntry(USER_ID);
    expect(latest.measuredAt).toBe(TODAY);
    const orderedDates = fixture.liveStore.weightEntries
      .map((entry) => entry.measuredAt)
      .sort();
    expect(orderedDates).toEqual(["2026-08-19", HISTORICAL_DATE, TODAY]);
    const weekly = getWeeklyAverages(
      fixture.liveStore.weightEntries.map((entry) => ({
        date: entry.measuredAt,
        value: entry.weight.value,
      }))
    );
    expect(weekly).toContainEqual(expect.objectContaining({
      average: 169.3,
      entries: 2,
    }));
  });

  it("does not satisfy today's morning priority with a historical weigh-in", async () => {
    const fixture = createFixture();

    await saveDirectWeighIn(weightForm("168.4", HISTORICAL_DATE));

    expect(isMorningWeighInSatisfied({
      checkIns: fixture.liveStore.dailyCheckIns,
      localDate: TODAY,
      timeZone: "America/Los_Angeles",
      weightEntries: fixture.liveStore.weightEntries.filter(
        (entry) => entry.measuredAt !== TODAY
      ),
    })).toBe(false);
    expect(fixture.liveStore.dailyCheckIns.some((item) => item.date === TODAY))
      .toBe(false);
  });

  it("supports today's date with existing same-day semantics", async () => {
    const fixture = createFixture({ includeToday: false });

    const result = await saveDirectWeighIn(weightForm("166.2", TODAY));

    expect(result).toMatchObject({
      ok: true,
      status: "saved",
      date: TODAY,
      message: "Weigh-in logged for today.",
    });
    expect(isMorningWeighInSatisfied({
      checkIns: fixture.liveStore.dailyCheckIns,
      localDate: TODAY,
      timeZone: "America/Los_Angeles",
      weightEntries: fixture.liveStore.weightEntries,
    })).toBe(true);
  });

  it("rejects future and malformed dates before persistence", async () => {
    const fixture = createFixture();
    const before = JSON.stringify(fixture.liveStore);

    await expect(saveDirectWeighIn(weightForm("165.9", "2026-08-30")))
      .resolves.toEqual({
        ok: false,
        error: "A weigh-in cannot be logged for a future date.",
      });
    await expect(saveDirectWeighIn(weightForm("165.9", "2026-02-30")))
      .resolves.toEqual({
        ok: false,
        error: "Choose a valid weigh-in date.",
      });
    expect(JSON.stringify(fixture.liveStore)).toBe(before);
    expect(actionHarness.revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps exact retries idempotent and different values corrective", async () => {
    const fixture = createFixture();

    await saveDirectWeighIn(weightForm("168.4", HISTORICAL_DATE));
    const revisionAfterFirst = fixture.liveStore.revision;
    const firstEvidence = structuredClone(
      fixture.liveStore.canonicalEvidenceObjects
    );
    actionHarness.revalidatePath.mockClear();
    const retry = await saveDirectWeighIn(weightForm("168.4", HISTORICAL_DATE));

    expect(retry).toMatchObject({ status: "unchanged" });
    expect(fixture.liveStore.revision).toBe(revisionAfterFirst);
    expect(fixture.liveStore.canonicalEvidenceObjects).toEqual(firstEvidence);
    expect(actionHarness.revalidatePath).not.toHaveBeenCalled();

    const correction = await saveDirectWeighIn(
      weightForm("168.1", HISTORICAL_DATE)
    );
    const entries = fixture.liveStore.weightEntries.filter(
      (entry) => entry.measuredAt === HISTORICAL_DATE
    );
    expect(correction).toMatchObject({ status: "saved" });
    expect(entries).toHaveLength(1);
    expect(entries[0].weight.value).toBe(168.1);
    expect(entries[0].correctionHistory).toHaveLength(1);
    expect(entries[0].correctionHistory[0].previousEntry.weight.value).toBe(168.4);
    expect(fixture.liveStore.canonicalEvidenceObjects.filter(
      (item) => item.canonicalId === `morning_weight|${USER_ID}|${HISTORICAL_DATE}`
    )).toHaveLength(1);
    expect(fixture.liveStore.analyses.filter(
      (analysis) => analysis.evidenceIds?.includes("weight_2026_08_20")
    )).toHaveLength(1);
  });
});

function createFixture({ includeToday = true } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "log-weigh-in-action-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const weightEntries = [weightEntry("2026-08-19", 170.2)];
  if (includeToday) weightEntries.push(weightEntry(TODAY, 166.5));
  const user = {
    id: USER_ID,
    timezone: "America/Los_Angeles",
    preferences: {
      weightUnit: "lb",
      defaultWeighInContext: {
        timing: "morning",
        nutritionState: "fasted",
        intakeState: "before_food_water",
        scale: "normal_home_scale",
        confidence: "high",
      },
    },
  };
  const liveStore = {
    version: "log-direct-weigh-in-test",
    revision: 29,
    lastCommitId: "before-direct-weigh-in",
    updatedAt: "2026-08-29T14:00:00.000Z",
    user,
    goals: [],
    goalTransitionDrafts: [],
    goalProtocolTransitionDrafts: [],
    weightEntries,
    dexaScans: [],
    protocols: [],
    protocolVersions: [],
    energyStrategyLinks: [],
    executionItems: [],
    reminders: [],
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
  actionHarness.liveStore = liveStore;
  actionHarness.runtimeStorePath = filePath;
  actionHarness.repositories = {
    users: createUserRepository(user),
  };
  return { filePath, liveStore };
}

function weightEntry(date, value) {
  return createWeightEntry({
    id: `weight_${date.replaceAll("-", "_")}`,
    userId: USER_ID,
    measuredAt: date,
    weight: { value, unit: "lb" },
    source: { type: "manual", name: "Fixture" },
    createdAt: `${date}T15:00:00.000Z`,
    updatedAt: `${date}T15:00:00.000Z`,
  });
}

function weightForm(value, date) {
  const formData = new FormData();
  formData.set("weight", value);
  formData.set("evidenceDate", date);
  return formData;
}
