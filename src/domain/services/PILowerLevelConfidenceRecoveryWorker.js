import { createHash, randomUUID } from "node:crypto";

export const PILowerLevelWorkerMode = Object.freeze({
  DRY_RUN: "dry_run",
  EXECUTE: "execute",
});
export const PILowerLevelWorkerOutcome = Object.freeze({
  COMPLETED: "completed",
  UNAUTHORIZED: "unauthorized",
  BASELINE_CONFLICT: "baseline_conflict",
  INVALID_REQUEST: "invalid_request",
});

export function isPILowerLevelWorkerExecuteEnabled(environment = process.env) {
  return environment.PI_LOWER_LEVEL_CONFIDENCE_WORKER_EXECUTE_ENABLED === "true";
}

export function createPILowerLevelConfidenceRecoveryWorker({
  energyService,
  trainingService,
  now = () => new Date(),
  createRunId = () => randomUUID(),
  executeEnabled = () => isPILowerLevelWorkerExecuteEnabled(),
} = {}) {
  if (!energyService || !trainingService) {
    throw new Error("Lower-level worker requires Energy and Training services.");
  }
  const services = { energy: energyService, training: trainingService };
  return Object.freeze({
    async run(input = {}) {
      const mode = input.mode ?? PILowerLevelWorkerMode.DRY_RUN;
      const domains = normalizeDomains(input.domains);
      const startedAt = now().toISOString();
      const runId = createRunId();
      if (![PILowerLevelWorkerMode.DRY_RUN, PILowerLevelWorkerMode.EXECUTE]
        .includes(mode)) {
        return summary({
          runId, mode, domains, startedAt, completedAt: now().toISOString(),
          outcome: PILowerLevelWorkerOutcome.INVALID_REQUEST,
        });
      }
      if (mode === PILowerLevelWorkerMode.EXECUTE &&
          !authorized(input, executeEnabled)) {
        return summary({
          runId, mode, domains, startedAt, completedAt: now().toISOString(),
          outcome: PILowerLevelWorkerOutcome.UNAUTHORIZED,
        });
      }
      const firstService = services[domains[0]];
      const baseline = firstService.captureBaseline();
      if (
        input.expectedRevision != null &&
        input.expectedRevision !== baseline.revision ||
        input.expectedSemanticDigest != null &&
        input.expectedSemanticDigest !== baseline.semanticDigest
      ) {
        return summary({
          runId, mode, domains, startedAt, completedAt: now().toISOString(),
          outcome: PILowerLevelWorkerOutcome.BASELINE_CONFLICT,
        });
      }
      const selected = selectWork({
        services, domains, input, at: now(),
      });
      const results = [];
      for (const selection of selected) {
        const service = services[selection.domain];
        if (mode === PILowerLevelWorkerMode.DRY_RUN) {
          results.push({
            domain: selection.domain,
            ...service.preview(selection.work.id),
          });
          continue;
        }
        const claim = await service.claim(selection.work.id, { at: now() });
        if (claim.outcome !== "processing") {
          results.push({
            domain: selection.domain,
            workId: selection.work.id,
            ...claim,
          });
          if (input.stopOnConflict !== false &&
              claim.outcome === "baseline_conflict") break;
          continue;
        }
        results.push({
          domain: selection.domain,
          workId: selection.work.id,
          ...(await service.finalize(selection.work.id)),
        });
      }
      return summary({
        runId,
        mode,
        domains,
        startedAt,
        completedAt: now().toISOString(),
        outcome: PILowerLevelWorkerOutcome.COMPLETED,
        selectedWorkIds: selected.map((item) => item.work.id),
        results,
      });
    },
  });
}

function authorized(input, executeEnabled) {
  return executeEnabled() &&
    input.productionExecutionAuthorized === true &&
    input.acceptsRuntimeMutation === true &&
    typeof input.operationReason === "string" &&
    input.operationReason.trim().length >= 8 &&
    Number.isSafeInteger(input.expectedRevision) &&
    typeof input.expectedSemanticDigest === "string" &&
    (
      Array.isArray(input.workIds) && input.workIds.length > 0 ||
      Number.isInteger(input.maximumItems) && input.maximumItems > 0
    );
}
function normalizeDomains(domains = ["energy", "training"]) {
  const values = [...new Set(domains.map((item) => String(item).toLowerCase()))]
    .filter((item) => ["energy", "training"].includes(item));
  return values.length ? values : ["energy", "training"];
}
function selectWork({ services, domains, input, at }) {
  const requested = new Set(input.workIds ?? []);
  const maximum = Math.max(1, Math.min(input.maximumItems ?? 25, 100));
  return domains.flatMap((domain) =>
    services[domain].listRecoverableWork({ at })
      .filter((work) => requested.size === 0 || requested.has(work.id))
      .filter((work) =>
        !input.cutoff || Date.parse(work.createdAt) <= Date.parse(input.cutoff)
      )
      .map((work) => ({ domain, work }))
  ).sort((left, right) =>
    `${left.work.createdAt}|${left.domain}|${left.work.id}`.localeCompare(
      `${right.work.createdAt}|${right.domain}|${right.work.id}`
    )
  ).slice(0, maximum);
}
function summary(values) {
  const results = values.results ?? [];
  const count = (names) =>
    results.filter((item) => names.includes(item.outcome)).length;
  return Object.freeze({
    schemaVersion: "pi_lower_level_worker_run_v1",
    runId: values.runId,
    runFingerprint: fingerprint({
      mode: values.mode,
      domains: values.domains,
      selectedWorkIds: values.selectedWorkIds ?? [],
      results: results.map((item) => ({
        domain: item.domain,
        workId: item.workId,
        outcome: item.outcome,
      })),
    }),
    mode: values.mode,
    domains: values.domains,
    outcome: values.outcome,
    startedAt: values.startedAt,
    completedAt: values.completedAt,
    selectedWorkIds: values.selectedWorkIds ?? [],
    processedCount: results.length,
    publishedCount: count(["published_successor"]),
    matchedCount: count(["matched"]),
    nonMaterialCount: count(["not_material"]),
    awaitingCount: count([
      "awaiting_pair", "awaiting_final_training_interpretation",
    ]),
    cadenceOwnedCount: count(["cadence_owned"]),
    eventOwnedCount: count(["event_owned"]),
    blockedCount: count(["context_precedence_blocked"]),
    failedCount: count(["persistence_failure", "attempt_limit_reached"]),
    baselineConflictCount: count(["baseline_conflict"]),
    committedPublicationFailureCount:
      count(["committed_publication_failure"]),
    results,
  });
}
function fingerprint(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}
