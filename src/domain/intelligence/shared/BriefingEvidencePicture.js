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

import { EVIDENCE_DOMAINS as D, WEIGHT_PACE_AUTHORITY as PACE, canonicalWeightPace } from "./GoalEvidencePolicies.js";
import { BRIEFING_INTELLIGENCE_POLICIES } from "./BriefingIntelligencePolicies.js";
import { BriefingPatternKind, dateRange, shiftDate } from "./BriefingIntelligence.js";
import { PLAN_TOLERANCE_RATIO } from "../CadenceEnergyObservationsV3.js";

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
    anomalies: (intelligence?.anomalies ?? []).filter((item) => inWindow(item.date)),
  };
}

// ---------------------------------------------------------------- assessors

// Scale weight: direction, pace and noise over the recent weeks, read against
// the goal's expected direction and — only when the accepted Phase Expected
// Trajectory declares one — a canonical expected weekly range. Without that
// range the trend is judged against the person's own recent trend
// (acceleration, stagnation, direction, volatility), never against an
// engine-invented rate. Never read as composition.
function assessBodyTrajectory({ days, window, goalPolicy, goalFacts }) {
  const spanStart = window ? shiftDate(window.endDate, -(WEIGHT_RATE_SPAN_DAYS - 1)) : null;
  const points = days.filter((day) => Number.isFinite(day?.body?.weight) && (!spanStart || day.date >= spanStart))
    .map((day) => ({ x: daysBetween(days[0].date, day.date), y: day.body.weight, date: day.date }));
  const inWindow = points.filter((point) => window && point.date >= window.startDate);
  if (points.length < 8 || inWindow.length < 3) {
    return insufficient(D.BODY_TRAJECTORY, "too_few_weigh_ins", { weighIns: points.length, windowWeighIns: inWindow.length });
  }
  // Robust pace (Theil–Sen: the median of every pairwise slope), so one step
  // change or a stray weigh-in cannot set the verdict on its own.
  const fit = robustFit(points);
  const weeklyRate = round(fit.slope * 7, 2);
  const residual = Math.sqrt(points.reduce((sum, point) =>
    sum + (point.y - (fit.intercept + fit.slope * point.x)) ** 2, 0) / Math.max(1, points.length - 2));
  // The last two weeks against the two before, for acceleration.
  const split = window ? shiftDate(window.endDate, -13) : null;
  // Each half's pace with its own standard error, so ordinary day-to-day
  // noise is never read as the trend speeding up.
  const halfPace = (list) => {
    if (list.length < 5 || daysBetween(list[0].date, list.at(-1).date) < 7) return null;
    const half = robustFit(list);
    const mx = mean(list.map((point) => point.x));
    const sxx = list.reduce((sum, point) => sum + (point.x - mx) ** 2, 0);
    const sd = Math.sqrt(list.reduce((sum, point) => sum + (point.y - (half.intercept + half.slope * point.x)) ** 2, 0) /
      Math.max(1, list.length - 2));
    return { pace: round(half.slope * 7, 2), standardError: sxx > 0 ? (sd / Math.sqrt(sxx)) * 7 : Infinity };
  };
  const recentHalf = split ? halfPace(points.filter((point) => point.date >= split)) : null;
  const earlierHalf = split ? halfPace(points.filter((point) => point.date < split)) : null;
  const recentPace = recentHalf?.pace ?? null;
  const earlierPace = earlierHalf?.pace ?? null;
  const paceChangeNoise = recentHalf && earlierHalf
    ? round(Math.sqrt(recentHalf.standardError ** 2 + earlierHalf.standardError ** 2), 2) : null;
  const windowAverage = round(mean(inWindow.map((point) => point.y)), 1);
  // The period's first and latest seven days, for a multi-week briefing that
  // tells where the scale started and where it stands (each needs three
  // weigh-ins to count).
  const weekAverage = (from, to) => {
    const list = inWindow.filter((point) => point.date >= from && point.date <= to);
    return list.length >= 3 ? round(mean(list.map((point) => point.y)), 1) : null;
  };
  const firstWeekAverage = window ? weekAverage(window.startDate, shiftDate(window.startDate, 6)) : null;
  const lastWeekAverage = window ? weekAverage(shiftDate(window.endDate, -6), window.endDate) : null;
  const priorWindow = points.filter((point) => window && point.date < window.startDate &&
    point.date >= shiftDate(window.startDate, -7));
  const priorAverage = priorWindow.length >= 3 ? round(mean(priorWindow.map((point) => point.y)), 1) : null;
  const expectation = goalPolicy.weightExpectation;
  const canonicalPace = canonicalWeightPace(goalFacts?.weightTrajectory, expectation?.direction ?? null);
  const verdict = weightVerdict({ weeklyRate, recentPace, earlierPace, paceChangeNoise, residual, expectation, canonicalPace });
  const facts = { weeklyRate, recentPace, earlierPace, paceChangeNoise, windowAverage, priorWeekAverage: priorAverage,
    firstWeekAverage, lastWeekAverage,
    volatility: round(residual, 2), weighIns: points.length, spanDays: daysBetween(points[0].date, points.at(-1).date) + 1,
    rateSpanDays: daysBetween(points[0].date, points.at(-1).date) + 1, rateMethod: "theil_sen",
    movement: weeklyRate >= PACE.movementThresholdLbPerWeek ? "up" : weeklyRate <= -PACE.movementThresholdLbPerWeek ? "down" : "flat",
    expectedDirection: expectation?.direction ?? null, verdict,
    paceAuthority: canonicalPace ? canonicalPace.authority : "personal_trend_relative",
    note: "scale_weight_does_not_identify_lean_or_fat_mass" };
  const risk = ["rapid", "wrong_direction", "accelerating"].includes(verdict);
  // Only a canonical expected range can endorse a pace. Without one, a steady
  // trend in the goal's direction is described, not praised (neutral), and a
  // maintenance drift is a movement to describe, not a verdict.
  // A canonical "quick" is a real (if mild) concern: the phase set a pace
  // and the scale is past it.
  const polarity = risk || (verdict === "quick" && canonicalPace) ? "concern"
    : verdict === "steady" && canonicalPace ? "supportive" : "neutral";
  // A goal with no weight expectation keeps the trend as background only.
  if (verdict === "not_goal_relevant") {
    return assessed(D.BODY_TRAJECTORY, verdict, "neutral", facts, [
      insight(D.BODY_TRAJECTORY, "weight_trend", InsightRole.CONTEXT, "neutral", 0.5, facts),
    ]);
  }
  // A flat scale while the goal expects movement is informative in itself.
  const strength = { steady: 1.6, quick: 1.8, rapid: 2.8, accelerating: 2.4, wrong_direction: 2.0, drifting: 1.8,
    flat: 1.4, too_noisy: 0.6 }[verdict] ?? 0.8;
  return assessed(D.BODY_TRAJECTORY, verdict, polarity, facts, [
    insight(D.BODY_TRAJECTORY, "weight_trend", risk ? InsightRole.RISK : InsightRole.PROGRESS, polarity, strength, facts),
  ]);
}

