import { createSeedRepositories } from "./createSeedRepositories";
import {
  getFounderRuntimeStore,
  persistFounderRuntimeStore,
} from "./founderRuntimeStore";

const founderRuntimeStore = getFounderRuntimeStore();

const founderRepositories = createSeedRepositories(founderRuntimeStore, {
  onChange: (mutatedCollection) => persistFounderRuntimeStore(founderRuntimeStore, { mutatedCollection }),
});

export const FounderRepositories = wrapRepositoriesWithRuntimeRefresh(
  founderRepositories
);

function wrapRepositoriesWithRuntimeRefresh(repositories) {
  return Object.fromEntries(
    Object.entries(repositories).map(([name, repository]) => [
      name,
      wrapRepositoryWithRuntimeRefresh(repository),
    ])
  );
}

function wrapRepositoryWithRuntimeRefresh(repository) {
  if (!repository || typeof repository !== "object") return repository;

  return new Proxy(repository, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (typeof value !== "function") return value;

      return (...args) => {
        getFounderRuntimeStore();

        return value.apply(target, args);
      };
    },
  });
}
