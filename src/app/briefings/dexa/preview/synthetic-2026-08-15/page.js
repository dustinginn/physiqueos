import { createSyntheticDexaV2Preview } from "../../../../../domain/services/SyntheticDEXAV2PreviewService";
import DEXAEventBriefingScreen from "../../../../../screens/DEXAEventBriefingScreen";
import PhaseReviewCard from "../../../../../components/goals/PhaseReviewCard";

export const dynamic = "force-dynamic";

export default function SyntheticDEXAV2PreviewPage() {
  const preview = createSyntheticDexaV2Preview();
  return <DEXAEventBriefingScreen
    narrative={preview.presentation}
    phaseReview={<PhaseReviewCard review={preview.phaseReview}/>}
    preview
  />;
}
