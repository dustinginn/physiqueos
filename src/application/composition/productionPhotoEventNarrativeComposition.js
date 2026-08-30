import {
  loadApplicationCanonicalCommitBindings,
  loadApplicationCanonicalRuntimeSnapshot,
} from "../runtime/ApplicationCanonicalRuntime";
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
  loadCanonicalRuntime = loadApplicationCanonicalRuntimeSnapshot,
  loadCanonicalCommitBindings = loadApplicationCanonicalCommitBindings,
} = {}) {
  if (env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1") {
    return createFounderPhotoEventNarrativeService({ repositories, now });
  }
  const [canonicalRuntime, commitBindings] = await Promise.all([
    loadCanonicalRuntime(),
    loadCanonicalCommitBindings(),
  ]);
  return createProviderPhotoEventNarrativeService({
    repositories,
    canonicalRuntime,
    mutateCanonicalRuntime: commitBindings.mutateCanonicalRuntime,
    now,
  });
}

export function createProviderPhotoEventNarrativeService({
  repositories,
  canonicalRuntime,
  mutateCanonicalRuntime,
  now = () => new Date(),
} = {}) {
  if (!repositories || !canonicalRuntime ||
      typeof mutateCanonicalRuntime !== "function") {
    const error = new Error(
      "Provider Photo Event publication requires canonical runtime bindings."
    );
    error.code = "PROVIDER_PHOTO_EVENT_RUNTIME_BINDINGS_REQUIRED";
    throw error;
  }
  const publicationService =
    createCanonicalBriefingConfidencePublicationService({
      filePath: "provider://photo-event-publication",
      liveStore: canonicalRuntime,
      mutateCanonicalRuntime,
      now,
    });
  return createPhotoEventNarrativeService({
    repositories,
    now,
    eventLifecycle: createPIPhotoEventLifecycleService({
      publicationService,
      now,
    }),
  });
}
