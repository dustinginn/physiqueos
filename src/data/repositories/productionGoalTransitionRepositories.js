import { createSeedRepositories } from "./createSeedRepositories";
import {
  getFounderRuntimeStore,
  persistFounderRuntimeStore,
} from "./founderRuntimeStore";
import { FounderRepositories } from "./founderRepositories";

const isProviderFullRuntime = process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1";
const store = isProviderFullRuntime ? null : getFounderRuntimeStore();

export const ProductionGoalTransitionRepositories = isProviderFullRuntime ? FounderRepositories : createSeedRepositories(store, {
  onChange: (mutatedCollection) => persistFounderRuntimeStore(store, {
    mutatedCollection,
    reason: "production goal transition draft persistence",
    throwOnError: true,
  }),
});
