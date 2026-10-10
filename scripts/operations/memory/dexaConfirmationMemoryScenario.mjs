// One memory scenario of the DEXA post-confirmation pipeline, run in its own
// process by dexaConfirmationMemoryHarness.mjs under a hard V8 heap limit.
// Each scenario reproduces what one handler step does in production, either on
// the pre-fix repository path ("legacy_*") or the bounded path ("bounded_*"),
// with the real facade, read scope, mutations and domain code over an
// in-process canonical database holding a synthetic production-shaped runtime.
//
//   node --max-old-space-size=<MB> --expose-gc <bundle> <scenario> <ballastMB>
import v8 from "node:v8";
import { createFakeFounderCanonicalDatabase } from "../../../src/testSupport/fakeFounderCanonicalDatabase.js";
import {
  createPostgresFounderReadScope,
  createPostgresFounderRepositoryFacade,
  executePostgresFounderRecordMutation,
  executePostgresFounderRuntimeMutation,
} from "../../../src/platform/database/PostgresFounderRepositoryFacade.js";
import { loadCanonicalRuntime } from "../../../src/platform/migration/phase4CanonicalImport.js";
import { createDexaConfirmationBoundedSteps } from "../../../src/application/evidence/DexaConfirmationBoundedSteps.js";
import { createEvidenceReviewReadService } from "../../../src/application/evidence/EvidenceReviewReadService.js";
import { createEvidenceProcessingMemoryBudget } from "../../../src/platform/jobs/EvidenceProcessingMemoryBudget.js";
import { createConfirmationAnalysisWriter } from "../../../src/application/evidence/ConfirmationBoundedWriters.js";
import { runRepositoryReadScope } from "../../../src/application/read-models/RepositoryReadScope.js";
import { createSeedRepositories } from "../../../src/data/repositories/createSeedRepositories.js";
import { createFounderRuntimeSemanticDigest } from "../../../src/domain/services/FounderRuntimeSemanticDigest.js";
import { toDexaReadModel } from "../../../src/domain/services/DEXAReadModelAdapter.js";
import { createAnalysis } from "../../../src/domain/models/analysis.js";
import { reconcileDexaAppointmentFromConfirmedEvidence } from "../../../src/domain/services/DexaAppointmentLifecycleService.js";
import { GoalEvaluationService } from "../../../src/domain/services/GoalEvaluationService.js";
import { createV3EvidenceUniverse } from "../../../src/domain/intelligence/V3EvidenceUniverse.js";
import {
  SYNTHETIC_CANONICAL_ID,
  SYNTHETIC_OBJECT_ID,
  SYNTHETIC_OWNER as OWNER,
  SYNTHETIC_REVIEW_ID,
  SYNTHETIC_SCAN_DATE,
  seedSyntheticFounderRuntime,
} from "./syntheticFounderRuntime.mjs";

const MB = 1024 * 1024;
const [scenario, ballastArg = "0"] = process.argv.slice(2);
const authorityStore = Object.freeze({ claimCanonicalWriteBoundary: async () => {} });
const BRIEFING_PUBLICATION_COLLECTIONS = ["dailyBriefings", "goalConfidenceSnapshots", "goalConfidenceHistory",
  "confidenceInitializationArtifacts", "confidenceActivationArtifacts"];
let scenarioDiagnostics = null;

let peakHeapUsed = 0;
let phasePeak = 0;
const phases = {};
const sample = () => {
  const used = process.memoryUsage().heapUsed;
  peakHeapUsed = Math.max(peakHeapUsed, used);
  phasePeak = Math.max(phasePeak, used);
};
// Records the highest sampled heap since the previous phase mark.
const phase = (name) => { sample(); phases[name] = Math.round(phasePeak / (1024 * 1024)); phasePeak = 0; };

