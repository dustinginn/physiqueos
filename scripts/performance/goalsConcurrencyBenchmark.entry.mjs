// Bounded, zero-write Goals concurrency and plan probe. Every request owns a
// REPEATABLE READ READ ONLY transaction and explicitly rolls it back. The
// query adapter accepts SELECT/WITH only; application commands are disabled.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createCoreNavigationReadService } from "../../src/application/core/CoreNavigationReadService.js";
import { createPostgresCoreNavigationReadStore } from "../../src/platform/database/PostgresCoreNavigationReadStore.js";
import { createActiveGoalReadService } from "../../src/application/goals/ActiveGoalReadService.js";
import { createPostgresActiveGoalReadStore } from "../../src/platform/database/PostgresActiveGoalReadStore.js";
import { createPhase4CanonicalRecordStore } from "../../src/platform/database/Phase4CanonicalRecordStore.js";
import { hydrateCanonicalTrainingExerciseRegistry } from "../../src/application/training/CanonicalExerciseRegistryReadService.js";

const EXPECTED_GIT_SHA = __EXPECTED_GIT_SHA__;
const MARKER = __MARKER__;
const OWNER = "user_founder_001";
const FIXED_NOW = new Date("2026-10-10T22:30:00.000Z");
const COMMANDS_DISABLED = true;
const WAVES = 20;
const READ_ONLY_STATEMENT = /^\s*(SELECT|WITH)\b/i;
const FULL_BRIEFING_ARTIFACT_SQL = `SELECT payload,version FROM physiqueos.canonical_briefing_records
  WHERE owner_user_id=$1 AND collection_name='dailyBriefings' AND record_id=$2`;
const FULL_ACTIVE_GOAL_COLLECTIONS_SQL = `SELECT collection_name,payload,version FROM (
    SELECT collection_name,payload,version,source_ordinal,record_id FROM physiqueos.canonical_goal_records
      WHERE owner_user_id=$1 AND collection_name=ANY($2::text[])
    UNION ALL
    SELECT collection_name,payload,version,source_ordinal,record_id FROM physiqueos.canonical_user_records
      WHERE owner_user_id=$1 AND collection_name=ANY($3::text[])
    UNION ALL
    SELECT collection_name,payload,version,source_ordinal,record_id FROM physiqueos.canonical_evidence_records
      WHERE owner_user_id=$1 AND collection_name=ANY($4::text[])
    UNION ALL
    SELECT collection_name,payload,version,source_ordinal,record_id FROM physiqueos.canonical_protocol_records
      WHERE owner_user_id=$1 AND collection_name=ANY($5::text[])
    UNION ALL
    SELECT collection_name,payload,version,source_ordinal,record_id FROM physiqueos.canonical_checkin_records
      WHERE owner_user_id=$1 AND collection_name=ANY($6::text[])
    UNION ALL
    SELECT collection_name,payload,version,source_ordinal,record_id FROM physiqueos.canonical_confidence_records
      WHERE owner_user_id=$1 AND collection_name=ANY($7::text[])
  ) AS canonical_records ORDER BY collection_name,record_id`;
const stop = (code, status = 1) => { process.stdout.write(`PHYSIQUEOS_GOALS_CONCURRENCY_BENCH_FAILED:${code}\n`); process.exit(status); };
const watchdog = setTimeout(() => stop("TIMEOUT", 3), 280_000);
if (String(process.env.PHYSIQUEOS_GIT_SHA ?? "") !== EXPECTED_GIT_SHA) stop("RUNTIME_SHA_MISMATCH");
if (process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID !== OWNER) stop("OWNER_MISMATCH");
const rawUrl = String(process.env.PHYSIQUEOS_DATABASE_URL ?? "").trim();
const certificate = String(process.env.PHYSIQUEOS_DATABASE_CA_CERT ?? "").trim();
if (!rawUrl || !certificate.includes("-----BEGIN CERTIFICATE-----")) stop("DATABASE_BINDING_MISSING");
let pg; try { pg = createRequire("/app/server.js")("pg"); } catch { stop("PG_UNAVAILABLE"); }
const url = new URL(rawUrl);
for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]) url.searchParams.delete(key);
const pool = new pg.Pool({
  connectionString: url.toString(), ssl: { ca: certificate, rejectUnauthorized: true },
  application_name: "physiqueos-goals-concurrency-benchmark", max: 3,
  connectionTimeoutMillis: 8_000, statement_timeout: 20_000, allowExitOnIdle: true,
});
const now = () => performance.now();
const round = (value) => Math.round(value * 10) / 10;
const percentile = (values, ratio) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
};
const samples = { goals: [], activeGoalFull: [], activeGoalProjected: [] };
let maximumPoolWaiting = 0;

