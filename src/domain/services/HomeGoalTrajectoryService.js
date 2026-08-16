import { expectedPhaseReviewDate, PHASE_DATE_ARITHMETIC_CONVENTION } from "./GoalPhaseTimelineIntegrityService";
import { isActivePhaseStatus, isPlannedPhaseStatus } from "../models/canonicalGoalPhase";
import { projectFounderBuildLeanMassPhaseCorrection } from "./FounderPhaseCorrectionService";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function resolveHomeGoalTrajectory({ activeGoal, phases, currentDate = new Date(), timeZone = "UTC", evidenceSummary = {}, dexaScans = [] } = {}) {
  const correctedGoal = projectFounderBuildLeanMassPhaseCorrection(activeGoal);
  const explicitPhases = Array.isArray(phases) ? phases : correctedGoal?.phases;
  if (!correctedGoal || !Array.isArray(explicitPhases) || explicitPhases.length === 0) {
    return freeze({ hasExplicitPhases: false, legacyFallbackUsed: true, blockingReasons: [], warnings: [] });
  }

  const ordered = [...explicitPhases].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
  const active = ordered.filter((phase) => isActivePhaseStatus(phase.status));
  const blockingReasons = active.length === 1 ? [] : [active.length ? "MULTIPLE_ACTIVE_PHASES" : "ACTIVE_PHASE_MISSING"];
  const today = localDate(currentDate, timeZone);
  const activePhase = active.length === 1 ? phaseSummary(active[0], today) : null;
  const targetDescription = correctedGoal.target?.description ?? null;
  const journeyStartDate = validDate(correctedGoal.timeline?.startDate) ? correctedGoal.timeline.startDate : null;
  const overallTargetDate = validDate(correctedGoal.target?.targetDate)
    ? correctedGoal.target.targetDate
    : validDate(correctedGoal.timeline?.targetDate) ? correctedGoal.timeline.targetDate : null;
  const overallRange = dateRange(journeyStartDate, overallTargetDate, today);
  const confidence = confidenceSummary({
    evidenceSummary,
    timelineValid: Boolean(activePhase?.timelineValidity && journeyStartDate && overallTargetDate),
    ambitious: isAmbitious(correctedGoal),
    hasPhaseOutcomeEvidence: Boolean(evidenceSummary.phaseOutcomeEvidence),
  });

  const phaseResults = ordered.map((phase) => phaseSummary(phase, today,
    outcomeProgressForPhase({ activeGoal: correctedGoal, phase, dexaScans, journeyStartDate }),
    phaseBaselineForPhase(phase, dexaScans)));
  const goalProgress = phaseResults.find((phase) => phase.progress?.progressType === "outcome")?.progress ?? null;
  return freeze({
    overallGoal: {
      goalId: correctedGoal.id,
      goalName: correctedGoal.title ?? correctedGoal.name ?? "Current Goal",
      goalOutcome: correctedGoal.primaryOutcome ?? null,
      targetDescription,
      goalBaseline: goalProgress?.baselineDate ? { date: goalProgress.baselineDate,
        value: goalProgress.baselineValue, unit: goalProgress.unit } : null,
      journeyStartDate,
      overallTargetDate,
      sharedGuardrails: (correctedGoal.guardrails ?? []).filter((item) => item.accepted !== false).map((item) => item.text).filter(Boolean),
      destinationCompleteness: targetDescription && journeyStartDate && overallTargetDate ? "complete" : "incomplete",
      overallDaysElapsed: overallRange?.elapsedDays ?? null,
      overallDaysRemaining: overallRange?.remainingDays ?? null,
    },
    activePhase: phaseResults.find((phase) => isActivePhaseStatus(phase.status)) ?? activePhase,
    goalProgress,
    upcomingPhases: phaseResults.filter((phase) => isPlannedPhaseStatus(phase.status)),
    phases: phaseResults,
    confidence,
    hasExplicitPhases: true,
    legacyFallbackUsed: false,
    blockingReasons,
    warnings: activePhase?.timelineWarnings ?? [],
    dateConvention: PHASE_DATE_ARITHMETIC_CONVENTION,
  });
}

