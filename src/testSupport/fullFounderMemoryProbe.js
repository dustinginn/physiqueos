import { PerformanceObserver, performance } from "node:perf_hooks";
import v8 from "node:v8";

const MAX_CHECKPOINTS = 48;

export function createFullFounderMemoryProbe({
  label,
  logicalStoreBytes,
  maxHeapUsedBytes,
  maxRssBytes,
} = {}) {
  if (!label || !Number.isSafeInteger(logicalStoreBytes) || logicalStoreBytes <= 0) {
    throw new TypeError("A memory-probe label and positive logical-store size are required.");
  }
  const startedAt = performance.now();
  const checkpoints = [];
  const gc = { count: 0, durationMs: 0, maxPauseMs: 0, kinds: {} };
  let peak = memorySnapshot();
  let counts = Object.freeze({});
  const observer = new PerformanceObserver((list) => recordGc(list.getEntries()));
  observer.observe({ entryTypes: ["gc"] });

  function recordGc(entries) {
    for (const entry of entries) {
      gc.count += 1;
      gc.durationMs += entry.duration;
      gc.maxPauseMs = Math.max(gc.maxPauseMs, entry.duration);
      gc.kinds[entry.detail?.kind ?? entry.kind ?? "unknown"] =
        (gc.kinds[entry.detail?.kind ?? entry.kind ?? "unknown"] ?? 0) + 1;
    }
  }

  function checkpoint(stage, nextCounts = null) {
    const memory = memorySnapshot();
    peak = {
      heapUsed: Math.max(peak.heapUsed, memory.heapUsed),
      rss: Math.max(peak.rss, memory.rss),
      external: Math.max(peak.external, memory.external),
      arrayBuffers: Math.max(peak.arrayBuffers, memory.arrayBuffers),
    };
    if (nextCounts) counts = Object.freeze({ ...nextCounts });
    if (checkpoints.length < MAX_CHECKPOINTS) {
      checkpoints.push(Object.freeze({ stage, elapsedMs: round(performance.now() - startedAt),
        ...memory }));
    }
    return memory;
  }

  function finish(finalCounts = null) {
    checkpoint("finished", finalCounts);
    recordGc(observer.takeRecords());
    observer.disconnect();
    const start = checkpoints[0] ?? { ...peak };
    const report = Object.freeze({
      label,
      elapsedMs: round(performance.now() - startedAt),
      heapLimitBytes: v8.getHeapStatistics().heap_size_limit,
      logicalStoreBytes,
      startHeapUsedBytes: start.heapUsed,
      startRssBytes: start.rss,
      peakHeapUsedBytes: peak.heapUsed,
      peakRssBytes: peak.rss,
      heapGrowthBytes: peak.heapUsed - start.heapUsed,
      rssGrowthBytes: peak.rss - start.rss,
      gc: Object.freeze({ ...gc, durationMs: round(gc.durationMs),
        maxPauseMs: round(gc.maxPauseMs), kinds: Object.freeze({ ...gc.kinds }) }),
      counts,
      checkpoints: Object.freeze(checkpoints),
      budget: Object.freeze({ maxHeapUsedBytes, maxRssBytes }),
    });
    if (process.env.PHYSIQUEOS_MEMORY_DIAGNOSTICS === "1") {
      console.info(`FULL_FOUNDER_MEMORY=${JSON.stringify(report)}`);
    }
    if (Number.isFinite(maxHeapUsedBytes) && peak.heapUsed > maxHeapUsedBytes) {
      throw new Error(`${label} exceeded its heap budget: ${peak.heapUsed} > ${maxHeapUsedBytes}.`);
    }
    if (Number.isFinite(maxRssBytes) && peak.rss > maxRssBytes) {
      throw new Error(`${label} exceeded its RSS budget: ${peak.rss} > ${maxRssBytes}.`);
    }
    return report;
  }

  checkpoint("start");
  return Object.freeze({ checkpoint, finish });
}

function memorySnapshot() {
  const memory = process.memoryUsage();
  return Object.freeze({ heapUsed: memory.heapUsed, rss: memory.rss,
    external: memory.external, arrayBuffers: memory.arrayBuffers });
}

function round(value) { return Math.round(value * 100) / 100; }
