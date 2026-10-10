import { describe, expect, it } from "vitest";

import { GOAL_ADAPTATION_POLICY_V1, resolveGoalArchetype } from "./GoalAdaptationPolicyV1.js";
import {
  createAdaptationRecommendationDraft,
  createGoalContractRevisionDraft,
  createJourneyEvent,
  createStructuredGuardrail,
  createTemporaryPhaseDefinition,
} from "./GoalAdaptationContracts.js";
import { addDays, correctScheduleForElapsedTime, localDateInZone } from "./ScheduleCorrectionV1.js";
import { assessEvidenceCoverage, assessPlanAdherence } from "./EvidenceAndAdherenceV1.js";
import { evaluateStructuredGuardrail, structureV3Guardrail } from "./StructuredGuardrailV1.js";
import { AdaptationRung, EligibilityStatus, assessAdaptationEligibility, resolveAdaptationRung } from "./AdaptationDecisionV1.js";
import { evaluateGoalAdaptationShadow } from "./GoalAdaptationShadowEvaluator.js";
import {
  FOUNDER_BODY_FAT_V3_GUARDRAIL,
  FOUNDER_GOAL,
  FOUNDER_V3_ASSESSMENTS,
  LEAN_MASS_BUILD_PHASE_START,
  adherenceWeeksAsOf,
  coverageSignalsAsOf,
} from "./fixtures/founderLeanMassGolden.js";

const leanGuardrail = structureV3Guardrail(FOUNDER_BODY_FAT_V3_GUARDRAIL, { archetype: "lean_mass_gain" });
const fullCoverage = { body_weight: { daysPerWeek: [6, 7, 6, 7], source: "manual" }, training_performance: { daysPerWeek: [3, 3, 4, 3], source: "manual" }, nutrition_intake: { daysPerWeek: [7, 6, 7, 7], source: "healthkit" } };
const coverage = (signals = fullCoverage, scans = []) => assessEvidenceCoverage({ archetype: "lean_mass_gain", signals, bodyCompositionScanDates: scans });

describe("Phase 0 policy and contracts", () => {
  it("is a frozen draft that is not active", () => {
    expect(GOAL_ADAPTATION_POLICY_V1).toMatchObject({ version: "goal_adaptation_policy_v1", status: "draft_requires_founder_review", activation: "off" });
    expect(Object.isFrozen(GOAL_ADAPTATION_POLICY_V1.archetypes.lean_mass_gain)).toBe(true);
    expect(GOAL_ADAPTATION_POLICY_V1.triggers.midweek_briefing).toBe("link_only");
  });

  it("never lists a body-composition scan as required evidence for any goal type", () => {
    for (const definition of Object.values(GOAL_ADAPTATION_POLICY_V1.archetypes)) {
      const domains = JSON.stringify(definition.required);
      expect(domains).not.toMatch(/body_composition|dexa/i);
    }
  });

  it("maps the Founder goal to the lean-mass archetype", () => {
    expect(resolveGoalArchetype(FOUNDER_GOAL)).toBe("lean_mass_gain");
    expect(resolveGoalArchetype({ type: "strength" })).toBe("strength");
    expect(resolveGoalArchetype({ type: "unknown_goal" })).toBeNull();
  });

  it("validates the additive contracts and forbids automatic application", () => {
    const guardrail = createStructuredGuardrail({ guardrailId: "g", metric: "body_fat_percentage", lower: 8, upper: 10, lowerMeaning: "coaching", upperMeaning: "unsafe", effectivePeriod: { kind: "phase", phaseId: "p2" } });
    expect(guardrail.effectivePeriod).toEqual({ kind: "phase", phaseId: "p2" });
    expect(() => createStructuredGuardrail({ guardrailId: "g", metric: "m", lower: 10, upper: 8 })).toThrow(RangeError);
    const recommendation = createAdaptationRecommendationDraft({
      goalId: "goal", phaseId: "phase", policyVersion: "goal_adaptation_policy_v1", rung: "resolve_constraint_conflict",
      triggeringArtifactId: "dexa", triggeringFamily: "dexa_event_briefing", evidenceFingerprint: "sha",
      options: [{ kind: "lean_out_first", recommended: true }, { kind: "keep_building_revised_limits" }, { kind: "keep_current_plan", valid: false }],
    });
    expect(recommendation).toMatchObject({ lifecycle: "open", automaticApplicationAllowed: false });
    expect(() => createAdaptationRecommendationDraft({ ...recommendation, options: [{ kind: "keep_current_plan", valid: false, recommended: true }] })).toThrow(RangeError);
    expect(createGoalContractRevisionDraft({ goalId: "goal", fromVersion: 1, changes: { targetDate: "2027-01-15" }, decisionId: "d", reason: "timeline", effectiveDate: "2026-10-12" }))
      .toMatchObject({ toVersion: 2, priorVersionRetained: true });
    expect(createTemporaryPhaseDefinition({ name: "Leaning phase", endRule: "first_of", timeLimitDays: 28, outcome: { metric: "body_fat_percentage", within: [8, 9] } }))
      .toMatchObject({ onEnd: "user_review_required", automaticCompletionAllowed: false, automaticResumptionAllowed: false });
    expect(createJourneyEvent({ type: "decision_recorded", goalId: "goal", occurredOn: "2026-10-12", summary: "Leaning phase approved" }).surface).toBe("your_journey");
  });
});

