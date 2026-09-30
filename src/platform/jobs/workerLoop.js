export const DEFAULT_IDLE_BACKOFF_MS = Object.freeze([1_000, 2_000, 4_000, 8_000, 15_000, 30_000]);

export async function runWorkerLoop({
  worker,
  idleBackoffMs = DEFAULT_IDLE_BACKOFF_MS,
  signal,
  wait = waitFor,
  onTelemetry = null,
}) {
  if (!worker?.runOnce) throw new Error("A durable worker is required.");
  const schedule = validateIdleBackoff(idleBackoffMs);
  let idleIndex = 0;
  let idlePollCount = 0;
  let reportedDelayMs = null;
  while (!signal?.aborted && !worker.isStopping()) {
    const result = await worker.runOnce();
    if (result.outcome === "idle") {
      const delayMs = schedule[Math.min(idleIndex, schedule.length - 1)];
      idlePollCount += 1;
      if (delayMs !== reportedDelayMs) {
        onTelemetry?.(Object.freeze({
          event: "worker.idle_backoff",
          delayMs,
          idlePollCount,
          capped: idleIndex >= schedule.length - 1,
        }));
        reportedDelayMs = delayMs;
      }
      await wait(delayMs, signal);
      idleIndex = Math.min(idleIndex + 1, schedule.length - 1);
    } else {
      if (idleIndex > 0) {
        onTelemetry?.(Object.freeze({ event: "worker.idle_reset", previousDelayMs: reportedDelayMs, idlePollCount }));
      }
      idleIndex = 0;
      idlePollCount = 0;
      reportedDelayMs = null;
    }
  }
  await worker.markStopping();
}

function validateIdleBackoff(schedule) {
  if (!Array.isArray(schedule) || schedule.length === 0 || schedule.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("Worker idle backoff must contain positive millisecond intervals.");
  }
  if (schedule.some((value, index) => index > 0 && value < schedule[index - 1])) {
    throw new Error("Worker idle backoff must be non-decreasing.");
  }
  return Object.freeze([...schedule]);
}

function waitFor(milliseconds, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    let timer = null;
    const finish = () => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    timer = setTimeout(finish, milliseconds);
    signal?.addEventListener("abort", finish, { once: true });
  });
}