function phaseSummary(phase, today, outcomeProgress = null, phaseBaseline = null) {
  const plannedReviewDate = expectedPhaseReviewDate(phase);
  const timeline = isPlannedPhaseStatus(phase.status)
    ? upcomingTimeline(phase, plannedReviewDate)
    : phase.status === "completed"
      ? { progressPercentage: 100, progressState: "completed", progressLabel: "Completed" }
      : phase.status === "skipped"
        ? { progressPercentage: null, progressState: "skipped", progressLabel: "Skipped" }
        : activeTimeline(phase, plannedReviewDate, today);
  return {
    phaseId: phase.id,
    phaseName: phase.name,
    purpose: phase.purpose ?? null,
    status: phase.status,
    presentationTone: phasePresentationTone(phase),
    phaseBaseline,
    order: phase.order,
    timingMode: phase.timingMode ?? null,
    strategicReviewCadence: phase.strategicReviewCadence ?? null,
    strategicReviewAnchor: phase.strategicReviewAnchor ?? null,
    startDate: validDate(phase.startDate) ? phase.startDate : null,
    duration: phase.duration ? structuredClone(phase.duration) : null,
    targetDate: validDate(phase.targetDate) ? phase.targetDate : null,
    calculatedPlannedReviewDate: plannedReviewDate,
    timelineSource: plannedReviewDate ? phase.timingMode : null,
    totalPlannedDays: timeline.totalPlannedDays ?? null,
    elapsedDays: timeline.elapsedDays ?? null,
    remainingDays: timeline.remainingDays ?? null,
    timelineProgressPercentage: timeline.progressPercentage ?? null,
    timelineValidity: timeline.valid ?? plannedReviewDate !== null,
    timelineWarnings: timeline.warnings ?? [],
    timelineProgressState: timeline.progressState,
    friendlyTimeline: timeline.friendlyTimeline ?? null,
    progressLabel: timeline.progressLabel ?? null,
    progress: outcomeProgress ?? plannedProgress(phase, timeline),
    sequencingNote: isPlannedPhaseStatus(phase.status) && !phase.startDate ? "Begins after an authorized prior-phase decision" : null,
  };
}

export function resolveDexaOutcomeProgress({ target, journeyStartDate, dexaScans = [] } = {}) {
  const targetAmount = target?.type === "numeric_change" && target.metric === "lean_mass" && target.unit === "lb" && Number(target.amount) > 0 ? Number(target.amount) : null;
  const valid = dexaScans.map(normalizeDexa).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  const baseline = valid.filter((scan) => validDate(journeyStartDate) && scan.date <= journeyStartDate).at(-1) ?? null;
  const latest = baseline ? valid.filter((scan) => scan.date >= journeyStartDate).at(-1) ?? null : null;
  if (!targetAmount) return outcomeResult({ status: "unsupported_target", targetAmount, evidenceCount: valid.length, warnings: ["A supported numeric lean-mass target is required."], presentationLabel: "Outcome progress unavailable" });
  if (!baseline) return outcomeResult({ status: "baseline_unavailable", targetAmount, evidenceCount: valid.length, warnings: ["No valid DEXA lean-mass measurement exists on or before the journey start."], presentationLabel: "DEXA baseline needed" });
  if (!latest) return outcomeResult({ status: "awaiting_follow_up", baseline, targetAmount, rawProgressPercentage: 0, clampedProgressPercentage: 0, evidenceCount: valid.length, presentationLabel: `0 of ${formatNumber(targetAmount)} lb measured` });
  const changeValue = round(latest.value - baseline.value), rawProgressPercentage = round((changeValue / targetAmount) * 100);
  return outcomeResult({ status: "measured", baseline, latest, changeValue, targetAmount, rawProgressPercentage, clampedProgressPercentage: clamp(rawProgressPercentage, 0, 100), evidenceCount: valid.length, presentationLabel: `${formatNumber(changeValue)} of ${formatNumber(targetAmount)} lb gained` });
}

function outcomeProgressForPhase({ activeGoal, phase, dexaScans, journeyStartDate }) {
  const ownsOverallOutcome = activeGoal?.target?.type === "numeric_change" &&
    phase.targetDate && phase.targetDate === activeGoal.target.targetDate;
  return ownsOverallOutcome ? resolveDexaOutcomeProgress({ target: activeGoal.target, journeyStartDate, dexaScans }) : null;
}