describe("Phase A schedule correction", () => {
  it("lets the runway shrink between scans while keeping the measured pace evidence-only", () => {
    const oct7 = FOUNDER_V3_ASSESSMENTS.find((item) => item.asOf === "2026-10-07");
    const schedule = correctScheduleForElapsedTime({ ...oct7.trajectory, outlookAsOf: oct7.outlookAsOf }, { asOf: oct7.asOf });
    expect(schedule.storedTimeRemainingDays).toBe(49);
    expect(schedule.timeRemainingDays).toBe(24);
    expect(schedule.measuredRate).toBe(0.1077);
    expect(schedule.measuredBasisState).toBe("at_risk");
    expect(schedule.scheduleState).toBe("ahead_with_reserve");
    expect(schedule.paceUnverified).toBe(true);
    expect(schedule.projectedCompletionDate).toBe("2026-10-17");
  });

  it("reports the October 9 shortfall as a trajectory finding", () => {
    const oct9 = FOUNDER_V3_ASSESSMENTS.at(-1);
    const schedule = correctScheduleForElapsedTime({ ...oct9.trajectory, outlookAsOf: oct9.outlookAsOf }, { asOf: oct9.asOf });
    expect(schedule).toMatchObject({ scheduleState: "at_risk", timeRemainingDays: 22, paceUnverified: false });
    expect(schedule.projectedCompletionDate > "2027-01-01").toBe(true);
  });

  it("uses the goal-local calendar day across UTC midnight", () => {
    expect(localDateInZone("2026-10-10T06:30:00.000Z", "America/Los_Angeles")).toBe("2026-10-09");
    expect(localDateInZone("2026-10-10T06:30:00.000Z", "UTC")).toBe("2026-10-10");
    const oct9 = FOUNDER_V3_ASSESSMENTS.at(-1);
    const late = correctScheduleForElapsedTime({ ...oct9.trajectory, outlookAsOf: oct9.outlookAsOf }, { asOf: localDateInZone("2026-10-10T06:30:00.000Z", "America/Los_Angeles") });
    expect(late.timeRemainingDays).toBe(22);
  });

  it("handles completion, a passed deadline and an undeclared deadline", () => {
    expect(correctScheduleForElapsedTime({ remainingRequirement: 0, deadlineAt: "2026-10-31" }, { asOf: "2026-10-01" }).scheduleState).toBe("complete");
    expect(correctScheduleForElapsedTime({ remainingRequirement: 1, forecastRemainingRequirement: 1, discountedRate: 0.1, deadlineAt: "2026-10-31", outlookAsOf: "2026-10-01" }, { asOf: "2026-11-02" }).scheduleState).toBe("deadline_passed");
    expect(correctScheduleForElapsedTime({ remainingRequirement: 1, discountedRate: 0.1 }, { asOf: "2026-10-01" }).scheduleState).toBe("not_measurable");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});

describe("Phase A evidence and adherence", () => {
  it("accepts a lean-mass goal with no DEXA ever, recording estimated precision", () => {
    const result = coverage(fullCoverage, []);
    expect(result).toMatchObject({ status: "sufficient", bodyCompositionScanRequired: false, precision: "estimated_without_body_composition_scan" });
    expect(coverage(fullCoverage, ["2026-10-09"]).precision).toBe("measured_body_composition_available");
  });

  it("separates missing HealthKit data (never prompted) from missing manual data", () => {
    const thinNutrition = { ...fullCoverage, nutrition_intake: { daysPerWeek: [2, 1, 2, 3], source: "healthkit" } };
    const result = coverage(thinNutrition);
    expect(result.status).toBe("insufficient");
    expect(result.missing[0]).toMatchObject({ missingReason: "no_data_synced", promptAllowed: false });
    const thinWeight = { ...fullCoverage, body_weight: { daysPerWeek: [2, 2, 1, 2], source: "manual" } };
    expect(coverage(thinWeight).missing[0]).toMatchObject({ domain: "body_weight", missingReason: "not_logged_often_enough", promptAllowed: true });
  });

  it("does not count missing days as nonadherence", () => {
    const sparse = assessPlanAdherence({ weeks: [{ weekStart: "w1", measuredDays: 2, withinDays: 0, overDays: 2 }] });
    expect(sparse.status).toBe("insufficient_data");
    expect(assessPlanAdherence({ weeks: [{ weekStart: "w1", measuredDays: 6, withinDays: 4, overDays: 1, underDays: 1 }] })).toMatchObject({ status: "insufficient_data", note: "too_few_measured_days_to_judge" });
    const steady = assessPlanAdherence({ weeks: [{ weekStart: "w1", measuredDays: 7, withinDays: 6, overDays: 1 }, { weekStart: "w2", measuredDays: 6, withinDays: 5, underDays: 1 }] });
    expect(steady.status).toBe("adequate");
    const over = assessPlanAdherence({ weeks: [{ weekStart: "w1", measuredDays: 7, withinDays: 2, overDays: 5 }, { weekStart: "w2", measuredDays: 7, withinDays: 1, overDays: 6 }] });
    expect(over).toMatchObject({ status: "consistent_nonadherence", direction: "over", consecutiveOffPlanWeeks: 2 });
  });
});

describe("Phase A eligibility and rungs", () => {
  const above = evaluateStructuredGuardrail(leanGuardrail, { value: 9.6 });
  const below = evaluateStructuredGuardrail(leanGuardrail, { value: 7.6 });
  const adequate = assessPlanAdherence({ weeks: [{ weekStart: "w1", measuredDays: 7, withinDays: 6 }, { weekStart: "w2", measuredDays: 7, withinDays: 7 }] });
  const overEating = assessPlanAdherence({ weeks: [{ weekStart: "w1", measuredDays: 7, withinDays: 2, overDays: 5 }, { weekStart: "w2", measuredDays: 7, withinDays: 2, overDays: 5 }] });
  const atRisk = { scheduleState: "at_risk", measuredBasisState: "at_risk", paceUnverified: false };
  const onTrack = { scheduleState: "ahead_with_reserve", measuredBasisState: "ahead_with_reserve", paceUnverified: false };

  it("is direction-aware for a build: above is unsafe, below is coaching", () => {
    expect(above).toMatchObject({ position: "above", meaning: "unsafe", severity: "pressured", unsafePressure: true });
    expect(below).toMatchObject({ position: "below", meaning: "coaching", unsafePressure: false });
  });

  it("holds a new phase in calibration unless a safety exception applies", () => {
    const early = assessAdaptationEligibility({ asOf: "2026-08-25", phaseStartDate: "2026-08-15", coverage: coverage(), adherence: adequate, guardrail: above });
    expect(early).toMatchObject({ status: "calibrating", checkpointDate: "2026-09-12" });
    const breached = evaluateStructuredGuardrail(leanGuardrail, { value: 11 });
    expect(assessAdaptationEligibility({ asOf: "2026-08-25", phaseStartDate: "2026-08-15", coverage: coverage(), adherence: adequate, guardrail: breached }).status).toBe("eligible_safety_exception");
  });

  it("treats consistent overeating that drives body fat up as a sustainability review, not ineligibility", () => {
    const eligibility = assessAdaptationEligibility({ asOf: "2026-10-09", phaseStartDate: LEAN_MASS_BUILD_PHASE_START, coverage: coverage(), adherence: overEating, guardrail: above });
    expect(eligibility.status).toBe(EligibilityStatus.ELIGIBLE_SUSTAINABILITY_REVIEW);
    expect(resolveAdaptationRung({ eligibility, schedule: atRisk, guardrail: above, triggerFamily: "weekly_briefing" })).toMatchObject({ rung: "sustainability_review", originatesProposal: true });
  });

  it("coaches adherence first when nonadherence is not tied to an unsafe outcome", () => {
    const eligibility = assessAdaptationEligibility({ asOf: "2026-10-09", phaseStartDate: LEAN_MASS_BUILD_PHASE_START, coverage: coverage(), adherence: overEating, guardrail: evaluateStructuredGuardrail(leanGuardrail, { value: 8.5 }) });
    expect(eligibility.status).toBe("adherence_coaching");
    const decision = resolveAdaptationRung({ eligibility, schedule: onTrack, guardrail: null, triggerFamily: "weekly_briefing" });
    expect(decision).toMatchObject({ rung: "adherence_coaching", originatesProposal: false });
    expect(decision.coaching[0]).toMatchObject({ kind: "adherence", placement: "coachTake.intoNextWeek" });
  });

  it("asks only for evidence the user must log, never HealthKit-synced domains", () => {
    const thin = coverage({ ...fullCoverage, body_weight: { daysPerWeek: [1, 2, 1, 2], source: "manual" }, nutrition_intake: { daysPerWeek: [1, 1, 2, 1], source: "healthkit" } });
    const eligibility = assessAdaptationEligibility({ asOf: "2026-10-09", phaseStartDate: LEAN_MASS_BUILD_PHASE_START, coverage: thin, adherence: adequate, guardrail: above });
    const decision = resolveAdaptationRung({ eligibility, schedule: atRisk, guardrail: above, triggerFamily: "weekly_briefing" });
    expect(decision.rung).toBe("evidence_coaching");
    expect(decision.coaching.map((item) => item.domain)).toEqual(["body_weight"]);
  });

  it("watches a first below-range reading and reviews a persistent one", () => {
    const eligibility = assessAdaptationEligibility({ asOf: "2026-10-09", phaseStartDate: LEAN_MASS_BUILD_PHASE_START, coverage: coverage(), adherence: adequate, guardrail: below });
    const first = resolveAdaptationRung({ eligibility, schedule: onTrack, guardrail: below, belowRangeHistory: ["within", "within"], triggerFamily: "weekly_briefing" });
    expect(first).toMatchObject({ rung: "below_range_watch", originatesProposal: false });
    expect(first.coaching[0].kind).toBe("below_range_watch");
    const persistent = resolveAdaptationRung({ eligibility, schedule: onTrack, guardrail: below, belowRangeHistory: ["below", "below"], triggerFamily: "weekly_briefing" });
    expect(persistent).toMatchObject({ rung: "below_range_review", originatesProposal: true });
    const confirmed = resolveAdaptationRung({ eligibility, schedule: onTrack, guardrail: below, belowRangeHistory: ["within"], confirmedByBodyCompositionEvidence: true, triggerFamily: "monthly_briefing" });
    expect(confirmed.rung).toBe("below_range_review");
  });

  it("never lets Midweek originate and requires proven photo reliability", () => {
    const eligibility = assessAdaptationEligibility({ asOf: "2026-10-09", phaseStartDate: LEAN_MASS_BUILD_PHASE_START, coverage: coverage(), adherence: adequate, guardrail: above });
    expect(resolveAdaptationRung({ eligibility, schedule: atRisk, guardrail: above, triggerFamily: "midweek_briefing" })).toMatchObject({ rung: "resolve_constraint_conflict", originatesProposal: false, linkOnly: true, coaching: [] });
    expect(resolveAdaptationRung({ eligibility, schedule: atRisk, guardrail: above, triggerFamily: "photo_event_briefing" }).originatesProposal).toBe(false);
    expect(resolveAdaptationRung({ eligibility, schedule: atRisk, guardrail: above, triggerFamily: "photo_event_briefing", photoEvidenceReliable: true }).originatesProposal).toBe(true);
    expect(resolveAdaptationRung({ eligibility, schedule: atRisk, guardrail: null, triggerFamily: "weekly_briefing" }).rung).toBe("review_timeline");
  });
});

describe("Phase A golden: Founder Build Lean Mass, Sep 20 – Oct 9 (production replay)", () => {
  const run = (item) => evaluateGoalAdaptationShadow({
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
  const results = Object.fromEntries(FOUNDER_V3_ASSESSMENTS.map((item) => [item.artifact, run(item)]));

  it("opens no proposal before the October 9 scan; time alone only marks the pace unverified", () => {
    for (const [artifact, result] of Object.entries(results)) {
      if (artifact.startsWith("dexa_event")) continue;
      expect(result.decision.originatesProposal).toBe(false);
      expect(["none", "pace_unverified"]).toContain(result.decision.rung);
    }
    expect(results["weekly_briefing_2026-09-13_2026-09-19"].decision.rung).toBe("none");
    expect(results["weekly_briefing_2026-09-27_2026-10-03"].decision.rung).toBe("pace_unverified");
    expect(results["weekly_briefing_2026-09-27_2026-10-03"].decision.coaching[0]).toMatchObject({ kind: "pace_unverified", placement: "coachTake.intoNextWeek" });
    expect(results["midweek_briefing_20261004_20261006"].decision.coaching).toEqual([]);
  });

  it("October 9 DEXA resolves the constraint conflict and may originate the proposal", () => {
    const oct9 = results.dexa_event_2026_10_09;
    expect(oct9.eligibility.status).toBe("eligible");
    expect(oct9.coverage).toMatchObject({ status: "sufficient", precision: "measured_body_composition_available" });
    expect(oct9.decision).toMatchObject({ rung: "resolve_constraint_conflict", originatesProposal: true, automaticChangeAllowed: false });
    expect(oct9.baseRecommendation.action).toBe("continue_with_guardrail_monitoring");
  });

  it("would reach the same eligibility without any DEXA, with estimated precision", () => {
    const item = FOUNDER_V3_ASSESSMENTS.at(-1);
    const noScan = evaluateGoalAdaptationShadow({
      goal: FOUNDER_GOAL, phaseStartDate: LEAN_MASS_BUILD_PHASE_START, asOf: item.asOf, triggerFamily: "weekly_briefing",
      trajectory: item.trajectory, outlookAsOf: item.outlookAsOf, v3Guardrail: FOUNDER_BODY_FAT_V3_GUARDRAIL,
      guardrailMeasurement: { position: "above", deviation: 0.5 }, coverageSignals: coverageSignalsAsOf(item.asOf), bodyCompositionScanDates: [], adherenceWeeks: adherenceWeeksAsOf(item.asOf),
    });
    expect(noScan.coverage).toMatchObject({ status: "sufficient", precision: "estimated_without_body_composition_scan" });
    expect(noScan.eligibility.status).toBe("eligible");
  });

  it("measures Founder intake adherence from HealthKit as adequate", () => {
    expect(results.dexa_event_2026_10_09.adherence).toMatchObject({ status: "adequate" });
  });
});
