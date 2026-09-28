// Holistic evidence picture.
//
// Before anything is selected for a briefing, every domain the Goal needs is
// assessed — body trajectory, body composition, guardrail, training (rhythm and
// performance), nutrition, activity, routine and recovery. An assessment may
// be "unavailable" or "insufficient", but it is never skipped. Each assessment
// states what the domain says, how strongly, and which candidate insights it
// can offer; synthesis (BriefingHolisticSynthesis.js) chooses among them.
//
// Inputs are already canonical and eligible: the shared Briefing Intelligence
// output (day series, patterns, reliability) plus `goalFacts`, the goal-level
// facts the V3 interpretation already established (composition, guardrail,
// energy against plan targets, in-window training milestones, outlook,
// strategy). This module never reads storage and never attributes causes.

import { EVIDENCE_DOMAINS as D } from "./GoalEvidencePolicies.js";
import { BriefingPatternKind, dateRange, shiftDate } from "./BriefingIntelligence.js";

export const EVIDENCE_PICTURE_VERSION = "briefing_evidence_picture_v1";

export const InsightRole = Object.freeze({
  PROGRESS: "progress",
  OUTCOME: "outcome",
  EXECUTION: "execution",
  CONTEXT: "context",
  RISK: "risk",
  LIMITATION: "limitation",
});

// One assessor per domain. A new domain (e.g. Sleep inside Recovery) is added
// here and in a goal policy; synthesis and realization need no redesign.
export const DOMAIN_ASSESSORS = Object.freeze({
  [D.BODY_TRAJECTORY]: assessBodyTrajectory,
  [D.BODY_COMPOSITION]: assessBodyComposition,
  [D.GUARDRAIL]: assessGuardrail,
  [D.TRAINING]: assessTraining,
  [D.NUTRITION]: assessNutrition,
  [D.ACTIVITY]: assessActivity,
  [D.ROUTINE]: assessRoutine,
  [D.RECOVERY]: assessRecovery,
  [D.VISUAL]: assessVisualChange,
});

// Scale-trend rate is fit over a fixed recent span (ending with the period),
// so a Weekly and a Monthly describe the same "recent pace" and the prose can
// name the span it covers.
export const WEIGHT_RATE_SPAN_DAYS = 28;

export function buildEvidencePicture({ intelligence, goalPolicy, goalFacts = {} }) {
  const context = pictureContext({ intelligence, goalPolicy, goalFacts });
  const domains = Object.keys(goalPolicy.domains).map((domain) => {
    const assessor = DOMAIN_ASSESSORS[domain];
    const assessment = assessor ? assessor(context) : unavailable(domain, "no_assessor");
    return { weight: goalPolicy.domains[domain], ...assessment, domain };
  });
  return {
    schemaVersion: EVIDENCE_PICTURE_VERSION,
    goalType: goalPolicy.goalType,
    window: intelligence?.horizon?.window ?? null,
    domains,
    outlook: goalFacts.outlook ?? null,
    strategy: goalFacts.strategy ?? null,
  };
}

function pictureContext({ intelligence, goalPolicy, goalFacts }) {
  const window = intelligence?.horizon?.window ?? null;
  const days = intelligence?.periodDays ?? [];
  const inWindow = (date) => window && date >= window.startDate && date <= window.endDate;
  return {
    intelligence, goalPolicy, goalFacts, window, days,
    windowDays: days.filter((day) => inWindow(day.date)),
    patterns: intelligence?.patterns ?? [],
    characterization: intelligence?.characterization ?? [],
    reliability: (intelligence?.reliability ?? []).filter((item) => inWindow(item.date)),
  };
}

// ---------------------------------------------------------------- assessors

