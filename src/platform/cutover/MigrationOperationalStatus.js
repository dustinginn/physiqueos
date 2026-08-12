export async function getMigrationOperationalStatus({
  controlStore,
  buildIdentity = {},
  inspectBackup = null,
  inspectTarget = null,
} = {}) {
  if (!controlStore?.read) throw new Error("Migration operational status requires durable control.");
  const { state, audit } = controlStore.read();
  const [backup, target] = await Promise.all([
    inspectBackup ? inspectBackup() : Promise.resolve({ status: state.backupPreflightState }),
    inspectTarget ? inspectTarget() : Promise.resolve({ status: state.migrationTargetReadiness }),
  ]);
  return Object.freeze({
    fenceState: state.fenceState,
    fenceId: state.fenceId,
    canonicalStoreEpoch: state.canonicalStoreEpoch,
    compositionMode: state.compositionMode,
    migrationOperationId: state.migrationOperationId,
    expectedMigrationId: state.expectedMigrationId,
    writesEnabled: state.writesEnabled,
    readsEnabled: state.readsEnabled,
    backupPreflight: sanitizeProbe(backup),
    migrationTarget: sanitizeProbe(target),
    lastTransition: state.lastTransition,
    lastTransitionAt: state.updatedAt,
    lastOperator: state.lastOperator,
    buildIdentity: Object.freeze({
      commit: buildIdentity.commit ?? state.sourceIdentity?.commit ?? null,
      buildId: buildIdentity.buildId ?? state.sourceIdentity?.buildId ?? null,
    }),
    auditCount: audit.length,
    recoveryRequired: state.fenceState === "recovery-required",
  });
}

function sanitizeProbe(value = {}) {
  return Object.freeze({
    status: value.status ?? "unknown",
    checkedAt: value.checkedAt ?? null,
    code: value.code ?? null,
  });
}
