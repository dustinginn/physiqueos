import { describe, expect, it, vi } from "vitest";
import { createBriefingCadenceExecutor } from "./BriefingCadenceExecutorService";
import { resolveBriefingCadenceRegistry } from "./BriefingCadenceRegistryService";

const WEDNESDAY = new Date("2026-07-29T19:00:00.000Z");
const SUNDAY = new Date("2026-08-02T19:00:00.000Z");

describe("production briefing cadence registry", () => {
  it("resolves the canonical Wednesday Midweek window and artifact identity", async () => {
    const entries = await resolveBriefingCadenceRegistry({
      repositories: repositories(),
      generators: generators(),
      now: WEDNESDAY,
    });
    const midweek = entries.find((entry) => entry.cadence === "midweek");
    expect(midweek).toMatchObject({
      eligible: true,
      localEligibleTime: "00:00",
      validLocalWeekdays: ["wednesday"],
      timeZone: "America/Los_Angeles",
      catchUpHorizon: "local_cadence_day",
      notificationEnabled: false,
      artifactIdempotent: true,
      expectedArtifactId:
        "midweek_briefing_user_founder_001_20260726_20260728",
      evidenceWindow: {
        id: "midweek:2026-07-26:2026-07-28:America/Los_Angeles",
        startDate: "2026-07-26",
        endDate: "2026-07-28",
        end: "2026-07-28T23:59:59.999",
        sameDayEvidenceExcluded: true,
      },
    });
  });

  it("evaluates Weekly through the same canonical registry", async () => {
    const entries = await resolveBriefingCadenceRegistry({
      repositories: repositories(),
      generators: generators(),
      now: SUNDAY,
    });
    expect(entries.find((entry) => entry.cadence === "weekly")).toMatchObject({
      eligible: true,
      localEligibleTime: "00:00",
      validLocalWeekdays: ["sunday"],
      expectedArtifactId: "weekly_briefing_2026-07-26_2026-08-01",
      evidenceWindow: {
        id: "weekly:2026-07-26:2026-08-01:America/Los_Angeles",
        startDate: "2026-07-26",
        endDate: "2026-08-01",
      },
    });
  });

  it("does not generate on an ineligible day or for a disabled cadence", async () => {
    const disabled = repositories({
      schedule: {
        midweek: { enabled: false, day: "wednesday", localTime: "00:00" },
        weekly: { enabled: true, day: "sunday", localTime: "00:00" },
      },
    });
    const calls = generators();
    const result = await executor({ repositories: disabled, generators: calls })
      .execute({ asOf: WEDNESDAY });
    expect(result.outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cadenceKey: "midweek",
        resultStatus: "skipped_disabled",
      }),
      expect.objectContaining({
        cadenceKey: "weekly",
        resultStatus: "ineligible",
      }),
    ]));
    expect(calls.midweek.generateForCurrentWindow).not.toHaveBeenCalled();
    expect(calls.weekly.generateForCurrentWindow).not.toHaveBeenCalled();
  });
});

describe("production briefing cadence executor", () => {
  it("generates one missing artifact and records operational lifecycle separately", async () => {
    const records = [];
    const calls = generators();
    const result = await executor({
      repositories: repositories(),
      generators: calls,
      records,
    }).execute({ asOf: WEDNESDAY });
    expect(calls.midweek.generateForCurrentWindow).toHaveBeenCalledOnce();
    expect(result.outcomes.find((item) => item.cadenceKey === "midweek"))
      .toMatchObject({
        resultStatus: "generation_completed",
        artifactOutcome: "created",
        expectedArtifactId:
          "midweek_briefing_user_founder_001_20260726_20260728",
      });
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ resultStatus: "generation_started" }),
      expect.objectContaining({ resultStatus: "generation_completed" }),
    ]));
    expect(repositories().store).not.toHaveProperty("cadenceExecutions");
  });

  it("returns already_completed without invoking a generator", async () => {
    const artifact = completedMidweek();
    const calls = generators();
    const result = await executor({
      repositories: repositories({ artifacts: [artifact] }),
      generators: calls,
    }).execute({ asOf: WEDNESDAY });
    expect(result.outcomes.find((item) => item.cadenceKey === "midweek"))
      .toMatchObject({
        resultStatus: "already_completed",
        artifactId: artifact.id,
      });
    expect(calls.midweek.generateForCurrentWindow).not.toHaveBeenCalled();
  });

  it("bounds overlapping executors and relies on canonical idempotency after the lock", async () => {
    let owned = false;
    const sharedLock = {
      async acquire() {
        if (owned) {
          return {
            acquired: false,
            reason: "executor_lock_active",
            async release() {},
          };
        }
        owned = true;
        return {
          acquired: true,
          async release() { owned = false; },
        };
      },
    };
    let releaseGeneration;
    const generationGate = new Promise((resolve) => { releaseGeneration = resolve; });
    const calls = generators({
      midweek: vi.fn(async () => {
        await generationGate;
        return completedResult();
      }),
    });
    const first = executor({
      repositories: repositories(),
      generators: calls,
      lock: sharedLock,
    }).execute({ asOf: WEDNESDAY });
    await vi.waitFor(() =>
      expect(calls.midweek.generateForCurrentWindow).toHaveBeenCalledOnce()
    );
    const second = await executor({
      repositories: repositories(),
      generators: calls,
      lock: sharedLock,
    }).execute({ asOf: WEDNESDAY });
    expect(second.outcomes.find((item) => item.cadenceKey === "midweek"))
      .toMatchObject({
        resultStatus: "generation_in_progress",
        artifactOutcome: "lock_owned_by_another_executor",
      });
    releaseGeneration();
    await first;
    expect(calls.midweek.generateForCurrentWindow).toHaveBeenCalledOnce();
  });

  it("catches up later on the same local day and does not regenerate late evidence", async () => {
    const calls = generators();
    const later = new Date("2026-07-30T06:55:00.000Z");
    const first = await executor({
      repositories: repositories(),
      generators: calls,
    }).execute({ asOf: later });
    expect(first.outcomes.find((item) => item.cadenceKey === "midweek"))
      .toMatchObject({
        resultStatus: "generation_completed",
        evidenceWindowId:
          "midweek:2026-07-26:2026-07-28:America/Los_Angeles",
      });
    const artifact = completedMidweek();
    const replayCalls = generators();
    await executor({
      repositories: repositories({
        artifacts: [artifact],
        weights: [{ measuredAt: "2026-07-29T20:48:00-07:00" }],
      }),
      generators: replayCalls,
    }).execute({ asOf: later });
    expect(replayCalls.midweek.generateForCurrentWindow).not.toHaveBeenCalled();
  });

  it("bounds a slow generator and retains the cross-process lock", async () => {
    const release = vi.fn();
    const calls = generators({
      midweek: vi.fn(() => new Promise(() => {})),
    });
    const result = await executor({
      repositories: repositories(),
      generators: calls,
      lock: {
        async acquire() {
          return { acquired: true, release };
        },
      },
      policy: {
        horizon: "local_cadence_day",
        missingArtifactGraceMinutes: 15,
        transientFailureLimit: 3,
        transientRetryCooldownMinutes: 15,
        generatorTimeoutMs: 5,
      },
    }).execute({ asOf: WEDNESDAY });
    expect(result).toMatchObject({ retainLock: true });
    expect(result.outcomes.find((item) => item.cadenceKey === "midweek"))
      .toMatchObject({
        resultStatus: "transient_failure",
        failureCategory: "generator_timeout",
        retryability: true,
      });
    expect(release).not.toHaveBeenCalled();
  });
});

