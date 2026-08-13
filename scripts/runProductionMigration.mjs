import path from "node:path";
import { register } from "node:module";
import { importProductionMigrationModule } from "./productionMigrationModuleLoader.mjs";

register("./sourceModuleResolutionHook.mjs", import.meta.url);

const args = parseArgs(process.argv.slice(2));
const dryRun = args["dry-run"] === "true";
const execute = args.execute === "true";
if (dryRun === execute) throw new Error("Specify exactly one of --dry-run true or --execute true.");

const adapterModule = path.resolve(import.meta.dirname, "productionMigrationEnvironmentAdapters.mjs");
const { createProductionMigrationEnvironment } = await importProductionMigrationModule(adapterModule, {
  allowedRoot: import.meta.dirname,
});
const environment = await createProductionMigrationEnvironment({ env: process.env });
try {
  const input = environment.readOperatorInput(args);
  const result = execute
    ? await environment.runner.execute(input)
    : await environment.runner.dryRun(input);
  process.stdout.write(`${JSON.stringify(environment.redactResult(result))}\n`);
} finally {
  await environment.close();
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value == null) throw new Error(`Invalid migration-runner argument: ${key ?? "missing"}.`);
    result[key.slice(2)] = value;
  }
  return result;
}
