// Phase A (shadow): timeline feasibility with a live runway.
//
// The persisted V3 trajectory freezes `timeRemainingDays` at the last outcome
// measurement, so between scans the displayed runway never shrinks. This
// correction keeps the measured pace evidence-only (it is never extrapolated
// into "measured" progress) and reports two views:
// - measured basis: last measured remaining requirement against the days that
//   are actually left;
// - projected at measured pace: where the last measured pace would land
//   relative to the deadline.
// Only a projected-pace shortfall is a trajectory finding. A measured-basis
// shortfall alone means the pace has not been verified recently.

export const ScheduleState = Object.freeze({
  COMPLETE: "complete",
  AHEAD_WITH_RESERVE: "ahead_with_reserve",
  AT_RISK: "at_risk",
  DEADLINE_PASSED: "deadline_passed",
  NOT_APPLICABLE: "not_applicable",
  NOT_MEASURABLE: "not_measurable",
});

export function correctScheduleForElapsedTime(trajectory, { asOf, atRiskRatio = 1, minimumEvidenceSpanDays = 0 } = {}) {
  requireDate(asOf, "asOf");
  if (!trajectory || trajectory.supported === false) return unavailable(asOf, "trajectory_unavailable");
  const deadlineAt = dateOnly(trajectory.deadlineAt);
  const remaining = number(trajectory.remainingRequirement);
  if (remaining === 0) return result({ asOf, deadlineAt, state: ScheduleState.COMPLETE, measured: ScheduleState.COMPLETE });
  if (!deadlineAt) return unavailable(asOf, "no_deadline_declared");
  const measuredAt = dateOnly(trajectory.outlookAsOf ?? trajectory.forecastAt ?? trajectory.measuredAt);
  const forecastRemaining = number(trajectory.forecastRemainingRequirement) ?? remaining;
  const rate = number(trajectory.discountedRate);
  const daysLeft = daysBetween(asOf, deadlineAt);
  const daysFromMeasurement = measuredAt ? daysBetween(measuredAt, deadlineAt) : null;
  const elapsedSinceMeasurement = measuredAt ? Math.max(0, daysBetween(measuredAt, asOf)) : null;
  if (rate == null || forecastRemaining == null) return unavailable(asOf, "measured_pace_unavailable", { deadlineAt, timeRemainingDays: daysLeft });
  const span = number(trajectory.intervalDays);
  if (span != null && span < minimumEvidenceSpanDays) {
    return unavailable(asOf, "pace_not_established_measurement_span_too_short", { deadlineAt, timeRemainingDays: daysLeft, measurementSpanDays: span, minimumEvidenceSpanDays });
  }

  const projectedDays = rate > 0 ? forecastRemaining / rate : Infinity;
  const projectedCompletionDate = Number.isFinite(projectedDays) && measuredAt ? addDays(measuredAt, Math.ceil(projectedDays)) : null;
  const projectedRatio = daysFromMeasurement > 0 ? rate / (forecastRemaining / daysFromMeasurement) : 0;
  const measuredRequiredRate = daysLeft > 0 ? forecastRemaining / daysLeft : null;
  const measuredRatio = measuredRequiredRate ? rate / measuredRequiredRate : 0;

  const projectedState = daysLeft <= 0 ? ScheduleState.DEADLINE_PASSED : projectedRatio >= atRiskRatio ? ScheduleState.AHEAD_WITH_RESERVE : ScheduleState.AT_RISK;
  const measuredState = daysLeft <= 0 ? ScheduleState.DEADLINE_PASSED : measuredRatio >= atRiskRatio ? ScheduleState.AHEAD_WITH_RESERVE : ScheduleState.AT_RISK;
  return result({
    asOf,
    deadlineAt,
    state: projectedState,
    measured: measuredState,
    timeRemainingDays: daysLeft,
    measuredAt,
    elapsedSinceMeasurementDays: elapsedSinceMeasurement,
    remainingRequirement: round(forecastRemaining),
    measuredRate: round(rate),
    requiredRate: measuredRequiredRate == null ? null : round(measuredRequiredRate),
    measuredBasisRatio: round(measuredRatio),
    projectedAtPaceRatio: round(projectedRatio),
    projectedCompletionDate,
    storedTimeRemainingDays: number(trajectory.timeRemainingDays),
    storedScheduleState: trajectory.scheduleState ?? null,
    paceUnverified: measuredState === ScheduleState.AT_RISK && projectedState !== ScheduleState.AT_RISK,
    uncertainty: [
      "measured_pace_is_not_a_promise",
      ...(elapsedSinceMeasurement > 0 ? ["progress_since_last_measurement_is_unmeasured"] : []),
    ],
  });
}

export function localDateInZone(isoTimestamp, timeZone) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(isoTimestamp ?? ""))) return isoTimestamp;
  const date = new Date(isoTimestamp);
  if (!Number.isFinite(date.getTime())) throw new TypeError("A valid timestamp is required.");
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function daysBetween(start, end) {
  return Math.round((Date.parse(`${dateOnly(end)}T00:00:00Z`) - Date.parse(`${dateOnly(start)}T00:00:00Z`)) / 86400000);
}

export function addDays(date, days) {
  const value = new Date(`${dateOnly(date)}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function result(fields) {
  const { state, measured, ...rest } = fields;
  return Object.freeze({
    basis: "elapsed_runway_measured_pace_unchanged",
    scheduleState: state,
    measuredBasisState: measured,
    ...rest,
  });
}
function unavailable(asOf, reason, extra = {}) {
  return Object.freeze({ basis: "elapsed_runway_measured_pace_unchanged", scheduleState: ScheduleState.NOT_MEASURABLE, measuredBasisState: ScheduleState.NOT_MEASURABLE, asOf, reason, paceUnverified: false, ...extra });
}
function dateOnly(value) { return value == null ? null : String(value).slice(0, 10); }
function number(value) { return value == null || !Number.isFinite(Number(value)) ? null : Number(value); }
function round(value) { return value == null || !Number.isFinite(value) ? null : Math.round(value * 10000) / 10000; }
function requireDate(value, field) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) throw new TypeError(`${field} must be a YYYY-MM-DD local date.`);
}
