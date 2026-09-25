// Zero-write Native read benchmark. Runs the exact Native production read service (the code behind
// GET /api/v1/native/read/<resource>) against production data inside the web container.
// Contract: identity gates before any DB access; one bounded connection; BEGIN ISOLATION LEVEL
// REPEATABLE READ READ ONLY; SHOW transaction_read_only == on; every statement passes a SELECT/WITH-only
// guard; explicit ROLLBACK; success marker only after rollback. Output is numbers and resource names only —
// never identifiers, dates, payload values, or error text.
import { fixedNow } from "./nativeReadBenchmarkClock.mjs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { Session } from "node:inspector/promises";
import { createNativeProductionContractService } from "../../src/application/native/NativeProductionContractService.js";
import { GROUP, createReaders, runGroup } from "native-read-benchmark-group";

const EXPECTED_GIT_SHA = __EXPECTED_GIT_SHA__;
const MARKER = __MARKER__;
const WARM_REPETITIONS = __WARM_REPETITIONS__;
const PROFILE_LABELS = __PROFILE_LABELS__; // labels to CPU-profile after the timed runs (positions only)
const CODE_LABEL = __CODE_LABEL__; // which source tree was bundled (baseline vs candidate)
const OWNER = "user_founder_001";
const stop = (code, status = 1) => { process.stdout.write(`PHYSIQUEOS_NATIVE_READ_BENCH_FAILED:${code}\n`); process.exit(status); };
const watchdog = setTimeout(() => stop("TIMEOUT", 3), 280_000);
if (String(process.env.PHYSIQUEOS_GIT_SHA ?? "") !== EXPECTED_GIT_SHA) stop("RUNTIME_SHA_MISMATCH");
if (process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID !== OWNER) stop("OWNER_MISMATCH");
const rawUrl = String(process.env.PHYSIQUEOS_DATABASE_URL ?? "").trim();
const certificate = String(process.env.PHYSIQUEOS_DATABASE_CA_CERT ?? "").trim();
if (!rawUrl) stop("DATABASE_BINDING_MISSING");
if (!certificate.includes("-----BEGIN CERTIFICATE-----")) stop("DATABASE_CA_MISSING");
let pg; try { pg = createRequire("/app/server.js")("pg"); } catch { stop("PG_UNAVAILABLE"); }
let connectionString;
try {
  const u = new URL(rawUrl);
  for (const k of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]) u.searchParams.delete(k);
  connectionString = u.toString();
} catch { stop("DATABASE_BINDING_INVALID"); }
const pool = new pg.Pool({
  connectionString, ssl: { ca: certificate, rejectUnauthorized: true }, application_name: "physiqueos-native-read-benchmark",
  max: 1, connectionTimeoutMillis: 8000, statement_timeout: 20000, allowExitOnIdle: true,
});

const now = () => performance.now();
const round = (value) => Math.round(value * 10) / 10;
const median = (values) => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
let meter = null; // { queries, dbMs, dbRows, dbBytes }

