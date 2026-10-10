// Founder scenario acceptance fixtures v1 for Goal Adaptation Phase 0/A.
//
// Each scenario is a versioned, reproducible input to the ACTUAL shadow engine
// (`evaluateGoalAdaptationShadow`) with an explicit expected result. Founder
// scenarios reuse sanitized production assessments; every other scenario is
// synthetic and labelled as such. `illustrativeCopy` is design copy from the
// accepted V2 board, NOT engine output (the narrative layer is not wired yet).

import {
  FOUNDER_BODY_FAT_V3_GUARDRAIL,
  FOUNDER_GOAL,
  FOUNDER_V3_ASSESSMENTS,
  LEAN_MASS_BUILD_PHASE_START,
  adherenceWeeksAsOf,
  coverageSignalsAsOf,
} from "../fixtures/founderLeanMassGolden.js";

export const SCENARIO_SET_VERSION = "goal_adaptation_scenarios_v1";

const founder = (asOf) => FOUNDER_V3_ASSESSMENTS.find((item) => item.asOf === asOf);
const founderInputs = (item) => ({
  goal: FOUNDER_GOAL,
  phaseStartDate: LEAN_MASS_BUILD_PHASE_START,
  asOf: item.asOf,
  triggerFamily: item.family,
  trajectory: item.trajectory,
  outlookAsOf: item.outlookAsOf,
  v3Guardrail: FOUNDER_BODY_FAT_V3_GUARDRAIL,
  guardrailMeasurement: { position: item.guardrailPosition, deviation: item.guardrailDeviation ?? 0 },
  baseRecommendation: { action: item.baseAction },
  coverageSignals: coverageSignalsAsOf(item.asOf),
  bodyCompositionScanDates: ["2026-08-15", "2026-09-12", ...(item.asOf >= "2026-10-09" ? ["2026-10-09"] : [])],
  adherenceWeeks: adherenceWeeksAsOf(item.asOf),
});

const LEAN_GOAL = { id: "synthetic_lean_gain", type: "build_lean_mass", timeline: { startDate: "2026-01-04", targetDate: "2026-05-31" }, target: { metric: "lean_mass", amount: 8, unit: "lb", direction: "increase" } };
const CUT_GOAL = { id: "synthetic_fat_loss", type: "fat_loss", timeline: { startDate: "2026-01-04", targetDate: "2026-04-30" }, target: { metric: "body_weight", amount: 12, unit: "lb", direction: "decrease" } };
const STRENGTH_GOAL = { id: "synthetic_strength", type: "strength", timeline: { startDate: "2026-01-04", targetDate: null } };
const MAINTAIN_GOAL = { id: "synthetic_maintenance", type: "maintenance", timeline: { startDate: "2026-01-04", targetDate: null } };

const bodyFatGuardrail = (min, max) => ({
  guardrailId: "synthetic_body_fat", metricCapability: "body_composition.body_fat_percentage",
  evaluation: { mode: "allowed_range", allowedRange: { min, max } },
  severityBands: [{ status: "breached", minimumDeviation: (max - min) * 1.5 }, { status: "pressured", minimumDeviation: (max - min) * 0.5 }, { status: "watch", minimumDeviation: 0 }],
});
const leanFloorGuardrail = (floor) => ({
  guardrailId: "synthetic_lean_floor", metricCapability: "body_composition.lean_mass",
  evaluation: { mode: "allowed_range", allowedRange: { min: floor, max: 999 } },
  severityBands: [{ status: "breached", minimumDeviation: 1 }, { status: "pressured", minimumDeviation: 0.5 }, { status: "watch", minimumDeviation: 0 }],
});
const weightRangeGuardrail = (min, max) => ({
  guardrailId: "synthetic_weight_range", metricCapability: "body_weight.morning_weight",
  evaluation: { mode: "allowed_range", allowedRange: { min, max } },
  severityBands: [{ status: "breached", minimumDeviation: (max - min) * 1.5 }, { status: "pressured", minimumDeviation: (max - min) * 0.5 }, { status: "watch", minimumDeviation: 0 }],
});

