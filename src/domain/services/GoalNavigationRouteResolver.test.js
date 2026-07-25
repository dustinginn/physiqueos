import { describe, expect, it } from "vitest";
import { resolveGoalNavigationHref } from "./GoalNavigationRouteResolver";

describe("GoalNavigationRouteResolver", () => {
  it.each([
    [{ id: "transition-generated-id", type: "build_lean_mass", title: "Build Lean Mass", primary: true }, "/goals/build-lean-mass"],
    [{ id: "goal_visible_abs_at_rest", status: "completed", primary: false }, "/goals/visible-abs"],
    [{ id: "goal_maintain_8_9_body_fat" }, "/goals/maintenance"],
    [{ id: "goal_preserve_lean_mass" }, "/goals/lean-mass"],
  ])("resolves supported goal metadata without a persisted href", (goal, href) => {
    expect(resolveGoalNavigationHref(goal)).toMatchObject({
      available: true,
      code: "GOAL_NAVIGATION_RESOLVED",
      href,
    });
  });

  it("prefers stable identifiers over conflicting display titles", () => {
    expect(resolveGoalNavigationHref({
      id: "goal_visible_abs_at_rest",
      type: "build_lean_mass",
      title: "Build Lean Mass",
    })).toMatchObject({ href: "/goals/visible-abs", matchedBy: "goal_id" });
  });

  it("uses only a fixed title allowlist when stronger legacy identity is absent", () => {
    expect(resolveGoalNavigationHref({ title: "Build Lean Mass" })).toMatchObject({
      href: "/goals/build-lean-mass",
      matchedBy: "legacy_title_allowlist",
    });
    expect(resolveGoalNavigationHref({ title: "Arbitrary Goal" })).toMatchObject({
      available: false,
      code: "GOAL_NAVIGATION_UNSUPPORTED_TYPE",
      href: null,
    });
  });

  it("returns a structured missing-identity result", () => {
    expect(resolveGoalNavigationHref({})).toEqual({
      available: false,
      code: "GOAL_NAVIGATION_MISSING_IDENTITY",
      href: null,
      matchedBy: null,
    });
  });

  it("is deterministic and does not mutate input", () => {
    const goal = Object.freeze({ id: "new-id", type: "build_lean_mass", status: "active" });
    const first = resolveGoalNavigationHref(goal);
    expect(resolveGoalNavigationHref(goal)).toEqual(first);
    expect(goal).toEqual({ id: "new-id", type: "build_lean_mass", status: "active" });
  });
});
