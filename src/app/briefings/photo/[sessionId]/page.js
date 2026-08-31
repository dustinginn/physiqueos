import { notFound } from "next/navigation";
import { getProductionPhotoEventBriefingReadService } from "../../../../application/composition/productionApplicationComposition";
import PhotoEventBriefingScreen from "../../../../screens/PhotoEventBriefingScreen";
import { completeVisibleAbsGoal } from "./actions";

export const dynamic="force-dynamic";
export default async function PhotoEventPage({params}){const {sessionId}=await params;const result=await getProductionPhotoEventBriefingReadService().getPhotoEvent({sessionId});if(!result)notFound();return <PhotoEventBriefingScreen artifactId={result.artifactId} completion={result.completion} completeAction={completeVisibleAbsGoal} narrative={result.narrative}/>;}
