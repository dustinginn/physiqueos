import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUserRepository } from "../../../data/repositories/UserRepository";
import { FounderStoreUnitOfWorkErrorCode } from "../../../data/repositories/FounderStoreUnitOfWork";
import { createDailyCheckIn } from "../../../domain/models/dailyCheckIn";
import { createWeightEntry } from "../../../domain/models/weightEntry";

const actionHarness = vi.hoisted(() => ({
  redirect: vi.fn(),
  redirectSignal: null,
  repositories: null,
  revalidatePath: vi.fn(),
  faults: {},
  liveStore: null,
  runtimeStorePath: null,
  briefingFinalization: null,
}));

vi.mock(
  "../../../domain/services/MorningBriefingFinalizationService",
  () => ({
    createFounderMorningBriefingFinalizationService: () => ({
      finalize: (...args) => actionHarness.briefingFinalization(...args),
    }),
  })
);

const directories = [];

vi.mock("next/cache", () => ({
  revalidatePath: (...args) => actionHarness.revalidatePath(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args) => actionHarness.redirect(...args),
}));

vi.mock("../../../data/repositories/founderRepositories", () => ({
  FounderRepositories: new Proxy({}, {
    get(_target, property) {
      return actionHarness.repositories?.[property];
    },
  }),
}));

vi.mock("../../../data/repositories/founderRuntimeStore", () => ({
  getFounderRuntimeStore: () => actionHarness.liveStore,
  resolveFounderRuntimeStorePath: () => actionHarness.runtimeStorePath,
}));

vi.mock(
  "../../../domain/services/MorningCheckInPersistenceService",
  async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      createMorningCheckInPersistenceService: (options) =>
        actual.createMorningCheckInPersistenceService({
          ...options,
          faults: actionHarness.faults,
        }),
    };
  }
);

import { saveMorningCheckIn } from "./actions";

const NOW = new Date("2026-08-02T15:24:17.685Z");
const TODAY = "2026-08-02";
const YESTERDAY = "2026-08-01";
const USER_ID = "user_founder_001";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  actionHarness.redirect.mockReset();
  actionHarness.revalidatePath.mockReset();
  actionHarness.faults = {};
  actionHarness.briefingFinalization = vi.fn(async () => ({
    status: "current",
    attempted: 0,
    completed: 0,
    failed: 0,
  }));
  actionHarness.redirectSignal = new Error("NEXT_REDIRECT");
  actionHarness.redirect.mockImplementation(() => {
    throw actionHarness.redirectSignal;
  });
});

