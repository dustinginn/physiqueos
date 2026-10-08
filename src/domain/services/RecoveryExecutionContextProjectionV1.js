import { localDateTimeToUtc } from "./IntelligenceLifecycleIdentityService.js";
import { findSuspensionWindow } from "./ExecutionPriorityProjectionService.js";
import { getPriorityReconciliationId } from "./PriorityOccurrenceReconciliation.js";
import { isResistanceTrainingSession } from "./TrainingEvidenceClassification.js";
import { RECOVERY_STATUS_POLICY_V1 } from "./RecoveryBriefingPolicyV1.js";

// Pure, bounded projections of the Recovery card's EXECUTION CONTEXT from the
// canonical snapshot the Weekly/Monthly generator already loaded. They never
// read a store, write anything, read the clock or touch Sleep.
//
// Foam rolling (Founder decisions 1, 2, 7 — 2026-10-08):
//   occurrences  = the canonical Foam Rolling schedule (reminder schedule,
//                  start/end from the Operating Plan execution item, pause
//                  windows), from its effective date only — never a
//                  pre-schedule denominator, never an invented occurrence;
//   completed    = a `reminder_foam_roll_daily` completion (completionHistory)
//                  or a Morning Check-In "completed" disposition for that date;
//   excused      = an explicit Skip disposition (`priority.skip.v1` or the
//                  Morning Check-In) recorded in `dailyCheckIns`;
//   missed       = a scheduled, closed day with neither.
// One disposition per date, precedence completed > excused > missed. Evidence
// recorded after the generation cutoff is ignored (no lookahead); evidence
// whose recording instant cannot be established takes the day out of the
// denominator instead of guessing. Foam is execution context only: the
// assessment never lets it set, escalate or rescue status.
//
// Training (Founder decisions 5, 6): canonical resistance-training days in the
// period vs the four preceding Sunday–Saturday weeks, for NON-ESCALATING
// context only. `materialConstraint` is always false — training-corroborated
// Red stays disabled until travel/illness/injury/planned-rest/deload
// exclusions have an authoritative source.

export const RECOVERY_EXECUTION_CONTEXT_PROJECTION_VERSION = "recovery_execution_context_projection_v1";
export const FOAM_ROLLING_REMINDER_ID = "reminder_foam_roll_daily";
export const FOAM_ROLLING_EXECUTION_ID = "execution_foam_roll";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const ZONED = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;
const NAIVE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)$/;

/**
 * `{ foamRolling, accounting, limitations }` where `foamRolling` is the
 * assessment's `{ scheduleEffectiveFrom, occurrences[] }` input (or null when
 * no reminder exists).
 */
