import { ProductionGoalTransitionRepositories } from "../../../../data/repositories/productionGoalTransitionRepositories";
import { createProductionGoalTransitionActivationService } from "../../../../domain/services/ProductionGoalTransitionActivationService";
import ProductionGoalTransitionFinalReview from "./ProductionGoalTransitionFinalReview";
import { loadApplicationRuntimeBindings } from "../../../../application/runtime/ApplicationCanonicalRuntime";

export const dynamic = "force-dynamic";

export default async function ProductionGoalTransitionReviewPage({ searchParams }) {
  const query = await searchParams;
  const transitionId = Array.isArray(query.transitionId)
    ? query.transitionId[0]
    : query.transitionId;
  const user = await ProductionGoalTransitionRepositories.users.getCurrentUser();
  const bindings = await loadApplicationRuntimeBindings();
  const review = await createProductionGoalTransitionActivationService({
    ...bindings,
    readLiveStore: bindings.readPersistedStore,
  }).createFinalReview({
    founderUserId: user?.id,
    transitionId,
  });
  return <ProductionGoalTransitionFinalReview review={review} />;
}
