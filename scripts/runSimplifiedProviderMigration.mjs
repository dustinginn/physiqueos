import { register } from "node:module";

register("./sourceModuleResolutionHook.mjs", import.meta.url);

const { executeSimplifiedProviderMigration } = await import(
  "../src/platform/cutover/simplified/SimplifiedProviderMigrationExecution.js"
);
const argumentsMap = parseArgs(process.argv.slice(2));
const result = await executeSimplifiedProviderMigration({
  phase: required(argumentsMap.phase, "--phase"),
  execute: argumentsMap.execute === "true",
  args: {
    packagePath: argumentsMap["package-path"],
    mediaRoot: argumentsMap["media-root"],
    migrationOperationId: argumentsMap["operation-id"],
    migrationId: argumentsMap["migration-id"],
    runtimeRevision: argumentsMap["runtime-revision"],
    runtimeSha256: argumentsMap["runtime-sha256"],
    frozenSourceCommit: argumentsMap["frozen-source-commit"],
    packageDigest: argumentsMap["package-digest"],
    controlSha256: argumentsMap["control-sha256"],
    mediaInventorySha256: argumentsMap["media-inventory-sha256"],
    authorityEnvironment: argumentsMap["authority-environment"],
    frozenBuildId: argumentsMap["frozen-build-id"],
    commandPrefix: argumentsMap["command-prefix"],
    fenceId: argumentsMap["fence-id"],
    routingTarget: argumentsMap["routing-target"],
    windowsCold: argumentsMap["windows-cold"] === "true",
    routingReady: argumentsMap["routing-ready"] === "true",
  },
});
process.stdout.write(`${JSON.stringify(result)}\n`);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    if (!values[index]?.startsWith("--") || values[index + 1] == null) {
      throw new Error(`Invalid argument: ${values[index] ?? "missing"}.`);
    }
    parsed[values[index].slice(2)] = values[index + 1];
  }
  return parsed;
}
function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw new Error(`${field} is required.`);
  return candidate;
}
