const ROUTES_BY_GOAL_ID = new Map([
  ["goal_visible_abs_at_rest", "/goals/visible-abs"],
  ["goal_maintain_8_9_body_fat", "/goals/maintenance"],
  ["goal_preserve_lean_mass", "/goals/lean-mass"],
]);

const ROUTES_BY_GOAL_TYPE = new Map([
  ["build_lean_mass", "/goals/build-lean-mass"],
]);

const LEGACY_TITLE_ROUTES = new Map([
  ["Visible Abs at Rest", "/goals/visible-abs"],
  ["Maintain 8-9% Body Fat", "/goals/maintenance"],
  ["Preserve Lean Mass", "/goals/lean-mass"],
  ["Build Lean Mass", "/goals/build-lean-mass"],
]);

export function resolveGoalNavigationHref(goal = {}) {
  const input = goal && typeof goal === "object" ? goal : {};
  const goalId = clean(input.id);
  const goalType = clean(input.type ?? input.goalType);
  const title = clean(input.title);

  if (goalId && ROUTES_BY_GOAL_ID.has(goalId)) {
    return resolved(ROUTES_BY_GOAL_ID.get(goalId), "goal_id");
  }

  if (goalType && ROUTES_BY_GOAL_TYPE.has(goalType)) {
    return resolved(ROUTES_BY_GOAL_TYPE.get(goalType), "goal_type");
  }

  if (!goalId && !goalType && title && LEGACY_TITLE_ROUTES.has(title)) {
    return resolved(LEGACY_TITLE_ROUTES.get(title), "legacy_title_allowlist");
  }

  if (!goalId && !goalType && !title) {
    return unsupported("GOAL_NAVIGATION_MISSING_IDENTITY");
  }

  return unsupported("GOAL_NAVIGATION_UNSUPPORTED_TYPE");
}

function resolved(href, matchedBy) {
  return {
    available: true,
    code: "GOAL_NAVIGATION_RESOLVED",
    href,
    matchedBy,
  };
}

function unsupported(code) {
  return {
    available: false,
    code,
    href: null,
    matchedBy: null,
  };
}

function clean(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
