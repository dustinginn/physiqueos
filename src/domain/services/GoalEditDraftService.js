import { adaptLegacyGoalToPlanningInput, createGoalPlanningInput } from "../models/goalPlanningInput";

export const GOAL_EDIT_DRAFT_SCHEMA_VERSION = "goal_edit_draft_v1";
export const GoalEditSection = Object.freeze({
  GOAL_AND_PURPOSE: "goal_and_purpose", OVERALL_GOAL: "overall_goal", SUCCESS_CRITERIA: "success_criteria",
  GUARDRAILS: "guardrails", COACHING: "coaching_preferences", PHASES: "phases", REVIEW: "review",
});
export const GOAL_EDIT_SECTION_ALIASES=Object.freeze({goal:"goal_and_purpose",goal_and_purpose:"goal_and_purpose","goal and purpose":"goal_and_purpose",target_timeline:"overall_goal",target_and_timeline:"overall_goal",overall_goal:"overall_goal","overall goal":"overall_goal",phases:"phases",success_criteria:"success_criteria","success criteria":"success_criteria",guardrails:"guardrails",coaching_preferences:"coaching_preferences","coaching preferences":"coaching_preferences",review:"review",choose_sections:"choose_sections"});
const EDITABLE = new Set([GoalEditSection.GOAL_AND_PURPOSE, GoalEditSection.OVERALL_GOAL, GoalEditSection.SUCCESS_CRITERIA, GoalEditSection.GUARDRAILS, GoalEditSection.COACHING, GoalEditSection.PHASES]);
export const GOAL_EDIT_CANONICAL_SECTION_ORDER = Object.freeze([GoalEditSection.GOAL_AND_PURPOSE, GoalEditSection.PHASES, GoalEditSection.OVERALL_GOAL, GoalEditSection.SUCCESS_CRITERIA, GoalEditSection.GUARDRAILS, GoalEditSection.COACHING]);

export function normalizeGoalEditSectionIdentifier(value){const key=String(value??"").trim().toLowerCase();const normalized=GOAL_EDIT_SECTION_ALIASES[key];if(!normalized)throw new GoalEditDraftError("GOAL_EDIT_SECTION_UNSUPPORTED",`Unsupported Goal Edit section: ${value}.`);return normalized}

export function normalizeGoalEditDraftNavigation(draft){
 const selected=GOAL_EDIT_CANONICAL_SECTION_ORDER.filter(section=>[...new Set((draft.selectedSections??[]).map(normalizeGoalEditSectionIdentifier))].includes(section));
 const sequence=["choose_sections",...selected,GoalEditSection.REVIEW];let current;
 try{current=normalizeGoalEditSectionIdentifier(draft.currentStep)}catch{current=selected[0]??GoalEditSection.REVIEW}
 if(!sequence.includes(current))current=selected[0]??GoalEditSection.REVIEW;
 return deepFreeze({...structuredClone(draft),selectedSections:selected,currentStep:current});
}

export function buildGoalEditDraft(goal, { now = new Date() } = {}) {
  if (!goal?.id || goal.status !== "active") throw new GoalEditDraftError("GOAL_EDIT_SOURCE_UNAVAILABLE", "Only an active independent goal can be edited.");
  const originalPlan = ensureDraftKeys(adaptLegacyGoalToPlanningInput(goal));
  const stamp = new Date(now).toISOString();
  const usedLocalKeys = collectKeys(originalPlan);
  return deepFreeze({
    schemaVersion: GOAL_EDIT_DRAFT_SCHEMA_VERSION,
    id: `goal_edit_${normalizeKey(goal.id)}_${sourceRevision(goal)}`,
    sourceGoalId: goal.id, sourceRevision: sourceRevision(goal), createdAt: stamp, updatedAt: stamp,
    currentStep: "choose_sections", selectedSections: [], originalPlan,
    workingPlan: createGoalPlanningInput(originalPlan), completionState: "editing",
    finalReview: { status: "not_requested", token: null, checkedAt: null, stale: false, message: null },
    usedLocalKeys,
  });
}

export function selectGoalEditSections(draft, sections, { now = new Date() } = {}) {
  const requested = [...new Set((sections ?? []).map(normalizeGoalEditSectionIdentifier))];
  const selected = GOAL_EDIT_CANONICAL_SECTION_ORDER.filter((section) => requested.includes(section));
  if (selected.includes(GoalEditSection.PHASES) && draft.phaseEditing?.capability?.available !== true) {
    const reasons = draft.phaseEditing?.capability?.blockingReasons ?? ["phase_persistence_unavailable"];
    throw new GoalEditDraftError("GOAL_EDIT_PHASES_UNAVAILABLE", `Phase editing is unavailable: ${reasons.join(", ")}.`);
  }
  if (requested.some((section) => !EDITABLE.has(section))) throw new GoalEditDraftError("GOAL_EDIT_SECTION_UNSUPPORTED", "An unsupported Goal Edit section was selected.");
  return update(draft, { selectedSections: selected, currentStep: selected[0] ?? GoalEditSection.REVIEW }, now);
}

