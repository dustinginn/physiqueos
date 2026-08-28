import { describe, expect, it } from "vitest";
import { createPhase5SyntheticRuntime, PHASE5_SYNTHETIC_OWNER_ID } from "../../platform/migration/phase5SyntheticPackage.js";
import {
  createPostgresFounderReadScope,
  createPostgresFounderRepositoryFacade,
} from "../../platform/database/PostgresFounderRepositoryFacade";
import { createEvidenceConfirmationReadService } from "./EvidenceConfirmationReadService";

function harness() {
  let source = createPhase5SyntheticRuntime();
  let loads = 0;
  const diagnostics = [];
  const scope = createPostgresFounderReadScope({
    loadRuntime: async () => {
      loads += 1;
      return structuredClone(source);
    },
    onComplete: (event) => diagnostics.push(event),
  });
  const repositories = createPostgresFounderRepositoryFacade({
    pool: { query: async () => ({ rows: [] }), connect: async () => ({ release() {} }) },
    ownerUserId: PHASE5_SYNTHETIC_OWNER_ID,
    compatibilityMode: true,
    readRepositories: () => scope.readRepositories(),
    runInReadScope: (callback, metadata) => scope.run(callback, metadata),
  });
  return {
    diagnostics,
    repositories,
    get loads() { return loads; },
    mutateSource(callback) { source = callback(structuredClone(source)); },
  };
}

describe("EvidenceConfirmationReadService", () => {
  it("shares one runtime across the six concurrent Goal Evaluation reads", async () => {
    const fixture = harness();
    const service = createEvidenceConfirmationReadService({ repositories: fixture.repositories });

    const inputs = await service.readGoalEvaluationInputs(PHASE5_SYNTHETIC_OWNER_ID);

    expect(inputs).toEqual(expect.objectContaining({
      goals: expect.any(Array),
      dexaScans: expect.any(Array),
      weightEntries: expect.any(Array),
      progressPhotos: expect.any(Array),
      protocols: expect.any(Array),
    }));
    expect(fixture.loads).toBe(1);
    expect(fixture.diagnostics).toEqual([expect.objectContaining({
      readModel: "action.evidence-review-goal-evaluation",
      runtimeLoadCount: 1,
    })]);
  });

  it("uses a fresh bounded scope for the later briefing read and observes intervening state", async () => {
    const fixture = harness();
    const service = createEvidenceConfirmationReadService({ repositories: fixture.repositories });
    await service.readGoalEvaluationInputs(PHASE5_SYNTHETIC_OWNER_ID);
    fixture.mutateSource((runtime) => {
      runtime.goals.push({ id: "goal-after-confirmation-step", userId: PHASE5_SYNTHETIC_OWNER_ID, status: "active" });
      return runtime;
    });

    const refreshedInputs = await service.readGoalEvaluationInputs(PHASE5_SYNTHETIC_OWNER_ID);
    const preferences = await service.readEventBriefingPreferences(PHASE5_SYNTHETIC_OWNER_ID);

    expect(refreshedInputs.goals.map((goal) => goal.id)).toContain("goal-after-confirmation-step");
    expect(fixture.loads).toBe(3);
    expect(fixture.diagnostics.at(-1)).toEqual(expect.objectContaining({
      readModel: "action.evidence-review-event-briefing-preferences",
      runtimeLoadCount: 1,
    }));
    expect(preferences).toEqual(expect.objectContaining({ photo: expect.any(Boolean), dexa: expect.any(Boolean) }));
  });
});
