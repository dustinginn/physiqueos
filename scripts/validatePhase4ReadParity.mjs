import { performance } from "node:perf_hooks";
import { register } from "node:module";
import { createHash } from "node:crypto";
import { createValidationPostgresPool } from "./validationPostgresPool.mjs";

register("./sourceModuleResolutionHook.mjs", import.meta.url);
const { readAndValidateCanonicalPackage } = await import("../src/platform/migration/phase4CanonicalExport.js");
const { createPhase4PostgresApplicationComposition } = await import("../src/platform/database/phase4PostgresComposition.js");
const { createSeedRepositories } = await import("../src/data/repositories/createSeedRepositories.js");
const { createLegacyFounderReadLoaders } = await import("../src/application/read-models/LegacyFounderReadLoaders.js");
const { createPhase3ReadModelService } = await import("../src/application/read-models/Phase3ReadModelService.js");
const { createTrainingReadService } = await import("../src/application/training/TrainingReadService.js");
const { registerRuntimeTrainingExercises } = await import("../src/domain/models/trainingExerciseIdentity.js");
const { createPayloadHash } = await import("../src/contracts/v1/canonicalJson.js");

const databaseUrl = String(process.env.PHYSIQUEOS_PHASE4_DATABASE_URL ?? "").trim();
const packageRoot = process.argv[2];
if (!databaseUrl || !packageRoot) throw new Error("PHYSIQUEOS_PHASE4_DATABASE_URL and package root are required.");
const packageData = await readAndValidateCanonicalPackage(packageRoot);
const manifest = packageData.manifest;
const runtime = {
  version: manifest.source.runtime.version,
  revision: Number(manifest.source.runtime.revision),
  updatedAt: manifest.criticalValues.sourceUpdatedAt,
  importedAt: "1970-01-01T00:00:00.000Z",
  ...packageData.collections,
};
const ownerUserId = runtime.user.id;
const now = () => new Date("2026-08-12T03:00:00.000Z");
const principal = { userId: ownerUserId, deviceId: "phase4-device", sessionId: "phase4-session" };
registerRuntimeTrainingExercises(runtime.canonicalExerciseLibrary ?? []);
const legacyRepositories = createSeedRepositories(runtime);
const legacy = createPhase3ReadModelService({
  loaders: createLegacyFounderReadLoaders({ repositories: legacyRepositories, readRuntimeStore: () => runtime, now }),
  now,
  readResourceVersion: ({ data }) => String(data?.version ?? runtime.revision ?? "1"),
});
const pool = createValidationPostgresPool({ connectionString: databaseUrl, maximumPoolSize: 2, applicationName: "physiqueos-read-parity" });
try {
  const postgres = await createPhase4PostgresApplicationComposition({ pool, ownerUserId, now });
  const pendingReview = runtime.evidenceReviews.find((item) => item.status === "pending") ?? runtime.evidenceReviews[0];
  const priority = runtime.executionItems[0];
  const canonicalTraining = runtime.canonicalEvidenceObjects.find((item) => (item.payload ?? item).evidence_type === "training");
  const trainingSessionId = canonicalTraining ? String(canonicalTraining.canonicalId ?? canonicalTraining.payload?.id ?? canonicalTraining.id) : null;
  const briefing = runtime.dailyBriefings[0];
  const surfaces = [
    ["home", {}], ["log", { timeZone: runtime.user.timeZone }],
    ["evidenceReview", { reviewId: pendingReview?.id }], ["goals", {}], ["operatingPlan", {}],
    ["priorities", { priorityId: priority?.id }], ["progress", {}], ["confidence", {}],
    ["briefings", {}], ["briefingDetail", { method: "briefings", input: { briefingId: briefing?.id } }],
    ["training", {}], ["trainingDetail", { method: "training", input: { sessionId: trainingSessionId } }],
    ["profile", {}],
  ];
  const started = performance.now();
  const results = {};
  for (const [label, specification] of surfaces) {
    const method = specification.method ?? label;
    const input = specification.input ?? specification;
    const [left, right] = await Promise.all([legacy[method](principal, input), postgres.readModels[method](principal, input)]);
    assertDeepEqual(left, right, label);
    results[label] = "pass";
  }
  const legacyTraining = createTrainingReadService({ repositories: legacyRepositories });
  const postgresTraining = createTrainingReadService({ repositories: postgres.repositories });
  for (const [label, method, input] of [
    ["trainingExerciseSearch", "getExerciseLibrary", { query: "curl" }],
    ["trainingCategories", "listCategories", {}],
    ["trainingRecent", "listRecentExercises", {}],
  ]) {
    const [left, right] = await Promise.all([legacyTraining[method]({ principal, ...input }), postgresTraining[method]({ principal, ...input })]);
    assertDeepEqual(left, right, label); results[label] = "pass";
  }
  const exercise = (await legacyTraining.getExerciseLibrary({ principal, limit: 1 }))[0];
  if (exercise) {
    const [left, right] = await Promise.all([legacyTraining.getExercise({ principal, exerciseId: exercise.id }), postgresTraining.getExercise({ principal, exerciseId: exercise.id })]);
    assertDeepEqual(left, right, "trainingExerciseDetail"); results.trainingExerciseDetail = "pass";
  }
  process.stdout.write(`${JSON.stringify({ parity: results, surfaceCount: Object.keys(results).length, readParityDurationMs: Math.round(performance.now() - started) })}\n`);
} finally { await pool.end(); }

function assertDeepEqual(left, right, label) {
  if (createPayloadHash(left) !== createPayloadHash(right)) {
    const leftText = JSON.stringify(left); const rightText = JSON.stringify(right);
    throw new Error(`Read-model parity failed for ${label} at ${firstDifference(left, right)} (legacy=${digest(leftText)} postgres=${digest(rightText)}).`);
  }
}
function firstDifference(left, right, current = "$" ) {
  if (Object.is(left, right)) return null;
  if (typeof left !== typeof right || left == null || right == null) return current;
  if (typeof left !== "object") return current;
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) { const difference = firstDifference(left[key], right[key], `${current}.${key}`); if (difference) return difference; }
  return current;
}
function digest(value) { return createHash("sha256").update(value).digest("hex").slice(0, 12); }
