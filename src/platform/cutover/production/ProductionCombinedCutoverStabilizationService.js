import {
  CoordinatorInspectionClassification,
  freeze,
} from "../coordinator/combinedCutoverCoordinatorContract.js";

export const PHASE7B_STABILIZATION_CATEGORIES = Object.freeze([
  "health",
  "readiness",
  "worker",
  "authority",
  "routing",
  "backups",
  "domainMediaOutbox",
  "crossClient",
]);

/**
 * Phase P is an evidence join, never a timer. Each explicit inspector owns its production read
 * boundary and must return evidence bound to this run/operation/deployment/build. This service
 * performs no mutation and persists no credentials or raw probe bodies.
 */
export function createProductionCombinedCutoverStabilizationService({
  healthInspector,
  readinessInspector,
  workerInspector,
  authorityInspector,
  routingInspector,
  backupInspector,
  domainMediaOutboxInspector,
  crossClientInspector,
  now = () => new Date(),
  maximumEvidenceAgeMs = 5 * 60 * 1000,
  maximumFutureSkewMs = 5_000,
} = {}) {
  const inspectors = Object.freeze({
    health: requireInspector(healthInspector, "healthInspector"),
    readiness: requireInspector(readinessInspector, "readinessInspector"),
    worker: requireInspector(workerInspector, "workerInspector"),
    authority: requireInspector(authorityInspector, "authorityInspector"),
    routing: requireInspector(routingInspector, "routingInspector"),
    backups: requireInspector(backupInspector, "backupInspector"),
    domainMediaOutbox: requireInspector(domainMediaOutboxInspector, "domainMediaOutboxInspector"),
    crossClient: requireInspector(crossClientInspector, "crossClientInspector"),
  });
  boundedDuration(maximumEvidenceAgeMs, "maximumEvidenceAgeMs", 1_000, 60 * 60 * 1000);
  boundedDuration(maximumFutureSkewMs, "maximumFutureSkewMs", 0, 60_000);

  return freeze({ inspect, execute });

  async function inspect({ run, input } = {}) {
    const identity = expectedIdentity(run, input);
    const observedNow = exactDate(now(), "now");
    const categories = {};
    const failures = [];
    let ambiguous = false;
    let newestCommonCheck = null;

    for (const category of PHASE7B_STABILIZATION_CATEGORIES) {
      let result;
      try {
        result = await inspectors[category].inspect({ run, input });
      } catch {
        ambiguous = true;
        failures.push(`${category}:inspection-unavailable`);
        categories[category] = false;
        continue;
      }
      const validation = validateCategory(category, result, identity, observedNow, {
        maximumEvidenceAgeMs,
        maximumFutureSkewMs,
      });
      categories[category] = validation.ready;
      if (!validation.ready) failures.push(`${category}:${validation.reason}`);
      if (validation.ambiguous) ambiguous = true;
      if (validation.checkedAt && (!newestCommonCheck || validation.checkedAt < newestCommonCheck)) {
        newestCommonCheck = validation.checkedAt;
      }
    }

    const complete = PHASE7B_STABILIZATION_CATEGORIES.every((category) => categories[category] === true);
    return freeze({
      phase: "P",
      classification: complete
        ? CoordinatorInspectionClassification.COMPLETED
        : ambiguous
          ? CoordinatorInspectionClassification.AMBIGUOUS
          : CoordinatorInspectionClassification.BLOCKED,
      categories,
      evidence: {
        runId: identity.runId,
        operationId: identity.operationId,
        providerDeploymentId: identity.providerDeploymentId,
        buildId: identity.providerBuildId,
        checkedAt: newestCommonCheck,
        status: complete ? "explicit-stabilization-evidence-complete" : "stabilization-evidence-incomplete",
      },
      blockingPreconditions: failures.slice(0, PHASE7B_STABILIZATION_CATEGORIES.length),
    });
  }

  // Required by the external coordinator's typed phase interface. It is deliberately another
  // read-only evidence join; Phase P never turns a delay into success and dispatches no mutation.
  async function execute(context) {
    return inspect(context);
  }
}

