import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createDEXAEventNarrativeService } from "../../../../domain/services/DEXAEventNarrativeService";
import DEXAEventBriefingScreen from "../../../../screens/DEXAEventBriefingScreen";

export const dynamic = "force-dynamic";
export default async function DEXAEventPage({ params }) { const { scanId } = await params; const user = await FounderRepositories.users.getCurrentUser(); const artifact = await createDEXAEventNarrativeService({ repositories: FounderRepositories }).getByScanId({ userId: user.id, scanId }); if (!artifact) notFound(); return <DEXAEventBriefingScreen narrative={artifact.briefing.dexaEventNarrative}/>; }
