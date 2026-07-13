import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createPhotoEventNarrativeService } from "../../../../domain/services/PhotoEventNarrativeService";
import PhotoEventBriefingScreen from "../../../../screens/PhotoEventBriefingScreen";

export const dynamic="force-dynamic";
export default async function PhotoEventPage({params}){const {sessionId}=await params;const user=await FounderRepositories.users.getCurrentUser();const artifact=await createPhotoEventNarrativeService({repositories:FounderRepositories}).getLatest({userId:user.id,sessionId});if(!artifact)notFound();return <PhotoEventBriefingScreen narrative={artifact.briefing.photoEventNarrative}/>;}
