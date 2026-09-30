import { performance } from "node:perf_hooks";

const seed = 20260930;
const now = "2026-09-30";
const filler = (length, token) => Array.from({ length }, (_, index) => `${token}-${index % 17}`).join(" ");

const analyses = Array.from({ length: 414 }, (_, index) => ({
  id: `analysis-${index}`,
  createdAt: `2026-09-${String((index % 30) + 1).padStart(2, "0")}T12:00:00.000Z`,
  evidenceTypes: ["progress_photo"],
  metadata: {
    structuredObservations: Array.from({ length: 8 }, (_, observation) => ({
      type: "regional_review",
      region: ["Midsection", "Upper body", "Back", "Overall physique"][observation % 4],
      confidence: observation % 3 === 0 ? "high" : "moderate",
      supportsGoal: true,
      change: filler(28, `sanitized-change-${index}-${observation}`),
      limitations: [filler(6, "sanitized-limitation")],
      sourceTrace: filler(12, "sanitized-source"),
    })),
    providerTrace: filler(20, "sanitized-provider"),
  },
}));

const canonicalEvidence = Array.from({ length: 780 }, (_, index) => ({
  id: `evidence-${index}`,
  occurrenceDate: index < 8 ? now : `2026-08-${String((index % 28) + 1).padStart(2, "0")}`,
  evidenceType: index % 3 === 0 ? "training" : "activity_day",
  payload: filler(90, `sanitized-evidence-${index}`),
}));
const reviews = Array.from({ length: 84 }, (_, index) => ({
  id: `review-${index}`,
  status: index < 4 ? ["pending", "committing", "commit_failed", "partially_committed"][index] : "committed",
  payload: filler(100, `sanitized-review-${index}`),
}));
const fixedNavigationRows = Array.from({ length: 715 }, (_, index) => ({
  id: `navigation-${index}`,
  payload: filler(35, `sanitized-navigation-${index}`),
}));
const fixedGoalRows = fixedNavigationRows.slice(0, 559);
const evidenceStreamIds = ["training", "nutrition", "weight", "photos", "dexa", "activity", "energy"];
const evidenceHubSources = evidenceStreamIds.map((stream, streamIndex) => ({
  stream,
  summary: { metric: `${stream}-metric`, trend: `${stream}-trend`, lastUpdated: now },
  history: Array.from({ length: 36 + streamIndex * 9 }, (_, index) => ({
    id: `${stream}-${index}`,
    date: `2026-09-${String((index % 30) + 1).padStart(2, "0")}`,
    detail: filler(18, `sanitized-${stream}-detail`),
  })),
}));
const evidenceHubCards = evidenceHubSources.map(({ stream, summary }) => ({
  id: stream,
  title: stream,
  metric: summary.metric,
  trend: summary.trend,
  lastUpdated: summary.lastUpdated,
  state: "available",
  status: "available",
}));

const compactAnalysis = (analysis) => ({
  id: analysis.id,
  createdAt: analysis.createdAt,
  evidenceTypes: analysis.evidenceTypes,
  metadata: {
    structuredObservations: analysis.metadata.structuredObservations.map(({ type, region, confidence, supportsGoal }) => ({
      type, region, confidence, supportsGoal,
    })),
  },
});

const scenarios = {
  home: {
    before: () => [...fixedNavigationRows, ...analyses],
    after: () => [...fixedNavigationRows, ...analyses.map(compactAnalysis)],
  },
  goals: {
    before: () => [...fixedGoalRows, ...analyses],
    after: () => [...fixedGoalRows, ...analyses.map(compactAnalysis)],
  },
  log: {
    before: () => [...reviews, ...canonicalEvidence],
    after: () => [
      ...reviews.filter(({ status }) => ["pending", "committing", "commit_failed", "partially_committed"].includes(status)),
      ...canonicalEvidence.filter(({ occurrenceDate }) => occurrenceDate === now),
    ],
  },
};

const surfaces = Object.fromEntries(Object.entries(scenarios).map(([name, scenario]) => {
  const before = measure(scenario.before);
  const after = measure(scenario.after);
  return [name, {
    before,
    after,
    rowReductionPercent: percent(before.rows - after.rows, before.rows),
    byteReductionPercent: percent(before.bytes - after.bytes, before.bytes),
  }];
}));

const baselineWorker = workerOperations({ durationMs: 60 * 60 * 1_000, schedule: [1_000], heartbeatMs: 1_000 });
const candidateWorker = workerOperations({ durationMs: 60 * 60 * 1_000, schedule: [1_000, 2_000, 4_000, 8_000, 15_000, 30_000], heartbeatMs: 30_000 });
const activeUserShape = Object.fromEntries([1, 2, 10].map((users) => [users, modelUsers(users, surfaces)]));
const evidenceHubBeforeResponse = evidenceHubSources.map((source) => ({ resource: source.stream, data: source }));
const evidenceHubAfterResponse = { resource: "evidence-hub", data: { streams: evidenceHubCards } };
const evidenceHubSourceBytes = Buffer.byteLength(JSON.stringify(evidenceHubSources));
const evidenceHubBefore = measureSerialization(() => evidenceHubBeforeResponse);
const evidenceHubAfter = measureSerialization(() => evidenceHubAfterResponse);

