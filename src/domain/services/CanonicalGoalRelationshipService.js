const LEGACY_GOAL_TYPES = new Map([
  ["goal_build_lean_mass", "build_lean_mass"],
  ["goal_build_muscle", "build_lean_mass"],
  ["goal_visible_abs", "visible_abs"],
  ["goal_body_fat_10", "body_fat_maintenance"],
  ["goal_lean_mass_155", "lean_mass_preservation"],
]);

export function selectCanonicalActiveGoal(goals = [], { ownerUserId = null } = {}) {
  const matches = goals.filter((goal) =>
    (!ownerUserId || goal?.userId === ownerUserId) &&
    goal?.primary === true &&
    goal?.status === "active"
  );
  if (matches.length > 1) {
    throw new Error("Multiple active primary Goals prevent canonical Goal resolution.");
  }
  return matches[0] ?? null;
}

export function resolveCanonicalGoal({ goals = [], goalId = null, ownerUserId = null } = {}) {
  const requested = clean(goalId);
  if (!requested) return null;
  const scoped = goals.filter((goal) => !ownerUserId || goal?.userId === ownerUserId);
  const canonical = scoped.find((goal) => goal?.id === requested);
  if (canonical) return resolution(canonical, "canonical_id", requested);

  const explicit = scoped.filter((goal) => explicitLegacyIds(goal).includes(requested));
  if (explicit.length > 1) throw ambiguous(requested);
  if (explicit.length === 1) return resolution(explicit[0], "legacy_compatibility_id", requested);

  const semanticType = LEGACY_GOAL_TYPES.get(requested);
  if (!semanticType) return null;
  const compatible = scoped.filter((goal) => canonicalSemanticType(goal) === semanticType);
  if (compatible.length > 1) throw ambiguous(requested);
  return compatible.length === 1
    ? resolution(compatible[0], "legacy_compatibility_id", requested)
    : null;
}

export function resolveCanonicalGoalRelationships({
  goals = [],
  operatingPlan = null,
  ownerUserId = null,
} = {}) {
  const scopedGoals = goals.filter((goal) => !ownerUserId || goal?.userId === ownerUserId);
  const activeGoal = selectCanonicalActiveGoal(scopedGoals, { ownerUserId });
  const configuredOwner = resolveCanonicalGoal({
    goals: scopedGoals,
    goalId: operatingPlan?.primaryGoalId,
    ownerUserId,
  })?.goal ?? activeGoal;
  const owningGoalId = configuredOwner?.id ?? null;
  const objectiveIds = [...new Set([
    ...(operatingPlan?.supportingObjectiveIds ?? []),
    ...(configuredOwner?.supportingObjectives ?? []).map((item) => item?.id),
  ].map(clean).filter(Boolean))];
  const supportingObjectives = objectiveIds.map((id) => {
    const relationship = resolveCanonicalGoal({ goals: scopedGoals, goalId: id, ownerUserId });
    const authored = (configuredOwner?.supportingObjectives ?? []).find((item) => item?.id === id);
    return deepFreeze({
      ...(relationship?.goal ? structuredClone(relationship.goal) : structuredClone(authored ?? { id })),
      id: relationship?.canonicalGoalId ?? id,
      owningGoalId,
      source: relationship?.goal ? "canonical_goal" : authored ? "goal_supporting_objective" : "operating_plan_objective",
    });
  });
  return deepFreeze({
    ownerUserId,
    activeGoalId: activeGoal?.id ?? null,
    operatingPlanGoalId: configuredOwner?.id ?? null,
    supportingObjectives,
  });
}

export function canonicalGoalIdentity(goal) {
  if (!clean(goal?.id)) throw new TypeError("Canonical Goal identity requires a persisted Goal ID.");
  return deepFreeze({
    canonicalGoalId: goal.id,
    semanticType: canonicalSemanticType(goal),
    legacyIds: explicitLegacyIds(goal),
  });
}

function canonicalSemanticType(goal) {
  const explicit = clean(goal?.type ?? goal?.goalType);
  if (explicit === "build_lean_mass") return "build_lean_mass";
  if (goal?.metricKey === "visualDefinition") return "visible_abs";
  if (goal?.metricKey === "bodyFatPercentage") return "body_fat_maintenance";
  if (goal?.metricKey === "leanMass" && goal?.target?.direction !== "increase") return "lean_mass_preservation";
  return explicit;
}

function explicitLegacyIds(goal) {
  return [...new Set([
    ...(goal?.legacyGoalIds ?? []),
    ...(goal?.legacyIds ?? []),
    ...(goal?.identityAliases ?? []),
    goal?.presentationGoalId,
    goal?.routingGoalId,
  ].map(clean).filter(Boolean))];
}

function resolution(goal, matchedBy, requestedGoalId) {
  return deepFreeze({ goal: structuredClone(goal), canonicalGoalId: goal.id, matchedBy, requestedGoalId });
}
function ambiguous(id) { return new Error(`Legacy Goal identity ${id} resolves to multiple canonical Goals.`); }
function clean(value) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
