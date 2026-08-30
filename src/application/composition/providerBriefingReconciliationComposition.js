import {
  createFounderBriefingReconciliationService,
} from "../../domain/services/FounderBriefingReconciliationService";
import {
  createFounderBriefingReconciliationPersistenceService,
} from "../../domain/services/BriefingReconciliationPersistenceService";
import {
  createCanonicalBriefingConfidencePublicationService,
} from "../../domain/services/CanonicalBriefingConfidencePublicationService";
import {
  createPICadenceBriefingLifecycleService,
} from "../../domain/services/PICadenceBriefingLifecycleService";
import {
  createFounderWeeklyBriefingPersistenceService,
  createFounderMidweekBriefingPersistenceService,
} from "../../domain/services/WeeklyBriefingPersistenceService";
import {
  createFounderWeeklyNarrativeService,
} from "../../domain/services/WeeklyNarrativeService";
import {
  createFounderMidweekBriefingService,
} from "../../domain/services/MidweekBriefingService";
import {
  createFounderMonthlyBriefingService,
} from "../../domain/services/MonthlyBriefingService";

export function createProviderBriefingReconciliationService({
  repositories,
  runtimeBindings,
  now = () => new Date(),
} = {}) {
  if (!repositories) {
    throw new Error("Provider briefing reconciliation repositories are required.");
  }
  const dependencies = createProviderBriefingReconciliationDependencies({
    runtimeBindings,
    now,
  });
  return createFounderBriefingReconciliationService({
    repositories,
    now,
    persistence: dependencies.workItemPersistence,
    cadenceServices: {
      weekly: createFounderWeeklyNarrativeService({
        repositories,
        now,
        weeklyPersistence: dependencies.weeklyPersistence,
        confidenceStoreResolver: dependencies.readCanonicalStore,
        cadenceLifecycle: dependencies.cadenceLifecycle,
      }),
      midweek: createFounderMidweekBriefingService({
        repositories,
        now,
        midweekPersistence: dependencies.midweekPersistence,
        confidenceStoreResolver: dependencies.readCanonicalStore,
        cadenceLifecycle: dependencies.cadenceLifecycle,
      }),
      monthly: createFounderMonthlyBriefingService({
        repositories,
        now,
        publicationService: dependencies.publicationService,
      }),
    },
  });
}

export function createProviderBriefingReconciliationDependencies({
  runtimeBindings,
  now = () => new Date(),
} = {}) {
  assertProviderRuntimeBindings(runtimeBindings);
  const readText = () => JSON.stringify(runtimeBindings.liveStore);
  const persistenceOptions = {
    filePath: runtimeBindings.runtimeStorePath,
    liveStore: runtimeBindings.liveStore,
    now,
    readText,
    unitOfWorkFactory: (options) => runtimeBindings.createUnitOfWork(options),
    unitOfWorkOptions: {
      lockContext: { operation: "current_briefing_revision_publication" },
    },
    ...(typeof runtimeBindings.mutateCanonicalRuntime === "function"
      ? { mutateCanonicalRuntime: runtimeBindings.mutateCanonicalRuntime }
      : {}),
  };
  const publicationService =
    createCanonicalBriefingConfidencePublicationService(persistenceOptions);
  return Object.freeze({
    cadenceLifecycle: createPICadenceBriefingLifecycleService({
      publicationService,
      now,
    }),
    midweekPersistence: createFounderMidweekBriefingPersistenceService(
      persistenceOptions
    ),
    publicationService,
    readCanonicalStore: async () =>
      structuredClone(runtimeBindings.liveStore),
    weeklyPersistence: createFounderWeeklyBriefingPersistenceService(
      persistenceOptions
    ),
    workItemPersistence:
      createFounderBriefingReconciliationPersistenceService({
        filePath: runtimeBindings.runtimeStorePath,
        liveStore: runtimeBindings.liveStore,
        now,
        createUnitOfWork: (options) =>
          runtimeBindings.createUnitOfWork(options),
      }),
  });
}

function assertProviderRuntimeBindings(bindings) {
  if (!bindings?.runtimeStorePath || !bindings?.liveStore ||
      typeof bindings.createUnitOfWork !== "function") {
    const error = new Error(
      "Provider briefing reconciliation requires hydrated canonical runtime bindings."
    );
    error.code = "PROVIDER_BRIEFING_RUNTIME_BINDINGS_REQUIRED";
    throw error;
  }
}
