import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { createProgressReportingService } from "../../../domain/services/ProgressReportingService";
import ProgressPlaceholderScreen from "../../../screens/ProgressPlaceholderScreen";

export const dynamic = "force-dynamic";

export default async function ActivityProgressPage({ searchParams }) {
  const query = await searchParams;
  const service = createProgressReportingService({
    repositories: FounderRepositories,
  });
  const report = await service.getActivityReport();

  return <ProgressPlaceholderScreen from={query?.from} report={report} />;
}
