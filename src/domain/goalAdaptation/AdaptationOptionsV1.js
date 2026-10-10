// Phase B (dormant): ranked, personalized adaptation options.
//
// For a proposal rung from Phase A, builds the valid options with:
// - energy targets from the user's own calibration (logged-calorie units),
// - realistic timeline ranges (never a single promised date),
// - projected guardrail position and validation against the user's limits,
// - plain tradeoffs.
// Options are ranked; the top option is recommended only when the evidence
// supports it. Nothing is persisted or applied: the user always decides.

import { GOAL_ADAPTATION_POLICY_V1 } from "./GoalAdaptationPolicyV1.js";
import { AdaptationRung } from "./AdaptationDecisionV1.js";
import { addDays, daysBetween } from "./ScheduleCorrectionV1.js";

export const ADAPTATION_OPTIONS_VERSION = "goal_adaptation_options_v1";
const CONFIDENCE_ORDER = { none: 0, low: 1, moderate: 2, high: 3 };

export function buildAdaptationOptions(context) {
  const { rung, archetype, policy = GOAL_ADAPTATION_POLICY_V1 } = context;
  const ctx = { ...context, policy, rules: policy.phaseB };
  const energyAllowed = context.calibration?.status === "calibrated" &&
    CONFIDENCE_ORDER[context.calibration.confidence] >= CONFIDENCE_ORDER[ctx.rules.recommendation.requireCalibrationConfidenceForEnergyNumbers];
  ctx.energyAllowed = energyAllowed;
  const builders = optionBuilders(rung, archetype);
  if (!builders.length) return freeze({ version: ADAPTATION_OPTIONS_VERSION, rung, options: [], recommendedKind: null, note: "no_options_for_this_rung" });
  const options = builders.map((build, index) => ({ ...build(ctx), priority: index }));
  const ranked = rank(options);
  const top = ranked[0];
  const recommend = ctx.rules.recommendation.recommendTopOnlyWhenEvidenceSufficient
    ? context.evidenceSufficient === true && top.valid && top.fitsLimits !== false && (top.energy?.status !== "requires_calibration")
    : true;
  return freeze({
    version: ADAPTATION_OPTIONS_VERSION,
    policyStatus: ctx.rules.status,
    rung,
    calibrationUsed: energyAllowed,
    options: ranked.map((option, index) => ({ ...option, rank: index + 1, recommended: recommend && index === 0 })),
    recommendedKind: recommend ? top.kind : null,
    note: recommend ? "top_option_recommended_evidence_supports_it" : "options_shown_without_recommendation",
    automaticApplicationAllowed: false,
  });
}

function rank(options) {
  return [...options].sort((a, b) =>
    Number(a.kind === "custom") - Number(b.kind === "custom") ||
    Number(!a.valid) - Number(!b.valid) ||
    Number(a.fitsLimits === false) - Number(b.fitsLimits === false) ||
    a.priority - b.priority);
}

function optionBuilders(rung, archetype) {
  const R = AdaptationRung;
  if ([R.RESOLVE_CONSTRAINT_CONFLICT, R.GUARDRAIL_REVIEW].includes(rung) && archetype === "lean_mass_gain") return [leanOutFirst, keepBuildingRevised, keepCurrentPlan, custom];
  if (rung === R.GUARDRAIL_REVIEW && archetype === "fat_loss") return [slowTheCut, dietBreak, keepCurrentPlanRisky, custom];
  if (rung === R.GUARDRAIL_REVIEW && archetype === "maintenance") return [tightenBriefly, widenRange, keepCurrentPlan, custom];
  if (rung === R.REVIEW_TIMELINE || rung === R.RESOLVE_CONSTRAINT_CONFLICT) return [extendDate, increaseRate, keepCurrentPlan, custom];
  if (rung === R.STRATEGY_REVIEW && archetype === "strength") return [deloadThenProgress, changeProgramVariables, keepProgram, custom];
  if (rung === R.STRATEGY_REVIEW) return [smallIntakeChange, recheckSoon, custom];
  if (rung === R.BELOW_RANGE_REVIEW) return [eatMore, adjustLowerBound, keepCurrentPlan, custom];
  if (rung === R.SUSTAINABILITY_REVIEW) return [realisticTargets, adherenceSupport, custom];
  if (rung === R.PHASE_TIME_LIMIT_REVIEW) return [extendLeaning, resumeBuildingRevised, maintainForNow, custom];
  if (rung === R.GOAL_ACHIEVED) return [maintainForNow, setNextGoal, raiseTarget, custom];
  return [];
}