// Scale weight: direction, weekly rate, and noise over the recent weeks,
// compared with what this goal's phase expects. Never read as composition.
function assessBodyTrajectory({ days, window, goalPolicy }) {
  const spanStart = window ? shiftDate(window.endDate, -(WEIGHT_RATE_SPAN_DAYS - 1)) : null;
  const points = days.filter((day) => Number.isFinite(day?.body?.weight) && (!spanStart || day.date >= spanStart))
    .map((day) => ({ x: daysBetween(days[0].date, day.date), y: day.body.weight, date: day.date }));
  const inWindow = points.filter((point) => window && point.date >= window.startDate);
  if (points.length < 8 || inWindow.length < 3) {
    return insufficient(D.BODY_TRAJECTORY, "too_few_weigh_ins", { weighIns: points.length, windowWeighIns: inWindow.length });
  }
  const fit = linearFit(points);
  const weeklyRate = round(fit.slope * 7, 2);
  const residual = Math.sqrt(points.reduce((sum, point) =>
    sum + (point.y - (fit.intercept + fit.slope * point.x)) ** 2, 0) / Math.max(1, points.length - 2));
  const windowAverage = round(mean(inWindow.map((point) => point.y)), 1);
  const priorWindow = points.filter((point) => window && point.date < window.startDate &&
    point.date >= shiftDate(window.startDate, -7));
  const priorAverage = priorWindow.length >= 3 ? round(mean(priorWindow.map((point) => point.y)), 1) : null;
  const expectation = goalPolicy.weightExpectation;
  const verdict = weightVerdict(weeklyRate, expectation, residual);
  const facts = { weeklyRate, windowAverage, priorWeekAverage: priorAverage, volatility: round(residual, 2),
    weighIns: points.length, spanDays: daysBetween(points[0].date, points.at(-1).date) + 1,
    rateSpanDays: WEIGHT_RATE_SPAN_DAYS, movement: weeklyRate > 0.1 ? "up" : weeklyRate < -0.1 ? "down" : "flat",
    expectedDirection: expectation?.direction ?? null, verdict,
    note: "scale_weight_does_not_identify_lean_or_fat_mass" };
  const risk = ["rapid", "wrong_direction"].includes(verdict);
  const polarity = verdict === "steady" ? "supportive" : risk ? "concern" : "neutral";
  // A flat scale while the goal expects movement is informative in itself.
  const strength = { steady: 1.6, quick: 1.8, rapid: 2.8, wrong_direction: 2.0, flat: 1.4, too_noisy: 0.6 }[verdict] ?? 0.8;
  return assessed(D.BODY_TRAJECTORY, verdict, polarity, facts, [
    insight(D.BODY_TRAJECTORY, "weight_trend", risk ? InsightRole.RISK : InsightRole.PROGRESS, polarity, strength, facts),
  ]);
}

// Pace against the goal type's typical range: steady, quick, rapid, flat or
// the wrong way. A trend smaller than day-to-day noise is not a trend.
function weightVerdict(weeklyRate, expectation, residual) {
  if (!expectation) return "not_goal_relevant";
  if (Math.abs(weeklyRate) < 0.1 && residual > 1.5) return "too_noisy";
  const [low, high] = expectation.typicalWeeklyRate;
  if (expectation.direction === "stable") {
    if (Math.abs(weeklyRate) <= high) return "steady";
    return Math.abs(weeklyRate) >= Math.abs(expectation.cautionWeeklyRate) ? "rapid" : "quick";
  }
  const sign = expectation.direction === "up" ? 1 : -1;
  const pace = sign * weeklyRate;
  const [typicalLow, typicalHigh] = sign > 0 ? [low, high] : [-high, -low];
  if (pace >= sign * expectation.cautionWeeklyRate) return "rapid";
  if (pace > typicalHigh) return "quick";
  if (pace >= typicalLow) return "steady";
  if (pace < -0.25) return "wrong_direction";
  return "flat";
}

function assessBodyComposition({ goalFacts, window }) {
  const composition = goalFacts.composition;
  if (!composition?.available) return unavailable(D.BODY_COMPOSITION, "no_composition_measurement");
  const fresh = window && composition.measuredAt >= window.startDate && composition.measuredAt <= window.endDate;
  const ageDays = window ? daysBetween(composition.measuredAt, window.endDate) : null;
  const facts = { ...composition, newThisPeriod: Boolean(fresh), ageDays };
  const polarity = composition.state === "progressed" ? "supportive" :
    ["regressed", "outside_target"].includes(composition.state) ? "concern" : "neutral";
  // A new scan leads the period; a recent one is the context everything else
  // is read against; an old one fades.
  // A recent result that went the wrong way is not background: it is a risk
  // the period is read against.
  const current = fresh || ageDays <= 45;
  const concern = polarity === "concern" && current;
  const strength = fresh ? (concern ? 3.4 : 3.2) : concern ? 2.2 : ageDays <= 45 ? 1.3 : 0.5;
  const role = concern ? InsightRole.RISK : fresh ? InsightRole.OUTCOME : InsightRole.CONTEXT;
  return assessed(D.BODY_COMPOSITION, fresh ? "new_measurement" : "standing_measurement", polarity, facts, [
    insight(D.BODY_COMPOSITION, "composition_result", role, polarity, strength, facts),
  ]);
}

