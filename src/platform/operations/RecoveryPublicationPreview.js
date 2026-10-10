import {
  assertRecoveryCadenceInvariantV1,
  attachRecoveryAssessmentV1,
  composeRecoveryAssessmentForBriefingV1,
  preflightRecoveryPublicationV1,
  projectRecoveryCardForNativeV1,
  resolveRecoveryBriefingPublicationAuthorityV1,
  validateBriefingRecoveryAssessmentV1,
} from "../../domain/services/RecoveryBriefingPublicationV1.js";
import { RECOVERY_STATUS_POLICY_V1 } from "../../domain/services/RecoveryBriefingPolicyV1.js";
import { projectRecoverySleepInputsV1 } from "../../domain/services/RecoveryBriefingSleepInputProjectionV1.js";
import { sleepDayWindowEndMs } from "../../domain/services/HealthKitSleepContract.js";
import { createMonthlyEvidenceWindow, createWeeklyEvidenceWindow } from "../../domain/services/BriefingEvidenceWindowService.js";
import { createRecoverySleepInputReaderV1 } from "../database/RecoverySleepInputReaderV1.js";
import { RECOVERY_PUBLICATION_AUTHORITY_PROPOSAL_V1 } from "./RecoveryPublicationAuthorityRunner.js";

/**
 * Zero-write Recovery publication preview and eligibility checkpoint.
 *
 * Runs the DEPLOYED Recovery code path (Sleep input reader -> projection ->
 * publication-mode assessment -> envelope -> Native card projection) against
 * real canonical data under a SIMULATED, in-memory authority built from the
 * proposed activation values. The simulated authority is never written. Output
 * is sanitized: counts, state codes, Server-authored copy and validation
 * results only; no sleep duration, stage, time or other health value leaves.
 *
 *   checkpoint  as-of-now baseline/period accounting for a target occurrence
 *               (period may still be open), and the decision it implies.
 *   preview     the card a target occurrence would carry. Allowed once every
 *               period sleep-day window has closed (endDate 18:00 local); the
 *               result is `provisional` until the briefing's own cutoff
 *               (endDate 23:59:59 local), because foam/training for the final
 *               day may still be recorded.
 */
export const RecoveryPreviewKind = Object.freeze({ CHECKPOINT: "checkpoint", PREVIEW: "preview" });

