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

import { createHealthKitGraduationReader } from "../../platform/database/HealthKitGraduationReader.js";
import { HealthKitGraduationPurpose } from "../../domain/services/HealthKitGraduation.js";
import { createBriefingCadenceSettlementGate } from "../../domain/services/BriefingCadenceSettlementGate.js";
import { createBriefingSettlementObserver } from "../../domain/services/BriefingSettlementObservability.js";
import { createRecoveryBriefingComposerV1 } from "../../domain/services/RecoveryBriefingComposerV1.js";
import { createRecoverySleepInputReaderV1 } from "../../platform/database/RecoverySleepInputReaderV1.js";
import { createEvidenceProcessingMemoryBudget } from "../../platform/jobs/EvidenceProcessingMemoryBudget.js";

export function createProviderBriefingCadenceRunner({
  pool,
  ownerUserId,
  authorityStore,
  loadCanonicalRuntime,
  loadCanonicalCommitBindings,
  now = () => new Date(),
  runtimeIdentity = null,
  logger = null,
  memoryBudget = createEvidenceProcessingMemoryBudget(),
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
  const healthKitGraduation = createHealthKitGraduationReader({
    query: (text, values) => pool.query(text, values),
    ownerUserId,
    // A failed graduation read fails closed to ordinary evidence; this only
    // makes it visible. Error class/code only, never a message or value.
    onError: (error) => {
      const target = logger?.warn ?? logger?.info;
      target?.call(logger, "healthkit_graduation_read_failed", {
        errorName: String(error?.name ?? "Error").slice(0, 60),
        errorCode: /^[A-Za-z0-9_]{1,60}$/.test(String(error?.code ?? "")) ? String(error.code) : null,
      });
    },
  });
  const settlementGate = createBriefingCadenceSettlementGate({
    healthKitGraduationReader: healthKitGraduation,
  });
  // One observer per worker process: its dedup memory (window_closed once per
  // window, no repeated readiness_satisfied, ...) must outlive a single tick,
  // and this runner builds a fresh executor every tick.
  const settlementObserver = createBriefingSettlementObserver({ logger });
  // Recovery Briefing V1 (Weekly and Monthly ONLY; never Midweek). OFF unless
  // the Server-owned `recovery_briefing_publication_authority` record exists
  // and is valid; none is installed. While it is absent, a NEW Weekly/Monthly
  // costs one single-row authority lookup and ZERO Sleep reads, and the
  // artifact is byte-identical. It never holds, fails or reorders a briefing,
  // never touches settlement, Confidence, V3 or recommendations, and only
  // reads ordinary prospective canonical Sleep days (non-strategic).
  const recoveryReader = createRecoverySleepInputReaderV1({
    query: (text, values) => pool.query(text, values),
    ownerUserId,
  });
  const recoveryComposer = createRecoveryBriefingComposerV1({
    readAuthorityRecord: recoveryReader.readAuthorityRecord,
    readSleepInputs: recoveryReader.readSleepInputs,
    // Decision codes only — never a Sleep value.
    onDecision: (decision) => {
      if (decision.reason === "publication_authority_disabled") return;
      logger?.info?.("recovery_briefing_decision", {
        cadence: decision.cadence, reason: decision.reason, detail: decision.detail ?? null,
      });
    },
  });
  const tick = {
    async execute({ asOf = now() } = {}) {
      // ONE run == one tick == one coherent HealthKit evidence view (review
      // N2). Begin it before ANY read this tick: the evidence overlay below and
      // the settlement gate's later coverage reads share this run's single
      // canonical-day snapshot (the gate adopts the run, it never resets it), so
      // readiness, the persisted watermark, and the generator inputs cannot
      // disagree about which revision they saw, however long an earlier cadence
      // generated. Beginning here also drops the previous tick's policy/day
      // snapshot (the reader only re-memoizes when a run explicitly begins).
      healthKitGraduation.beginRun();
      await assertProviderAuthority(authorityStore);
      const [canonicalRuntime, commitBindings] = await Promise.all([
        loadCanonicalRuntime(),
        loadCanonicalCommitBindings(),
      ]);
      // Ordinary evidence for generation. Graduated HealthKit Activity / Nutrition
      // days join it ONLY under the separate evidence-eligibility scope and only
      // as complete days, as read-time objects in this read-only snapshot. The
      // publication and Confidence stores keep the raw runtime.
      //
      // Graduated canonical HealthKit Cardio workouts (Phase 1 strategic
      // graduation) join the SAME snapshot the same way, under their own
      // independent `cardio_training` evidence-eligibility scope -- chained
      // after the day-level overlay, never merged into it (workouts have no
      // "complete day" state and need no settlement-gate participation; see
      // `overlayGraduatedHealthKitCardioWorkouts`'s doc comment).
      //
      // Completed canonical HealthKit Sleep nights (prospective Sleep strategic
      // graduation) join last, as `sleep_night` objects, only under the
      // `sleep` evidence-eligibility scope and only once a night's sleep-day
      // window has closed at this tick's `asOf`. They feed the V3 Recovery
      // evidence slot; no Confidence, Energy, Training or legacy recovery
      // reader consumes that type.
      const evidenceRuntime = {
        ...canonicalRuntime,
        canonicalEvidenceObjects: await healthKitGraduation.overlaySleepNights(
          await healthKitGraduation.overlayCardioWorkouts(
            await healthKitGraduation.overlay(
              canonicalRuntime.canonicalEvidenceObjects ?? [],
              { purpose: HealthKitGraduationPurpose.EVIDENCE },
            ),
            { purpose: HealthKitGraduationPurpose.EVIDENCE },
          ),
          { purpose: HealthKitGraduationPurpose.EVIDENCE, asOf },
        ),
      };
      const repositories = createSeedRepositories(evidenceRuntime, {
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
            recoveryComposer,
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
            recoveryComposer,
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
        settlementGate,
        logger,
        settlementObserver,
      });
      return executor.execute({ userId: ownerUserId, asOf });
    },
  };
  return Object.freeze({
    async execute(options) {
      try {
        const { value, measurement } = await memoryBudget.run({
          operation: "briefing-cadence",
          estimatedWorkingSetBytes: 350 * 1024 * 1024,
        }, () => tick.execute(options));
        logger?.info?.("evidence.processing.memory", measurement);
        return value;
      } finally {
        // The run ends with the tick: the day snapshot and policy memo are
        // dropped (bounded memory) and nothing is served stale afterward.
        healthKitGraduation.endRun();
      }
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
