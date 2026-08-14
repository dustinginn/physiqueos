import { RuntimeAuthorityAction } from "./CombinedRuntimeAuthorityState.js";

const PREFLIGHTS = Object.freeze([
  "verifyAuthorization",
  "verifyWindowsSource",
  "verifyProviderBuild",
  "verifyTargetIsolation",
  "verifyBackups",
  "verifyCostCeiling",
]);

export function createCombinedAppPlatformCutoverOrchestrator({
  authorityStore,
  adapters,
  now = () => new Date(),
  maximumPreWriteFenceMs = 10 * 60_000,
} = {}) {
  if (!authorityStore?.read || !authorityStore?.transition) throw new Error("Combined cutover requires a durable runtime-authority store.");
  assertAdapters(adapters);

  return Object.freeze({
    async rehearse(input) {
      const before = (await authorityStore.read()).state;
      const results = await preflight(input, "rehearsal");
      const after = (await authorityStore.read()).state;
      if (after.version !== before.version || after.authority !== before.authority) throw cutoverError("REHEARSAL_MUTATED_AUTHORITY", "Cutover rehearsal changed runtime authority.");
      return freeze({ classification: "READY", mode: "rehearsal", preflight: results, state: after });
    },

    async execute(input) {
      requireExecutionAuthorization(input);
      const startedAt = now().getTime();
      const readiness = await preflight(input, "execution");
      let state = (await authorityStore.read()).state;
      let fence = null;
      try {
        fence = await adapters.activateWindowsWriteFence(context(input, state, readiness));
        const snapshot = await adapters.captureFinalSnapshot(context(input, state, readiness, { fence }));
        assertSnapshotMatchesAuthorization(snapshot, input);
        state = (await authorityStore.transition(command(input, state, RuntimeAuthorityAction.BEGIN_CUTOVER, {
          fenceId: fence.fenceId,
          finalSnapshot: snapshot,
          providerSource: input.providerSource,
          target: input.target,
          routingTarget: input.routingTarget,
          reason: "Final Windows snapshot captured under the coordinated write fence.",
        }))).state;
        assertFenceBudget(startedAt, state);

        const exported = await adapters.exportFinalPackage(context(input, state, readiness, { snapshot, fence }));
        const transfer = await adapters.transferSnapshot(context(input, state, readiness, { snapshot, exported }));
        const imported = await adapters.importProviderCanonicalState(context(input, state, readiness, { snapshot, exported, transfer }));
        const verified = await adapters.verifyProviderParity(context(input, state, readiness, { snapshot, exported, transfer, imported }));
        if (verified?.ready !== true) throw cutoverError("PROVIDER_PARITY_REJECTED", "Provider parity verification did not accept the final snapshot.");
        assertFenceBudget(startedAt, state);

        const acknowledgement = await adapters.acknowledgeProviderPrepared(context(input, state, readiness, { snapshot, imported, verified }));
        state = (await authorityStore.transition(command(input, state, RuntimeAuthorityAction.ACKNOWLEDGE_PROVIDER, {
          providerAcknowledgement: acknowledgement,
          reason: "Provider runtime acknowledged the exact final snapshot and protected control tuple.",
        }))).state;
        assertFenceBudget(startedAt, state);

        const handoff = await adapters.transferAuthorityAndRoute(context(input, state, readiness, {
          acknowledgement,
          async commitAuthority() {
            state = (await authorityStore.transition(command(input, state, RuntimeAuthorityAction.TRANSFER_TO_PROVIDER, {
              routingTarget: input.routingTarget,
              reason: "Runtime, control, worker, persistence, and public routing authority transferred together.",
            }))).state;
            return state;
          },
        }));
        if (state.authority !== "provider-authoritative" || handoff?.ready !== true) {
          throw cutoverError("AUTHORITY_HANDOFF_INCOMPLETE", "Combined authority and routing handoff was not acknowledged.");
        }
        const smoke = await adapters.verifyPostHandoff(context(input, state, readiness, { handoff }));
        if (smoke?.ready !== true) throw cutoverError("POST_HANDOFF_SMOKE_FAILED", "Post-handoff provider acceptance failed.");
        return freeze({ classification: "COMPLETED", state, snapshot, transfer, imported, verified, handoff, smoke });
      } catch (error) {
        error.combinedCutoverRecovery = await recover({ input, state, readiness, fence, error });
        throw error;
      }
    },
  });

  async function preflight(input, mode) {
    const state = (await authorityStore.read()).state;
    if (state.authority !== "windows-legacy-authoritative" || !state.writesEnabled || state.firstProviderCanonicalWriteAt != null) {
      throw cutoverError("CUTOVER_PREFLIGHT_AUTHORITY_REJECTED", "Preflight requires writable Windows legacy authority with no provider first-write boundary.");
    }
    const results = {};
    for (const name of PREFLIGHTS) {
      const result = await adapters[name](context(input, state, null, { mode }));
      if (result?.ready !== true || (mode === "rehearsal" && result.mutated === true)) {
        throw cutoverError("CUTOVER_PREFLIGHT_FAILED", `Combined cutover preflight failed: ${name}.`);
      }
      results[name] = result;
    }
    return freeze(results);
  }

  async function recover({ input, state, readiness, fence, error }) {
    const latest = (await authorityStore.read()).state;
    if (latest.firstProviderCanonicalWriteAt != null) {
      const recovered = latest.authority === "recovery-required" ? latest :
        (await authorityStore.transition(command(input, latest, RuntimeAuthorityAction.REQUIRE_RECOVERY, {
          reason: `Provider forward repair required after first canonical write: ${error.code ?? "CUTOVER_FAILED"}.`,
        }))).state;
      await adapters.enterProviderRecovery(context(input, recovered, readiness, { error }));
      return freeze({ classification: "FORWARD_REPAIR_REQUIRED", automaticWindowsRollback: false, state: recovered });
    }
    await adapters.restoreWindowsAuthority(context(input, latest, readiness, { fence, error }));
    let restored = (await authorityStore.read()).state;
    if (["combined-cutover-in-progress", "provider-prepared", "provider-authoritative"].includes(restored.authority)) {
      restored = (await authorityStore.transition(command(input, restored, RuntimeAuthorityAction.ABORT_TO_WINDOWS, {
        reason: `Pre-write combined cutover aborted: ${error.code ?? "CUTOVER_FAILED"}.`,
      }))).state;
    }
    return freeze({ classification: "ABORTED_TO_WINDOWS", automaticWindowsRollback: true, state: restored });
  }

  function assertFenceBudget(startedAt, state) {
    if (state.firstProviderCanonicalWriteAt == null && now().getTime() - startedAt >= maximumPreWriteFenceMs) {
      throw cutoverError("CUTOVER_WINDOW_EXCEEDED_BEFORE_FIRST_PROVIDER_WRITE", "The coordinated pre-write fence exceeded its hard abort boundary.");
    }
  }
}

