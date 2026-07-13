import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import EvidenceReviewScreen from "../../../../screens/EvidenceReviewScreen";
import { confirmEvidenceReview, discardEvidenceReview, updateEvidenceReviewItemDecision } from "./actions";

export const dynamic = "force-dynamic";

export default async function EvidenceReviewPage({ params }) {
  const { reviewId } = await params;
  const review = await FounderRepositories.evidenceReviews.getReviewById(reviewId);
  if (!review) notFound();
  return <EvidenceReviewScreen confirmAction={confirmEvidenceReview} decisionAction={updateEvidenceReviewItemDecision} discardAction={discardEvidenceReview} review={review} />;
}
