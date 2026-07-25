import { normalizeGoalPhaseCollection } from "../models/goalPhase";

export function diffGoalPhases(originalInput = [], proposedInput = [], { goalId } = {}) {
  const original = normalizeGoalPhaseCollection(originalInput, { goalId });
  const proposed = normalizeGoalPhaseCollection(proposedInput, { goalId });
  const before = new Map(original.map((phase) => [phase.id, phase])); const after = new Map(proposed.map((phase) => [phase.id, phase]));
  const added = proposed.filter((phase) => !before.has(phase.id)); const removed = original.filter((phase) => !after.has(phase.id));
  const reordered = [], renamed = [], purposeChanged = [], statusChanged = [], timingChanged = [], successCriteriaChanged = [], guardrailsChanged = [], transitionPolicyChanged = [], unchanged = [];
  for (const phase of proposed.filter((item) => before.has(item.id))) {
    const prior = before.get(phase.id); let changed = false;
    const push = (condition, bucket, fields = null) => { if (condition) { bucket.push(change(prior, phase, fields)); changed = true; } };
    push(prior.order !== phase.order, reordered, ["order"]); push(prior.name !== phase.name, renamed, ["name"]); push(prior.purpose !== phase.purpose, purposeChanged, ["purpose"]); push(prior.status !== phase.status, statusChanged, ["status"]);
    push(!equal(pick(prior, ["startDate", "targetDate", "duration", "timingMode"]), pick(phase, ["startDate", "targetDate", "duration", "timingMode"])), timingChanged, ["startDate", "targetDate", "duration", "timingMode"]);
    push(!equal(prior.successCriteria, phase.successCriteria), successCriteriaChanged, ["successCriteria"]); push(!equal(prior.guardrails, phase.guardrails), guardrailsChanged, ["guardrails"]); push(prior.transitionPolicy !== phase.transitionPolicy, transitionPolicyChanged, ["transitionPolicy"]);
    if (!changed && equal(prior, phase)) unchanged.push(phase);
  }
  const activeBefore = original.find((phase) => phase.status === "active")?.id ?? null; const activeAfter = proposed.find((phase) => phase.status === "active")?.id ?? null;
  const buckets = { added, removed, reordered, renamed, purposeChanged, statusChanged, timingChanged, successCriteriaChanged, guardrailsChanged, transitionPolicyChanged };
  const empty = Object.values(buckets).every((items) => items.length === 0);
  return deepFreeze({ empty, ...buckets, unchanged, activePhaseBefore: activeBefore, activePhaseAfter: activeAfter, activePhaseIdentityChanged: activeBefore !== activeAfter, altersCurrentOperationalPhase: activeBefore !== activeAfter || statusChanged.some((item) => [activeBefore, activeAfter].includes(item.phaseId)) || timingChanged.some((item) => item.phaseId === activeAfter), changesOverallGoalDestination: false });
}
export const GoalPhaseDiffService = Object.freeze({ diffGoalPhases });
function change(before, after, fields) { return { phaseId: after.id, before: pick(before, fields), after: pick(after, fields) }; }
function pick(value, fields) { return Object.fromEntries(fields.map((field) => [field, structuredClone(value[field])])); }
function equal(left, right) { if (left === right) return true; if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => equal(item, right[index])); if (left && right && typeof left === "object" && typeof right === "object") { const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])]; return keys.every((key) => equal(left[key], right[key])); } return false; }
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