const weeks4 = (value) => [value, value, value, value];
const coverageFull = (extra = {}) => ({
  body_weight: { daysPerWeek: weeks4(6), source: "manual" },
  training_performance: { daysPerWeek: weeks4(3), source: "manual" },
  nutrition_intake: { daysPerWeek: weeks4(6), source: "healthkit" },
  activity_energy: { daysPerWeek: weeks4(7), source: "healthkit" },
  ...extra,
});
const adherenceGood = [
  { weekStart: "w1", measuredDays: 7, withinDays: 6, overDays: 1, underDays: 0 },
  { weekStart: "w2", measuredDays: 6, withinDays: 5, overDays: 0, underDays: 1 },
];
const adherenceOver = [
  { weekStart: "w1", measuredDays: 7, withinDays: 2, overDays: 5, underDays: 0 },
  { weekStart: "w2", measuredDays: 7, withinDays: 1, overDays: 6, underDays: 0 },
];
const trajectory = (fields) => ({ supported: true, kind: "scalar_target", ...fields });

export const GOAL_ADAPTATION_SCENARIOS_V1 = Object.freeze([
  {
    id: "F1", category: "mass_building", source: "founder_production_sanitized",
    title: "Founder, Oct 9 DEXA: about 71% of +10 lb, 22 days left, body fat above 8–9%",
    situation: "Lean Mass Build phase day 55. The Oct 9 scan shows 7.1 of 10 lb gained, body fat above the chosen range (pressured), Goal Confidence 70% (from 80). Intake on HealthKit was within ±10% of 2,500 kcal on most days.",
    inputs: founderInputs(founder("2026-10-09")),
    expected: { eligibility: "eligible", rung: "resolve_constraint_conflict", originatesProposal: true, scheduleState: "at_risk" },
    illustrativeCopy: "Review your goal options. Body fat is above your 8–9% range, and at your recent pace 10 lb would take until about early January, after your Oct 31 date.",
  },
  {
    id: "F2", category: "mass_building", source: "founder_production_sanitized",
    title: "Founder, Oct 7 Midweek: frozen 49-day runway corrected to 24 days",
    situation: "The stored V3 outlook still said 49 days left (frozen at the Sep 12 scan). Body fat in range. Midweek may never originate a recommendation.",
    inputs: founderInputs(founder("2026-10-07")),
    expected: { eligibility: "eligible", rung: "pace_unverified", originatesProposal: false, scheduleState: "ahead_with_reserve", measuredBasisState: "at_risk", timeRemainingDays: 24, coachingCount: 0 },
  },
  {
    id: "F3", category: "mass_building", source: "founder_production_sanitized",
    title: "Founder, Oct 4 Weekly: pace not verified for 22 days",
    situation: "No new outcome since Sep 12. At the last measured pace the goal would finish Oct 18, but that pace has not been re-measured.",
    inputs: founderInputs(founder("2026-10-04")),
    expected: { eligibility: "eligible", rung: "pace_unverified", originatesProposal: false, timeRemainingDays: 27, coachingCount: 1 },
  },
  {
    id: "F4", category: "mass_building", source: "founder_production_sanitized",
    title: "Founder, Sep 20 Weekly: on track, nothing to change",
    situation: "Eight days after a strong Sep 12 scan. Body fat in range, pace ahead of the deadline.",
    inputs: founderInputs(founder("2026-09-20")),
    expected: { eligibility: "eligible", rung: "none", originatesProposal: false, scheduleState: "ahead_with_reserve" },
  },
  {
    id: "M1", category: "mass_building", source: "synthetic",
    title: "Healthy mass build on track with a recent scan",
    situation: "Week 9 of a lean-mass phase, body fat 12.4% inside 11–14%, measured pace 30% ahead of what the deadline needs.",
    inputs: { goal: LEAN_GOAL, phaseStartDate: "2026-01-04", asOf: "2026-03-08", triggerFamily: "weekly_briefing",
      trajectory: trajectory({ remainingRequirement: 4, forecastRemainingRequirement: 4, discountedRate: 0.052, intervalDays: 28, deadlineAt: "2026-05-31", timeRemainingDays: 87, scheduleState: "ahead_with_reserve" }), outlookAsOf: "2026-03-05",
      v3Guardrail: bodyFatGuardrail(11, 14), guardrailMeasurement: { value: 12.4 }, coverageSignals: coverageFull(), bodyCompositionScanDates: ["2026-02-05", "2026-03-05"], adherenceWeeks: adherenceGood },
    expected: { eligibility: "eligible", rung: "none", originatesProposal: false },
  },
  {
    id: "M2", category: "mass_building", source: "synthetic",
    title: "First reading below the preferred range while building",
    situation: "Body fat 10.7% against a preferred 11–14% during a build. First time below range.",
    inputs: { goal: LEAN_GOAL, phaseStartDate: "2026-01-04", asOf: "2026-03-08", triggerFamily: "weekly_briefing",
      trajectory: trajectory({ remainingRequirement: 4, forecastRemainingRequirement: 4, discountedRate: 0.05, intervalDays: 28, deadlineAt: "2026-05-31" }), outlookAsOf: "2026-03-05",
      v3Guardrail: bodyFatGuardrail(11, 14), guardrailMeasurement: { value: 10.7 }, belowRangeHistory: ["within", "within"], coverageSignals: coverageFull(), bodyCompositionScanDates: ["2026-03-05"], adherenceWeeks: adherenceGood },
    expected: { eligibility: "eligible", rung: "below_range_watch", originatesProposal: false, coachingCount: 1 },
  },
  {
    id: "M3", category: "mass_building", source: "synthetic",
    title: "Body fat below range for three weekly evaluations",
    situation: "Same build, but body fat has stayed below 11% for three consecutive Weekly evaluations.",
    inputs: { goal: LEAN_GOAL, phaseStartDate: "2026-01-04", asOf: "2026-03-22", triggerFamily: "weekly_briefing",
      trajectory: trajectory({ remainingRequirement: 3.6, forecastRemainingRequirement: 3.6, discountedRate: 0.05, intervalDays: 28, deadlineAt: "2026-05-31" }), outlookAsOf: "2026-03-19",
      v3Guardrail: bodyFatGuardrail(11, 14), guardrailMeasurement: { value: 10.4 }, belowRangeHistory: ["below", "below"], coverageSignals: coverageFull(), bodyCompositionScanDates: ["2026-03-19"], adherenceWeeks: adherenceGood },
    expected: { eligibility: "eligible", rung: "below_range_review", originatesProposal: true },
    illustrativeCopy: "Body fat has stayed below your preferred range for three weeks. Review your options: eat a little more, or adjust the range.",
  },
  {
    id: "M4", category: "mass_building", source: "synthetic",
    title: "No DEXA ever, but weight, training and nutrition are well logged",
    situation: "A user without body-composition scans. Weight 6 days/week, training 3 days/week, nutrition from HealthKit 6 days/week. Gain is on plan.",
    inputs: { goal: LEAN_GOAL, phaseStartDate: "2026-01-04", asOf: "2026-03-08", triggerFamily: "weekly_briefing",
      trajectory: null, coverageSignals: coverageFull(), bodyCompositionScanDates: [], adherenceWeeks: adherenceGood, outcomeTrend: "progressing" },
    expected: { eligibility: "eligible", rung: "none", originatesProposal: false, coverage: "sufficient", precision: "estimated_without_body_composition_scan" },
  },
  {
    id: "M5", category: "mass_building", source: "synthetic",
    title: "No DEXA, weight gain stalled for four weeks despite on-plan eating",
    situation: "Weight trend flat for 28 days with intake on target and training logged. No scan available.",
    inputs: { goal: LEAN_GOAL, phaseStartDate: "2026-01-04", asOf: "2026-03-08", triggerFamily: "weekly_briefing",
      trajectory: null, coverageSignals: coverageFull(), bodyCompositionScanDates: [], adherenceWeeks: adherenceGood, outcomeTrend: "stalled", outcomeTrendDays: 28 },
    expected: { eligibility: "eligible", rung: "strategy_review", originatesProposal: true, precision: "estimated_without_body_composition_scan" },
    illustrativeCopy: "Your weight hasn't moved in four weeks even though you've hit your targets. Review your plan: a small calorie increase is the usual next step.",
  },
  {
    id: "L1", category: "leaning", source: "synthetic",
    title: "Leaning plateau over 10 days (likely water or scale noise)",
    situation: "Weight flat for 10 days during a cut. The measured span is too short to call a stall.",
    inputs: { goal: CUT_GOAL, phaseStartDate: "2026-01-04", asOf: "2026-03-08", triggerFamily: "weekly_briefing",
      trajectory: trajectory({ remainingRequirement: 4, forecastRemainingRequirement: 4, discountedRate: 0.0, intervalDays: 10, deadlineAt: "2026-04-30" }), outlookAsOf: "2026-03-07",
      coverageSignals: coverageFull(), adherenceWeeks: adherenceGood },
    expected: { eligibility: "eligible", rung: "none", originatesProposal: false, scheduleState: "not_measurable" },
  },
  {
    id: "L2", category: "leaning", source: "synthetic",
    title: "Leaning plateau that has persisted for four weeks",
    situation: "Weight essentially flat for 28 days with good adherence; 4 lb remain and 30 days are left.",
    inputs: { goal: CUT_GOAL, phaseStartDate: "2026-01-04", asOf: "2026-03-31", triggerFamily: "weekly_briefing",
      trajectory: trajectory({ remainingRequirement: 4, forecastRemainingRequirement: 4, discountedRate: 0.01, intervalDays: 28, deadlineAt: "2026-04-30" }), outlookAsOf: "2026-03-30",
      coverageSignals: coverageFull(), adherenceWeeks: adherenceGood },
    expected: { eligibility: "eligible", rung: "review_timeline", originatesProposal: true, scheduleState: "at_risk" },
    illustrativeCopy: "Progress has stalled for four weeks and Apr 30 looks unlikely. Review your options.",
  },
  {
    id: "L3", category: "leaning", source: "synthetic",
    title: "Overly aggressive cut: lean mass dropping in week 2",
    situation: "Two weeks into a cut, a scan shows lean mass 1.6 lb below the floor the user set. Normally still calibrating, but this is a safety exception.",
    inputs: { goal: CUT_GOAL, phaseStartDate: "2026-02-22", asOf: "2026-03-08", triggerFamily: "dexa_event_briefing",
      trajectory: trajectory({ remainingRequirement: 6, forecastRemainingRequirement: 6, discountedRate: 0.2, intervalDays: 14, deadlineAt: "2026-04-30" }), outlookAsOf: "2026-03-07",
      v3Guardrail: leanFloorGuardrail(150), guardrailMeasurement: { value: 148.4 }, coverageSignals: coverageFull(), bodyCompositionScanDates: ["2026-02-22", "2026-03-07"], adherenceWeeks: adherenceGood },
    expected: { eligibility: "eligible_safety_exception", rung: "guardrail_review", originatesProposal: true },
    illustrativeCopy: "You're losing lean mass faster than you planned. Review your options: slowing the cut usually protects it.",
  },
  {
    id: "S1", category: "strength", source: "synthetic",
    title: "Strength plateau across five weeks of comparable sessions",
    situation: "Top sets on comparable lifts unchanged for 35 days; training logged 3 days/week. No deadline.",
    inputs: { goal: STRENGTH_GOAL, phaseStartDate: "2026-01-04", asOf: "2026-03-08", triggerFamily: "monthly_briefing",
      trajectory: null, coverageSignals: { training_performance: { daysPerWeek: weeks4(3), source: "manual" } }, hasAdherenceTarget: false, outcomeTrend: "stalled", outcomeTrendDays: 35 },
    expected: { eligibility: "eligible", rung: "strategy_review", originatesProposal: true },
    illustrativeCopy: "Your main lifts haven't moved in five weeks. Review your program: a short deload or a change of rep ranges usually restarts progress.",
  },
  {
    id: "S2", category: "strength", source: "synthetic",
    title: "Strength progressing on comparable sessions",
    situation: "Comparable top sets up in each of the last four weeks.",
    inputs: { goal: STRENGTH_GOAL, phaseStartDate: "2026-01-04", asOf: "2026-03-08", triggerFamily: "weekly_briefing",
      trajectory: null, coverageSignals: { training_performance: { daysPerWeek: weeks4(3), source: "manual" } }, hasAdherenceTarget: false, outcomeTrend: "progressing", outcomeTrendDays: 28 },
    expected: { eligibility: "eligible", rung: "none", originatesProposal: false },
  },
  {
    id: "MT1", category: "maintenance", source: "synthetic",
    title: "Maintenance drift: weight 2.5 lb above the 170–174 lb range",
    situation: "Maintenance phase, morning-weight trend has drifted above the agreed range.",
    inputs: { goal: MAINTAIN_GOAL, phaseStartDate: "2026-01-04", asOf: "2026-03-08", triggerFamily: "weekly_briefing",
      trajectory: null, v3Guardrail: weightRangeGuardrail(170, 174), guardrailMeasurement: { value: 176.5 }, coverageSignals: coverageFull(), adherenceWeeks: adherenceGood },
    expected: { eligibility: "eligible", rung: "guardrail_review", originatesProposal: true },
    illustrativeCopy: "Your weight has drifted above your maintenance range. Review your options: tighten intake for a couple of weeks, or widen the range.",
  },
  {
    id: "MT2", category: "maintenance", source: "synthetic",
    title: "Maintenance holding inside the range",
    situation: "Weight trend 172 lb inside 170–174 lb, logging consistent.",
    inputs: { goal: MAINTAIN_GOAL, phaseStartDate: "2026-01-04", asOf: "2026-03-08", triggerFamily: "weekly_briefing",
      trajectory: null, v3Guardrail: weightRangeGuardrail(170, 174), guardrailMeasurement: { value: 172 }, coverageSignals: coverageFull(), adherenceWeeks: adherenceGood },
    expected: { eligibility: "eligible", rung: "none", originatesProposal: false },
  },
  {
    id: "C1", category: "mass_building", source: "synthetic",
    title: "New phase, day 12: still in calibration",
    situation: "A new build phase started 12 days ago. Body fat slightly above range (watch), pace not established.",
    inputs: { goal: LEAN_GOAL, phaseStartDate: "2026-02-25", asOf: "2026-03-08", triggerFamily: "weekly_briefing",
      trajectory: null, v3Guardrail: bodyFatGuardrail(11, 14), guardrailMeasurement: { value: 14.3 }, coverageSignals: coverageFull(), adherenceWeeks: adherenceGood },
    expected: { eligibility: "calibrating", rung: "calibrating", originatesProposal: false },
  },
  {
    id: "E1", category: "mass_building", source: "synthetic",
    title: "Insufficient evidence: few weigh-ins, and HealthKit nutrition sparse",
    situation: "Weight logged about 2 days/week (manual). HealthKit nutrition synced only about 2 days/week. Training logged.",
    inputs: { goal: LEAN_GOAL, phaseStartDate: "2026-01-04", asOf: "2026-03-08", triggerFamily: "weekly_briefing",
      trajectory: null, v3Guardrail: bodyFatGuardrail(11, 14), guardrailMeasurement: { value: 14.9 },
      coverageSignals: coverageFull({ body_weight: { daysPerWeek: [2, 1, 2, 2], source: "manual" }, nutrition_intake: { daysPerWeek: [2, 2, 1, 2], source: "healthkit" } }), adherenceWeeks: [] },
    expected: { eligibility: "insufficient_evidence", rung: "evidence_coaching", originatesProposal: false, coachingDomains: ["body_weight"] },
  },
  {
    id: "A1", category: "mass_building", source: "synthetic",
    title: "Poor plan adherence with full data coverage, but on track and in range",
    situation: "Every day is logged; intake runs well above target on most days, yet body fat is in range and pace is fine.",
    inputs: { goal: LEAN_GOAL, phaseStartDate: "2026-01-04", asOf: "2026-03-08", triggerFamily: "weekly_briefing",
      trajectory: trajectory({ remainingRequirement: 4, forecastRemainingRequirement: 4, discountedRate: 0.06, intervalDays: 28, deadlineAt: "2026-05-31" }), outlookAsOf: "2026-03-05",
      v3Guardrail: bodyFatGuardrail(11, 14), guardrailMeasurement: { value: 13.1 }, coverageSignals: coverageFull(), adherenceWeeks: adherenceOver },
    expected: { eligibility: "adherence_coaching", rung: "adherence_coaching", originatesProposal: false, coachingCount: 1 },
  },
  {
    id: "A2", category: "mass_building", source: "synthetic",
    title: "Consistent overeating is pushing body fat above range",
    situation: "Intake above target on most days for two weeks and body fat pressured above 14%. The strategy itself may be unsustainable.",
    inputs: { goal: LEAN_GOAL, phaseStartDate: "2026-01-04", asOf: "2026-03-08", triggerFamily: "weekly_briefing",
      trajectory: trajectory({ remainingRequirement: 4, forecastRemainingRequirement: 4, discountedRate: 0.06, intervalDays: 28, deadlineAt: "2026-05-31" }), outlookAsOf: "2026-03-05",
      v3Guardrail: bodyFatGuardrail(11, 14), guardrailMeasurement: { value: 15.8 }, coverageSignals: coverageFull(), adherenceWeeks: adherenceOver },
    expected: { eligibility: "eligible_sustainability_review", rung: "sustainability_review", originatesProposal: true },
    illustrativeCopy: "Eating above your target is pushing body fat up. Review your plan so it's one you can keep.",
  },
  {
    id: "G1", category: "mass_building", source: "founder_production_sanitized",
    title: "Conflicting choice: keep building with the firm 8–9% ceiling and keep Oct 31",
    situation: "Founder Oct 9 state. The user picks 'keep building', keeps 8–9% as a firm limit, and keeps Oct 31.",
    inputs: founderInputs(founder("2026-10-09")),
    choice: { keepFirmCeiling: true, keepDeadline: true },
    alternativeChoice: { keepFirmCeiling: false, revisedRange: { lower: 8, upper: 10 }, keepDeadline: true },
    expected: { rung: "resolve_constraint_conflict", choiceValid: false, choiceErrors: ["firm_ceiling_incompatible_with_continued_building_above_it"], alternativeValid: true, alternativeWarnings: ["deadline_likely_unachievable_shown_as_at_risk"] },
  },
  {
    id: "T1", category: "leaning", source: "synthetic",
    title: "Time-limited leaning phase ends before the outcome",
    situation: "A 4-week leaning phase reached its time limit; body fat came down but is not back in range.",
    inputs: { goal: LEAN_GOAL, phaseStartDate: "2026-02-08", asOf: "2026-03-08", triggerFamily: "weekly_briefing",
      trajectory: null, v3Guardrail: bodyFatGuardrail(11, 14), guardrailMeasurement: { value: 14.4 }, coverageSignals: coverageFull(), adherenceWeeks: adherenceGood,
      phaseState: { type: "temporary_leaning", endRule: "first_of", timeLimitReached: true, outcomeMet: false } },
    expected: { rung: "phase_time_limit_review", originatesProposal: true },
    illustrativeCopy: "Your 4 weeks are up. Body fat came down but isn't back in range yet. The leaning phase continues until you decide.",
  },
  {
    id: "GA1", category: "mass_building", source: "synthetic",
    title: "Goal achieved",
    situation: "A scan confirms the lean-mass target was reached.",
    inputs: { goal: LEAN_GOAL, phaseStartDate: "2026-01-04", asOf: "2026-05-20", triggerFamily: "dexa_event_briefing",
      trajectory: trajectory({ remainingRequirement: 0, forecastRemainingRequirement: 0, discountedRate: 0.05, intervalDays: 28, deadlineAt: "2026-05-31" }), outlookAsOf: "2026-05-19",
      v3Guardrail: bodyFatGuardrail(11, 14), guardrailMeasurement: { value: 13.2 }, coverageSignals: coverageFull(), adherenceWeeks: adherenceGood, goalAchievement: "achieved" },
    expected: { rung: "goal_achieved", originatesProposal: true, scheduleState: "complete" },
    illustrativeCopy: "You reached your goal. What should come next? Nothing changes until you choose.",
  },
  {
    id: "D1", category: "mass_building", source: "founder_production_sanitized",
    title: "User kept the plan; next Weekly has no material new evidence",
    situation: "After the Oct 9 recommendation the user chose 'Keep my current plan'. The Oct 11 Weekly has no new scan or guardrail change.",
    inputs: { ...founderInputs(founder("2026-10-09")), asOf: "2026-10-11", triggerFamily: "weekly_briefing" },
    deferral: { lifecycle: "kept_current_plan", evidenceFrom: "founder_2026-10-09" },
    expected: { rung: "resolve_constraint_conflict", originatesProposal: false, deferralReason: "suppressed_after_keep_plan_no_material_change" },
  },
  {
    id: "D2", category: "mass_building", source: "synthetic",
    title: "User kept the plan; a new scan shows body fat breached",
    situation: "After keeping the plan, a Nov 6 scan shows body fat now breached (1.6 points above range). Material new evidence.",
    inputs: { ...founderInputs(founder("2026-10-09")), asOf: "2026-11-06", triggerFamily: "dexa_event_briefing", outlookAsOf: "2026-11-06",
      trajectory: trajectory({ remainingRequirement: 2.4, forecastRemainingRequirement: 2.4, discountedRate: 0.018, intervalDays: 28, deadlineAt: "2026-10-31" }),
      guardrailMeasurement: { position: "above", deviation: 1.6 } },
    deferral: { lifecycle: "kept_current_plan", evidenceFrom: "founder_2026-10-09" },
    expected: { rung: "resolve_constraint_conflict", originatesProposal: true, deferralReason: "material_new_evidence_after_keep_plan", scheduleState: "deadline_passed" },
  },
  {
    id: "P1", category: "mass_building", source: "founder_production_sanitized",
    title: "Photo Event without proven photo reliability",
    situation: "Same evidence as Oct 9, but arriving with a Photo Event whose reliability has not been proven. It may link to the decision but not start one.",
    inputs: { ...founderInputs(founder("2026-10-09")), triggerFamily: "photo_event_briefing" },
    expected: { rung: "resolve_constraint_conflict", originatesProposal: false, linkOnly: true },
  },
]);
