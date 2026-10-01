// Recovery Briefing V1 historical policy probe.
//
// This file is intentionally non-shipping. It is designed to run only inside
// the current production web component, where it opens a REPEATABLE READ,
// READ ONLY transaction, verifies transaction_read_only=on, performs bounded
// owner/collection/date-scoped reads, emits sanitized aggregates, and rolls
// back. It never emits a nightly duration, date-level status, exercise name,
// source identifier, or raw Founder record.

import { createRequire } from "node:module";

const OWNER = String(process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID ?? "").trim();
const EXPECTED_SHA = "5804e88dac0db6bb04cf43647d6387efeab25906";
const START = "2026-07-06";
const END = "2026-09-30";
const DAY_MS = 86_400_000;
const MINUTE = 60;
const MARKER = "PHYSIQUEOS_RECOVERY_V1_ZERO_WRITE_MODELING_SUCCESS";

const require = createRequire("/app/server.js");
const pg = require("pg");

if (process.env.PHYSIQUEOS_GIT_SHA !== EXPECTED_SHA) fail("RUNTIME_SHA_MISMATCH");
if (!OWNER) fail("OWNER_BINDING_MISSING");

const rawUrl = String(process.env.PHYSIQUEOS_DATABASE_URL ?? "").trim();
const ca = String(process.env.PHYSIQUEOS_DATABASE_CA_CERT ?? "").trim();
if (!rawUrl || !ca.includes("-----BEGIN CERTIFICATE-----")) fail("DATABASE_BINDING_MISSING");
const url = new URL(rawUrl);
for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]) {
  url.searchParams.delete(key);
}

const pool = new pg.Pool({
  connectionString: url.toString(),
  ssl: { ca, rejectUnauthorized: true },
  max: 1,
  application_name: "physiqueos-recovery-v1-zero-write-modeling",
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 60_000,
  connectionTimeoutMillis: 8_000,
});
pool.on("error", () => {});

