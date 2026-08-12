import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { CanonicalCompositionMode } from "./migrationControlState.js";

export function createCanonicalApplicationCompositionSelector({
  controlStore,
  createLegacyComposition,
  createPostgresComposition,
} = {}) {
  if (!controlStore?.read) throw new Error("Canonical composition selector requires a durable control store.");
  if (typeof createLegacyComposition !== "function" || typeof createPostgresComposition !== "function") {
    throw new Error("Canonical composition selector requires both bounded composition factories.");
  }
  const cache = new Map();
  return Object.freeze({
    status() {
      return controlStore.read().state;
    },
    async getComposition({ expectedMode = null, expectedEpoch = null } = {}) {
      let state;
      try {
        state = controlStore.read().state;
      } catch (cause) {
        throw unavailable("Canonical composition control is unavailable.", cause);
      }
      if (expectedMode != null && state.compositionMode !== expectedMode) {
        throw conflict("CANONICAL_COMPOSITION_CONFLICT", "Canonical composition changed before it could be used.");
      }
      if (expectedEpoch != null && state.canonicalStoreEpoch !== expectedEpoch) {
        throw conflict("CANONICAL_STORE_EPOCH_MISMATCH", "Canonical-store epoch changed before it could be used.");
      }
      const factory = state.compositionMode === CanonicalCompositionMode.LEGACY_JSON
        ? createLegacyComposition
        : state.compositionMode === CanonicalCompositionMode.POSTGRES
          ? createPostgresComposition
          : null;
      if (!factory) throw unavailable("Canonical composition mode is unknown.");
      const cacheKey = `${state.compositionMode}:${state.canonicalStoreEpoch}`;
      if (!cache.has(cacheKey)) {
        cache.set(cacheKey, Promise.resolve(factory({ state })).then((composition) => {
          if (!composition) throw unavailable("Canonical composition factory returned no composition.");
          return Object.freeze({ ...composition, canonicalStoreEpoch: state.canonicalStoreEpoch, compositionMode: state.compositionMode });
        }));
      }
      return cache.get(cacheKey);
    },
    clearCache() {
      cache.clear();
    },
  });
}

function conflict(code, detail) {
  return new ApplicationProblem({ status: 409, code, title: "Canonical persistence changed.", detail });
}

function unavailable(detail, cause = null) {
  return new ApplicationProblem({
    status: 503,
    code: "CANONICAL_COMPOSITION_UNAVAILABLE",
    title: "Canonical persistence is temporarily unavailable.",
    detail,
    cause,
  });
}
