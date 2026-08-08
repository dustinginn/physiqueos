import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseOperationalJsonBytes } from "./lib/operationalJson.mjs";
import {
  createCanonicalExerciseTerminologyAlignmentService,
} from "../src/domain/services/CanonicalExerciseTerminologyAlignmentService";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const runtimeStorePath = path.resolve(
    process.cwd(),
    "private",
    "founder",
    "runtime-store.json"
  );
  const apply = process.argv.includes("--apply");
  const beforeBytes = fs.readFileSync(runtimeStorePath);
  const liveStore = parseOperationalJsonBytes(beforeBytes,
    { filePath: runtimeStorePath, stage: "terminology_alignment_source" });
  const beforeStat = fs.statSync(runtimeStorePath);
  const service = createCanonicalExerciseTerminologyAlignmentService({
    runtimeStorePath,
    liveStore,
  });
  const preparation = service.prepare();
  const preflight = {
    mode: apply ? "apply" : "dry_run",
    runtimeHash: sha(beforeBytes),
    runtimeRevision: liveStore.revision ?? 0,
    runtimeModifiedAt: beforeStat.mtime.toISOString(),
    preparation,
  };

  if (!apply) {
    console.log(JSON.stringify({ changed: false, preflight }, null, 2));
    return;
  }

  const backupDirectory = path.resolve(
    process.cwd(),
    "private",
    "founder",
    "backups"
  );
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backupPath = path.join(
    backupDirectory,
    `runtime-store.pre-canonical-terminology-${preflight.runtimeHash.slice(0, 12)}.json`
  );
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(runtimeStorePath, backupPath, fs.constants.COPYFILE_EXCL);
  }
  const backupBytes = fs.readFileSync(backupPath);
  if (sha(backupBytes) !== preflight.runtimeHash) {
    throw new Error("The canonical terminology backup failed verification.");
  }

  const result = await service.apply();
  const afterBytes = fs.readFileSync(runtimeStorePath);
  const after = parseOperationalJsonBytes(afterBytes,
    { filePath: runtimeStorePath, stage: "terminology_alignment_post_commit" });
  console.log(JSON.stringify({
    preflight,
    backup: {
      path: backupPath,
      hash: sha(backupBytes),
      verified: true,
    },
    result,
    runtime: {
      beforeHash: preflight.runtimeHash,
      afterHash: sha(afterBytes),
      beforeRevision: preflight.runtimeRevision,
      afterRevision: after.revision,
      lastCommitId: after.lastCommitId,
      modifiedAt: fs.statSync(runtimeStorePath).mtime.toISOString(),
    },
  }, null, 2));
}

function sha(value) {
  return createHash("sha256").update(value).digest("hex").toLowerCase();
}
