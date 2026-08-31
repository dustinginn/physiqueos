import {
  loadApplicationCanonicalCommitBindings,
} from "../runtime/ApplicationCanonicalRuntime";
import { getProductionPhotoEventReadStore } from
  "./productionApplicationComposition";
import {
  createFounderPhotoEventNarrativeService,
  createPhotoEventNarrativeService,
} from "../../domain/services/PhotoEventNarrativeService";
import {
  createCanonicalBriefingConfidencePublicationService,
} from "../../domain/services/CanonicalBriefingConfidencePublicationService";
import {
  createPIPhotoEventLifecycleService,
} from "../../domain/services/PIPhotoEventLifecycleService";

export async function createProductionPhotoEventNarrativeService({
  repositories,
  now = () => new Date(),
  env = process.env,
  loadCanonicalCommitBindings = loadApplicationCanonicalCommitBindings,
  readStore = null,
} = {}) {
  if (env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1") {
    return createFounderPhotoEventNarrativeService({ repositories, now });
  }
  const commitBindings = await loadCanonicalCommitBindings();
  return createProviderPhotoEventNarrativeService({
    repositories,
    readStore: readStore ?? getProductionPhotoEventReadStore(env),
    mutateCanonicalRuntime: commitBindings.mutateCanonicalRuntime,
    now,
  });
}

export function createProviderPhotoEventNarrativeService({
  repositories,
  readStore,
  mutateCanonicalRuntime,
  now = () => new Date(),
} = {}) {
  if (!repositories || typeof readStore?.loadInputs !== "function" ||
      typeof mutateCanonicalRuntime !== "function") {
    const error = new Error(
      "Provider Photo Event publication requires canonical runtime bindings."
    );
    error.code = "PROVIDER_PHOTO_EVENT_RUNTIME_BINDINGS_REQUIRED";
    throw error;
  }
  return createPhotoEventNarrativeService({
    repositories,
    now,
    loadInputs: (args) => readStore.loadInputs(args),
    createEventLifecycle: ({ publicationStore }) =>
      createPIPhotoEventLifecycleService({
        publicationService: createCanonicalBriefingConfidencePublicationService({
          filePath: "provider://photo-event-publication",
          liveStore: publicationStore,
          mutateCanonicalRuntime,
          now,
        }),
        now,
      }),
  });
}
