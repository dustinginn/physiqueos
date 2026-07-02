import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { createProgressReportingService } from "../../../domain/services/ProgressReportingService";
import ProgressPlaceholderScreen from "../../../screens/ProgressPlaceholderScreen";

export const dynamic = "force-dynamic";

export default async function ProgressStreamPage({ params, searchParams }) {
  const { stream } = await params;
  const query = await searchParams;
  const service = createProgressReportingService({
    repositories: FounderRepositories,
  });
  const report = await service.getPlaceholderReport(stream);

  if (!report) notFound();

  return <ProgressPlaceholderScreen from={query?.from} report={report} />;
}
