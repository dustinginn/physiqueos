const DEFAULT_REVIEW_AGE_MS = 2 * 60_000;
const DEFAULT_QUEUE_AGE_MS = 2 * 60_000;
const DEFAULT_HEARTBEAT_AGE_MS = 90_000;
const DEFAULT_SERVICE_LIMIT_BYTES = 1024 * 1024 * 1024;

export function createEvidenceProcessingReliabilityMonitor({
  store,
  logger,
  workerId,
  buildId,
  now = () => new Date(),
  processStartedAt = new Date(),
  sampleMemory = () => process.memoryUsage(),
  sampleCpu = createCpuSampler(),
  reviewAgeThresholdMs = DEFAULT_REVIEW_AGE_MS,
  queueAgeThresholdMs = DEFAULT_QUEUE_AGE_MS,
  heartbeatAgeThresholdMs = DEFAULT_HEARTBEAT_AGE_MS,
  serviceLimitBytes = Number(process.env.PHYSIQUEOS_SERVICE_MEMORY_LIMIT_BYTES) || DEFAULT_SERVICE_LIMIT_BYTES,
  maximumAutoResumes = 2,
} = {}) {
  if (!store?.inspect || !store?.recover) throw new Error("Evidence processing reliability monitor requires a store.");
  return Object.freeze({
    async runOnce() {
      const observedAt = now();
      const [inspection, cpuPercent] = await Promise.all([
        store.inspect({ observedAt }),
        Promise.resolve(sampleCpu()),
      ]);
      const memory = sampleMemory();
      const stale = inspection.reviews.filter((review) => isStranded(review, observedAt, reviewAgeThresholdMs));
      const adoptionBoundary = resolveAdoptionBoundary({
        persistedBuildBoundary: inspection.adoptionBoundary,
        processStartedAt,
      });
      const adoptedStale = stale.filter((review) => isAdoptedForAutomaticRecovery(review, adoptionBoundary));
      const historicalStale = stale.filter((review) => !isAdoptedForAutomaticRecovery(review, adoptionBoundary));
      const queuedTooLong = inspection.reviews.filter(
        (review) => review.queueAgeMs != null && review.queueAgeMs > queueAgeThresholdMs
      );
      const deadCount = inspection.reviews.reduce((sum, review) => sum + review.deadContinuationCount, 0);
      const rssFraction = fraction(memory.rss, serviceLimitBytes);
      const metrics = Object.freeze({
        workerId,
        buildId,
        adoptionBoundary: adoptionBoundary.toISOString(),
        processStartedAt: processStartedAt.toISOString(),
        processUptimeSeconds: Math.max(0, Math.round((observedAt - processStartedAt) / 1000)),
        activeReviewCount: inspection.reviews.filter((review) => review.status === "committing").length,
        staleReviewCount: stale.length,
        adoptedStaleReviewCount: adoptedStale.length,
        historicalStaleReviewCount: historicalStale.length,
        queuedTooLongCount: queuedTooLong.length,
        deadContinuationCount: deadCount,
        maximumReviewAgeMs: maximum(inspection.reviews.map((review) => review.reviewAgeMs)),
        maximumQueueAgeMs: maximum(inspection.reviews.map((review) => review.queueAgeMs)),
        latestHeartbeatAgeMs: inspection.heartbeat?.ageMs ?? null,
        latestHeartbeatWorkerMatches: inspection.heartbeat?.workerId === workerId,
        rssBytes: Number(memory.rss ?? 0),
        rssFraction,
        cpuPercent: Number(cpuPercent ?? 0),
      });
      logger?.info?.("evidence.processing.reliability", metrics);
      const alerts = alertCodes({ metrics, inspection, reviewAgeThresholdMs, queueAgeThresholdMs, heartbeatAgeThresholdMs });
      if (alerts.length) logger?.error?.("evidence.processing.alert", { codes: alerts, ...metrics });

      let recovery = null;
      // Deployment adoption boundary: a newly installed watchdog may observe
      // abandoned work from an older runtime. Those reviews must remain
      // visible and alerting, but automatic recovery is authorized only for
      // work that transitioned at or after this build was first observed. The
      // current process start protects the first-heartbeat gap; the earliest
      // persisted heartbeat for the immutable build protects later restarts.
      // An operator can disposition older work explicitly without a deployment
      // silently replaying historical Goal/Event/Briefing effects.
      const candidate = adoptedStale[0];
      if (candidate) {
        try {
          const recovered = await store.recover(candidate.reviewId, { observedAt, maximumAutoResumes });
          recovery = Object.freeze({
            reviewId: candidate.reviewId,
            status: recovered?.status ?? null,
            claimStatus: recovered?.commitClaim?.status ?? null,
            autoResumeCount: Number(recovered?.processingReliability?.autoResumeCount ?? 0),
          });
          logger?.warn?.("evidence.processing.recovered", recovery);
        } catch (error) {
          if (error?.code !== "COMMIT_NOT_STRANDED") {
            logger?.error?.("evidence.processing.recovery_failed", {
              reviewId: candidate.reviewId,
              code: safeCode(error),
            });
          }
        }
      }
      return Object.freeze({ metrics, alerts: Object.freeze(alerts), recovery });
    },
  });
}

