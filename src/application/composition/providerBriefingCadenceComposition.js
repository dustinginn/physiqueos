import { createSeedRepositories } from
  "../../data/repositories/createSeedRepositories";
import { createBriefingCadenceExecutor } from
  "../../domain/services/BriefingCadenceExecutorService";
import { BRIEFING_CADENCE_CATCH_UP_POLICY } from
  "../../domain/services/BriefingCadenceRegistryService";
import { createCanonicalBriefingConfidencePublicationService } from
  "../../domain/services/CanonicalBriefingConfidencePublicationService";
import { createMidweekBriefingService } from
  "../../domain/services/MidweekBriefingService";
import { createFounderMonthlyBriefingService } from
  "../../domain/services/MonthlyBriefingService";
import { createPICadenceBriefingLifecycleService } from
  "../../domain/services/PICadenceBriefingLifecycleService";
import { createWeeklyNarrativeService } from
  "../../domain/services/WeeklyNarrativeService";
import { RuntimeAuthority } from
  "../../platform/cutover/CombinedRuntimeAuthorityState";
import {
  createPostgresBriefingCadenceExecutionLock,
  createPostgresBriefingCadenceExecutionStore,
} from "../../platform/database/PostgresBriefingCadenceExecution";

export function createProviderBriefingCadenceRunner({
  pool,
  ownerUserId,
  authorityStore,
  loadCanonicalRuntime,
  loadCanonicalCommitBindings,
  now = () => new Date(),
  runtimeIdentity = null,
} = {}) {
  if (!pool || !ownerUserId || !authorityStore?.read ||
      typeof loadCanonicalRuntime !== "function" ||
      typeof loadCanonicalCommitBindings !== "function") {
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
      const [canonicalRuntime, commitBindings] = await Promise.all([
        loadCanonicalRuntime(),
        loadCanonicalCommitBindings(),
      ]);
      const repositories = createSeedRepositories(canonicalRuntime, {
        onChange() {
          const error = new Error(
            "Provider briefing cadence snapshot repositories are read-only."
          );
          error.code = "PROVIDER_CADENCE_SNAPSHOT_WRITE_FORBIDDEN";
          throw error;
        },
      });
      const publicationService =
        createCanonicalBriefingConfidencePublicationService({
          filePath: "provider://canonical-runtime",
          liveStore: canonicalRuntime,
          mutateCanonicalRuntime: commitBindings.mutateCanonicalRuntime,
          now: () => asOf,
        });
      const cadenceLifecycle = createPICadenceBriefingLifecycleService({
        publicationService,
        now: () => asOf,
      });
      const executor = createBriefingCadenceExecutor({
        repositories,
        generators: {
          weekly: createWeeklyNarrativeService({
            repositories,
            now: () => asOf,
            confidenceStoreResolver: async () => canonicalRuntime,
            cadenceLifecycle,
          }),
          midweek: createMidweekBriefingService({
            repositories,
            now: () => asOf,
            confidenceStoreResolver: async () => canonicalRuntime,
            cadenceLifecycle,
          }),
          monthly: createFounderMonthlyBriefingService({
            repositories,
            now: () => asOf,
            publicationService,
          }),
        },
        executionStore,
        executionLock,
        now: () => asOf,
        source: "provider-worker-scheduler",
        runtimeIdentity,
        policy: {
          ...BRIEFING_CADENCE_CATCH_UP_POLICY,
          generatorTimeoutMs: 120_000,
        },
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
