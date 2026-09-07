import fs from "node:fs";
import pg from "pg";
import {
  DYNAMIC_ROUTE_PATTERNS,
  FOUNDER_HARD_LIMIT_MS,
  FOUNDER_SURFACE_CASES,
  REPRESENTATIVE_INGRESS_CASES,
} from "./founderSurfaceInventory.mjs";

const DIRECT_ORIGIN = "https://physiqueos-foundation-staging-a9or4.ondigitalocean.app";
const NGROK_ORIGIN = "https://float-departed-symphony.ngrok-free.dev";
const BENCHMARK_BATCH = "__BENCHMARK_BATCH__";
const MAX_DISCOVERED_CASES = 80;
const cookiesByOrigin = new Map();
let gateSecret = String(process.env.PHYSIQUEOS_ACCESS_GATE_SECRET ?? "").trim();

if (gateSecret.length < 32) throw new Error("ACCESS_GATE_SECRET_UNAVAILABLE");

try {
  const database = await inspectDatabase();
  await authenticate(DIRECT_ORIGIN);
  const directCases = selectCases(BENCHMARK_BATCH).filter((entry) => entry.benchmarkSafe !== false);
  const direct = await benchmarkMatrix(DIRECT_ORIGIN, directCases, { discover: BENCHMARK_BATCH.startsWith("details") });
  const media = BENCHMARK_BATCH === "media" ? await inspectMediaDelivery(DIRECT_ORIGIN) : null;
  let ngrok = emptyMatrix(NGROK_ORIGIN);
  if (BENCHMARK_BATCH === "ingress") {
    await authenticate(NGROK_ORIGIN);
    const ngrokCases = FOUNDER_SURFACE_CASES.filter((entry) => REPRESENTATIVE_INGRESS_CASES.includes(entry.path));
    ngrok = await benchmarkMatrix(NGROK_ORIGIN, ngrokCases, { discover: false });
  }
  const result = {
    schemaVersion: "physiqueos_founder_performance_benchmark_v1",
    batch: BENCHMARK_BATCH,
    observedAt: new Date().toISOString(),
    sourceCommit: process.env.PHYSIQUEOS_GIT_SHA ?? null,
    buildId: process.env.PHYSIQUEOS_BUILD_ID ?? null,
    ownerUserId: process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID ?? null,
    hardLimitMs: FOUNDER_HARD_LIMIT_MS,
    productionMutationPerformed: "NONE",
    database,
    direct,
    media,
    ngrok,
    ingressDelta: compareIngress(direct, ngrok),
  };
  const encoded = Buffer.from(JSON.stringify(result)).toString("base64");
  process.stdout.write(`PHYSIQUEOS_PERF_BEGIN${encoded}PHYSIQUEOS_PERF_END\n`);
} finally {
  gateSecret = "";
  cookiesByOrigin.clear();
}

