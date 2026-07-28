import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import ExecutionItemBuilderScreen from "../../../../../screens/ExecutionItemBuilderScreen";
import { saveExecutionItem } from "./actions";
import { getFounderRuntimeStore, resolveFounderRuntimeStorePath } from "../../../../../data/repositories/founderRuntimeStore";
import { createProgressPhotosExecutionScheduleService } from "../../../../../domain/services/ProgressPhotosExecutionScheduleService";
export const dynamic="force-dynamic";
export default async function Page({params}){const {executionId}=await params;const item=await FounderRepositories.executionItems.getExecutionItemById(executionId);if(!item)notFound();const hydration=executionId==="execution_progress_photos"?createProgressPhotosExecutionScheduleService({runtimeStorePath:resolveFounderRuntimeStorePath(),liveStore:getFounderRuntimeStore()}).hydrate():null;return <ExecutionItemBuilderScreen action={saveExecutionItem} context={hydration?.context} item={hydration?.item??item}/>;}
