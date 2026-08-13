import { createSeedRepositories } from "./createSeedRepositories";
import {
  getFounderRuntimeStore,
  persistFounderRuntimeStore,
} from "./founderRuntimeStore";
import { registerRuntimeTrainingExercises } from "../../domain/models/trainingExerciseIdentity";
import {
  CanonicalWriteDisposition,
  classifyFounderRepositoryMethod,
} from "../../platform/cutover/canonicalWriteSurfaceInventory";
import { assertProductionLegacyCanonicalWriteAllowed } from "../../platform/cutover/canonicalWriteFence";

const founderRuntimeStore = getFounderRuntimeStore();
registerRuntimeTrainingExercises(founderRuntimeStore.canonicalExerciseLibrary ?? []);

const founderRepositories = createSeedRepositories(founderRuntimeStore, {
  onChange: (mutatedCollection) => persistFounderRuntimeStore(founderRuntimeStore, { mutatedCollection }),
});

export const LegacyFounderRepositories = wrapRepositoriesWithRuntimeRefresh(
  founderRepositories
);

export const FounderRepositories = createProductionRepositoryFacade({
  legacyRepositories: LegacyFounderRepositories,
  async resolveComposition() {
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return Object.freeze({
        kind: "production-build-legacy-prerender",
        canonicalStoreEpoch: "legacy-json",
        repositories: LegacyFounderRepositories,
      });
    }
    const { getProductionApplicationComposition } = await import(
      "../../application/composition/productionApplicationComposition.js"
    );
    return getProductionApplicationComposition();
  },
});

export function createProductionRepositoryFacade({ legacyRepositories, resolveComposition }) {
  if (typeof resolveComposition !== "function") {
    throw new Error("Production repository facade requires a composition resolver.");
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(legacyRepositories).map(([repositoryName, repository]) => [
      repositoryName,
      Object.freeze(Object.fromEntries(
        Object.entries(repository).map(([methodName, value]) => [
          methodName,
          typeof value === "function"
            ? async (...args) => {
                const composition = await resolveComposition();
                const disposition = classifyFounderRepositoryMethod(repositoryName, methodName);
                if (
                  disposition === CanonicalWriteDisposition.CANONICAL_WRITE &&
                  composition?.canonicalStoreEpoch === "postgres-canonical"
                ) {
                  const durableWrite = composition.repositoryWrites?.[repositoryName]?.[methodName];
                  if (typeof durableWrite !== "function") {
                    const error = new Error(`PostgreSQL composition does not provide a durable repository write for ${repositoryName}.${methodName}.`);
                    error.code = "DIRECT_POSTGRES_REPOSITORY_WRITE_UNAVAILABLE";
                    throw error;
                  }
                  return durableWrite(...args);
                }
                const selected = composition?.repositories?.[repositoryName]?.[methodName];
                if (typeof selected !== "function") {
                  throw new Error(`Selected canonical composition does not provide ${repositoryName}.${methodName}.`);
                }
                return selected.apply(composition.repositories[repositoryName], args);
              }
            : value,
        ]),
      )),
    ]),
  ));
}

function wrapRepositoriesWithRuntimeRefresh(repositories) {
  return Object.fromEntries(
    Object.entries(repositories).map(([name, repository]) => [
      name,
      wrapRepositoryWithRuntimeRefresh(name, repository),
    ])
  );
}

function wrapRepositoryWithRuntimeRefresh(repositoryName, repository) {
  if (!repository || typeof repository !== "object") return repository;
  if (Object.isFrozen(repository)) {
    return Object.fromEntries(
      Object.entries(repository).map(([property, value]) => [
        property,
        typeof value === "function"
          ? (...args) => {
              assertRepositoryWriteAllowed(repositoryName, property);
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
        assertRepositoryWriteAllowed(repositoryName, property);
        getFounderRuntimeStore();
        registerRuntimeTrainingExercises(founderRuntimeStore.canonicalExerciseLibrary ?? []);

        return value.apply(target, args);
      };
    },
  });
}

function assertRepositoryWriteAllowed(repositoryName, property) {
  const disposition = classifyFounderRepositoryMethod(repositoryName, String(property));
  if (disposition === CanonicalWriteDisposition.CANONICAL_WRITE) {
    assertProductionLegacyCanonicalWriteAllowed({
      operation: `founder-repository:${repositoryName}.${String(property)}`,
    });
  }
}
