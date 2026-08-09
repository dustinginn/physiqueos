import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import EvidenceReviewScreen from "../../../../screens/EvidenceReviewScreen";
import { createMobileEvidenceReviewFixture } from "../../../../fixtures/evidenceReviewFixtures";
import { repairPendingReviewExerciseIdentities } from "../../../../domain/services/EvidenceReviewPresentationService";
import { listCanonicalTrainingExerciseIdentities } from "../../../../domain/models/trainingExerciseIdentity";
import { confirmEvidenceReview, discardEvidenceReview, reprocessEvidenceReview, resolveEvidenceReviewExercise, updateEvidenceReviewExerciseVariant, updateEvidenceReviewPhotoPose } from "./actions";
import {
  createEvidenceRecoveryContext,
  evidenceReviewMatchesRecoveryContext,
  parseEvidenceRecoverySearchParams,
} from "../../../../domain/services/EvidenceRecoveryContext";

export const dynamic = "force-dynamic";

export default async function EvidenceReviewPage({ params, searchParams }) {
  const { reviewId } = await params;
  const query = await searchParams;
  const review = process.env.NODE_ENV !== "production" && reviewId === "fixture-mobile-review"
    ? createMobileEvidenceReviewFixture({
        newExercise: query?.state === "new-exercise",
        noneIncluded: query?.state === "none",
      })
    : await FounderRepositories.evidenceReviews.getReviewById(reviewId);
  if (!review) notFound();
  const requestedRecoveryContext = parseEvidenceRecoverySearchParams(query) ??
    createEvidenceRecoveryContext(
      review.interpretedEvidence?.review_metadata?.recoveryContext
    );
  const recoveryContext = evidenceReviewMatchesRecoveryContext(
    review,
    requestedRecoveryContext
  ) ? requestedRecoveryContext : null;
  const reprocessOutcome = ["updated", "current", "failed"].includes(query?.reprocess)
    ? query.reprocess
    : null;
  const presentedReview = { ...review, interpretedEvidence: repairPendingReviewExerciseIdentities(review.interpretedEvidence) };
  return <EvidenceReviewScreen canonicalExercises={listCanonicalTrainingExerciseIdentities()} confirmAction={confirmEvidenceReview} discardAction={discardEvidenceReview} exerciseResolutionAction={resolveEvidenceReviewExercise} exerciseVariantAction={updateEvidenceReviewExerciseVariant} photoPoseAction={updateEvidenceReviewPhotoPose} recoveryContext={recoveryContext} reprocessAction={reprocessEvidenceReview} reprocessOutcome={reprocessOutcome} review={presentedReview} />;
}
