import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";
import { getFounderRuntimeStore, resolveFounderRuntimeStorePath } from "../../data/repositories/founderRuntimeStore";
import { normalizeAuthoredGoalPhases } from "../models/authoredGoalPhase";
import { normalizeGoalPhaseCollection, resolveGoalPhases } from "../models/goalPhase";
import { sourceRevision } from "./GoalEditDraftService";
import { diffGoalPhases } from "./GoalPhaseDiffService";
import { goalPlanFingerprint } from "./GoalPlanUpdateService";

export const GOAL_PHASE_UPDATE_COMMAND_VERSION = "goal_phase_update_v1";
export const GOAL_PHASE_REVIEW_TOKEN_VERSION = "goal_phase_review_v1";
const TOKEN_TTL_MS = 10 * 60 * 1000;
const EXCLUDED_ROOTS = ["protocols", "protocolVersions", "energyStrategyLinks", "executionItems", "reminders", "dailyBriefings", "evidencePackages", "canonicalEvidenceObjects", "evidenceReviews", "progressPhotos", "dexaScans", "goalTransitionDrafts", "goalProtocolTransitionDrafts"];

export function createGoalPhaseUpdateCommand(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Goal Phase Update command must be an object.");
  if (input.commandVersion !== GOAL_PHASE_UPDATE_COMMAND_VERSION) throw new TypeError("Unsupported Goal Phase Update command version.");
  for (const field of ["sourceGoalId", "expectedSourceRevision", "originalPhaseFingerprint", "approvedPhaseDiff", "finalReviewToken", "draftId", "requestedAt"]) if (input[field] == null || input[field] === "") throw new TypeError(`Goal Phase Update command ${field} is required.`);
  if (!Array.isArray(input.proposedAuthoredPhases)) throw new TypeError("Proposed authored phases are required.");
  return deepFreeze(structuredClone(input));
}

