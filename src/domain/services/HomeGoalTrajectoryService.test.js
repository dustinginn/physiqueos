import { describe, expect, it } from "vitest";
import { resolveDexaOutcomeProgress, resolveHomeGoalTrajectory } from "./HomeGoalTrajectoryService";

const goal = {
  id: "goal-build", title: "Build Lean Mass", status: "active", type: "build_lean_mass",
  target: { type: "numeric_change", metric: "lean_mass", amount: 10, unit: "lb", description: "Build 10 lb of lean mass", targetDate: "2026-10-31" },
  timeline: { startDate: "2026-07-20", targetDate: "2026-10-31" },
  guardrails: [{ text: "Maintain approximately 8–9% body fat.", accepted: true }],
  phases: [
    { id: "p1", name: "Establish Maintenance", purpose: "Establish a reliable maintenance baseline.", order: 0, status: "active", timingMode: "fixed_duration", startDate: "2026-07-20", duration: { value: 4, unit: "weeks" } },
    { id: "p2", name: "Lean Mass Build", order: 1, status: "upcoming", timingMode: "target_date", targetDate: "2026-10-31" },
  ],
};

describe("HomeGoalTrajectoryService", () => {
  it("resolves the complete destination and documented fixed-duration convention", () => {
    const result = resolveHomeGoalTrajectory({ activeGoal: goal, currentDate: "2026-07-21T12:00:00Z", timeZone: "America/Los_Angeles" });
    expect(result.overallGoal).toMatchObject({ targetDescription: "Build 10 lb of lean mass", journeyStartDate: "2026-07-20", overallTargetDate: "2026-10-31", destinationCompleteness: "complete" });
    expect(result.activePhase).toMatchObject({ phaseName: "Establish Maintenance", calculatedPlannedReviewDate: "2026-08-17", totalPlannedDays: 28, elapsedDays: 1, remainingDays: 27, friendlyTimeline: "About 4 weeks remaining" });
    expect(result.dateConvention).toBe("start_plus_duration_calendar_days");
    expect(result.upcomingPhases[0]).toMatchObject({ phaseName: "Lean Mass Build", timelineProgressPercentage: 0, sequencingNote: "Begins after the prior phase review" });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    ["2026-07-19T12:00:00Z", "pre_start", 0, 28],
    ["2026-08-03T12:00:00Z", "active", 50, 14],
    ["2026-08-16T12:00:00Z", "active", 96, 1],
    ["2026-08-17T12:00:00Z", "review_due", 100, 0],
    ["2026-08-20T12:00:00Z", "review_due", 100, 0],
  ])("clamps timeline state on %s", (currentDate, state, progress, remaining) => {
    const phase = resolveHomeGoalTrajectory({ activeGoal: goal, currentDate, timeZone: "UTC" }).activePhase;
    expect(phase).toMatchObject({ timelineProgressState: state, timelineProgressPercentage: progress, remainingDays: remaining });
  });

  it("does not fabricate progress for invalid or completion-criteria timelines", () => {
    const invalid = structuredClone(goal); invalid.phases[0] = { ...invalid.phases[0], timingMode: "completion_criteria", startDate: null, duration: null };
    const result = resolveHomeGoalTrajectory({ activeGoal: invalid, currentDate: "2026-07-21T12:00:00Z" });
    expect(result.activePhase).toMatchObject({ timelineValidity: false, timelineProgressPercentage: null, friendlyTimeline: "Timeline not established" });
    expect(result.confidence.confidenceValidity).toBe("limited_by_timeline");
  });

  it("handles target-date active phases only when a start date exists", () => {
    const target = structuredClone(goal); target.phases[0] = { ...target.phases[0], timingMode: "target_date", duration: null, targetDate: "2026-08-17" };
    expect(resolveHomeGoalTrajectory({ activeGoal: target, currentDate: "2026-08-03T12:00:00Z" }).activePhase.timelineProgressPercentage).toBe(50);
    target.phases[0].startDate = null;
    expect(resolveHomeGoalTrajectory({ activeGoal: target }).activePhase.timelineProgressPercentage).toBeNull();
  });

  it("uses completed and skipped semantics without treating skipped as success", () => {
    const states = structuredClone(goal); states.phases = [{ ...states.phases[0], status: "completed" }, { ...states.phases[1], status: "skipped" }, { ...states.phases[0], id: "p3", status: "active" }];
    const phases = resolveHomeGoalTrajectory({ activeGoal: states, currentDate: "2026-07-21T12:00:00Z" }).phases;
    expect(phases[0].timelineProgressPercentage).toBe(100);
    expect(phases.find((phase) => phase.status === "skipped")).toMatchObject({ timelineProgressState: "skipped", timelineProgressPercentage: null });
  });

  it("returns a conservative deterministic non-zero confidence signal", () => {
    const evidenceSummary = { nutritionConsistent: true, trainingConsistent: true, activityConsistent: true, evidenceConsistent: true, protocolAdherence: true };
    const first = resolveHomeGoalTrajectory({ activeGoal: goal, currentDate: "2026-07-21T12:00:00Z", evidenceSummary }).confidence;
    const second = resolveHomeGoalTrajectory({ activeGoal: goal, currentDate: "2026-07-21T12:00:00Z", evidenceSummary }).confidence;
    expect(first).toEqual(second);
    expect(first.numericValue).toBeGreaterThan(0);
    expect(first.numericValue).toBeLessThan(60);
    expect(first.uncertaintyStatement).toMatch(/does not yet prove/i);
  });

  it("preserves legacy fallback and blocks ambiguous active phases", () => {
    expect(resolveHomeGoalTrajectory({ activeGoal: { ...goal, phases: [] } })).toMatchObject({ hasExplicitPhases: false, legacyFallbackUsed: true });
    const ambiguous = structuredClone(goal); ambiguous.phases[1].status = "active";
    expect(resolveHomeGoalTrajectory({ activeGoal: ambiguous }).blockingReasons).toContain("MULTIPLE_ACTIVE_PHASES");
  });

  it("derives outcome progress from the latest valid pre-start DEXA baseline and later DEXA", () => {
    const dexaScans = [scan("2026-07-18", 147.5), scan("2026-08-20", 150)];
    const result = resolveDexaOutcomeProgress({ target: goal.target, journeyStartDate: "2026-07-20", dexaScans });
    expect(result).toMatchObject({ progressType: "outcome", metric: "lean_mass", baselineValue: 147.5, baselineDate: "2026-07-18", latestValue: 150, latestDate: "2026-08-20", changeValue: 2.5, targetAmount: 10, rawProgressPercentage: 25, clampedProgressPercentage: 25, evidenceSource: "DEXA", status: "measured" });
  });

  it("does not use scale weight, invalid DEXA, or target-date elapsed time", () => {
    const result = resolveHomeGoalTrajectory({ activeGoal: goal, currentDate: "2026-09-20T12:00:00Z", dexaScans: [{ measuredAt: "2026-07-18", weight: { value: 180, unit: "lb" } }] });
    expect(result.phases[1].progress).toMatchObject({ progressType: "unavailable", status: "baseline_unavailable", clampedProgressPercentage: null });
  });

  it("waits safely when the baseline exists without a follow-up", () => {
    expect(resolveDexaOutcomeProgress({ target: goal.target, journeyStartDate: "2026-07-20", dexaScans: [scan("2026-07-18", 147.5)] })).toMatchObject({ baselineValue: 147.5, latestValue: null, status: "awaiting_follow_up", clampedProgressPercentage: 0, presentationLabel: "0 of 10 lb measured" });
  });

  it("retains negative and above-target outcomes while clamping only the bar", () => {
    const negative = resolveDexaOutcomeProgress({ target: goal.target, journeyStartDate: "2026-07-20", dexaScans: [scan("2026-07-18", 147.5), scan("2026-08-20", 146)] });
    expect(negative).toMatchObject({ changeValue: -1.5, rawProgressPercentage: -15, clampedProgressPercentage: 0 });
    const exceeded = resolveDexaOutcomeProgress({ target: goal.target, journeyStartDate: "2026-07-20", dexaScans: [scan("2026-07-18", 147.5), scan("2026-10-20", 159)] });
    expect(exceeded).toMatchObject({ changeValue: 11.5, rawProgressPercentage: 115, clampedProgressPercentage: 100 });
  });
});

function scan(measuredAt, value) { return { measuredAt, leanMass: { value, unit: "lb" } }; }