let client;
let open = false;
try {
  client = await pool.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  open = true;
  const readOnly = (await client.query("SHOW transaction_read_only")).rows[0]?.transaction_read_only;
  if (readOnly !== "on") fail("TRANSACTION_NOT_READ_ONLY");

  // One client, one statement at a time. The Founder runtime collections are
  // bounded by owner + collection + a hard row cap, then filtered by their
  // canonical payload date because several legacy records predate indexed
  // occurrence_date backfill.
  const sleepRows = await listRange("canonical_training_records", "healthKitSleepHistoricalEvidenceDays", START, END);
  const reminderRows = await getExact("canonical_execution_records", "reminders", "reminder_foam_roll_daily");
  const executionRows = await getExact("canonical_execution_records", "executionItems", "execution_foam_roll");
  const checkInRows = await listCollectionBounded("canonical_checkin_records", "dailyCheckIns", 500);
  const evidenceRows = await listCollectionBounded("canonical_evidence_records", "canonicalEvidenceObjects", 2000);
  const performanceRows = await listCollectionBounded("canonical_training_records", "trainingPerformanceEvents", 2000);
  const workoutRows = await listCollectionBounded("canonical_training_records", "healthKitCanonicalWorkouts", 1000);

  const sleep = sleepRows.map(rowPayload).map((row) => ({
    date: row.sleepDay ?? row.occurrenceDate,
    seconds: finite(row.mainSleep?.asleepSeconds),
  })).filter((row) => dateKey(row.date) && Number.isFinite(row.seconds));

  const reminder = reminderRows.map(rowPayload)[0] ?? null;
  const execution = executionRows.map(rowPayload)[0] ?? null;
  const checkIns = checkInRows.map(rowPayload).filter((row) => inAuditWindow(row.date ?? row.occurrenceDate));
  const evidence = evidenceRows.map(rowPayload).filter((row) => {
    const payload = row.payload ?? row;
    return inAuditWindow(payload.observed_at ?? payload.workoutDate ?? row.occurrenceDate);
  });
  const performance = performanceRows.map(rowPayload).filter((row) => inAuditWindow(row.workoutDate ?? row.occurrenceDate));
  const workouts = workoutRows.map(rowPayload).filter((row) => inAuditWindow(row.localDate ?? row.occurrenceDate ?? row.startedAt));
  const foam = foamOutcomes({ reminder, checkIns });
  const trainingDates = collectTrainingDates({ evidence, workouts });
  const performanceDates = new Set(performance.map((row) => dateKey(row.workoutDate ?? row.occurrenceDate)).filter(Boolean));

  const weekly = weeklyPeriods(START, END).map((period) => assessPeriod({
    cadence: "weekly", period, sleep, foam, trainingDates, performanceDates,
  }));
  const midweek = midweekPeriods(START, END).map((period) => assessPeriod({
    cadence: "midweek", period, sleep, foam, trainingDates, performanceDates,
  }));
  const monthly = monthlyPeriods(START, END).map((period) => assessPeriod({
    cadence: "monthly", period, sleep, foam, trainingDates, performanceDates,
  }));

  const eligibleSleep = sleep.map((row) => row.seconds).sort((a, b) => a - b);
  const allBaselineMads = [...weekly, ...midweek, ...monthly]
    .map((item) => item.baselineMadMinutes)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const result = {
    schemaVersion: "recovery_assessment_v1_historical_probe_v1",
    runtime: {
      expectedGitSha: EXPECTED_SHA,
      transactionReadOnly: true,
      ownerScoped: true,
      dateRange: { start: START, end: END },
      rollbackRequired: true,
    },
    inputCoverage: {
      sleepNights: sleep.length,
      canonicalTrainingDates: trainingDates.size,
      trainingPerformanceEventDates: performanceDates.size,
      boundedCollectionRowsLoaded: {
        dailyCheckIns: checkInRows.length,
        canonicalEvidenceObjects: evidenceRows.length,
        trainingPerformanceEvents: performanceRows.length,
        healthKitCanonicalWorkouts: workoutRows.length,
      },
      foamSchedule: {
        reminderPresent: Boolean(reminder),
        executionPresent: Boolean(execution),
        cadence: reminder?.schedule?.cadence ?? reminder?.schedule?.type ?? execution?.cadence?.type ?? null,
        explicitHistoricalEffectiveFrom: dateKey(reminder?.schedule?.startDate ?? execution?.preferredSchedule?.startDate),
      },
      foamObservedOutcomes: countValues([...foam.values()]),
    },
    aggregateDistribution: {
      sleepDurationMinutes: quantiles(eligibleSleep.map((value) => value / MINUTE)),
      usableBaselineMadMinutes: quantiles(allBaselineMads),
    },
    candidateResults: {
      weekly: summarize(weekly),
      midweek: summarize(midweek),
      monthly: summarize(monthly),
    },
    noiseChecks: {
      weeklyOneMaterialLowNightStillGreen: weekly.filter((item) => item.materialLowNights === 1 && item.status === "green").length,
      weeklyOneMaterialLowNightNotGreen: weekly.filter((item) => item.materialLowNights === 1 && item.status !== "green" && item.status !== "unavailable").length,
      weeklyGreenWithTwoOrMoreFoamMisses: weekly.filter((item) => item.status === "green" && item.foamMissed >= 2).length,
      weeklySleepYellowTrainingHeld: weekly.filter((item) => item.status === "yellow" && item.trainingHeld).length,
      weeklyRedWithCorroboration: weekly.filter((item) => item.status === "red" && item.trainingCorroborated).length,
      weeklySleepOnlyExtremeRed: weekly.filter((item) => item.status === "red" && item.sleepOnlyExtreme).length,
      weeklyPersistenceWithoutPeriodMeanWouldYellow: weekly.filter((item) => item.status === "green" && item.materialLowNights >= 3 && item.materialRun >= 2).length,
      weeklyTwoConsecutiveMaterialNightsWouldYellow: weekly.filter((item) => item.status === "green" && item.materialLowNights >= 2 && item.materialRun >= 2).length,
    },
    privacy: {
      rawNightValuesEmitted: false,
      perPeriodDatesEmitted: false,
      exerciseNamesEmitted: false,
      rawRecordsEmitted: false,
    },
  };

  await client.query("ROLLBACK");
  open = false;
  process.stdout.write(`PHYSIQUEOS_RECOVERY_V1_MODELING_JSON:${JSON.stringify(result)}\n${MARKER}\n`);
} catch (error) {
  if (open && client) await client.query("ROLLBACK").catch(() => undefined);
  const code = /^[A-Z0-9_]{3,80}$/.test(String(error?.code ?? ""))
    ? error.code : "RECOVERY_V1_MODELING_FAILED";
  process.stdout.write(`PHYSIQUEOS_RECOVERY_V1_MODELING_FAILED:${code}\n`);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end().catch(() => undefined);
}