export function projectRecoveryFoamContextV1({
  reminders = [], executionItems = [], dailyCheckIns = [], period, evidenceCutoff,
} = {}) {
  const window = normalizeWindow(period, evidenceCutoff);
  const reminder = list(reminders).find((item) => item?.id === FOAM_ROLLING_REMINDER_ID) ?? null;
  if (!reminder) return result(null, null, ["foam_reminder_absent"]);
  const execution = list(executionItems).find((item) => item?.id === FOAM_ROLLING_EXECUTION_ID) ?? null;
  const limitations = [];
  const known = (value) => knownByCutoff(value, window);

  // Completion evidence by occurrence date (completionHistory, legacy
  // single `completedAt`, Morning Check-In "completed").
  const completions = new Map();
  const unknownDates = new Set();
  const note = (map, date, entry) => {
    if (!isDate(date) || date < window.startDate || date > window.endDate) return;
    if (entry.known === null) {
      unknownDates.add(date);
      return;
    }
    if (!entry.known) return;
    map.set(date, [...(map.get(date) ?? []), entry.id]);
  };
  const skips = new Map();
  // A Morning Check-In completion is written with a backdated local 20:00
  // `completedAt`; its real recording instant is the reconciliation entry's.
  const reconciledCompletionAt = new Map();
  for (const checkIn of list(dailyCheckIns)) {
    for (const item of list(checkIn?.reconciliation)) {
      if (getPriorityReconciliationId(item) !== FOAM_ROLLING_REMINDER_ID) continue;
      const date = String(item.occurrenceDate ?? checkIn.date ?? "");
      const status = String(item.status ?? "").toLowerCase();
      const entry = { id: `${FOAM_ROLLING_REMINDER_ID}:${status}:${date}`, known: known(item.recordedAt) };
      if (status === "completed") {
        note(completions, date, entry);
        if (item.recordedAt) reconciledCompletionAt.set(date, item.recordedAt);
      } else if (status === "skipped") {
        note(skips, date, entry);
      }
      // "note" and anything else is not an explicit Skip: it neither excuses
      // nor completes the occurrence.
    }
  }
  for (const entry of history(reminder)) {
    const date = completionDate(entry, window.timeZone);
    const recordedAt = entry?.recordedAt ?? (entry?.satisfactionType === "morning_check_in_reconciliation"
      ? reconciledCompletionAt.get(date) ?? null
      : entry?.completedAt);
    note(completions, date, { id: `${FOAM_ROLLING_REMINDER_ID}:completion:${date}`, known: known(recordedAt) });
  }

  const schedule = resolveSchedule({ reminder, execution });
  if (!schedule.authoritative) {
    limitations.push(schedule.reason);
    // Without schedule authority only observed completions exist: the
    // assessment shows them as observed context with no denominator.
    const occurrences = [...completions.keys()].sort().map((date) => ({
      id: `${FOAM_ROLLING_REMINDER_ID}:${date}`, date, status: "completed", authority: "observed_only",
    }));
    return result({ scheduleEffectiveFrom: null, occurrences }, null, limitations);
  }

  const occurrences = [];
  const accounting = { scheduled: 0, completed: 0, excused: 0, missed: 0, unverifiable: 0, preSchedule: 0, paused: 0 };
  for (let date = window.startDate; date <= window.endDate; date = shift(date, 1)) {
    if (!schedule.occursOn(date)) continue;
    if (date < schedule.startDate) {
      accounting.preSchedule += 1;
      continue;
    }
    if (schedule.endDate && date > schedule.endDate) continue;
    if (execution && findSuspensionWindow(execution, date)) {
      accounting.paused += 1;
      continue;
    }
    // A closed period only; never an occurrence the cutoff has not reached.
    if (date > window.cutoffLocalDate) continue;
    const status = completions.has(date) ? "completed" : skips.has(date) ? "excused" : "missed";
    // Undatable evidence that could change the day's disposition removes the
    // day from the denominator instead of guessing.
    if (status !== "completed" && unknownDates.has(date)) {
      accounting.unverifiable += 1;
      continue;
    }
    accounting.scheduled += 1;
    accounting[status] += 1;
    occurrences.push({ id: `${FOAM_ROLLING_REMINDER_ID}:${date}`, date, status, authority: "authoritative" });
  }
  if (accounting.unverifiable) limitations.push("foam_evidence_time_unknown_occurrence_excluded");
  if (accounting.paused) limitations.push("foam_paused_days_not_scheduled");
  return result({ scheduleEffectiveFrom: schedule.startDate, occurrences }, accounting, limitations);
}

/**
 * The assessment's `training` input: `{ current, baselinePeriods }` for the
 * period and the four preceding Sunday–Saturday weeks, or null when there is
 * no canonical training evidence at all.
 */
export function projectRecoveryTrainingContextV1({ canonicalEvidenceObjects = [], period, evidenceCutoff } = {}) {
  const window = normalizeWindow(period, evidenceCutoff);
  const days = new Map();
  for (const item of list(canonicalEvidenceObjects)) {
    if (item?.quality?.status === "superseded") continue;
    const payload = item?.payload ?? item;
    if (!isResistanceTrainingSession(payload)) continue;
    const date = String(payload.observed_at ?? item.lastObservedAt ?? "").slice(0, 10);
    if (!isDate(date) || date > window.endDate) continue;
    // Recorded after the cutoff = not known at generation time.
    const recordedAt = item.createdAt ?? item.ingestedAt ?? payload.ingested_at ?? null;
    if (recordedAt != null && knownByCutoff(recordedAt, window) === false) continue;
    days.set(date, [...(days.get(date) ?? []), String(item.id ?? payload.id ?? `training:${date}`)]);
  }
  if (!days.size) return null;
  const range = (startDate, endDate) => {
    const dates = [...days.keys()].filter((date) => date >= startDate && date <= endDate).sort();
    return { completedSessions: dates.length, evidenceIds: dates.flatMap((date) => days.get(date)).sort() };
  };
  const current = range(window.startDate, window.endDate);
  const baselinePeriods = [];
  const weeks = RECOVERY_STATUS_POLICY_V1.training.baselineComparablePeriods;
  const anchor = sunday(window.startDate);
  for (let index = weeks; index >= 1; index -= 1) {
    const startDate = shift(anchor, -7 * index);
    const endDate = shift(startDate, 6);
    // A week overlapping the period itself is never its own baseline.
    if (endDate >= window.startDate) continue;
    baselinePeriods.push({ id: `training_week:${startDate}`, startDate, endDate, comparable: true, ...range(startDate, endDate) });
  }
  return {
    current: {
      periodStartDate: window.startDate,
      periodEndDate: window.endDate,
      completedSessions: current.completedSessions,
      evidenceIds: current.evidenceIds,
      // Decision 6: corroborated Red stays disabled; no constraint is ever
      // asserted, and no performance claim is made without performance evidence.
      materialConstraint: false,
      performanceHeld: false,
      temporalRelation: null,
      context: {},
    },
    baselinePeriods,
  };
}

