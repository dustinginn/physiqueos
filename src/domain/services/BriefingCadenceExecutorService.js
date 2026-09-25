import { createSettlementGeneratorInput } from "./BriefingEvidenceSettlementArtifact.js";
import { SettlementReasonCode } from "./BriefingEvidenceSettlementPolicy.js";
import {
  BRIEFING_CADENCE_CATCH_UP_POLICY,
  resolveBriefingCadenceRegistry,
} from "./BriefingCadenceRegistryService";

export const BRIEFING_CADENCE_EXECUTOR_VERSION = "briefing_cadence_executor_v2";

const TERMINAL_FAILURES = new Set([
  "artifact_identity_mismatch",
  "briefing_artifact_conflict",
  "cadence_disabled",
  "invalid_window",
  "semantic_conflict",
  "unsupported_context",
  "user_not_found",
]);

export function createBriefingCadenceExecutor({
  repositories,
  generators,
  executionStore,
  executionLock,
  now = () => new Date(),
  source = "manual",
  runtimeIdentity = null,
  policy = BRIEFING_CADENCE_CATCH_UP_POLICY,
  settlementGate = null,
  logger = null,
} = {}) {
  return {
    async execute({ userId = null, asOf = now() } = {}) {
      const runId = executionStore.createExecutionId();
      const registry = await resolveBriefingCadenceRegistry({
        repositories,
        generators,
        userId,
        now: asOf,
      });
      const eligible = registry.filter((entry) => entry.eligible);
      const lock = eligible.length
        ? await executionLock.acquire({
          executionId: runId,
          source,
          acquiredAt: asOf.toISOString(),
        })
        : { acquired: false, reason: "no_eligible_cadence", release() {} };
      await settlementGate?.beginTick();
      const outcomes = [];
      let retainLock = false;
      try {
        for (const entry of registry) {
          const outcome = await evaluateEntry({
            entry,
            runId,
            asOf,
            lock,
            executionStore,
            policy,
            source,
            runtimeIdentity,
            settlementGate,
            logger,
          });
          retainLock ||= outcome.retainLock === true;
          outcomes.push(outcome);
        }
      } finally {
        if (lock.acquired && !retainLock) await lock.release();
      }
      return {
        schemaVersion: BRIEFING_CADENCE_EXECUTOR_VERSION,
        runId,
        invokedAt: asOf.toISOString(),
        source,
        lockAcquired: lock.acquired,
        lockReason: lock.reason ?? null,
        retainLock,
        outcomes,
      };
    },
  };
}

