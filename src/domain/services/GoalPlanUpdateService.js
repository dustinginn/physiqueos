import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createFounderStoreUnitOfWork, getFounderStoreRevision } from "../../data/repositories/FounderStoreUnitOfWork";
import { getFounderRuntimeStore, resolveFounderRuntimeStorePath } from "../../data/repositories/founderRuntimeStore";
import { createGoalPlanningInput } from "../models/goalPlanningInput";
import { buildGoalEditDraft, GoalEditSection, normalizeGoalEditSectionIdentifier, sourceRevision } from "./GoalEditDraftService";
import { diffGoalPlans } from "./GoalPlanDiffService";
import { assessOverallGoalCompleteness } from "./GoalOutcomeInterpretationService";

export const GOAL_PLAN_UPDATE_COMMAND_VERSION = "goal_plan_update_v1";
export const GOAL_PLAN_REVIEW_TOKEN_VERSION = "goal_plan_review_v1";
const TOKEN_TTL_MS = 10 * 60 * 1000;
const SUPPORTED_SECTIONS = new Set(["goal", "target", "timeline", "successCriteria", "guardrails", "coachingPreferences"]);
const EXCLUDED_ROOTS = ["protocols", "protocolVersions", "energyStrategyLinks", "executionItems", "reminders", "dailyBriefings", "evidencePackages", "canonicalEvidenceObjects", "evidenceReviews", "progressPhotos", "dexaScans", "goalTransitionDrafts", "goalProtocolTransitionDrafts"];

export function createGoalPlanUpdateCommand(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Goal Plan Update command must be an object.");
  if (input.commandVersion !== GOAL_PLAN_UPDATE_COMMAND_VERSION) throw new TypeError("Unsupported Goal Plan Update command version.");
  for (const field of ["sourceGoalId", "expectedSourceRevision", "originalPlanFingerprint", "finalReviewToken", "draftId", "requestedAt"]) if (!input[field]) throw new TypeError(`Goal Plan Update command ${field} is required.`);
  const proposedCanonicalPlan = createGoalPlanningInput(input.proposedCanonicalPlan);
  if (!input.approvedDiff || typeof input.approvedDiff !== "object") throw new TypeError("Approved Goal Plan diff is required.");
  return deepFreeze({ ...structuredClone(input), proposedCanonicalPlan, approvedDiff: structuredClone(input.approvedDiff) });
}

export function mapCanonicalPlanToGoalPatch(planInput, liveGoal) {
  const plan = createGoalPlanningInput(planInput);
  for (const item of [...plan.successCriteria, ...plan.guardrails]) if (item.scope !== "overall_goal") throw new Error("Only overall-goal criteria and guardrails can be persisted by this service.");
  const outcomeMeasures = plan.successCriteria.map((item) => ({ id: item.key, evidenceType: item.metric, label: item.label, role: "outcome", importance: item.required ? "defining" : "supporting", explanation: item.description, operator: item.operator, value: item.value, unit: item.unit, planningScope: item.scope, planningSource: item.source, accepted: item.required }));
  const guardrails = plan.guardrails.map((item) => ({ id: item.key, text: item.label, description: item.description, metric: item.metric, operator: item.operator, value: item.value, unit: item.unit, planningScope: item.scope, planningSource: item.source, accepted: item.required, recommendationSource: item.source ?? "goal_edit" }));
  return deepFreeze({
    title: plan.name,
    purpose: plan.purpose,
    primaryOutcome: plan.primaryOutcome,
    target: structuredClone(plan.target),
    timeline: structuredClone(plan.timeline),
    progressMeasurement: { ...structuredClone(liveGoal.progressMeasurement ?? {}), outcomeMeasures },
    guardrails,
    coachingPreferences: structuredClone(plan.coachingPreferences),
  });
}

