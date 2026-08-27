import { createHash } from "node:crypto";
import { RuntimeAuthority, RuntimeAuthorityAction } from "../CombinedRuntimeAuthorityState.js";
import { assertCombinedCutoverRoutingControl } from "../routing/combinedCutoverRoutingControl.js";
import { SIMPLIFIED_MIGRATION_MODE } from "./SimplifiedMigrationEligibility.js";

export function createSimplifiedAuthorityHandoffService({ authorityStore, routingControl } = {}) {
  if (!authorityStore?.read || !authorityStore?.transition) throw new Error("Simplified handoff requires the existing runtime-authority store.");
  if (routingControl) assertCombinedCutoverRoutingControl(routingControl);

  const service = {
    async prepare(input) {
      const value = assertPrerequisites(input);
      let state = (await authorityStore.read()).state;
      if (state.authority === RuntimeAuthority.WINDOWS_LEGACY) {
        state = (await authorityStore.transition({
          action: RuntimeAuthorityAction.BEGIN_CUTOVER,
          expectedVersion: state.version,
          migrationOperationId: value.migrationOperationId,
          authorizationFingerprint: value.authorizationFingerprint,
          fenceId: value.fenceId,
          finalSnapshot: value.finalSnapshot,
          providerSource: value.providerSource,
          target: value.target,
          routingTarget: value.routingTarget,
          commandId: `${value.commandPrefix}:begin`,
          reason: "Begin the accepted single-user cold-backup migration with Windows cold.",
        })).state;
      }
      if (state.authority === RuntimeAuthority.CUTOVER_IN_PROGRESS) {
        assertSamePreparedOperation(state, value);
        state = (await authorityStore.transition({
          action: RuntimeAuthorityAction.ACKNOWLEDGE_PROVIDER,
          expectedVersion: state.version,
          migrationOperationId: value.migrationOperationId,
          providerAcknowledgement: acknowledgement(value),
          commandId: `${value.commandPrefix}:acknowledge-provider`,
          reason: "Founder import and private parity passed before provider authority transfer.",
        })).state;
      }
      if (state.authority !== RuntimeAuthority.PROVIDER_PREPARED) fail("SIMPLIFIED_HANDOFF_AUTHORITY_REJECTED", "Provider preparation did not reach provider-prepared authority.");
      assertSamePreparedOperation(state, value);
      assertPreWrite(state);
      return Object.freeze({ ready: true, authority: state.authority, firstProviderCanonicalWriteAt: null });
    },

    async transferAuthority(input) {
      const value = assertPrerequisites(input);
      if (input.routingReadiness?.ready !== true) fail("SIMPLIFIED_HANDOFF_ROUTING_NOT_READY", "Routing readiness has not passed.");
      let state = (await authorityStore.read()).state;
      if (state.authority === RuntimeAuthority.PROVIDER) {
        assertSameOperation(state, value);
        assertPreWrite(state);
        return Object.freeze({ ready: true, outcome: "idempotent-replay", authority: state.authority, firstProviderCanonicalWriteAt: null, routingActivationRequired: true });
      }
      if (state.authority !== RuntimeAuthority.PROVIDER_PREPARED) fail("SIMPLIFIED_HANDOFF_AUTHORITY_REJECTED", "Authority transfer requires provider-prepared state.");
      assertSamePreparedOperation(state, value);
      assertPreWrite(state);
      state = (await authorityStore.transition({
        action: RuntimeAuthorityAction.TRANSFER_TO_PROVIDER,
        expectedVersion: state.version,
        migrationOperationId: value.migrationOperationId,
        routingTarget: value.routingTarget,
        commandId: `${value.commandPrefix}:transfer`,
        reason: "Transfer canonical authority only after import, private parity, and routing readiness passed.",
      })).state;
      assertPreWrite(state);
      return Object.freeze({ ready: true, outcome: "authority-transferred", authority: state.authority, firstProviderCanonicalWriteAt: null, routingActivationRequired: true });
    },

    async transfer(input) {
      if (!routingControl) fail("SIMPLIFIED_HANDOFF_ROUTING_CONTROL_REQUIRED", "Routing control is required for the combined authority-and-route operation.");
      const value = assertPrerequisites(input);
      const transferred = await service.transferAuthority(input);
      await routingControl.activateProviderRoute({
        routingTarget: value.routingTarget,
        providerDeploymentId: value.providerDeploymentId,
        operationIdentity: { operationId: value.migrationOperationId, commandId: `${value.commandPrefix}:activate-route` },
      });
      const verified = await routingControl.verifyProviderRoute({ routingTarget: value.routingTarget });
      if (verified?.ready !== true) fail("SIMPLIFIED_HANDOFF_ROUTING_VERIFY_FAILED", "Provider routing did not verify after authority transfer.");
      return Object.freeze({ ...transferred, outcome: "handed-off", routingActivationRequired: false });
    },

    async abortBeforeFirstWrite({ migrationOperationId, commandPrefix, reason = "Abort simplified migration to cold Windows before the first provider canonical write." } = {}) {
      const state = (await authorityStore.read()).state;
      assertPreWrite(state);
      if (![RuntimeAuthority.CUTOVER_IN_PROGRESS, RuntimeAuthority.PROVIDER_PREPARED, RuntimeAuthority.PROVIDER].includes(state.authority)) {
        fail("SIMPLIFIED_HANDOFF_ABORT_REJECTED", "No pre-write simplified handoff is active.");
      }
      return authorityStore.transition({
        action: RuntimeAuthorityAction.ABORT_TO_WINDOWS,
        expectedVersion: state.version,
        migrationOperationId: required(migrationOperationId, "migrationOperationId"),
        commandId: `${required(commandPrefix, "commandPrefix")}:abort-to-windows`,
        reason,
      });
    },
  };
  return Object.freeze(service);
}