// ---------------------------------------------------------------------------
// Shared calculations
// ---------------------------------------------------------------------------
const r25 = (value, step = 25) => Math.round(value / step) * step;
const range = (low, high, step = 25) => ({ low: r25(Math.min(low, high), step), high: r25(Math.max(low, high), step) });
const oneDecimal = (value) => Math.round(value * 10) / 10;

function maintenance(ctx) { return ctx.calibration?.maintenanceKcal?.estimate ?? null; }

function energy(ctx, { intakeLow, intakeHigh, basis, activityKcal = ctx.plan?.activityKcal ?? null }) {
  if (!ctx.energyAllowed) return { status: "requires_calibration", basis: "shown once the engine can calibrate from your own history" };
  if (!Number.isFinite(intakeLow) || !Number.isFinite(intakeHigh)) return { status: "requires_plan_target", basis: "needs a current calorie target to adjust from" };
  const floor = maintenance(ctx) * (1 - ctx.rules.limits.maximumDeficitFractionOfMaintenance);
  const ceiling = maintenance(ctx) + ctx.rules.limits.maximumSurplusKcal;
  const clampedLow = Math.min(Math.max(intakeLow, floor), ceiling);
  const clampedHigh = Math.min(Math.max(intakeHigh, floor), ceiling);
  const intake = range(clampedLow, clampedHigh, ctx.rules.limits.roundingKcal);
  return {
    status: "calibrated",
    intakeKcal: intake,
    activityKcal,
    changeFromPlanKcal: ctx.plan?.intakeKcal != null ? range(intake.low - ctx.plan.intakeKcal, intake.high - ctx.plan.intakeKcal) : null,
    clamped: clampedLow !== intakeLow || clampedHigh !== intakeHigh ? "limited_to_safe_bounds" : null,
    basis,
    maintenanceKcal: ctx.calibration.maintenanceKcal,
  };
}

function bodyFatAt(fat, weight) { return (fat / weight) * 100; }

function leaningMath(ctx) {
  const { body, guardrail } = ctx;
  const { lower, upper } = guardrail.structured;
  const targetPct = lower + (upper - lower) * ctx.rules.guardrailTargetPositionInRange;
  const targetFat = (body.leanLb * targetPct) / (100 - targetPct);
  const fatToLose = Math.max(0, body.fatLb - targetFat);
  const scanError = ctx.rules.measurementError.scanFatLb;
  const [rateLow, rateHigh] = ctx.rules.rates.leaningPercentBodyWeightPerWeek;
  const [shareLow, shareHigh] = ctx.rules.rates.leaningFatShareOfLoss;
  const lossLow = (body.weightLb * rateLow) / 100;
  const lossHigh = (body.weightLb * rateHigh) / 100;
  const weeks = {
    low: Math.max(1, Math.ceil(Math.max(0.5, fatToLose - scanError) / (lossHigh * shareHigh))),
    high: Math.max(1, Math.ceil((fatToLose + scanError) / (lossLow * shareLow))),
  };
  const deficit = { low: (lossLow * ctx.rules.energyDensityKcalPerLb.mixedWeightLoss) / 7, high: (lossHigh * ctx.rules.energyDensityKcalPerLb.mixedWeightLoss) / 7 };
  return { targetPct, fatToLose, weeks, deficit, lossPerWeek: { low: oneDecimal(lossLow), high: oneDecimal(lossHigh) } };
}

function remainingGoal(ctx) { return Math.max(0, Number(ctx.progress?.remaining ?? 0)); }

