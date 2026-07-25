import { createSeedRepositories } from "./createSeedRepositories";
import {
  getFounderRuntimeStore,
  persistFounderRuntimeStore,
} from "./founderRuntimeStore";

const store = getFounderRuntimeStore();

export const ProductionGoalTransitionRepositories = createSeedRepositories(store, {
  onChange: (mutatedCollection) => persistFounderRuntimeStore(store, {
    mutatedCollection,
    reason: "production goal transition draft persistence",
    throwOnError: true,
  }),
});