const SIMULATED_REFERENCE = "preview-simulation-never-written";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function runRecoveryPublicationPreview({
  records,
  ownerUserId,
  kind = RecoveryPreviewKind.CHECKPOINT,
  cadence,
  startDate,
  endDate,
  timeZone = "America/Los_Angeles",
  proposal = RECOVERY_PUBLICATION_AUTHORITY_PROPOSAL_V1,
  now = () => new Date(),
} = {}) {
  if (!ownerUserId) throw previewError("An owner is required.", "OWNER_REQUIRED");
  if (!Object.values(RecoveryPreviewKind).includes(kind)) throw previewError("Unknown preview kind.", "PREVIEW_KIND_INVALID");
  const at = now();
  const window = buildWindow({ cadence, startDate, endDate, timeZone });
  if (window.refusal) return Object.freeze({ outcome: "refused", reasons: [window.refusal] });

  const reader = createRecoverySleepInputReaderV1({ records, ownerUserId });
  const liveAuthority = resolveRecoveryBriefingPublicationAuthorityV1(await reader.readAuthorityRecord());
  const authority = resolveRecoveryBriefingPublicationAuthorityV1({
    schemaVersion: "recovery_briefing_publication_authority_v1",
    status: "enabled",
    cadences: [...proposal.cadences],
    effectiveFromPeriodStart: proposal.effectiveFromPeriodStart,
    recoveryEffectiveSleepDay: proposal.recoveryEffectiveSleepDay,
    strategicEvidenceEligibility: "excluded",
    historicalBackfill: false,
    artifactRewrite: false,
    publishBeforeBaselineEligible: false,
    authorizationRef: SIMULATED_REFERENCE,
  });
  const common = {
    kind,
    cadence,
    period: { startDate: window.value.startDate, endDate: window.value.endDate, timeZone },
    evaluatedAt: at.toISOString(),
    liveAuthority: { enabled: liveAuthority.enabled, invalidReason: liveAuthority.invalidReason },
    simulatedAuthority: { written: false, enabled: authority.enabled, cadences: authority.cadences,
      effectiveFromPeriodStart: authority.effectiveFromPeriodStart, recoveryEffectiveSleepDay: authority.recoveryEffectiveSleepDay },
  };

  const readRange = { startDate: shift(window.value.startDate, -RECOVERY_STATUS_POLICY_V1.baseline.lookbackNights), endDate: window.value.endDate };
  const sleepInputs = await reader.readSleepInputs({ ownerUserId, ...readRange });
  const lastClosedSleepDay = latestClosedSleepDay(at, timeZone);

  if (kind === RecoveryPreviewKind.CHECKPOINT) {
    const projection = projectRecoverySleepInputsV1({
      ...sleepInputs,
      recoveryEffectiveSleepDay: authority.recoveryEffectiveSleepDay,
      period: { cadence, startDate: window.value.startDate, endDate: window.value.endDate },
      evidenceCutoff: at.toISOString(),
      ownerUserId,
    });
    if (projection.status !== "projected") {
      return Object.freeze({ outcome: "blocked", ...common, reasons: [projection.blockedReason] });
    }
    return Object.freeze({ outcome: "checkpoint", ...common, lastClosedSleepDay,
      ...checkpointDecision({ projection, cadence, lastClosedSleepDay }), ledger: ledgerOf(projection) });
  }

  // PREVIEW: every period sleep-day window must have closed.
  const sleepFinalAt = sleepDayWindowEndMs(window.value.endDate, timeZone);
  if (at.getTime() < sleepFinalAt) {
    return Object.freeze({ outcome: "refused", ...common, reasons: ["period_sleep_windows_open"],
      earliestPreviewAt: new Date(sleepFinalAt).toISOString() });
  }
  const provisional = at.getTime() < Date.parse(window.value.cutoff);
  const effectiveWindow = provisional ? { ...window.value, cutoff: at.toISOString() } : window.value;
  const preflight = preflightRecoveryPublicationV1({ authority, cadence, window: effectiveWindow });
  if (!preflight.proceed) return Object.freeze({ outcome: "refused", ...common, reasons: [preflight.reason] });

  // The generator's snapshot repositories filter each list to the owner's own
  // `userId`; mirror that exactly. (The production snapshot additionally overlays
  // graduated HealthKit activity/nutrition days, cardio workouts and Sleep nights
  // into canonicalEvidenceObjects; the training projection counts resistance
  // sessions only, so those overlays do not change this context.)
  const owned = (rows) => (rows ?? []).filter((item) => item?.userId === ownerUserId);
  const [reminders, executionItems, dailyCheckIns, canonicalEvidenceObjects] = (await Promise.all([
    records.list({ ownerUserId, collection: "reminders" }),
    records.list({ ownerUserId, collection: "executionItems" }),
    records.list({ ownerUserId, collection: "dailyCheckIns" }),
    records.list({ ownerUserId, collection: "canonicalEvidenceObjects" }),
  ])).map(owned);
  const artifactId = `recovery-preview:${window.value.id}`;
  const decision = composeRecoveryAssessmentForBriefingV1({
    authority, cadence, window: effectiveWindow, artifactId, ownerUserId,
    evaluatedAt: at.toISOString(), sleepInputs,
    executionInputs: { reminders, executionItems, dailyCheckIns, canonicalEvidenceObjects },
  });
  const projection = projectRecoverySleepInputsV1({
    ...sleepInputs,
    recoveryEffectiveSleepDay: authority.recoveryEffectiveSleepDay,
    period: { cadence, startDate: window.value.startDate, endDate: window.value.endDate },
    evidenceCutoff: preflight.evidenceCutoff,
    ownerUserId,
  });
  const base = { ...common, provisional, effectiveCutoff: preflight.evidenceCutoff, ledger: ledgerOf(projection),
    eligibility: projection.status === "projected" ? eligibilityOf(projection, cadence) : null };
  if (!decision.attach) {
    return Object.freeze({ outcome: "no_card", ...base, reason: decision.reason, detail: decision.detail ?? null });
  }
  const artifact = {
    id: artifactId, userId: ownerUserId, cadence, artifactType: "scheduled",
    evidenceWindow: { id: window.value.id, startDate: window.value.startDate, endDate: window.value.endDate, timeZone },
    briefing: {},
  };
  const attached = attachRecoveryAssessmentV1(artifact, decision);
  const card = projectRecoveryCardForNativeV1(attached);
  const envelope = decision.recoveryAssessment;
  return Object.freeze({
    outcome: "card",
    ...base,
    card: sanitizeCard(card, envelope),
    validation: {
      envelopeValid: passes(() => validateBriefingRecoveryAssessmentV1(envelope, { cadence, artifactId, evidenceWindow: artifact.evidenceWindow })),
      cadenceInvariant: passes(() => assertRecoveryCadenceInvariantV1(attached)),
      nativeProjectionPresent: Boolean(card),
      nativeDecoder: checkRecoveryNativeCardContractV1(card, { cadence, startDate: window.value.startDate, endDate: window.value.endDate }),
      isolation: envelope.isolation,
      excludedCadencesRefused: {
        midweek: refuses(() => assertRecoveryCadenceInvariantV1({ ...attached, cadence: "midweek" })),
        dexaEvent: refuses(() => assertRecoveryCadenceInvariantV1({ ...attached, artifactType: "event", eventType: "dexa" })),
        photoEvent: refuses(() => assertRecoveryCadenceInvariantV1({ ...attached, artifactType: "event", eventType: "photo" })),
      },
      foamCannotSetStatus: envelope.assessment.policy.foamCanSetStatus === false,
      confidenceCoupling: envelope.assessment.policy.confidenceCoupling,
      trainingCorroborationPublished: envelope.assessment.corroboration.length > 0,
    },
  });
}

