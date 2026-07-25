import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createNutritionEnrichmentReviewService } from "../../../../domain/services/NutritionEnrichmentReviewService";
import NutritionEnrichmentReviewScreen from "../../../../screens/NutritionEnrichmentReviewScreen";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function NutritionEnrichmentReviewPage() {
  const user = await FounderRepositories.users.getCurrentUser();
  const review = await createNutritionEnrichmentReviewService({
    repositories: FounderRepositories,
  }).createReview(user?.id);

  return <NutritionEnrichmentReviewScreen review={review} />;
}
