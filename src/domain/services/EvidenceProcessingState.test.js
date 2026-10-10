import { describe, expect, it } from "vitest";
import { projectEvidenceProcessingState } from "./EvidenceProcessingState.js";

describe("evidence processing state", () => {
  it.each([
    [{ status: "committing", commitClaim: { status: "available" } }, "queued"],
    [{ status: "committing", commitClaim: { status: "in_progress" } }, "processing"],
    [{ status: "committing", commitClaim: { status: "failed" } }, "retrying"],
    [{ status: "partially_committed" }, "failed"],
    [{ status: "confirmed" }, "ready"],
  ])("projects a durable %s review as %s", (review, expected) => {
    expect(projectEvidenceProcessingState(review).state).toBe(expected);
  });

  it("reports durable step progress without claiming no action is required", () => {
    const result = projectEvidenceProcessingState({
      status: "committing",
      commitClaim: { status: "in_progress" },
      commitProgress: { canonical_commit: { status: "completed" } },
    });
    expect(result).toMatchObject({ completedSteps: 1, totalSteps: 9, canonicalStateDurable: true });
    expect(result.message).not.toMatch(/no action required/i);
  });
});