async function evaluateEntry({
  entry,
  runId,
  asOf,
  lock,
  executionStore,
  policy,
  source,
  runtimeIdentity,
  settlementGate,
  logger,
}) {
  const started = Date.now();
  const base = {
    schemaVersion: BRIEFING_CADENCE_EXECUTOR_VERSION,
    executionId: entry.executionId,
    attemptId: `${runId}:${entry.cadence}`,
    runId,
    cadenceKey: entry.cadence,
    userId: entry.userId,
    localBriefingDate: entry.localDate,
    localTime: entry.localTime,
    timezone: entry.timeZone,
    evidenceWindowId: entry.evidenceWindow?.id ?? null,
    expectedArtifactId: entry.expectedArtifactId,
    invokedAt: asOf.toISOString(),
    eligibilityResult: entry.eligible ? "eligible" : "ineligible",
    source,
    runtimeIdentity,
  };
  if (!entry.enabled) {
    return finish("skipped_disabled", {
      ...base,
      skipReason: "cadence_disabled",
      retryability: false,
    });
  }
  if (!entry.eligible) {
    return finish("ineligible", {
      ...base,
      skipReason: entry.eligibilityReason,
      retryability: false,
    });
  }
  if (!lock.acquired) {
    return finish("generation_in_progress", {
      ...base,
      artifactOutcome: "lock_owned_by_another_executor",
      skipReason: lock.reason ?? "executor_lock_active",
      retryability: true,
    });
  }

  const existing = await entry.findExpectedArtifact();
  if (isCompleted(existing)) {
    return finish("already_completed", {
      ...base,
      artifactOutcome: "existing_immutable_artifact",
      artifactId: existing.id,
      retryability: false,
    });
  }

  const retry = await executionStore.getRetryState({
    cadenceKey: entry.cadence,
    expectedArtifactId: entry.expectedArtifactId,
  });
  if (retry.terminalFailure) {
    return finish("terminal_failure", {
      ...base,
      artifactOutcome: "none",
      skipReason: "prior_terminal_failure",
      failureCategory: retry.lastFailureCategory,
      retryability: false,
    });
  }
  if (
    retry.consecutiveTransientFailures >= policy.transientFailureLimit &&
    retry.lastFailureAt &&
    asOf.valueOf() - new Date(retry.lastFailureAt).valueOf() <
      policy.transientRetryCooldownMinutes * 60_000
  ) {
    return finish("transient_failure", {
      ...base,
      artifactOutcome: "none",
      skipReason: "retry_cooldown",
      failureCategory: retry.lastFailureCategory,
      retryability: true,
      nextRetryAt: new Date(
        new Date(retry.lastFailureAt).valueOf() +
        policy.transientRetryCooldownMinutes * 60_000
      ).toISOString(),
    });
  }

  let settlementInput = null;
  if (settlementGate) {
    let settlement;
    try {
      settlement = await settlementGate.evaluate({
        finalEvidenceDate: entry.evidenceWindow?.endDate,
        earliestPublishAt: entry.dueAt,
        now: asOf,
      });
    } catch (error) {
      // The gate itself never throws for a coverage read failure (it fails
      // closed internally). Anything else that escapes must still fail CLOSED
      // and stay per-entry: retry next tick, never generate, never abort the
      // other cadences in this tick.
      logger?.warn?.("briefing_settlement.settlement_gate_error", {
        cadenceKey: entry.cadence, userId: entry.userId, reasonCode: SettlementReasonCode.GATE_ERROR,
        errorName: String(error?.name ?? "Error").slice(0, 80), errorCode: String(error?.code ?? "UNCLASSIFIED_ERROR").slice(0, 80),
      });
      return finish("awaiting_evidence_settlement", {
        ...base,
        artifactOutcome: "none",
        skipReason: SettlementReasonCode.GATE_ERROR,
        unsettledDomains: [],
        retryability: true,
      });
    }
    if (settlement.coverageReadFailed) {
      logger?.warn?.("briefing_settlement.coverage_read_failed", {
        cadenceKey: entry.cadence, userId: entry.userId, reasonCode: settlement.reasonCode, action: settlement.action,
        readErrorStage: settlement.readError?.stage ?? null, readErrorName: settlement.readError?.name ?? null,
        readErrorCode: settlement.readError?.code ?? null, hardDeadlineAt: settlement.hardDeadlineAt ?? null,
      });
    }
    logger?.info?.(settlementEventName(settlement), {
      cadenceKey: entry.cadence, userId: entry.userId,
      reasonCode: settlement.reasonCode, unsettledDomains: settlement.unsettledDomains ?? [],
    });
    if (settlement.action !== "generate") {
      return finish("awaiting_evidence_settlement", {
        ...base,
        artifactOutcome: "none",
        skipReason: settlement.reasonCode,
        unsettledDomains: settlement.unsettledDomains ?? [],
        retryability: true,
        nextRetryAt: settlement.nextCheckAt ?? null,
      });
    }
    base.settlementReasonCode = settlement.reasonCode;
    try {
      settlementInput = createSettlementGeneratorInput({ entry, decision: settlement, asOf });
    } catch (error) {
      // A publication that cannot carry its immutable watermark must not be
      // generated: fail closed, retry next tick.
      return finish("transient_failure", {
        ...base,
        artifactOutcome: "none",
        failureCategory: "evidence_settlement_watermark_failed",
        retryability: true,
        errorSummary: String(error?.message ?? error).slice(0, 300),
      });
    }
    base.settlementDeadlineFallback = settlementInput?.watermark?.deadlineFallback ?? false;
  }

  await executionStore.record({
    ...base,
    resultStatus: "generation_started",
    artifactOutcome: "generation_invoked",
    retryability: true,
    durationMs: Date.now() - started,
  });
  const operation = Promise.resolve().then(() =>
    entry.generator.generateForCurrentWindow({
      userId: entry.userId,
      asOf,
      ...(settlementInput ? { settlement: settlementInput } : {}),
    })
  );
  const timed = await withTimeout(operation, policy.generatorTimeoutMs);
  if (timed.timedOut) {
    lock.releaseAfter?.(operation);
    return finish("transient_failure", {
      ...base,
      artifactOutcome: "generator_timeout",
      failureCategory: "generator_timeout",
      retryability: true,
      errorSummary: `Generator exceeded ${policy.generatorTimeoutMs} ms.`,
      retainLock: true,
    });
  }
  if (timed.error) {
    return failure(timed.error);
  }
  const result = timed.value;
  if (result?.state === "completed") {
    if (!result.idempotent) {
      logger?.info?.("briefing_settlement.briefing_generated", {
        cadenceKey: entry.cadence, userId: entry.userId,
        artifactId: result.artifact?.id ?? entry.expectedArtifactId,
        settlementReasonCode: base.settlementReasonCode ?? null,
      });
      logger?.info?.("briefing_settlement.briefing_published", {
        cadenceKey: entry.cadence, userId: entry.userId,
        artifactId: result.artifact?.id ?? entry.expectedArtifactId,
      });
    }
    return finish(result.idempotent ? "already_completed" : "generation_completed", {
      ...base,
      artifactOutcome: result.idempotent ? "matched" : "created",
      artifactId: result.artifact?.id ?? entry.expectedArtifactId,
      retryability: false,
    });
  }
  if (result?.state === "in_progress") {
    return finish("generation_in_progress", {
      ...base,
      artifactOutcome: "canonical_claim_active",
      artifactId: result.artifact?.id ?? entry.expectedArtifactId,
      retryability: true,
    });
  }
  if (result?.state === "not_eligible") {
    return finish("ineligible", {
      ...base,
      artifactOutcome: "none",
      skipReason: result.reason ?? "generator_not_eligible",
      retryability: false,
    });
  }
  return failure(result?.error ?? new Error(result?.reason ?? "Generation failed."));

  async function failure(error) {
    const category = String(
      error?.code ?? error?.reason ?? error?.message ?? "generation_failure"
    ).slice(0, 120);
    const terminal = TERMINAL_FAILURES.has(category);
    return finish(terminal ? "terminal_failure" : "transient_failure", {
      ...base,
      artifactOutcome: "none",
      failureCategory: category,
      retryability: !terminal,
      errorSummary: String(error?.message ?? error).slice(0, 300),
    });
  }

  async function finish(resultStatus, values) {
    const record = {
      ...values,
      resultStatus,
      durationMs: Date.now() - started,
    };
    if (
      entry.eligible &&
      // A bounded, deliberate settlement wait is not a missing artifact: the hard
      // deadline guarantees generation, and a failure AFTER it still warns.
      !["already_completed", "generation_completed", "generation_in_progress",
        "awaiting_evidence_settlement"].includes(resultStatus) &&
      minutesSinceEligible(entry) >= policy.missingArtifactGraceMinutes
    ) {
      record.operationalWarning = "eligible_artifact_missing_after_grace";
    }
    await executionStore.record(record);
    return record;
  }
}