async function listRange(table, collection, start, end) {
  return (await client.query(
    `SELECT payload FROM physiqueos.${table}
      WHERE owner_user_id=$1 AND collection_name=$2
        AND occurrence_date BETWEEN $3::date AND $4::date
      ORDER BY occurrence_date,record_id`,
    [OWNER, collection, start, end],
  )).rows;
}

async function getExact(table, collection, recordId) {
  return (await client.query(
    `SELECT payload FROM physiqueos.${table}
      WHERE owner_user_id=$1 AND collection_name=$2 AND record_id=$3`,
    [OWNER, collection, recordId],
  )).rows;
}

async function listCollectionBounded(table, collection, limit) {
  return (await client.query(
    `SELECT payload FROM physiqueos.${table}
      WHERE owner_user_id=$1 AND collection_name=$2
      ORDER BY record_id LIMIT $3`,
    [OWNER, collection, limit],
  )).rows;
}

function assessPeriod({ cadence, period, sleep, foam, trainingDates, performanceDates }) {
  const baseline = sleep
    .filter((row) => row.date < period.start && row.date >= shift(period.start, -28))
    .map((row) => row.seconds);
  const rows = sleep.filter((row) => row.date >= period.start && row.date <= period.end);
  const baselineCenter = median(baseline);
  const baselineMad = mad(baseline);
  const robustSpread = Math.max(15 * MINUTE, 1.4826 * (baselineMad ?? 0));
  const materialThreshold = Math.max(30 * MINUTE, robustSpread);
  const severeThreshold = Math.max(75 * MINUTE, 2 * robustSpread);
  const deltas = rows.map((row) => ({ date: row.date, delta: row.seconds - baselineCenter }));
  const material = deltas.filter((row) => row.delta <= -materialThreshold);
  const severe = deltas.filter((row) => row.delta <= -severeThreshold);
  const averageDelta = mean(rows.map((row) => row.seconds)) - baselineCenter;
  const expected = daysInclusive(period.start, period.end);
  const sufficient = baseline.length >= 14 && rows.length >= minimumNights(cadence, expected);
  const materialRun = longestRun(material.map((row) => row.date));
  const severeRun = longestRun(severe.map((row) => row.date));
  const trainingDays = datesInRange(trainingDates, period).length;
  const baselineTrainingWeeks = priorWeeklyTrainingCounts(trainingDates, period.start, 4);
  const typicalTrainingDays = median(baselineTrainingWeeks);
  const expectedTrainingDays = Number.isFinite(typicalTrainingDays)
    ? typicalTrainingDays * expected / 7
    : null;
  const materialTrainingReduction = Number.isFinite(expectedTrainingDays)
    ? Math.max(cadence === "monthly" ? 3 : 1, Math.ceil(expectedTrainingDays * 0.25))
    : null;
  const trainingCorroborated = Number.isFinite(expectedTrainingDays) && expectedTrainingDays >= 2 &&
    trainingDays <= Math.max(0, Math.floor(expectedTrainingDays - materialTrainingReduction));
  const performanceHeld = datesInRange(performanceDates, period).length > 0;
  const trainingHeld = trainingDays >= Math.max(1, Math.floor((expectedTrainingDays ?? trainingDays) * 0.75)) || performanceHeld;
  const sleepOnlyExtreme = cadence === "monthly"
    ? severe.length >= Math.ceil(rows.length * 0.6) && averageDelta <= -severeThreshold
    : severe.length >= Math.min(5, Math.max(3, rows.length - 1)) && severeRun >= Math.min(4, rows.length) && averageDelta <= -severeThreshold;
  const yellow = cadence === "midweek"
    ? material.length >= Math.min(2, rows.length) && materialRun >= 2 && averageDelta <= -Math.max(45 * MINUTE, robustSpread)
    : cadence === "monthly"
      ? monthlyYellow(rows, deltas, materialThreshold)
      : material.length >= 3 && materialRun >= 2 && averageDelta <= -materialThreshold;
  const red = cadence === "midweek"
    ? false
    : sleepOnlyExtreme || (yellow && trainingCorroborated && severe.length >= (cadence === "monthly" ? 6 : 2));
  const status = !sufficient ? "unavailable" : red ? "red" : yellow ? "yellow" : "green";
  const foamRows = datesInRange(foam, period, true);
  return {
    status,
    baselineNights: baseline.length,
    nightsAvailable: rows.length,
    expectedNights: expected,
    baselineMadMinutes: Number.isFinite(baselineMad) ? round1(baselineMad / MINUTE) : null,
    materialLowNights: material.length,
    severeLowNights: severe.length,
    materialRun,
    severeRun,
    foamCompleted: foamRows.filter(([, value]) => value === "completed").length,
    foamMissed: foamRows.filter(([, value]) => value === "missed").length,
    foamUnknown: expected - foamRows.length,
    trainingDays,
    trainingHeld,
    trainingCorroborated,
    sleepOnlyExtreme,
  };
}

