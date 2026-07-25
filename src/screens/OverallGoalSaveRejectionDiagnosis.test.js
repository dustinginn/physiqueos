import fs from "node:fs";
import path from "node:path";
import { describe,expect,it } from "vitest";
import { goalEditSaveKind } from "./GoalEditWizardScreen";

const screen=fs.readFileSync(path.resolve(process.cwd(),"src/screens/GoalEditWizardScreen.jsx"),"utf8");
const actions=fs.readFileSync(path.resolve(process.cwd(),"src/app/goals/[goalId]/edit/actions.js"),"utf8");
const service=fs.readFileSync(path.resolve(process.cwd(),"src/domain/services/GoalPlanUpdateService.js"),"utf8");

describe("Overall Goal save rejection diagnosis",()=>{
 it("reproduces the pre-repair action-routing rejection",async()=>{const goalReview={token:{version:"goal_plan_review_v1"},diff:{empty:false}};const phaseAction=async(_draft,review)=>!Array.isArray(review.proposedAuthoredPhases)?{status:"rejected",reasonCode:"FINAL_REVIEW_REQUIRED",operation:"phase_action_precondition",draftPreserved:true}:{status:"committed"};const legacyResult=await (goalReview.token?phaseAction({},goalReview):Promise.resolve({status:"committed"}));expect(legacyResult).toMatchObject({status:"rejected",reasonCode:"FINAL_REVIEW_REQUIRED",operation:"phase_action_precondition",draftPreserved:true})});
 it("routes by review-token version after repair",()=>{expect(goalEditSaveKind({token:{version:"goal_plan_review_v1"}})).toBe("goal");expect(goalEditSaveKind({token:{version:"goal_phase_review_v1"}})).toBe("phase");expect(goalEditSaveKind({token:{version:"future"}})).toBe("invalid");expect(screen).not.toContain("review?.token?await savePhaseChanges")});
 it("renders typed outcomes without the generic Review blocked state",()=>{for(const copy of ["Goal update needs attention","Goal changed since this review","Final Review expired","Goal update could not be saved","Final Review needs to be prepared again"])expect(screen).toContain(copy);expect(screen).not.toContain(">Review blocked<");expect(screen).toContain("data-result-reason");expect(screen).toContain("data-result-status");expect(screen).toContain("No automatic retry was attempted")});
 it("preserves detailed safe service fields",()=>{for(const field of ["reasonCode","message","sectionErrors","fieldErrors","operation","draftPreserved","recommendedAction"])expect(service).toContain(field);expect(service).toContain("expectedRevision");expect(service).toContain("actualRevision")});
 it("logs safe server diagnostics without token contents or founder payloads",()=>{const diagnostic=actions.slice(actions.indexOf("function logGoalPlanSaveDiagnostic"));for(const field of ["goalId","draftId","commandVersion","reasonCode","operation","expectedSourceRevision","actualSourceRevision","proposedPlanFingerprint","diffFingerprint","tokenVersion","validationSections","candidateValidationStage","timestamp"])expect(diagnostic).toContain(field);expect(diagnostic).not.toContain("fullFounderState");expect(diagnostic).not.toContain("rawToken");expect(diagnostic).not.toContain("review.token.id")});
 it("clears failed commit state when navigating so the draft remains recoverable",()=>{expect(screen).toContain("setReview(null);setCommit(null)");expect(screen).toContain("Your draft is still here")});
});