/**
 * The Swift `BriefingRecoveryCardDecoder` guards (Build 93/94, 766bd9dc), in
 * JS, so a Server-produced card is checked against what the shipped app will
 * actually accept. Any failure means the app would silently show no card.
 */
export function checkRecoveryNativeCardContractV1(card, { cadence, startDate, endDate } = {}) {
  const failures = [];
  const fail = (code) => { failures.push(code); };
  if (!card) return { ok: false, failures: ["card_absent"] };
  if (card.schemaVersion !== "recovery_card_v1") fail("schema_version");
  if (card.presentation !== "single_recovery_card_v1") fail("presentation");
  if (card.cadence !== cadence || !["weekly", "monthly"].includes(cadence)) fail("cadence");
  if (!String(card.assessmentId ?? "").trim()) fail("assessment_id");
  const status = card.status?.state;
  if (!["green", "yellow", "red", "unavailable"].includes(status)) fail("status");
  const start = card.period?.startDate;
  const end = card.period?.endDate;
  if (start !== startDate || end !== endDate) fail("period_window_mismatch");
  const days = DATE.test(String(start)) && DATE.test(String(end)) ? dayCount(start, end) : -1;
  const granularity = card.sleep?.trend?.granularity;
  if (cadence === "weekly" && (days !== 7 || weekday(start) !== 0 || granularity !== "night")) fail("weekly_shape");
  if (cadence === "monthly" && (start?.slice(8) !== "01" || shift(end, 1).slice(8) !== "01" || days < 28 || days > 31 || granularity !== "week")) fail("monthly_shape");
  const expected = card.period?.expectedNights;
  const observed = card.period?.observedNights;
  if (!isCount(expected) || expected !== days || !isCount(observed) || observed > expected) fail("night_counts");
  if (!isMinutes(card.sleep?.baselineMinutes)) fail("baseline_minutes");
  const baselineNights = card.sleep?.baselineNights;
  if (!isCount(baselineNights) || baselineNights < 14 || baselineNights > 28) fail("baseline_nights");
  if (card.sleep?.baselineLookbackNights !== undefined && card.sleep.baselineLookbackNights !== 28) fail("baseline_lookback");
  const average = card.sleep?.averageMinutes;
  if (average !== null && average !== undefined && !isMinutes(average)) fail("average_minutes");
  if (status !== "unavailable" && !isMinutes(average)) fail("average_required");
  const delta = card.sleep?.deltaFromBaselineMinutes;
  if (status !== "unavailable" && typeof delta === "number" && (!Number.isFinite(delta) || Math.abs(delta) > 1440)) fail("delta");
  const points = Array.isArray(card.sleep?.trend?.points) ? card.sleep.trend.points : null;
  if (!points) fail("trend_points");
  else {
    let previous = null;
    for (const point of points) {
      if (!DATE.test(String(point?.label)) || !isMinutes(point?.totalSleepMinutes)) { fail("trend_point_invalid"); break; }
      if (previous && point.label <= previous) { fail("trend_point_order"); break; }
      if (granularity === "night" && (point.label < start || point.label > end)) { fail("trend_night_outside_period"); break; }
      if (granularity === "week" && (weekday(point.label) !== 0 || point.label > end || dayCount(point.label, start) > 7)) { fail("trend_week_anchor"); break; }
      previous = point.label;
    }
    if (granularity === "night" && points.length !== observed) fail("trend_night_count");
    if (granularity === "week" && (points.length > 6 || (observed > 0 && points.length === 0))) fail("trend_week_count");
    if (status !== "unavailable" && points.length === 0) fail("trend_empty");
  }
  const commentary = card.commentary;
  const commentaryShown = (status === "yellow" || status === "red") && commentary?.visible === true &&
    bounded(commentary?.headline) && bounded(commentary?.body);
  if ((status === "yellow" || status === "red") && commentary?.visible === true && !commentaryShown) fail("commentary_unrenderable");
  const foam = card.foamRolling;
  let foamShown = false;
  if (["on_track", "mixed"].includes(foam?.state)) {
    const { scheduledOccurrences: scheduled, completedOccurrences: completed } = foam;
    const excused = foam.excusedOccurrences ?? 0;
    const missed = foam.missedOccurrences ?? (scheduled - completed - excused);
    foamShown = isCount(scheduled) && scheduled > 0 && isCount(completed) && completed <= scheduled &&
      missed >= 0 && completed + missed + excused === scheduled && (foam.state === "mixed") === (missed > 0);
    if (!foamShown) fail("foam_split_rejected");
  }
  return { ok: failures.length === 0, failures, rendersCommentary: Boolean(commentaryShown), rendersFoamRow: foamShown };
}

