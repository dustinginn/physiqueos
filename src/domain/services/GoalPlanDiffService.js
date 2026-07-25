import { createGoalPlanningInput } from "../models/goalPlanningInput";

export function diffGoalPlans(originalInput, workingInput) {
  const original = createGoalPlanningInput(originalInput); const working = createGoalPlanningInput(workingInput);
  const fields = ["name", "purpose", "primaryOutcome"];
  const scalarChanges = fields.filter((field) => !equal(original[field], working[field])).map((field) => change(field, original[field], working[field]));
  const targetChanges = objectChanges("target", original.target, working.target);
  const timelineChanges = objectChanges("timeline", original.timeline, working.timeline);
  const criteria = collectionChanges(original.successCriteria, working.successCriteria);
  const guardrails = collectionChanges(original.guardrails, working.guardrails);
  const coachingPreferenceChanges = objectChanges("coachingPreferences", original.coachingPreferences, working.coachingPreferences);
  const changedSections = [];
  if (scalarChanges.length) changedSections.push("goal"); if (targetChanges.length) changedSections.push("target");
  if (timelineChanges.length) changedSections.push("timeline"); if (hasCollectionChanges(criteria)) changedSections.push("successCriteria");
  if (hasCollectionChanges(guardrails)) changedSections.push("guardrails"); if (coachingPreferenceChanges.length) changedSections.push("coachingPreferences");
  const all = ["goal", "target", "timeline", "successCriteria", "guardrails", "coachingPreferences"];
  return deepFreeze({ empty: changedSections.length === 0, changedSections, unchangedSections: all.filter((item) => !changedSections.includes(item)), scalarChanges, targetChanges, timelineChanges, criteria, guardrails, coachingPreferenceChanges, destinationChanged: scalarChanges.some((item) => ["name", "primaryOutcome"].includes(item.field)) || targetChanges.length > 0, evidenceAndHistoryPreserved: true });
}

export const GoalPlanDiffService = Object.freeze({ diffGoalPlans });
function collectionChanges(before, after) { const left = new Map(before.map((item) => [item.key, item])); const right = new Map(after.map((item) => [item.key, item])); return { added: after.filter((item) => !left.has(item.key)), removed: before.filter((item) => !right.has(item.key)), modified: after.filter((item) => left.has(item.key) && !equal(left.get(item.key), item)).map((item) => ({ key: item.key, before: left.get(item.key), after: item })) }; }
function objectChanges(section, before, after) { return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().filter((field) => !equal(before[field], after[field])).map((field) => change(`${section}.${field}`, before[field], after[field])); }
function change(field, before, after) { return { field, before: structuredClone(before), after: structuredClone(after) }; }
function hasCollectionChanges(value) { return value.added.length + value.removed.length + value.modified.length > 0; }
function equal(left, right) { if (left === right) return true; if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => equal(item, right[index])); if (left && right && typeof left === "object" && typeof right === "object") { const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])]; return keys.every((key) => equal(left[key], right[key])); } return false; }
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