function slowBuildMonths(ctx) {
  const [low, high] = ctx.rules.rates.slowBuildLeanLbPerMonth;
  const remaining = remainingGoal(ctx);
  return { low: remaining / high, high: remaining / low };
}

function completionWindow(ctx, startOffsetDays, months) {
  return { earliest: addDays(ctx.asOf, Math.round(startOffsetDays.low + months.low * 30.4)), latest: addDays(ctx.asOf, Math.round(startOffsetDays.high + months.high * 30.4)) };
}

function deadlineCheck(ctx, completion) {
  const deadline = ctx.goal?.timeline?.targetDate;
  if (!deadline || !completion) return [];
  return completion.earliest > deadline ? ["goal_date_not_reachable_with_this_option"] : completion.latest > deadline ? ["goal_date_at_risk_with_this_option"] : [];
}

// ---------------------------------------------------------------------------
// Option builders
// ---------------------------------------------------------------------------
function leanOutFirst(ctx) {
  if (!ctx.body || !ctx.guardrail?.structured) return unavailable("lean_out_first", "Lean out first, then keep building", "needs_body_composition_or_weight_evidence");
  const math = leaningMath(ctx);
  const m = maintenance(ctx);
  const completion = completionWindow(ctx, { low: math.weeks.low * 7, high: math.weeks.high * 7 }, slowBuildMonths(ctx));
  return {
    kind: "lean_out_first",
    label: "Lean out first, then keep building",
    valid: true,
    fitsLimits: true,
    energy: energy(ctx, { intakeLow: m - math.deficit.high, intakeHigh: m - math.deficit.low, basis: `maintenance minus ${Math.round(math.deficit.low)}–${Math.round(math.deficit.high)} kcal/day for ${math.lossPerWeek.low}–${math.lossPerWeek.high} lb/week` }),
    timeline: { phaseWeeks: math.weeks, goalCompletion: completion, note: "leaning first, then a slower build for the remaining gain" },
    projected: { bodyFatPercentAtPhaseEnd: { low: oneDecimal(math.targetPct - 0.5), high: oneDecimal(math.targetPct + 0.25) }, fatToLoseLb: oneDecimal(math.fatToLose) },
    tradeoffs: { protects: ["your body-fat range", "the lean mass you've built"], costs: [`${math.weeks.low}–${math.weeks.high} weeks with building paused`, "goal date moves later"] },
    validation: { errors: [], warnings: deadlineCheck(ctx, completion) },
  };
}

function keepBuildingRevised(ctx) {
  if (!ctx.body || !ctx.guardrail?.structured) return unavailable("keep_building_revised_limits", "Keep building with a new range and date", "needs_body_composition_or_weight_evidence");
  const [sLow, sHigh] = ctx.rules.rates.slowBuildSurplusKcal;
  const months = slowBuildMonths(ctx);
  const remaining = remainingGoal(ctx);
  const ratios = [0.6, 1.2];
  const fats = ratios.map((ratio) => ctx.body.fatLb + remaining * ratio);
  const weights = ratios.map((ratio) => ctx.body.weightLb + remaining * (1 + ratio));
  const bfAtEnd = { low: oneDecimal(bodyFatAt(fats[0], weights[0])), high: oneDecimal(bodyFatAt(fats[1], weights[1])) };
  const requiredUpper = Math.ceil(bfAtEnd.high * 2) / 2;
  const completion = completionWindow(ctx, { low: 0, high: 0 }, months);
  const m = maintenance(ctx);
  return {
    kind: "keep_building_revised_limits",
    label: "Keep building with a new range and date",
    valid: true,
    fitsLimits: bfAtEnd.high <= ctx.guardrail.structured.upper,
    requires: { upperLimitAtLeast: requiredUpper, newGoalDate: true },
    energy: energy(ctx, { intakeLow: m + sLow, intakeHigh: m + sHigh, basis: `maintenance plus a small ${sLow}–${sHigh} kcal surplus` }),
    timeline: { goalCompletion: completion, note: `${oneDecimal(months.low)}–${oneDecimal(months.high)} months for the remaining ${oneDecimal(remaining)} lb at a slower, leaner gain` },
    projected: { bodyFatPercentAtCompletion: bfAtEnd },
    tradeoffs: { protects: ["building momentum"], costs: [`body fat likely ends around ${bfAtEnd.low}–${bfAtEnd.high}%`, `needs an upper limit of at least ${requiredUpper}%`, "more fat to remove later"] },
    validation: { errors: [], warnings: [...deadlineCheck(ctx, completion), ...(bfAtEnd.high > ctx.guardrail.structured.upper ? ["requires_revised_body_fat_range"] : [])] },
  };
}

