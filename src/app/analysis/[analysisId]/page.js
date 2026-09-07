import { notFound } from "next/navigation";
import AnalysisScreen from "../../../screens/AnalysisScreen";
import { getProductionBriefingNavigationReadService } from "../../../application/composition/productionApplicationComposition";

export const dynamic = "force-dynamic";

export default async function AnalysisPage({ params }) {
  const { analysisId } = await params;
  const analysis = await getProductionBriefingNavigationReadService().getAnalysis({ analysisId });

  if (!analysis) notFound();

  return <AnalysisScreen analysis={analysis} />;
}
