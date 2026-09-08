import { notFound } from "next/navigation";
import { createProgressReportingService } from "../../../domain/services/ProgressReportingService";
import { loadProductionBoundedFounderReadContext } from "../../../application/composition/productionApplicationComposition";
import ProgressPlaceholderScreen from "../../../screens/ProgressPlaceholderScreen";

export const dynamic = "force-dynamic";

export default async function ProgressStreamPage({ params, searchParams }) {
  const { stream } = await params;
  const query = await searchParams;
  const { repositories } = await loadProductionBoundedFounderReadContext({
    collections: getStreamCollections(stream),
  });
  const service = createProgressReportingService({
    repositories,
  });
  const report = await service.getPlaceholderReport(stream);

  if (!report) notFound();

  return <ProgressPlaceholderScreen from={query?.from} report={report} />;
}

function getStreamCollections(stream) {
  if (stream === "protocols") return ["user", "goals", "protocols"];
  if (stream === "recovery") return ["user", "goals", "canonicalEvidenceObjects"];
  return ["user", "goals"];
}