function selectCases(batch) {
  if (batch === "core") return FOUNDER_SURFACE_CASES.filter((entry) => ["home", "goals", "log", "evidence", "briefings", "profile", "timeline"].includes(entry.group));
  if (batch === "training-reports") return FOUNDER_SURFACE_CASES.filter((entry) => entry.group === "training" && (entry.label.startsWith("Training Evidence") || entry.label.includes("Training report:")));
  if (batch === "training-library") return FOUNDER_SURFACE_CASES.filter((entry) => entry.group === "training" && entry.label.includes("Training Library"));
  if (batch === "evidence") return FOUNDER_SURFACE_CASES.filter((entry) => ["nutrition", "activity", "weight", "dexa", "photos"].includes(entry.group));
  if (batch === "nutrition-landing") return FOUNDER_SURFACE_CASES.filter((entry) => entry.label.startsWith("Nutrition Evidence"));
  if (batch === "nutrition-primary") return FOUNDER_SURFACE_CASES.filter((entry) => entry.group === "nutrition" && ["calories", "macros", "meals"].some((report) => entry.label.includes(`Nutrition report: ${report}`)));
  if (batch === "nutrition-secondary") return FOUNDER_SURFACE_CASES.filter((entry) => entry.group === "nutrition" && !entry.label.startsWith("Nutrition Evidence") && !["calories", "macros", "meals"].some((report) => entry.label.includes(`Nutrition report: ${report}`)));
  if (batch === "nutrition-secondary-reports") return FOUNDER_SURFACE_CASES.filter((entry) => entry.group === "nutrition" && ["adherence", "consistency"].some((report) => entry.label.includes(`Nutrition report: ${report}`)));
  if (batch === "nutrition-library") return FOUNDER_SURFACE_CASES.filter((entry) => entry.group === "nutrition" && entry.label.startsWith("Nutrition Library:"));
  if (batch === "evidence-verticals") return FOUNDER_SURFACE_CASES.filter((entry) => ["activity", "weight", "dexa", "photos"].includes(entry.group));
  if (batch === "media") return FOUNDER_SURFACE_CASES.filter((entry) => ["/progress/dexa?context=all", "/progress/photos?context=all"].includes(entry.path));
  if (batch === "ingress") return FOUNDER_SURFACE_CASES.filter((entry) => REPRESENTATIVE_INGRESS_CASES.includes(entry.path));
  if (batch === "details") return FOUNDER_SURFACE_CASES.filter((entry) => [
    "/", "/goals", "/log", "/progress", "/progress/training?context=all", "/progress/training/library?context=all",
    "/progress/nutrition?context=all", "/progress/photos?context=all", "/briefings/review", "/profile", "/profile/operating-plan",
  ].includes(entry.path));
  if (batch === "details-home") return FOUNDER_SURFACE_CASES.filter((entry) => ["/", "/goals", "/log"].includes(entry.path));
  if (batch === "details-training") return FOUNDER_SURFACE_CASES.filter((entry) => ["/progress/training?context=all", "/progress/training/library?context=all"].includes(entry.path));
  if (batch === "details-evidence") return FOUNDER_SURFACE_CASES.filter((entry) => ["/progress", "/progress/nutrition?context=all", "/progress/photos?context=all"].includes(entry.path));
  if (batch === "details-briefings") return FOUNDER_SURFACE_CASES.filter((entry) => entry.path === "/briefings/review");
  if (batch === "details-profile") return FOUNDER_SURFACE_CASES.filter((entry) => ["/profile", "/profile/operating-plan"].includes(entry.path));
  throw new Error(`Unknown benchmark batch: ${batch}`);
}

function emptyMatrix(origin) {
  return { origin, measuredSurfaceCount: 0, failuresAbove3Seconds: 0, classificationCounts: {}, memoryBefore: null, memoryAfter: null, slowest: [], cases: [] };
}

async function benchmarkMatrix(origin, initialCases, { discover }) {
  const memoryBefore = memoryStatus();
  const queued = new Map(initialCases.map((entry) => [entry.path, entry]));
  const results = [];
  for (const entry of queued.values()) {
    if (results.length >= MAX_DISCOVERED_CASES) break;
    const cold = await timedRead(origin, entry.path, { cacheBust: true });
    const warm = await timedRead(origin, entry.path, { cacheBust: false });
    const result = {
      ...entry,
      cold: summarize(cold),
      warm: summarize(warm),
      classification: classify(cold, warm, entry.optional),
    };
    results.push(result);
    if (discover && cold.status === 200) {
      for (const path of extractFounderLinks(cold.body)) {
        if (queued.has(path) || queued.size >= MAX_DISCOVERED_CASES) continue;
        const definition = DYNAMIC_ROUTE_PATTERNS.find((candidate) => candidate.pattern.test(path.split("?", 1)[0]));
        if (!definition) continue;
        queued.set(path, { group: definition.group, label: definition.label, path, architecture: definition.architecture, discovered: true });
      }
    }
  }
  const failures = results.filter((entry) => entry.classification === "FAILS FOUNDER 3-SECOND STANDARD");
  const ranked = [...results].sort((left, right) => maxTiming(right) - maxTiming(left));
  return {
    origin,
    measuredSurfaceCount: results.length,
    failuresAbove3Seconds: failures.length,
    classificationCounts: countBy(results, (entry) => entry.classification),
    memoryBefore,
    memoryAfter: memoryStatus(),
    slowest: ranked.slice(0, 20).map((entry) => ({ label: entry.label, path: entry.path, coldMs: entry.cold.elapsedMs, warmMs: entry.warm.elapsedMs, classification: entry.classification })),
    cases: results,
  };
}

