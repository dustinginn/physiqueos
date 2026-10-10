const MIB = 1024 * 1024;
const DEFAULT_SERVICE_LIMIT_BYTES = 1024 * MIB;
const DEFAULT_TARGET_FRACTION = 0.70;
const DEFAULT_HARD_FRACTION = 0.85;
const DEFAULT_WAIT_MS = 60_000;

const sharedState = {
  tail: Promise.resolve(),
  active: 0,
};

export function createEvidenceProcessingMemoryBudget({
  serviceLimitBytes = readPositiveNumber(
    process.env.PHYSIQUEOS_SERVICE_MEMORY_LIMIT_BYTES,
    DEFAULT_SERVICE_LIMIT_BYTES,
  ),
  targetFraction = DEFAULT_TARGET_FRACTION,
  hardFraction = DEFAULT_HARD_FRACTION,
  maximumWaitMs = DEFAULT_WAIT_MS,
  sampleMemory = () => process.memoryUsage(),
  now = () => performance.now(),
  setTimer = setInterval,
  clearTimer = clearInterval,
  state = sharedState,
  onMeasurement = null,
} = {}) {
  assertFraction(targetFraction, "targetFraction");
  assertFraction(hardFraction, "hardFraction");
  if (targetFraction > hardFraction) {
    throw new Error("Evidence processing target memory must not exceed its hard ceiling.");
  }

  return Object.freeze({
    async run({ operation, estimatedWorkingSetBytes = 0 } = {}, task) {
      if (typeof task !== "function") {
        throw new Error("Evidence processing memory admission requires a task.");
      }
      const operationName = safeOperation(operation);
      const enqueuedAt = now();
      const predecessor = state.tail.catch(() => undefined);
      let release;
      state.tail = new Promise((resolve) => { release = resolve; });
      try {
        await waitWithTimeout(predecessor, maximumWaitMs, operationName);
      } catch (error) {
        predecessor.finally(release);
        throw error;
      }
      const admittedAt = now();
      state.active += 1;
      let timer = null;
      let peakRssBytes = 0;
      let peakHeapUsedBytes = 0;
      try {
        const before = safeMemory(sampleMemory);
        peakRssBytes = before.rss;
        peakHeapUsedBytes = before.heapUsed;
        const projectedBytes = before.rss + Math.max(0, Number(estimatedWorkingSetBytes) || 0);
        if (projectedBytes > serviceLimitBytes * targetFraction || before.rss > serviceLimitBytes * hardFraction) {
          throw memoryDeferred({
            operation: operationName,
            currentRssBytes: before.rss,
            estimatedWorkingSetBytes,
            projectedBytes,
            serviceLimitBytes,
            targetFraction,
            hardFraction,
          });
        }
        timer = setTimer(() => {
          const memory = safeMemory(sampleMemory);
          peakRssBytes = Math.max(peakRssBytes, memory.rss);
          peakHeapUsedBytes = Math.max(peakHeapUsedBytes, memory.heapUsed);
        }, 10);
        timer?.unref?.();
        const value = await task();
        const after = safeMemory(sampleMemory);
        peakRssBytes = Math.max(peakRssBytes, after.rss);
        peakHeapUsedBytes = Math.max(peakHeapUsedBytes, after.heapUsed);
        const measurement = Object.freeze({
          operation: operationName,
          queueWaitMs: Math.max(0, Math.round(admittedAt - enqueuedAt)),
          elapsedMs: Math.max(0, Math.round(now() - admittedAt)),
          serviceLimitBytes,
          rssBeforeBytes: before.rss,
          rssAfterBytes: after.rss,
          peakRssBytes,
          peakRssFraction: fraction(peakRssBytes, serviceLimitBytes),
          heapUsedBeforeBytes: before.heapUsed,
          heapUsedAfterBytes: after.heapUsed,
          peakHeapUsedBytes,
          targetFraction,
          hardFraction,
          serialized: true,
        });
        safelyObserve(onMeasurement, measurement);
        return Object.freeze({ value, measurement });
      } finally {
        if (timer) clearTimer(timer);
        state.active -= 1;
        release();
      }
    },
    snapshot() {
      return Object.freeze({
        active: state.active,
        serviceLimitBytes,
        targetFraction,
        hardFraction,
      });
    },
  });
}

export function resetSharedEvidenceProcessingMemoryBudgetForTests() {
  sharedState.tail = Promise.resolve();
  sharedState.active = 0;
}

function memoryDeferred(values) {
  const error = new Error("Evidence processing was deferred until safe memory headroom is available.");
  error.code = "EVIDENCE_PROCESSING_MEMORY_BUDGET_DEFERRED";
  error.retryable = true;
  error.diagnostics = Object.freeze({ ...values });
  return error;
}

function waitWithTimeout(promise, maximumWaitMs, operation) {
  if (!Number.isFinite(maximumWaitMs) || maximumWaitMs <= 0) return promise;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        const error = new Error("Evidence processing waited too long for the memory admission gate.");
        error.code = "EVIDENCE_PROCESSING_MEMORY_BUDGET_BUSY";
        error.retryable = true;
        error.operation = operation;
        reject(error);
      }, maximumWaitMs);
      timer.unref?.();
      promise.finally(() => clearTimeout(timer));
    }),
  ]);
}

function safeMemory(sampleMemory) {
  const value = sampleMemory?.() ?? {};
  return Object.freeze({
    rss: Math.max(0, Number(value.rss) || 0),
    heapUsed: Math.max(0, Number(value.heapUsed) || 0),
  });
}

function safelyObserve(observer, measurement) {
  if (typeof observer !== "function") return;
  try { observer(measurement); } catch { /* Diagnostics never change processing. */ }
}

function safeOperation(value) {
  const candidate = String(value ?? "evidence-processing").trim();
  return /^[a-z0-9._:-]{1,100}$/i.test(candidate) ? candidate : "evidence-processing";
}

function fraction(value, total) {
  return total > 0 ? Number((value / total).toFixed(4)) : null;
}

function readPositiveNumber(value, fallback) {
  const candidate = Number(value);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : fallback;
}

function assertFraction(value, field) {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`${field} must be a fraction in (0, 1].`);
  }
}