function command(input, state, action, extra) {
  return {
    action,
    expectedVersion: state.version,
    migrationOperationId: input.migrationOperationId,
    authorizationFingerprint: input.authorizationFingerprint,
    commandId: `${input.commandPrefix}:${action}`,
    ...extra,
  };
}

function context(input, state, preflight, extra = {}) { return freeze({ input, state, preflight, ...extra }); }
function requireExecutionAuthorization(input) {
  if (input?.productionAuthorization !== true) throw cutoverError("COMBINED_CUTOVER_NOT_AUTHORIZED", "Combined cutover execution requires separate explicit production authorization.");
  for (const field of ["migrationOperationId", "authorizationFingerprint", "commandPrefix", "routingTarget"]) if (!String(input?.[field] ?? "").trim()) throw cutoverError("COMBINED_CUTOVER_INPUT_INVALID", `${field} is required.`);
}
function assertSnapshotMatchesAuthorization(snapshot, input) {
  if (String(snapshot.runtimeSha256).toUpperCase() !== String(input.expectedRuntimeSha256).toUpperCase() || Number(snapshot.runtimeRevision) !== Number(input.expectedRuntimeRevision)) {
    throw cutoverError("FINAL_SNAPSHOT_AUTHORIZATION_MISMATCH", "Final fenced snapshot does not match the authorized Founder identity.");
  }
}
function assertAdapters(adapters) {
  const required = [...PREFLIGHTS, "activateWindowsWriteFence", "captureFinalSnapshot", "exportFinalPackage", "transferSnapshot", "importProviderCanonicalState", "verifyProviderParity", "acknowledgeProviderPrepared", "transferAuthorityAndRoute", "verifyPostHandoff", "restoreWindowsAuthority", "enterProviderRecovery"];
  const missing = required.filter((name) => typeof adapters?.[name] !== "function");
  if (missing.length) throw new Error(`Combined cutover adapters are missing: ${missing.join(", ")}.`);
}
function cutoverError(code, message) { return Object.assign(new Error(message), { code }); }
function freeze(value) { return Object.freeze(value); }