async function authenticate(origin) {
  const gate = await fetch(`${origin}/founder-gate?next=%2F`, {
    headers: requestHeaders(), redirect: "manual", signal: AbortSignal.timeout(30_000),
  });
  if (gate.status !== 200) throw new Error(`FOUNDER_GATE_GET_FAILED_${gate.status}`);
  const html = await gate.text();
  const form = (html.match(/<form\b[\s\S]*?<\/form>/gi) ?? []).find((value) => value.includes('name="accessCode"'));
  const action = [...String(form).matchAll(/<input\b[^>]*>/gi)]
    .map(([tag]) => ({ name: attribute(tag, "name"), value: attribute(tag, "value") }))
    .find((field) => field.name.startsWith("$ACTION_ID_"));
  if (!action) throw new Error("FOUNDER_GATE_ACTION_UNAVAILABLE");
  const payload = new FormData();
  payload.set(action.name, action.value);
  payload.set("accessCode", gateSecret);
  payload.set("next", "/");
  const login = await fetch(`${origin}/founder-gate`, {
    method: "POST", body: payload, redirect: "manual", signal: AbortSignal.timeout(60_000),
    headers: requestHeaders({ Origin: origin, Referer: `${origin}/founder-gate?next=%2F` }),
  });
  const jar = new Map();
  for (const value of typeof login.headers.getSetCookie === "function" ? login.headers.getSetCookie() : [login.headers.get("set-cookie")].filter(Boolean)) {
    const pair = String(value).split(";", 1)[0];
    const at = pair.indexOf("=");
    if (at > 0) jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
  if (![302, 303].includes(login.status) || jar.size === 0) throw new Error(`FOUNDER_GATE_LOGIN_FAILED_${login.status}`);
  cookiesByOrigin.set(origin, jar);
}

async function timedRead(origin, pathname, { cacheBust }) {
  const separator = pathname.includes("?") ? "&" : "?";
  const target = cacheBust ? `${pathname}${separator}perf_probe=${Date.now()}_${Math.random().toString(16).slice(2)}` : pathname;
  const startedAt = performance.now();
  try {
    const response = await fetch(`${origin}${target}`, {
      headers: authenticatedHeaders(origin), redirect: "manual", signal: AbortSignal.timeout(30_000),
    });
    const body = await response.text();
    return {
      status: response.status,
      elapsedMs: Math.round(performance.now() - startedAt),
      bytes: Buffer.byteLength(body),
      location: response.headers.get("location"),
      serverTiming: response.headers.get("server-timing"),
      cacheControl: response.headers.get("cache-control"),
      body,
    };
  } catch (error) {
    return { status: 0, elapsedMs: Math.round(performance.now() - startedAt), bytes: 0, location: null, serverTiming: null, cacheControl: null, error: error?.name ?? "Error", body: "" };
  }
}

async function inspectMediaDelivery(origin) {
  const pages = ["/progress/dexa?context=all", "/progress/photos?context=all"];
  const links = new Map();
  for (const pagePath of pages) {
    const page = await timedRead(origin, pagePath, { cacheBust: false });
    for (const match of page.body.matchAll(/(?:href|src)="(\/api\/private-evidence\/[^"?#]+(?:\?[^"#]*)?)"/gi)) {
      const mediaPath = decodeHtml(match[1]);
      if (!links.has(mediaPath)) links.set(mediaPath, pagePath.includes("dexa") ? "dexa" : "photo");
    }
  }
  const samples = [];
  const selectedLinks = [
    ...[...links].filter(([, kind]) => kind === "dexa").slice(0, 2),
    ...[...links].filter(([, kind]) => kind === "photo").slice(0, 4),
  ];
  for (const [mediaPath, kind] of selectedLinks) {
    const startedAt = performance.now();
    try {
      const response = await fetch(`${origin}${mediaPath}`, {
        headers: authenticatedHeaders(origin), redirect: "manual", signal: AbortSignal.timeout(30_000),
      });
      const bytes = (await response.arrayBuffer()).byteLength;
      samples.push({
        kind,
        opaqueProviderPath: mediaPath.startsWith("/api/private-evidence/media/"),
        status: response.status,
        elapsedMs: Math.round(performance.now() - startedAt),
        bytes,
        contentType: response.headers.get("content-type"),
        cacheControl: response.headers.get("cache-control"),
      });
    } catch (error) {
      samples.push({ kind, opaqueProviderPath: mediaPath.startsWith("/api/private-evidence/media/"), status: 0, elapsedMs: Math.round(performance.now() - startedAt), bytes: 0, error: error?.name ?? "Error" });
    }
  }
  return Object.freeze({
    discoveredLinkCount: links.size,
    objectStorageRequestCount: samples.length,
    samples,
  });
}

async function inspectDatabase() {
  const raw = String(process.env.PHYSIQUEOS_DATABASE_URL ?? "").trim();
  const ca = String(process.env.PHYSIQUEOS_DATABASE_CA_CERT ?? "").trim();
  const ownerUserId = String(process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID ?? "").trim();
  if (!raw || !ownerUserId) return { measurable: false, reason: "PROVIDER_READ_IDENTITY_UNAVAILABLE" };
  const url = new URL(raw);
  if (ca) for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]) url.searchParams.delete(key);
  const pool = new pg.Pool({ connectionString: url.toString(), ssl: ca ? { ca, rejectUnauthorized: true } : undefined, max: 1 });
  const tables = [
    "canonical_user_records", "canonical_goal_records", "canonical_plan_records", "canonical_protocol_records",
    "canonical_execution_records", "canonical_checkin_records", "canonical_evidence_records", "canonical_training_records",
    "canonical_briefing_records", "canonical_confidence_records",
  ];
  try {
    const startedAt = performance.now();
    const groups = await Promise.all(tables.map((table) => pool.query(
      `SELECT collection_name,count(*)::int AS rows,coalesce(sum(pg_column_size(payload)),0)::bigint AS payload_bytes
         FROM physiqueos.${table} WHERE owner_user_id=$1 GROUP BY collection_name ORDER BY collection_name`,
      [ownerUserId],
    )));
    const media = await pool.query(
      `SELECT count(*)::int AS rows,coalesce(sum(byte_length),0)::bigint AS source_bytes,
              coalesce(sum(pg_column_size(provenance)),0)::bigint AS catalog_payload_bytes
         FROM physiqueos.canonical_media_objects WHERE owner_user_id=$1 AND state='verified'`,
      [ownerUserId],
    );
    const collections = groups.flatMap((result) => result.rows.map((row) => ({ collection: row.collection_name, rows: Number(row.rows), payloadBytes: Number(row.payload_bytes) })));
    return {
      measurable: true,
      elapsedMs: Math.round(performance.now() - startedAt),
      collectionCount: collections.length,
      totalRows: collections.reduce((sum, row) => sum + row.rows, 0),
      totalPayloadBytes: collections.reduce((sum, row) => sum + row.payloadBytes, 0),
      collections,
      media: { rows: Number(media.rows[0]?.rows ?? 0), sourceBytes: Number(media.rows[0]?.source_bytes ?? 0), catalogPayloadBytes: Number(media.rows[0]?.catalog_payload_bytes ?? 0) },
      compatibilityRuntimeQueryCount: 42,
      compatibilityRuntimeQueryExecution: "sequential",
    };
  } finally {
    await pool.end();
  }
}