process.stdout.write(`${JSON.stringify({
  benchmark: "performance-phase1-production-shape-v1",
  seed,
  fixture: {
    analyses: analyses.length,
    analysisObservations: analyses.length * 8,
    fixedNavigationRows: fixedNavigationRows.length,
    logCanonicalEvidence: canonicalEvidence.length,
    logReviews: reviews.length,
    todayCanonicalEvidence: canonicalEvidence.filter(({ occurrenceDate }) => occurrenceDate === now).length,
    actionableReviews: reviews.filter(({ status }) => status !== "committed").length,
  },
  worker: {
    beforePerHour: baselineWorker,
    afterPerHour: candidateWorker,
    dbOperationReductionPercent: percent(totalWorkerOps(baselineWorker) - totalWorkerOps(candidateWorker), totalWorkerOps(baselineWorker)),
    beforePerDay: scale(baselineWorker, 24),
    afterPerDay: scale(candidateWorker, 24),
  },
  surfaces,
  evidenceHub: {
    before: { httpRequests: 7, sourceQueries: 7, sourceMaterializedBytes: evidenceHubSourceBytes, responseBytes: evidenceHubBefore.bytes, medianLocalResponseMaterializationMs: evidenceHubBefore.medianMs },
    after: { httpRequests: 1, sourceQueries: 7, sourceMaterializedBytes: evidenceHubSourceBytes, responseBytes: evidenceHubAfter.bytes, medianLocalResponseMaterializationMs: evidenceHubAfter.medianMs },
    httpRequestReductionPercent: 85.71,
    responseByteReductionPercent: percent(evidenceHubBefore.bytes - evidenceHubAfter.bytes, evidenceHubBefore.bytes),
    optionalFailureMode: "whole-hub -> one-stream",
  },
  activeUserShape,
}, null, 2)}\n`);

function measure(factory) {
  const samples = [];
  let value;
  for (let index = 0; index < 60; index += 1) {
    const started = performance.now();
    value = factory();
    JSON.stringify(value);
    samples.push(performance.now() - started);
  }
  samples.sort((left, right) => left - right);
  return {
    rows: value.length,
    bytes: Buffer.byteLength(JSON.stringify(value)),
    medianMaterializationMs: Number(samples[Math.floor(samples.length / 2)].toFixed(3)),
  };
}

function measureSerialization(factory) {
  const samples = [];
  let value;
  for (let index = 0; index < 60; index += 1) {
    const started = performance.now();
    value = factory();
    JSON.stringify(value);
    samples.push(performance.now() - started);
  }
  samples.sort((left, right) => left - right);
  return {
    bytes: Buffer.byteLength(JSON.stringify(value)),
    medianMs: Number(samples[Math.floor(samples.length / 2)].toFixed(3)),
  };
}

function workerOperations({ durationMs, schedule, heartbeatMs }) {
  let elapsed = 0;
  let polls = 0;
  let index = 0;
  const pollTimes = [];
  while (elapsed < durationMs) {
    polls += 1;
    pollTimes.push(elapsed);
    elapsed += schedule[Math.min(index, schedule.length - 1)];
    index = Math.min(index + 1, schedule.length - 1);
  }
  const boundedEvents = (interval) => {
    let last = null;
    let count = 0;
    for (const time of pollTimes) {
      if (last === null || time - last >= interval) { count += 1; last = time; }
    }
    return count;
  };
  // Positive provider authority is deliberately re-read before every possible
  // claim; only a paused/negative state is cached for 15 seconds.
  return { claimQueries: polls, heartbeatWrites: boundedEvents(heartbeatMs), authorityReads: polls };
}

function totalWorkerOps(value) { return value.claimQueries + value.heartbeatWrites + value.authorityReads; }
function scale(value, factor) { return Object.fromEntries(Object.entries(value).map(([key, count]) => [key, count * factor])); }
function percent(value, total) { return Number((value / total * 100).toFixed(2)); }

function modelUsers(users, measured) {
  // Production-shaped busy hour per active user: Home 12, Log 6, Goals 2,
  // Evidence Hub 2. Evidence Hub still performs seven scoped server reads,
  // but only one HTTP request and isolates optional failures.
  const reads = { home: 12, log: 6, goals: 2, evidenceHub: 2 };
  const beforeBytesPerUser = reads.home * measured.home.before.bytes + reads.log * measured.log.before.bytes + reads.goals * measured.goals.before.bytes;
  const afterBytesPerUser = reads.home * measured.home.after.bytes + reads.log * measured.log.after.bytes + reads.goals * measured.goals.after.bytes;
  return {
    httpRequestsPerBusyHour: { before: users * (reads.home + reads.log + reads.goals + reads.evidenceHub * 7), after: users * (reads.home + reads.log + reads.goals + reads.evidenceHub) },
    navigationMaterializedBytesPerBusyHour: { before: users * beforeBytesPerUser, after: users * afterBytesPerUser },
    coreNavigationQueriesPerBusyHour: users * (reads.home + reads.log + reads.goals),
    evidenceHubScopedReadsPerBusyHour: users * reads.evidenceHub * 7,
  };
}
