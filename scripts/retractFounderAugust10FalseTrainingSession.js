import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { getFounderRuntimeStore } from "../src/data/repositories/founderRuntimeStore.js";
import { createAugust10FalseTrainingRetractionService } from "../src/domain/services/August10FalseTrainingRetractionService.js";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const runtimeStorePath = path.resolve(process.cwd(), "private", "founder", "runtime-store.json");
  const apply = process.argv.includes("--apply");
  const service = createAugust10FalseTrainingRetractionService({
    runtimeStorePath,
    liveStore: getFounderRuntimeStore(),
  });
  const prepared = service.prepare();

  if (!apply || prepared.outcome === "already_retracted") {
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry_run", ...prepared }, null, 2));
    return;
  }

  const backupDirectory = path.resolve(process.cwd(), "private", "founder", "backups");
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backupPath = path.join(backupDirectory,
    `runtime-store.pre-aug10-false-training-${prepared.baseline.fileHash.slice(7, 19)}.json`);
  fs.copyFileSync(runtimeStorePath, backupPath, fs.constants.COPYFILE_EXCL);
  const backupHash = `sha256_${createHash("sha256").update(fs.readFileSync(backupPath)).digest("hex")}`;
  if (backupHash !== prepared.baseline.fileHash) throw new Error("Backup verification failed.");
  const result = await service.execute({
    acceptProductionMutation: true,
    stopOnConflict: true,
    expectedFileHash: prepared.baseline.fileHash,
    expectedRevision: prepared.baseline.revision,
    expectedLastCommitId: prepared.baseline.lastCommitId,
    preparationFingerprint: prepared.fingerprint,
    retractedAt: prepared.plan.retractedAt,
  });
  console.log(JSON.stringify({ mode: "apply", backup: { path: backupPath, hash: backupHash }, result }, null, 2));
}