afterEach(() => {
  vi.useRealTimers();
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("Morning Check-In executable action boundary", () => {
  it("Cases A, C, H, K, M, N, and P complete the isolated incident path", async () => {
    const fixture = createFixture();
    const formData = weightForm("165.9", {
      estimatedCalories: "",
      estimatedCaloriesBurned: "",
      notes: "",
      proteinAchieved: "",
      proteinTarget: "",
      protocolChanges: "",
    });

    await expectSuccessRedirect(formData);

    expect(fixture.weights).toHaveLength(2);
    expect(fixture.weights.at(-1)).toMatchObject({
      id: "weight_2026_08_02",
      measuredAt: TODAY,
      weight: { value: 165.9, unit: "lb" },
    });
    expect(fixture.checkIns).toHaveLength(1);
    expect(fixture.checkIns[0]).toMatchObject({
      id: "daily_check_in_2026_08_02",
      date: TODAY,
      userId: USER_ID,
      weightEntryId: "weight_2026_08_02",
    });
    expect(fixture.canonicalEvidence).toHaveLength(1);
    expect(fixture.canonicalEvidence[0]).toMatchObject({
      canonicalId: `morning_weight|${USER_ID}|${TODAY}`,
      evidence_type: "morning_weight",
    });
    expect(fixture.analyses).toHaveLength(1);
    expect(fixture.analyses[0].summary).toContain("down 1.6 lb");
    expect(fixture.liveStore.revision).toBe(8);
    expect(fixture.liveStore.lastCommitId).not.toBe("before-morning");
    expect(JSON.parse(fs.readFileSync(fixture.filePath, "utf8")))
      .toEqual(fixture.liveStore);
    expect(actionHarness.revalidatePath.mock.calls).toEqual([
      ["/"],
      ["/progress"],
      ["/progress/weight"],
      [expect.stringMatching(/^\/analysis\/analysis_morning_weight_\d+$/)],
    ]);
    expect(actionHarness.redirect).toHaveBeenCalledWith("/?weight=saved");
  });

  it("Case B updates one existing daily check-in without duplicating unrelated state", async () => {
    const existingCheckIn = createDailyCheckIn({
      id: "daily_check_in_2026_08_02",
      userId: USER_ID,
      date: TODAY,
      activity: { steps: 4321, workoutCompleted: false },
      completedFocusItems: ["keep-this"],
      mood: "steady",
      reconciliation: [{ reminderId: "existing", status: "note" }],
      createdAt: "2026-08-02T14:00:00.000Z",
      updatedAt: "2026-08-02T14:00:00.000Z",
    });
    const fixture = createFixture({ checkIns: [existingCheckIn] });

    await expectSuccessRedirect(weightForm("165.9"));

    expect(fixture.checkIns).toHaveLength(1);
    expect(fixture.checkIns[0]).toMatchObject({
      activity: { steps: 4321, workoutCompleted: false },
      completedFocusItems: ["keep-this"],
      mood: "steady",
      reconciliation: [{ reminderId: "existing", status: "note" }],
      weightEntryId: "weight_2026_08_02",
    });
  });

  it.each([
    ["Case D one reconciliation", [reminder("one")], [["one", "completed", ""]]],
    [
      "Case E multiple reconciliations",
      [reminder("one"), reminder("two")],
      [["one", "completed", ""], ["two", "note", "Keep context."]],
    ],
  ])("%s preserves reconciliation and completes the weight flow", async (_label, reminders, submissions) => {
    const fixture = createFixture({ reminders });
    const formData = weightForm("165.9");
    submissions.forEach(([id, status, note]) => appendReconciliation(formData, id, status, note));

    await expectSuccessRedirect(formData);

    const previousDayCheckIn = fixture.checkIns.find((item) => item.date === YESTERDAY);
    expect(previousDayCheckIn.reconciliation).toHaveLength(submissions.length);
    expect(previousDayCheckIn.reconciliation.map((item) => item.status)).toEqual(
      submissions.map(([, status]) => status)
    );
    expect(fixture.checkIns.filter((item) => item.date === TODAY)).toHaveLength(1);
    expect(fixture.weights.some((item) => item.measuredAt === TODAY)).toBe(true);
    expect(fixture.canonicalEvidence).toHaveLength(1);
    expect(fixture.analyses).toHaveLength(1);
  });

  it.each([
    ["Case F missing disposition", [reminder("one")], (formData) => {
      appendReconciliation(formData, "one", "", "");
    }, "unsupported_disposition"],
    ["Case G fabricated ID", [reminder("one")], (formData) => {
      appendReconciliation(formData, "fabricated", "skipped", "");
    }, "ineligible_occurrence"],
  ])("%s rejects before weight persistence", async (_label, reminders, prepare, code) => {
    const fixture = createFixture({ reminders });
    const formData = weightForm("165.9");
    prepare(formData);

    await expect(saveMorningCheckIn(formData)).rejects.toMatchObject({ code });

    expect(fixture.weights).toHaveLength(1);
    expect(fixture.checkIns).toHaveLength(0);
    expect(fixture.canonicalEvidence).toHaveLength(0);
    expect(fixture.analyses).toHaveLength(0);
    expect(actionHarness.revalidatePath).not.toHaveBeenCalled();
    expect(actionHarness.redirect).not.toHaveBeenCalled();
  });

  it("Case I keeps an exact same-day weight idempotent", async () => {
    const fixture = createFixture();

    await expectSuccessRedirect(weightForm("165.9"));
    const stateAfterFirstSave = fixtureCounts(fixture);
    const revisionAfterFirstSave = fixture.liveStore.revision;
    const commitAfterFirstSave = fixture.liveStore.lastCommitId;
    resetFrameworkSpies();
    await expectRedirect(weightForm("165.9"), "/?weight=unchanged");

    expect(fixtureCounts(fixture)).toEqual(stateAfterFirstSave);
    expect(fixture.weights.filter((item) => item.measuredAt === TODAY)).toHaveLength(1);
    expect(fixture.canonicalEvidence).toHaveLength(1);
    expect(fixture.analyses).toHaveLength(1);
    expect(fixture.liveStore.revision).toBe(revisionAfterFirstSave);
    expect(fixture.liveStore.lastCommitId).toBe(commitAfterFirstSave);
    expect(actionHarness.revalidatePath).not.toHaveBeenCalled();
  });

  it("Case J performs one controlled same-day correction and completes", async () => {
    const fixture = createFixture();

    await expectSuccessRedirect(weightForm("166.0"));
    resetFrameworkSpies();
    await expectSuccessRedirect(weightForm("165.9"));

    const todayWeights = fixture.weights.filter((item) => item.measuredAt === TODAY);
    expect(todayWeights).toHaveLength(1);
    expect(todayWeights[0].weight.value).toBe(165.9);
    expect(todayWeights[0].correctionHistory).toHaveLength(1);
    expect(todayWeights[0].correctionHistory[0].previousEntry.weight.value).toBe(166);
    expect(fixture.checkIns.filter((item) => item.date === TODAY)).toHaveLength(1);
    expect(fixture.canonicalEvidence).toHaveLength(1);
    expect(fixture.analyses).toHaveLength(1);
    expect(fixture.analyses[0].replacedAnalysisHistory).toHaveLength(1);
  });

  it("Case L rolls every staged record back when a mid-operation failure occurs", async () => {
    const evidenceFailure = new Error("isolated evidence failure");
    const fixture = createFixture({ evidenceFailure });
    const beforeBytes = fs.readFileSync(fixture.filePath);
    const beforeStore = structuredClone(fixture.liveStore);

    await expect(saveMorningCheckIn(weightForm("165.9"))).rejects.toMatchObject({
      code: FounderStoreUnitOfWorkErrorCode.STAGE_FAILED,
      cause: evidenceFailure,
      committed: false,
    });

    expect(fixture.weights.some((item) => item.measuredAt === TODAY)).toBe(false);
    expect(fixture.checkIns.some((item) => item.date === TODAY)).toBe(false);
    expect(fixture.canonicalEvidence).toHaveLength(0);
    expect(fixture.analyses).toHaveLength(0);
    expect(fixture.liveStore).toEqual(beforeStore);
    expect(fs.readFileSync(fixture.filePath)).toEqual(beforeBytes);
    expect(actionHarness.revalidatePath).not.toHaveBeenCalled();
    expect(actionHarness.redirect).not.toHaveBeenCalled();
  });
});

function createFixture({ checkIns = [], evidenceFailure = null, reminders = [] } = {}) {
  const weights = [weightEntry(YESTERDAY, 167.5)];
  const analyses = [];
  const canonicalEvidence = [];
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
    version: "morning-check-in-test",
    revision: 7,
    lastCommitId: "before-morning",
    updatedAt: "2026-08-01T00:00:00.000Z",
    user,
    goals: [],
    goalTransitionDrafts: [],
    goalProtocolTransitionDrafts: [],
    weightEntries: weights,
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
    dailyCheckIns: checkIns,
    dailyBriefings: [],
    analyses,
    evidencePackages: [],
    evidenceReviews: [],
    trainingPerformanceEvents: [],
    goalConfidenceSnapshots: [],
    goalConfidenceHistory: [],
    goalConfidenceContinuitySeeds: [],
    canonicalEvidenceObjects: canonicalEvidence,
  };
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "morning-check-in-action-")
  );
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  fs.writeFileSync(filePath, `${JSON.stringify(liveStore)}\n`);
  const repositories = {
    users: createUserRepository(user),
  };
  if (evidenceFailure) {
    actionHarness.faults = {
      afterCanonicalEvidenceMutation: vi.fn(async () => {
        throw evidenceFailure;
      }),
    };
  }
  actionHarness.liveStore = liveStore;
  actionHarness.runtimeStorePath = filePath;
  actionHarness.repositories = repositories;
  return {
    analyses,
    canonicalEvidence,
    checkIns,
    filePath,
    liveStore,
    reminders,
    repositories,
    weights,
  };
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