function keepCurrentPlan(ctx) {
  const leanRate = ctx.progress?.measuredRatePerDay ?? null;
  const fatRate = ctx.progress?.fatRatePerDay ?? null;
  const remaining = remainingGoal(ctx);
  let completion = null;
  let bf = null;
  if (leanRate > 0 && remaining > 0) {
    const days = { low: remaining / (leanRate * 1.25), high: remaining / (leanRate * 0.75) };
    completion = { earliest: addDays(ctx.asOf, Math.round(days.low)), latest: addDays(ctx.asOf, Math.round(days.high)) };
    if (ctx.body && fatRate != null) {
      const fatLow = ctx.body.fatLb + fatRate * days.low;
      const fatHigh = ctx.body.fatLb + fatRate * days.high;
      bf = { low: oneDecimal(bodyFatAt(fatLow, ctx.body.weightLb + (leanRate + fatRate) * days.low)), high: oneDecimal(bodyFatAt(fatHigh, ctx.body.weightLb + (leanRate + fatRate) * days.high)) };
    }
  }
  const upper = ctx.guardrail?.structured?.upper;
  const position = ctx.guardrail?.evaluation?.position;
  const fits = position === "within" && (bf == null || upper == null || bf.high <= upper);
  return {
    kind: "keep_current_plan",
    label: "Keep my current plan",
    valid: true,
    fitsLimits: fits,
    energy: ctx.plan?.intakeKcal != null ? { status: "unchanged", intakeKcal: { low: ctx.plan.intakeKcal, high: ctx.plan.intakeKcal }, activityKcal: ctx.plan.activityKcal ?? null, changeFromPlanKcal: { low: 0, high: 0 }, basis: "your current targets" } : { status: "unchanged" },
    timeline: { goalCompletion: completion, note: completion ? "at your recently measured pace" : "pace not measurable yet" },
    projected: bf ? { bodyFatPercentAtCompletion: bf } : {},
    tradeoffs: { protects: ["no changes to your routine"], costs: fits ? [] : ["works against the limits you set"] },
    validation: { errors: [], warnings: [...deadlineCheck(ctx, completion), ...(fits ? [] : ["outside_your_limits"])] },
  };
}

function keepCurrentPlanRisky(ctx) {
  const option = keepCurrentPlan(ctx);
  return { ...option, fitsLimits: false, tradeoffs: { protects: ["fastest fat loss"], costs: ["continued lean-mass loss is likely"] }, validation: { errors: [], warnings: ["lean_mass_floor_breached"] } };
}

function slowTheCut(ctx) {
  const [low, high] = ctx.rules.rates.cutSlowdownKcal;
  const plan = ctx.plan?.intakeKcal;
  return {
    kind: "slow_the_cut", label: "Slow the cut to protect lean mass", valid: true, fitsLimits: true,
    energy: plan != null ? energy(ctx, { intakeLow: plan + low, intakeHigh: plan + high, basis: `${low}–${high} kcal more than your current target` }) : energy(ctx, { intakeLow: NaN, intakeHigh: NaN }),
    timeline: { note: "the goal date moves later by roughly 1–3 weeks" },
    tradeoffs: { protects: ["lean mass"], costs: ["slower fat loss"] }, validation: { errors: [], warnings: [] },
  };
}

