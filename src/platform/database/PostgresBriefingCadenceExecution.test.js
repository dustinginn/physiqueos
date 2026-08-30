import { describe, expect, it, vi } from "vitest";
import {
  BRIEFING_CADENCE_OPERATION_TYPE,
  createPostgresBriefingCadenceExecutionLock,
  createPostgresBriefingCadenceExecutionStore,
  occurrenceOperationId,
} from "./PostgresBriefingCadenceExecution";

describe("PostgreSQL briefing cadence execution ownership", () => {
  it("uses deterministic owner/cadence/artifact occurrence identity", () => {
    expect(occurrenceOperationId({
      ownerUserId: "founder",
      cadenceKey: "weekly",
      expectedArtifactId: "weekly_briefing_2026-08-23_2026-08-29",
    })).toBe(
      "briefing-cadence:founder:weekly:weekly_briefing_2026-08-23_2026-08-29"
    );
  });

  it("persists retry state and resets it after the exact occurrence succeeds", async () => {
    let row = null;
    const pool = memoryPool(() => row, (values) => {
      row = { status: values[3], result: values[4], problem: values[5] };
    });
    const store = createPostgresBriefingCadenceExecutionStore({
      pool,
      ownerUserId: "founder",
      now: () => new Date("2026-08-30T08:20:00.000Z"),
    });
    const base = occurrence({ resultStatus: "transient_failure" });
    await store.record(base);
    expect(await store.getRetryState(base)).toMatchObject({
      consecutiveTransientFailures: 1,
      lastFailureCategory: "generator_timeout",
    });
    await store.record(occurrence({ resultStatus: "generation_completed" }));
    expect(await store.getRetryState(base)).toEqual({
      terminalFailure: false,
      consecutiveTransientFailures: 0,
      lastFailureAt: null,
      lastFailureCategory: null,
    });
    expect(row.status).toBe("succeeded");
  });

  it("does not extend the retry window when the scheduler only observes cooldown", async () => {
    let current = new Date("2026-08-30T08:20:00.000Z");
    let row = null;
    const pool = memoryPool(() => row, (values) => {
      row = { status: values[3], result: values[4], problem: values[5] };
    });
    const store = createPostgresBriefingCadenceExecutionStore({
      pool,
      ownerUserId: "founder",
      now: () => current,
    });
    const failure = occurrence({ resultStatus: "transient_failure" });
    await store.record(failure);
    const original = await store.getRetryState(failure);

    current = new Date("2026-08-30T08:25:00.000Z");
    await store.record(occurrence({
      resultStatus: "transient_failure",
      skipReason: "retry_cooldown",
      failureCategory: "generator_timeout",
    }));

    expect(await store.getRetryState(failure)).toEqual(original);
  });

  it("holds a PostgreSQL advisory lock across the owned execution", async () => {
    const queries = [];
    const release = vi.fn();
    const client = {
      query: vi.fn(async (text) => {
        queries.push(text);
        return { rows: text.includes("pg_try") ? [{ acquired: true }] : [{}] };
      }),
      release,
    };
    const lock = await createPostgresBriefingCadenceExecutionLock({
      pool: { connect: async () => client },
      ownerUserId: "founder",
    }).acquire();
    expect(lock.acquired).toBe(true);
    await lock.release();
    expect(queries.some((text) => text.includes("pg_advisory_unlock"))).toBe(true);
    expect(release).toHaveBeenCalledOnce();
  });
});

function occurrence(overrides = {}) {
  return {
    cadenceKey: "weekly",
    expectedArtifactId: "weekly_briefing_2026-08-23_2026-08-29",
    evidenceWindowId: "weekly:2026-08-23:2026-08-29:America/Los_Angeles",
    eligibilityResult: "eligible",
    retryability: true,
    failureCategory: "generator_timeout",
    ...overrides,
  };
}

function memoryPool(read, write) {
  return {
    async query(text, values) {
      if (text.includes("SELECT result")) {
        const row = read();
        return { rows: row ? [{ result: row.result, problem: row.problem }] : [] };
      }
      if (text.includes("INSERT INTO physiqueos.operations")) {
        expect(values[2]).toBe(BRIEFING_CADENCE_OPERATION_TYPE);
        write(values);
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };
}
