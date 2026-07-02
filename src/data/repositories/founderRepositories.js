import { createSeedRepositories } from "./createSeedRepositories";
import {
  getFounderRuntimeStore,
  persistFounderRuntimeStore,
} from "./founderRuntimeStore";

const founderRuntimeStore = getFounderRuntimeStore();

export const FounderRepositories = createSeedRepositories(founderRuntimeStore, {
  onChange: () => persistFounderRuntimeStore(founderRuntimeStore),
});
