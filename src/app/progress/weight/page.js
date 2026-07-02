import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { createProgressReportingService } from "../../../domain/services/ProgressReportingService";
import WeightReportScreen from "../../../screens/WeightReportScreen";

export const dynamic = "force-dynamic";

export default async function WeightProgressPage({ searchParams }) {
  const params = await searchParams;
  const service = createProgressReportingService({
    repositories: FounderRepositories,
  });
  const report = await service.getWeightReport();

  return <WeightReportScreen from={params?.from} report={report} />;
}