function assessGuardrail({ goalFacts, days, window, goalPolicy }) {
  const guardrail = goalFacts.guardrail;
  if (!guardrail?.available) return unavailable(D.GUARDRAIL, "no_guardrail_measurement");
  // The guardrail reports its own measured status only; a fast scale trend is
  // the body-trajectory domain's finding, never counted twice.
  const facts = { ...guardrail };
  const concern = ["watch", "pressured", "breached"].includes(guardrail.status);
  const strength = guardrail.status === "breached" ? 3.6 : guardrail.status === "pressured" ? 3.0 :
    guardrail.status === "watch" ? 2.4 : 0.7;
  return assessed(D.GUARDRAIL, guardrail.status, concern ? "concern" : "neutral", facts, [
    insight(D.GUARDRAIL, "guardrail_status", concern ? InsightRole.RISK : InsightRole.CONTEXT,
      concern ? "concern" : "neutral", strength, facts),
  ]);
}

// Training: rhythm (did the usual sessions happen) and performance (did the
// work move forward). Exercise-level bests are progress examples here — they
// can be recap material but are never Goal Confidence's explanation.
function assessTraining({ goalFacts, windowDays, patterns, intelligence }) {
  const sessions = windowDays.reduce((sum, day) => sum + Number(day?.training?.sessions ?? 0), 0);
  const trainingDays = windowDays.filter((day) => Number(day?.training?.sessions ?? 0) > 0).length;
  const baseline = intelligence?.baselines?.find((item) => item.signal === "training.session");
  const usualDays = baseline ? round(baseline.rate * Math.max(1, windowDays.length), 1) : null;
  // Already ranked by the size of the step (see goal facts); kept in order.
  const milestones = [...(goalFacts.trainingMilestones ?? [])];
  const gaps = patterns.filter((item) => item.domain === "training" &&
    [BriefingPatternKind.ROUTINE_GAP, BriefingPatternKind.FREQUENCY_CHANGE].includes(item.kind));
  const facts = { sessions, trainingDays, usualTrainingDays: usualDays, milestoneCount: milestones.length,
    milestones: milestones.slice(0, 3), rhythmFindings: gaps.map((item) => item.id) };
  const insights = [];
  if (milestones.length) {
    insights.push(insight(D.TRAINING, "training_progress", InsightRole.PROGRESS, "supportive",
      Math.min(2.6, 1.3 + 0.35 * milestones.length), { milestoneCount: milestones.length, example: milestones[0],
        others: milestones.slice(1, 3) }));
  }
  // Rhythm: a frequency change, a run of missed sessions, or no training at
  // all where the routine expects it. A routine shift spanning training tells
  // the same thing; synthesis lets it cover this one rather than dropping
  // rhythm here.
  const frequency = gaps.find((item) => item.kind === BriefingPatternKind.FREQUENCY_CHANGE);
  const gap = gaps.filter((item) => item.kind === BriefingPatternKind.ROUTINE_GAP)
    .sort((left, right) => right.materiality - left.materiality)[0];
  const missedWholePeriod = !trainingDays && usualDays != null && usualDays >= 1;
  if (missedWholePeriod) {
    insights.push(insight(D.TRAINING, "training_frequency", InsightRole.EXECUTION, "concern",
      Math.min(2.6, 1.2 + 0.4 * usualDays), { observed: 0, expected: usualDays, direction: "below", missedAll: true,
        extentDays: windowDays.length }, { requiresCompleteWindow: true }));
  } else if (frequency) {
    insights.push(insight(D.TRAINING, "training_frequency", InsightRole.EXECUTION,
      frequency.direction === "below" ? "concern" : "neutral", Math.min(2.4, frequency.materiality / 1.4),
      { observed: frequency.magnitude.observed, expected: frequency.magnitude.expected, direction: frequency.direction,
        extentDays: windowDays.length }, { requiresCompleteWindow: true }));
  } else if (gap) {
    insights.push(insight(D.TRAINING, "training_frequency", InsightRole.EXECUTION, "concern",
      Math.min(2.2, gap.materiality / 1.4), { direction: "below", missedDates: gap.dates, extentDays: gap.dates.length }));
  }
  if (!trainingDays && !milestones.length && !insights.length) return insufficient(D.TRAINING, "no_training_recorded", facts);
  const state = missedWholePeriod ? "missed" : milestones.length ? "progressing" : gaps.length ? "interrupted" : "steady";
  return assessed(D.TRAINING, state, milestones.length ? "supportive" : gaps.length ? "concern" : "neutral", facts, insights);
}

