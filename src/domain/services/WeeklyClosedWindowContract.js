import { getLocalDateKey } from "../utils/localDate";

export const WEEKLY_CLOSED_WINDOW_CONTRACT_VERSION = "weekly_closed_window_v1";
export const CANONICAL_WEEKLY_TIME_ZONE = "America/Los_Angeles";

export function createWeeklyClosedWindowContract(input = {}, { now = new Date() } = {}) {
  const source = {
    cadence: input.cadence ?? "weekly",
    startDate: input.startDate,
    endDate: input.endDate,
    timeZone: input.timeZone ?? CANONICAL_WEEKLY_TIME_ZONE,
    briefingDate: input.briefingDate,
    expectedArtifactId: input.expectedArtifactId ?? null,
    source: input.source ?? "manual_catch_up",
    reason: input.reason ?? "missed_weekly_run",
    idempotencyKey: input.idempotencyKey ?? null,
  };
  const validation = validateWeeklyClosedWindowContract(source, { now });
  if (!validation.valid) return { status: validation.status, errors: validation.errors, contract: null };
  return { status: "valid", errors: [], contract: validation.contract };
}

export function validateWeeklyClosedWindowContract(input = {}, { now = new Date() } = {}) {
  const errors = [];
  if (input.cadence !== "weekly") errors.push("cadence_must_be_weekly");
  if (!isDateKey(input.startDate)) errors.push("invalid_start_date");
  if (!isDateKey(input.endDate)) errors.push("invalid_end_date");
  if (!isDateKey(input.briefingDate)) errors.push("invalid_briefing_date");
  if (!validTimeZone(input.timeZone) || input.timeZone !== CANONICAL_WEEKLY_TIME_ZONE) {
    errors.push("invalid_timezone");
  }
  if (errors.length) return invalid(errors);

  if (weekday(input.startDate) !== 0) errors.push("start_must_be_sunday");
  if (weekday(input.endDate) !== 6) errors.push("end_must_be_saturday");
  if (shiftDate(input.startDate, 6) !== input.endDate) errors.push("window_must_span_seven_days");
  if (shiftDate(input.endDate, 1) !== input.briefingDate) errors.push("briefing_date_must_follow_window");

  const localToday = localDate(now, input.timeZone);
  if (input.endDate >= localToday) errors.push("window_not_closed");
  if (errors.length) {
    return {
      status: errors.includes("window_not_closed") ? "window_not_closed" : "invalid_window",
      valid: false,
      errors,
      contract: null,
    };
  }

  const artifactId = artifactIdForWeeklyWindow(input.startDate, input.endDate);
  if (input.expectedArtifactId && input.expectedArtifactId !== artifactId) {
    return { status: "artifact_identity_mismatch", valid: false, errors: ["artifact_identity_mismatch"], contract: null };
  }
  const window = {
    id: `weekly:${input.startDate}:${input.endDate}:${input.timeZone}`,
    cadence: "weekly",
    briefingDate: input.briefingDate,
    date: input.endDate,
    startDate: input.startDate,
    endDate: input.endDate,
    start: `${input.startDate}T00:00:00`,
    end: `${input.endDate}T23:59:59.999`,
    relativeLabel: "this completed week",
    sameDayEvidenceExcluded: true,
    timeZone: input.timeZone,
    closed: true,
  };
  return {
    status: "valid",
    valid: true,
    errors: [],
    contract: {
      contractVersion: WEEKLY_CLOSED_WINDOW_CONTRACT_VERSION,
      ...input,
      expectedArtifactId: artifactId,
      window,
    },
  };
}

export function artifactIdForWeeklyWindow(startDate, endDate) {
  return `weekly_briefing_${startDate}_${endDate}`;
}

function invalid(errors) {
  return { status: "invalid_window", valid: false, errors, contract: null };
}
function isDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function weekday(value) { return new Date(`${value}T12:00:00Z`).getUTCDay(); }
function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function validTimeZone(value) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date()); return true; }
  catch { return false; }
}
function localDate(value, timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(value);
  } catch {
    return getLocalDateKey(value);
  }
}
