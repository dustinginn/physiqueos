import { performance } from "node:perf_hooks";
import { register } from "node:module";
import { createValidationPostgresPool } from "./validationPostgresPool.mjs";

register("./sourceModuleResolutionHook.mjs", import.meta.url);
const { createFoundationPostgresAdapters } = await import("../src/platform/database/foundationPostgresComposition.js");
const { createPhase5ProviderApplicationComposition } = await import("../src/platform/database/phase5ProviderComposition.js");
const { readSpacesConfig } = await import("../src/platform/object-storage/spacesConfig.js");
const { createSpacesPrivateObjectProvider } = await import("../src/platform/object-storage/SpacesPrivateObjectProvider.js");
const { createDurableOutboxWorker } = await import("../src/platform/jobs/DurableOutboxWorker.js");
const { createPayloadHash } = await import("../src/contracts/v1/canonicalJson.js");
const { evaluateOperationalReadiness } = await import("../src/platform/observability/operationalReadiness.js");

if (process.env.PHYSIQUEOS_PHASE5_PROVIDER_ACCEPTANCE !== "1") throw new Error("Phase 5 provider acceptance is not explicitly enabled.");
const databaseUrl = String(process.env.PHYSIQUEOS_PHASE4_DATABASE_URL ?? "").trim();
const parsed = new URL(databaseUrl);
if (!parsed.hostname.endsWith(".ondigitalocean.com") || decodeURIComponent(parsed.pathname.slice(1)) !== "physiqueos_phase5_test_provider_20260811") {
  throw new Error("Refusing Phase 5 operations validation outside the exact synthetic provider database.");
}
if (!String(process.env.PHYSIQUEOS_DATABASE_CA_CERT ?? "").includes("BEGIN CERTIFICATE")) throw new Error("Strict provider CA verification is required.");
const spaces = readSpacesConfig(process.env);
if (String(process.env.PHYSIQUEOS_CREDENTIAL_PEPPER ?? "").length < 32) throw new Error("Opaque media grant secret is required.");
const provider = createSpacesPrivateObjectProvider(spaces);
const pool = createValidationPostgresPool({ connectionString: databaseUrl, maximumPoolSize: 6, applicationName: "physiqueos-phase5-operations" });
const adapters = createFoundationPostgresAdapters({ query: (text, values) => pool.query(text, values) });
const now = new Date("2026-08-11T22:00:00.000Z");
const handled = new Map();
const handlers = {
  "foundation.synthetic": handle,
  "canonical.read-model.invalidate": handle,
};
const started = performance.now();
try {
  const first = await createPhase5ProviderApplicationComposition({ pool, ownerUserId: "phase5-synthetic-user", objectProvider: provider, now: () => now });
  const firstDigest = createPayloadHash(first.runtime);
  const firstProfile = await first.readModels.profile({ userId: "phase5-synthetic-user", deviceId: "phase5-device", sessionId: "phase5-session" });
  const second = await createPhase5ProviderApplicationComposition({ pool, ownerUserId: "phase5-synthetic-user", objectProvider: provider, now: () => now });
  assert(createPayloadHash(second.runtime) === firstDigest, "Application composition restart changed canonical state.");
  assert(createPayloadHash(await second.readModels.profile({ userId: "phase5-synthetic-user", deviceId: "phase5-device", sessionId: "phase5-session" })) === createPayloadHash(firstProfile), "Application restart changed a client-facing read model.");

  const runPrefix = `phase5-provider-${Date.now()}`;
  for (let index = 0; index < 4; index += 1) {
    await adapters.commands.outbox.insert({ id: `${runPrefix}-${index}`, userId: "phase5-synthetic-user", topic: "foundation.synthetic", dedupeKey: `${runPrefix}-${index}`, payloadVersion: "1", payload: { commandId: `${runPrefix}-${index}` }, dueAt: now });
  }
  await pool.query(
    `INSERT INTO physiqueos.outbox_messages
      (id,user_id,topic,dedupe_key,payload_version,payload,due_at,status,claimed_by,claim_expires_at,attempt_count)
     VALUES ($1,$2,'foundation.synthetic',$1,'1',$3::jsonb,$4,'processing','phase5-crashed-worker',$5,1)`,
    [`${runPrefix}-leased`, "phase5-synthetic-user", JSON.stringify({ commandId: `${runPrefix}-leased` }), now, new Date(now.getTime() - 1_000)],
  );
  const workerA = createDurableOutboxWorker({ store: adapters.outbox, handlers, workerId: "phase5-worker-a", buildId: "phase5-provider-validation", clock: () => now });
  const workerB = createDurableOutboxWorker({ store: adapters.outbox, handlers, workerId: "phase5-worker-b", buildId: "phase5-provider-validation", clock: () => now });
  for (let index = 0; index < 100; index += 1) {
    const results = await Promise.all([workerA.runOnce(), workerB.runOnce()]);
    if (results.every((item) => item.outcome === "idle")) break;
  }
  for (let index = 0; index < 4; index += 1) assert(handled.get(`${runPrefix}-${index}`) === 1, "Concurrent worker claims duplicated or lost synthetic work.");
  assert(handled.get(`${runPrefix}-leased`) === 1, "Expired worker lease was not recovered exactly once.");
  const state = await pool.query("SELECT id,status,attempt_count,last_error_detail FROM physiqueos.outbox_messages WHERE id LIKE $1 ORDER BY id", [`${runPrefix}%`]);
  assert(state.rows.length === 5 && state.rows.every((row) => row.status === "succeeded"), "Provider queued work did not survive claim/restart processing.");
  assert(state.rows.every((row) => row.last_error_detail == null), "Provider operation retained an unexpected error detail.");
  const readiness = await evaluateOperationalReadiness({
    buildIdentity: { buildId: "phase5-provider-validation", apiVersion: "v1" },
    environment: { databaseEnabled: true, objectStorageEnabled: true, objectStorageRequired: true },
    database: pool,
    objectProvider: provider,
    workerStore: adapters.outbox,
    workerRequired: false,
    expectedSchemaMigration: "000004_phase5_provider_readiness",
  });
  assert(readiness.status === "ready", "Provider operational readiness did not report healthy dependencies.");
  const result = {
    applicationCompositionRestart: "pass",
    queuedWorkSurvival: "pass",
    concurrentWorkerClaims: "pass",
    expiredLeaseRecovery: "pass",
    noDuplicateEffects: "pass",
    operationalReadiness: readiness.status,
    processedMessages: state.rows.length,
    durationMs: Math.round(performance.now() - started),
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  provider.close();
  await pool.end();
}

async function handle({ messageId }) { handled.set(messageId, (handled.get(messageId) ?? 0) + 1); }
function assert(condition, message) { if (!condition) throw new Error(message); }
