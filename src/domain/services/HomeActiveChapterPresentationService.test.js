import { describe, expect, it } from "vitest";
import { deriveHomeActiveChapterPresentation, filterHomeCommitmentsForActiveGoal, filterHomeRemindersForActiveGoal } from "./HomeActiveChapterPresentationService";

const goal = { id: "goal-build", title: "Build Lean Mass", type: "build_lean_mass", status: "active", primary: true, sourceGoalId: "goal-visible", activatedAt: "2026-07-21T04:53:31.759Z", target: { metric: "lean_mass", amount: 10, description: "Build 10 lb of lean mass", targetDate: "2026-10-31" }, timeline: { startDate: "2026-07-20", targetDate: "2026-10-31" }, guardrails: [{ text: "Maintain approximately 8–9% body fat.", accepted: true }], phases: [{ id: "p1", name: "Establish Maintenance", purpose: "Establish a reliable maintenance baseline.", status: "active", order: 0, timingMode: "fixed_duration", startDate: "2026-07-20", duration: { value: 4, unit: "weeks" } }, { id: "p2", name: "Lean Mass Build", status: "upcoming", order: 1, timingMode: "target_date", targetDate: "2026-10-31" }] };

describe("Home active Build Lean Mass chapter", () => {
  it("derives phase-aware Home presentation without mutating the goal", () => {
    const input = structuredClone(goal);
    const result = deriveHomeActiveChapterPresentation({ activeGoal: input, goals: [input], currentDate: "2026-07-21T12:00:00Z", timeZone: "UTC", evidenceSummary: { nutritionConsistent: true, trainingConsistent: true } });
    expect(result.hero).toMatchObject({ goalIcon: "dumbbell", headline: "Establish Maintenance", confidenceState: "Early confidence", primaryTimeline: "About 4 weeks remaining", plannedReviewDate: "2026-08-17", mode: "phase_trajectory" });
    expect(result.hero.confidence).toBeGreaterThan(0);
    expect(result.hero.supportingMetrics).toEqual([{ label: "Current phase", value: "Establish Maintenance", icon: "phase" }]);
    expect(result.goals).toHaveLength(1);
    expect(result.goals[0].presentation).toMatchObject({ mode: "phase_trajectory_goal", guardrail: "Maintain approximately 8–9% body fat." });
    expect(JSON.stringify(result)).not.toMatch(/Maintenance Calibration|Calibration in progress|Projected Finish|Days Remaining|Review rhythm/);
    expect(input).toEqual(goal);
  });

  it("marks only pre-activation briefing artifacts as previous chapter", () => {
    const previous = deriveHomeActiveChapterPresentation({ activeGoal: goal, goals: [{ id: "goal-visible", title: "Visible abs at rest" }], briefingCard: { title: "Still on track.", createdAt: "2026-07-20T12:00:00Z" } });
    expect(previous.briefingCard).toMatchObject({ sectionLabel: "Previous Chapter Briefing", chapterContext: "previous" });
    const future = { title: "Update", createdAt: "2026-07-22T12:00:00Z" };
    expect(deriveHomeActiveChapterPresentation({ activeGoal: goal, briefingCard: future }).briefingCard).toEqual(future);
  });

  it("preserves reminder and commitment ownership filters", () => {
    const reminders = [{ id: "old", relatedGoalIds: ["goal-visible"] }, { id: "current", relatedGoalIds: [goal.id] }, { id: "global", relatedGoalIds: [] }];
    expect(filterHomeRemindersForActiveGoal(reminders, goal.id).map((item) => item.id)).toEqual(["current", "global"]);
    const commitments = [{ id: "old", active: true, linkedGoalIds: ["goal-visible"] }, { id: "current", active: true, linkedGoalIds: [goal.id] }];
    expect(filterHomeCommitmentsForActiveGoal(commitments, goal.id).map((item) => item.id)).toEqual(["current"]);
  });

  it("keeps legacy goal types outside the explicit Build Lean Mass projection", () => {
    expect(deriveHomeActiveChapterPresentation({ activeGoal: { ...goal, type: "body_composition" } })).toBeNull();
  });
});