export function createGoalPlanUpdateService({
  runtimeStorePath = resolveFounderRuntimeStorePath(), liveStore = getFounderRuntimeStore(),
  readPersistedStore = () => JSON.parse(fs.readFileSync(runtimeStorePath, "utf8")),
  createUnitOfWork = createFounderStoreUnitOfWork, now = () => new Date(), createTokenId = () => randomUUID(),
  reviewTokenVersion = GOAL_PLAN_REVIEW_TOKEN_VERSION,
} = {}) {
  const tokens = new Map(); const locks = new Set();
  return Object.freeze({
    async createFinalReview({ founderUserId, draft }) {
      const persisted = await readPersistedStore(); const liveGoal = findGoal(persisted, draft.sourceGoalId);
      const stale = validateLiveGoal(liveGoal, founderUserId, draft.sourceRevision);
      if (stale) return stale;
      const currentPlan = buildGoalEditDraft(liveGoal, { now: now() }).originalPlan;
      const proposedPlan = createGoalPlanningInput(draft.workingPlan);
      const diff = diffGoalPlans(currentPlan, proposedPlan);
      if (diff.empty) return deepFreeze({ status: "no_changes", goalId: liveGoal.id, token: null, diff, draftPreserved: true });
      if ((draft.selectedSections??[]).some(section=>normalizeGoalEditSectionIdentifier(section)===GoalEditSection.OVERALL_GOAL)) { const completeness=assessOverallGoalCompleteness(proposedPlan); if(!completeness.complete)return rejected("OVERALL_GOAL_INCOMPLETE",completeness.message); }
      assertSupportedDiff(diff);
      const issuedAt = now(); const token = deepFreeze({
        id: createTokenId(), version: reviewTokenVersion, sourceGoalId: liveGoal.id,
        sourceRevision: draft.sourceRevision, originalPlanFingerprint: fingerprint(currentPlan),
        proposedPlanFingerprint: fingerprint(proposedPlan), diffFingerprint: fingerprint(diff), draftId: draft.id,
        issuedAt: issuedAt.toISOString(), expiresAt: new Date(issuedAt.getTime() + TOKEN_TTL_MS).toISOString(),
      });
      tokens.set(token.id, { token, consumed: false, result: null });
      return deepFreeze({ status: "ready", goalId: liveGoal.id, token, diff, proposedPlan, commitAvailable: true });
    },

    async commit(commandInput, { founderUserId } = {}) {
      let command;
      try { command = createGoalPlanUpdateCommand(commandInput); } catch (cause) { return rejected("COMMAND_INVALID", cause.message); }
      if (locks.has(command.sourceGoalId)) return rejected("ALREADY_IN_PROGRESS", "This goal update is already in progress.");
      const tokenRecord = tokens.get(command.finalReviewToken);
      if (tokenRecord?.consumed) return tokenRecord.result ?? rejected("REVIEW_TOKEN_CONSUMED", "This review token was already consumed.");
      const tokenError = validateToken(tokenRecord, command, now()); if (tokenError) return rejected(tokenError.code, tokenError.message);
      locks.add(command.sourceGoalId);
      try {
        const persisted = await readPersistedStore(); const liveGoal = findGoal(persisted, command.sourceGoalId);
        const stale = validateLiveGoal(liveGoal, founderUserId, command.expectedSourceRevision); if (stale) return stale;
        const currentPlan = buildGoalEditDraft(liveGoal, { now: now() }).originalPlan;
        const proposedPlan = createGoalPlanningInput(command.proposedCanonicalPlan);
        const actualDiff = diffGoalPlans(currentPlan, proposedPlan);
        if (actualDiff.empty) return rejected("EMPTY_DIFF", "No goal changes need to be saved.");
        if (!equal(actualDiff, command.approvedDiff)) return rejected("APPROVED_DIFF_MISMATCH", "The approved diff no longer matches the proposed goal plan.");
        assertSupportedDiff(actualDiff);
        if (fingerprint(currentPlan) !== command.originalPlanFingerprint) return rejected("ORIGINAL_PLAN_MISMATCH", "The original plan fingerprint does not match.");
        const baseline = structuredClone(persisted); const patch = mapCanonicalPlanToGoalPatch(proposedPlan, liveGoal);
        const unit = createUnitOfWork({ filePath: runtimeStorePath, liveStore, stageFrom: persisted, binding: { storeIdentity: "founder_runtime_store", storeKind: "production", isolated: false, productionAllowed: true }, now });
        const transaction = unit.begin();
        await transaction.mutate((staged) => {
          const index = staged.goals.findIndex((goal) => goal.id === liveGoal.id);
          if (index < 0) throw new Error("Goal disappeared from candidate state.");
          staged.goals[index] = { ...staged.goals[index], ...structuredClone(patch) };
        });
        let commitResult;
        try {
          commitResult = await transaction.commit({
            validate: (candidate) => validateCandidate({ baseline, candidate, goalId: liveGoal.id, proposedPlan }),
            finalizeCandidate: ({ stagedState }) => { stagedState.goals.find((goal) => goal.id === liveGoal.id).updatedAt = now().toISOString(); },
            validateFinalized: (candidate) => validateCandidate({ baseline, candidate, goalId: liveGoal.id, proposedPlan, allowUpdatedAt: true }),
          });
        } catch (cause) {
          const result = failed(cause); if (cause?.committed === true) { tokenRecord.consumed = true; tokenRecord.result = result; } return result;
        }
        const committedGoal = liveStore.goals.find((goal) => goal.id === liveGoal.id);
        const result = deepFreeze({ status: "committed", goalId: liveGoal.id, previousRevision: commitResult.expectedRevision, committedRevision: commitResult.revision, committedGoal: structuredClone(committedGoal), committedPlan: buildGoalEditDraft(committedGoal, { now: now() }).originalPlan, appliedDiff: actualDiff, committedAt: committedGoal.updatedAt, reviewTokenConsumed: true, unaffectedSystems: unaffectedSummary() });
        tokenRecord.consumed = true; tokenRecord.result = result; return result;
      } catch (cause) { return rejected("VALIDATION_FAILED", cause.message); }
      finally { locks.delete(command.sourceGoalId); }
    },
  });
}