// The trend against the goal's direction. Pace is judged in absolute terms
// only against a canonical expected range; otherwise only against the
// person's own earlier pace. A trend smaller than day-to-day noise is not a
// trend.
function weightVerdict({ weeklyRate, recentPace, earlierPace, paceChangeNoise, residual, expectation, canonicalPace }) {
  if (!expectation) return "not_goal_relevant";
  const move = PACE.movementThresholdLbPerWeek;
  if (Math.abs(weeklyRate) < move && residual > 1.5) return "too_noisy";
  if (canonicalPace) return canonicalPaceVerdict(weeklyRate, expectation, canonicalPace);
  // For a maintenance goal the trend's own direction is the one whose
  // speeding up matters.
  const sign = expectation.direction === "stable" ? Math.sign(weeklyRate) || 1 : expectation.direction === "up" ? 1 : -1;
  const along = sign * weeklyRate;
  if (expectation.direction !== "stable") {
    if (along <= -move) return "wrong_direction";
    if (along < move) return "flat";
  } else if (Math.abs(weeklyRate) < move) {
    return "steady";
  }
  const recent = recentPace == null ? null : sign * recentPace;
  const earlier = earlierPace == null ? null : sign * earlierPace;
  // Speeding up: a real increase over the earlier pace, larger than the noise
  // in the two paces themselves.
  if (recent != null && earlier != null && recent >= move * 2 &&
      recent - earlier >= Math.max(PACE.accelerationMinimumIncreaseLbPerWeek,
        PACE.accelerationMinimumRelativeIncrease * Math.abs(earlier), 2 * (paceChangeNoise ?? Infinity))) return "accelerating";
  return expectation.direction === "stable" ? "drifting" : "steady";
}

