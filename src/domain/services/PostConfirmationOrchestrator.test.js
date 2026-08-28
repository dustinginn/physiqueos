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

  it("exposes newly created versus idempotently matched Training events in the confirmation result", async () => {
    const newlyCreatedEvents = [{ id: "event-new" }];
    const existingEvents = [{ id: "event-existing" }];
    const handlers = Object.fromEntries(
      POST_CONFIRMATION_STEP_ORDER.map((step) => [
        step,
        vi.fn(async () =>
          step === "training_performance_events"
            ? {
                status: "completed",
                outcome: "mixed",
                newlyCreatedEvents,
                existingEvents,
              }
            : { status: "completed" }
        ),
      ])
    );
    const result = await createPostConfirmationOrchestrator({
      handlers,
      reviewService: { recordCommitProgress: vi.fn() },
    }).run({ reviewId: "review_1", commitProgress: {} });
    expect(result.trainingPerformanceEventsResult).toEqual({
      status: "completed",
      outcome: "mixed",
      newlyCreatedEvents,
      existingEvents,
    });
  });

  it("resumes the incident after five durable steps without invoking them again", async () => {
    const progress = Object.fromEntries(
      POST_CONFIRMATION_STEP_ORDER.slice(0, 5).map((step) => [
        step,
        { status: "completed", attempts: 1, result: { status: "completed", step } },
      ])
    );
    const handlers = Object.fromEntries(
      POST_CONFIRMATION_STEP_ORDER.map((step) => [
        step,
        vi.fn(async () => ({ status: "completed", step })),
      ])
    );
    const reviewService = {
      recordCommitProgress: vi.fn(async (_id, step, value, options) => {
        progress[step] = value;
        expect(options).toEqual({ operationId: "recovery-operation" });
      }),
    };
    const orchestrator = createPostConfirmationOrchestrator({ handlers, reviewService });

    for (let request = 0; request < 4; request += 1) {
      const result = await orchestrator.run(
        { reviewId: "incident-review", commitProgress: structuredClone(progress) },
        { maxSteps: 1, operationId: "recovery-operation" }
      );
      expect(result.executedSteps).toHaveLength(1);
    }

    for (const step of POST_CONFIRMATION_STEP_ORDER.slice(0, 5)) {
      expect(handlers[step]).not.toHaveBeenCalled();
    }
    for (const step of POST_CONFIRMATION_STEP_ORDER.slice(5)) {
      expect(handlers[step]).toHaveBeenCalledOnce();
    }
    expect(POST_CONFIRMATION_STEP_ORDER.every((step) => progress[step]?.status === "completed"))
      .toBe(true);
  });

  it.each(POST_CONFIRMATION_STEP_ORDER.slice(0, -1).map((_step, index) => index + 1))(
    "continues after a process restart following %i durable steps",
    async (completedCount) => {
      const progress = Object.fromEntries(
        POST_CONFIRMATION_STEP_ORDER.slice(0, completedCount).map((step) => [
          step,
          { status: "completed", result: { status: "completed" } },
        ])
      );
      const handlers = Object.fromEntries(
        POST_CONFIRMATION_STEP_ORDER.map((step) => [step, vi.fn(async () => ({ status: "completed" }))])
      );
      await createPostConfirmationOrchestrator({
        handlers,
        reviewService: { recordCommitProgress: vi.fn() },
      }).run(
        { reviewId: "restart-review", commitProgress: progress },
        { maxSteps: 1, operationId: "restart-operation" }
      );
      POST_CONFIRMATION_STEP_ORDER.slice(0, completedCount)
        .forEach((step) => expect(handlers[step]).not.toHaveBeenCalled());
      expect(handlers[POST_CONFIRMATION_STEP_ORDER[completedCount]]).toHaveBeenCalledOnce();
    }
  );
});
