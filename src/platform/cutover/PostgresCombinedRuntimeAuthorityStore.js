import {
  RuntimeAuthority,
  assertCompatibilityRuntimeAuthorityState,
  RuntimeAuthorityAction,
  applyCombinedRuntimeAuthorityTransition,
  combinedRuntimeAuthorityCommandFingerprint,
  validateCombinedRuntimeAuthorityState,
} from "./CombinedRuntimeAuthorityState.js";
import { canonicalJson } from "../../contracts/v1/canonicalJson.js";

export function createPostgresCombinedRuntimeAuthorityStore({ pool, environment } = {}) {
  if (!pool?.connect || !pool?.query) throw new Error("PostgreSQL runtime authority requires a pool.");
  if (!String(environment ?? "").trim()) throw new Error("PostgreSQL runtime authority requires an environment.");

  return Object.freeze({
    async initialize(initialState, { commandId = "combined-runtime-authority:initialize" } = {}) {
      validateCombinedRuntimeAuthorityState(initialState);
      if (initialState.environment !== environment) throw storeError("RUNTIME_AUTHORITY_ENVIRONMENT_CONFLICT", "Runtime-authority environment does not match the store.");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const existing = await readRow(client, environment, { forUpdate: true });
        if (existing) {
          if (!sameInitialization(existing, initialState)) {
            throw storeError("RUNTIME_AUTHORITY_INITIALIZATION_CONFLICT", "Existing runtime authority does not match the requested initialization state.");
          }
          await client.query("COMMIT");
          return Object.freeze({ state: existing, outcome: "already-initialized" });
        }
        await insertState(client, initialState);
        await insertAudit(client, {
          environment, state: initialState, previousAuthority: null, commandId,
          commandFingerprint: combinedRuntimeAuthorityCommandFingerprint({
            action: "initialized", expectedVersion: 0, reason: initialState.reason,
          }),
          action: "initialized", result: "committed",
        });
        await client.query("COMMIT");
        return Object.freeze({ state: initialState, outcome: "initialized" });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async read({ client = null, forUpdate = false, queryTimeoutMs = null } = {}) {
      const state = await readRow(client ?? pool, environment, {
        forUpdate: Boolean(client && forUpdate),
        queryTimeoutMs,
      });
      if (!state) throw storeError("RUNTIME_AUTHORITY_UNAVAILABLE", "Provider runtime-authority state is unavailable.");
      return Object.freeze({ state });
    },

    async transition(command) {
      required(command?.commandId, "commandId");
      const fingerprint = combinedRuntimeAuthorityCommandFingerprint(command);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const replay = await client.query(
          `SELECT command_fingerprint,state FROM physiqueos.combined_runtime_authority_audit
            WHERE environment=$1 AND command_id=$2`,
          [environment, command.commandId],
        );
        if (replay.rows[0]) {
          if (replay.rows[0].command_fingerprint !== fingerprint) {
            throw storeError("RUNTIME_AUTHORITY_COMMAND_REUSED", "Runtime-authority command ID was reused with different inputs.");
          }
          await client.query("COMMIT");
          return Object.freeze({ state: validateCombinedRuntimeAuthorityState(replay.rows[0].state), outcome: "idempotent-replay" });
        }
        const current = await requireCurrent(client, environment);
        const next = applyCombinedRuntimeAuthorityTransition(current, command);
        await updateState(client, current, next);
        await insertAudit(client, {
          environment, state: next, previousAuthority: current.authority, commandId: command.commandId,
          commandFingerprint: fingerprint, action: command.action, result: "committed",
        });
        await client.query("COMMIT");
        return Object.freeze({ state: next, outcome: "committed" });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async claimCanonicalWriteBoundary({ client, migrationOperationId, commandId }) {
      if (!client?.query) throw new Error("The first provider write boundary must share the domain transaction client.");
      required(commandId, "commandId");
      const current = await requireCurrent(client, environment);
      assertProviderWriteAllowed(current, migrationOperationId);
      if (current.firstProviderCanonicalWriteAt != null) return Object.freeze({ state: current, outcome: "already-recorded" });
      const command = {
        action: RuntimeAuthorityAction.RECORD_FIRST_PROVIDER_WRITE,
        expectedVersion: current.version,
        migrationOperationId,
        commandId,
        reason: "First accepted canonical command through the provider PostgreSQL runtime.",
      };
      const next = applyCombinedRuntimeAuthorityTransition(current, command);
      await updateState(client, current, next);
      await insertAudit(client, {
        environment, state: next, previousAuthority: current.authority, commandId,
        commandFingerprint: combinedRuntimeAuthorityCommandFingerprint(command),
        action: command.action, result: "committed",
      });
      return Object.freeze({ state: next, outcome: "recorded" });
    },

    async assertCanonicalWriteAllowed({ client, migrationOperationId }) {
      const current = await requireCurrent(client ?? pool, environment, { forUpdate: Boolean(client) });
      assertProviderWriteAllowed(current, migrationOperationId);
      return current;
    },

    async assertCompatibilityAccess({ client = null, databaseName } = {}) {
      const current = await requireCurrent(client ?? pool, environment, { forUpdate: Boolean(client) });
      return assertCompatibilityRuntimeAuthorityState(current, { environment, databaseName });
    },
  });
}

function sameInitialization(existing, expected) {
  const normalize = (value) => {
    const copy = structuredClone(value);
    delete copy.createdAt;
    delete copy.updatedAt;
    return canonicalJson(copy);
  };
  return normalize(existing) === normalize(expected);
}

function assertProviderWriteAllowed(state, migrationOperationId) {
  if (state.authority !== RuntimeAuthority.PROVIDER || state.publicRuntimeAuthority !== "provider" ||
      state.canonicalStoreEpoch !== "postgres-canonical" || state.compositionMode !== "postgres" || !state.writesEnabled) {
    throw storeError("CANONICAL_WRITES_PAUSED", "Provider canonical writes are not authorized by runtime authority.");
  }
  if (migrationOperationId != null && String(migrationOperationId) !== String(state.migrationOperationId)) {
    throw storeError("RUNTIME_AUTHORITY_OPERATION_CONFLICT", "Canonical write belongs to a different migration operation.");
  }
}

async function requireCurrent(queryTarget, environment) {
  const state = await readRow(queryTarget, environment, { forUpdate: true });
  if (!state) throw storeError("RUNTIME_AUTHORITY_UNAVAILABLE", "Provider runtime-authority state is unavailable.");
  return state;
}

async function readRow(queryTarget, environment, { forUpdate = false, queryTimeoutMs = null } = {}) {
  const text = `SELECT state FROM physiqueos.combined_runtime_authority WHERE environment=$1${forUpdate ? " FOR UPDATE" : ""}`;
  const result = queryTimeoutMs == null
    ? await queryTarget.query(text, [environment])
    : await queryTarget.query({ text, values: [environment], query_timeout: boundedReadTimeout(queryTimeoutMs) });
  return result.rows[0]?.state ? validateCombinedRuntimeAuthorityState(result.rows[0].state) : null;
}

function boundedReadTimeout(value) {
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 10_000) throw new Error("Runtime-authority read timeout is invalid.");
  return timeout;
}

async function insertState(client, state) {
  await client.query(
    `INSERT INTO physiqueos.combined_runtime_authority
      (environment,version,authority,migration_operation_id,authorization_fingerprint,fence_id,
       canonical_store_epoch,composition_mode,public_runtime_authority,migration_control_authority,
       worker_authority,writes_enabled,reads_enabled,first_provider_canonical_write_at,
       first_provider_command_id,state,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18)`,
    stateValues(state),
  );
}

async function updateState(client, current, next) {
  const values = stateValues(next);
  const updateValues = [...values.slice(0, 16), values[17], current.version];
  const result = await client.query(
    `UPDATE physiqueos.combined_runtime_authority SET
       version=$2,authority=$3,migration_operation_id=$4,authorization_fingerprint=$5,fence_id=$6,
       canonical_store_epoch=$7,composition_mode=$8,public_runtime_authority=$9,migration_control_authority=$10,
       worker_authority=$11,writes_enabled=$12,reads_enabled=$13,first_provider_canonical_write_at=$14,
       first_provider_command_id=$15,state=$16::jsonb,updated_at=$17
     WHERE environment=$1 AND version=$18`,
    updateValues,
  );
  if (result.rowCount !== 1) throw storeError("RUNTIME_AUTHORITY_VERSION_CONFLICT", "Runtime-authority state changed concurrently.");
}

function stateValues(state) {
  return [
    state.environment, state.version, state.authority, state.migrationOperationId, state.authorizationFingerprint,
    state.fenceId, state.canonicalStoreEpoch, state.compositionMode, state.publicRuntimeAuthority,
    state.migrationControlAuthority, state.workerAuthority, state.writesEnabled, state.readsEnabled,
    state.firstProviderCanonicalWriteAt, state.firstProviderCommandId, JSON.stringify(state), state.createdAt, state.updatedAt,
  ];
}

async function insertAudit(client, {
  environment, state, previousAuthority, commandId, commandFingerprint, action, result, errorCode = null,
}) {
  await client.query(
    `INSERT INTO physiqueos.combined_runtime_authority_audit
      (environment,state_version,command_id,command_fingerprint,migration_operation_id,action,
       previous_authority,next_authority,result,error_code,state)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
    [environment, state.version, commandId, commandFingerprint, state.migrationOperationId, action,
      previousAuthority, state.authority, result, errorCode, JSON.stringify(state)],
  );
}

function required(value, field) {
  if (!String(value ?? "").trim()) throw storeError("RUNTIME_AUTHORITY_INPUT_INVALID", `${field} is required.`);
}

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
