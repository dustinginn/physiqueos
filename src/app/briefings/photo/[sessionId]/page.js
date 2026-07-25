import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createPhotoEventNarrativeService } from "../../../../domain/services/PhotoEventNarrativeService";
import PhotoEventBriefingScreen from "../../../../screens/PhotoEventBriefingScreen";
import { completeVisibleAbsGoal } from "./actions";

export const dynamic="force-dynamic";
export default async function PhotoEventPage({params}){const {sessionId}=await params;const user=await FounderRepositories.users.getCurrentUser();const [artifact,goal]=await Promise.all([createPhotoEventNarrativeService({repositories:FounderRepositories}).getLatest({userId:user.id,sessionId}),FounderRepositories.goals.getGoalById("goal_visible_abs_at_rest")]);if(!artifact)notFound();return <PhotoEventBriefingScreen artifactId={artifact.id} completion={goal?.completion??null} completeAction={completeVisibleAbsGoal} narrative={artifact.briefing.photoEventNarrative}/>;}
