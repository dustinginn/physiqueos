import fs from "node:fs";
import path from "node:path";
import { readOperationalJsonFileSync } from "./lib/operationalJson.mjs";
import { createHash } from "node:crypto";
import { register } from "node:module";

register("./sourceModuleResolutionHook.mjs", import.meta.url);

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: "failed", code: error.code ?? "PHASE_REVIEW_DRY_RUN_FAILED",
    error: error.message }, null, 2)}\n`);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(import.meta.dirname, "..");
  const storePath = path.join(root, "private/founder/runtime-store.json");
  const requestPath = path.resolve(required(args.request, "--request"));
  const expectedHash = required(args["expected-source-hash"], "--expected-source-hash").toUpperCase();
  const request = readOperationalJsonFileSync(requestPath,
    { stage: "phase_review_dry_run_request" });
  const confirmation = `AUTHORIZE PRODUCTION PHASE REVIEW DRY RUN ${request.decisionId}`;
  if (args.confirm !== confirmation) throw safety(`Exact --confirm value required: ${confirmation}`);
  const before = fs.readFileSync(storePath); const beforeHash = sha256(before);
  if (beforeHash !== expectedHash) throw safety("Founder source hash changed before dry run.");
  const { createProductionPhaseReviewCoordinatorFactory } = await import(
    "../src/domain/services/ProductionPhaseReviewCoordinatorFactory.js");
  const result = await createProductionPhaseReviewCoordinatorFactory().dryRun(request);
  const after = fs.readFileSync(storePath); const afterHash = sha256(after);
  if (!after.equals(before) || afterHash !== beforeHash)
    throw safety("Production dry run changed Founder bytes.");
  if (!result.ok || result.dryRun !== true || result.committed !== false)
    throw safety(`Production dry run was rejected: ${result.code ?? "unknown"}.`);
  process.stdout.write(`${JSON.stringify({ status: "dry_run_verified", decisionId: request.decisionId,
    selectedOutcome: request.selectedOutcome, sourceHash: beforeHash, bytesUnchanged: true,
    startingRevision: result.startingRevision, candidateRevision: result.candidateRevision,
    plannedMutation: result.plannedMutation, verification: result.verification }, null, 2)}\n`);
}

function parseArgs(values) { const result = {}; for (let index = 0; index < values.length; index += 2) {
  const key = values[index]; if (!key?.startsWith("--") || values[index + 1] == null)
    throw safety(`Invalid argument: ${key ?? "missing"}`); result[key.slice(2)] = values[index + 1]; }
  return result; }
function required(value, field) { if (typeof value !== "string" || !value.trim())
  throw safety(`${field} is required.`); return value.trim(); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex").toUpperCase(); }
function safety(message) { const error = new Error(message); error.code = "PHASE_REVIEW_DRY_RUN_SAFETY_STOP";
  return error; }
