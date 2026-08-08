import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createFounderRuntimeBackup } from "./lib/founderRuntimeBackup.mjs";

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.resolve(args.source ?? path.join(root, "private/founder/runtime-store.json"));
const destinationRoot = path.resolve(required(args.destination, "--destination"));
if (destinationRoot === root || destinationRoot.startsWith(`${root}${path.sep}`)) {
  throw new Error("Founder cutover backup destination must be outside the repository.");
}
const operator = required(args.operator, "--operator");
const gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const buildPath = path.join(root, ".next/BUILD_ID");
const buildIdentity = fs.existsSync(buildPath) ? fs.readFileSync(buildPath, "utf8").trim() : "not-built";

const result = createFounderRuntimeBackup({ sourcePath, destinationRoot, operator,
  gitCommit, buildIdentity });
process.stdout.write(`${JSON.stringify({ status: "verified", directory: result.directory,
  manifestPath: result.manifestPath, sha256: result.manifest.backup.sha256,
  revision: result.manifest.founderStore.revision }, null, 2)}\n`);

function parseArgs(values) { const result = {}; for (let index = 0; index < values.length; index += 2) {
  const key = values[index]; if (!key?.startsWith("--") || values[index + 1] == null)
    throw new Error(`Invalid argument: ${key ?? "missing"}`); result[key.slice(2)] = values[index + 1]; }
  return result; }
function required(value, field) { if (!value?.trim()) throw new Error(`${field} is required.`);
  return value.trim(); }