function assertPrerequisites(input = {}) {
  if (input.migrationMode !== SIMPLIFIED_MIGRATION_MODE) fail("SIMPLIFIED_HANDOFF_MODE_REQUIRED", "The explicit simplified migration mode is required.");
  if (input.windowsCold !== true) fail("SIMPLIFIED_HANDOFF_WINDOWS_WRITER_ACTIVE", "Windows must remain cold before provider preparation or authority transfer.");
  if (input.providerPreflight?.ready !== true || input.productionDryRun?.ready !== true) fail("SIMPLIFIED_HANDOFF_PREFLIGHT_REJECTED", "Provider preflight and production dry-run must pass.");
  if (input.importResult?.ready !== true || input.importResult?.packageDigest !== input.packageDigest) fail("SIMPLIFIED_HANDOFF_IMPORT_REJECTED", "Founder import has not passed for the exact package.");
  if (input.parityResult?.ready !== true || input.parityResult?.packageDigest !== input.packageDigest) fail("SIMPLIFIED_HANDOFF_PARITY_REJECTED", "Private provider parity has not passed for the exact package.");
  if (input.providerPreflight?.authority !== "non-authoritative" || input.providerPreflight?.firstPostgresWriteAt != null) {
    fail("SIMPLIFIED_HANDOFF_PROVIDER_STATE_REJECTED", "Provider must remain non-authoritative and pre-write before handoff.");
  }
  const value = {
    migrationOperationId: required(input.migrationOperationId, "migrationOperationId"),
    commandPrefix: required(input.commandPrefix, "commandPrefix"),
    fenceId: required(input.fenceId, "fenceId"),
    packageDigest: digest(input.packageDigest, "packageDigest"),
    providerDeploymentId: required(input.providerDeploymentId, "providerDeploymentId"),
    providerSource: source(input.providerSource, "providerSource"),
    target: target(input.target),
    routingTarget: required(input.routingTarget, "routingTarget"),
    finalSnapshot: snapshot(input.finalSnapshot, input.packageDigest),
  };
  value.authorizationFingerprint = digest(input.authorizationFingerprint ?? fingerprint(value), "authorizationFingerprint");
  return Object.freeze(value);
}

function acknowledgement(value) { return Object.freeze({ migrationOperationId: value.migrationOperationId, authorizationFingerprint: value.authorizationFingerprint, fenceId: value.fenceId, packageDigest: value.packageDigest, providerDeploymentId: value.providerDeploymentId }); }
function assertSamePreparedOperation(state, value) {
  assertSameOperation(state, value);
  if (state.authorizationFingerprint !== value.authorizationFingerprint || state.fenceId !== value.fenceId || state.finalSnapshot?.packageDigest !== value.packageDigest) fail("SIMPLIFIED_HANDOFF_IDENTITY_MISMATCH", "Authority state does not match the accepted frozen package.");
}
function assertSameOperation(state, value) { if (state.migrationOperationId !== value.migrationOperationId) fail("SIMPLIFIED_HANDOFF_IDENTITY_MISMATCH", "Authority state belongs to a different migration operation."); }
function assertPreWrite(state) { if (state.firstProviderCanonicalWriteAt != null) fail("SIMPLIFIED_HANDOFF_FIRST_WRITE_CROSSED", "The provider first-write boundary has already been crossed."); }
function snapshot(value, packageDigest) {
  if (!value || typeof value !== "object") fail("SIMPLIFIED_HANDOFF_IDENTITY_MISMATCH", "finalSnapshot is required.");
  const result = { runtimeSha256: digest(value.runtimeSha256, "finalSnapshot.runtimeSha256"), runtimeRevision: required(value.runtimeRevision, "finalSnapshot.runtimeRevision"), mediaInventorySha256: digest(value.mediaInventorySha256, "finalSnapshot.mediaInventorySha256"), migrationControlSha256: digest(value.migrationControlSha256, "finalSnapshot.migrationControlSha256"), packageDigest: digest(value.packageDigest, "finalSnapshot.packageDigest") };
  if (result.packageDigest !== packageDigest) fail("SIMPLIFIED_HANDOFF_IDENTITY_MISMATCH", "finalSnapshot package digest differs from the imported package.");
  return Object.freeze(result);
}
function source(value, field) { if (!value || typeof value !== "object") fail("SIMPLIFIED_HANDOFF_IDENTITY_MISMATCH", `${field} is required.`); return Object.freeze({ commit: required(value.commit, `${field}.commit`), buildId: required(value.buildId, `${field}.buildId`) }); }
function target(value) { if (!value || typeof value !== "object") fail("SIMPLIFIED_HANDOFF_IDENTITY_MISMATCH", "target is required."); return Object.freeze({ databaseClusterId: required(value.databaseClusterId, "target.databaseClusterId"), databaseName: required(value.databaseName, "target.databaseName"), spacesBucket: required(value.spacesBucket, "target.spacesBucket") }); }
function fingerprint(value) { return createHash("sha256").update(JSON.stringify({ migrationOperationId: value.migrationOperationId, fenceId: value.fenceId, packageDigest: value.packageDigest, providerSource: value.providerSource, target: value.target })).digest("hex"); }
function digest(value, field) { const candidate = String(value ?? "").toLowerCase(); if (!/^[a-f0-9]{64}$/.test(candidate)) fail("SIMPLIFIED_HANDOFF_IDENTITY_MISMATCH", `${field} must be a SHA-256 digest.`); return candidate; }
function required(value, field) { const candidate = String(value ?? "").trim(); if (!candidate) fail("SIMPLIFIED_HANDOFF_IDENTITY_MISMATCH", `${field} is required.`); return candidate; }
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
