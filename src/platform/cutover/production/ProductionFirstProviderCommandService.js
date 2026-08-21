import { createHash } from "node:crypto";
import { createPhase4CanonicalRecordStore } from "../../database/Phase4CanonicalRecordStore.js";
import { canonicalJson } from "../../../contracts/v1/canonicalJson.js";

const COLLECTION = "migrationMarkers";
const MARKER_KIND = "phase7b-first-provider-command";

/**
 * Executes the one source-owned canonical command that establishes the Phase 7B M boundary.
 * The authority marker and canonical marker share one PostgreSQL transaction. There is no
 * caller-supplied operation, collection, payload, SQL, or arbitrary command callback.
 */
export function createProductionFirstProviderCommandService({ pool, authorityStore, ownerUserId } = {}) {
  if (!pool?.connect) throw new Error("The first-provider command service requires a PostgreSQL pool.");
  if (typeof authorityStore?.read !== "function" || typeof authorityStore?.claimCanonicalWriteBoundary !== "function") {
    throw new Error("The first-provider command service requires the production runtime-authority store.");
  }
  const owner = required(ownerUserId, "ownerUserId");

  return Object.freeze({ executeFirstProviderCommand });

  async function executeFirstProviderCommand({ run, input, commandId } = {}) {
    const identity = normalizeIdentity({ run, input, commandId });
    const markerId = markerRecordId(identity.commandId);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${owner}`]);

      const authorityBefore = (await authorityStore.read({ client, forUpdate: true })).state;
      assertAuthorityOperation(authorityBefore, identity.migrationOperationId);
      const records = createPhase4CanonicalRecordStore({ query: (text, values) => client.query(text, values) });
      const existing = await records.get({ ownerUserId: owner, collection: COLLECTION, recordId: markerId });

      if (authorityBefore.firstProviderCanonicalWriteAt != null || authorityBefore.firstProviderCommandId != null) {
        assertExactCommittedBoundary(authorityBefore, existing, { ...identity, markerId, ownerUserId: owner });
        await client.query("COMMIT");
        return result("idempotent-replay", authorityBefore, markerId, identity);
      }
      if (existing != null) {
        throw commandError("FIRST_PROVIDER_COMMAND_PARTIAL_EVIDENCE", "A canonical M marker exists without the matching authority boundary.");
      }

      const claimed = await authorityStore.claimCanonicalWriteBoundary({
        client,
        migrationOperationId: identity.migrationOperationId,
        commandId: identity.commandId,
      });
      const authorityAfter = claimed.state;
      assertExactAuthorityBoundary(authorityAfter, identity.commandId);
      const marker = markerPayload({ ...identity, markerId, ownerUserId: owner }, authorityAfter.firstProviderCanonicalWriteAt);
      const stored = await records.put({
        ownerUserId: owner,
        collection: COLLECTION,
        recordId: markerId,
        payload: marker,
        sourceIdentity: `combined-cutover:${identity.runId}`,
      });
      assertExactMarker(stored, marker);
      await client.query("COMMIT");
      return result("committed", authorityAfter, markerId, identity);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function normalizeIdentity({ run, input, commandId }) {
  const runId = boundedIdentity(run?.runId, "run.runId");
  const coordinatorOperationId = boundedIdentity(run?.coordinatorOperationId, "run.coordinatorOperationId");
  const migrationOperationId = boundedIdentity(run?.migrationOperationId, "run.migrationOperationId");
  if (migrationOperationId !== boundedIdentity(input?.migrationOperationId, "input.migrationOperationId")) {
    throw commandError("FIRST_PROVIDER_COMMAND_IDENTITY_MISMATCH", "The coordinator run and input migration operation do not match.");
  }
  const normalizedCommandId = boundedIdentity(commandId, "commandId");
  if (normalizedCommandId !== boundedIdentity(input?.firstProviderCommandId, "input.firstProviderCommandId")) {
    throw commandError("FIRST_PROVIDER_COMMAND_IDENTITY_MISMATCH", "The dispatched and input first-provider command IDs do not match.");
  }
  return Object.freeze({
    runId,
    coordinatorOperationId,
    migrationOperationId,
    commandId: normalizedCommandId,
    providerDeploymentId: boundedText(input?.providerDeploymentId, "providerDeploymentId"),
    providerBuildId: boundedText(input?.providerBuildId, "providerBuildId"),
  });
}

function assertAuthorityOperation(state, migrationOperationId) {
  if (state?.authority !== "provider-authoritative" || state?.publicRuntimeAuthority !== "provider" ||
      state?.canonicalStoreEpoch !== "postgres-canonical" || state?.compositionMode !== "postgres" || state?.writesEnabled !== true) {
    throw commandError("FIRST_PROVIDER_COMMAND_AUTHORITY_REJECTED", "Provider canonical authority is not ready for the M command.");
  }
  if (state.migrationOperationId !== migrationOperationId) {
    throw commandError("FIRST_PROVIDER_COMMAND_IDENTITY_MISMATCH", "Runtime authority belongs to another migration operation.");
  }
}

function assertExactCommittedBoundary(state, marker, identity) {
  assertExactAuthorityBoundary(state, identity.commandId);
  if (marker == null) {
    throw commandError("FIRST_PROVIDER_COMMAND_PARTIAL_EVIDENCE", "The authority boundary exists without its canonical M marker.");
  }
  assertExactMarker(marker, markerPayload(identity, state.firstProviderCanonicalWriteAt));
}

function assertExactAuthorityBoundary(state, commandId) {
  if (!exactIso(state?.firstProviderCanonicalWriteAt) || state?.firstProviderCommandId !== commandId) {
    throw commandError("FIRST_PROVIDER_COMMAND_CONFLICT", "A different or incomplete first-provider command boundary already exists.");
  }
}

function markerPayload(identity, firstProviderCanonicalWriteAt) {
  return Object.freeze({
    id: identity.markerId,
    userId: identity.ownerUserId,
    schemaVersion: 1,
    kind: MARKER_KIND,
    status: "accepted",
    runId: identity.runId,
    coordinatorOperationId: identity.coordinatorOperationId,
    migrationOperationId: identity.migrationOperationId,
    commandId: identity.commandId,
    providerDeploymentId: identity.providerDeploymentId,
    providerBuildId: identity.providerBuildId,
    firstProviderCanonicalWriteAt,
    version: 1,
  });
}

function assertExactMarker(actual, expected) {
  const comparable = actual && { ...actual, version: Number(actual.version) };
  if (!comparable || canonicalJson(comparable) !== canonicalJson(expected)) {
    throw commandError("FIRST_PROVIDER_COMMAND_MARKER_CONFLICT", "The durable M marker does not match the exact coordinator command identity.");
  }
}

function result(outcome, state, markerId, identity) {
  return Object.freeze({
    outcome,
    runId: identity.runId,
    migrationOperationId: identity.migrationOperationId,
    commandId: identity.commandId,
    markerId,
    firstProviderCanonicalWriteAt: state.firstProviderCanonicalWriteAt,
  });
}

function markerRecordId(commandId) {
  return `phase7b-first-provider:${createHash("sha256").update(commandId).digest("hex").slice(0, 32)}`;
}

function boundedIdentity(value, field) {
  const text = required(value, field);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,127}$/.test(text)) throw commandError("FIRST_PROVIDER_COMMAND_INPUT_INVALID", `${field} is invalid.`);
  return text;
}

function boundedText(value, field) {
  const text = required(value, field);
  if (text.length > 255 || /[\u0000-\u001f\u007f]/.test(text)) throw commandError("FIRST_PROVIDER_COMMAND_INPUT_INVALID", `${field} is invalid.`);
  return text;
}

function required(value, field) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw commandError("FIRST_PROVIDER_COMMAND_INPUT_INVALID", `${field} is required.`);
  return text;
}

function exactIso(value) {
  try { return typeof value === "string" && new Date(value).toISOString() === value; } catch { return false; }
}

function commandError(code, message) {
  return Object.assign(new Error(message), { code });
}
