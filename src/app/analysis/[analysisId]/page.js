import { notFound } from "next/navigation";
import AnalysisScreen from "../../../screens/AnalysisScreen";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";

export const dynamic = "force-dynamic";

export default async function AnalysisPage({ params }) {
  const { analysisId } = await params;
  const analysis = await FounderRepositories.analyses.getAnalysisById(analysisId);

  if (!analysis) notFound();

  return <AnalysisScreen analysis={analysis} />;
}