let client; let began = false;
const READ_ONLY_STATEMENT = /^\s*(SELECT|WITH)\b/i;
const guardedPool = Object.freeze({
  async query(text, values) {
    if (!READ_ONLY_STATEMENT.test(String(text))) throw Object.assign(new Error("NON_SELECT_STATEMENT_REFUSED"), { code: "NON_SELECT_STATEMENT_REFUSED" });
    if (/;\s*\S/.test(String(text).replace(/'[^']*'/g, ""))) throw Object.assign(new Error("MULTI_STATEMENT_REFUSED"), { code: "MULTI_STATEMENT_REFUSED" });
    const startedAt = now();
    const result = await client.query(text, values);
    if (meter) {
      meter.queries += 1;
      meter.dbMs += now() - startedAt;
      meter.dbRows += result.rows?.length ?? 0;
    }
    return result;
  },
  get totalCount() { return 1; }, get idleCount() { return 0; }, get waitingCount() { return 0; },
});

function buildService() {
  const readers = Object.freeze(createReaders({ pool: guardedPool, ownerUserId: OWNER }));
  return createNativeProductionContractService({
    authenticate: async () => ({ userId: OWNER, scopes: ["founder:read"], deviceId: "benchmark", sessionId: "benchmark" }),
    ownerUserId: OWNER,
    readers,
    executeCommand: async () => { throw new Error("COMMANDS_DISABLED"); },
    openMedia: async () => { throw new Error("MEDIA_DISABLED"); },
  });
}

async function measureOnce(service, resource, input) {
  meter = { queries: 0, dbMs: 0, dbRows: 0 };
  const startedAt = now();
  let envelope; let failure = null;
  try { envelope = await service.read({ request: null, resource, input }); }
  catch (error) { failure = String(error?.code ?? error?.status ?? "READ_FAILED").slice(0, 60); }
  const readMs = now() - startedAt;
  const serializeStartedAt = now();
  const serialized = envelope ? JSON.stringify(envelope.data) : "";
  const bytes = envelope ? Buffer.byteLength(JSON.stringify(envelope)) : 0;
  const serializeMs = now() - serializeStartedAt;
  const sample = { readMs, serializeMs, bytes, failure, ...meter,
    // Digest of the response data (not generatedAt) for baseline-vs-candidate parity; not reversible.
    dataHash: envelope ? createHash("sha256").update(serialized).digest("hex").slice(0, 16) : null };
  if (envelope && PROFILE_LABELS.length) sample.shape = responseShape(envelope.data);
  meter = null;
  return { sample, envelope };
}

const profileInputs = new Map();
async function bench(service, label, resource, input) {
  if (PROFILE_LABELS.includes(label)) profileInputs.set(label, { resource, input });
  const cold = await measureOnce(service, resource, input);
  const warm = [];
  for (let index = 0; index < WARM_REPETITIONS; index += 1) warm.push((await measureOnce(service, resource, input)).sample);
  const row = {
    label, resource,
    coldMs: round(cold.sample.readMs), warmMedianMs: round(median(warm.map((s) => s.readMs))),
    warmDbMs: round(median(warm.map((s) => s.dbMs))),
    warmComputeMs: round(median(warm.map((s) => s.readMs - s.dbMs))),
    serializeMs: round(median(warm.map((s) => s.serializeMs))),
    queries: cold.sample.queries, dbRows: cold.sample.dbRows, responseBytes: cold.sample.bytes,
    failure: cold.sample.failure,
    dataHash: cold.sample.dataHash,
    stableAcrossRuns: warm.every((sample) => sample.dataHash === cold.sample.dataHash),
    ...(PROFILE_LABELS.includes(label) && cold.sample.shape ? { shape: cold.sample.shape } : {}),
  };
  results.push(row);
  return cold.envelope;
}

// Serialized bytes per key of the response data (and of data.report), largest first. Key names are
// contract schema, never values.
function responseShape(data) {
  const sizes = (value) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value).map(([key, child]) => [key, Buffer.byteLength(JSON.stringify(child) ?? "")])
      .sort((a, b) => b[1] - a[1]).slice(0, 25)
    : [];
  return { data: sizes(data), report: sizes(data?.report) };
}

// Aggregates a V8 CPU profile into self and inclusive milliseconds per function start position of this bundle
// (line:column, resolved to source locally with the build's sourcemap). No names from data, only code positions.
function summarizeProfile(profile) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const deltas = new Map();
  profile.samples.forEach((id, index) => deltas.set(id, (deltas.get(id) ?? 0) + (profile.timeDeltas[index] ?? 0)));
  const key = (frame) => (frame.url ?? "").startsWith("node:") || frame.lineNumber < 0
    ? `${frame.url || "(native)"}:${frame.functionName || "(anon)"}`
    : `b:${frame.lineNumber}:${frame.columnNumber}`;
  const self = new Map(); const inclusive = new Map();
  const parent = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  for (const node of profile.nodes) {
    const micros = deltas.get(node.id) ?? 0;
    if (!micros) continue;
    const selfKey = key(node.callFrame);
    self.set(selfKey, (self.get(selfKey) ?? 0) + micros);
    const seen = new Set();
    for (let id = node.id; id !== undefined; id = parent.get(id)) {
      const frameKey = key(byId.get(id).callFrame);
      if (seen.has(frameKey)) continue;
      seen.add(frameKey);
      inclusive.set(frameKey, (inclusive.get(frameKey) ?? 0) + micros);
    }
  }
  const top = (map, count) => [...map].sort((a, b) => b[1] - a[1]).slice(0, count).map(([k, v]) => [k, Math.round(v / 100) / 10]);
  const totalMs = Math.round([...deltas.values()].reduce((a, b) => a + b, 0) / 1000);
  return { totalMs, self: top(self, 30), inclusive: top(inclusive, 60) };
}

// Find the first value for a key anywhere in a tree (ids are used as inputs, never printed).
function deepFind(value, predicate, depth = 0) {
  if (!value || typeof value !== "object" || depth > 12) return undefined;
  for (const [key, child] of Object.entries(value)) {
    if (predicate(key, child)) return child;
    const found = deepFind(child, predicate, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

const results = [];
try {
  client = await pool.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true;
  const ro = await client.query("SHOW transaction_read_only");
  if (ro.rows[0]?.transaction_read_only !== "on") stop("NOT_READ_ONLY");

  const rtt = [];
  for (let index = 0; index < 10; index += 1) { const s = now(); await client.query("SELECT 1"); rtt.push(now() - s); }

  const service = buildService();
  await runGroup({ bench: (label, resource, input) => bench(service, label, resource, input), deepFind });
  const profiles = {};
  if (profileInputs.size) {
    const session = new Session();
    session.connect();
    await session.post("Profiler.enable");
    await session.post("Profiler.setSamplingInterval", { interval: 200 });
    for (const [label, { resource, input }] of profileInputs) {
      await session.post("Profiler.start");
      for (let index = 0; index < 3; index += 1) await measureOnce(service, resource, input);
      const { profile } = await session.post("Profiler.stop");
      profiles[label] = summarizeProfile(profile);
    }
    session.disconnect();
  }

  await client.query("ROLLBACK"); began = false;
  const tail = await client.query("SELECT 1 AS ok"); // same connection, outside the rolled-back transaction
  if (tail.rows[0]?.ok !== 1) stop("POST_ROLLBACK_CHECK_FAILED");
  process.stdout.write(`${JSON.stringify({
    gitSha: EXPECTED_GIT_SHA.slice(0, 12), group: GROUP, fixedNow, codeLabel: CODE_LABEL, warmRepetitions: WARM_REPETITIONS,
    dbRoundTripMs: { median: round(median(rtt)), max: round(Math.max(...rtt)) },
    results, profiles,
  })}\n`);
} catch (error) {
  if (began) { try { await client.query("ROLLBACK"); } catch {} }
  stop(`UNEXPECTED:${String(error?.code ?? error?.name ?? "unknown").slice(0, 40)}`);
} finally {
  client?.release();
}
await pool.end();
clearTimeout(watchdog);
process.stdout.write(`${MARKER}\n`);
