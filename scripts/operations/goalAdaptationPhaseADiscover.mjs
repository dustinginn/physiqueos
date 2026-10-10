// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: PHYSIQUEOS_GOAL_ADAPTATION_PHASEA_RO_20261010B
// Founder-authorized (2026-10-10) zero-write Goal Adaptation Phase A input extraction.
// Identity gates, one connection, REPEATABLE READ READ ONLY, transaction_read_only must be on,
// owner-scoped parameterized SELECTs only, explicit ROLLBACK, aggregates/trajectory numbers only.
import { createRequire } from "node:module";
const EXPECTED_GIT_SHA = "85a9802587de0ef23ff2021e803258dea825254d";
const MARKER = "PHYSIQUEOS_GOAL_ADAPTATION_PHASEA_RO_20261010B";
const OWNER = "user_founder_001";
const TZ = "America/Los_Angeles";
const SSL = ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"];
const watchdog = setTimeout(() => stop("AUDIT_TIMEOUT", 3), 150_000);
function stop(code, status = 1) { process.stdout.write(`GA_PHASEA_FAILED:${code}\n`); process.exit(status); }
const code = (e) => (/^[A-Za-z0-9_]{3,40}$/.test(String(e?.code ?? "")) ? String(e.code) : "AUDIT_ERROR");
if (String(process.env.PHYSIQUEOS_GIT_SHA ?? "") !== EXPECTED_GIT_SHA) stop("RUNTIME_SHA_MISMATCH");
if (process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID !== OWNER) stop("OWNER_MISMATCH");
const rawUrl = String(process.env.PHYSIQUEOS_DATABASE_URL ?? "").trim();
const ca = String(process.env.PHYSIQUEOS_DATABASE_CA_CERT ?? "").trim();
if (!rawUrl) stop("DATABASE_BINDING_MISSING");
if (!ca.includes("-----BEGIN CERTIFICATE-----")) stop("DATABASE_CA_MISSING");
let pg; try { pg = createRequire("/app/server.js")("pg"); } catch { stop("PG_UNAVAILABLE"); }
let cs; try { const u = new URL(rawUrl); for (const k of SSL) u.searchParams.delete(k); cs = u.toString(); } catch { stop("DATABASE_BINDING_INVALID"); }
const pool = new pg.Pool({ connectionString: cs, ssl: { ca, rejectUnauthorized: true }, max: 1, application_name: "physiqueos-goal-adaptation-phasea-ro", statement_timeout: 30_000, idle_in_transaction_session_timeout: 90_000, connectionTimeoutMillis: 8_000 });
pool.on("error", () => {});
const localDate = (iso) => { if (!iso) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso; const d = new Date(iso); if (!Number.isFinite(d.getTime())) return null; return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); };
const weekOf = (date) => { const d = new Date(`${date}T00:00:00Z`); const dow = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10); }; // Sunday-start weeks (Weekly briefing windows run Sun-Sat)
const r4 = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10000) / 10000 : null);
function numericPaths(obj, rx, path = "$", out = [], depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 6) return out;
  for (const [k, v] of Object.entries(obj)) { const p = `${path}.${k}`; if (typeof v === "number" && rx.test(k)) out.push(p); else if (v && typeof v === "object") numericPaths(v, rx, p, out, depth + 1); }
  return out;
}
const at = (obj, path) => path.split(".").slice(1).reduce((o, k) => (o == null ? undefined : o[k]), obj);

let client, open = false, failure = null, report = null;
try {
  client = await pool.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); open = true;
  const ro = (await client.query("SHOW transaction_read_only")).rows[0]?.transaction_read_only;
  if (ro !== "on") throw Object.assign(new Error("fence"), { code: "TRANSACTION_NOT_READ_ONLY" });
  const Q = (t, v) => client.query(t, v).then((r) => r.rows);
  const ENUM_KEYS = ["domain", "kind", "evidenceType", "objectType", "type", "category", "source", "sourceType", "subjectDomain"];
  const out = {};
  for (const [table, coll] of [["canonical_training_records", "trainingPerformanceEvents"], ["canonical_evidence_records", "canonicalEvidenceObjects"], ["canonical_checkin_records", "dailyCheckIns"]]) {
    const recs = await Q(`SELECT payload FROM physiqueos.${table} WHERE owner_user_id = $1 AND collection_name = $2 LIMIT 20000`, [OWNER, coll]);
    const dateKeys = {}; const enums = {}; const topKeys = {};
    for (const { payload: p } of recs) {
      if (!p || typeof p !== "object") continue;
      for (const k of Object.keys(p)) topKeys[k] = (topKeys[k] ?? 0) + 1;
      for (const [k, v] of Object.entries(p)) if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) && /date|at$|on$|day/i.test(k)) dateKeys[k] = (dateKeys[k] ?? 0) + 1;
      for (const k of ENUM_KEYS) { const v = p[k]; if (typeof v === "string" && v.length <= 48 && /^[a-zA-Z0-9_.\-]+$/.test(v)) { enums[`${k}=${v}`] = (enums[`${k}=${v}`] ?? 0) + 1; } }
    }
    const best = Object.entries(dateKeys).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const pref = best.find((k) => /local|session|performed|occur|day/i.test(k)) ?? best[0] ?? null;
    const weekly = {};
    for (const { payload: p } of recs) {
      const d = localDate(p?.[pref]); if (!d || d < "2026-07-12") continue;
      const typeKey = ENUM_KEYS.map((k) => p?.[k]).find((v) => typeof v === "string" && v.length <= 48 && /^[a-zA-Z0-9_.\-]+$/.test(v)) ?? "untyped";
      const w = weekOf(d); weekly[w] ??= {}; weekly[w][typeKey] ??= new Set(); weekly[w][typeKey].add(d);
    }
    const weeklyDays = Object.fromEntries(Object.entries(weekly).map(([w, m]) => [w, Object.fromEntries(Object.entries(m).map(([k, set]) => [k, set.size]))]));
    out[coll] = { count: recs.length, topKeys: Object.keys(topKeys).sort().slice(0, 60), dateKeys, chosenDateKey: pref, enums: Object.fromEntries(Object.entries(enums).sort((a, b) => b[1] - a[1]).slice(0, 25)), weeklyDistinctDays: weeklyDays };
  }
  await client.query("ROLLBACK"); open = false;
  report = { readOnly: ro, out };
} catch (e) { failure = code(e); }
finally {
  if (open && client) { try { await client.query("ROLLBACK"); } catch { failure ??= "ROLLBACK_FAILED"; } }
  try { client?.release(); } catch { failure ??= "RELEASE_FAILED"; }
  try { await pool.end(); } catch { failure ??= "POOL_CLOSE_FAILED"; }
  clearTimeout(watchdog);
}
if (failure || !report) stop(failure ?? "AUDIT_INCOMPLETE");
process.stdout.write(`GA_PHASEA_JSON:${JSON.stringify(report)}\n`);
process.stdout.write(`${MARKER}\n`);