export function getGoalEditStepSequence(draft) {
  const selectedAliases=[...new Set((draft.selectedSections??[]).map(normalizeGoalEditSectionIdentifier))];
  const selected = GOAL_EDIT_CANONICAL_SECTION_ORDER.filter((section) => selectedAliases.includes(section));
  return Object.freeze(["choose_sections", ...selected, GoalEditSection.REVIEW]);
}

export function moveGoalEditStep(draft, direction, { now = new Date() } = {}) {
  const normalized=normalizeGoalEditDraftNavigation(draft);const sequence = getGoalEditStepSequence(normalized); const index = sequence.indexOf(normalized.currentStep);
  const next = Math.max(0, Math.min(sequence.length - 1, index + (direction === "back" ? -1 : 1)));
  return update(normalized, { currentStep: sequence[next] }, now);
}

export function updateGoalEditWorkingPlan(draft, patch, { now = new Date() } = {}) {
  const workingPlan = createGoalPlanningInput({ ...structuredClone(draft.workingPlan), ...structuredClone(patch) });
  return update(draft, { workingPlan }, now);
}

export function addGoalEditItem(draft, collection, item = {}, { now = new Date() } = {}) {
  assertCollection(collection); const kind = collection === "successCriteria" ? "criterion" : "guardrail";
  const key = item.key ?? nextLocalKey(kind, draft.usedLocalKeys);
  if (draft.usedLocalKeys.includes(key)) throw new GoalEditDraftError("GOAL_EDIT_LOCAL_KEY_DUPLICATE", "Criterion and guardrail keys must be globally unique.", { key });
  const normalizedItem = { ...structuredClone(item), key, label: item.label ?? `New ${kind}`, scope: item.scope ?? "overall_goal", required: item.required === true };
  const workingPlan = createGoalPlanningInput({ ...structuredClone(draft.workingPlan), [collection]: [...draft.workingPlan[collection], normalizedItem] });
  return update(draft, { workingPlan, usedLocalKeys: [...draft.usedLocalKeys, key] }, now);
}

export function editGoalEditItem(draft, collection, key, patch, { now = new Date() } = {}) {
  assertCollection(collection); const items = draft.workingPlan[collection];
  if (!items.some((item) => item.key === key)) throw new GoalEditDraftError("GOAL_EDIT_ITEM_NOT_FOUND", "The planning item was not found.");
  if (patch.key != null && patch.key !== key) throw new GoalEditDraftError("GOAL_EDIT_LOCAL_KEY_IMMUTABLE", "Existing local keys cannot be silently rewritten.");
  return updateGoalEditWorkingPlan(draft, { [collection]: items.map((item) => item.key === key ? { ...item, ...structuredClone(patch), key } : item) }, { now });
}

export function removeGoalEditItem(draft, collection, key, { now = new Date() } = {}) {
  assertCollection(collection);
  return updateGoalEditWorkingPlan(draft, { [collection]: draft.workingPlan[collection].filter((item) => item.key !== key) }, { now });
}

export function assessGoalEditReview(draft, liveGoal, { now = new Date() } = {}) {
  createGoalPlanningInput(draft.workingPlan);
  const checkedAt = new Date(now).toISOString(); const stale = !liveGoal || sourceRevision(liveGoal) !== draft.sourceRevision;
  if (stale) return update(draft, { completionState: "blocked_stale_source", finalReview: { status: "blocked", token: null, checkedAt, stale: true, message: "This goal changed after editing began. Refresh and reconcile before saving." } }, now);
  return update(draft, { completionState: "review_ready", currentStep: GoalEditSection.REVIEW, finalReview: { status: "ready", token: `goal_edit_review_${fingerprint({ sourceRevision: draft.sourceRevision, workingPlan: draft.workingPlan })}`, checkedAt, stale: false, message: "Review is ready. Saving requires a revision-checked goal update boundary." } }, now);
}

export function sourceRevision(goal) {
  return fingerprint({ id: goal?.id ?? null, updatedAt: goal?.updatedAt ?? null, goal });
}

export class GoalEditDraftError extends Error { constructor(code, message, details = {}) { super(message); this.name = "GoalEditDraftError"; this.code = code; this.details = details; } }
function update(draft, patch, now) { return deepFreeze({ ...structuredClone(draft), ...structuredClone(patch), updatedAt: new Date(now).toISOString() }); }
function nextLocalKey(kind, used) { let index = 1; while (used.includes(`${kind}_${index}`)) index += 1; return `${kind}_${index}`; }
function collectKeys(plan) { return [...plan.successCriteria, ...plan.guardrails].map((item) => item.key).filter(Boolean); }
function ensureDraftKeys(plan) {
  const value = structuredClone(plan); const used = collectKeys(value);
  for (const [collection, kind] of [["successCriteria", "criterion"], ["guardrails", "guardrail"]]) {
    value[collection] = value[collection].map((item) => {
      if (item.key) return item;
      const key = nextLocalKey(kind, used); used.push(key); return { ...item, key };
    });
  }
  return createGoalPlanningInput(value);
}
function assertCollection(value) { if (!["successCriteria", "guardrails"].includes(value)) throw new GoalEditDraftError("GOAL_EDIT_COLLECTION_UNSUPPORTED", "Unsupported editable collection."); }
function normalizeKey(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
function fingerprint(value) { const text = stableStringify(value); let hash = 2166136261; for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, "0"); }
function stableStringify(value) { if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