function projectedBriefingRow(row) {
  const artifact = row.payload ?? {};
  const briefing = artifact.briefing ?? {};
  return {
    id: artifact.id, cadence: artifact.cadence, artifactType: artifact.artifactType,
    preview: artifact.preview, deliveryDate: artifact.deliveryDate, generatedAt: artifact.generatedAt,
    createdAt: artifact.createdAt, lifecycle: artifact.lifecycle,
    confidencePublication: artifact.confidencePublication, status: artifact.status,
    evidenceWindow: artifact.evidenceWindow, goalContext: artifact.goalContext, trigger: artifact.trigger,
    briefingNarrativeV3: briefing.narrativeV3, briefingGoalConfidence: briefing.goalConfidence,
    briefingActiveGoal: briefing.activeGoal, briefingActivePhase: briefing.activePhase,
    briefingEnergyBalance: briefing.energyBalance, briefingWeightContext: briefing.weightContext,
    briefingBodyComposition: briefing.bodyComposition, briefingTraining: briefing.training,
    hasDexaEventNarrative: Boolean(briefing.dexaEventNarrative),
    hasPhotoEventNarrative: Boolean(briefing.photoEventNarrative), version: row.version,
  };
}

function guardedClient(client, { capture = null, fullBriefingArtifact = false, onRows = null } = {}) {
  return Object.freeze({
    async query(text, values) {
      if (!READ_ONLY_STATEMENT.test(String(text))) throw Object.assign(new Error("NON_SELECT_STATEMENT_REFUSED"), { code: "NON_SELECT_STATEMENT_REFUSED" });
      if (/;\s*\S/.test(String(text).replace(/'[^']*'/g, ""))) throw Object.assign(new Error("MULTI_STATEMENT_REFUSED"), { code: "MULTI_STATEMENT_REFUSED" });
      const replaceProjectedArtifact = fullBriefingArtifact && String(text).includes('AS "briefingNarrativeV3"');
      const replaceProjectedCollections = fullBriefingArtifact && String(text).includes("WHEN collection_name='goalConfidenceHistory'");
      const executedText = replaceProjectedArtifact ? FULL_BRIEFING_ARTIFACT_SQL
        : replaceProjectedCollections ? FULL_ACTIVE_GOAL_COLLECTIONS_SQL : text;
      capture?.push([String(executedText), values]);
      const result = await client.query(executedText, values);
      onRows?.(result.rows);
      maximumPoolWaiting = Math.max(maximumPoolWaiting, pool.waitingCount);
      return replaceProjectedArtifact ? { ...result, rows: result.rows.map(projectedBriefingRow) } : result;
    },
    get totalCount() { return pool.totalCount; }, get idleCount() { return pool.idleCount; }, get waitingCount() { return pool.waitingCount; },
  });
}

async function read(label, capture = null) {
  const queuedAt = now();
  const client = await pool.connect();
  const acquiredAt = now();
  let began = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true;
    const readOnly = await client.query("SHOW transaction_read_only");
    if (readOnly.rows[0]?.transaction_read_only !== "on") stop("NOT_READ_ONLY");
    let sourcePayloadBytes = 0;
    const sourceQueryBytes = [];
    const sourceCollectionBytes = {};
    const query = guardedClient(client, {
      capture,
      fullBriefingArtifact: label === "activeGoalFull",
      onRows: (rows) => {
        const bytes = Buffer.byteLength(JSON.stringify(rows));
        sourcePayloadBytes += bytes;
        sourceQueryBytes.push(bytes);
        for (const row of rows) {
          const collection = row.collection_name;
          if (collection) sourceCollectionBytes[collection] =
            (sourceCollectionBytes[collection] ?? 0) + Buffer.byteLength(JSON.stringify(row));
        }
      },
    });
    let value;
    if (label === "goals") {
      const registry = createPhase4CanonicalRecordStore({ query: (text, values) => query.query(text, values) });
      const service = createCoreNavigationReadService({
        store: createPostgresCoreNavigationReadStore({ pool: query, ownerUserId: OWNER }),
        now: () => FIXED_NOW,
        readCanonicalExerciseRegistry: async () => hydrateCanonicalTrainingExerciseRegistry(
          await registry.list({ ownerUserId: OWNER, collection: "canonicalExerciseLibrary" }),
        ),
      });
      value = await service.getGoals();
    } else {
      value = await createActiveGoalReadService({
        store: createPostgresActiveGoalReadStore({ pool: query, ownerUserId: OWNER }),
      }).getPreview({ currentDate: FIXED_NOW });
    }
    await client.query("ROLLBACK"); began = false;
    const elapsedMs = now() - acquiredAt;
    return {
      label, failure: null, elapsedMs, queueMs: acquiredAt - queuedAt, sourcePayloadBytes, sourceQueryBytes,
      sourceCollectionBytes,
      hash: createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16),
    };
  } finally {
    if (began) { try { await client.query("ROLLBACK"); } catch {} }
    client.release();
  }
}

