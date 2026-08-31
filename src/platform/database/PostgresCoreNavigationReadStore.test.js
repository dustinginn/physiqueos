import { describe, expect, it, vi } from "vitest";
import { createPostgresCoreNavigationReadStore } from "./PostgresCoreNavigationReadStore.js";

describe("PostgreSQL core navigation read store", () => {
  it("loads a screen's collections in one bounded query with zero compatibility loads", async () => {
    const query = vi.fn(async () => ({
      rows: [
        { collection_name: "goals", source_ordinal: 0, record_id: "goal-1", payload: { id: "goal-1" } },
        { collection_name: "user", source_ordinal: 0, record_id: "owner-one", payload: { id: "owner-one" } },
      ],
    }));
    const complete = vi.fn();
    const store = createPostgresCoreNavigationReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "owner-one",
      onComplete: complete,
    });

    const result = await store.run("core.navigation.goals", ({ readCollections }) =>
      readCollections(["user", "goals", "analyses"]));

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("UNION ALL");
    expect(query.mock.calls[0][0]).toContain("ORDER BY collection_name,source_ordinal,record_id");
    expect(query.mock.calls[0][0]).toContain("jsonb_strip_nulls");
    expect(query.mock.calls[0][0]).toContain("='training'");
    expect(query.mock.calls[0][1][0]).toBe("owner-one");
    expect(query.mock.calls[0][1].flat()).toEqual(expect.arrayContaining([
      "owner-one", "user", "goals", "analyses",
    ]));
    expect(result).toEqual({
      user: [{ id: "owner-one" }],
      goals: [{ id: "goal-1" }],
      analyses: [],
    });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      readModel: "core.navigation.goals",
      queryCount: 1,
      rowCount: 2,
      compatibilityRuntimeLoadCount: 0,
      pool: { totalCount: 1, idleCount: 1, waitingCount: 0 },
    }));
  });

  it.each([
    ["core.navigation.home", ["user", "dailyBriefings", "analyses", "canonicalEvidenceObjects"]],
    ["core.navigation.log", ["user", "evidenceReviews", "canonicalEvidenceObjects"]],
    ["core.navigation.goals", ["user", "goals", "dailyBriefings", "analyses"]],
    ["core.navigation.operating-plan", ["user", "goals", "canonicalEvidenceObjects"]],
    ["core.navigation.training-logger", ["user", "goals", "canonicalEvidenceObjects"]],
    ["core.navigation.morning-check-in", ["user", "weightEntries", "reminders", "dailyCheckIns"]],
    ["core.navigation.profile", ["user", "goals", "protocols", "reminders"]],
    ["core.navigation.tracking", ["user", "executionItems", "protocols", "reminders"]],
  ])("keeps %s to one provider query", async (readModel, collections) => {
    const query = vi.fn(async () => ({ rows: [] }));
    const complete = vi.fn();
    const store = createPostgresCoreNavigationReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "owner-one",
      onComplete: complete,
    });

    await store.run(readModel, ({ readCollections }) => readCollections(collections));

    expect(query).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      readModel,
      queryCount: 1,
      compatibilityRuntimeLoadCount: 0,
    }));
  });

  it("rejects unknown collections before querying", async () => {
    const query = vi.fn();
    const store = createPostgresCoreNavigationReadStore({
      pool: { query },
      ownerUserId: "owner-one",
    });
    await expect(store.run("invalid", ({ readCollections }) =>
      readCollections(["not-a-canonical-collection"])))
      .rejects.toThrow("Unsupported core navigation collection");
    expect(query).not.toHaveBeenCalled();
  });
});