// Nutrition against the plan's own targets, with protein and logging
// reliability. Unreliable days constrain every nutrition claim.
function assessNutrition({ goalFacts, windowDays, reliability, intelligence }) {
  const logged = windowDays.filter((day) => Number.isFinite(day?.nutrition?.calories));
  if (!logged.length) return unavailable(D.NUTRITION, "no_nutrition_logged");
  const unreliableDates = [...new Set(reliability.filter((item) => item.domain === "nutrition").map((item) => item.date))].sort();
  const reliable = logged.filter((day) => !unreliableDates.includes(day.date));
  const intake = goalFacts.energy?.intake ?? null;
  const proteinBaseline = intelligence?.periodDays?.filter((day) => day.date < (intelligence.horizon.window.startDate) &&
    Number.isFinite(day?.nutrition?.protein)).map((day) => day.nutrition.protein) ?? [];
  const facts = { loggedDays: logged.length, reliableDays: reliable.length, unreliableDates,
    intakeState: intake?.state ?? null, intakeAverage: intake?.observed ?? null, intakeTarget: intake?.target ?? null,
    reliableProteinAverage: reliable.length ? round(mean(reliable.map((day) => day.nutrition.protein).filter(Number.isFinite)), 0) : null,
    usualProtein: proteinBaseline.length ? round(median(proteinBaseline), 0) : null };
  const insights = [];
  // The plan-relative intake average is computed upstream over every logged
  // day, so a single unreliable day already bends it.
  const readable = unreliableDates.length === 0;
  if (intake?.state) {
    const polarity = intake.state === "on_plan" ? "supportive" : "concern";
    insights.push({ ...insight(D.NUTRITION, "intake_vs_plan", InsightRole.EXECUTION, polarity,
      polarity === "supportive" ? 0.9 : 1.8, { state: intake.state, observed: intake.observed, target: intake.target }),
    // A weekly intake verdict built partly on unreliable days is not a claim
    // the recap can make.
    ...(readable ? {} : { restrained: "unreliable_days_in_average" }) });
  }
  if (unreliableDates.length) {
    const datesByKind = {};
    for (const item of reliability.filter((entry) => entry.domain === "nutrition")) {
      datesByKind[item.kind] = [...new Set([...(datesByKind[item.kind] ?? []), item.date])].sort();
    }
    insights.push(insight(D.NUTRITION, "nutrition_unclear", InsightRole.LIMITATION, "neutral",
      Math.min(2.2, 0.8 + 0.35 * unreliableDates.length), { dates: unreliableDates, datesByKind,
        kinds: Object.keys(datesByKind).sort() },
      { limits: [D.NUTRITION] }));
  }
  const state = !readable ? "partly_unreadable" : intake?.state ?? "logged";
  return assessed(D.NUTRITION, state, readable && intake?.state === "on_plan" ? "supportive" : readable ? "neutral" : "limiting", facts, insights);
}

// Wearable activity: execution context, described by direction and never by
// precise calories.
function assessActivity({ goalFacts, windowDays, patterns }) {
  const tracked = windowDays.filter((day) => Number.isFinite(day?.activity?.activeKcal));
  if (!tracked.length) return unavailable(D.ACTIVITY, "no_activity_tracked");
  const activity = goalFacts.energy?.activity ?? null;
  const runs = patterns.filter((item) => item.domain === "activity" && item.kind === BriefingPatternKind.VALUE_RUN);
  const facts = { trackedDays: tracked.length, planState: activity?.state ?? null, measurement: "wearable_estimate",
    runs: runs.map((item) => ({ id: item.id, direction: item.direction, dates: item.dates })) };
  const insights = [];
  const run = runs.sort((left, right) => right.materiality - left.materiality)[0];
  if (run) {
    insights.push(insight(D.ACTIVITY, "activity_change", InsightRole.EXECUTION,
      run.direction === "below" ? "concern" : "neutral", Math.min(2.0, run.materiality / 1.3),
      { direction: run.direction, dates: run.dates, patternId: run.id, extentDays: run.dates.length }));
  } else if (activity?.state === "on_plan") {
    insights.push(insight(D.ACTIVITY, "activity_on_plan", InsightRole.EXECUTION, "supportive", 0.6, { state: activity.state }));
  }
  return assessed(D.ACTIVITY, run ? `${run.direction}_usual` : activity?.state ?? "tracked", run ? "neutral" : "supportive", facts, insights);
}

