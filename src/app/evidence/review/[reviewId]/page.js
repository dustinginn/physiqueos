import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import EvidenceReviewScreen from "../../../../screens/EvidenceReviewScreen";
import { createMobileEvidenceReviewFixture } from "../../../../fixtures/evidenceReviewFixtures";
import { repairPendingReviewExerciseIdentities } from "../../../../domain/services/EvidenceReviewPresentationService";
import { confirmEvidenceReview, discardEvidenceReview, reprocessEvidenceReview } from "./actions";

export const dynamic = "force-dynamic";

export default async function EvidenceReviewPage({ params, searchParams }) {
  const { reviewId } = await params;
  const query = await searchParams;
  const review = process.env.NODE_ENV !== "production" && reviewId === "fixture-mobile-review"
    ? createMobileEvidenceReviewFixture({ noneIncluded: query?.state === "none" })
    : await FounderRepositories.evidenceReviews.getReviewById(reviewId);
  if (!review) notFound();
  const presentedReview = { ...review, interpretedEvidence: repairPendingReviewExerciseIdentities(review.interpretedEvidence) };
  return <EvidenceReviewScreen confirmAction={confirmEvidenceReview} discardAction={discardEvidenceReview} reprocessAction={reprocessEvidenceReview} review={presentedReview} />;
}
