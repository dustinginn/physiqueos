// Production `activateWindowsWriteFence` adapter for `CombinedAppPlatformCutoverOrchestrator`.
//
// REUSES THE EXISTING WINDOWS-LOCAL FENCE MACHINERY - THE COMBINED CUTOVER DOES NOT INVENT A SECOND
// ONE. "Pausing Windows legacy canonical writes" is already a single, fully-proven concept
// (`migrationControlState.js`'s `ACTIVATE_FENCE` action, durably persisted by
// `DurableMigrationControlStore.js`) shared with the older single-machine
// `ProductionMigrationOrchestrator`/`ProductionMigrationRunner` path. Both migration paths therefore
// contend for the SAME durable fence, so they can never race each other: the combined cutover cannot
// begin while a single-machine migration attempt already holds the fence, and vice versa.
//
// This adapter never touches `combined_runtime_authority` - the orchestrator's own `BEGIN_CUTOVER`
// transition (which owns that responsibility) runs AFTER this adapter returns, binding the returned
// `fenceId` into the durable authority row itself. It never sets `firstPostgresWriteAt` (only later,
// unrelated migration-control actions do), never transfers provider authority, and never stops
// Windows serving - `ACTIVATE_FENCE` only disables legacy WRITES; there is no "serving" concept in
// migration-control at all, and the governing design does not require Windows to stop serving merely
// because writes are fenced.
import { MigrationControlAction, MigrationFenceState } from "../migrationControlState.js";

export function createProductionWindowsWriteFenceAdapter({ controlStore } = {}) {
  if (!controlStore?.read || !controlStore?.transition) throw new Error("The Windows write-fence adapter requires the durable migration-control store.");

  return Object.freeze({
    async activateWindowsWriteFence({ input } = {}) {
      const operationId = requireNonEmpty(input?.migrationOperationId, "migrationOperationId");
      const commandPrefix = requireNonEmpty(input?.commandPrefix, "commandPrefix");
      const current = (await controlStore.read()).state;

      // Idempotent short-circuit. `DurableMigrationControlStore`'s own commandId+fingerprint replay
      // only recognizes a retry that resubmits the EXACT SAME command payload - but a genuine retry
      // (e.g. after a crash between fence activation and the orchestrator reading the result) reads
      // CURRENT state fresh, so its `expectedVersion`/`expectedFenceState` would no longer match the
      // original command once the fence has already activated, producing a spurious
      // MIGRATION_CONTROL_COMMAND_REUSED rather than a clean replay. If THIS exact operation already
      // durably holds the active fence, return it directly instead of resubmitting a transition.
      if (current.fenceState === MigrationFenceState.ACTIVE && current.migrationOperationId === operationId) {
        return Object.freeze({ ready: true, fenceId: current.fenceId, controlState: current });
      }

      const command = {
        action: MigrationControlAction.ACTIVATE_FENCE,
        commandId: `${commandPrefix}:activate-windows-write-fence`,
        correlationId: input?.correlationId ?? operationId,
        operator: input?.operator ?? "combined-cutover-orchestrator",
        reason: input?.reason ?? "Combined App Platform cutover Windows write fence activated.",
        expectedVersion: current.version,
        expectedFenceState: current.fenceState,
        expectedCanonicalStoreEpoch: current.canonicalStoreEpoch,
        expectedCompositionMode: current.compositionMode,
        migrationOperationId: operationId,
        expectedMigrationId: input?.expectedMigrationId ?? operationId,
        ...(input?.fenceId ? { fenceId: input.fenceId } : {}),
      };

      const result = await controlStore.transition(command);
      if (result.state.fenceState !== MigrationFenceState.ACTIVE) {
        throw new Error("Windows write-fence activation did not reach the active fence state.");
      }
      return Object.freeze({ ready: true, fenceId: result.state.fenceId, controlState: result.state });
    },
  });
}

function requireNonEmpty(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw new Error(`activateWindowsWriteFence requires ${field}.`);
  return candidate;
}
