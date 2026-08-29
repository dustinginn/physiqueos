const STEP_ORDER = [
  "canonical_commit",
  "compatibility_writes",
  "scheduled_completion",
  "analysis",
  "training_performance_events",
  "goal_evaluation",
  "event_eligibility",
  "briefing",
  "home_refresh",
];

export function createPostConfirmationOrchestrator({ reviewService, handlers = {}, now = () => new Date() } = {}) {
  return {
    async run(context, { maxSteps = Number.POSITIVE_INFINITY, operationId = null } = {}) {
      const results = {};
      const retryableFailures = [];
      const skippedSteps = [];
      const executedSteps = [];
      const progress = { ...(context.commitProgress ?? {}) };
      for (const step of STEP_ORDER) {
        const prior = progress[step];
        if (prior?.status === "completed") {
          results[step] = prior.result;
          skippedSteps.push(step);
          continue;
        }
        if (executedSteps.length >= maxSteps) break;
        const started = {
          status: "started",
          attempts: (prior?.attempts ?? 0) + 1,
          startedAt: now().toISOString(),
        };
        try {
          await reviewService?.recordCommitProgress(
            context.reviewId,
            step,
            started,
            { operationId }
          );
          progress[step] = started;
          const result = handlers[step] ? await handlers[step]({ ...context, results }) : { status: "not_required" };
          results[step] = result;
          const completed = { ...started, status: "completed", completedAt: now().toISOString(), result };
          await reviewService?.recordCommitProgress(context.reviewId, step, completed, { operationId });
          progress[step] = completed;
          executedSteps.push(step);
        } catch (error) {
          const failure = { step, message: String(error?.message ?? error), retryable: true };
          retryableFailures.push(failure);
          await reviewService?.recordCommitProgress(context.reviewId, step, { ...started, status: "failed", failedAt: now().toISOString(), error: failure.message, retryable: true }, { operationId });
          throw Object.assign(new Error(`Post-confirmation step ${step} failed: ${failure.message}`), { results, retryableFailures });
        }
      }
      const complete = STEP_ORDER.every((step) => progress[step]?.status === "completed");
      return {
        canonicalCommitStatus: statusOf(results.canonical_commit),
        compatibilityWriteStatus: statusOf(results.compatibility_writes),
        scheduledCompletionStatus: statusOf(results.scheduled_completion),
        analysisStatus: statusOf(results.analysis),
        trainingPerformanceEventsResult: results.training_performance_events,
        eventEligibilityResult: results.event_eligibility,
        briefingResult: results.briefing,
        homeRefreshResult: results.home_refresh,
        retryableFailures,
        results,
        complete,
        executedSteps,
        skippedSteps,
      };
    },
  };
}

function statusOf(result) {
  return result?.status ?? "completed";
}

export { STEP_ORDER as POST_CONFIRMATION_STEP_ORDER };
