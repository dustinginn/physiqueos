import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  createJuly27StrengthTypedReferenceCanonicalRepairService,
  JULY_27_CORRECTED_CANONICAL_ID,
  JULY_27_MALFORMED_CANONICAL_ID,
  JULY_27_STRENGTH_REPAIR_REASON,
  JULY_27_STRENGTH_RESTORE_IDS,
} from "../src/domain/services/July27StrengthTypedReferenceCanonicalRepairService";

main().catch((error) => {
  console.error(JSON.stringify({ outcome: "command_failed", reason: error.message }, null, 2));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode ?? "audit";
  if (!["audit", "dry_run", "execute"].includes(mode)) {
    throw new Error("Mode must be audit, dry_run, or execute.");
  }
  const runtimeStorePath = path.resolve(
    process.cwd(),
    "private/founder/runtime-store.json"
  );
  const backupPath = path.resolve(
    process.cwd(),
    "private/founder/backups/PhysiqueOS_Backup_2026-07-25_19-27-05/optional-safe-runtime-export/runtime-store.json"
  );
  const liveStore = JSON.parse(fs.readFileSync(runtimeStorePath, "utf8"));
  const backupBytes = fs.readFileSync(backupPath);
  const backupStore = JSON.parse(backupBytes);
  const service = createJuly27StrengthTypedReferenceCanonicalRepairService({
    runtimeStorePath,
    liveStore,
    backupStore,
    backupIdentity: {
      path: backupPath,
      fileHash: sha(backupBytes),
      revision: backupStore.revision,
    },
  });

  if (mode === "audit") {
    console.log(JSON.stringify({ mode, ...service.audit(), changed: false }, null, 2));
    return;
  }
  const prepared = service.prepare({ preparedAt: args.preparedAt });
  if (mode === "dry_run") {
    console.log(
      JSON.stringify(
        {
          mode,
          outcome: prepared.outcome,
          baseline: prepared.baseline,
          classification: prepared.classification?.state,
          fingerprint: prepared.fingerprint,
          eventIds: prepared.eventIds,
          plan: prepared.plan,
          auditRecord: prepared.auditRecord,
          changed: false,
        },
        null,
        2
      )
    );
    return;
  }
  const command = {
    expectedFileHash: args.expectedFileHash,
    expectedSemanticDigest: args.expectedSemanticDigest,
    expectedRevision: Number(args.expectedRevision),
    expectedLastCommitId: args.expectedLastCommitId,
    malformedAggregateId: args.malformedAggregateId,
    restoreIds: parseJson(args.restoreIds),
    correctedCanonicalId: args.correctedCanonicalId,
    eventIds: parseJson(args.eventIds),
    repairReason: args.repairReason,
    preparationFingerprint: args.preparationFingerprint,
    acceptRecord22Reconstruction:
      args.acceptRecord22Reconstruction === "true",
    acceptProductionMutation: args.acceptProductionMutation === "true",
    stopOnConflict: args.stopOnConflict === "true",
    preparedAt: args.preparedAt,
  };
  const result = await service.execute(command);
  console.log(JSON.stringify({ mode, result }, null, 2));
  if (!["repaired", "already_repaired"].includes(result.outcome)) {
    process.exitCode = 1;
  }
}

function parseArgs(values) {
  return values.reduce((result, value) => {
    if (!value.startsWith("--")) return result;
    const [key, ...parts] = value.slice(2).split("=");
    result[key] = parts.length ? parts.join("=") : "true";
    return result;
  }, {});
}

function parseJson(value) {
  if (!value) return [];
  return JSON.parse(value);
}

function sha(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

export const JULY_27_EXECUTION_DEFAULTS = Object.freeze({
  malformedAggregateId: JULY_27_MALFORMED_CANONICAL_ID,
  correctedCanonicalId: JULY_27_CORRECTED_CANONICAL_ID,
  repairReason: JULY_27_STRENGTH_REPAIR_REASON,
  restoreIds: JULY_27_STRENGTH_RESTORE_IDS,
});
