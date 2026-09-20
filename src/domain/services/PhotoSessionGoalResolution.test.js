import { describe, expect, it } from "vitest";
import { resolvePhotoSessionGoalRelationship } from "./PhotoSessionMetadataService.js";
import { LEAN_MASS_GOAL_ID, VISIBLE_ABS_GOAL_ID, createRealBuild45ExecutionItems, createRealBuild45Goals } from "./RealBuild45PhotoReviewFixture.js";

const DATE = "2026-09-19";
const goal = (id, extra = {}) => ({ id, title: `Title ${id}`, status: "active", primary: false, ...extra });
const occurrence = (extra = {}) => ({ id: "execution_progress_photos", title: "Progress Photos", active: true, cadence: { type: "weekly" }, linkedEvidenceTypes: ["progress_photo"], ...extra });
const resolve = (goals, executionItems, evidenceDate = DATE) => resolvePhotoSessionGoalRelationship({ evidenceDate, goals, executionItems });

describe("deterministic Goal relationship for scheduled Progress Photos", () => {
  it("resolves the real occurrence to the active owning Goal, ignoring the completed Goal the reminder was once linked to", () => {
    const result = resolve(createRealBuild45Goals(), createRealBuild45ExecutionItems());
    expect(result).toMatchObject({ status: "resolved", goalIds: [LEAN_MASS_GOAL_ID], goalLabel: "Build Lean Mass", source: "scheduled_occurrence_current_goal", reviewed: false, limitations: [] });
    expect(result.options.map((item) => item.id)).not.toContain(VISIBLE_ABS_GOAL_ID);
  });

  it("does not let a completed Goal compete: linked to an active and a completed Goal resolves to the active one", () => {
    const items = [occurrence({ linkedGoalIds: ["active_goal", "done_goal"] })];
    const goals = [goal("active_goal"), goal("done_goal", { status: "completed", completedAt: "2026-09-01" })];
    expect(resolve(goals, items)).toMatchObject({ status: "resolved", goalIds: ["active_goal"], source: "scheduled_progress_photo_occurrence" });
  });

  it("does not let multiple historical associations override the occurrence's current owner", () => {
    const items = [occurrence({ currentGoalIds: ["owner"], linkedGoalIds: ["owner", "a", "b"], historicalGoalIds: ["a", "b"] })];
    const goals = [goal("owner"), goal("a"), goal("b")];
    expect(resolve(goals, items)).toMatchObject({ status: "resolved", goalIds: ["owner"], source: "scheduled_occurrence_current_goal" });
  });

  it("falls back from a stale current owner to the eligible linked Goals", () => {
    const items = [occurrence({ currentGoalIds: ["done_goal"], linkedGoalIds: ["done_goal", "active_goal"] })];
    const goals = [goal("active_goal"), goal("done_goal", { status: "completed", completedAt: "2026-08-01" })];
    expect(resolve(goals, items)).toMatchObject({ status: "resolved", goalIds: ["active_goal"] });
  });

  it("still treats a Goal completed on or after the evidence date as eligible for that dated evidence", () => {
    const items = [occurrence({ linkedGoalIds: ["done_later"] })];
    expect(resolve([goal("done_later", { status: "completed", completedAt: "2026-09-19" })], items)).toMatchObject({ status: "resolved", goalIds: ["done_later"] });
    expect(resolve([goal("done_later", { status: "completed", completedAt: "2026-09-18" })], items, DATE)).toMatchObject({ status: "needs_review", limitations: ["goal_context_unavailable"] });
  });

  it("breaks a tie among several current owners only through exactly one primary Goal", () => {
    const goals = [goal("one", { primary: true }), goal("two"), goal("three")];
    expect(resolve(goals, [occurrence({ currentGoalIds: ["one", "two"] })])).toMatchObject({ status: "resolved", goalIds: ["one"] });
    const ambiguous = resolve([goal("one"), goal("two")], [occurrence({ currentGoalIds: ["one", "two"] })]);
    expect(ambiguous).toMatchObject({ status: "needs_review", goalIds: [], limitations: ["scheduled_occurrence_has_multiple_current_goals"] });
    expect(ambiguous.options.map((item) => item.id)).toEqual(["one", "two"]);
    const bothPrimary = resolve([goal("one", { primary: true }), goal("two", { primary: true })], [occurrence({ currentGoalIds: ["one", "two"] })]);
    expect(bothPrimary.status).toBe("needs_review");
  });

  it("falls back to the Goals active on the evidence date only when the schedule names none", () => {
    expect(resolve([goal("solo")], [occurrence()])).toMatchObject({ status: "resolved", goalIds: ["solo"], source: "active_goal_on_evidence_date" });
    expect(resolve([goal("primary", { primary: true }), goal("other")], [])).toMatchObject({ status: "resolved", goalIds: ["primary"] });
  });

  it("fails safely as needs_review, offering only genuine candidates, when nothing determines the Goal", () => {
    const result = resolve([goal("a"), goal("b"), goal("done", { status: "completed", completedAt: "2026-01-01" })], [occurrence()]);
    expect(result).toMatchObject({ status: "needs_review", goalIds: [], goalLabel: null, limitations: ["multiple_applicable_goals"] });
    expect(result.options.map((item) => item.id)).toEqual(["a", "b"]);
    expect(resolve([], [occurrence()])).toMatchObject({ status: "needs_review", limitations: ["goal_context_unavailable"] });
  });

  it("is general: the owning Goal is whatever the occurrence names, with no Goal-specific rule", () => {
    const items = [occurrence({ currentGoalIds: ["any_future_goal"], linkedGoalIds: ["any_future_goal", "goal_visible_abs_at_rest"] })];
    const goals = [goal("any_future_goal", { title: "Anything" }), goal("goal_visible_abs_at_rest", { status: "completed", completedAt: "2026-06-01" })];
    expect(resolve(goals, items)).toMatchObject({ status: "resolved", goalIds: ["any_future_goal"], goalLabel: "Anything" });
  });

  it("ignores cancelled or inactive occurrences and occurrences of other evidence", () => {
    const goals = [goal("solo")];
    expect(resolve(goals, [occurrence({ active: false, currentGoalIds: ["ghost"] })])).toMatchObject({ goalIds: ["solo"], source: "active_goal_on_evidence_date" });
    expect(resolve(goals, [{ id: "execution_weight", title: "Weigh in", linkedEvidenceTypes: ["weight"], currentGoalIds: ["ghost"] }])).toMatchObject({ goalIds: ["solo"] });
  });
});
