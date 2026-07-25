import { describe, expect, it, vi } from "vitest";
import { createYouProfileService, formatActiveGoalCount } from "./YouProfileService";

describe("YouProfileService active Goal count", () => {
  it.each([
    [[], 0, "0 active"],
    [[goal("one", "active")], 1, "1 active"],
    [[goal("one", "active"), goal("two", "active", true), goal("done", "completed")], 2, "2 active"],
  ])("reads canonical Goal records without mutation", async (goals, expectedCount, expectedLabel) => {
    const repositories = fixtureRepositories(goals);
    const before = structuredClone(goals);

    const profile = await createYouProfileService({ repositories }).getYouProfile();

    expect(profile.operatingStatus.goals).toBe(expectedCount);
    expect(formatActiveGoalCount(profile.operatingStatus.goals)).toBe(expectedLabel);
    expect(goals).toEqual(before);
    expect(repositories.goals.listGoals).toHaveBeenCalledTimes(1);
  });

  it("does not count legacy active supporting records as production active Goals", async () => {
    const profile = await createYouProfileService({
      repositories: fixtureRepositories([
        goal("primary", "active", true),
        goal("legacy-supporting", "active", false),
      ]),
    }).getYouProfile();

    expect(profile.operatingStatus.goals).toBe(1);
  });
});

function goal(id, status, primary = id === "one") {
  return { id, primary, status, userId: "founder" };
}

function fixtureRepositories(goals) {
  return {
    users: {
      getCurrentUser: vi.fn(async () => ({ id: "founder", preferences: {} })),
    },
    goals: {
      listGoals: vi.fn(async () => structuredClone(goals)),
    },
    protocols: {
      listProtocols: vi.fn(async () => []),
    },
    reminders: {
      listReminders: vi.fn(async () => []),
    },
    nutritionContext: {
      getNutritionContext: vi.fn(async () => null),
    },
    weights: {
      listWeightEntries: vi.fn(async () => []),
    },
    dexaScans: {
      listDEXAScans: vi.fn(async () => []),
    },
    progressPhotos: {
      listPhotos: vi.fn(async () => []),
    },
  };
}