// Routine: disruptions, continuity and recurrence, across domains. One
// signal among several — never automatically the whole story.
function assessRoutine({ characterization, patterns }) {
  const shift = characterization.find((item) => item.kind === BriefingPatternKind.ROUTINE_SHIFT);
  if (!shift) {
    return assessed(D.ROUTINE, "steady", "supportive", { shifts: 0 }, [
      insight(D.ROUTINE, "routine_steady", InsightRole.EXECUTION, "supportive", 0.7, {}),
    ]);
  }
  const byId = new Map(patterns.map((item) => [item.id, item]));
  const members = (shift.members ?? []).map((id) => byId.get(id)).filter(Boolean);
  const direction = members.every((item) => ["below", "absent"].includes(item.direction)) ? "break" : "change";
  const affectedDates = [...new Set(members.flatMap((item) => item.dates ?? []))].sort();
  const facts = { span: shift.span, position: shift.position, domains: shift.domains, direction,
    recurrence: shift.recurrence ?? null, affectedDates, extentDays: affectedDates.length,
    missed: members.filter((item) => item.kind === BriefingPatternKind.ROUTINE_GAP)
      .map((item) => ({ domain: item.domain, dates: item.dates })),
    lower: members.filter((item) => item.kind === BriefingPatternKind.VALUE_RUN && item.direction === "below")
      .map((item) => ({ domain: item.domain, dates: item.dates })),
    patternId: shift.id, relatedDomains: members.map((item) => item.domain) };
  return assessed(D.ROUTINE, direction === "break" ? "interrupted" : "changed", "concern", facts, [
    // A break tells the rhythm of the domains it spans — missed sessions, an
    // activity dip — never their progress.
    insight(D.ROUTINE, "routine_break", InsightRole.EXECUTION, "concern", Math.min(3, shift.materiality / 2), facts,
      { coversKinds: ["activity_change", "training_frequency", "activity_on_plan"] }),
  ]);
}

// Recovery/Sleep: a declared slot. It reports what it has and fabricates
// nothing; when Sleep evidence exists it enters here.
function assessRecovery({ days }) {
  const nights = days.filter((day) => Number.isFinite(day?.recovery?.sleepHours));
  if (!nights.length) return unavailable(D.RECOVERY, "no_recovery_evidence_yet");
  return insufficient(D.RECOVERY, "recovery_assessment_not_yet_defined", { nights: nights.length });
}

// Visual change from progress photos: its own evidence, scaled by how much
// actually changed; never a composition measurement.
function assessVisualChange({ goalFacts, window }) {
  const visual = goalFacts.visual;
  if (!visual?.available) return unavailable(D.VISUAL, "no_photo_comparison");
  const fresh = window && visual.capturedAt >= window.startDate && visual.capturedAt <= window.endDate;
  const strength = { visible: 3.0, subtle: 1.6, none: 0.8 }[visual.change] ?? 0.8;
  const facts = { ...visual, newThisPeriod: Boolean(fresh) };
  return assessed(D.VISUAL, visual.change ?? "compared", "neutral", facts, [
    insight(D.VISUAL, "visual_change", fresh ? InsightRole.OUTCOME : InsightRole.CONTEXT, "neutral",
      fresh ? strength : Math.min(strength, 1.0), facts),
  ]);
}

// ---------------------------------------------------------------- helpers

function insight(domain, kind, role, polarity, strength, facts, extra = {}) {
  return { id: `${domain}|${kind}`, domain, kind, role, polarity, strength: round(strength, 2), facts, ...extra };
}

function assessed(domain, state, polarity, facts, insights) {
  return { domain, status: "assessed", state, polarity, facts, insights };
}

function insufficient(domain, reason, facts = {}) {
  return { domain, status: "insufficient", state: reason, polarity: "neutral", facts, insights: [] };
}

function unavailable(domain, reason) {
  return { domain, status: "unavailable", state: reason, polarity: "neutral", facts: {}, insights: [] };
}

function linearFit(points) {
  const n = points.length;
  const mx = mean(points.map((point) => point.x));
  const my = mean(points.map((point) => point.y));
  const sxx = points.reduce((sum, point) => sum + (point.x - mx) ** 2, 0);
  const sxy = points.reduce((sum, point) => sum + (point.x - mx) * (point.y - my), 0);
  const slope = sxx > 0 ? sxy / sxx : 0;
  return { slope, intercept: my - slope * mx, n };
}

function daysBetween(start, end) {
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values) { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
function round(value, places = 1) { const f = 10 ** places; return Math.round(Number(value) * f) / f; }
export { dateRange };
