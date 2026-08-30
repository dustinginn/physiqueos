import {
  BRIEFING_CADENCE_CATCH_UP_POLICY,
  resolveBriefingCadenceRegistry,
} from "./BriefingCadenceRegistryService";

export const BRIEFING_CADENCE_EXECUTOR_VERSION = "briefing_cadence_executor_v1";

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
}) {
  const started = Date.now();
  const base = {
    schemaVersion: BRIEFING_CADENCE_EXECUTOR_VERSION,
    executionId: `${runId}:${entry.cadence}`,
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
      !["already_completed", "generation_completed", "generation_in_progress"].includes(
        resultStatus
      ) &&
      minutesSinceEligible(entry) >= policy.missingArtifactGraceMinutes
    ) {
      record.operationalWarning = "eligible_artifact_missing_after_grace";
    }
    await executionStore.record(record);
    return record;
  }
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