function plannedProgress(phase, timeline) {
  const numeric = Number.isFinite(timeline.progressPercentage);
  return { progressType: numeric ? "planned_time" : "qualitative", metric: "calendar_time", baselineValue: null, baselineDate: phase.startDate ?? null, latestValue: null, latestDate: null, changeValue: null, targetAmount: timeline.totalPlannedDays ?? null, unit: "days", rawProgressPercentage: numeric ? timeline.progressPercentage : null, clampedProgressPercentage: numeric ? timeline.progressPercentage : null, evidenceSource: "persisted_phase_timeline", evidenceCount: 0, status: timeline.progressState, warnings: timeline.warnings ?? [], presentationLabel: timeline.progressLabel ?? timeline.friendlyTimeline ?? "Timeline not established" };
}

function outcomeResult({ status, baseline = null, latest = null, changeValue = null, targetAmount = null, rawProgressPercentage = null, clampedProgressPercentage = null, evidenceCount = 0, warnings = [], presentationLabel }) {
  return { progressType: status === "unsupported_target" || status === "baseline_unavailable" ? "unavailable" : "outcome", metric: "lean_mass", baselineValue: baseline?.value ?? null, baselineDate: baseline?.date ?? null, latestValue: latest?.value ?? null, latestDate: latest?.date ?? null, changeValue, targetAmount, unit: "lb", rawProgressPercentage, clampedProgressPercentage, evidenceSource: "DEXA", evidenceCount, status, warnings, presentationLabel };
}
function phaseBaselineForPhase(phase, dexaScans) {
  if (!validDate(phase.startDate)) return null;
  const scan = dexaScans.map(normalizeDexa).filter(Boolean)
    .filter((item) => item.date <= phase.startDate).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  return scan ? { date: scan.date, leanMass: { value: scan.value, unit: "lb" } } : null;
}

function phasePresentationTone(phase) {
  if (phase.status === "active") return Number(phase.order ?? 0) > 0 ? "green" : "orange";
  // Completed remains a distinct, positive "gold" tone rather than a desaturated/neutral
  // one — completion is communicated by the Completed label and completed-state copy, not
  // by graying the phase out.
  if (phase.status === "completed") return "gold";
  return isPlannedPhaseStatus(phase.status) ? "green" : "neutral";
}

function normalizeDexa(scan) { const date = scan?.measuredAt ?? scan?.date, value = scan?.leanMass?.value; return validDate(date) && Number.isFinite(value) && scan?.leanMass?.unit === "lb" ? { date, value: Number(value) } : null; }

function activeTimeline(phase, end, today) {
  if (!validDate(phase.startDate)) return { valid: false, progressState: "unavailable", friendlyTimeline: "Timeline not established", warnings: ["Active phase requires a valid start date."] };
  if (!validDate(end)) {
    const runway = validDate(phase.targetDate) ? daysBetween(today, phase.targetDate) : null;
    return { valid: true, progressPercentage: null, progressState: "active",
      friendlyTimeline: Number.isFinite(runway) ? goalRunway(runway) : "Evidence-led phase",
      progressLabel: phase.strategicReviewCadence === "monthly"
        ? "Monthly strategic review · DEXA aligned" : "Review cadence established separately",
      warnings: [] };
  }
  const range = dateRange(phase.startDate, end, today);
  if (!range || range.totalDays <= 0) return { valid: false, progressState: "unavailable", friendlyTimeline: "Timeline not established", warnings: ["Active phase timeline is invalid."] };
  const progressPercentage = Math.round((range.elapsedDays / range.totalDays) * 100);
  const measured = { ...range, totalPlannedDays: range.totalDays };
  if (today >= end) return { ...measured, valid: true, progressPercentage: 100, progressState: "review_due", friendlyTimeline: "Ready for phase review", progressLabel: "Ready for review" };
  const friendlyTimeline = countdown(range.remainingDays);
  return { ...measured, valid: true, progressPercentage, progressState: today < phase.startDate ? "pre_start" : "active", friendlyTimeline, progressLabel: phase.duration?.unit === "weeks" ? `Week ${Math.min(phase.duration.value, Math.floor(range.elapsedDays / 7) + 1)} of ${phase.duration.value}` : friendlyTimeline };
}