// Event name selection is keyed on the settlement decision's actual reason,
// not just the coarse wait/generate action — a "generate" outcome reached by
// hitting the hard deadline or because the gate did not apply at all is
// never labeled the same as ordinary readiness, so filtering by event name
// alone (not just the reasonCode payload field) distinguishes them.
function settlementEventName(settlement) {
  if (settlement.action !== "generate") return "briefing_settlement.awaiting_settlement";
  if (settlement.reasonCode === "hard_deadline_reached") return "briefing_settlement.deadline_fallback_used";
  if (settlement.reasonCode === "no_healthkit_backed_domains_settlement_not_applicable") {
    return "briefing_settlement.settlement_not_applicable";
  }
  return "briefing_settlement.readiness_satisfied";
}

function withTimeout(operation, timeoutMs) {
  return Promise.race([
    operation.then(
      (value) => ({ value, timedOut: false }),
      (error) => ({ error, timedOut: false })
    ),
    new Promise((resolve) => {
      setTimeout(
        () => resolve({ timedOut: true }),
        timeoutMs
      );
    }),
  ]);
}

function isCompleted(artifact) {
  return Boolean(
    artifact?.briefing &&
    artifact.lifecycle?.generationStatus !== "failed" &&
    artifact.lifecycle?.generationStatus !== "in_progress"
  );
}

function minutesSinceEligible(entry) {
  const [hour, minute] = entry.localEligibleTime.split(":").map(Number);
  const [currentHour, currentMinute] = entry.localTime.split(":").map(Number);
  return currentHour * 60 + currentMinute - (hour * 60 + minute);
}
