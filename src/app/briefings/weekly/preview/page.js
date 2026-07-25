import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createWeeklyBriefingV4PreviewService } from "../../../../domain/services/WeeklyBriefingV4PreviewService";
import WeeklyBriefingScreen from "../../../../screens/WeeklyBriefingScreen";

export const dynamic="force-dynamic";
export default async function WeeklyV4PreviewPage({searchParams}){const user=await FounderRepositories.users.getCurrentUser();const query=await searchParams;const narrative=await createWeeklyBriefingV4PreviewService({repositories:FounderRepositories}).preview({userId:user.id,previewDate:query?.date??"2026-07-19"});return <WeeklyBriefingScreen narrative={narrative}/>;}