function validateCategory(category, result, expected, now, limits) {
  if (!result || typeof result !== "object") return { ready: false, ambiguous: true, reason: "invalid-result" };
  const checkedAt = exactIsoOrNull(result.checkedAt);
  if (!checkedAt) return { ready: false, ambiguous: false, reason: "checked-at-invalid" };
  const age = now.getTime() - new Date(checkedAt).getTime();
  if (age < -limits.maximumFutureSkewMs) return { ready: false, ambiguous: false, reason: "evidence-from-future", checkedAt };
  if (age > limits.maximumEvidenceAgeMs) return { ready: false, ambiguous: false, reason: "evidence-stale", checkedAt };
  for (const [field, value] of Object.entries({
    runId: expected.runId,
    migrationOperationId: expected.operationId,
    providerDeploymentId: expected.providerDeploymentId,
    providerBuildId: expected.providerBuildId,
  })) {
    if (String(result[field] ?? "") !== value) return { ready: false, ambiguous: false, reason: `${field}-mismatch`, checkedAt };
  }
  const predicate = CATEGORY_PREDICATES[category];
  if (!predicate(result, expected)) return { ready: false, ambiguous: false, reason: "acceptance-contract-failed", checkedAt };
  return { ready: true, ambiguous: false, reason: null, checkedAt };
}

const CATEGORY_PREDICATES = Object.freeze({
  health: (value) => value.ready === true && value.httpStatus === 200 && value.buildId === value.providerBuildId,
  readiness: (value) => value.ready === true && value.httpStatus === 200 && value.deadlineBounded === true,
  worker: (value) => value.ready === true && value.workerStatus === "healthy" && value.workerRole === "provider",
  authority: (value, expected) => value.ready === true && value.authority === "provider-authoritative" &&
    value.publicRuntimeAuthority === "provider" && value.writesEnabled === true &&
    exactIsoOrNull(value.firstProviderCanonicalWriteAt) != null && value.firstProviderCommandId === expected.firstProviderCommandId,
  routing: (value) => value.ready === true && value.routingRole === "provider" && value.publicHttpsReady === true,
  backups: (value) => value.ready === true && value.windowsRestoreVerified === true &&
    value.postgresRestoreVerified === true && value.spacesRestoreVerified === true && value.retentionPolicyAccepted === true,
  domainMediaOutbox: (value) => value.ready === true && value.domainReady === true &&
    value.mediaParity === true && value.outboxConverged === true,
  crossClient: (value) => value.ready === true && value.webAccepted === true &&
    value.currentNativeAccepted === true && value.previousNativeAccepted === true,
});

function expectedIdentity(run, input) {
  const identity = {
    runId: required(run?.runId, "run.runId"),
    operationId: required(run?.migrationOperationId, "run.migrationOperationId"),
    providerDeploymentId: required(input?.providerDeploymentId, "input.providerDeploymentId"),
    providerBuildId: required(input?.providerBuildId, "input.providerBuildId"),
    firstProviderCommandId: required(input?.firstProviderCommandId, "input.firstProviderCommandId"),
  };
  if (identity.operationId !== String(input?.migrationOperationId ?? "")) throw new Error("Phase P operation identity mismatch.");
  return Object.freeze(identity);
}

function requireInspector(value, field) {
  if (typeof value?.inspect !== "function") throw new Error(`Phase P requires ${field}.inspect.`);
  return value;
}

function exactDate(value, field) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(`Phase P ${field} is invalid.`);
  return value;
}

function exactIsoOrNull(value) {
  if (typeof value !== "string") return null;
  try { return new Date(value).toISOString() === value ? value : null; } catch { return null; }
}

function boundedDuration(value, field, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`Phase P ${field} is invalid.`);
}

function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw new Error(`Phase P ${field} is required.`);
  return candidate;
}