export function createGoalPhasePersistenceService({
  runtimeStorePath = resolveFounderRuntimeStorePath(), liveStore = getFounderRuntimeStore(),
  readPersistedStore = () => JSON.parse(fs.readFileSync(runtimeStorePath, "utf8")), createUnitOfWork = createFounderStoreUnitOfWork,
  now = () => new Date(), createTokenId = () => randomUUID(), reviewTokenVersion = GOAL_PHASE_REVIEW_TOKEN_VERSION,
} = {}) {
  const tokens = new Map(); const locks = new Set();
  return Object.freeze({
    async getCapability({ founderUserId, sourceGoalId }) {
      const persisted = await readPersistedStore(); const goal = findGoal(persisted, sourceGoalId); const reasons = [];
      if (!goal) reasons.push("goal_not_found"); if (goal && goal.userId !== founderUserId) reasons.push("goal_owner_mismatch"); if (goal && (goal.status !== "active" || goal.primary !== true)) reasons.push("goal_not_editable");
      const explicit = goal && Array.isArray(goal.phases) ? goal.phases : []; let aggregateValid = true;
      try { normalizeGoalPhaseCollection(explicit, { goalId: sourceGoalId }); } catch { aggregateValid = false; reasons.push("phase_aggregate_invalid"); }
      return deepFreeze({ available: reasons.length === 0, sourceGoalId, sourceRevision: goal ? sourceRevision(goal) : null, explicitPhaseCount: explicit.length, hasExplicitPhases: explicit.length > 0, aggregateValid, atomicCommitAvailable: true, staleWriteProtectionAvailable: true, reviewTokenAvailable: true, blockingReasons: reasons });
    },

    async createFinalReview({ founderUserId, sourceGoalId, expectedSourceRevision, originalPhaseFingerprint, proposedAuthoredPhases, draftId }) {
      const persisted = await readPersistedStore(); const goal = findGoal(persisted, sourceGoalId); const stale = validateLiveGoal(goal, founderUserId, expectedSourceRevision, originalPhaseFingerprint); if (stale) return stale;
      let proposed;
      try { proposed = normalizeAuthoredGoalPhases(proposedAuthoredPhases, { goalId: sourceGoalId, parentGoalStatus: goal.status, now: now(), existingPhases: explicitPhases(goal) }); } catch (cause) { return rejected(cause.code ?? "PHASE_VALIDATION_FAILED", cause.message, cause.details); }
      const diff = diffGoalPhases(explicitPhases(goal), proposed, { goalId: sourceGoalId });
      if (diff.empty) return deepFreeze({ status: "no_changes", goalId: sourceGoalId, token: null, diff, draftPreserved: true });
      if (requiresPhaseReviewCoordinator(goal, diff)) {
        return rejected("PHASE_REVIEW_COORDINATOR_REQUIRED",
          "Operational phase lifecycle and timing changes require the Phase Review Commit Coordinator.");
      }
      const issued = now(); const token = deepFreeze({ id: createTokenId(), version: reviewTokenVersion, sourceGoalId, sourceRevision: expectedSourceRevision, originalPhaseFingerprint, proposedPhaseFingerprint: phaseFingerprint(proposed), diffFingerprint: phaseFingerprint(diff), draftId, issuedAt: issued.toISOString(), expiresAt: new Date(issued.getTime() + TOKEN_TTL_MS).toISOString() });
      tokens.set(token.id, { token, consumed: false, result: null });
      return deepFreeze({ status: "ready", goalId: sourceGoalId, token, diff, proposedAuthoredPhases: proposed, commitAvailable: true });
    },

    async commit(commandInput, { founderUserId } = {}) {
      let command; try { command = createGoalPhaseUpdateCommand(commandInput); } catch (cause) { return rejected("COMMAND_INVALID", cause.message); }
      if (locks.has(command.sourceGoalId)) return rejected("ALREADY_IN_PROGRESS", "This phase update is already in progress.");
      const record = tokens.get(command.finalReviewToken); if (record?.consumed) return record.result ?? rejected("REVIEW_TOKEN_CONSUMED", "This phase review token was consumed.");
      const tokenError = validateToken(record, command, now()); if (tokenError) return rejected(tokenError.code, tokenError.message);
      locks.add(command.sourceGoalId);
      try {
        const persisted = await readPersistedStore(); const goal = findGoal(persisted, command.sourceGoalId); const stale = validateLiveGoal(goal, founderUserId, command.expectedSourceRevision, command.originalPhaseFingerprint); if (stale) return stale;
        let proposed; try { proposed = normalizeAuthoredGoalPhases(command.proposedAuthoredPhases, { goalId: goal.id, parentGoalStatus: goal.status, now: now(), existingPhases: explicitPhases(goal) }); } catch (cause) { return rejected(cause.code ?? "PHASE_VALIDATION_FAILED", cause.message, cause.details); }
        const actualDiff = diffGoalPhases(explicitPhases(goal), proposed, { goalId: goal.id });
        if (actualDiff.empty) return rejected("EMPTY_DIFF", "No authored phase changes need to be saved.");
        if (requiresPhaseReviewCoordinator(goal, actualDiff)) {
          return rejected("PHASE_REVIEW_COORDINATOR_REQUIRED",
            "Operational phase lifecycle and timing changes require the Phase Review Commit Coordinator.");
        }
        if (!equal(actualDiff, command.approvedPhaseDiff)) return rejected("APPROVED_PHASE_DIFF_MISMATCH", "Approved phase diff does not match the proposed collection.");
        const baseline = structuredClone(persisted); const unit = createUnitOfWork({ filePath: runtimeStorePath, liveStore, stageFrom: persisted, binding: { storeIdentity: "founder_runtime_store", storeKind: "production", isolated: false, productionAllowed: true }, now });
        const transaction = unit.begin(); await transaction.mutate((staged) => { const index = staged.goals.findIndex((item) => item.id === goal.id); if (index < 0) throw new Error("Goal disappeared from candidate state."); staged.goals[index] = { ...staged.goals[index], phases: structuredClone(proposed) }; });
        let commitResult;
        try { commitResult = await transaction.commit({ validate: (candidate) => validateCandidate({ baseline, candidate, goalId: goal.id, proposed }), finalizeCandidate: ({ stagedState }) => { stagedState.goals.find((item) => item.id === goal.id).updatedAt = now().toISOString(); }, validateFinalized: (candidate) => validateCandidate({ baseline, candidate, goalId: goal.id, proposed, allowUpdatedAt: true }) }); }
        catch (cause) { const result = failed(cause); if (cause?.committed === true) { record.consumed = true; record.result = result; } return result; }
        const committedGoal = findGoal(liveStore, goal.id); const committedPhases = normalizeGoalPhaseCollection(committedGoal.phases ?? [], { goalId: goal.id });
        const result = deepFreeze({ status: "committed", goalId: goal.id, previousRevision: commitResult.expectedRevision, committedRevision: commitResult.revision, committedPhases, appliedDiff: actualDiff, activePhaseId: committedPhases.find((phase) => phase.status === "active")?.id ?? null, committedAt: committedGoal.updatedAt, reviewTokenConsumed: true, unaffectedSystems: unaffectedSummary() });
        record.consumed = true; record.result = result; return result;
      } catch (cause) { return rejected("VALIDATION_FAILED", cause.message); }
      finally { locks.delete(command.sourceGoalId); }
    },
  });
}

export const ProductionGoalPhasePersistenceService = createGoalPhasePersistenceService();
export function phaseFingerprint(phases) { return goalPlanFingerprint(phases ?? []); }

