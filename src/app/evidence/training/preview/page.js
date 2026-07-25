import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createProgressReportingService } from "../../../../domain/services/ProgressReportingService";
import { getTrainingEvidenceContextPreview } from "../../../../domain/services/TrainingEvidenceContextPreviewService";
import ProgressPlaceholderScreen from "../../../../screens/ProgressPlaceholderScreen";

export const dynamic = "force-dynamic";

export default async function TrainingEvidenceContextPreviewPage({ searchParams }) {
  const query = await searchParams;
  const evidenceContext = await getTrainingEvidenceContextPreview({ context: query?.context });
  const report = await createProgressReportingService({ repositories: FounderRepositories })
    .getPlaceholderReport("training", undefined, {
      dateWindow: evidenceContext.goalScoped
        ? { startDate: evidenceContext.startDate, endDate: evidenceContext.endDate }
        : null,
    });
  report.trainingLibrary = report.trainingLibrary.map((item) =>
    item.id === "region-arms"
      ? { ...item, href: `/evidence/training/preview/arms?context=${evidenceContext.contextId}` }
      : item
  );

  return (
    <ProgressPlaceholderScreen
      evidenceContext={{
        ...evidenceContext,
        currentPath: "/evidence/training/preview",
      }}
      report={report}
    />
  );
}