const db = createFakeFounderCanonicalDatabase({ ownerUserId: OWNER });
const seeded = seedSyntheticFounderRuntime(db);
const baseQuery = db.query;
// Sample the heap around every statement: allocation in these paths happens
// between database round trips.
const query = async (text, values) => { sample(); const result = await baseQuery(text, values); sample(); return result; };
const pool = { query, async connect() { const client = await db.pool.connect(); return { release: () => client.release(), query: async (t, v) => { sample(); const r = await client.query(t, v); sample(); return r; } }; } };

const readScope = createPostgresFounderReadScope({ loadRuntime: () => loadCanonicalRuntime({ query, ownerUserId: OWNER }) });
const facade = createPostgresFounderRepositoryFacade({
  pool, ownerUserId: OWNER, authorityStore,
  readRepositories: () => readScope.readRepositories(),
  runInReadScope: (callback, metadata) => readScope.run(callback, metadata),
});
const bindings = Object.freeze({
  mutateCanonicalRuntime: (input) => executePostgresFounderRuntimeMutation({ pool, ownerUserId: OWNER, authorityStore, bounded: true, returnReceipt: true, ...input }),
  mutateCanonicalRecords: (input) => executePostgresFounderRecordMutation({ pool, ownerUserId: OWNER, authorityStore, ...input }),
});
const directDexaStore = Object.freeze({
  getRecords: async (collection, ids) => ids.map((id) => db.get(collection, id)).filter(Boolean),
  listCanonicalDexaHistory: async () => db.list("canonicalEvidenceObjects")
    .filter((item) => ["dexa", "dexa_scan", "body_composition"].includes(item.evidence_type)),
  listLegacyDexaHistory: async () => db.list("dexaScans"),
  readRecoveryInputs: async () => ({ canonicalEvidenceObjects: [], briefingReconciliationWorkItems: [] }),
});
const steps = createDexaConfirmationBoundedSteps({
  userId: OWNER,
  fallbackRepositories: facade,
  loadReadContext: async ({ collections, includeApplicationContext }) => ({
    runtime: await loadCanonicalRuntime({ query, ownerUserId: OWNER, collections, includeApplicationContext, includeImportMetadata: false }),
  }),
  loadCanonicalCommitBindings: async () => bindings,
  loadDexaReadStore: async () => directDexaStore,
});
const persistAnalyses = createConfirmationAnalysisWriter({
  repositories: facade,
  loadCanonicalCommitBindings: async () => bindings,
  preferNamedRecords: true,
});

function compatibilityRow(canonical) {
  const record = canonical.find((item) => item.canonicalId === SYNTHETIC_CANONICAL_ID);
  return toDexaReadModel(record.payload, { canonicalId: record.canonicalId, dexaRevision: record.dexaRevision, goalPhaseAttribution: record.goalPhaseAttribution, userId: OWNER });
}
const dexaAnalysis = (canonical, prior) => createAnalysis({
  id: `analysis_dexa_${SYNTHETIC_CANONICAL_ID}`, createdAt: "2026-10-09T15:00:00.000Z", title: "DEXA", summary: "DEXA",
  evidenceIds: [SYNTHETIC_CANONICAL_ID], evidenceTypes: ["dexa"], metadata: { canonicalCount: canonical.length, priorCount: prior.length },
});