export async function runEvidenceProcessingReliabilityLoop({
  monitor,
  signal,
  pollIntervalMs = 30_000,
  wait = waitFor,
} = {}) {
  if (!monitor?.runOnce) throw new Error("Evidence processing reliability loop requires a monitor.");
  while (!signal?.aborted) {
    await monitor.runOnce();
    if (!signal?.aborted) await wait(pollIntervalMs, signal);
  }
}

export function isStranded(review, observedAt, thresholdMs = DEFAULT_REVIEW_AGE_MS) {
  if (review?.status !== "committing" || Number(review.reviewAgeMs ?? 0) <= thresholdMs) return false;
  if (review.claimStatus === "available") return review.liveContinuationCount === 0;
  if (review.claimStatus !== "in_progress") return false;
  const expiry = Date.parse(review.claimLeaseExpiresAt ?? "");
  return Number.isFinite(expiry) && expiry <= observedAt.getTime();
}

export function isAdoptedForAutomaticRecovery(review, adoptionBoundary) {
  const updatedAt = Date.parse(review?.updatedAt ?? "");
  const boundary = adoptionBoundary instanceof Date
    ? adoptionBoundary.getTime()
    : Date.parse(String(adoptionBoundary ?? ""));
  return Number.isFinite(updatedAt) && Number.isFinite(boundary) && updatedAt >= boundary;
}

export function resolveAdoptionBoundary({ persistedBuildBoundary, processStartedAt } = {}) {
  const processTime = processStartedAt instanceof Date
    ? processStartedAt.getTime()
    : Date.parse(String(processStartedAt ?? ""));
  const persistedTime = Date.parse(String(persistedBuildBoundary ?? ""));
  const candidates = [processTime, persistedTime].filter(Number.isFinite);
  // An invalid boundary must never make all historical work eligible.
  return new Date(candidates.length ? Math.min(...candidates) : 8_640_000_000_000_000);
}

function alertCodes({ metrics, inspection, reviewAgeThresholdMs, queueAgeThresholdMs, heartbeatAgeThresholdMs }) {
  const result = [];
  if (metrics.staleReviewCount > 0 || metrics.maximumReviewAgeMs > reviewAgeThresholdMs) result.push("EVIDENCE_REVIEW_STALE");
  if (metrics.queuedTooLongCount > 0 || metrics.maximumQueueAgeMs > queueAgeThresholdMs) result.push("EVIDENCE_QUEUE_STALE");
  if (metrics.deadContinuationCount > 0) result.push("EVIDENCE_CONTINUATION_DEAD");
  if (!inspection.heartbeat || inspection.heartbeat.ageMs > heartbeatAgeThresholdMs) result.push("EVIDENCE_WORKER_HEARTBEAT_STALE");
  if (metrics.rssFraction >= 0.85) result.push("EVIDENCE_PROCESS_RSS_CRITICAL");
  else if (metrics.rssFraction >= 0.70) result.push("EVIDENCE_PROCESS_RSS_HIGH");
  if (metrics.cpuPercent >= 85) result.push("EVIDENCE_PROCESS_CPU_HIGH");
  return result;
}

function createCpuSampler() {
  let priorUsage = process.cpuUsage();
  let priorAt = performance.now();
  return () => {
    const at = performance.now();
    const usage = process.cpuUsage(priorUsage);
    const elapsedMicros = Math.max(1, (at - priorAt) * 1000);
    priorUsage = process.cpuUsage();
    priorAt = at;
    return Number(Math.min(100, ((usage.user + usage.system) / elapsedMicros) * 100).toFixed(2));
  };
}

function maximum(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : null;
}

function fraction(value, total) {
  return total > 0 ? Number((Number(value ?? 0) / total).toFixed(4)) : null;
}

function safeCode(error) {
  const candidate = String(error?.code ?? "EVIDENCE_PROCESSING_RECOVERY_FAILED").toUpperCase();
  return /^[A-Z0-9_]{3,80}$/.test(candidate) ? candidate : "EVIDENCE_PROCESSING_RECOVERY_FAILED";
}

function waitFor(milliseconds, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}
