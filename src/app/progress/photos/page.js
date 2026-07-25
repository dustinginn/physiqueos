import { getPhotosTimelineReport } from "../../../domain/services/PhotosEvidenceContextService";
import ProgressPlaceholderScreen from "../../../screens/ProgressPlaceholderScreen";

export const dynamic = "force-dynamic";

export default async function PhotosProgressPage({ searchParams }) {
  const params = await searchParams;
  const { report, timeline } = await getPhotosTimelineReport({
    context: params?.context,
  });

  return (
    <ProgressPlaceholderScreen
      evidenceContext={timeline}
      from={params?.from}
      report={report}
    />
  );
}
