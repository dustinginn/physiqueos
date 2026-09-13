import { createSeedRepositories } from
  "../../data/repositories/createSeedRepositories";
import {
  createFounderDEXAEventNarrativeService,
  createDEXAEventNarrativeService,
} from "../../domain/services/DEXAEventNarrativeService";
import {
  createCanonicalBriefingConfidencePublicationService,
} from "../../domain/services/CanonicalBriefingConfidencePublicationService";
import {
  createPIDEXAEventLifecycleService,
} from "../../domain/services/PIDEXAEventLifecycleService";
import {
  loadApplicationCanonicalCommitBindings,
  loadApplicationCanonicalRuntime,
} from "../runtime/ApplicationCanonicalRuntime";

export async function createProductionDEXAEventNarrativeService({
  repositories,
  now = () => new Date(),
  env = process.env,
  loadCanonicalRuntime = loadApplicationCanonicalRuntime,
  loadCanonicalCommitBindings = loadApplicationCanonicalCommitBindings,
} = {}) {
  if (env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1") {
    return createFounderDEXAEventNarrativeService({ repositories, now });
  }
  const [canonicalRuntime, commitBindings] = await Promise.all([
    loadCanonicalRuntime(),
    loadCanonicalCommitBindings(),
  ]);
  return createProviderDEXAEventNarrativeService({
    canonicalRuntime,
    mutateCanonicalRuntime: commitBindings.mutateCanonicalRuntime,
    now,
  });
}

export function createProviderDEXAEventNarrativeService({
  canonicalRuntime,
  mutateCanonicalRuntime,
  now = () => new Date(),
} = {}) {
  if (!canonicalRuntime || typeof canonicalRuntime !== "object" ||
      typeof mutateCanonicalRuntime !== "function") {
    const error = new Error(
      "Provider DEXA Event publication requires canonical runtime bindings."
    );
    error.code = "PROVIDER_DEXA_EVENT_RUNTIME_BINDINGS_REQUIRED";
    throw error;
  }
  const repositories = createSeedRepositories(canonicalRuntime, {
    onChange() {
      const error = new Error(
        "Provider DEXA Event snapshot repositories are read-only."
      );
      error.code = "PROVIDER_DEXA_EVENT_SNAPSHOT_WRITE_FORBIDDEN";
      throw error;
    },
  });
  const publicationService =
    createCanonicalBriefingConfidencePublicationService({
      filePath: "provider://dexa-event-publication",
      liveStore: canonicalRuntime,
      mutateCanonicalRuntime,
      now,
    });
  return createDEXAEventNarrativeService({
    repositories,
    now,
    eventLifecycle: createPIDEXAEventLifecycleService({
      publicationService,
      now,
    }),
  });
}