function dietBreak(ctx) {
  const m = maintenance(ctx);
  return {
    kind: "diet_break", label: "Take a 1–2 week maintenance break", valid: true, fitsLimits: true,
    energy: energy(ctx, { intakeLow: m - 50, intakeHigh: m + 50, basis: "your calibrated maintenance" }),
    timeline: { phaseWeeks: { low: 1, high: 2 }, note: "the cut resumes when you choose" },
    tradeoffs: { protects: ["lean mass", "training quality"], costs: ["1–2 weeks without fat loss"] }, validation: { errors: [], warnings: [] },
  };
}

function tightenBriefly(ctx) {
  const [low, high] = ctx.rules.rates.maintenanceTighteningKcal;
  const m = maintenance(ctx);
  return {
    kind: "tighten_briefly", label: "Tighten intake for 2–3 weeks", valid: true, fitsLimits: true,
    energy: energy(ctx, { intakeLow: m - high, intakeHigh: m - low, basis: `${low}–${high} kcal under your calibrated maintenance` }),
    timeline: { phaseWeeks: { low: 2, high: 3 } }, tradeoffs: { protects: ["your maintenance range"], costs: ["a short stretch of lower intake"] }, validation: { errors: [], warnings: [] },
  };
}

function widenRange(ctx) {
  const value = ctx.guardrail?.evaluation?.position === "above" ? ctx.guardrail.structured.upper + (ctx.guardrail.evaluation.deviation ?? 0) : null;
  return {
    kind: "adjust_range", label: "Widen your range", valid: true, fitsLimits: true,
    requires: value != null ? { upperLimitAtLeast: Math.ceil(value * 2) / 2 } : {},
    energy: { status: "unchanged" }, timeline: {}, tradeoffs: { protects: ["no change to eating"], costs: ["accepts a higher weight"] }, validation: { errors: [], warnings: [] },
  };
}

function extendDate(ctx) {
  const rate = ctx.progress?.measuredRatePerDay ?? ctx.schedule?.measuredRate ?? null;
  const remaining = remainingGoal(ctx);
  const completion = rate > 0 ? { earliest: addDays(ctx.asOf, Math.round(remaining / (rate * 1.25))), latest: addDays(ctx.asOf, Math.round(remaining / (rate * 0.75))) } : null;
  return {
    kind: "extend_date", label: "Keep the plan and move the date", valid: true, fitsLimits: true,
    energy: { status: "unchanged" }, timeline: { goalCompletion: completion, note: "at your recently measured pace" },
    tradeoffs: { protects: ["your current routine and limits"], costs: ["a later goal date"] }, validation: { errors: [], warnings: [] },
  };
}

function increaseRate(ctx) {
  const plan = ctx.plan?.intakeKcal;
  const cutting = ctx.archetype === "fat_loss";
  const [low, high] = cutting ? ctx.rules.rates.cutSlowdownKcal : ctx.rules.rates.stallSurplusIncreaseKcal;
  const intake = plan != null ? (cutting ? { l: plan - high, h: plan - low } : { l: plan + low, h: plan + high }) : null;
  return {
    kind: "adjust_energy", label: cutting ? "Eat a little less to keep the date" : "Eat a little more to keep the date", valid: true, fitsLimits: null,
    energy: intake ? energy(ctx, { intakeLow: intake.l, intakeHigh: intake.h, basis: `${low}–${high} kcal ${cutting ? "below" : "above"} your current target` }) : energy(ctx, { intakeLow: NaN, intakeHigh: NaN }),
    timeline: { note: "the date may still slip; the next check-in will tell" },
    tradeoffs: { protects: ["your goal date"], costs: [cutting ? "a harder deficit" : "more risk of fat gain"] }, validation: { errors: [], warnings: [] },
  };
}

function smallIntakeChange(ctx) {
  const plan = ctx.plan?.intakeKcal;
  const [low, high] = ctx.rules.rates.stallSurplusIncreaseKcal;
  const cutting = ctx.archetype === "fat_loss";
  return {
    kind: "adjust_energy", label: cutting ? "Lower intake slightly" : "Raise intake slightly", valid: true, fitsLimits: true,
    energy: plan != null ? energy(ctx, { intakeLow: cutting ? plan - high : plan + low, intakeHigh: cutting ? plan - low : plan + high, basis: `${low}–${high} kcal ${cutting ? "below" : "above"} your current target` }) : energy(ctx, { intakeLow: NaN, intakeHigh: NaN }),
    timeline: { note: "reassess after 3 weeks" }, tradeoffs: { protects: ["progress restarting"], costs: [cutting ? "a harder deficit" : "some extra fat gain"] }, validation: { errors: [], warnings: [] },
  };
}

