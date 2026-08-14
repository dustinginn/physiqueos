"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../../../data/repositories/founderRepositories";
import { loadApplicationRuntimeBindings } from "../../../../../../application/runtime/ApplicationCanonicalRuntime";
import { buildSupplementSupportDraftFromFormData, createSupplementSupportManagementService } from "../../../../../../domain/services/SupplementSupportManagementService";

export async function saveSupplementExecution(context, _priorState, formData) {
  const user=await FounderRepositories.users.getCurrentUser();
  const protocol=await FounderRepositories.protocols.getProtocolById(context.protocolId);
  if(!protocol||protocol.userId!==user.id||protocol.category!=="supplement"||protocol.status!=="active"){
    return{message:"This supplement is no longer available.",values:buildSupplementSupportDraftFromFormData(formData)};
  }
  const version=await FounderRepositories.protocolVersions.getCurrentVersion(protocol.id);
  if(!version){
    return{message:"This supplement changed while you were editing it. Review the latest version and try again.",values:buildSupplementSupportDraftFromFormData(formData)};
  }
  const draft=buildSupplementSupportDraftFromFormData(formData);
  const existing=(await FounderRepositories.executionItems.listExecutionItems(user.id))
    .find((item)=>item.type==="supplement"&&item.protocolRootId===protocol.id)??null;
  if(existing&&Number(context.expectedRevision)!==Number(existing.executionRevision)){
    return{message:"This supplement schedule changed while you were editing it. Review the latest version and try again.",values:draft};
  }
  if(!existing&&context.expectedRevision!==null&&context.expectedRevision!==undefined&&context.expectedRevision!==""){
    return{message:"This supplement schedule changed while you were editing it. Review the latest version and try again.",values:draft};
  }
  const goalId=version.goalLinks?.[0]?.goalId??protocol.currentGoalIds?.[0];
  const result=await createSupplementSupportManagementService({...await loadApplicationRuntimeBindings()}).save({...context,expectedRevision:existing?.executionRevision??null,supplementVersionId:version.id,goalId,userId:user.id,draft,author:{type:"user",id:user.id,displayName:user.name??user.displayName??"Founder"}});
  if(result.outcome!=="success")return{message:message(result,draft),values:draft};
  const authoritative=await FounderRepositories.executionItems.getExecutionItemById(result.executionId);
  if(!authoritative||authoritative.protocolRootId!==context.protocolId||authoritative.executionRevision!==result.executionRevision){
    return{message:"We could not reload the saved supplement schedule. Review the latest configuration and try again.",values:draft};
  }
  const path=`/profile/operating-plan/execution/supplements/${encodeURIComponent(context.protocolId)}`;
  revalidatePath(path,"page");
  revalidatePath(`/profile/protocols/${encodeURIComponent(context.protocolId)}`,"page");
  revalidatePath("/profile/operating-plan","page");
  revalidatePath("/","page");
  redirect(path);
}
function message(result){if(result.outcome==="unchanged")return"No changes to save.";if(result.outcome==="invalid")return result.reason||"Review the Support settings and try again.";if(result.outcome==="version_conflict")return"This Supplement Support changed while you were editing it. Review the latest version and try again.";return"We could not update this Supplement Support. Nothing was changed.";}