function monthlyYellow(rows, deltas, materialThreshold) {
  if (rows.length < 20) return false;
  const byWeek = new Map();
  for (const row of deltas) {
    const key = sunday(row.date);
    const list = byWeek.get(key) ?? [];
    list.push(row);
    byWeek.set(key, list);
  }
  const yellowWeeks = [...byWeek.values()].filter((week) => {
    const low = week.filter((row) => row.delta <= -materialThreshold);
    return week.length >= 4 && low.length >= 3 && longestRun(low.map((row) => row.date)) >= 2 && mean(week.map((row) => row.delta)) <= -materialThreshold;
  }).length;
  return yellowWeeks >= 2 || deltas.filter((row) => row.delta <= -materialThreshold).length >= 12;
}

function summarize(values) {
  return {
    periods: values.length,
    statuses: countValues(values.map((item) => item.status)),
    assessedPeriods: values.filter((item) => item.status !== "unavailable").length,
    materialLowNightCount: values.reduce((sum, item) => sum + item.materialLowNights, 0),
    severeLowNightCount: values.reduce((sum, item) => sum + item.severeLowNights, 0),
    trainingCorroboratedPeriods: values.filter((item) => item.trainingCorroborated).length,
    periodsWithKnownFoamOutcomes: values.filter((item) => item.foamCompleted + item.foamMissed > 0).length,
  };
}

function foamOutcomes({ reminder, checkIns }) {
  const values = new Map();
  for (const entry of reminder?.completionHistory ?? []) {
    const date = dateKey(entry.occurrenceDate ?? entry.evidenceDate ?? entry.completedAt);
    if (date >= START && date <= END) values.set(date, "completed");
  }
  for (const checkIn of checkIns) {
    const checkInDate = dateKey(checkIn.date ?? checkIn.occurrenceDate);
    for (const entry of checkIn.reconciliation ?? []) {
      if ((entry.priorityId ?? entry.reminderId) !== "reminder_foam_roll_daily") continue;
      const date = dateKey(entry.occurrenceDate ?? checkInDate);
      if (!date || date < START || date > END || values.get(date) === "completed") continue;
      const status = String(entry.disposition ?? entry.status ?? "").toLowerCase();
      if (status === "completed") values.set(date, "completed");
      else if (["skipped", "missed", "note"].includes(status)) values.set(date, "missed");
    }
  }
  return values;
}

function collectTrainingDates({ evidence, workouts }) {
  const values = new Set();
  for (const object of evidence) {
    const payload = object.payload ?? object;
    if (payload.evidence_type !== "training") continue;
    const active = ![object.status, object.quality?.status, payload.status, payload.quality?.status].includes("superseded") && !object.supersededBy && !payload.supersededBy;
    const date = dateKey(payload.observed_at ?? payload.workoutDate ?? object.occurrenceDate);
    if (active && date) values.add(date);
  }
  for (const workout of workouts) {
    const family = String(workout.workoutFamily ?? workout.family ?? workout.activityType ?? "").toLowerCase();
    const status = String(workout.status ?? workout.lifecycle?.state ?? "live").toLowerCase();
    const date = dateKey(workout.localDate ?? workout.occurrenceDate ?? workout.startedAt);
    if (date && status !== "deleted" && /strength|resistance/.test(family)) values.add(date);
  }
  return values;
}