function executor({
  repositories: repositorySet,
  generators: generatorSet,
  records = [],
  lock = null,
  policy = undefined,
}) {
  return createBriefingCadenceExecutor({
    repositories: repositorySet,
    generators: generatorSet,
    executionStore: {
      createExecutionId: () => `run-${records.length}`,
      async record(record) { records.push(record); },
      async getRetryState() {
        return {
          terminalFailure: false,
          consecutiveTransientFailures: 0,
          lastFailureAt: null,
          lastFailureCategory: null,
        };
      },
    },
    executionLock: lock ?? {
      async acquire() {
        return { acquired: true, async release() {} };
      },
    },
    source: "test",
    policy,
  });
}

function repositories({ artifacts = [], schedule = null, weights = [] } = {}) {
  const store = { artifacts, weights };
  const protocol = schedule
    ? {
      id: "briefings",
      protocolType: "briefings",
      currentVersionId: "briefings-v1",
    }
    : null;
  return {
    store,
    users: {
      getCurrentUser: vi.fn(async () => ({
        id: "user_founder_001",
        timeZone: "America/Los_Angeles",
      })),
      getUserById: vi.fn(async () => ({
        id: "user_founder_001",
        timeZone: "America/Los_Angeles",
      })),
    },
    protocols: {
      listActiveProtocols: vi.fn(async () => protocol ? [protocol] : []),
    },
    protocolVersions: {
      getCurrentVersion: vi.fn(async () => schedule ? {
        id: "briefings-v1",
        protocolId: "briefings",
        effectiveAt: "2026-07-01",
        coachingUpdates: {
          schemaVersion: "coaching_updates_schedule_v1",
          timeZone: "America/Los_Angeles",
          ...schedule,
          daily: { enabled: false },
          notificationPreference: "available_without_notification",
        },
      } : null),
    },
    goals: { getActiveGoal: vi.fn(async () => null) },
    dailyBriefings: {
      getBriefingByEvidenceWindow: vi.fn(async (_userId, windowId) =>
        artifacts.find((artifact) => artifact.evidenceWindow?.id === windowId) ?? null
      ),
    },
  };
}

function generators({ midweek, weekly } = {}) {
  return {
    midweek: {
      generateForCurrentWindow: midweek ?? vi.fn(async () => completedResult()),
    },
    weekly: {
      generateForCurrentWindow: weekly ?? vi.fn(async () => ({
        state: "completed",
        artifact: { id: "weekly" },
      })),
    },
  };
}

function completedResult() {
  return { state: "completed", artifact: completedMidweek(), idempotent: false };
}

function completedMidweek() {
  return {
    id: "midweek_briefing_user_founder_001_20260726_20260728",
    cadence: "midweek",
    lifecycle: { generationStatus: "completed" },
    evidenceWindow: {
      id: "midweek:2026-07-26:2026-07-28:America/Los_Angeles",
      startDate: "2026-07-26",
      endDate: "2026-07-28",
    },
    briefing: { version: "midweek_briefing_v1" },
  };
}
