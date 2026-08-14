const CODE = "PROVIDER_LEGACY_MIGRATION_CONTROL_FORBIDDEN";

export function createDurableMigrationControlStore() {
  throw forbidden("store creation");
}

export function resolveMigrationControlPath() {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return "/tmp/physiqueos-provider-build-control.json";
  }
  throw forbidden("path resolution");
}

export function readMigrationControlStatus() {
  throw forbidden("status read");
}

function forbidden(operation) {
  const error = new Error(`Provider full runtime forbids legacy migration-control ${operation}.`);
  error.code = CODE;
  return error;
}
