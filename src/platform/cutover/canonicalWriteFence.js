import path from "node:path";
import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { createDurableMigrationControlStore, resolveMigrationControlPath } from "./DurableMigrationControlStore.js";
import { CanonicalCompositionMode, CanonicalStoreEpoch } from "./migrationControlState.js";

export function createCanonicalWriteFence({
  controlStore,
  requiredCompositionMode,
  expectedCanonicalStoreEpoch = null,
} = {}) {
  if (!controlStore?.read) throw new Error("Canonical write fence requires a durable control store.");
  return Object.freeze({
    inspect() {
      return controlStore.read().state;
    },
    assertWriteAllowed({ operation = "canonical-write", expectedEpoch = expectedCanonicalStoreEpoch } = {}) {
      let state;
      try {
        state = controlStore.read().state;
      } catch (error) {
        throw writesPausedProblem({ operation, reason: "control-unavailable", cause: error });
      }
      if (!state.writesEnabled) {
        throw writesPausedProblem({ operation, reason: state.fenceState });
      }
      if (expectedEpoch != null && state.canonicalStoreEpoch !== expectedEpoch) {
        throw new ApplicationProblem({
          status: 409,
          code: "CANONICAL_STORE_EPOCH_MISMATCH",
          title: "This write belongs to a different canonical-store era.",
          detail: "The request was not applied. Refresh canonical state before retrying.",
          recovery: { expectedEpoch, actualEpoch: state.canonicalStoreEpoch, retryable: false },
        });
      }
      if (requiredCompositionMode && state.compositionMode !== requiredCompositionMode) {
        throw new ApplicationProblem({
          status: 503,
          code: "WRONG_CANONICAL_STORE",
          title: "This canonical store is not accepting writes.",
          detail: "The request was not applied. No canonical mutation occurred.",
          recovery: { expectedCompositionMode: requiredCompositionMode, actualCompositionMode: state.compositionMode, retryable: false },
        });
      }
      return state;
    },
  });
}

export function assertProductionLegacyCanonicalWriteAllowed({
  operation,
  runtimeStorePath = resolveRuntimeStorePath(),
  env = process.env,
} = {}) {
  if (!mustEnforceProductionControl({ runtimeStorePath, env })) {
    return Object.freeze({
      fenceState: "isolated-control-not-required",
      canonicalStoreEpoch: CanonicalStoreEpoch.LEGACY_JSON,
      compositionMode: CanonicalCompositionMode.LEGACY_JSON,
      writesEnabled: true,
    });
  }
  return createCanonicalWriteFence({
    controlStore: createDurableMigrationControlStore({ filePath: resolveMigrationControlPath({ env }) }),
    requiredCompositionMode: CanonicalCompositionMode.LEGACY_JSON,
    expectedCanonicalStoreEpoch: CanonicalStoreEpoch.LEGACY_JSON,
  }).assertWriteAllowed({ operation });
}

function resolveRuntimeStorePath({ cwd = process.cwd(), env = process.env } = {}) {
  return path.resolve(cwd, env.PHYSIQUEOS_RUNTIME_STORE_PATH ?? path.join("private", "founder", "runtime-store.json"));
}

export function mustEnforceProductionControl({ runtimeStorePath, cwd = process.cwd(), env = process.env } = {}) {
  if (env.PHYSIQUEOS_MIGRATION_CONTROL_PATH) return true;
  const canonicalProductionPath = path.resolve(cwd, "private", "founder", "runtime-store.json");
  return path.resolve(runtimeStorePath) === canonicalProductionPath;
}

export function writesPausedProblem({ operation, reason, cause = null } = {}) {
  return new ApplicationProblem({
    status: 503,
    code: "CANONICAL_WRITES_PAUSED",
    title: "Writes are temporarily paused.",
    detail: "This request was not applied. No canonical mutation occurred. Retry after maintenance completes.",
    recovery: { operation, reason, retryable: true },
    cause,
  });
}
