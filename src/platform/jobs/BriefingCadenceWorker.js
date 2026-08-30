export const DEFAULT_BRIEFING_CADENCE_POLL_INTERVAL_MS = 5 * 60_000;

export async function runBriefingCadenceLoop({
  execute,
  signal,
  pollIntervalMs = DEFAULT_BRIEFING_CADENCE_POLL_INTERVAL_MS,
  wait = waitFor,
  logger = null,
} = {}) {
  if (typeof execute !== "function") {
    throw new Error("Briefing cadence loop requires an executor.");
  }
  while (!signal?.aborted) {
    try {
      const result = await execute({ asOf: new Date() });
      logger?.info?.("briefing.cadence.tick", summarize(result));
    } catch (error) {
      logger?.error?.("briefing.cadence.tick_failed", {
        code: error?.code ?? "BRIEFING_CADENCE_TICK_FAILED",
      });
    }
    if (!signal?.aborted) await wait(pollIntervalMs, signal);
  }
}

function summarize(result) {
  return {
    runId: result?.runId ?? null,
    lockAcquired: result?.lockAcquired === true,
    outcomes: (result?.outcomes ?? []).map((outcome) => ({
      cadenceKey: outcome.cadenceKey,
      resultStatus: outcome.resultStatus,
      expectedArtifactId: outcome.expectedArtifactId ?? null,
    })),
  };
}

function waitFor(milliseconds, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