export const ProductionGoalPlanUpdateService = createGoalPlanUpdateService();

function validateToken(record, command, clock) {
  if (!record?.token) return { code: "REVIEW_TOKEN_INVALID", message: "Final-review token is invalid." };
  const token = record.token;
  if (token.version !== GOAL_PLAN_REVIEW_TOKEN_VERSION) return { code: "REVIEW_TOKEN_VERSION_UNSUPPORTED", message: "Final-review token version is unsupported." };
  if (new Date(token.expiresAt).getTime() <= new Date(clock).getTime()) return { code: "REVIEW_TOKEN_EXPIRED", message: "Final-review token expired." };
  const matches = token.sourceGoalId === command.sourceGoalId && token.sourceRevision === command.expectedSourceRevision && token.originalPlanFingerprint === command.originalPlanFingerprint && token.proposedPlanFingerprint === fingerprint(command.proposedCanonicalPlan) && token.diffFingerprint === fingerprint(command.approvedDiff) && token.draftId === command.draftId;
  return matches ? null : { code: "REVIEW_TOKEN_BINDING_MISMATCH", message: "Final-review token does not match this approved update." };
}
function validateLiveGoal(goal, userId, expectedRevision) { if (!goal || goal.userId !== userId || goal.status !== "active" || goal.primary !== true) return rejected("GOAL_NOT_EDITABLE", "The requested active primary goal is unavailable.",{operation:"source_revision_validation",recommendedAction:"Reopen Goal Edit from the active goal."}); const actual = sourceRevision(goal); return actual === expectedRevision ? null : deepFreeze({ status: "stale",reasonCode:"SOURCE_REVISION_STALE",message:"The goal changed after this review was prepared.",goalId: goal.id, expectedRevision, actualRevision: actual,operation:"source_revision_validation", draftPreserved: true, recommendedAction: "Refresh and reconcile the draft before saving." }); }
function validateCandidate({ baseline, candidate, goalId, proposedPlan, allowUpdatedAt = false }) {
  if (!candidate || JSON.stringify(candidate) === undefined) return false;
  if (candidate.goals.length !== baseline.goals.length) return false;
  for (const root of EXCLUDED_ROOTS) if (!equal(candidate[root], baseline[root])) return false;
  for (const before of baseline.goals) { const after = candidate.goals.find((goal) => goal.id === before.id); if (!after) return false; if (before.id !== goalId && !equal(before, after)) return false; }
  const before = baseline.goals.find((goal) => goal.id === goalId); const after = candidate.goals.find((goal) => goal.id === goalId);
  for (const field of ["id", "userId", "status", "primary", "sourceGoalId", "createdFromTransitionId", "activationMetadata", "activatedAt", "activationState", "completion", "phases"]) if (!equal(before[field], after[field])) return false;
  const reAdapted = buildGoalEditDraft(after, { now: new Date(0) }).originalPlan;
  if (!equal(projectSupportedPlan(reAdapted), projectSupportedPlan(proposedPlan))) return false;
  if (!allowUpdatedAt && before.updatedAt !== after.updatedAt) return false;
  return true;
}
function projectSupportedPlan(plan) { const item = (value) => ({ key: value.key, label: value.label, description: value.description, metric: value.metric, operator: value.operator, value: value.value, unit: value.unit, scope: value.scope, required: value.required }); return { name: plan.name, purpose: plan.purpose, primaryOutcome: plan.primaryOutcome, target: plan.target, timeline: plan.timeline, successCriteria: plan.successCriteria.map(item), guardrails: plan.guardrails.map(item), coachingPreferences: plan.coachingPreferences }; }
function assertSupportedDiff(diff) { if (diff.changedSections.some((section) => !SUPPORTED_SECTIONS.has(section)) || diff.evidenceAndHistoryPreserved !== true) throw new Error("Diff contains an unsupported goal-plan change."); }
function findGoal(store, id) { return (store.goals ?? []).find((goal) => goal.id === id) ?? null; }
function rejected(reasonCode, message,details={}) { return deepFreeze({ status: "rejected", reasonCode, message,sectionErrors:details.sectionErrors??[],fieldErrors:details.fieldErrors??{},operation:details.operation??operationFor(reasonCode),errors: [{ message }], draftPreserved: true,recommendedAction:details.recommendedAction??recoveryFor(reasonCode) }); }
function failed(cause) { return deepFreeze({ status: "failed", reasonCode: cause?.code ?? "PERSISTENCE_FAILED", operation: cause?.stage ?? "founder_store_commit", error: { name: cause?.name ?? "Error", code: cause?.code ?? null, message: cause?.message ?? String(cause), stage: cause?.stage ?? null, committed: cause?.committed === true }, draftPreserved: true, automaticRetry: false }); }
function operationFor(reason){if(String(reason).startsWith("REVIEW_TOKEN"))return"review_token_validation";if(reason==="APPROVED_DIFF_MISMATCH")return"approved_diff_validation";if(reason==="ORIGINAL_PLAN_MISMATCH")return"original_plan_fingerprint_validation";if(reason==="COMMAND_INVALID")return"command_validation";if(reason==="OVERALL_GOAL_INCOMPLETE")return"canonical_plan_validation";return"goal_plan_validation"}
function recoveryFor(reason){if(reason==="REVIEW_TOKEN_EXPIRED")return"Prepare Final Review again before saving.";if(String(reason).startsWith("REVIEW_TOKEN"))return"Return to Review Changes and prepare a new Final Review.";if(reason==="APPROVED_DIFF_MISMATCH"||reason==="ORIGINAL_PLAN_MISMATCH")return"Reopen Goal Edit and review the current goal again.";if(reason==="OVERALL_GOAL_INCOMPLETE")return"Complete the Overall Goal fields, then prepare Final Review again.";return"Review the draft details before preparing Final Review again."}
function unaffectedSummary() { return { phases: true, protocols: true, briefings: true, scheduling: true, activation: true, completion: true, evidence: true, supportingGoals: true }; }
export function goalPlanFingerprint(value) { return fingerprint(value); }
function fingerprint(value) { const text = stableStringify(value); let hash = 2166136261; for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, "0"); }
function stableStringify(value) { if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function equal(left, right) { return stableStringify(left) === stableStringify(right); }
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
