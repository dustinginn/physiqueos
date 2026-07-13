const STEP_ORDER = [
  "canonical_commit",
  "compatibility_writes",
  "scheduled_completion",
  "analysis",
  "goal_evaluation",
  "event_eligibility",
  "briefing",
  "home_refresh",
];

export function createPostConfirmationOrchestrator({ reviewService, handlers = {}, now = () => new Date() } = {}) {
  return {
    async run(context) {
      const results = {};
      const retryableFailures = [];
      for (const step of STEP_ORDER) {
        const prior = context.commitProgress?.[step];
        if (prior?.status === "completed") {
          results[step] = prior.result;
          continue;
        }
        try {
          const result = handlers[step] ? await handlers[step]({ ...context, results }) : { status: "not_required" };
          results[step] = result;
          await reviewService?.recordCommitProgress(context.reviewId, step, { status: "completed", attempts: (prior?.attempts ?? 0) + 1, completedAt: now().toISOString(), result });
        } catch (error) {
          const failure = { step, message: String(error?.message ?? error), retryable: true };
          retryableFailures.push(failure);
          await reviewService?.recordCommitProgress(context.reviewId, step, { status: "failed", attempts: (prior?.attempts ?? 0) + 1, failedAt: now().toISOString(), error: failure.message, retryable: true });
          throw Object.assign(new Error(`Post-confirmation step ${step} failed: ${failure.message}`), { results, retryableFailures });
        }
      }
      return {
        canonicalCommitStatus: statusOf(results.canonical_commit),
        compatibilityWriteStatus: statusOf(results.compatibility_writes),
        scheduledCompletionStatus: statusOf(results.scheduled_completion),
        analysisStatus: statusOf(results.analysis),
        eventEligibilityResult: results.event_eligibility,
        briefingResult: results.briefing,
        homeRefreshResult: results.home_refresh,
        retryableFailures,
        results,
      };
    },
  };
}

function statusOf(result) {
  return result?.status ?? "completed";
}

export { STEP_ORDER as POST_CONFIRMATION_STEP_ORDER };
