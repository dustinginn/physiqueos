import { createSeedRepositories } from
  "../../data/repositories/createSeedRepositories";
import { createBriefingCadenceExecutor } from
  "../../domain/services/BriefingCadenceExecutorService";
import { createFounderMidweekBriefingService } from
  "../../domain/services/MidweekBriefingService";
import { createFounderMonthlyBriefingService } from
  "../../domain/services/MonthlyBriefingService";
import { createFounderWeeklyNarrativeService } from
  "../../domain/services/WeeklyNarrativeService";
import { RuntimeAuthority } from
  "../../platform/cutover/CombinedRuntimeAuthorityState";
import {
  createPostgresBriefingCadenceExecutionLock,
  createPostgresBriefingCadenceExecutionStore,
} from "../../platform/database/PostgresBriefingCadenceExecution";
import { createProviderBriefingReconciliationDependencies } from
  "./providerBriefingReconciliationComposition";

export function createProviderBriefingCadenceRunner({
  pool,
  ownerUserId,
  authorityStore,
  loadRuntimeBindings,
  now = () => new Date(),
  runtimeIdentity = null,
} = {}) {
  if (!pool || !ownerUserId || !authorityStore?.read ||
      typeof loadRuntimeBindings !== "function") {
    throw new Error("Provider briefing cadence runner requires provider runtime dependencies.");
  }
  const executionStore = createPostgresBriefingCadenceExecutionStore({
    pool,
    ownerUserId,
    now,
  });
  const executionLock = createPostgresBriefingCadenceExecutionLock({
    pool,
    ownerUserId,
  });
  return Object.freeze({
    async execute({ asOf = now() } = {}) {
      await assertProviderAuthority(authorityStore);
      const runtimeBindings = await loadRuntimeBindings();
      const repositories = createSeedRepositories(runtimeBindings.liveStore, {
        onChange() {
          const error = new Error(
            "Provider briefing cadence snapshot repositories are read-only."
          );
          error.code = "PROVIDER_CADENCE_SNAPSHOT_WRITE_FORBIDDEN";
          throw error;
        },
      });
      const dependencies = createProviderBriefingReconciliationDependencies({
        runtimeBindings,
        now: () => asOf,
      });
      const executor = createBriefingCadenceExecutor({
        repositories,
        generators: {
          weekly: createFounderWeeklyNarrativeService({
            repositories,
            now: () => asOf,
            weeklyPersistence: dependencies.weeklyPersistence,
            confidenceStoreResolver: dependencies.readCanonicalStore,
            cadenceLifecycle: dependencies.cadenceLifecycle,
          }),
          midweek: createFounderMidweekBriefingService({
            repositories,
            now: () => asOf,
            midweekPersistence: dependencies.midweekPersistence,
            confidenceStoreResolver: dependencies.readCanonicalStore,
            cadenceLifecycle: dependencies.cadenceLifecycle,
          }),
          monthly: createFounderMonthlyBriefingService({
            repositories,
            now: () => asOf,
            publicationService: dependencies.publicationService,
          }),
        },
        executionStore,
        executionLock,
        now: () => asOf,
        source: "provider-worker-scheduler",
        runtimeIdentity,
      });
      return executor.execute({ userId: ownerUserId, asOf });
    },
  });
}

async function assertProviderAuthority(authorityStore) {
  const { state } = await authorityStore.read();
  const firstWriteAt = state?.firstProviderCanonicalWriteAt;
  const firstWriteRecorded = typeof firstWriteAt === "string" &&
    Number.isFinite(Date.parse(firstWriteAt)) &&
    typeof state?.firstProviderCommandId === "string" &&
    Boolean(state.firstProviderCommandId.trim());
  if (state?.authority !== RuntimeAuthority.PROVIDER ||
      state?.workerAuthority !== "provider" ||
      state?.publicRuntimeAuthority !== "provider" ||
      state?.canonicalStoreEpoch !== "postgres-canonical" ||
      !firstWriteRecorded) {
    const error = new Error(
      "Provider briefing cadence is paused until provider authority is active."
    );
    error.code = "PROVIDER_BRIEFING_CADENCE_AUTHORITY_PAUSED";
    throw error;
  }
}
