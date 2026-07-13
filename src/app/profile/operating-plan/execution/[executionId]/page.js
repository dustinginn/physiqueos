import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import ExecutionItemBuilderScreen from "../../../../../screens/ExecutionItemBuilderScreen";
import { saveExecutionItem } from "./actions";
export const dynamic="force-dynamic";
export default async function Page({params}){const {executionId}=await params;const item=await FounderRepositories.executionItems.getExecutionItemById(executionId);if(!item)notFound();return <ExecutionItemBuilderScreen action={saveExecutionItem} item={item}/>;}