function summarize(label) {
  const rows = samples[label];
  return {
    label, failure: null,
    warmMedianMs: round(percentile(rows.map((row) => row.elapsedMs), 0.5)),
    warmP95Ms: round(percentile(rows.map((row) => row.elapsedMs), 0.95)),
    warmP99Ms: round(percentile(rows.map((row) => row.elapsedMs), 0.99)),
    warmMaxMs: round(Math.max(...rows.map((row) => row.elapsedMs))),
    queueMedianMs: round(percentile(rows.map((row) => row.queueMs), 0.5)),
    queueP95Ms: round(percentile(rows.map((row) => row.queueMs), 0.95)),
    sourcePayloadBytesMedian: round(percentile(rows.map((row) => row.sourcePayloadBytes), 0.5)),
    sourceQueryBytesMedian: Array.from({ length: Math.max(...rows.map((row) => row.sourceQueryBytes.length)) },
      (_, index) => round(percentile(rows.map((row) => row.sourceQueryBytes[index] ?? 0), 0.5))),
    sourceCollectionBytesMedian: Object.fromEntries([...new Set(rows.flatMap((row) =>
      Object.keys(row.sourceCollectionBytes)))].sort().map((collection) => [collection,
      round(percentile(rows.map((row) => row.sourceCollectionBytes[collection] ?? 0), 0.5))])),
    samples: rows.length,
    stableHash: new Set(rows.map((row) => row.hash)).size === 1,
    dataHash: rows[0]?.hash ?? null,
  };
}

function summarizePlan(plan) {
  const root = plan?.Plan ?? {};
  const totals = { sharedHitBlocks: 0, sharedReadBlocks: 0, tempReadBlocks: 0, tempWrittenBlocks: 0 };
  const nodes = [];
  const visit = (node, depth = 0) => {
    totals.sharedHitBlocks += Number(node["Shared Hit Blocks"] ?? 0);
    totals.sharedReadBlocks += Number(node["Shared Read Blocks"] ?? 0);
    totals.tempReadBlocks += Number(node["Temp Read Blocks"] ?? 0);
    totals.tempWrittenBlocks += Number(node["Temp Written Blocks"] ?? 0);
    nodes.push({ depth, nodeType: node["Node Type"] ?? null, actualRows: Number(node["Actual Rows"] ?? 0), actualLoops: Number(node["Actual Loops"] ?? 0), actualTotalTimeMs: round(Number(node["Actual Total Time"] ?? 0)) });
    for (const child of node.Plans ?? []) visit(child, depth + 1);
  };
  visit(root);
  return { planningTimeMs: round(Number(plan?.["Planning Time"] ?? 0)), executionTimeMs: round(Number(plan?.["Execution Time"] ?? 0)), ...totals, nodes: nodes.sort((a, b) => b.actualTotalTimeMs - a.actualTotalTimeMs).slice(0, 8) };
}

async function plansFor(label) {
  const capture = [];
  await read(label, capture);
  const client = await pool.connect();
  let began = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true;
    const output = [];
    for (let index = 0; index < capture.length; index += 1) {
      const [text, values] = capture[index];
      const result = await client.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${text}`, values);
      output.push({ query: index + 1, ...summarizePlan(result.rows[0]?.["QUERY PLAN"]?.[0]) });
    }
    await client.query("ROLLBACK"); began = false;
    return output;
  } finally {
    if (began) { try { await client.query("ROLLBACK"); } catch {} }
    client.release();
  }
}

try {
  // Warm the exact code paths, then model three simultaneous Founder reads
  // over a three-connection bounded pool for enough waves to report a useful
  // p95/p99 rather than treating one small-sample maximum as both tails.
  await read("goals");
  await read("activeGoalFull");
  await read("activeGoalProjected");
  for (let wave = 0; wave < WAVES; wave += 1) {
    const rows = await Promise.all([read("goals"), read("activeGoalFull"), read("activeGoalProjected")]);
    for (const row of rows) samples[row.label].push(row);
  }
  const plans = { goals: await plansFor("goals"), activeGoalFull: await plansFor("activeGoalFull"), activeGoalProjected: await plansFor("activeGoalProjected") };
  const results = [summarize("goals"), summarize("activeGoalFull"), summarize("activeGoalProjected")];
  process.stdout.write(`${JSON.stringify({
    gitSha: EXPECTED_GIT_SHA.slice(0, 12), codeLabel: "round7-source", group: "goals-concurrency",
    commandGate: COMMANDS_DISABLED ? "COMMANDS_DISABLED" : "INVALID", poolMax: 3, waves: WAVES,
    maximumPoolWaiting,
    activeGoalParity: results[1].dataHash === results[2].dataHash,
    results, plans,
  })}\n`);
} catch (error) {
  stop(`UNEXPECTED:${String(error?.code ?? error?.name ?? "unknown").slice(0, 40)}`);
} finally {
  await pool.end();
}
clearTimeout(watchdog);
process.stdout.write(`${MARKER}\n`);
