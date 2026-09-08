import { loadProductionBoundedFounderReadContext } from "../../../../application/composition/productionApplicationComposition";
import { createNutritionEnrichmentReviewService } from "../../../../domain/services/NutritionEnrichmentReviewService";
import NutritionEnrichmentReviewScreen from "../../../../screens/NutritionEnrichmentReviewScreen";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function NutritionEnrichmentReviewPage() {
  const { repositories } = await loadProductionBoundedFounderReadContext({ collections: ["user", "canonicalEvidenceObjects", "evidencePackages"] });
  const user = await repositories.users.getCurrentUser();
  const review = await createNutritionEnrichmentReviewService({
    repositories,
  }).createReview(user?.id);

  return <NutritionEnrichmentReviewScreen review={review} />;
}
