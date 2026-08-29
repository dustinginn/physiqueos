import { describe, expect, it, vi } from "vitest";
import { createPostgresTrainingNavigationReadStore } from "./PostgresTrainingNavigationReadStore.js";

describe("PostgreSQL Training navigation read store", () => {
  it("uses bounded owner-scoped queries and reports zero compatibility loads", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const complete = vi.fn();
    const store = createPostgresTrainingNavigationReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "owner-one",
      onComplete: complete,
    });
    await store.run("training.navigation.exercise", async () => {
      await store.getUser();
      await store.listGoals();
      await store.listCanonicalTrainingEvidenceByExercise("ez_bar_curl");
      await store.listTrainingPerformanceEventsByExercise("ez_bar_curl");
    });

    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls.every(([, values]) => values[0] === "owner-one")).toBe(true);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      readModel: "training.navigation.exercise",
      queryCount: 4,
      compatibilityRuntimeLoadCount: 0,
      pool: { totalCount: 1, idleCount: 1, waitingCount: 0 },
    }));
    expect(query.mock.calls.map(([sql]) => sql).join("\n")).not.toContain("loadCanonicalRuntime");
  });

  it("keeps Day and Session reads narrowly bounded", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = createPostgresTrainingNavigationReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "owner-one",
    });
    await store.run("day", async () => {
      await store.getUser();
      await store.listCanonicalTrainingEvidenceForDate("2026-08-26", "America/Los_Angeles");
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain("evidence_type");
    expect(query.mock.calls[1][0]).toContain("AT TIME ZONE");

    query.mockClear();
    await store.run("session", () => store.getCanonicalEvidenceObject("canonical-session"));
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("keeps the Training landing to three narrow reads and zero runtime loads", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const complete = vi.fn();
    const store = createPostgresTrainingNavigationReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "owner-one",
      onComplete: complete,
    });

    await store.run("training.landing", async () => {
      await Promise.all([
        store.getUser(),
        store.listGoals(),
        store.listCanonicalTrainingAndActivityEvidenceObjects(),
      ]);
    });

    expect(query).toHaveBeenCalledTimes(3);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      readModel: "training.landing",
      queryCount: 3,
      compatibilityRuntimeLoadCount: 0,
    }));
    expect(query.mock.calls.map(([sql]) => sql).join("\n"))
      .not.toContain("loadCanonicalRuntime");
  });
});
