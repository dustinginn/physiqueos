import { createCanonicalApplicationCompositionSelector } from "./CanonicalApplicationCompositionSelector.js";
import { CanonicalCompositionMode, CanonicalStoreEpoch } from "./migrationControlState.js";

const EXPECTED_EPOCH = Object.freeze({
  [CanonicalCompositionMode.LEGACY_JSON]: CanonicalStoreEpoch.LEGACY_JSON,
  [CanonicalCompositionMode.POSTGRES]: CanonicalStoreEpoch.POSTGRES_CANONICAL,
});

export function createProductionApplicationCompositionRuntime({
  controlStore,
  createLegacyComposition,
  createPostgresComposition,
} = {}) {
  const selector = createCanonicalApplicationCompositionSelector({
    controlStore,
    createLegacyComposition,
    createPostgresComposition,
  });
  return Object.freeze({
    status: () => selector.status(),
    async resolve() {
      const state = selector.status();
      const expectedEpoch = EXPECTED_EPOCH[state.compositionMode];
      if (!expectedEpoch || state.canonicalStoreEpoch !== expectedEpoch) {
        const error = new Error("Canonical application composition state/epoch combination is invalid.");
        error.code = "CANONICAL_COMPOSITION_EPOCH_INVALID";
        throw error;
      }
      return selector.getComposition({ expectedMode: state.compositionMode, expectedEpoch });
    },
    async read(readModel, principal, input = {}) {
      const composition = await this.resolve();
      const handler = composition.readModels?.[readModel];
      if (typeof handler !== "function") throw unavailable(`read model ${readModel}`);
      return handler(principal, input);
    },
    async execute(input) {
      const composition = await this.resolve();
      if (typeof composition.commands?.execute !== "function") throw unavailable("canonical command service");
      const result = await composition.commands.execute(input);
      selector.clearCache();
      return result;
    },
    clearCache: () => selector.clearCache(),
  });
}

function unavailable(component) {
  const error = new Error(`The selected production composition does not provide ${component}.`);
  error.code = "CANONICAL_COMPOSITION_INCOMPLETE";
  return error;
}
