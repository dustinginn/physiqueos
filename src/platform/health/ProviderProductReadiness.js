import { getProductionProviderReadinessComposition } from "../../application/composition/productionApplicationComposition.js";
import { assertCompatibilityRuntimeAuthorityState } from "../cutover/CombinedRuntimeAuthorityState.js";
import { getAccessGateStatus } from "../accessGate/accessGateConfig.js";
import { foundationBuildIdentity } from "../foundation/runtime.js";
import { createReadinessModel } from "../observability/health.js";

export const PROVIDER_READINESS_DEADLINE_MS = 8_000;
const DEPENDENCY_TIMEOUT_MS = 3_000;

export async function getProviderProductReadiness({
  env = process.env,
  buildIdentity = foundationBuildIdentity,
  getComposition = getProductionProviderReadinessComposition,
  logger = console,
  deadlineMs = PROVIDER_READINESS_DEADLINE_MS,
  now = () => performance.now(),
} = {}) {
  const deadline = boundedDeadline(deadlineMs);
  const checks = [];
  const startedAt = now();
  let activeStage = "access_gate";
  let completed = false;
  const controller = new AbortController();

  if (!getAccessGateStatus(env).ready) {
    checks.push(check("access_gate", false, "ACCESS_GATE_NOT_CONFIGURED"));
    return readiness(checks, buildIdentity);
  }
  checks.push(check("access_gate", true, "ACCESS_GATE_READY"));

  let timeoutId;
  const deadlineResult = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      if (completed) return;
      completed = true;
      controller.abort();
      const code = "PROVIDER_READINESS_DEADLINE_EXCEEDED";
      checks.push(check("deadline", false, code));
      warn(logger, activeStage, code, now() - startedAt);
      resolve(readiness(checks, buildIdentity));
    }, deadline);
  });

  const outcome = await Promise.race([runChecks(), deadlineResult]);
  clearTimeout(timeoutId);
  return outcome;

  async function runChecks() {
    try {
      activeStage = "provider_configuration";
      const composition = await getComposition(env);
      if (completed) return readiness(checks, buildIdentity);
      checks.push(check(activeStage, true, "PROVIDER_CONFIGURATION_READY"));

      activeStage = "database";
      const database = await composition.databaseProbe.healthCheck({ queryTimeoutMs: DEPENDENCY_TIMEOUT_MS });
      if (completed) return readiness(checks, buildIdentity);
      if (database?.reachable !== true) return fail("PROVIDER_DATABASE_UNAVAILABLE");
      checks.push(check(activeStage, true, "PROVIDER_DATABASE_REACHABLE"));

      activeStage = "database_identity";
      if (!database.databaseName || database.databaseName !== composition.expectedDatabaseName) {
        return fail("PROVIDER_DATABASE_IDENTITY_MISMATCH");
      }
      checks.push(check(activeStage, true, "PROVIDER_DATABASE_IDENTITY_MATCHED"));

      activeStage = "product_owner";
      if (database.ownerPresent !== true) return fail("PROVIDER_OWNER_IDENTITY_UNAVAILABLE");
      checks.push(check(activeStage, true, "PROVIDER_OWNER_IDENTITY_READY"));

      activeStage = "runtime_authority";
      const state = (await composition.authorityStore.read({ queryTimeoutMs: DEPENDENCY_TIMEOUT_MS }))?.state;
      if (completed) return readiness(checks, buildIdentity);
      validateAuthority(state, composition.compatibilityMode, env);
      checks.push(check(activeStage, true, composition.compatibilityMode
        ? "COMPATIBILITY_AUTHORITY_NONAUTHORITATIVE"
        : "PROVIDER_RUNTIME_AUTHORITY_READY"));

      activeStage = "object_storage";
      const objectStorage = await composition.objectProvider.healthCheck({
        signal: controller.signal,
        timeoutMs: DEPENDENCY_TIMEOUT_MS,
      });
      if (completed) return readiness(checks, buildIdentity);
      if (objectStorage?.reachable !== true) return fail("PROVIDER_OBJECT_STORAGE_UNAVAILABLE");
      checks.push(check(activeStage, true, "PROVIDER_OBJECT_STORAGE_REACHABLE"));

      checks.push(check("deadline", true, "PROVIDER_READINESS_COMPLETED_IN_BUDGET"));
      completed = true;
      return readiness(checks, buildIdentity);
    } catch (error) {
      return fail(safeCode(error, fallbackCode(activeStage)));
    }
  }

  function fail(code) {
    if (completed) return readiness(checks, buildIdentity);
    completed = true;
    controller.abort();
    checks.push(check(activeStage, false, code));
    warn(logger, activeStage, code, now() - startedAt);
    return readiness(checks, buildIdentity);
  }
}

function validateAuthority(state, compatibilityMode, env) {
  if (compatibilityMode) {
    assertCompatibilityRuntimeAuthorityState(state, {
      environment: env.PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT,
      databaseName: env.PHYSIQUEOS_COMPATIBILITY_DATABASE_NAME,
    });
    return;
  }
  if (!state || !["provider-prepared", "provider-authoritative", "recovery-required"].includes(state.authority)) {
    throw readinessError("PROVIDER_RUNTIME_AUTHORITY_UNAVAILABLE");
  }
  if (state.readsEnabled !== true) throw readinessError("PROVIDER_READS_PAUSED");
}

function readiness(checks, buildIdentity) {
  return createReadinessModel({ checks, buildIdentity });
}

function check(name, ready, code) {
  return Object.freeze({ name, ready, code });
}

function fallbackCode(stage) {
  return ({
    provider_configuration: "PROVIDER_READINESS_CONFIGURATION_FAILED",
    database: "PROVIDER_DATABASE_UNAVAILABLE",
    database_identity: "PROVIDER_DATABASE_IDENTITY_MISMATCH",
    product_owner: "PROVIDER_OWNER_IDENTITY_UNAVAILABLE",
    runtime_authority: "PROVIDER_RUNTIME_AUTHORITY_UNAVAILABLE",
    object_storage: "PROVIDER_OBJECT_STORAGE_UNAVAILABLE",
  })[stage] ?? "PROVIDER_PRODUCT_READINESS_FAILED";
}

function safeCode(error, fallback) {
  const code = String(error?.code ?? "");
  return /^[A-Z][A-Z0-9_]{2,80}$/.test(code) ? code : fallback;
}

function warn(logger, stage, code, elapsedMs) {
  logger?.warn?.("provider.readiness.failed", {
    stage,
    code,
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
  });
}

function boundedDeadline(value) {
  const deadline = Number(value);
  if (!Number.isInteger(deadline) || deadline < 100 || deadline > 30_000) {
    throw new Error("Provider readiness deadline is invalid.");
  }
  return deadline;
}

function readinessError(code) {
  return Object.assign(new Error(code), { code });
}
