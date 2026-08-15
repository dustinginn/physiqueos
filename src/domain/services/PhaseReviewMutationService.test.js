import { describe, expect, it } from "vitest";
import { createCanonicalPhaseReviewParticipants } from "./PhaseReviewCommitParticipants";
import { createPhaseReviewMutationService } from "./PhaseReviewMutationService";

describe("Phase Review mutation compatibility boundary", () => {
  it("delegates exclusively to the canonical commit coordinator", () => {
    const service = createPhaseReviewMutationService({
      runtimeStorePath: "isolated.json",
      liveStore: {},
      readPersistedStore: () => ({}),
      createUnitOfWork: () => ({}),
      participants: createCanonicalPhaseReviewParticipants(),
    });
    expect(service.version).toBe("phase_review_commit_coordinator_v1");
    expect(service.participantNames).toHaveLength(9);
  });

  it("rejects the legacy opaque callback participant path", () => {
    expect(() => createPhaseReviewMutationService({
      runtimeStorePath: "isolated.json",
      liveStore: {},
      readPersistedStore: () => ({}),
      createUnitOfWork: () => ({}),
      participants: { beginNextPhase() {} },
    })).toThrow(/Legacy opaque Phase Review participants/);
  });
});