const SCENARIOS = {
  // Confirmation entry (every invocation): one in-scope whole-runtime load for the durable-resume proof.
  async entry_scope() {
    const readService = createEvidenceReviewReadService({
      store: {
        run: (_name, callback) => callback(),
        getReview: async (id) => db.get("evidenceReviews", id),
        getOwnerUserId: async () => OWNER,
      },
    });
    const context = await readService.getEditContext(SYNTHETIC_REVIEW_ID);
    const canonicalIds = context.review.commitProgress.canonical_commit.result.canonicalEvidenceIds;
    await steps.readCanonicalEvidenceByIds(canonicalIds);
  },
  async legacy_compatibility_writes() {
    const canonical = await facade.canonicalEvidence.listCanonicalEvidenceObjects(OWNER);
    await facade.dexaScans.upsertDEXAScan(compatibilityRow(canonical));
    return canonical.length;
  },
  async bounded_compatibility_writes() {
    const canonical = await steps.readCanonicalEvidence();
    await steps.persistCompatibilityScan(compatibilityRow(canonical));
    return canonical.length;
  },
  async legacy_scheduled_completion() {
    const canonical = await facade.canonicalEvidence.listCanonicalEvidenceObjects(OWNER);
    await reconcileDexaAppointmentFromConfirmedEvidence({ repositories: facade, canonicalEvidenceId: SYNTHETIC_CANONICAL_ID, evidenceDate: SYNTHETIC_SCAN_DATE, confirmedAt: "2026-10-09T15:00:00.000Z" });
    return canonical.length;
  },
  async bounded_scheduled_completion() {
    const canonical = await steps.readCanonicalEvidence();
    await steps.reconcileAppointment({ canonicalEvidenceId: SYNTHETIC_CANONICAL_ID, evidenceDate: SYNTHETIC_SCAN_DATE, confirmedAt: "2026-10-09T15:00:00.000Z" });
    return canonical.length;
  },
  async legacy_analysis() {
    const canonical = await facade.canonicalEvidence.listCanonicalEvidenceObjects(OWNER);
    const prior = await facade.dexaScans.listDEXAScans(OWNER);
    await persistAnalyses([dexaAnalysis(canonical, prior)]);
  },
  async bounded_analysis() {
    const canonical = await steps.readCanonicalEvidence();
    const prior = await steps.readDexaScans();
    await persistAnalyses([dexaAnalysis(canonical, prior)]);
  },
  async legacy_goal_evaluation() {
    const inputs = await runRepositoryReadScope({ repositories: facade, readModel: "harness", callback: async () => {
      const [goals, dexaScans, weightEntries, progressPhotos, protocols, nutritionContext] = await Promise.all([
        facade.goals.listGoals(OWNER), facade.dexaScans.listDEXAScans(OWNER), facade.weights.listWeightEntries(OWNER),
        facade.progressPhotos.listPhotos(OWNER), facade.protocols.listProtocols(OWNER), facade.nutritionContext.getNutritionContext?.(OWNER),
      ]);
      return { goals, dexaScans, weightEntries, progressPhotos, protocols, nutritionContext };
    } });
    await goalEvaluation(inputs);
  },
  async bounded_goal_evaluation() {
    await goalEvaluation(await steps.readGoalEvaluationInputs());
  },
  // The DEXA Event briefing's data path before the fix: event preferences in a
  // read scope, then loadApplicationCanonicalRuntime (a whole load plus a
  // structuredClone), seed repositories, the whole-store baseline digest, the V3
  // evidence universe, and the bounded Confidence publication.
  async legacy_briefing() {
    await runRepositoryReadScope({ repositories: facade, readModel: "harness", callback: () => facade.protocols.listProtocols(OWNER) });
    const runtime = structuredClone(await loadCanonicalRuntime({ query, ownerUserId: OWNER }));
    await briefing(runtime);
  },
  async bounded_briefing() {
    await steps.readEventBriefingPreferences();
    await briefing(await steps.loadDexaEventRuntime());
  },
  async bounded_end_to_end() {
    await SCENARIOS.entry_scope();
    await SCENARIOS.bounded_compatibility_writes();
    await SCENARIOS.bounded_scheduled_completion();
    await SCENARIOS.bounded_analysis();
    await SCENARIOS.bounded_goal_evaluation();
    await SCENARIOS.bounded_briefing();
  },
  async bounded_confirmation_cadence_concurrency() {
    const budget = createEvidenceProcessingMemoryBudget({ serviceLimitBytes: 1024 * MB });
    const confirmation = budget.run({
      operation: "harness-dexa-briefing",
      estimatedWorkingSetBytes: 250 * MB,
    }, () => SCENARIOS.bounded_briefing());
    const cadence = budget.run({
      operation: "harness-briefing-cadence",
      estimatedWorkingSetBytes: 350 * MB,
    }, () => SCENARIOS.legacy_briefing()).then(
      () => ({ outcome: "executed" }),
      (error) => ({ outcome: "deferred", code: error?.code ?? null, retryable: error?.retryable === true }),
    );
    const [confirmationResult, cadenceResult] = await Promise.all([confirmation, cadence]);
    scenarioDiagnostics = {
      confirmationPeakRssFraction: confirmationResult.measurement.peakRssFraction,
      confirmationQueueWaitMs: confirmationResult.measurement.queueWaitMs,
      cadence: cadenceResult,
    };
  },
};