function extractFounderLinks(html) {
  const links = new Set();
  for (const match of String(html).matchAll(/href="([^"#]+)"/gi)) {
    const raw = decodeHtml(match[1]);
    if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/_next") || raw.startsWith("/api/") || raw.includes("logout")) continue;
    const url = new URL(raw, "https://physiqueos.invalid");
    for (const key of [...url.searchParams.keys()]) if (!["context", "from", "version", "edit"].includes(key)) url.searchParams.delete(key);
    const path = `${url.pathname}${url.search}`;
    if (!path.startsWith("/preview") && !path.startsWith("/lab") && !path.startsWith("/photo-simulator") && !path.startsWith("/founder-gate")) links.add(path);
  }
  return links;
}

function classify(cold, warm, optional) {
  if ((cold.status >= 300 && cold.status < 400) && optional) return "BLOCKED / NOT MEASURABLE";
  if (cold.status !== 200 || warm.status !== 200) return "BLOCKED / NOT MEASURABLE";
  const value = Math.max(cold.elapsedMs, warm.elapsedMs);
  if (value > FOUNDER_HARD_LIMIT_MS) return "FAILS FOUNDER 3-SECOND STANDARD";
  if (value > 2_000) return "NEEDS OPTIMIZATION";
  if (value > 750) return "ACCEPTABLE";
  return "FAST";
}

function compareIngress(direct, ngrok) {
  const byPath = new Map(direct.cases.map((entry) => [entry.path, entry]));
  return ngrok.cases.map((entry) => {
    const provider = byPath.get(entry.path);
    return { path: entry.path, directWarmMs: provider?.warm.elapsedMs ?? null, ngrokWarmMs: entry.warm.elapsedMs, ngrokOverheadMs: provider ? entry.warm.elapsedMs - provider.warm.elapsedMs : null };
  });
}

function summarize(value) {
  return { status: value.status, elapsedMs: value.elapsedMs, bytes: value.bytes, location: value.location, serverTiming: value.serverTiming, cacheControl: value.cacheControl, ...(value.error ? { error: value.error } : {}) };
}

function maxTiming(entry) { return Math.max(entry.cold.elapsedMs, entry.warm.elapsedMs); }
function countBy(values, select) { return values.reduce((result, value) => { const key = select(value); result[key] = (result[key] ?? 0) + 1; return result; }, {}); }
function attribute(tag, name) { return new RegExp(`${name}="([^"]*)"`, "i").exec(tag)?.[1] ?? ""; }
function decodeHtml(value) { return String(value).replaceAll("&amp;", "&").replaceAll("&#x3D;", "="); }
function requestHeaders(extra = {}) { return { Accept: "text/html", "Cache-Control": "no-cache", "User-Agent": "PhysiqueOS-ReadOnly-Performance-Audit/1.0", "ngrok-skip-browser-warning": "1", ...extra }; }
function authenticatedHeaders(origin) { const jar = cookiesByOrigin.get(origin); return requestHeaders({ Cookie: [...(jar ?? [])].map(([key, value]) => `${key}=${value}`).join("; ") }); }
function memoryStatus() { try { return { rssBytes: process.memoryUsage().rss, heapUsedBytes: process.memoryUsage().heapUsed, cgroupBytes: Number(fs.readFileSync("/sys/fs/cgroup/memory.current", "utf8").trim()) }; } catch { return { rssBytes: process.memoryUsage().rss, heapUsedBytes: process.memoryUsage().heapUsed, cgroupBytes: null }; } }
