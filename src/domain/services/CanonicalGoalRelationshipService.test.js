import { describe, expect, it } from "vitest";
import {
  resolveCanonicalGoal,
  resolveCanonicalGoalRelationships,
  selectCanonicalActiveGoal,
} from "./CanonicalGoalRelationshipService.js";

const active = {
  id: "goal_transition_live_goal_visible_abs_at_rest_hash_objective_lean_mass",
  userId: "owner",
  type: "build_lean_mass",
  title: "Build Lean Mass",
  primary: true,
  status: "active",
};

describe("canonical Goal relationships", () => {
  it("treats the persisted ID as canonical and resolves only explicit legacy identity", () => {
    const goals = [active];
    expect(resolveCanonicalGoal({ goals, goalId: active.id })).toMatchObject({
      goal: active,
      canonicalGoalId: active.id,
      matchedBy: "canonical_id",
    });
    expect(resolveCanonicalGoal({ goals, goalId: "goal_build_lean_mass" })).toMatchObject({
      goal: active,
      canonicalGoalId: active.id,
      matchedBy: "legacy_compatibility_id",
    });
    expect(resolveCanonicalGoal({ goals, goalId: "Build Lean Mass" })).toBeNull();
  });

  it("selects exactly one owner-scoped active primary Goal", () => {
    const completed = { ...active, id: "completed", status: "completed", primary: false };
    expect(selectCanonicalActiveGoal([completed, active], { ownerUserId: "owner" })).toBe(active);
    expect(() => selectCanonicalActiveGoal([
      active,
      { ...active, id: "duplicate" },
    ], { ownerUserId: "owner" })).toThrow(/multiple active primary/i);
  });

  it("binds supporting objectives to their owning canonical Goal without title matching", () => {
    const supporting = {
      id: "goal_preserve_lean_mass",
      userId: "owner",
      title: "Preserve Lean Mass",
      primary: false,
      status: "active",
    };
    const graph = resolveCanonicalGoalRelationships({
      goals: [active, supporting],
      operatingPlan: {
        primaryGoalId: active.id,
        supportingObjectiveIds: [supporting.id, "objective_recovery"],
      },
      ownerUserId: "owner",
    });
    expect(graph.activeGoalId).toBe(active.id);
    expect(graph.supportingObjectives).toEqual([
      expect.objectContaining({ id: supporting.id, owningGoalId: active.id, source: "canonical_goal" }),
      expect.objectContaining({ id: "objective_recovery", owningGoalId: active.id, source: "operating_plan_objective" }),
    ]);
  });
});
