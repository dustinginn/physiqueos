// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: PHYSIQUEOS_GOAL_ADAPTATION_PHASEA_RO_20261010A
// Founder-authorized (2026-10-10) zero-write Goal Adaptation Phase A input extraction.
// Identity gates, one connection, REPEATABLE READ READ ONLY, transaction_read_only must be on,
// owner-scoped parameterized SELECTs only, explicit ROLLBACK, aggregates/trajectory numbers only.
import { createRequire } from "node:module";
const EXPECTED_GIT_SHA = "85a9802587de0ef23ff2021e803258dea825254d";
const MARKER = "PHYSIQUEOS_GOAL_ADAPTATION_PHASEA_RO_20261010A";
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
  const rows = (table, coll, limit = 2000) => {
    if (!/^canonical_[a-z_]+$/.test(table)) throw Object.assign(new Error("t"), { code: "TABLE_INVALID" });
    return Q(`SELECT record_id, occurrence_date, payload FROM physiqueos.${table} WHERE owner_user_id = $1 AND collection_name = $2 LIMIT ${limit}`, [OWNER, coll]);
  };
  // Goal + phases
  const goal = (await rows("canonical_goal_records", "goals")).map((r) => r.payload).find((g) => g?.primary === true && g?.status === "active");
  const goalOut = goal ? { id: goal.id, type: goal.type, timeline: { startDate: goal.timeline?.startDate, targetDate: goal.timeline?.targetDate, mode: goal.timeline?.mode, flexibility: goal.timeline?.flexibility ?? null },
    target: { metric: goal.target?.metric, amount: goal.target?.amount, unit: goal.target?.unit, direction: goal.target?.direction },
    guardrails: (goal.guardrails ?? []).map((g) => ({ id: g.id, text: g.text, accepted: g.accepted })),
    phases: (goal.phases ?? []).map((p) => ({ id: p.id, name: p.name, status: p.status, startDate: p.startDate, completedAt: p.completedAt, targetDate: p.targetDate })) } : null;
  // V3 assessments
  const hist = (await rows("canonical_confidence_records", "goalConfidenceHistory")).filter((r) => String(r.record_id).includes("confidence_assessment_v3"));
  const assessments = hist.map((r) => { const p = r.payload ?? {}; const a = p.assessment ?? {}; const si = a.strategicInterpretation ?? {}; const t = a.confidenceProjection?.goalAchievementOutlook?.objectives?.[0]?.trajectory ?? {};
    const g = (si.guardrailFindings ?? []).filter((f) => /body_fat/.test(String(f.metricCapability?.capabilityId ?? f.metricCapability ?? "")));
    return { originatingArtifactId: String(p.originatingArtifactId ?? "").replaceAll(OWNER, "<owner>"), publisherType: p.publisherType, persistedAt: p.persistedAt,
      evaluatedAt: si.interpretedAt ?? null, evaluationType: si.evaluationContext?.type ?? null, evidenceWindow: si.evaluationContext?.evidenceWindow ?? null,
      goalConfidence: a.confidenceProjection?.currentPercentage ?? null, outlookScore: r4(a.confidenceProjection?.goalAchievementOutlook?.score), outlookAsOf: a.confidenceProjection?.goalAchievementOutlook?.asOf ?? null,
      recommendation: si.recommendation ? { action: si.recommendation.action, reason: si.recommendation.reason } : null,
      feasibility: si.strategyEffectiveness?.feasibility ?? null, persistence: si.strategyEffectiveness?.persistence ?? null, goalAchievement: si.goalAchievement ?? null,
      aggregateGuardrailState: si.aggregateGuardrailState ?? null,
      bodyFatGuardrail: g.map((f) => ({ status: f.status, deviation: r4(f.deviation), side: f.currentValue == null ? null : (f.status === "clear" ? "within" : null), freshness: f.freshness })),
      trajectory: Object.fromEntries(["kind", "baseline", "target", "fractionAchieved", "remainingRequirement", "forecastRemainingRequirement", "conditionalUnmeasuredProgress", "startedAt", "deadlineAt", "timeRemainingDays", "observedRate", "requiredRate", "forecastRequiredRate", "discountedRate", "rateRatio", "projectedDaysToCompletion", "scheduleState", "intervalDays", "strategyRevisionId"].map((k) => [k, typeof t[k] === "number" ? r4(t[k]) : t[k] ?? null])) };
  });
  // Body-fat side (above/below) without the value: compare to range in guardrail evaluation
  for (const r of hist) { const a = r.payload?.assessment ?? {}; const si = a.strategicInterpretation ?? {}; const out = assessments.find((x) => x.originatingArtifactId === String(r.payload?.originatingArtifactId ?? "").replaceAll(OWNER, "<owner>"));
    const f = (si.guardrailFindings ?? []).find((x) => /body_fat/.test(String(x.metricCapability?.capabilityId ?? x.metricCapability ?? "")));
    if (out && f && f.currentValue != null && out.bodyFatGuardrail[0]) { const lo = 8, hi = 9; out.bodyFatGuardrail[0].side = f.currentValue < lo ? "below" : f.currentValue > hi ? "above" : "within"; } }
  // Briefing metadata (no content)
  const briefs = (await Q(`SELECT record_id FROM physiqueos.canonical_briefing_records WHERE owner_user_id = $1 AND collection_name = 'dailyBriefings'`, [OWNER])).map((r) => String(r.record_id).replaceAll(OWNER, "<owner>")).filter((id) => !/^daily_briefing_/.test(id)).sort();
  // Evidence coverage (weekly aggregates since 2026-07-12)
  const since = "2026-07-12";
  const weeks = {};
  const bump = (date, key, n = 1) => { if (!date || date < since) return; const w = weekOf(date); weeks[w] ??= {}; weeks[w][key] = (weeks[w][key] ?? 0) + n; };
  const weightDates = new Set((await rows("canonical_checkin_records", "weightEntries", 5000)).map((r) => localDate(r.payload?.measuredAt ?? r.occurrence_date)).filter(Boolean));
  for (const d of weightDates) bump(d, "weighInDays");
  const hk = await Q(`SELECT payload FROM physiqueos.canonical_training_records WHERE owner_user_id = $1 AND collection_name = 'healthKitCanonicalDays' LIMIT 5000`, [OWNER]);
  const domains = {}; const energyKeyPaths = {};
  for (const { payload: d } of hk) { if (!d?.localDate) continue; const dom = d.domain; domains[dom] = (domains[dom] ?? 0) + 1; bump(d.localDate, `hk_${dom}_days`);
    if (!energyKeyPaths[dom]) energyKeyPaths[dom] = numericPaths(d.current?.values ?? {}, /energ|kcal|calor/i).slice(0, 6); }
  // Nutrition adherence vs 2,500 kcal target (Phase 2 energy target), per week, using the first dietary energy path
  const nutPath = (energyKeyPaths.nutrition ?? []).find((p) => /dietary|consum|intake|total/i.test(p)) ?? (energyKeyPaths.nutrition ?? [])[0] ?? null;
  const actPath = (energyKeyPaths.activity ?? []).find((p) => /active/i.test(p)) ?? (energyKeyPaths.activity ?? [])[0] ?? null;
  for (const { payload: d } of hk) { if (!d?.localDate || d.localDate < "2026-08-15") continue;
    if (d.domain === "nutrition" && nutPath) { const v = Number(at(d.current?.values ?? {}, nutPath)); if (Number.isFinite(v) && v > 0) { bump(d.localDate, "intakeDays"); const dev = (v - 2500) / 2500; bump(d.localDate, Math.abs(dev) <= 0.10 ? "intakeWithin10pct" : dev > 0 ? "intakeOver10pct" : "intakeUnder10pct"); } }
    if (d.domain === "activity" && actPath) { const v = Number(at(d.current?.values ?? {}, actPath)); if (Number.isFinite(v) && v > 0) { bump(d.localDate, "activityDays"); const dev = (v - 800) / 800; bump(d.localDate, Math.abs(dev) <= 0.15 ? "activityWithin15pct" : dev > 0 ? "activityOver15pct" : "activityUnder15pct"); } } }
  const trainingDates = new Set((await rows("canonical_training_records", "trainingPerformanceEvents", 20000)).map((r) => localDate(r.payload?.performedAt ?? r.payload?.occurredAt ?? r.payload?.sessionDate ?? r.occurrence_date)).filter(Boolean));
  for (const d of trainingDates) bump(d, "trainingDays");
  const dexaDates = [...new Set((await rows("canonical_evidence_records", "dexaScans")).map((r) => localDate(r.payload?.scanDate ?? r.payload?.measuredAt ?? r.occurrence_date)).filter(Boolean))].sort();
  const photoDates = new Set((await rows("canonical_evidence_records", "progressPhotos", 5000)).map((r) => localDate(r.payload?.capturedAt ?? r.payload?.takenAt ?? r.occurrence_date)).filter(Boolean));
  for (const d of photoDates) bump(d, "photoDays");
  const evidKinds = {};
  for (const r of await Q(`SELECT payload->>'evidenceType' AS t, payload->>'type' AS t2, occurrence_date FROM physiqueos.canonical_evidence_records WHERE owner_user_id = $1 AND collection_name = 'canonicalEvidenceObjects' LIMIT 20000`, [OWNER])) {
    const k = r.t ?? r.t2 ?? "unknown"; const d = localDate(r.occurrence_date instanceof Date ? r.occurrence_date.toISOString() : r.occurrence_date); if (d && d >= since) { const w = weekOf(d); evidKinds[w] ??= {}; evidKinds[w][k] = (evidKinds[w][k] ?? 0) + 1; } }
  await client.query("ROLLBACK"); open = false;
  report = { runtimeSha: process.env.PHYSIQUEOS_GIT_SHA, readOnly: ro, tz: TZ, goal: goalOut, assessments, briefs, domains, energyKeyPaths, nutPath, actPath, dexaDates, weeks, evidKinds };
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
