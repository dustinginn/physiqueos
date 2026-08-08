import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseOperationalJsonBytes } from "./lib/operationalJson.mjs";
import { createTrainingPerformanceEventPersistenceService } from "../src/domain/services/TrainingPerformanceEventPersistenceService";
import {
  createJuly25TrainingPerformanceReconciliationService,
  JULY_25_TRAINING_RECONCILIATION_TARGET,
  JULY_25_TRAINING_RECONCILIATION_VERSION,
} from "../src/domain/services/July25TrainingPerformanceReconciliationService";

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
    { filePath: runtimeStorePath, stage: "training_performance_reconciliation_source" });
  const service = createJuly25TrainingPerformanceReconciliationService({
    liveStore,
    persistenceService: createTrainingPerformanceEventPersistenceService({
      runtimeStorePath,
      liveStore,
    }),
  });
  const preparation = service.prepare(JULY_25_TRAINING_RECONCILIATION_TARGET);
  const sourceEvents = (liveStore.trainingPerformanceEvents ?? []).filter(
    (event) => event.sourceSessionId === JULY_25_TRAINING_RECONCILIATION_TARGET.sessionId
  );
  const markers = (liveStore.migrationMarkers ?? []).filter(
    (marker) =>
      marker.schemaVersion === JULY_25_TRAINING_RECONCILIATION_VERSION &&
      marker.sourceReviewId === JULY_25_TRAINING_RECONCILIATION_TARGET.reviewId
  );

  const preflight = {
  mode: apply ? "apply" : "dry_run",
  runtimeHash: sha(beforeBytes),
  runtimeRevision: liveStore.revision ?? 0,
  runtimeModifiedAt: fs.statSync(runtimeStorePath).mtime.toISOString(),
  target: JULY_25_TRAINING_RECONCILIATION_TARGET,
  existingCollectionCount: (liveStore.trainingPerformanceEvents ?? []).length,
  existingTargetEventCount: sourceEvents.length,
  existingMarkerCount: markers.length,
  preparedEventCount: preparation.events.length,
  preparedEventIds: preparation.events.map((event) => event.id),
  };

  if (!apply) {
    console.log(JSON.stringify({ preflight, changed: false }, null, 2));
    return;
  }

  if ((liveStore.trainingPerformanceEvents ?? []).length !== 0 || markers.length !== 0) {
    throw new Error("Production gate rejected unexpected pre-existing events or marker.");
  }

  const backupDirectory = path.resolve(process.cwd(), "private", "founder", "backups");
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backupPath = path.join(
    backupDirectory,
    `runtime-store.pre-jul25-training-performance-${preflight.runtimeHash.slice(0, 12)}.json`
  );
  fs.copyFileSync(runtimeStorePath, backupPath, fs.constants.COPYFILE_EXCL);
  const backupBytes = fs.readFileSync(backupPath);
  if (sha(backupBytes) !== preflight.runtimeHash) {
    throw new Error("The pre-reconciliation backup failed verification.");
  }

  const result = await service.reconcile(JULY_25_TRAINING_RECONCILIATION_TARGET);
  if (result.outcome !== "created" || !result.committed) {
    throw new Error(`Production reconciliation did not commit: ${result.outcome}`);
  }
  const afterBytes = fs.readFileSync(runtimeStorePath);
  const after = parseOperationalJsonBytes(afterBytes,
    { filePath: runtimeStorePath, stage: "training_performance_reconciliation_post_commit" });
  console.log(JSON.stringify({
    preflight,
    backup: { path: backupPath, hash: sha(backupBytes) },
    result,
    runtime: {
      beforeHash: preflight.runtimeHash,
      afterHash: sha(afterBytes),
      beforeRevision: preflight.runtimeRevision,
      afterRevision: after.revision,
      modifiedAt: fs.statSync(runtimeStorePath).mtime.toISOString(),
    },
  }, null, 2));
}

function sha(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}
