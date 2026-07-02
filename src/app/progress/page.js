import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { createProgressReportingService } from "../../domain/services/ProgressReportingService";
import ProgressHubScreen from "../../screens/ProgressHubScreen";

export const dynamic = "force-dynamic";

export default async function ProgressPage({ searchParams }) {
  const params = await searchParams;
  const service = createProgressReportingService({
    repositories: FounderRepositories,
  });
  const report = await service.getProgressHub();

  return <ProgressHubScreen from={params?.from} report={report} />;
}
