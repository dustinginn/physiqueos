"use server";

import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { assessGoalEditReview } from "../../../../domain/services/GoalEditDraftService";
import { validatePhaseEditingDraft } from "../../../../domain/services/GoalEditPhaseDraftService";
import { diffGoalPlans } from "../../../../domain/services/GoalPlanDiffService";
import { GOAL_PHASE_UPDATE_COMMAND_VERSION, ProductionGoalPhasePersistenceService, createGoalPhaseUpdateCommand } from "../../../../domain/services/GoalPhasePersistenceService";
import { assessPhaseTimelineIntegrity } from "../../../../domain/services/GoalPhaseTimelineIntegrityService";
import { GOAL_PLAN_UPDATE_COMMAND_VERSION, ProductionGoalPlanUpdateService, createGoalPlanUpdateCommand, goalPlanFingerprint } from "../../../../domain/services/GoalPlanUpdateService";

export async function prepareGoalEditReview(draft) {
  if (!diffGoalPlans(draft.originalPlan, draft.workingPlan).empty && draft.phaseEditing?.diff && !draft.phaseEditing.diff.empty) return combinedBlocked(draft);
  const user = await FounderRepositories.users.getCurrentUser();
  const liveGoal = await FounderRepositories.goals.getGoalById(draft.sourceGoalId);
  const reviewedDraft = assessGoalEditReview(draft, liveGoal);
  if (reviewedDraft.finalReview.stale) return structuredClone({ reviewedDraft, status: "stale", commitAvailable: false });
  const review = await ProductionGoalPlanUpdateService.createFinalReview({ founderUserId: user?.id, draft });
  return structuredClone({ reviewedDraft, ...review, commitAvailable: review.status === "ready" });
}

export async function prepareGoalPhaseReview(draft) {
  if (!diffGoalPlans(draft.originalPlan, draft.workingPlan).empty) return combinedBlocked(draft);
  const validation = validatePhaseEditingDraft(draft);
  if (!validation.valid) return { status: "rejected", commitAvailable: false, errors: validation.errors, draftPreserved: true };
  const timelineIntegrity=assessPhaseTimelineIntegrity(draft);
  if(!timelineIntegrity.valid)return {status:"rejected",reasonCode:"PHASE_TIMELINE_INTEGRITY_FAILED",commitAvailable:false,errors:timelineIntegrity.errors,draftPreserved:true,timelineIntegrity};
  const user = await FounderRepositories.users.getCurrentUser();
  return structuredClone(await ProductionGoalPhasePersistenceService.createFinalReview({ founderUserId: user?.id, sourceGoalId: draft.sourceGoalId, expectedSourceRevision: draft.sourceRevision, originalPhaseFingerprint: draft.phaseEditing.originalPhaseFingerprint, proposedAuthoredPhases: validation.phases, draftId: draft.id }));
}

export async function saveGoalPhaseChanges(draft, review) {
  if (!review?.token || !review?.diff || !Array.isArray(review.proposedAuthoredPhases)) return { status: "rejected", reasonCode: "FINAL_REVIEW_REQUIRED", draftPreserved: true };
  const user = await FounderRepositories.users.getCurrentUser();
  const command = createGoalPhaseUpdateCommand({ commandVersion: GOAL_PHASE_UPDATE_COMMAND_VERSION, sourceGoalId: draft.sourceGoalId, expectedSourceRevision: draft.sourceRevision, originalPhaseFingerprint: draft.phaseEditing.originalPhaseFingerprint, proposedAuthoredPhases: review.proposedAuthoredPhases, approvedPhaseDiff: review.diff, finalReviewToken: review.token.id, draftId: draft.id, requestedAt: new Date().toISOString() });
  return structuredClone(await ProductionGoalPhasePersistenceService.commit(command, { founderUserId: user?.id }));
}

export async function saveGoalEditChanges(draft, review) {
  const user = await FounderRepositories.users.getCurrentUser();
  if (!review?.token || !review?.diff) return { status: "rejected", reasonCode: "FINAL_REVIEW_REQUIRED",message:"Prepare Final Review before saving.",sectionErrors:[],fieldErrors:{},operation:"server_action_precondition", draftPreserved: true,recommendedAction:"Return to Review Changes and prepare Final Review again." };
  const command = createGoalPlanUpdateCommand({
    commandVersion: GOAL_PLAN_UPDATE_COMMAND_VERSION,
    sourceGoalId: draft.sourceGoalId,
    expectedSourceRevision: draft.sourceRevision,
    originalPlanFingerprint: review.token.originalPlanFingerprint,
    proposedCanonicalPlan: draft.workingPlan,
    approvedDiff: review.diff,
    finalReviewToken: review.token.id,
    draftId: draft.id,
    requestedAt: new Date().toISOString(),
  });
  const result=await ProductionGoalPlanUpdateService.commit(command, { founderUserId: user?.id });
  if(result.status!=="committed")logGoalPlanSaveDiagnostic({draft,review,command,result});
  return structuredClone(result);
}

function logGoalPlanSaveDiagnostic({draft,review,command,result}){const diagnostic={event:"goal_plan_save_result",goalId:draft.sourceGoalId,draftId:draft.id,commandVersion:command.commandVersion,status:result.status,reasonCode:result.reasonCode??null,operation:result.operation??null,expectedSourceRevision:result.expectedRevision??command.expectedSourceRevision,actualSourceRevision:result.actualRevision??null,proposedPlanFingerprint:goalPlanFingerprint(command.proposedCanonicalPlan),diffFingerprint:goalPlanFingerprint(command.approvedDiff),tokenVersion:review.token.version,validationSections:review.diff?.changedSections??[],candidateValidationStage:result.error?.stage??null,timestamp:new Date().toISOString()};console.error(JSON.stringify(diagnostic))}

function combinedBlocked(draft) { return { status: "combined_changes_blocked", commitAvailable: false, draftPreserved: true, reviewedDraft: draft, message: "Goal-plan and phase changes cannot be saved together. Save one category, then reopen this wizard for the other." }; }