// A canonical range is signed lb/week (negative for loss), as the phase
// declares it. Everything is compared along the goal's direction.
function canonicalPaceVerdict(weeklyRate, expectation, { expectedWeeklyRange: [low, high], cautionWeeklyRate }) {
  if (expectation.direction === "stable") {
    if (weeklyRate >= low && weeklyRate <= high) return "steady";
    return cautionWeeklyRate != null && Math.abs(weeklyRate) >= Math.abs(cautionWeeklyRate) ? "rapid" : "quick";
  }
  const sign = expectation.direction === "up" ? 1 : -1;
  const pace = sign * weeklyRate;
  const [typicalLow, typicalHigh] = [sign * low, sign * high].sort((left, right) => left - right);
  if (cautionWeeklyRate != null && pace >= Math.abs(cautionWeeklyRate)) return "rapid";
  if (pace > typicalHigh) return "quick";
  if (pace >= typicalLow) return "steady";
  if (pace <= -PACE.movementThresholdLbPerWeek) return "wrong_direction";
  return "flat";
}

function assessBodyComposition({ goalFacts, window, intelligence }) {
  const composition = goalFacts.composition;
  if (!composition?.available) return unavailable(D.BODY_COMPOSITION, "no_composition_measurement");
  // For an event briefing the window is the lead-up; only a measurement on
  // the event date itself is new. For a recurring briefing, any measurement
  // in its window is.
  const eventBriefing = Boolean(BRIEFING_INTELLIGENCE_POLICIES[intelligence?.policy?.cadence]?.contextWindowDays);
  const fresh = window && (eventBriefing ? composition.measuredAt === window.endDate
    : composition.measuredAt >= window.startDate && composition.measuredAt <= window.endDate);
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
  // Persistence across a multi-week period: in how many of its seven-day
  // blocks a best landed (a month of steady progress, or one good week).
  const blockOf = (date) => Math.floor(daysBetween(windowDays[0]?.date ?? date, date) / 7);
  const blocks = Math.max(1, Math.ceil(windowDays.length / 7));
  const bestBlocks = new Set(milestones.map((item) => blockOf(String(item.observedAt).slice(0, 10)))).size;
  const facts = { sessions, trainingDays, usualTrainingDays: usualDays, milestoneCount: milestones.length,
    milestones: milestones.slice(0, 3), rhythmFindings: gaps.map((item) => item.id), blocks, bestBlocks,
    missedDates: [...new Set(gaps.filter((item) => item.kind === BriefingPatternKind.ROUTINE_GAP).flatMap((item) => item.dates ?? []))].sort() };
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
function assessNutrition({ goalFacts, windowDays, reliability, anomalies = [], intelligence }) {
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
    // Why each excluded day could not be used (completeness evidence only).
    exclusions: reliability.filter((item) => item.domain === "nutrition")
      .map((item) => ({ date: item.date, kind: item.kind, sameSourceAs: item.evidence?.sameSourceAs ?? null,
        entries: item.evidence?.entries ?? null }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    // Unusual days on usable records: behavior, kept in every average.
    lowProteinDates: [...new Set(anomalies.filter((item) => item.domain === "nutrition" && item.kind === "low_protein").map((item) => item.date))].sort(),
    lowProteinIntakes: anomalies.filter((item) => item.domain === "nutrition" && item.kind === "low_protein")
      .map((item) => windowDays.find((day) => day.date === item.date)?.nutrition?.calories ?? null),
    repeatedDates: [...new Set(anomalies.filter((item) => item.domain === "nutrition" && item.kind === "repeated_day_totals").map((item) => item.date))].sort(),
    // Intake over the usable days only: the one intake figure a briefing
    // may state when some days cannot be used.
    reliableIntakeAverage: reliable.length ? round(mean(reliable.map((day) => day.nutrition.calories)), 0) : null,
    // The plan-relative state over the readable days, with the same
    // tolerance the V3 energy observations use: the one intake verdict a
    // briefing may state when some days are unreadable.
    // When every logged day is readable, the upstream state (computed over
    // those same days) is the authority; the two never disagree.
    readableIntakeState: reliable.length === logged.length && intake?.state ? intake.state : readableIntakeState(reliable, intake?.target),
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

function readableIntakeState(reliable, target) {
  if (reliable.length < 7 || !Number.isFinite(Number(target)) || Number(target) <= 0) return null;
  const ratio = mean(reliable.map((day) => day.nutrition.calories)) / Number(target) - 1;
  return Math.abs(ratio) <= PLAN_TOLERANCE_RATIO ? "on_plan" : ratio < 0 ? "below_plan" : "above_plan";
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
function assessRoutine({ characterization, patterns, window }) {
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
    patternId: shift.id, relatedDomains: members.map((item) => item.domain),
    // Every routine shift in the period, in date order: a multi-week briefing
    // tells one stretch from several, and whether the latest one is still
    // running at the period's end.
    shifts: characterization.filter((item) => item.kind === BriefingPatternKind.ROUTINE_SHIFT)
      .map((item) => describeShift(item, byId, window))
      .sort((left, right) => left.span.startDate.localeCompare(right.span.startDate)) };
  return assessed(D.ROUTINE, direction === "break" ? "interrupted" : "changed", "concern", facts, [
    // A break tells the rhythm of the domains it spans — missed sessions, an
    // activity dip — never their progress.
    insight(D.ROUTINE, "routine_break", InsightRole.EXECUTION, "concern", Math.min(3, shift.materiality / 2), facts,
      { coversKinds: ["activity_change", "training_frequency", "activity_on_plan"] }),
  ]);
}

function describeShift(shift, byId, window) {
  const members = (shift.members ?? []).map((id) => byId.get(id)).filter(Boolean);
  const dates = [...new Set(members.flatMap((item) => item.dates ?? []))].sort();
  return { id: shift.id, span: shift.span, position: shift.position, domains: shift.domains,
    extentDays: dates.length, affectedDates: dates, reachesPeriodEnd: Boolean(window && shift.span?.endDate === window.endDate),
    missed: members.filter((item) => item.kind === BriefingPatternKind.ROUTINE_GAP).map((item) => ({ domain: item.domain, dates: item.dates })),
    lower: members.filter((item) => item.kind === BriefingPatternKind.VALUE_RUN && item.direction === "below")
      .map((item) => ({ domain: item.domain, dates: item.dates })),
    higher: members.filter((item) => item.kind === BriefingPatternKind.VALUE_RUN && item.direction === "above")
      .map((item) => ({ domain: item.domain, dates: item.dates })) };
}

// Recovery/Sleep: supporting recovery context from completed, eligible
// canonical sleep nights — never a goal of its own, never a diagnosis and never
// a generic sleep target. Total sleep is judged only against the person's own
// usual, and only once enough prior nights establish that usual; until then the
// domain reports what it has, with the short history as its uncertainty, and
// offers nothing to say. A finding needs a consistent shortfall across most of
// the period's nights (one short night is never a story), carries modest
// strength so it cannot outrank body-composition, energy or training evidence,
// and names no cause. Stage detail is described, never judged.
export const RECOVERY_SLEEP_POLICY = Object.freeze({
  // Nights a period needs before anything about it can be said.
  minWindowNights: 3,
  minWindowCoverage: 0.5,
  // Prior nights (before the period) that establish a personal usual.
  baselineMinNights: 14,
  // A night this far below the personal usual counts as short.
  shortfallMinutes: 45,
  // Share of the period's nights that must be short for a finding.
  consistentShare: 2 / 3,
  maxStrength: 1.8,
});

function assessRecovery({ days, windowDays, window }) {
  const P = RECOVERY_SLEEP_POLICY;
  const minutes = (day) => Math.round(day.recovery.sleep?.asleepSeconds != null
    ? day.recovery.sleep.asleepSeconds / 60 : day.recovery.sleepHours * 60);
  const hasNight = (day) => Number.isFinite(day?.recovery?.sleepHours);
  const nights = windowDays.filter(hasNight);
  const prior = window ? days.filter((day) => day.date < window.startDate && hasNight(day)) : [];
  if (!nights.length && !prior.length) return unavailable(D.RECOVERY, "no_recovery_evidence_yet");
  const values = nights.map(minutes);
  const baselineEstablished = prior.length >= P.baselineMinNights;
  const usual = baselineEstablished ? median(prior.map(minutes)) : null;
  const facts = {
    windowNights: nights.length,
    windowDays: windowDays.length,
    priorNights: prior.length,
    meanAsleepMinutes: values.length ? Math.round(mean(values)) : null,
    shortestAsleepMinutes: values.length ? Math.min(...values) : null,
    longestAsleepMinutes: values.length ? Math.max(...values) : null,
    stagedNights: nights.filter((day) => day.recovery.sleep?.stageDetail === "staged").length,
    baselineEstablished,
    usualAsleepMinutes: usual,
    // Plain statement of what this evidence cannot yet support.
    uncertainty: baselineEstablished ? null : "short_history_no_personal_baseline",
  };
  const coverage = windowDays.length ? nights.length / windowDays.length : 0;
  if (nights.length < P.minWindowNights || coverage < P.minWindowCoverage) {
    return insufficient(D.RECOVERY, "too_few_nights", facts);
  }
  if (!baselineEstablished) return insufficient(D.RECOVERY, "no_personal_baseline_yet", facts);
  const short = nights.filter((day) => minutes(day) <= usual - P.shortfallMinutes);
  if (short.length < Math.ceil(P.consistentShare * nights.length)) {
    return assessed(D.RECOVERY, "within_personal_usual", "neutral", facts, []);
  }
  const affectedDates = short.map((day) => day.date);
  const shortfall = { ...facts, shortNights: short.length, affectedDates, extentDays: short.length,
    meanShortfallMinutes: Math.round(mean(short.map((day) => usual - minutes(day)))) };
  const strength = Math.min(P.maxStrength,
    1 + 0.8 * (short.length / nights.length) * Math.min(1, nights.length / 7));
  return assessed(D.RECOVERY, "below_personal_usual", "concern", shortfall, [
    // Execution-scoped recovery context: what happened, never why, and never a
    // step of its own. A partial window cannot conclude it.
    // `supportingContext`: it never takes a lead slot ahead of goal evidence.
    insight(D.RECOVERY, "sleep_below_usual", InsightRole.EXECUTION, "concern", strength, shortfall,
      { requiresCompleteWindow: true, supportingContext: true }),
  ]);
}

// Visual change from progress photos: its own evidence, scaled by how much
// actually changed; never a composition measurement.
function assessVisualChange({ goalFacts, window }) {
  const visual = goalFacts.visual;
  if (!visual?.available) return unavailable(D.VISUAL, "no_photo_comparison");
  const fresh = window && visual.capturedAt >= window.startDate && visual.capturedAt <= window.endDate;
  // A comparison whose amount of change the producer did not measure: the
  // photos lead a Photo briefing as the reason for it, never with an
  // invented magnitude, and never deepen it.
  if (!["visible", "subtle", "none"].includes(visual.change)) {
    const facts = { ...visual, newThisPeriod: Boolean(fresh), magnitude: "not_measured" };
    return assessed(D.VISUAL, "compared_magnitude_not_measured", "neutral", facts, [
      insight(D.VISUAL, "visual_comparison", fresh ? InsightRole.OUTCOME : InsightRole.CONTEXT, "neutral", fresh ? 1.4 : 0.6, facts),
    ]);
  }
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

function robustFit(points) {
  const slopes = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      if (points[j].x !== points[i].x) slopes.push((points[j].y - points[i].y) / (points[j].x - points[i].x));
    }
  }
  if (!slopes.length) return linearFit(points);
  const slope = median(slopes);
  const intercept = median(points.map((point) => point.y - slope * point.x));
  return { slope, intercept, n: points.length };
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