function recheckSoon() {
  return { kind: "recheck_soon", label: "Keep the plan and recheck in 2 weeks", valid: true, fitsLimits: true, energy: { status: "unchanged" }, timeline: { phaseWeeks: { low: 2, high: 2 } }, tradeoffs: { protects: ["no change"], costs: ["two more weeks before acting"] }, validation: { errors: [], warnings: [] } };
}

function deloadThenProgress() {
  return { kind: "deload_then_progress", label: "Deload for a week, then progress again", valid: true, fitsLimits: true, energy: { status: "not_applicable" }, timeline: { phaseWeeks: { low: 1, high: 1 }, note: "reassess after 3–4 weeks of comparable sessions" }, tradeoffs: { protects: ["recovery and joints"], costs: ["one lighter week"] }, validation: { errors: [], warnings: [] } };
}
function changeProgramVariables() {
  return { kind: "change_program_variables", label: "Change rep ranges or exercise selection", valid: true, fitsLimits: true, energy: { status: "not_applicable" }, timeline: { note: "reassess after 4 weeks" }, tradeoffs: { protects: ["a new stimulus"], costs: ["new numbers to re-baseline"] }, validation: { errors: [], warnings: [] } };
}
function keepProgram() {
  return { kind: "keep_current_plan", label: "Keep the current program", valid: true, fitsLimits: true, energy: { status: "not_applicable" }, timeline: {}, tradeoffs: { protects: ["consistency"], costs: ["the plateau may continue"] }, validation: { errors: [], warnings: [] } };
}

function eatMore(ctx) {
  const plan = ctx.plan?.intakeKcal;
  const [low, high] = ctx.rules.rates.belowRangeIntakeIncreaseKcal;
  return {
    kind: "adjust_energy", label: "Eat a little more", valid: true, fitsLimits: true,
    energy: plan != null ? energy(ctx, { intakeLow: plan + low, intakeHigh: plan + high, basis: `${low}–${high} kcal above your current target` }) : energy(ctx, { intakeLow: NaN, intakeHigh: NaN }),
    timeline: { note: "body fat should settle back into range over the next weeks" }, tradeoffs: { protects: ["your preferred range"], costs: ["slightly more food"] }, validation: { errors: [], warnings: [] },
  };
}
function adjustLowerBound(ctx) {
  const lower = ctx.guardrail?.structured?.lower;
  const deviation = ctx.guardrail?.evaluation?.deviation ?? 0;
  return { kind: "adjust_range", label: "Lower the bottom of your range", valid: true, fitsLimits: true, requires: lower != null ? { lowerLimitAtMost: Math.floor((lower - deviation) * 2) / 2 } : {}, energy: { status: "unchanged" }, timeline: {}, tradeoffs: { protects: ["no change to eating"], costs: ["accepts a leaner range"] }, validation: { errors: [], warnings: [] } };
}

function realisticTargets(ctx) {
  const observed = ctx.observedIntakeKcal ?? null;
  return {
    kind: "realistic_targets", label: "Set targets you can keep, and adjust expectations", valid: true, fitsLimits: null,
    energy: observed != null ? energy(ctx, { intakeLow: observed - 100, intakeHigh: observed + 50, basis: "close to what you've actually been eating" }) : energy(ctx, { intakeLow: NaN, intakeHigh: NaN }),
    timeline: { note: "the goal date is re-estimated from the new targets" }, tradeoffs: { protects: ["a plan you can sustain"], costs: ["slower progress or a revised goal"] }, validation: { errors: [], warnings: [] },
  };
}
function adherenceSupport() {
  return { kind: "adherence_support", label: "Keep the targets, with weekly support", valid: true, fitsLimits: true, energy: { status: "unchanged" }, timeline: {}, tradeoffs: { protects: ["the original plan"], costs: ["needs closer tracking"] }, validation: { errors: [], warnings: [] } };
}

