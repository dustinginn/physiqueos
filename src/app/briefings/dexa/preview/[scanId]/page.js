import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { createDEXAEventNarrativeService } from "../../../../../domain/services/DEXAEventNarrativeService";
import DEXAEventBriefingScreen from "../../../../../screens/DEXAEventBriefingScreen";

export const dynamic = "force-dynamic";
export default async function DEXAPreviewPage({ params, searchParams }) { const { scanId } = await params; const { baseline = null } = await searchParams; const user = await FounderRepositories.users.getCurrentUser(); const narrative = await createDEXAEventNarrativeService({ repositories: FounderRepositories }).preview({ userId: user.id, scanId, baselineScanId: baseline }); return <DEXAEventBriefingScreen narrative={narrative} preview/>; }