function checkpointDecision({ projection, cadence, lastClosedSleepDay }) {
  const baseline = projection.accounting.baseline;
  const period = projection.accounting.period;
  const required = RECOVERY_STATUS_POLICY_V1.baseline.minimumUsableNights;
  const periodRequired = RECOVERY_STATUS_POLICY_V1.cadences[cadence].minimumPeriodNights;
  const baselineEnd = projection.windows.baseline.endDate;
  const pendingBaselineNights = projection.ledger.filter((item) => item.window === "baseline" &&
    item.sleepDay > lastClosedSleepDay && item.state === "missing").length;
  const maximumBaseline = baseline.reliableNights + pendingBaselineNights;
  const decision = baseline.reliableNights >= required
    ? "baseline_eligible"
    : maximumBaseline >= required ? "baseline_pending" : "baseline_cannot_qualify_defer";
  return {
    decision,
    baselineWindow: projection.windows.baseline,
    baselineRequiredNights: required,
    baseline,
    pendingBaselineNights,
    maximumPossibleBaselineNights: maximumBaseline,
    additionalFailuresTolerated: Math.max(0, maximumBaseline - required),
    baselineFinal: lastClosedSleepDay >= baselineEnd,
    periodRequiredNights: periodRequired,
    period,
    note: "Period coverage is required separately: fewer reliable period nights than required publishes a Not enough data card, not a status.",
  };
}