function extendLeaning() {
  return { kind: "extend_leaning", label: "Keep leaning a little longer", valid: true, fitsLimits: true, energy: { status: "unchanged", basis: "your leaning targets" }, timeline: { phaseWeeks: { low: 2, high: 2 } }, tradeoffs: { protects: ["getting back into range"], costs: ["building waits"] }, validation: { errors: [], warnings: [] } };
}
function resumeBuildingRevised(ctx) {
  return { kind: "resume_building_revised", label: "Resume building with a range set for this phase", valid: true, fitsLimits: true, requires: { revisedRangeForPhase: true }, energy: energy(ctx, { intakeLow: maintenance(ctx) + ctx.rules.rates.slowBuildSurplusKcal[0], intakeHigh: maintenance(ctx) + ctx.rules.rates.slowBuildSurplusKcal[1], basis: "maintenance plus a small surplus" }), timeline: {}, tradeoffs: { protects: ["building momentum"], costs: ["body fat stays above your usual range for now"] }, validation: { errors: [], warnings: [] } };
}
function maintainForNow(ctx) {
  const m = maintenance(ctx);
  return { kind: "maintain", label: "Maintain for a while", valid: true, fitsLimits: true, energy: energy(ctx, { intakeLow: m - 50, intakeHigh: m + 50, basis: "your calibrated maintenance" }), timeline: {}, tradeoffs: { protects: ["what you've achieved"], costs: ["no further progress for now"] }, validation: { errors: [], warnings: [] } };
}
function setNextGoal() {
  return { kind: "set_next_goal", label: "Choose your next goal", valid: true, fitsLimits: true, energy: { status: "not_applicable" }, timeline: {}, tradeoffs: { protects: ["momentum"], costs: ["a new plan to set up"] }, validation: { errors: [], warnings: [] } };
}
function raiseTarget() {
  return { kind: "raise_target", label: "Keep going with a higher target", valid: true, fitsLimits: true, energy: { status: "unchanged" }, timeline: {}, tradeoffs: { protects: ["current momentum"], costs: ["a longer goal"] }, validation: { errors: [], warnings: [] } };
}
function custom() {
  return { kind: "custom", label: "Make my own changes", valid: true, fitsLimits: null, energy: { status: "user_defined" }, timeline: {}, tradeoffs: { protects: ["full control"], costs: [] }, validation: { errors: [], warnings: [] } };
}
function unavailable(kind, label, reason) {
  return { kind, label, valid: false, fitsLimits: null, energy: { status: "not_available" }, timeline: {}, tradeoffs: { protects: [], costs: [] }, validation: { errors: [reason], warnings: [] } };
}

// ---------------------------------------------------------------------------
// Revalidation (on entry and at approval)
// ---------------------------------------------------------------------------
export function revalidateRecommendation({ recommendation, current, asOf, policy = GOAL_ADAPTATION_POLICY_V1 }) {
  const rules = policy.phaseB.revalidation;
  const reasons = [];
  if (recommendation.evidenceFingerprint !== current.evidenceFingerprint) reasons.push("material_evidence_changed");
  const before = recommendation.maintenanceEstimateKcal;
  const after = current.calibration?.maintenanceKcal?.estimate ?? null;
  if (before != null && after != null && Math.abs(after - before) >= rules.calibrationShiftKcal) reasons.push("energy_calibration_shifted");
  if (recommendation.recommendedKind !== (current.options?.recommendedKind ?? null)) reasons.push("recommended_option_changed");
  const age = daysBetween(recommendation.createdOn, asOf);
  const expired = age > rules.maximumAgeDays;
  if (expired) reasons.push("recommendation_older_than_limit");
  const status = reasons.some((reason) => reason !== "recommendation_older_than_limit") ? "superseded" : expired ? "expired_needs_refresh" : "current";
  return freeze({ status, reasons, ageDays: age, approvalAllowed: status === "current" });
}

function freeze(value) { return Object.freeze(value); }
