import { describe, expect, it } from "vitest";
import { createGoalConfidenceRepository } from "./GoalConfidenceRepository";

describe("GoalConfidenceRepository", () => {
  it("provides read-only empty defaults and bounded history", () => {
    expect(createGoalConfidenceRepository().getCurrentSnapshot("g", "p")).toBeNull();
    const history = [{ id: "h1", goalId: "g", phaseId: "p" },
      { id: "h2", goalId: "g", phaseId: "p" }];
    const repository = createGoalConfidenceRepository({ history });
    expect(repository.listHistory("g", "p", { limit: 1 }))
      .toEqual([history[1]]);
  });

  it("stages mutations only for a unit-of-work-owned collection", () => {
    const collections = { snapshots: [], history: [], continuitySeeds: [] };
    const repository = createGoalConfidenceRepository(
      collections, { allowStagedMutations: true }
    );
    repository.stageAppendHistory({ id: "h", assessmentId: "a" });
    repository.stageReplaceSnapshot({ id: "s", goalId: "g", phaseId: "p" });
    repository.stageCreateContinuitySeed({ id: "c", goalId: "g", phaseId: "p" });
    expect(collections.history).toHaveLength(1);
    expect(collections.snapshots).toHaveLength(1);
    expect(collections.continuitySeeds).toHaveLength(1);
  });
});
