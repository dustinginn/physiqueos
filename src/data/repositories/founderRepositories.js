import { createSeedRepositories } from "./createSeedRepositories";
import {
  getFounderRuntimeStore,
  persistFounderRuntimeStore,
} from "./founderRuntimeStore";
import { registerRuntimeTrainingExercises } from "../../domain/models/trainingExerciseIdentity";

const founderRuntimeStore = getFounderRuntimeStore();
registerRuntimeTrainingExercises(founderRuntimeStore.canonicalExerciseLibrary ?? []);

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
  if (Object.isFrozen(repository)) {
    return Object.fromEntries(
      Object.entries(repository).map(([property, value]) => [
        property,
        typeof value === "function"
          ? (...args) => {
              getFounderRuntimeStore();
              registerRuntimeTrainingExercises(founderRuntimeStore.canonicalExerciseLibrary ?? []);
              return value.apply(repository, args);
            }
          : value,
      ])
    );
  }

  return new Proxy(repository, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (typeof value !== "function") return value;

      return (...args) => {
        getFounderRuntimeStore();
        registerRuntimeTrainingExercises(founderRuntimeStore.canonicalExerciseLibrary ?? []);

        return value.apply(target, args);
      };
    },
  });
}
