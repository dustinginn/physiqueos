export async function runWorkerLoop({ worker, pollIntervalMs = 1_000, signal, wait = waitFor }) {
  if (!worker?.runOnce) throw new Error("A durable worker is required.");
  while (!signal?.aborted && !worker.isStopping()) {
    const result = await worker.runOnce();
    if (result.outcome === "idle") await wait(pollIntervalMs, signal);
  }
  await worker.markStopping();
}

function waitFor(milliseconds, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}
