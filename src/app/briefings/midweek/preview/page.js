import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createMidweekBriefingPreviewService } from "../../../../domain/services/MidweekBriefingPreviewService";
import MidweekBriefingScreen from "../../../../screens/MidweekBriefingScreen";

export default async function MidweekBriefingPreviewPage({ searchParams }) {
  const user = await FounderRepositories.users.getCurrentUser();
  const params = await searchParams;
  const briefing = await createMidweekBriefingPreviewService({ repositories: FounderRepositories }).preview({ userId: user.id, previewDate: params?.date });
  return <MidweekBriefingScreen briefing={briefing}/>;
}