function resolveSchedule({ reminder, execution }) {
  const refuse = (reason) => ({ authoritative: false, reason });
  if (reminder.active === false || (execution && execution.active === false)) {
    return refuse("foam_schedule_inactive");
  }
  const preferred = execution?.preferredSchedule ?? {};
  const startDate = [preferred.startDate, preferred.anchorDate, reminder.schedule?.startDate, reminder.schedule?.anchorDate]
    .find(isDate) ?? null;
  if (!startDate) return refuse("foam_schedule_effective_date_unavailable");
  const endDate = [preferred.endDate, reminder.schedule?.endDate].find(isDate) ?? null;
  const schedule = reminder.schedule ?? {};
  const kind = String(schedule.cadence ?? schedule.type ?? "").toLowerCase();
  const days = new Set([...(Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : []), schedule.dayOfWeek]
    .map((day) => String(day ?? "").toLowerCase()).filter((day) => WEEKDAYS.includes(day)));
  let occursOn;
  if (kind === "daily") {
    occursOn = () => true;
  } else if (["weekly", "weekly_days", "specific_days"].includes(kind) && days.size) {
    occursOn = (date) => days.has(WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]);
  } else if (kind === "every_x_days") {
    const interval = Number(schedule.interval ?? preferred.intervalDays);
    const anchor = [schedule.anchorDate, preferred.anchorDate, startDate].find(isDate);
    if (!Number.isInteger(interval) || interval < 1) return refuse("foam_schedule_shape_unsupported");
    occursOn = (date) => daysBetween(anchor, date) >= 0 && daysBetween(anchor, date) % interval === 0;
  } else {
    return refuse("foam_schedule_shape_unsupported");
  }
  return { authoritative: true, startDate, endDate, occursOn };
}

function history(reminder) {
  const entries = Array.isArray(reminder.completionHistory)
    ? reminder.completionHistory
    : reminder.completionHistory ? [reminder.completionHistory] : [];
  // A legacy single `completedAt` is a completion only when no history entry
  // already covers it.
  return reminder.completedAt && !entries.some((entry) => entry?.completedAt === reminder.completedAt)
    ? [...entries, { completedAt: reminder.completedAt }]
    : entries;
}

function completionDate(entry, timeZone) {
  const explicit = String(entry?.occurrenceDate ?? entry?.occurrence_date ?? entry?.evidenceDate ?? entry?.evidence_date ?? "").slice(0, 10);
  if (isDate(explicit)) return explicit;
  const instant = instantOf(entry?.completedAt, timeZone);
  return instant ? localDate(instant, timeZone) : null;
}

// true = recorded at or before the cutoff; false = after it; null = unknown.
function knownByCutoff(value, window) {
  const instant = instantOf(value, window.timeZone);
  return instant ? instant <= window.cutoff : null;
}

function instantOf(value, timeZone) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (ZONED.test(text) && Number.isFinite(Date.parse(text))) return new Date(text).toISOString();
  const naive = NAIVE.exec(text);
  if (!naive) return null;
  try {
    const time = naive[2].length === 5 ? `${naive[2]}:00` : naive[2];
    return localDateTimeToUtc({ date: naive[1], time, timeZone }).toISOString();
  } catch {
    return null;
  }
}

function normalizeWindow(period, evidenceCutoff) {
  if (!isDate(period?.startDate) || !isDate(period?.endDate) || period.startDate > period.endDate) {
    throw new Error("Recovery execution context requires a closed period.");
  }
  const timeZone = String(period.timeZone ?? "").trim();
  if (!timeZone) throw new Error("Recovery execution context requires a timezone.");
  if (typeof evidenceCutoff !== "string" || !Number.isFinite(Date.parse(evidenceCutoff))) {
    throw new Error("Recovery execution context requires an evidence cutoff.");
  }
  const cutoff = new Date(evidenceCutoff).toISOString();
  return {
    startDate: period.startDate, endDate: period.endDate, timeZone, cutoff,
    cutoffLocalDate: localDate(cutoff, timeZone),
  };
}

function localDate(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(instant));
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function result(foamRolling, accounting, limitations) {
  return {
    version: RECOVERY_EXECUTION_CONTEXT_PROJECTION_VERSION,
    foamRolling,
    accounting,
    limitations: [...new Set(limitations)].sort(),
  };
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function isDate(value) {
  if (!DATE.test(String(value ?? ""))) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function shift(value, amount) {
  return new Date(Date.parse(`${value}T12:00:00Z`) + amount * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(left, right) {
  return Math.round((Date.parse(`${right}T12:00:00Z`) - Date.parse(`${left}T12:00:00Z`)) / DAY_MS);
}

function sunday(value) {
  return shift(value, -new Date(`${value}T12:00:00Z`).getUTCDay());
}