function validateLiveGoal(goal, userId, expectedRevision, expectedPhaseFingerprint) {
  if (!goal || goal.userId !== userId || goal.status !== "active" || goal.primary !== true) return rejected("GOAL_NOT_EDITABLE", "The active primary goal is unavailable.");
  const actualRevision = sourceRevision(goal); const actualPhaseFingerprint = phaseFingerprint(explicitPhases(goal));
  if (actualRevision !== expectedRevision || actualPhaseFingerprint !== expectedPhaseFingerprint) return deepFreeze({ status: "stale", goalId: goal.id, expectedRevision, actualRevision, expectedPhaseFingerprint, actualPhaseFingerprint, draftPreserved: true, recommendedAction: "Refresh and reconcile the phase draft before saving." });
  return null;
}
function validateToken(record, command, clock) { if (!record?.token) return { code: "REVIEW_TOKEN_INVALID", message: "Phase review token is invalid." }; const token = record.token; if (token.version !== GOAL_PHASE_REVIEW_TOKEN_VERSION) return { code: "REVIEW_TOKEN_VERSION_UNSUPPORTED", message: "Phase review token version is unsupported." }; if (new Date(token.expiresAt).getTime() <= new Date(clock).getTime()) return { code: "REVIEW_TOKEN_EXPIRED", message: "Phase review token expired." }; const valid = token.sourceGoalId === command.sourceGoalId && token.sourceRevision === command.expectedSourceRevision && token.originalPhaseFingerprint === command.originalPhaseFingerprint && token.proposedPhaseFingerprint === phaseFingerprint(command.proposedAuthoredPhases) && token.diffFingerprint === phaseFingerprint(command.approvedPhaseDiff) && token.draftId === command.draftId; return valid ? null : { code: "REVIEW_TOKEN_BINDING_MISMATCH", message: "Phase review token does not match this update." }; }
function validateCandidate({ baseline, candidate, goalId, proposed, allowUpdatedAt = false }) {
  JSON.stringify(candidate); if (candidate.goals.length !== baseline.goals.length) return false; for (const root of EXCLUDED_ROOTS) if (!equal(candidate[root], baseline[root])) return false;
  for (const before of baseline.goals) { const after = findGoal(candidate, before.id); if (!after) return false; if (before.id !== goalId && !equal(before, after)) return false; }
  const before = findGoal(baseline, goalId); const after = findGoal(candidate, goalId); const beforeProtected = { ...before }; const afterProtected = { ...after }; delete beforeProtected.phases; delete afterProtected.phases; if (allowUpdatedAt) { delete beforeProtected.updatedAt; delete afterProtected.updatedAt; } if (!equal(beforeProtected, afterProtected)) return false;
  let rehydrated; try { rehydrated = normalizeGoalPhaseCollection(after.phases ?? [], { goalId }); } catch { return false; }
  if (!equal(rehydrated, proposed)) return false; if (rehydrated.some((phase) => phase.implicit === true)) return false;
  const resolved = resolveGoalPhases(after); if (proposed.length > 0 ? !equal(resolved, proposed) : resolved[0]?.implicit !== true) return false;
  const legacy = { id: "legacy-check", title: "Legacy", status: "active" }; if (resolveGoalPhases(legacy)[0]?.implicit !== true) return false;
  return true;
}
function explicitPhases(goal) { return Array.isArray(goal?.phases) ? goal.phases : []; }
function requiresPhaseReviewCoordinator(goal, diff) {
  return explicitPhases(goal).length > 0 && diff.altersCurrentOperationalPhase === true;
}
function findGoal(store, id) { return (store?.goals ?? []).find((goal) => goal.id === id) ?? null; }
function rejected(reasonCode, message, details = {}) { return deepFreeze({ status: "rejected", reasonCode, errors: [{ message, details }], draftPreserved: true }); }
function failed(cause) { return deepFreeze({ status: "failed", reasonCode: cause?.code ?? "PERSISTENCE_FAILED", operation: cause?.stage ?? "founder_store_commit", error: { name: cause?.name ?? "Error", code: cause?.code ?? null, message: cause?.message ?? String(cause), stage: cause?.stage ?? null, committed: cause?.committed === true }, draftPreserved: true, automaticRetry: false }); }
function unaffectedSummary() { return { goalPlan: true, protocols: true, briefings: true, scheduling: true, activation: true, completion: true, evidence: true, supportingGoals: true }; }
function equal(left, right) { if (left === right) return true; if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => equal(item, right[index])); if (left && right && typeof left === "object" && typeof right === "object") { const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])]; return keys.every((key) => equal(left[key], right[key])); } return false; }
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
