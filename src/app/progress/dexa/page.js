import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { createProgressReportingService } from "../../../domain/services/ProgressReportingService";
import DEXAReportScreen from "../../../screens/DEXAReportScreen";

export const dynamic = "force-dynamic";

export default async function DEXAProgressPage({ searchParams }) {
  const params = await searchParams;
  const service = createProgressReportingService({
    repositories: FounderRepositories,
  });
  const report = await service.getDEXAReport();

  return <DEXAReportScreen from={params?.from} report={report} />;
}
