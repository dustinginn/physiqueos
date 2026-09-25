import { createPhase4CanonicalRecordStore } from "../../../src/platform/database/Phase4CanonicalRecordStore.js";
import { hydrateCanonicalTrainingExerciseRegistry } from "../../../src/application/training/CanonicalExerciseRegistryReadService.js";

// Mirrors productionApplicationComposition.readProductionTrainingExerciseRegistry: coalesces only concurrent callers.
export function createRegistryReader({ pool, ownerUserId }) {
  let inFlight;
  return async () => {
    if (!inFlight) {
      inFlight = (async () => {
        const registryStore = createPhase4CanonicalRecordStore({ query: (t, v) => pool.query(t, v) });
        return Object.freeze([...hydrateCanonicalTrainingExerciseRegistry(
          await registryStore.list({ ownerUserId, collection: "canonicalExerciseLibrary" }),
        )]);
      })().finally(() => { inFlight = undefined; });
    }
    return inFlight;
  };
}