function eligibilityOf(projection, cadence) {
  return {
    baselineWindow: projection.windows.baseline,
    baselineRequiredNights: RECOVERY_STATUS_POLICY_V1.baseline.minimumUsableNights,
    baseline: projection.accounting.baseline,
    periodRequiredNights: RECOVERY_STATUS_POLICY_V1.cadences[cadence].minimumPeriodNights,
    period: projection.accounting.period,
  };
}

function ledgerOf(projection) {
  return (projection.ledger ?? [])
    .filter((item) => item.state !== "before_prospective_floor")
    .map((item) => ({ window: item.window, sleepDay: item.sleepDay, state: item.state, reason: item.reason }));
}

// Card summary without any sleep value: states, counts, copy and limitation codes.
function sanitizeCard(card, envelope) {
  return {
    status: card.status,
    period: { expectedNights: card.period.expectedNights, observedNights: card.period.observedNights },
    baselineNights: card.sleep.baselineNights,
    trend: { granularity: card.sleep.trend.granularity, points: card.sleep.trend.points.length },
    commentary: card.commentary,
    foamRolling: card.foamRolling,
    statusReasonCodes: envelope.assessment.status.reasonCodes,
    dataLimitations: card.dataLimitations,
    integrity: envelope.integrity.algorithm,
  };
}

function buildWindow({ cadence, startDate, endDate, timeZone }) {
  if (!["weekly", "monthly"].includes(cadence)) return { refusal: "cadence_excluded" };
  if (!isDate(startDate) || !isDate(endDate)) return { refusal: "period_dates_invalid" };
  // The production window builders, invoked at the occurrence's own delivery day.
  const value = cadence === "weekly"
    ? createWeeklyEvidenceWindow({ now: new Date(`${shift(endDate, 1)}T19:00:00.000Z`), timeZone })
    : createMonthlyEvidenceWindow({ now: new Date(`${shift(endDate, 1)}T19:00:00.000Z`), timeZone });
  if (value.startDate !== startDate || value.endDate !== endDate) return { refusal: "period_is_not_a_cadence_window" };
  if (cadence === "weekly" && weekday(startDate) !== 0) return { refusal: "period_is_not_a_cadence_window" };
  return { value };
}

function latestClosedSleepDay(at, timeZone) {
  let day = localDateOf(at, timeZone);
  while (sleepDayWindowEndMs(day, timeZone) > at.getTime()) day = shift(day, -1);
  return day;
}

function isDate(value) {
  if (!DATE.test(String(value ?? ""))) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function passes(callback) {
  try { callback(); return true; } catch { return false; }
}

function refuses(callback) {
  return !passes(callback);
}

function bounded(value) {
  const text = String(value ?? "").trim();
  return text.length > 0 && text.length <= 400;
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0 && value <= 10_000;
}

function isMinutes(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1440;
}

function dayCount(start, end) {
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1;
}

function weekday(value) {
  return new Date(`${value}T12:00:00Z`).getUTCDay();
}

function shift(value, amount) {
  return new Date(Date.parse(`${value}T12:00:00Z`) + amount * 86_400_000).toISOString().slice(0, 10);
}

function localDateOf(instant, timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

function previewError(message, code) {
  return Object.assign(new Error(message), { code });
}
