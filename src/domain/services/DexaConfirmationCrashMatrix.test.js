import { describe, expect, it, vi } from "vitest";
import { createPostConfirmationOrchestrator, POST_CONFIRMATION_STEP_ORDER } from "./PostConfirmationOrchestrator.js";

describe("DEXA confirmation durable crash matrix", () => {
  it.each(POST_CONFIRMATION_STEP_ORDER)("resumes idempotently after a process crash at %s", async (crashStep) => {
    let progress = {};
    const calls = Object.fromEntries(POST_CONFIRMATION_STEP_ORDER.map((step) => [step, 0]));
    let crashInjected = false;
    const reviewService = {
      recordCommitProgress: vi.fn(async (_reviewId, step, value) => {
        progress = { ...progress, [step]: structuredClone(value) };
      }),
    };
    const handlers = Object.fromEntries(POST_CONFIRMATION_STEP_ORDER.map((step) => [step, async () => {
      calls[step] += 1;
      if (step === crashStep && !crashInjected) {
        crashInjected = true;
        const error = new Error("synthetic process termination");
        error.code = "SYNTHETIC_PROCESS_CRASH";
        throw error;
      }
      return { status: "completed", durableKey: `dexa:${step}` };
    }]));
    const orchestrator = createPostConfirmationOrchestrator({ reviewService, handlers });

    await expect(orchestrator.run({ reviewId: "dexa-review", commitProgress: progress }, { operationId: "first" }))
      .rejects.toThrow(`Post-confirmation step ${crashStep} failed`);
    const resumed = await orchestrator.run({ reviewId: "dexa-review", commitProgress: progress }, { operationId: "second" });

    expect(resumed.complete).toBe(true);
    expect(POST_CONFIRMATION_STEP_ORDER.every((step) => progress[step]?.status === "completed")).toBe(true);
    for (const step of POST_CONFIRMATION_STEP_ORDER) {
      expect(calls[step]).toBe(step === crashStep ? 2 : 1);
    }
  });
});