function weightForm(value, optionalFields = {}) {
  const formData = new FormData();
  formData.set("weight", value);
  Object.entries(optionalFields).forEach(([name, fieldValue]) => {
    formData.set(name, fieldValue);
  });
  return formData;
}

function appendReconciliation(formData, id, status, note) {
  const occurrenceKey = `${id}:${YESTERDAY}`;
  formData.append("reconciliationKeys", occurrenceKey);
  formData.set(`${occurrenceKey}_priorityId`, id);
  formData.set(`${occurrenceKey}_date`, YESTERDAY);
  if (status) formData.set(`${occurrenceKey}_status`, status);
  if (note) formData.set(`${occurrenceKey}_note`, note);
}

async function expectSuccessRedirect(formData) {
  return expectRedirect(formData, "/?weight=saved");
}

async function expectRedirect(formData, target) {
  await expect(saveMorningCheckIn(formData)).rejects.toBe(actionHarness.redirectSignal);
  expect(actionHarness.redirect).toHaveBeenCalledWith(target);
}

function resetFrameworkSpies() {
  actionHarness.redirect.mockClear();
  actionHarness.revalidatePath.mockClear();
}

function fixtureCounts(fixture) {
  return {
    analyses: fixture.analyses.length,
    canonicalEvidence: fixture.canonicalEvidence.length,
    checkIns: fixture.checkIns.length,
    weights: fixture.weights.length,
  };
}