function weeklyPeriods(start, end) {
  const result = [];
  let cursor = sunday(start);
  if (cursor < start) cursor = shift(cursor, 7);
  for (; shift(cursor, 6) <= end; cursor = shift(cursor, 7)) result.push({ start: cursor, end: shift(cursor, 6) });
  return result;
}

function midweekPeriods(start, end) {
  const result = [];
  let cursor = sunday(start);
  if (cursor < start) cursor = shift(cursor, 7);
  for (; shift(cursor, 2) <= end; cursor = shift(cursor, 7)) result.push({ start: cursor, end: shift(cursor, 2) });
  return result;
}

function monthlyPeriods(start, end) {
  const result = [];
  for (let cursor = `${start.slice(0, 7)}-01`; cursor <= end;) {
    const next = shiftMonth(cursor, 1);
    result.push({ start: cursor < start ? start : cursor, end: shift(next, -1) > end ? end : shift(next, -1) });
    cursor = next;
  }
  return result;
}

function priorWeeklyTrainingCounts(dates, periodStart, count) {
  const values = [];
  for (let index = count; index >= 1; index -= 1) {
    const start = shift(periodStart, -7 * index);
    values.push(datesInRange(dates, { start, end: shift(start, 6) }).length);
  }
  return values.filter((value) => Number.isFinite(value));
}

function minimumNights(cadence, expected) {
  if (cadence === "midweek") return Math.min(3, expected);
  if (cadence === "monthly") return Math.min(20, expected);
  return Math.min(5, expected);
}

function datesInRange(values, period, entries = false) {
  const source = entries ? [...values.entries()] : [...values];
  return source.filter((value) => {
    const date = entries ? value[0] : value;
    return date >= period.start && date <= period.end;
  });
}

function longestRun(dates) {
  const sorted = [...new Set(dates)].sort();
  let longest = 0;
  let current = 0;
  let prior = null;
  for (const date of sorted) {
    current = prior && shift(prior, 1) === date ? current + 1 : 1;
    longest = Math.max(longest, current);
    prior = date;
  }
  return longest;
}

function quantiles(values) {
  if (!values.length) return { count: 0, p10: null, p25: null, p50: null, p75: null, p90: null };
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, p10: round1(q(sorted, 0.1)), p25: round1(q(sorted, 0.25)), p50: round1(q(sorted, 0.5)), p75: round1(q(sorted, 0.75)), p90: round1(q(sorted, 0.9)) };
}

function q(sorted, probability) {
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return sorted[lower + 1] === undefined ? sorted[lower] : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower]);
}

function countValues(values) {
  return values.reduce((result, value) => ({ ...result, [value]: (result[value] ?? 0) + 1 }), {});
}

function rowPayload(row) { return row?.payload ?? row; }
function finite(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function mean(values) { const valid = values.filter(Number.isFinite); return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null; }
function median(values) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function mad(values) { const center = median(values); return center == null ? null : median(values.map((value) => Math.abs(value - center))); }
function round1(value) { return Number.isFinite(value) ? Math.round(value * 10) / 10 : null; }
function dateKey(value) { const match = String(value ?? "").match(/^\d{4}-\d{2}-\d{2}/); return match?.[0] ?? null; }
function inAuditWindow(value) { const date = dateKey(value); return Boolean(date && date >= START && date <= END); }
function shift(value, days) { return new Date(Date.parse(`${value}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10); }
function sunday(value) { const day = new Date(`${value}T12:00:00Z`).getUTCDay(); return shift(value, -day); }
function daysInclusive(start, end) { return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY_MS) + 1; }
function shiftMonth(value, amount) { const date = new Date(`${value.slice(0, 7)}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + amount); return date.toISOString().slice(0, 10); }
function fail(code) { const error = new Error(code); error.code = code; throw error; }