async function goalEvaluation(inputs) {
  const evaluations = GoalEvaluationService.getGoalEvaluations(inputs);
  await persistAnalyses([createAnalysis({ id: "goal_evaluation_synthetic", createdAt: "2026-10-09T15:00:00.000Z", title: "Goal", summary: "Goal",
    evidenceIds: [SYNTHETIC_OBJECT_ID], evidenceTypes: ["dexa_scan"], metadata: { evaluations } })]);
}

async function briefing(runtime) {
  phase("load");
  const repositories = createSeedRepositories(runtime);
  const scans = await repositories.dexaScans.listDEXAScans(OWNER);
  phase("repositories");
  const digest = createFounderRuntimeSemanticDigest(runtime);
  phase("baselineDigest");
  const universe = createV3EvidenceUniverse({ store: runtime, goal: { id: "goals_0" }, phase: { id: "phase_0" }, evidenceCutoff: "2026-10-09T23:59:59.999Z" });
  phase("v3Universe");
  await bindings.mutateCanonicalRuntime({
    operation: "harness-briefing-publication",
    allowedCollections: BRIEFING_PUBLICATION_COLLECTIONS,
    readCollections: BRIEFING_PUBLICATION_COLLECTIONS,
    readApplicationContext: false, readImportMetadata: false, allowApplicationContextMutation: false,
    async mutate(candidate) {
      candidate.dailyBriefings.push({ id: `dexa_event_${SYNTHETIC_OBJECT_ID}`, userId: OWNER, artifactType: "event", universeAnalyses: universe.analyses.length, scans: scans.length, digest });
      return { published: true };
    },
  });
  phase("publication");
  return runtime === null;
}

function allocateBallast(megabytes) {
  // Retained small objects standing in for the web/worker process baseline.
  const target = process.memoryUsage().heapUsed + megabytes * MB;
  const ballast = [];
  while (process.memoryUsage().heapUsed < target) {
    ballast.push(Array.from({ length: 1000 }, (_, index) => ({ index, label: `ballast_${index}`, value: index * 1.5 })));
  }
  return ballast;
}

const run = SCENARIOS[scenario];
if (!run) { process.stdout.write(`HARNESS_RESULT ${JSON.stringify({ scenario, error: "unknown scenario" })}\n`); process.exit(2); }
globalThis.gc?.();
const baseline = process.memoryUsage().heapUsed;
const ballast = allocateBallast(Number(ballastArg));
globalThis.gc?.();
const start = process.memoryUsage().heapUsed;
peakHeapUsed = start;
const startedAt = performance.now();
await run();
sample();
process.stdout.write(`HARNESS_RESULT ${JSON.stringify({
  scenario,
  ok: true,
  ballastMb: Number(ballastArg),
  ballastRetained: ballast.length > 0,
  syntheticRuntimeMb: seeded.payloadMb,
  heapLimitMb: Math.round(v8.getHeapStatistics().heap_size_limit / MB),
  baselineHeapMb: Math.round(baseline / MB),
  startHeapMb: Math.round(start / MB),
  sampledPeakHeapMb: Math.round(peakHeapUsed / MB),
  sampledGrowthMb: Math.round((peakHeapUsed - start) / MB),
  phasePeakHeapMb: phases,
  maxRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
  currentRssMb: Math.round(process.memoryUsage().rss / MB),
  elapsedMs: Math.round(performance.now() - startedAt),
  collectionLoads: db.stats.collectionLoads.length,
  collectionRewrites: [...new Set(db.stats.collectionRewrites)],
  recordWrites: db.stats.recordWrites.length,
  diagnostics: scenarioDiagnostics,
})}\n`);
