import { createPhase5ProviderApplicationComposition } from "../database/phase5ProviderComposition.js";
import { createCanonicalApplicationCompositionSelector } from "./CanonicalApplicationCompositionSelector.js";
import { createCanonicalWriteFence } from "./canonicalWriteFence.js";
import { CanonicalCompositionMode, CanonicalStoreEpoch } from "./migrationControlState.js";

export function createProductionCanonicalApplicationComposition({
  controlStore,
  createLegacyComposition,
  pool,
  ownerUserId,
  objectProvider,
  mediaAccessSecret,
  now = () => new Date(),
} = {}) {
  if (!controlStore?.read) throw new Error("Production canonical composition requires durable migration control.");
  if (typeof createLegacyComposition !== "function") throw new Error("Production canonical composition requires the legacy fallback factory.");
  return createCanonicalApplicationCompositionSelector({
    controlStore,
    createLegacyComposition: async ({ state }) => Object.freeze({
      ...(await createLegacyComposition({ state })),
      writeFence: createCanonicalWriteFence({
        controlStore,
        requiredCompositionMode: CanonicalCompositionMode.LEGACY_JSON,
        expectedCanonicalStoreEpoch: CanonicalStoreEpoch.LEGACY_JSON,
      }),
    }),
    createPostgresComposition: async () => {
      const writeFence = createCanonicalWriteFence({
        controlStore,
        requiredCompositionMode: CanonicalCompositionMode.POSTGRES,
        expectedCanonicalStoreEpoch: CanonicalStoreEpoch.POSTGRES_CANONICAL,
      });
      return createPhase5ProviderApplicationComposition({
        pool,
        ownerUserId,
        objectProvider,
        mediaAccessSecret,
        now,
        writeFence,
      });
    },
  });
}
