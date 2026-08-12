import path from "node:path";
import { register } from "node:module";

register("./sourceModuleResolutionHook.mjs", import.meta.url);

const root = path.resolve(import.meta.dirname, "..");

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: "failed", code: error.code ?? "MIGRATION_CONTROL_OPERATION_FAILED", error: error.message }, null, 2)}\n`);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = required(args.command, "--command");
  const [{ createDurableMigrationControlStore }, stateModel] = await Promise.all([
    import("../src/platform/cutover/DurableMigrationControlStore.js"),
    import("../src/platform/cutover/migrationControlState.js"),
  ]);
  const defaultProductionPath = path.join(root, "private", "founder", "migration-control.json");
  const filePath = path.resolve(args.path ?? defaultProductionPath);
  const production = filePath === defaultProductionPath;
  assertScope({ args, filePath, production });
  const store = createDurableMigrationControlStore({ filePath });

  if (command === "status") {
    const status = store.read();
    print({ status: "ok", filePath, state: status.state, auditCount: status.audit.length, lastAudit: status.audit.at(-1) });
    return;
  }

  const operator = required(args.operator, "--operator");
  const correlationId = required(args["correlation-id"], "--correlation-id");
  const commandId = required(args["command-id"], "--command-id");
  if (command === "initialize") {
    requireConfirmation({ args, production, command, version: 0, operationId: "none" });
    const result = store.initialize({
      environment: production ? "production" : "isolated-rehearsal",
      operator,
      correlationId,
      commandId,
      sourceIdentity: { commit: args.commit ?? null, buildId: args["build-id"] ?? null },
    });
    print({ status: result.outcome, filePath, state: result.state, auditCount: result.audit.length });
    return;
  }

  const action = mapAction(command, stateModel.MigrationControlAction);
  const current = store.read().state;
  const operationId = required(args["operation-id"], "--operation-id");
  requireConfirmation({ args, production, command, version: current.version, operationId });
  const result = store.transition({
    action,
    commandId,
    correlationId,
    operator,
    reason: required(args.reason, "--reason"),
    expectedVersion: integer(args["expected-version"], "--expected-version"),
    expectedFenceState: required(args["expected-state"], "--expected-state"),
    expectedCanonicalStoreEpoch: required(args["expected-epoch"], "--expected-epoch"),
    expectedCompositionMode: required(args["expected-composition"], "--expected-composition"),
    migrationOperationId: operationId,
    expectedMigrationId: command === "activate"
      ? required(args["migration-id"], "--migration-id")
      : args["migration-id"] ?? current.expectedMigrationId,
    expectedCanonicalStoreOutcome: args["canonical-outcome"] ?? null,
    fenceId: args["fence-id"] ?? null,
    sourceIdentity: { commit: args.commit ?? current.sourceIdentity?.commit, buildId: args["build-id"] ?? current.sourceIdentity?.buildId },
    auditMetadata: {
      approvalId: args["approval-id"],
      ticketId: args["ticket-id"],
      backupManifestDigest: args["backup-manifest-digest"],
      sourceRuntimeSha256: args["source-runtime-sha256"],
      sourceRuntimeRevision: args["source-runtime-revision"],
    },
  });
  print({ status: result.outcome, filePath, state: result.state, auditCount: result.audit.length, lastAudit: result.audit.at(-1) });
}

function assertScope({ args, filePath, production }) {
  if (production) {
    if (args.production !== "true" || args.isolated === "true") throw safety("Production control path requires --production true.");
    return;
  }
  const isolatedRoot = path.join(root, ".tmp");
  if (args.isolated !== "true" || args.production === "true" || !isWithin(isolatedRoot, filePath)) {
    throw safety("Non-production control requires --isolated true and a path under .tmp.");
  }
}

function requireConfirmation({ args, production, command, version, operationId }) {
  if (!production) return;
  const expected = `AUTHORIZE PRODUCTION MIGRATION CONTROL ${command.toUpperCase()} OPERATION ${operationId} VERSION ${version}`;
  if (args.confirm !== expected) throw safety(`Exact --confirm value required: ${expected}`);
}

function mapAction(command, actions) {
  const value = {
    activate: actions.ACTIVATE_FENCE,
    begin: actions.BEGIN_CUTOVER,
    "switch-postgres": actions.SWITCH_TO_POSTGRES,
    "record-first-write": actions.RECORD_FIRST_POSTGRES_WRITE,
    release: actions.RELEASE_FENCE,
    abort: actions.ABORT_TO_LEGACY,
    "require-recovery": actions.REQUIRE_RECOVERY,
  }[command];
  if (!value) throw safety(`Unsupported migration-control command: ${command}.`);
  return value;
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    if (!key?.startsWith("--") || values[index + 1] == null) throw safety(`Invalid argument: ${key ?? "missing"}.`);
    result[key.slice(2)] = values[index + 1];
  }
  return result;
}

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw safety(`${field} is required.`);
  return value.trim();
}

function integer(value, field) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw safety(`${field} must be a non-negative integer.`);
  return parsed;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function safety(message) {
  const error = new Error(message);
  error.code = "MIGRATION_CONTROL_SAFETY_STOP";
  return error;
}
