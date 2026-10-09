import { describe, expect, it } from "vitest";
import { createGuardedBoundedRuntime, isUnloadedCollectionError } from "./BoundedFounderRuntimeRead.js";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import { createFounderRuntimeSemanticDigest } from "../../domain/services/FounderRuntimeSemanticDigest.js";

const OWNER = "user_guarded_read";

function loaded() {
  // Shape of a bounded loadCanonicalRuntime result: every collection present,
  // unread ones defaulted to empty.
  return Object.freeze({
    revision: 7,
    updatedAt: "2026-10-09T00:00:00.000Z",
    dexaScans: [{ id: "scan_a", userId: OWNER, measuredAt: "2026-09-12" }],
    goals: [{ id: "goal_1", userId: OWNER, status: "active" }],
    evidenceReviews: [],
    analyses: [],
    user: null,
  });
}

function expectUnloaded(callback, collection) {
  let caught = null;
  try { callback(); } catch (error) { caught = error; }
  expect(isUnloadedCollectionError(caught)).toBe(true);
  expect(caught.collection).toBe(collection);
}

describe("guarded bounded Founder runtime", () => {
  it("keeps loaded collections and runtime metadata exactly as loaded", () => {
    const source = loaded();
    const runtime = createGuardedBoundedRuntime(source, ["dexaScans", "goals"]);
    expect(runtime.dexaScans).toBe(source.dexaScans);
    expect(runtime.goals).toBe(source.goals);
    expect(runtime.revision).toBe(7);
    expect(runtime.updatedAt).toBe("2026-10-09T00:00:00.000Z");
  });

  it("fails loudly on any use of a collection the bounded read did not load", () => {
    const runtime = createGuardedBoundedRuntime(loaded(), ["dexaScans"]);
    expectUnloaded(() => runtime.evidenceReviews.length, "evidenceReviews");
    expectUnloaded(() => runtime.analyses.filter(Boolean), "analyses");
    expectUnloaded(() => [...runtime.goals], "goals");
    expectUnloaded(() => { for (const item of runtime.goalConfidenceHistory) void item; }, "goalConfidenceHistory");
    expectUnloaded(() => runtime.user.timeZone, "user");
    expectUnloaded(() => { runtime.analyses.push({}); }, "analyses");
  });

  it("does not hide an unloaded collection behind a nullish default", () => {
    const runtime = createGuardedBoundedRuntime(loaded(), ["dexaScans"]);
    expectUnloaded(() => (runtime.evidenceReviews ?? []).length, "evidenceReviews");
  });

  it("enumerates only what was loaded, so whole-store digests and clones stay valid", () => {
    const runtime = createGuardedBoundedRuntime(loaded(), ["dexaScans", "goals"]);
    expect(Object.keys(runtime).sort()).toEqual(["dexaScans", "goals", "revision", "updatedAt"]);
    expect(() => createFounderRuntimeSemanticDigest(runtime)).not.toThrow();
    expect(structuredClone(runtime)).toEqual({ revision: 7, updatedAt: "2026-10-09T00:00:00.000Z", dexaScans: loaded().dexaScans, goals: loaded().goals });
  });

  it("lets repositories over loaded collections read, and refuses the rest at use", async () => {
    // Every seed repository except Daily Briefings only stores its collection
    // reference at construction; Daily Briefings reads its records eagerly, so
    // it can only be built when briefings were loaded.
    const withBriefings = createGuardedBoundedRuntime({ ...loaded(), dailyBriefings: [] }, ["dexaScans", "dailyBriefings"]);
    const repositories = createSeedRepositories(withBriefings);
    await expect(repositories.dexaScans.listAllDEXAScans(OWNER)).resolves.toHaveLength(1);
    await expect(repositories.goals.listGoals(OWNER)).rejects.toMatchObject({ code: "BOUNDED_READ_COLLECTION_NOT_LOADED" });
    await expect(repositories.evidenceReviews.listReviews()).rejects.toMatchObject({ code: "BOUNDED_READ_COLLECTION_NOT_LOADED" });
    expect(() => createSeedRepositories(createGuardedBoundedRuntime(loaded(), ["dexaScans"])))
      .toThrowError(expect.objectContaining({ code: "BOUNDED_READ_COLLECTION_NOT_LOADED", collection: "dailyBriefings" }));
  });

  it("is not mistaken for a thenable", async () => {
    const runtime = createGuardedBoundedRuntime(loaded(), ["dexaScans"]);
    const value = await Promise.resolve(runtime.analyses);
    expect(value).toBe(runtime.analyses);
  });

  it("rejects an unknown loaded collection name", () => {
    expect(() => createGuardedBoundedRuntime(loaded(), ["notACollection"]))
      .toThrowError(expect.objectContaining({ code: "BOUNDED_READ_COLLECTION_UNKNOWN" }));
  });
});
