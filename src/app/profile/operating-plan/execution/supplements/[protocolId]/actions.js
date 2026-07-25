"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../../../data/repositories/founderRepositories";
import { getFounderRuntimeStore, resolveFounderRuntimeStorePath } from "../../../../../../data/repositories/founderRuntimeStore";
import { buildSupplementExecutionDraftFromFormData, createSupplementExecutionManagementService } from "../../../../../../domain/services/SupplementExecutionManagementService";

export async function saveSupplementExecution(context, _priorState, formData) {
  const user=await FounderRepositories.users.getCurrentUser();
  const protocol=await FounderRepositories.protocols.getProtocolById(context.protocolId);
  if(!protocol||protocol.userId!==user.id||protocol.category!=="supplement"||protocol.status!=="active"){
    return{message:"This supplement is no longer available.",values:buildSupplementExecutionDraftFromFormData(formData)};
  }
  const version=await FounderRepositories.protocolVersions.getCurrentVersion(protocol.id);
  if(!version){
    return{message:"This supplement schedule changed while you were editing it. Review the latest version and try again.",values:buildSupplementExecutionDraftFromFormData(formData)};
  }
  const draft=buildSupplementExecutionDraftFromFormData(formData);
  const existing=(await FounderRepositories.executionItems.listExecutionItems(user.id))
    .find((item)=>item.type==="supplement"&&item.protocolRootId===protocol.id)??null;
  if(existing&&Number(context.expectedRevision)!==Number(existing.executionRevision)){
    return{message:"This supplement schedule changed while you were editing it. Review the latest version and try again.",values:draft};
  }
  if(!existing&&context.expectedRevision!==null&&context.expectedRevision!==undefined&&context.expectedRevision!==""){
    return{message:"This supplement schedule changed while you were editing it. Review the latest version and try again.",values:draft};
  }
  const goalId=version.goalLinks?.[0]?.goalId??protocol.currentGoalIds?.[0];
  const result=await createSupplementExecutionManagementService({runtimeStorePath:resolveFounderRuntimeStorePath(),liveStore:getFounderRuntimeStore()}).save({...context,expectedRevision:existing?.executionRevision??null,supplementVersionId:version.id,goalId,userId:user.id,draft,author:{type:"user",id:user.id,displayName:user.name??user.displayName??"Founder"}});
  if(result.outcome!=="success")return{message:message(result,draft),values:draft};
  const authoritative=await FounderRepositories.executionItems.getExecutionItemById(result.executionId);
  if(!authoritative||authoritative.protocolRootId!==context.protocolId||authoritative.executionRevision!==result.executionRevision){
    return{message:"We could not reload the saved supplement schedule. Review the latest configuration and try again.",values:draft};
  }
  const path=`/profile/operating-plan/execution/supplements/${encodeURIComponent(context.protocolId)}`;
  revalidatePath(path,"page");
  revalidatePath("/profile/operating-plan","page");
  redirect(path);
}
function message(result,draft){if(result.outcome==="unchanged")return"No changes to save.";if(result.outcome==="invalid"&&draft.cadence?.type==="every_other_day"&&!draft.preferredSchedule?.startDate)return"Choose a start date for an every-other-day schedule.";if(result.outcome==="invalid")return result.reason||"Review the schedule and try again.";if(result.outcome==="version_conflict")return"This supplement schedule changed while you were editing it. Review the latest version and try again.";return"We could not update this supplement schedule. Nothing was changed.";}
