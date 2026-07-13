import { describe, expect, it, vi } from "vitest";
import { createPostConfirmationOrchestrator, POST_CONFIRMATION_STEP_ORDER } from "./PostConfirmationOrchestrator";

describe("PostConfirmationOrchestrator", () => {
  it("runs downstream effects in one deterministic order", async () => {
    const calls = [];
    const handlers = Object.fromEntries(POST_CONFIRMATION_STEP_ORDER.map((step) => [step, vi.fn(async () => { calls.push(step); return { status: "completed" }; })]));
    const reviewService = { recordCommitProgress: vi.fn() };
    const result = await createPostConfirmationOrchestrator({ handlers, reviewService }).run({ reviewId: "review_1", commitProgress: {} });
    expect(calls).toEqual(POST_CONFIRMATION_STEP_ORDER);
    expect(result.retryableFailures).toEqual([]);
    expect(reviewService.recordCommitProgress).toHaveBeenCalledTimes(POST_CONFIRMATION_STEP_ORDER.length);
  });

  it("stops on failure and resumes without repeating completed steps", async () => {
    const canonical = vi.fn(async () => ({ status: "completed" }));
    const compatibility = vi.fn(async () => { throw new Error("temporary"); });
    const reviewService = { recordCommitProgress: vi.fn() };
    const orchestrator = createPostConfirmationOrchestrator({ handlers: { canonical_commit: canonical, compatibility_writes: compatibility }, reviewService });
    await expect(orchestrator.run({ reviewId: "review_1", commitProgress: {} })).rejects.toThrow("compatibility_writes");
    expect(canonical).toHaveBeenCalledOnce();
    const retryHandlers = Object.fromEntries(POST_CONFIRMATION_STEP_ORDER.map((step) => [step, vi.fn(async () => ({ status: "completed" }))]));
    await createPostConfirmationOrchestrator({ handlers: retryHandlers, reviewService }).run({ reviewId: "review_1", commitProgress: { canonical_commit: { status: "completed", result: { status: "completed" } } } });
    expect(retryHandlers.canonical_commit).not.toHaveBeenCalled();
    expect(retryHandlers.compatibility_writes).toHaveBeenCalledOnce();
  });
});
