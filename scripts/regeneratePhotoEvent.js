import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { FounderRepositories } from "../src/data/repositories/founderRepositories.js";
import { resolveFounderRuntimeStorePath } from "../src/data/repositories/founderRuntimeStore.js";
import { createPhotoEventReinterpretationService } from "../src/domain/services/PhotoEventReinterpretationService.js";

loadEnvConfig(process.cwd(), false, { info() {}, error() {} });

async function main() {
  const sessionId = argument("session");
  const apply = process.argv.includes("--apply");
  const reason = argument("reason") ?? "Photo Event V2 magnitude-before-direction calibration.";
  const user = await FounderRepositories.users.getCurrentUser();
  if (!sessionId || !user) throw new Error("Usage: npx tsx scripts/regeneratePhotoEvent.js --session=<id> [--apply] [--reason=<text>]");
  const service = createPhotoEventReinterpretationService({ repositories: FounderRepositories });
  const inspection = await service.inspect({ userId: user.id, sessionId });
  if (!apply) {
    process.stdout.write(`${JSON.stringify({ mode: "read_only", ...inspection }, null, 2)}\n`);
    process.exitCode = inspection.status === "ready" ? 0 : 1;
    return;
  }
  if (inspection.status !== "ready") throw new Error(`${inspection.code}: reinterpretation is not ready.`);
  const runtimePath = resolveFounderRuntimeStorePath();
  const backupDirectory = path.join(path.dirname(runtimePath), "backups");
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backupPath = path.join(backupDirectory, `runtime-store-photo-v2-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.copyFileSync(runtimePath, backupPath, fs.constants.COPYFILE_EXCL);
  const result = await service.regenerate({ userId: user.id, sessionId, reason, replacementAuthorized: true });
  process.stdout.write(`${JSON.stringify({ ...result, backupPath: path.relative(process.cwd(), backupPath).replaceAll("\\", "/") }, null, 2)}\n`);
  if (result.status !== "completed") process.exitCode = 1;
}

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
