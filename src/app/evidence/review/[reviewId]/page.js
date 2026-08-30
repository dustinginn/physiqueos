import { notFound } from "next/navigation";
import EvidenceReviewScreen from "../../../../screens/EvidenceReviewScreen";
import { createMobileEvidenceReviewFixture } from "../../../../fixtures/evidenceReviewFixtures";
import { repairPendingReviewExerciseIdentities } from "../../../../domain/services/EvidenceReviewPresentationService";
import { listCanonicalTrainingExerciseIdentities } from "../../../../domain/models/trainingExerciseIdentity";
import { confirmEvidenceReview, discardEvidenceReview, reprocessEvidenceReview, resolveEvidenceReviewExercise, updateEvidenceReviewDexaMeasurements, updateEvidenceReviewExerciseRelationship, updateEvidenceReviewExerciseVariant, updateEvidenceReviewPhotoPose, updateEvidenceReviewPhotoSessionMetadata } from "./actions";
import {
  createEvidenceRecoveryContext,
  evidenceReviewMatchesRecoveryContext,
  parseEvidenceRecoverySearchParams,
} from "../../../../domain/services/EvidenceRecoveryContext";
import {
  prepareNutritionEvidencePackageForReview,
} from "../../../../domain/services/CanonicalNutritionDayService";
import { resolveEvidenceReviewReprocessEligibility } from "../../../../domain/services/EvidenceReviewReprocessEligibility";
import { getProductionEvidenceReviewReadService } from "../../../../application/composition/productionApplicationComposition";

export const dynamic = "force-dynamic";

export default async function EvidenceReviewPage({ params, searchParams }) {
  const { reviewId } = await params;
  const query = await searchParams;
  const fixtureReview = process.env.NODE_ENV !== "production" && reviewId === "fixture-mobile-review"
    ? createMobileEvidenceReviewFixture({
        newExercise: query?.state === "new-exercise",
        noneIncluded: query?.state === "none",
      })
    : null;
  const read = fixtureReview
    ? { review: fixtureReview, evidencePackage: fixtureReview.interpretedEvidence, canonicalObjects: [] }
    : await getProductionEvidenceReviewReadService().getReview(reviewId);
  const review = read?.review;
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
  const canonicalObjects = read.canonicalObjects;
  const persistedPackage = read.evidencePackage;
  const interpretedEvidence = prepareNutritionEvidencePackageForReview({
    canonicalObjects,
    evidencePackage: repairPendingReviewExerciseIdentities(
      review.interpretedEvidence
    ),
    reviewId,
  });
  const presentedReview = { ...review, interpretedEvidence };
  const reprocessEligibility = resolveEvidenceReviewReprocessEligibility({
    review,
    evidencePackage: persistedPackage ??
      (review.source === "dedicated_dexa" ? review.interpretedEvidence : null),
    canonicalObjects,
  });
  const dexaEditOutcome = ["updated", "stale"].includes(query?.dexa) ? query.dexa : null;
  const photoEditOutcome = query?.photo === "stale" ? "stale" : null;
  return <EvidenceReviewScreen canonicalExercises={listCanonicalTrainingExerciseIdentities()} confirmAction={confirmEvidenceReview} dexaEditOutcome={dexaEditOutcome} dexaMeasurementsAction={updateEvidenceReviewDexaMeasurements} discardAction={discardEvidenceReview} exerciseRelationshipAction={updateEvidenceReviewExerciseRelationship} exerciseResolutionAction={resolveEvidenceReviewExercise} exerciseVariantAction={updateEvidenceReviewExerciseVariant} photoEditOutcome={photoEditOutcome} photoPoseAction={updateEvidenceReviewPhotoPose} photoSessionMetadataAction={updateEvidenceReviewPhotoSessionMetadata} recoveryContext={recoveryContext} reprocessAction={reprocessEvidenceReview} reprocessEligibility={reprocessEligibility} reprocessOutcome={reprocessOutcome} review={presentedReview} />;
}