function upcomingTimeline(phase, plannedReviewDate) {
  const hasTimeline = validDate(phase.startDate) && validDate(plannedReviewDate);
  return { valid: Boolean(plannedReviewDate), progressPercentage: 0, progressState: "upcoming", progressLabel: "Upcoming", totalPlannedDays: hasTimeline ? daysBetween(phase.startDate, plannedReviewDate) : null, elapsedDays: 0, remainingDays: hasTimeline ? daysBetween(phase.startDate, plannedReviewDate) : null };
}

function confidenceSummary({ evidenceSummary, timelineValid, ambitious, hasPhaseOutcomeEvidence }) {
  const inputs = ["timeline validity"];
  let score = 24;
  for (const [key, label] of [["nutritionConsistent", "nutrition adherence"], ["trainingConsistent", "training consistency"], ["activityConsistent", "activity consistency"], ["evidenceConsistent", "evidence consistency"], ["protocolAdherence", "protocol adherence"]]) {
    if (evidenceSummary[key]) { score += 5; inputs.push(label); }
  }
  if (!timelineValid) score -= 10;
  if (hasPhaseOutcomeEvidence) score += 5;
  if (ambitious) score = Math.min(score, 49);
  score = Math.max(12, Math.min(58, score));
  return {
    qualitativeLevel: score >= 42 ? "Moderate" : "Early confidence",
    numericValue: score,
    supportingNarrative: inputs.length > 1
      ? "Recent adherence supports an encouraging start. Confidence will become clearer as maintenance and training evidence accumulate."
      : "The trajectory is new. Confidence will build as maintenance, training, and body-composition evidence accumulate.",
    evidenceInputsUsed: inputs,
    uncertaintyStatement: "Adherence supports execution, but does not yet prove the overall lean-mass outcome.",
    confidenceValidity: timelineValid ? "valid_early" : "limited_by_timeline",
    supportingFactors: inputs.map((input) => input === "timeline validity" ? "Valid goal and phase timelines" : capitalize(input)),
    limitingFactors: ["The goal is early", "Maintenance is still being established", "Lean-mass progress has not yet accumulated", "The overall outcome remains ambitious", "Later DEXA evidence is still needed"],
    clarifyingFactors: ["Additional maintenance evidence", "Sustained training performance", "Body-composition measurements", "Evidence across the active and later phases"],
  };
}

function goalRunway(days) { if (days <= 0) return "Goal target window reached"; if (days < 14) return `${days} days to goal target`; return `${Math.ceil(days / 7)} weeks to goal target`; }
function countdown(days) { if (days === 1) return "Planned review tomorrow"; if (days <= 7) return "Planned review this week"; if (days >= 14) return `${Math.ceil(days / 7)} weeks remaining`; return `${days} days remaining`; }
function isAmbitious(goal) { return goal.target?.metric === "lean_mass" && Number(goal.target?.amount) >= 10; }
function localDate(value, timeZone) { const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value instanceof Date ? value : new Date(value)); const pick = (type) => parts.find((part) => part.type === type)?.value; return `${pick("year")}-${pick("month")}-${pick("day")}`; }
function dateRange(start, end, today) { if (!validDate(start) || !validDate(end) || !validDate(today)) return null; const totalDays = daysBetween(start, end); if (totalDays < 0) return null; return { totalDays, elapsedDays: clamp(daysBetween(start, today), 0, totalDays), remainingDays: clamp(daysBetween(today, end), 0, totalDays) }; }
function daysBetween(left, right) { return Math.round((dateNumber(right) - dateNumber(left)) / 86400000); }
function dateNumber(value) { const [year, month, day] = value.split("-").map(Number); return Date.UTC(year, month - 1, day); }
function validDate(value) { return typeof value === "string" && DATE_PATTERN.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function round(value) { return Math.round(value * 10) / 10; }
function formatNumber(value) { return Number(value).toFixed(Number.isInteger(value) ? 0 : 1); }
function capitalize(value) { return `${value.charAt(0).toUpperCase()}${value.slice(1)}`; }
function freeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
