// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: PHYSIQUEOS_GOAL_ADAPTATION_PHASEB_RO_20261010D
// Founder-authorized (2026-10-10) zero-write Goal Adaptation Phase A input extraction.
// Identity gates, one connection, REPEATABLE READ READ ONLY, transaction_read_only must be on,
// owner-scoped parameterized SELECTs only, explicit ROLLBACK, aggregates/trajectory numbers only.
import { createRequire } from "node:module";
const EXPECTED_GIT_SHA = "85a9802587de0ef23ff2021e803258dea825254d";
const MARKER = "PHYSIQUEOS_GOAL_ADAPTATION_PHASEB_RO_20261010D";
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
const pool = new pg.Pool({ connectionString: cs, ssl: { ca, rejectUnauthorized: true }, max: 1, application_name: "physiqueos-goal-adaptation-phaseb-ro", statement_timeout: 30_000, idle_in_transaction_session_timeout: 90_000, connectionTimeoutMillis: 8_000 });
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
  const val = (m) => (m && typeof m === "object" ? Number(m.value) : Number(m));
  // Scans (2026 and the latest), composition only.
  const scans = (await Q(`SELECT payload FROM physiqueos.canonical_evidence_records WHERE owner_user_id = $1 AND collection_name = 'dexaScans' LIMIT 200`, [OWNER]))
    .map(({ payload: p }) => { const m = p?.measurements ?? p ?? {}; return { date: localDate(p?.scanDate ?? p?.measuredAt ?? p?.performedAt ?? p?.observedAt ?? p?.date), lean: r4(val(m.leanMass)), fat: r4(val(m.fatMass)), total: r4(val(m.totalMass)), bf: r4(m.bodyFatPercentage) }; })
    .filter((s) => s.date && s.date >= "2026-01-01" && s.lean > 0 && s.fat > 0).sort((a, b) => a.date.localeCompare(b.date));
  // Daily intake/activity: HealthKit canonical days preferred, else daily evidence objects.
  const intake = new Map(); const activity = new Map(); const intakeSource = new Map();
  const hk = await Q(`SELECT payload FROM physiqueos.canonical_training_records WHERE owner_user_id = $1 AND collection_name = 'healthKitCanonicalDays' LIMIT 5000`, [OWNER]);
  for (const { payload: d } of hk) { if (!d?.localDate) continue;
    if (d.domain === "nutrition") { const v = Number(d.current?.values?.dailyTotals?.calories); if (v > 0) { intake.set(d.localDate, v); intakeSource.set(d.localDate, "healthkit"); } }
    if (d.domain === "activity") { const v = Number(d.current?.values?.dailyActivity?.move_calories); if (v > 0) activity.set(d.localDate, v); } }
  const ev = await Q(`SELECT payload FROM physiqueos.canonical_evidence_records WHERE owner_user_id = $1 AND collection_name = 'canonicalEvidenceObjects' LIMIT 20000`, [OWNER]);
  const evTypes = {}; const nutKeys = {};
  for (const { payload: rec } of ev) {
    const p = rec?.payload ?? rec ?? {}; const t = p.evidence_type ?? rec?.evidence_type ?? "unknown"; evTypes[t] = (evTypes[t] ?? 0) + 1;
    const date = localDate(p.observed_at ?? rec?.lastObservedAt ?? rec?.firstObservedAt); if (!date) continue;
    if (/nutrition/.test(t)) {
      const paths = numericPaths(p, /^calories$|calorie|energy_kcal|kcal/i).filter((x) => !/goal|target|remaining|burn|move|active/i.test(x));
      for (const x of paths) nutKeys[x] = (nutKeys[x] ?? 0) + 1;
      const pick = paths.find((x) => x === "$.daily_totals.calories") ?? paths.find((x) => /^\$\.daily_?totals?\./i.test(x)) ?? null;
      const v = pick ? Number(at(p, pick)) : NaN;
      if (v > 0 && !intakeSource.has(date)) { intake.set(date, v); intakeSource.set(date, "daily_evidence"); }
    }
    if (/activity/.test(t)) { const v = Number(p.daily_activity?.move_calories); if (v > 0 && !activity.has(date)) activity.set(date, v); }
  }
  const weights = new Map();
  for (const { payload: w } of await Q(`SELECT payload FROM physiqueos.canonical_checkin_records WHERE owner_user_id = $1 AND collection_name = 'weightEntries' LIMIT 5000`, [OWNER])) {
    const d = localDate(w?.measuredAt); const v = Number(w?.weight?.value); if (d && v > 0) weights.set(d, v);
  }
  // Aggregate per period between consecutive scans.
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const slope = (pts) => { if (pts.length < 5) return null; const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]); const mx = mean(xs), my = mean(ys); const num = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0); const den = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0); return den ? num / den : null; };
  const dayIndex = (d) => Date.parse(`${d}T00:00:00Z`) / 86400000;
  const periods = [];
  for (let i = 1; i < scans.length; i += 1) {
    const a = scans[i - 1], b = scans[i]; const inP = (d) => d >= a.date && d < b.date;
    const iDays = [...intake.entries()].filter(([d]) => inP(d)); const aDays = [...activity.entries()].filter(([d]) => inP(d)); const wDays = [...weights.entries()].filter(([d]) => inP(d)).sort();
    const days = Math.round(dayIndex(b.date) - dayIndex(a.date));
    periods.push({ start: a.date, end: b.date, days, dLean: r4(b.lean - a.lean), dFat: r4(b.fat - a.fat), dTotal: r4(b.total - a.total), bfStart: a.bf, bfEnd: b.bf,
      intakeDays: iDays.length, intakeMean: r4(mean(iDays.map(([, v]) => v))), intakeSources: [...new Set(iDays.map(([d]) => intakeSource.get(d)))],
      activityDays: aDays.length, activityMean: r4(mean(aDays.map(([, v]) => v))), weighInDays: wDays.length, weightSlopePerDay: r4(slope(wDays.map(([d, v]) => [dayIndex(d), v]))) });
  }
  const last = scans.at(-1);
  const sinceLast = (d) => last && d >= last.date;
  const recent = { since: last?.date ?? null, intakeDays: [...intake.keys()].filter(sinceLast).length, intakeMean: r4(mean([...intake.entries()].filter(([d]) => sinceLast(d)).map(([, v]) => v))), weighInDays: [...weights.keys()].filter(sinceLast).length };
  await client.query("ROLLBACK"); open = false;
  report = { readOnly: ro, scans, periods, recent, evTypes, nutKeys: Object.fromEntries(Object.entries(nutKeys).slice(0, 10)), totals: { intakeDays: intake.size, activityDays: activity.size, weighInDays: weights.size } };
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
